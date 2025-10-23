import PDFDocument from 'pdfkit';
import { renderA6Into, A6_SIZE } from './renderA6Into.js';
import { getTileCodes } from '../utils/tiles.js';
import { makeQr } from '../utils/qr.js';

export async function renderA6(payload = {}) {
  return await new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: A6_SIZE, margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // --- Compute tiles & QR (DB-first; deterministic fallback)
      const lines = Array.isArray(payload?.recipient?.lines) ? payload.recipient.lines : [];
      const postcode = String(payload?.recipient?.postcode || lines[lines.length - 1] || '')
        .toUpperCase();
      const pc = postcode.replace(/[^A-Z0-9]/g, '');
      const tiles = await getTileCodes(pc);
      const qrPng = await makeQr({
        id: payload.orderId || 'ORD0000',
        pc,
        l: tiles.left,
        r: tiles.right,
        v: 'a6_v1'
      });

      // Pass tiles into the base drawer so the two tile boxes render digits
      const withTiles = { ...payload, tiles };
      renderA6Into(doc, withTiles, { x: 0, y: 0 });

      // Draw QR over the existing 2D placeholder box (same coordinates)
      if (qrPng) {
        doc.image(qrPng, 12, 316, { width: 38 }); // matches the placeholder rectangle in renderA6Into
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
