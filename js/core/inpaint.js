// 빈자리 채우기
// - 빠른 채움: 주변 색을 안쪽으로 번지게 (항상 무료·즉시, 작은 물체에 적합)
// - 고품질 채움: LaMa 인페인팅 모델(Apache-2.0, 압축판) — 처음 한 번 내려받아 폰에 저장
import { makeCanvas, ctx2d } from './img.js';

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
const LAMA_URL = 'https://huggingface.co/othytenk/lama-int4-int8/resolve/main/lama_int4_int8_r4.onnx';
const CACHE = 'mc-models-v1';

/** 0/1 마스크를 r 픽셀만큼 넓힌다 */
export function dilate(mask, W, H, r) {
  if (r <= 0) return mask;
  let cur = mask;
  for (let k = 0; k < r; k++) {
    const nx = new Uint8Array(cur);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cur[i]) continue;
      if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) nx[i] = 1;
    }
    cur = nx;
  }
  return cur;
}

export function bboxOf(mask, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 채울 작업 영역(물체 주변 + 맥락) */
function contextBox(bb, W, H, minSide = 64) {
  const side = Math.min(Math.max(W, H), Math.max(minSide, Math.round(Math.max(bb.w, bb.h) * 2)));
  const w = Math.min(W, side), h = Math.min(H, side);
  const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
  const x = Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
  const y = Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
  return { x, y, w, h };
}

/** 결과 조각을 마스크 부분만 부드럽게 붙임 */
function pasteMasked(canvas, piece, box, mask, W) {
  const g = ctx2d(canvas);
  const dst = g.getImageData(box.x, box.y, box.w, box.h);
  const src = ctx2d(piece).getImageData(0, 0, box.w, box.h);
  // 경계 2픽셀은 반쯤 섞어 이음새를 숨김
  const soft = dilate(mask, W, canvas.height, 2);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const mi = (box.y + y) * W + (box.x + x);
    const a = mask[mi] ? 1 : soft[mi] ? 0.5 : 0;
    if (!a) continue;
    const i = (y * box.w + x) * 4;
    for (let c = 0; c < 3; c++) dst.data[i + c] = dst.data[i + c] * (1 - a) + src.data[i + c] * a;
    dst.data[i + 3] = 255;
  }
  g.putImageData(dst, box.x, box.y);
}

/** 빠른 채움 — 바깥에서 안쪽으로 한 겹씩 평균색 채우기 + 살짝 흐림 */
export function fastFill(canvas, mask) {
  const W = canvas.width, H = canvas.height;
  const bb = bboxOf(mask, W, H); if (!bb) return;
  const box = contextBox({ x: bb.x - 4, y: bb.y - 4, w: bb.w + 8, h: bb.h + 8 }, W, H, 32);
  const s = Math.min(1, 320 / Math.max(box.w, box.h));
  const w = Math.max(2, Math.round(box.w * s)), h = Math.max(2, Math.round(box.h * s));
  const small = makeCanvas(w, h), sg = ctx2d(small);
  sg.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const id = sg.getImageData(0, 0, w, h), d = id.data;
  const known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const mx = Math.min(W - 1, box.x + Math.floor((x + 0.5) / s)), my = Math.min(H - 1, box.y + Math.floor((y + 0.5) / s));
    // 축소 칸 안에 물체가 조금이라도 있으면 '모름'으로
    let hit = 0; const step = Math.max(1, Math.floor(1 / s));
    for (let yy = 0; yy < step && !hit; yy++) for (let xx = 0; xx < step && !hit; xx++) hit = mask[Math.min(H - 1, my - (step >> 1) + yy) * W + Math.min(W - 1, Math.max(0, mx - (step >> 1) + xx))];
    known[y * w + x] = hit ? 0 : 1;
  }
  let todo = known.reduce((a, v) => a + (v ? 0 : 1), 0), guard = 0;
  while (todo > 0 && guard++ < 2000) {
    const nk = new Uint8Array(known); let filled = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (known[i]) continue;
      let r = 0, g2 = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!known[j]) continue;
        const wt = dx && dy ? 0.7 : 1; r += d[j * 4] * wt; g2 += d[j * 4 + 1] * wt; b += d[j * 4 + 2] * wt; n += wt;
      }
      if (n >= 1.4) { d[i * 4] = r / n; d[i * 4 + 1] = g2 / n; d[i * 4 + 2] = b / n; nk[i] = 1; filled++; }
    }
    known.set(nk); todo -= filled; if (!filled) break;
  }
  sg.putImageData(id, 0, 0);
  sg.filter = 'blur(1px)'; sg.drawImage(small, 0, 0); sg.filter = 'none';
  const piece = makeCanvas(box.w, box.h), pg = ctx2d(piece);
  pg.imageSmoothingQuality = 'high'; pg.drawImage(small, 0, 0, box.w, box.h);
  // 원래 해상도 느낌을 위해 아주 약한 잡티를 섞음
  const pd = pg.getImageData(0, 0, box.w, box.h);
  for (let i = 0; i < pd.data.length; i += 4) { const n = (Math.random() - 0.5) * 6; pd.data[i] += n; pd.data[i + 1] += n; pd.data[i + 2] += n; }
  pg.putImageData(pd, 0, 0);
  pasteMasked(canvas, piece, box, mask, W);
}

