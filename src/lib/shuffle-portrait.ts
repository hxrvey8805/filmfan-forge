import pico from "./portrait-detector/pico.mjs";
import weights from "./portrait-detector/facefinder.b64?raw";

// This module is loaded only for shuffle photos. The weights travel with the app.
const classify = pico.unpack_cascade(Int8Array.from(atob(weights), char => char.charCodeAt(0)));
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

export function shuffleCrop(image: HTMLImageElement) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;

  const sample = document.createElement("canvas");
  const ratio = Math.min(224 / Math.max(width, height), 1);
  sample.width = Math.max(1, Math.round(width * ratio));
  sample.height = Math.max(1, Math.round(height * ratio));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, sample.width, sample.height);
  const rgba = context.getImageData(0, 0, sample.width, sample.height).data;
  const pixels = new Uint8Array(sample.width * sample.height);
  for (let i = 0; i < pixels.length; i++) {
    const j = i * 4;
    pixels[i] = (rgba[j] * 30 + rgba[j + 1] * 59 + rgba[j + 2] * 11) / 100;
  }

  const hits = pico.run_cascade(
    { pixels, nrows: sample.height, ncols: sample.width, ldim: sample.width }, classify,
    { minsize: 26, maxsize: Math.min(sample.width, sample.height), scalefactor: 1.12, shiftfactor: .1 },
  );
  const faces = pico.cluster_detections(hits, .22).filter(face => face[3] >= 8);
  if (faces.length !== 1 || faces[0][3] < 25) return null;

  const [row, col, side] = faces[0];
  const x = col / ratio;
  const y = row / ratio;
  const size = side / ratio;
  // Keep extra room above the forehead, below the chin, and beside both ears.
  const left = Math.max(0, x - .68 * size);
  const right = Math.min(width, x + .68 * size);
  const top = Math.max(0, y - 1.1 * size);
  const bottom = Math.min(height, y + .77 * size);
  const zoom = Math.min(1.07, width / (right - left), height / (bottom - top));
  if (zoom < 1.02) return null;

  const w = Math.ceil(width / zoom);
  const h = Math.ceil(height / zoom);
  return {
    x: clamp(x - w / 2, Math.max(0, right - w), Math.min(left, width - w)),
    y: clamp(y - h / 2, Math.max(0, bottom - h), Math.min(top, height - h)),
    w, h,
  };
}
