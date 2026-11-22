// 글자 추출 엔진 — Tesseract.js (폰 안에서 처리, 무료)
// 처음 한 번 엔진·한글 데이터(약 5MB)를 내려받고, 이후엔 폰에 저장된 것을 씀
import { toCanvas, makeCanvas, ctx2d } from './img.js';

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
let worker = null, workerLang = '', logCb = null;

export async function getWorker(lang = 'kor+eng', onLog) {
  logCb = onLog;
  if (worker && workerLang === lang) return worker;
  if (worker) { await worker.terminate(); worker = null; }
  const T = await import(TESS);
  const createWorker = T.createWorker || T.default?.createWorker;
  worker = await createWorker(lang, 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
    logger: (m) => logCb?.(m),
  });
  workerLang = lang;
  return worker;
}

export async function endWorker() { if (worker) { await worker.terminate(); worker = null; workerLang = ''; } }

/** 글씨가 잘 읽히도록: 작은 사진은 키우고, 흑백 + 대비 강화 */
export function prepareForOcr(bitmapOrCanvas, enhance = true) {
  const w = bitmapOrCanvas.width, h = bitmapOrCanvas.height;
  const long = Math.max(w, h);
  const s = long < 1600 ? Math.min(2.5, 1600 / long) : long > 3200 ? 3200 / long : 1;
  const c = makeCanvas(w * s, h * s), g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmapOrCanvas, 0, 0, c.width, c.height);
  if (!enhance) return c;
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = l; hist[l]++; }
  const n = d.length / 4; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.01) { hi = v; break; } }
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(id, 0, 0);
  return c;
}

/** 사진 → 글자. 반환 { text, confidence } */
export async function recognize(canvas, lang = 'kor+eng', onLog) {
  const w = await getWorker(lang, onLog);
  const { data } = await w.recognize(canvas);
  // 한글 사이에 끼는 불필요한 띄어쓰기 줄이기 (Tesseract 한글 특성)
  // "안 녕 하 세 요"처럼 한 글자씩 4개 이상 띄어진 경우만 붙임
  const text = (data.text || '')
    .replace(/(?<![가-힣])(?:[가-힣] ){3,}[가-힣](?![가-힣])/g, (m) => m.replace(/ /g, ''))
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text, confidence: Math.round(data.confidence || 0) };
}

export { toCanvas };