// ── LaMa ─────────────────────────────────────────────
let session = null, ort = null;
export async function lamaReady() {
  try { const c = await caches.open(CACHE); return !!(await c.match(LAMA_URL)); } catch { return false; }
}
async function fetchModel(onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(LAMA_URL); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {}
  const res = await fetch(LAMA_URL);
  if (!res.ok) throw new Error('모델 내려받기 실패 (' + res.status + ')');
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(total ? got / total : 0, got); }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  try { await cache?.put(LAMA_URL, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
  return buf;
}
async function getSession(onProgress) {
  if (session) return session;
  ort = await import(ORT + 'ort.webgpu.min.mjs');
  ort.env.wasm.wasmPaths = ORT;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const buf = await fetchModel(onProgress);
  const opts = (ep) => ({ executionProviders: [ep], extra: { session: { disable_quant_qdq: '1' } } });
  try {
    if (!('gpu' in navigator)) throw new Error('no webgpu');
    session = await ort.InferenceSession.create(buf, opts('webgpu'));
  } catch {
    session = await ort.InferenceSession.create(buf, opts('wasm'));
  }
  return session;
}

/** 고품질 채움 (모델 입력 512×512 고정) */
export async function lamaFill(canvas, mask, onProgress) {
  const W = canvas.width, H = canvas.height;
  const bb = bboxOf(mask, W, H); if (!bb) return;
  const s = await getSession((r, b) => onProgress?.(r * 0.8, `고품질 채움 모델 내려받는 중 ${Math.round(b / 1048576)}MB (처음 한 번)`));
  onProgress?.(0.85, '빈자리 그리는 중…');
  const box = contextBox(bb, W, H, 256);
  const N = 512;
  const crop = makeCanvas(N, N), cg = ctx2d(crop);
  cg.imageSmoothingQuality = 'high';
  cg.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, N, N);
  const px = cg.getImageData(0, 0, N, N).data;
  const img = new Float32Array(3 * N * N), msk = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    img[i] = px[i * 4] / 255; img[N * N + i] = px[i * 4 + 1] / 255; img[2 * N * N + i] = px[i * 4 + 2] / 255;
    const mx = Math.min(W - 1, box.x + Math.floor((x + 0.5) * box.w / N)), my = Math.min(H - 1, box.y + Math.floor((y + 0.5) * box.h / N));
    msk[i] = mask[my * W + mx] ? 1 : 0;
  }
  const feeds = { image: new ort.Tensor('float32', img, [1, 3, N, N]), mask: new ort.Tensor('float32', msk, [1, 1, N, N]) };
  const out = (await s.run(feeds)).output.data;
  const od = cg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    od.data[i * 4] = out[i]; od.data[i * 4 + 1] = out[N * N + i]; od.data[i * 4 + 2] = out[2 * N * N + i]; od.data[i * 4 + 3] = 255;
  }
  cg.putImageData(od, 0, 0);
  const piece = makeCanvas(box.w, box.h), pg = ctx2d(piece);
  pg.imageSmoothingQuality = 'high'; pg.drawImage(crop, 0, 0, box.w, box.h);
  pasteMasked(canvas, piece, box, mask, W);
  onProgress?.(1, '완료');
}

/** 모델 파일만 미리 내려받아 저장 (실행 준비는 처음 쓸 때) */
export async function prefetchLama(onProgress) { await fetchModel(onProgress); }
