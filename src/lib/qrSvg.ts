import QRCode from 'qrcode';

/**
 * Builds inline SVG markup for a QR code.
 *
 * The printable sheet is rendered by `expo-print` in a webview. Inlining the SVG
 * avoids the usual traps of that route entirely: no `data:` URI escaping, no
 * `<canvas>`, no base64 encoder, and no `toDataURL` (which needs a real canvas
 * that a headless webview may not provide).
 */

type Matrix = { size: number; data: Uint8Array };

const buildMatrix = (value: string): Matrix => {
  // `create` is pure JS — no canvas, so it is safe in any JS runtime.
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, data: qr.modules.data };
};

/** Merges horizontal runs of filled modules into one path segment each. */
const modulesToPath = ({ size, data }: Matrix, quietZone: number): string => {
  const parts: string[] = [];

  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!data[row * size + col]) {
        col += 1;
        continue;
      }

      let run = 1;
      while (col + run < size && data[row * size + col + run]) run += 1;

      const x = col + quietZone;
      const y = row + quietZone;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      col += run;
    }
  }

  return parts.join('');
};

export function qrSvgMarkup(
  value: string,
  options: { quietZone?: number; dark?: string; light?: string } = {}
): string {
  const quietZone = options.quietZone ?? 3;
  const dark = options.dark ?? '#11181C';
  const light = options.light ?? '#FFFFFF';

  const matrix = buildMatrix(value);
  const extent = matrix.size + quietZone * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" `,
    `width="${extent * 8}" height="${extent * 8}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${extent}" height="${extent}" fill="${light}"/>`,
    `<path d="${modulesToPath(matrix, quietZone)}" fill="${dark}"/>`,
    `</svg>`,
  ].join('');
}
