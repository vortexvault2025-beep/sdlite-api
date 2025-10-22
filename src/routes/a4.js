import express from 'express';
import PDFDocument from 'pdfkit';
import * as crypto from 'crypto';
import { setPdfHeaders } from '../utils/pdfHeaders.js';
import { getSupabase } from '../utils/supabaseClient.js';
import { renderA6Into, A6_SIZE } from '../render/renderA6Into.js';

const router = express.Router();

/**
 * POST /api/labels/render-a4-4up?count=1..4&save=0|1
 * Body: same payload shape as A6
 * Tiles fill TL → TR → BL → BR; unused tiles blank.
 * Contract: true PDF, strict headers, and identical audit/storage semantics as A6 on save=1.
 */
router.post('/api/labels/render-a4-4up', express.json(), async (req, res) => {
  try {
    const payload = req.body || {};

    // Normalise order id / filename
    const rawId  = String(payload.orderId || 'ORD-0000').toUpperCase();
    const idCore = rawId.replace(/^ORD-?/, '');
    const safeId = idCore.replace(/[^A-Z0-9-]/g, '');

    res.setHeader('x-order-id', rawId);

    const count = Math.max(1, Math.min(4, Number(req.query.count || payload.count || 1)));
    const wantSave = String(req.query.save || payload.save || '0') === '1';

    // ----------------------------- save=1 (buffer, audit, then respond) -----------------------------
    if (wantSave) {
      const bufChunks = [];
      const docSave = new PDFDocument({ size: 'A4', margin: 0 });

      // Compose A4 by tiling A6s in TL → TR → BL → BR
      const [W, H] = A6_SIZE;
      const quads  = [
        { x: 0, y: 0 },   // TL
        { x: W, y: 0 },   // TR
        { x: 0, y: H },   // BL
        { x: W, y: H },   // BR
      ];
      for (let i = 0; i < count; i++) {
        renderA6Into(docSave, payload, quads[i]);
      }

      docSave.on('data', c => bufChunks.push(c));
      docSave.on('end', async () => {
        try {
          const buf = Buffer.concat(bufChunks);

          // ====== A6-parity: hash + optional save (storage + orders upsert + signed URL) ======
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          res.setHeader('X-Label-SHA256', sha256);

          // gate: STORE_UPLOAD=1 OR ?save=1  (same semantics as A6)
          const shouldSave = (process.env.STORE_UPLOAD === '1') || (String(req.query.save) === '1');

          // signed URL for audit (may remain null)
          let savedUrl = null;

          if (shouldSave) {
            // 5a) (best-effort) store PDF, upsert orders table, set headers (parity with A6)
            try {
              const supa = getSupabase();
              await supa.storage.createBucket('labels', { public: false }).catch(() => {});
              const path = `orders/RM-ORD-${safeId}.pdf`;

              await supa.storage.from('labels').upload(path, buf, {
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
              // A6 uses "resolved" for variant; A4 records a descriptive tag if absent.
              const variantForAudit = (payload && payload.variant) || 'a4_4up';

              const { data, error } = await supa
                .from('label_audit')
                .insert({
                  order_id: rawId,
                  sha256,                 // REQUIRED by DB (NOT NULL)
                  bytes: buf.length,
                  variant: variantForAudit,
                  service: 'api',
                  saved_url: savedUrl,    // nullable
                })
                .select('order_id')
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

          // Strict headers + send buffered PDF
          setPdfHeaders(res, `RM-ORD-${safeId}.pdf`);
          return res.status(200).send(buf);
        } catch (e) {
          console.error('[render-a4-4up save]', e?.message || e);
          return res.status(500).json({ ok: false, error: 'PDF_SAVE_AUDIT_FAILED' });
        }
      });

      docSave.end();
      return; // IMPORTANT: streamed path below is for save=0 only
    }
    // ----------------------------- end save=1 branch ---------------------------------------------

    // save=0 (streaming, unchanged; CI smokes rely on this)
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    setPdfHeaders(res, `RM-ORD-${safeId}.pdf`);
    doc.pipe(res);

    const [W, H] = A6_SIZE;
    const quads = [
      { x: 0, y: 0 },   // TL
      { x: W, y: 0 },   // TR
      { x: 0, y: H },   // BL
      { x: W, y: H },   // BR
    ];
    for (let i = 0; i < count; i++) {
      renderA6Into(doc, payload, quads[i]);
    }

    doc.end();
  } catch (err) {
    console.error('[render-a4-4up]', err?.stack || err?.message || err);
    return res.status(500).json({ ok: false, error: 'PDF_RENDER_FAILED' });
  }
});

export default router;

