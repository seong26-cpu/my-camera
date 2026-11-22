// 선택 영역 다듬기 — 삼성 갤러리처럼 "톡 하면 물체 테두리에 딱 맞게"
// 1) 가이드 필터: 사진의 실제 경계(밝기 변화)에 맞춰 AI 마스크 가장자리를 붙임
// 2) 누른 지점과 이어진 덩어리만 남김 (떨어진 잡티 제거)
// 3) 안쪽 구멍 메우기 + 가장자리 매끈하게
import { makeCanvas, ctx2d } from './img.js';

/** 사진 → 밝기(0~1) 배열 */
export function grayOf(canvas) {
  const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  const g = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return g;
}

function boxFilter(src, W, H, r) {
  // 적분 영상으로 r 반경 평균
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += src[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r);
      const s = I[(y1 + 1) * (W + 1) + x1 + 1] - I[y0 * (W + 1) + x1 + 1] - I[(y1 + 1) * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      out[y * W + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

/** 가이드 필터 (He et al.) — p: AI 확신도, I: 사진 밝기 */
export function guidedFilter(I, p, W, H, r = 8, eps = 1e-3) {
  const n = W * H;
  const mI = boxFilter(I, W, H, r), mp = boxFilter(p, W, H, r);
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mIp = boxFilter(Ip, W, H, r), mII = boxFilter(II, W, H, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxFilter(a, W, H, r), mb = boxFilter(b, W, H, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, ma[i] * I[i] + mb[i]));
  return q;
}

/** (x,y)에서 이어진 덩어리 — 4방향 */
function floodFrom(mask, W, H, x, y, out) {
  const start = y * W + x;
  if (!mask[start] || out[start]) return 0;
  const stack = [start]; out[start] = 1; let n = 0;
  while (stack.length) {
    const i = stack.pop(); n++;
    const px = i % W, py = (i - px) / W;
    if (px > 0 && mask[i - 1] && !out[i - 1]) { out[i - 1] = 1; stack.push(i - 1); }
    if (px < W - 1 && mask[i + 1] && !out[i + 1]) { out[i + 1] = 1; stack.push(i + 1); }
    if (py > 0 && mask[i - W] && !out[i - W]) { out[i - W] = 1; stack.push(i - W); }
    if (py < H - 1 && mask[i + W] && !out[i + W]) { out[i + W] = 1; stack.push(i + W); }
  }
  return n;
}

/** 누른 점들과 이어진 덩어리만 남김. 누른 점이 경계 밖이면 가장 가까운 덩어리 */
export function keepTapped(mask, W, H, points) {
  const out = new Uint8Array(W * H);
  for (const [x, y] of points) {
    let px = Math.round(x), py = Math.round(y);
    if (!mask[py * W + px]) {
      // 반경을 넓혀 가장 가까운 선택 픽셀 찾기
      let found = false;
      for (let r = 2; r < Math.max(W, H) / 6 && !found; r += 2) {
        for (let a = 0; a < 16 && !found; a++) {
          const qx = Math.round(px + r * Math.cos((a * Math.PI) / 8)), qy = Math.round(py + r * Math.sin((a * Math.PI) / 8));
          if (qx >= 0 && qy >= 0 && qx < W && qy < H && mask[qy * W + qx]) { px = qx; py = qy; found = true; }
        }
      }
      if (!found) continue;
    }
    floodFrom(mask, W, H, px, py, out);
  }
  return out.some((v) => v) ? out : mask;
}

/** 안쪽 구멍 메우기: 가장자리에서 닿지 않는 빈 곳 = 구멍 */
export function fillHoles(mask, W, H) {
  const outside = new Uint8Array(W * H), stack = [];
  const push = (i) => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** 확신도 → 깔끔한 선택(마스크) + 부드러운 가장자리(alpha) */
export function refineSelection(conf, image, taps) {
  const W = image.width, H = image.height;
  // 큰 사진은 줄여서 계산 후 다시 늘림 (속도)
  const s = Math.min(1, 1024 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const small = makeCanvas(w, h); ctx2d(small).drawImage(image, 0, 0, w, h);
  const I = grayOf(small);
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = conf[Math.min(H - 1, Math.floor((y + 0.5) / s)) * W + Math.min(W - 1, Math.floor((x + 0.5) / s))];
  const q = guidedFilter(I, p, w, h, Math.max(4, Math.round(Math.max(w, h) / 160)), 4e-4);
  let m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = q[i] > 0.5 ? 1 : 0;
  const pos = taps.filter((t) => t.add).map((t) => [t.x * (w - 1), t.y * (h - 1)]);
  if (pos.length) m = keepTapped(m, w, h, pos);
  m = fillHoles(m, w, h);
  // 원래 크기로: 가장자리는 가이드 필터 값으로 부드럽게
  const mask = new Uint8Array(W * H), alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, (y + 0.5) * s - 0.5), y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(h - 1, y0 + 1), fy = Math.max(0, sy - y0);
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, (x + 0.5) * s - 0.5), x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(w - 1, x0 + 1), fx = Math.max(0, sx - x0);
      const mv = (m[y0 * w + x0] * (1 - fx) + m[y0 * w + x1] * fx) * (1 - fy) + (m[y1 * w + x0] * (1 - fx) + m[y1 * w + x1] * fx) * fy;
      const i = y * W + x;
      alpha[i] = mv;
      mask[i] = mv >= 0.5 ? 1 : 0;
    }
  }
  return { mask, alpha };
}

/** 선택 테두리(흰 빛) 그리기용 캔버스 */
export function outlineCanvas(mask, W, H, thick = 3) {
  const c = makeCanvas(W, H), g = ctx2d(c), id = g.createImageData(W, H), d = id.data;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W])) {
      for (let dy = -thick; dy <= thick; dy++) for (let dx = -thick; dx <= thick; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > thick * thick) continue;
        const j = (yy * W + xx) * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = 255;
      }
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

/** 흰 배경 제품 사진의 배경 지우기 (AI 없이, 가장자리에서 비슷한 색을 지워 감) */
export function removeFlatBackground(canvas, tol = 28) {
  const W = canvas.width, H = canvas.height, g = ctx2d(canvas), id = g.getImageData(0, 0, W, H), d = id.data;
  let br = 0, bg = 0, bb = 0, n = 0;
  const edge = (i) => { br += d[i * 4]; bg += d[i * 4 + 1]; bb += d[i * 4 + 2]; n++; };
  for (let x = 0; x < W; x++) { edge(x); edge((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { edge(y * W); edge(y * W + W - 1); }
  br /= n; bg /= n; bb /= n;
  const near = (i) => Math.abs(d[i * 4] - br) + Math.abs(d[i * 4 + 1] - bg) + Math.abs(d[i * 4 + 2] - bb) < tol * 3;
  const bgm = new Uint8Array(W * H), stack = [];
  const push = (i) => { if (!bgm[i] && near(i)) { bgm[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i - x) / W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
  let kept = 0;
  for (let i = 0; i < W * H; i++) if (bgm[i]) d[i * 4 + 3] = 0; else kept++;
  g.putImageData(id, 0, 0);
  return kept / (W * H); // 남은 비율 (너무 크면 배경이 단색이 아니었음)
}

/** 투명 부분을 잘라낸 캔버스 */
export function trimTransparent(canvas) {
  const W = canvas.width, H = canvas.height, d = ctx2d(canvas).getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return canvas;
  const c = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx2d(c).drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}
