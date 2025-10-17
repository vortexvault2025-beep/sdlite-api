import express from 'express';
import { getSupabase } from '../utils/supabaseClient.js';
const router = express.Router();

router.get('/api/orders/:id/signed-url', async (req, res) => {
  try {
    const id = String(req.params.id || '').toUpperCase();
    if (!id) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });

    const supa = getSupabase();
    const q = await supa.from('orders')
      .select('storage_path, pdf_sha256')
      .eq('id', id)
      .maybeSingle();

    if (q.error) return res.status(500).json({ ok: false, error: 'DB_ERROR', detail: q.error.message });
    if (!q.data?.storage_path) return res.status(404).json({ ok: false, error: 'NO_STORAGE_PATH' });

    const expires = Number(req.query.expires || 60*60*24*7);
    const s = await supa.storage.from('labels').createSignedUrl(q.data.storage_path, expires);
    if (s.error) return res.status(500).json({ ok: false, error: 'SIGNED_URL_ERROR', detail: s.error.message });

    return res.json({ ok:true, id, pdf_sha256: q.data.pdf_sha256 || null, signed_url: s.data?.signedUrl || null, expires_seconds: expires });
  } catch {
    return res.status(500).json({ ok:false, error: 'SIGNED_URL_FAILED' });
  }
});

export default router;
