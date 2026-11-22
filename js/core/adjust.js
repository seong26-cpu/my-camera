// 수동 보정·자동 보정 픽셀 처리
import { applyLutToData } from './lut.js';
import { makeCanvas, ctx2d } from './img.js';

export const DEFAULT_ADJ = {
  exposure: 0,   // 밝기 -100~100
  contrast: 0,   // 대비
  highlights: 0, // 밝은 부분
  shadows: 0,    // 어두운 부분
  saturation: 0, // 채도
  warmth: 0,     // 색온도 (따뜻하게 +)
  tint: 0,       // 색조 (자주 +, 초록 -)
  sharpen: 0,    // 선명도 0~100
  vignette: 0,   // 가장자리 어둡게 0~100
};

export function isNeutral(a) {
  return Object.keys(DEFAULT_ADJ).every((k) => !a[k]) && !a.auto;
}

/** 자동 보정 값 계산: 밝기 범위 늘리기(0.5%~99.5%) + 회색 기준 화이트밸런스(±12% 이내) */
export function computeAuto(imageData) {
  const d = imageData.data, hist = new Uint32Array(256);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { // 4픽셀마다 표본
    const r = d[i], g = d[i + 1], b = d[i + 2];
    hist[(r * 77 + g * 150 + b * 29) >> 8]++;
    sr += r; sg += g; sb += b; n++;
  }
  const pick = (q) => { let acc = 0; const t = n * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  let lo = pick(0.005), hi = pick(0.995);
  lo = Math.min(lo, 40); hi = Math.max(hi, 200); // 과하게 늘리지 않음
  const avg = (sr + sg + sb) / 3 / n;
  const lim = (v) => Math.min(1.12, Math.max(0.88, v));
  const wb = [lim(avg / (sr / n || 1)), lim(avg / (sg / n || 1)), lim(avg / (sb / n || 1))];
  // 효과를 절반만 (자연스럽게)
  return { lo: lo * 0.6, hi: 255 - (255 - hi) * 0.6, wb: wb.map((v) => 1 + (v - 1) * 0.5) };
}

function buildToneCurve(a) {
  // 밝기·대비·하이라이트·섀도를 256칸 곡선 하나로
  const curve = new Float32Array(256);
  const ex = Math.pow(2, (a.exposure || 0) / 100);
  const ct = 1 + (a.contrast || 0) / 100;
  const hl = (a.highlights || 0) / 100, sh = (a.shadows || 0) / 100;
  const lo = a.auto?.lo ?? 0, hi = a.auto?.hi ?? 255;
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo)));
    x = x * ex;
    x = (x - 0.5) * ct + 0.5;
    const xs = Math.min(1, Math.max(0, x));
    x += sh * 0.35 * Math.pow(1 - xs, 2) * xs * 4;     // 어두운 쪽만 들어올림/내림
    x += hl * 0.35 * Math.pow(xs, 2) * (1 - xs) * 4;   // 밝은 쪽만
    curve[v] = Math.min(255, Math.max(0, x * 255));
  }
  return curve;
}

/**
 * RGBA 데이터에 보정을 입힌다 (제자리 수정)
 * 순서: 내 스타일 LUT → 자동(화이트밸런스) → 톤 곡선 → 채도·색온도 → 선명도 → 비네팅
 */
export function processImageData(id, adj = DEFAULT_ADJ, lut = null, lutStrength = 1) {
  const d = id.data, W = id.width, H = id.height;
  if (lut && lutStrength > 0) applyLutToData(d, lut, lutStrength);
  const curve = buildToneCurve(adj);
  const wb = adj.auto?.wb || [1, 1, 1];
  const warm = (adj.warmth || 0) / 100, tint = (adj.tint || 0) / 100;
  const rM = wb[0] * (1 + warm * 0.12 + tint * 0.04), gM = wb[1] * (1 - tint * 0.08), bM = wb[2] * (1 - warm * 0.12 + tint * 0.04);
  const sat = 1 + (adj.saturation || 0) / 100;
  for (let p = 0; p < d.length; p += 4) {
    let r = curve[Math.min(255, d[p] * rM | 0)], g = curve[Math.min(255, d[p + 1] * gM | 0)], b = curve[Math.min(255, d[p + 2] * bM | 0)];
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    d[p] = r; d[p + 1] = g; d[p + 2] = b;
  }
  if (adj.sharpen > 0) sharpen(id, adj.sharpen / 100);
  if (adj.vignette > 0) vignette(id, adj.vignette / 100);
  return id;
}

function sharpen(id, amount) {
  // 언샤프 마스크(3×3 박스 흐림과의 차이를 더함)
  const { width: W, height: H, data: d } = id;
  const src = new Uint8ClampedArray(d);
  const k = amount * 1.2;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const j = i + c;
        const blur = (src[j - 4] + src[j + 4] + src[j - W * 4] + src[j + W * 4] + src[j] * 4) / 8;
        d[j] = src[j] + (src[j] - blur) * k * 2;
      }
    }
  }
}

function vignette(id, amount) {
  const { width: W, height: H, data: d } = id;
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.hypot(x - cx, y - cy) / R;
    const f = 1 - amount * 0.6 * Math.pow(Math.max(0, t - 0.35) / 0.65, 2);
    const i = (y * W + x) * 4;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
}

/** 회전(90° 단위)·좌우반전·비율 자르기를 적용한 새 캔버스 */
export function applyGeometry(src, geo = {}) {
  const rot = ((geo.rotate || 0) % 360 + 360) % 360;
  const sw = src.width, sh = src.height;
  const rw = rot % 180 ? sh : sw, rh = rot % 180 ? sw : sh;
  const c = makeCanvas(rw, rh), g = ctx2d(c);
  g.translate(rw / 2, rh / 2);
  g.rotate((rot * Math.PI) / 180);
  if (geo.flip) g.scale(-1, 1);
  g.drawImage(src, -sw / 2, -sh / 2);
  if (!geo.ratio || geo.ratio === 'orig') return c;
  const [a, b] = geo.ratio.split(':').map(Number);
  let cw = rw, ch = Math.round(rw * b / a);
  if (ch > rh) { ch = rh; cw = Math.round(rh * a / b); }
  const ox = geo.cropX ?? 0.5, oy = geo.cropY ?? 0.5; // 자르는 위치(0~1)
  const out = makeCanvas(cw, ch);
  ctx2d(out).drawImage(c, Math.round((rw - cw) * ox), Math.round((rh - ch) * oy), cw, ch, 0, 0, cw, ch);
  return out;
}

/** 캔버스 전체를 처리 (큰 사진은 띠 단위로 나눠 메모리 절약) */
export async function processCanvas(canvas, adj, lut, lutStrength) {
  const g = ctx2d(canvas), W = canvas.width, H = canvas.height;
  const needsNeighbors = adj.sharpen > 0;
  if (needsNeighbors || adj.vignette > 0 || H * W < 4e6) {
    const id = g.getImageData(0, 0, W, H);
    processImageData(id, adj, lut, lutStrength);
    g.putImageData(id, 0, 0);
    return canvas;
  }
  const band = 512;
  for (let y = 0; y < H; y += band) {
    const h = Math.min(band, H - y);
    const id = g.getImageData(0, y, W, h);
    processImageData(id, adj, lut, lutStrength);
    g.putImageData(id, 0, y);
    await new Promise((r) => setTimeout(r, 0));
  }
  return canvas;
}
