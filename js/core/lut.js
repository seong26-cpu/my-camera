// 내 보정 스타일 표(3D LUT, .cube) — 편남 v8.0 photo_style.py 를 브라우저용으로 옮긴 것
// - 색감(Lab a·b 분포)은 비포→애프터 차이를 그대로 배운다
// - 밝기는 배운 변화의 40%만(기본값). 분포끼리 맞춘 곡선이라 밝은 하늘이 하얗게 날아가지 않는다
// - 표 크기 33×33×33, .cube 순서는 빨강이 가장 빨리 변함

export const LUT_SIZE = 33;
export const DEFAULT_BRIGHT = 0.4;

const M = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041];
const MI = invert3(M);
const WX = 0.95047, WY = 1.0, WZ = 1.08883;
const EPS = 216 / 24389, KAP = 24389 / 27;

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

const lin = (v) => (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92);
const gam = (v) => (v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v);
const fLab = (t) => (t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116);

/** r,g,b 0~1 → out[o..o+2] 에 L,a,b */
export function rgb2lab(r, g, b, out, o = 0) {
  r = lin(r); g = lin(g); b = lin(b);
  const x = (M[0] * r + M[1] * g + M[2] * b) / WX;
  const y = (M[3] * r + M[4] * g + M[5] * b) / WY;
  const z = (M[6] * r + M[7] * g + M[8] * b) / WZ;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  out[o] = 116 * fy - 16; out[o + 1] = 500 * (fx - fy); out[o + 2] = 200 * (fy - fz);
}
const clip01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** L,a,b → out[o..o+2] 에 r,g,b 0~1 */
export function lab2rgb(L, A, B, out, o = 0) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = (f) => { const f3 = f * f * f; return f3 > EPS ? f3 : (116 * f - 16) / KAP; };
  const x = inv(fx) * WX, y = inv(fy) * WY, z = inv(fz) * WZ;
  const r = clip01(MI[0] * x + MI[1] * y + MI[2] * z);
  const g = clip01(MI[3] * x + MI[4] * y + MI[5] * z);
  const b = clip01(MI[6] * x + MI[7] * y + MI[8] * z);
  out[o] = clip01(gam(r)); out[o + 1] = clip01(gam(g)); out[o + 2] = clip01(gam(b));
}

/** ImageData(RGBA) → Lab Float64Array(n*3) */
export function imageDataToLab(id) {
  const d = id.data, n = d.length / 4, lab = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) rgb2lab(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255, lab, i * 3);
  return lab;
}

function percentiles(sorted, qs) {
  // numpy.percentile(linear) 과 같은 방식
  const n = sorted.length;
  return qs.map((q) => {
    const pos = (q / 100) * (n - 1), lo = Math.floor(pos), hi = Math.min(lo + 1, n - 1), t = pos - lo;
    return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
  });
}
function interp(x, xs, ys) {
  // numpy.interp: 범위 밖은 끝값
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/**
 * 비포/애프터 Lab 묶음에서 통계를 뽑는다 (밝기 반영 비율을 바꿔 다시 만들 때 재사용)
 * @param {Float64Array[]} befores @param {Float64Array[]} afters
 */
export function learnStats(befores, afters) {
  const cat = (arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), o = new Float64Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; };
  const B = cat(befores), A = cat(afters);
  const nb = B.length / 3, na = A.length / 3;
  const mean = (X, n) => { const m = [0, 0, 0]; for (let i = 0; i < n; i++) { m[0] += X[i * 3]; m[1] += X[i * 3 + 1]; m[2] += X[i * 3 + 2]; } return m.map((v) => v / n); };
  const std = (X, n, m) => { const s = [0, 0, 0]; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const d = X[i * 3 + c] - m[c]; s[c] += d * d; } return s.map((v) => Math.sqrt(v / n)); };
  const mB = mean(B, nb), mA = mean(A, na), sB = std(B, nb, mB), sA = std(A, na, mA);
  const scale = [0, 1, 2].map((c) => Math.min(2, Math.max(0.5, sA[c] / Math.max(sB[c], 1e-6))));
  const shift = [0, 1, 2].map((c) => mA[c] - mB[c] * scale[c]);
  const Lb = new Float64Array(nb), La = new Float64Array(na);
  for (let i = 0; i < nb; i++) Lb[i] = B[i * 3];
  for (let i = 0; i < na; i++) La[i] = A[i * 3];
  Lb.sort(); La.sort();
  const q = Array.from({ length: 101 }, (_, i) => i);
  let xb = [0, ...percentiles(Lb, q), 100];
  const xa = [0, ...percentiles(La, q), 100];
  // np.maximum.accumulate(xb + arange*1e-6)
  let run = -Infinity;
  xb = xb.map((v, i) => (run = Math.max(run, v + i * 1e-6)));
  return { scale, shift, xb, xa, learnedBrightDiff: mA[0] - mB[0] };
}

