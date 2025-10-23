import QRCode from 'qrcode';

export async function makeQr(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return QRCode.toBuffer(text, { errorCorrectionLevel: 'M', margin: 0, scale: 4 });
}
