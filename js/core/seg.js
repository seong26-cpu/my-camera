// 물체 선택 — Google MediaPipe Interactive Segmenter (폰 안에서 처리, 무료, Apache-2.0)
// 사진에서 한 점을 톡 → 그 점이 속한 물체의 영역(0~1 확신도 지도)을 돌려준다
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';

let seg = null, lib = null, imageSet = null;

export async function loadSegmenter() {
  if (seg) return seg;
  lib = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  try {
    seg = await lib.InteractiveSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' } });
  } catch {
    seg = await lib.InteractiveSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' } });
  }
  return seg;
}

/**
 * @param {HTMLCanvasElement} canvas 작업 사진
 * @param {{x:number,y:number,add:boolean}[]} taps 0~1 좌표, add=false 면 '빼기'
 * @returns {Float32Array} canvas 크기의 확신도(0~1)
 */
export async function segment(canvas, taps) {
  const s = await loadSegmenter();
  if (imageSet !== canvas) { s.setImage(canvas); imageSet = canvas; }
  const strokes = taps.map((t) => ({ brushMode: t.add ? lib.BrushMode.POSITIVE : lib.BrushMode.NEGATIVE, point: [{ x: t.x, y: t.y }], isCompleted: true }));
  const mask = s.segment(strokes);
  try {
    const W = canvas.width, H = canvas.height;
    const src = mask.getAsFloat32Array(), mw = mask.width, mh = mask.height;
    if (mw === W && mh === H) return new Float32Array(src);
    // 크기가 다르면 맞춰서 늘림(쌍선형)
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = Math.min(mh - 1, (y + 0.5) * mh / H - 0.5), y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(mh - 1, y0 + 1), fy = Math.max(0, sy - y0);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(mw - 1, (x + 0.5) * mw / W - 0.5), x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(mw - 1, x0 + 1), fx = Math.max(0, sx - x0);
        const a = src[y0 * mw + x0] + (src[y0 * mw + x1] - src[y0 * mw + x0]) * fx;
        const b = src[y1 * mw + x0] + (src[y1 * mw + x1] - src[y1 * mw + x0]) * fx;
        out[y * W + x] = a + (b - a) * fy;
      }
    }
    return out;
  } finally { mask.close(); }
}

export function resetImage() { imageSet = null; }
