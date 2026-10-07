// M-31: the QR code of the game link with the room code, drawn as an svg (qrcode-generator, error level M)
import qrcode from 'qrcode-generator';
export function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }).trim(); }
