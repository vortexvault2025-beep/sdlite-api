import PDFDocument from 'pdfkit';

// Allowed A6 variants. Keep this in sync with openapi + UI mapping.
const ALLOWED = new Set(['a6_sd_1pm_v1', 'a6_trk24_nosig_v1']);
const normalizeVariant = v => (v ?? '').toString().trim();

function getBadge(variant) {
  switch (variant) {
    case 'a6_sd_1pm_v1':
      return 'Special Delivery — Guaranteed by 1pm';
    case 'a6_trk24_nosig_v1':
      return 'Tracked — No Signature 24';
    default:
      // Should never happen if we validate earlier; keep for defense-in-depth.
      throw new Error(`UNSUPPORTED_VARIANT:${variant}`);
  }
}

function drawTile(doc, x, y, text) {
  const w = 42, h = 18, r = 3;
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill('#000000');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10);
  const tx = x + 6, ty = y + 4;
  doc.text(String(text || ''), tx, ty, { width: w - 12, align: 'center' });
  doc.restore();
  doc.fillColor('#000000');
}

export const A6_SIZE = [298, 420]; // approx points

export function renderA6Into(doc, payload = {}, { x = 0, y = 0 } = {}) {
  const [W, H] = A6_SIZE;

  // Strictly validate the variant; never silently fall back to Tracked.
  const variant = normalizeVariant(payload.variant);
  if (!ALLOWED.has(variant)) {
    const err = new Error(`INVALID_VARIANT:${variant}`);
    err.code = 'INVALID_VARIANT';
    throw err;
  }
  const badge = getBadge(variant);

  doc.save();
  doc.translate(x, y);

  // Header
  doc.font('Helvetica-Bold').fontSize(11).text('Delivered By', 12, 10);
  doc.font('Helvetica').fontSize(9).text('Postage Paid GB', 12, 26);
  doc.font('Helvetica-Bold').fontSize(12).text(badge, 12, 44, { width: W - 24 });

  // Tiles
  drawTile(doc, 12, 66, payload?.tiles?.left);
  drawTile(doc, 60, 66, payload?.tiles?.right);

  // Top reference (verbatim)
  if (payload.top_ref_text) {
    doc.font('Helvetica').fontSize(10).text(String(payload.top_ref_text), 12, 90, { width: W - 24 });
  }

  // Address
  const lines = (payload?.recipient?.lines || []).filter(Boolean);
  if (lines.length) {
    const addrY = 108;
    const last = lines[lines.length - 1];
    const body = lines.slice(0, -1).join('\n');
    if (body) {
      doc.font('Helvetica').fontSize(10).text(body, 12, addrY, { width: W - 24 });
    }
    doc.font('Helvetica-Bold').fontSize(12)
      .text(String(last), 12, addrY + (body ? 14 * (lines.length - 1) : 0), { width: W - 24 });
  }

  // Mid ref + placeholders
  if (payload.mid_ref_text) {
    doc.font('Helvetica').fontSize(10).text(String(payload.mid_ref_text), 12, 260, { width: W - 24 });
  }
  doc.rect(12, 276, W - 24, 32).stroke();
  doc.font('Helvetica').fontSize(9).text('1D BARCODE (placeholder)', 16, 288);
  doc.rect(12, 316, 38, 38).stroke();
  doc.font('Helvetica').fontSize(8).text('2D', 26, 330);

  // Footer
  let yy = 360;
  if (payload.customer_ref) { doc.font('Helvetica').fontSize(9).text(`Customer Ref: ${String(payload.customer_ref)}`, 12, yy); yy += 12; }
  if (payload.price_text)   { doc.font('Helvetica').fontSize(9).text(`Postage Cost ${String(payload.price_text)}`, 12, yy); yy += 12; }
  if (payload.post_by_date) { doc.font('Helvetica').fontSize(9).text(`Post by the end of ${String(payload.post_by_date)}`, 12, yy); }

  doc.restore();
}
