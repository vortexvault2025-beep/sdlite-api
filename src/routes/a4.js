import express from 'express';
import PDFDocument from 'pdfkit';
import { setPdfHeaders } from '../utils/pdfHeaders.js';
import { renderA6Into, A6_SIZE } from '../render/renderA6Into.js';

const router = express.Router();

router.post('/api/labels/render-a4-4up', express.json(), async (req, res) => {
  try {
    const payload = req.body || {};
    const rawId = String(payload.orderId || 'ORD-0000').toUpperCase();
    // Prevent double ORD- in filename
    const idCore = rawId.replace(/^ORD-?/, '');
    const safeId = idCore.replace(/[^A-Z0-9-]/g, '');
    const count = Math.max(1, Math.min(4, Number(req.query.count || payload.count || 1)));

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    setPdfHeaders(res, `RM-ORD-${safeId}.pdf`);
    doc.pipe(res);

    const [W, H] = A6_SIZE;
    const quads = [
      { x: 0,   y: 0 }, // TL
      { x: W,   y: 0 }, // TR
      { x: 0,   y: H }, // BL
      { x: W,   y: H }, // BR
    ];
    for (let i = 0; i < count; i++) {
      renderA6Into(doc, payload, quads[i]);
    }

    doc.end();
  } catch (err) {
    console.error('[render-a4-4up]', err.message);
    res.status(500).json({ ok: false, error: 'PDF_RENDER_FAILED' });
  }
});

export default router;
