// AI 모델 자동 준비 — 와이파이에 연결돼 있으면 처음 실행 뒤 조용히 내려받아 폰에 저장
// 사용자는 아무것도 누를 필요 없음. 데이터 요금이 걱정되면 보관함·설정에서 끌 수 있음
import { settings } from './store.js';

export const ITEMS = [
  { key: 'ocr', name: '글자 추출(한글·영어)', size: '약 20MB' },
  { key: 'seg', name: '물체 선택', size: '약 수 MB' },
  { key: 'lama', name: '빈자리 고품질 채움', size: '약 37MB 이하' },
  { key: 'clip', name: '인테리어 스타일 판별', size: '약 154MB' },
];

export const isDone = (k) => settings.get('prep.' + k) === 'ok';
const mark = (k) => settings.set('prep.' + k, 'ok');

export function onWifi() {
  const c = navigator.connection;
  if (!c) return false;
  if (c.saveData) return false;
  return c.type === 'wifi' || c.type === 'ethernet';
}

async function prepareOne(key, onProgress) {
  if (key === 'ocr') { const o = await import('./ocr.js'); await o.getWorker('kor+eng', (m) => m.progress != null && onProgress?.(m.progress)); await o.endWorker(); }
  else if (key === 'seg') { const s = await import('./seg.js'); await s.loadSegmenter(); }
  else if (key === 'lama') { const i = await import('./inpaint.js'); await i.prefetchLama((r) => onProgress?.(r)); }
  else if (key === 'clip') { const c = await import('./clip.js'); await c.loadClip((r) => onProgress?.(r)); }
  mark(key);
}

let running = null;
/** 전부(또는 남은 것) 준비. onEach(key, 상태, 비율) */
export function prepareAll(onEach, keys = ITEMS.map((i) => i.key)) {
  running ||= (async () => {
    for (const k of keys) {
      if (isDone(k)) { onEach?.(k, 'ok', 1); continue; }
      onEach?.(k, 'run', 0);
      try { await prepareOne(k, (r) => onEach?.(k, 'run', r)); onEach?.(k, 'ok', 1); }
      catch (e) { onEach?.(k, 'fail', 0, e); }
    }
  })().finally(() => { running = null; });
  return running;
}

export function autoPrepare() {
  if (settings.get('autoPrep', 'on') === 'off') return;
  if (!onWifi()) return;
  if (ITEMS.every((i) => isDone(i.key))) return;
  prepareAll();
}