/** 통계 → LUT (Float32Array size^3*3, r 가 가장 빨리 변함) */
export function buildLut(stats, bright = DEFAULT_BRIGHT, size = LUT_SIZE) {
  const { scale, shift, xb, xa } = stats;
  const data = new Float32Array(size * size * size * 3);
  const lab = [0, 0, 0], rgb = [0, 0, 0];
  let o = 0;
  for (let bi = 0; bi < size; bi++)
    for (let gi = 0; gi < size; gi++)
      for (let ri = 0; ri < size; ri++) {
        rgb2lab(ri / (size - 1), gi / (size - 1), bi / (size - 1), lab);
        const L = lab[0] + bright * (interp(lab[0], xb, xa) - lab[0]);
        lab2rgb(L, lab[1] * scale[1] + shift[1], lab[2] * scale[2] + shift[2], rgb);
        data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
      }
  return { size, data };
}

export function lutToCube(lut, title = 'my style') {
  const lines = [`TITLE "${title.replace(/"/g, '')}"`, `LUT_3D_SIZE ${lut.size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  const d = lut.data;
  for (let i = 0; i < d.length; i += 3) lines.push(`${d[i].toFixed(6)} ${d[i + 1].toFixed(6)} ${d[i + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

export function parseCube(text) {
  let size = 0; const v = [];
  let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim().split(/\s+/);
    if (!s[0] || s[0].startsWith('#')) continue;
    if (s[0] === 'LUT_3D_SIZE') size = parseInt(s[1], 10);
    else if (s[0] === 'DOMAIN_MIN') dmin = s.slice(1, 4).map(Number);
    else if (s[0] === 'DOMAIN_MAX') dmax = s.slice(1, 4).map(Number);
    else if (s.length === 3 && /^[-\d.]/.test(s[0])) v.push(+s[0], +s[1], +s[2]);
  }
  if (!size || v.length !== size * size * size * 3) throw new Error('올바른 3D .cube 파일이 아닙니다 (LUT_3D_SIZE 와 줄 수가 맞지 않음)');
  const data = new Float32Array(v);
  if (dmin.some((x) => x !== 0) || dmax.some((x) => x !== 1))
    for (let i = 0; i < data.length; i++) { const c = i % 3; data[i] = (data[i] - dmin[c]) / (dmax[c] - dmin[c]); }
  return { size, data };
}

/** RGBA Uint8ClampedArray 에 LUT 를 삼선형 보간으로 입힌다. strength 0~1 (원본과 섞기) */
export function applyLutToData(px, lut, strength = 1) {
  const n = lut.size, L = lut.data, k = (n - 1) / 255, n2 = n * n;
  for (let p = 0; p < px.length; p += 4) {
    const R = px[p], G = px[p + 1], B = px[p + 2];
    const x = R * k, y = G * k, z = B * k;
    const ri = Math.min(x | 0, n - 2), gi = Math.min(y | 0, n - 2), bi = Math.min(z | 0, n - 2);
    const fr = x - ri, fg = y - gi, fb = z - bi;
    const base = (bi * n2 + gi * n + ri) * 3;
    for (let c = 0; c < 3; c++) {
      const i000 = base + c, i100 = i000 + 3, i010 = i000 + n * 3, i110 = i010 + 3;
      const i001 = i000 + n2 * 3, i101 = i001 + 3, i011 = i001 + n * 3, i111 = i011 + 3;
      const c00 = L[i000] + (L[i100] - L[i000]) * fr, c10 = L[i010] + (L[i110] - L[i010]) * fr;
      const c01 = L[i001] + (L[i101] - L[i001]) * fr, c11 = L[i011] + (L[i111] - L[i011]) * fr;
      const c0 = c00 + (c10 - c00) * fg, c1 = c01 + (c11 - c01) * fg;
      const v = (c0 + (c1 - c0) * fb) * 255;
      const orig = c === 0 ? R : c === 1 ? G : B;
      px[p + c] = strength >= 1 ? v : orig + (v - orig) * strength; // Uint8ClampedArray 가 반올림
    }
  }
}

// ── 비포/애프터 짝 찾기 (파이썬판 find_pairs 와 같은 규칙) ──
const ROLE = { before: 0, '비포': 0, '원본': 0, after: 1, '애프터': 1, '보정': 1 };
export function findPairs(files) {
  const pairs = {};
  for (const f of files) {
    const stem = f.name.replace(/\.[^.]+$/, '');
    const m = stem.match(/^(.*?)[\s_\-.]*\d?(before|after|비포|애프터|원본|보정)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), role = ROLE[m[2].toLowerCase()];
    (pairs[key] ||= [null, null])[role] = f;
  }
  return Object.entries(pairs).filter(([, v]) => v[0] && v[1]).map(([key, [before, after]]) => ({ key, before, after }));
}
