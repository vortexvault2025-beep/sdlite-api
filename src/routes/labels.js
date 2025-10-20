import express from 'express';
import crypto from 'crypto';
import { setPdfHeaders } from '../utils/pdfHeaders.js';
import { renderA6 } from '../render/renderA6.js';
import { getSupabase } from '../utils/supabaseClient.js';

const router = express.Router();

/** ---- helpers ---- */

function normalizePostcode(lines = []) {
  const flat = lines.filter(Boolean).map(s => String(s).trim());
  if (!flat.length) return null;
  const last = flat[flat.length - 1] || '';
  const candidate = last.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(candidate) ? candidate : candidate || null;
}

// canonical variant ids (A6)
const ENV_SD  = (process.env.A6_VARIANT_SD_1PM      || 'a6_sd_1pm_v1').toLowerCase();
const ENV_TRK = (process.env.A6_VARIANT_TRK24_NOSIG || 'a6_trk24_nosig_v1').toLowerCase();
const VALID_VARIANTS = new Set([ENV_SD, ENV_TRK]);

// nickname → canonical id
const ALIASES = new Map([
  ['sd_1pm',        ENV_SD],
  ['sd',            ENV_SD],
  ['special',       ENV_SD],
  ['special_delivery', ENV_SD],
  ['a6_sd',         ENV_SD],

  ['trk24_nosig',   ENV_TRK],
  ['tracked24',     ENV_TRK],
  ['tracked',       ENV_TRK],
  ['a6_trk24',      ENV_TRK],
  ['trk',           ENV_TRK],
]);

function resolveVariant(payload = {}) {
  const requestedRaw = String(payload.variant ?? payload.service ?? '').trim();
  const requested = requestedRaw.toLowerCase();

  let resolved = null;
  if (requested && VALID_VARIANTS.has(requested)) {
    resolved = requested;
  } else if (requested && ALIASES.has(requested)) {
    resolved = ALIASES.get(requested);
  } else if (requested.startsWith('a6_sd')) {
    resolved = ENV_SD; // defensive
  } else if (requested.startsWith('a6_trk')) {
    resolved = ENV_TRK; // defensive
  }

  return { requested: requestedRaw, resolved };
}

async function enrichTilesIfMissing(payload) {
  try {
    if (payload?.tiles?.left || payload?.tiles?.right) return payload;
    const key = normalizePostcode(payload?.recipient?.lines || []);
    if (!key) return payload;

    const supa = getSupabase();
    const { data, error } = await supa
      .from('postcode_routing_codes')
      .select('left_code,right_code')
      .eq('postcode_key', key)
      .maybeSingle();

    if (!error && data) {
      payload.tiles = payload.tiles || {};
      payload.tiles.left = payload.tiles.left || data.left_code;
      payload.tiles.right = payload.tiles.right || data.right_code;
      return payload;
    }

    // non-fatal: queue for review
    await supa.from('postcodes_needs_review').insert({
      id: `${Date.now()}-${key}`, postcode_key: key, status: 'pending'
    });

    return payload;
  } catch {
    return payload; // fail-soft
  }
}

/** ---- route: A6 render ----
 * POST /api/labels/render-a6?save=1
 * Body: { orderId, variant|service, recipient{lines[]}, tiles?, price_text?, post_by_date?, ... }
 */
router.post('/api/labels/render-a6', express.json(), async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    // 1) variant resolution (nicknames → canonical id)
    const { requested, resolved } = resolveVariant(req.body || {});
    res.setHeader('x-variant-requested', requested || '');
    res.setHeader('x-variant-resolved', resolved || '');

    if (!resolved) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_VARIANT',
        allowed: Array.from(VALID_VARIANTS),
      });
    }

    // 2) basic id normalization
    const rawId = String((req.body && req.body.orderId) || 'ORD-0000').toUpperCase();
    const idCore = rawId.replace(/^ORD-?/, '');
    const safeId = idCore.replace(/[^A-Z0-9-]/g, '');
    res.setHeader('x-order-id', rawId);

    // 3) payload prep (tiles enrichment if absent)
    const payload = await enrichTilesIfMissing({ ...(req.body || {}), variant: resolved });

    // 4) render
    const pdfBuffer = await renderA6(payload);

    // 5) hash + optional save (storage + audit)
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    res.setHeader('X-Label-SHA256', sha256);

    // save gate: STORE_UPLOAD=1 OR ?save=1
    const shouldSave = (process.env.STORE_UPLOAD === '1') || (String(req.query.save) === '1');

    // optional signed URL from storage to include in audit row
    let savedUrl = null;

    if (shouldSave) {
      // 5a) (best-effort) store PDF, upsert orders table, set headers
      try {
        const supa = getSupabase();
        await supa.storage.createBucket('labels', { public: false }).catch(() => {});
        const path = `orders/RM-ORD-${safeId}.pdf`;

        await supa.storage.from('labels').upload(path, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

        await supa.from('orders').upsert(
          { id: rawId, pdf_sha256: sha256, storage_path: path },
          { onConflict: 'id' }
        );

        const { data: signed } =
          await supa.storage.from('labels').createSignedUrl(path, 60 * 60 * 24 * 7);

        if (signed?.signedUrl) {
          savedUrl = signed.signedUrl;
          res.setHeader('X-Signed-Url', signed.signedUrl);
        }
        res.setHeader('X-Label-Saved', '1');
      } catch (e) {
        console.error('[storage save failed]', e?.message || e);
        // never fail the download if storage is unavailable
        res.setHeader('X-Label-Saved', '0');
      }

      // 5b) (independent) write audit row with REQUIRED sha256 (do not block response)
      try {
        const supa = getSupabase();
        const { data, error } = await supa
          .from('label_audit')
          .insert({
            order_id: rawId,
            sha256,                 // REQUIRED by DB (NOT NULL)
            bytes: pdfBuffer.length,
            variant: resolved,
            service: 'api',
            saved_url: savedUrl,    // may be null; nullable column
          })
          .select('order_id')       // get something back on success
          .single();

        if (error) {
          console.error('[audit insert failed]', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
        } else {
          console.log('[audit insert ok]', data?.order_id || rawId);
        }
      } catch (e) {
        console.error('[audit insert threw]', e?.message || e);
      }
    }

    // 6) strict PDF headers + stream (non-negotiable)
    setPdfHeaders(res, `RM-ORD-${safeId}.pdf`);
    return res.status(200).end(pdfBuffer);
  } catch (err) {
    console.error('[render-a6]', err?.stack || err?.message || err);
    return res.status(500).json({ ok: false, error: 'PDF_RENDER_FAILED' });
  }
});

export default router;

