import PDFDocument from 'pdfkit';
import { renderA6Into, A6_SIZE } from './renderA6Into.js';

export async function renderA6(payload = {}) {
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: A6_SIZE, margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      renderA6Into(doc, payload, { x: 0, y: 0 });
      doc.end();
    } catch (err) { reject(err); }
  });
}
