// 폰 안 저장소(IndexedDB) — 내 스타일 표, 최근 결과물. 외부로 나가지 않음
const DB = 'my-camera', VER = 1;
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('luts')) d.createObjectStore('luts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('history')) d.createObjectStore('history', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const luts = {
  all: () => tx('luts', 'readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.created - x.created)),
  add: (name, cube, meta = {}) => { const v = { id: uid(), name, cube, created: Date.now(), ...meta }; return tx('luts', 'readwrite', (s) => s.put(v)).then(() => v); },
  put: (v) => tx('luts', 'readwrite', (s) => s.put(v)),
  del: (id) => tx('luts', 'readwrite', (s) => s.delete(id)),
};

const HISTORY_MAX = 40;
export const history = {
  all: () => tx('history', 'readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.created - x.created)),
  async add(kind, name, blob, thumb) {
    const v = { id: uid(), kind, name, blob, thumb, created: Date.now() };
    await tx('history', 'readwrite', (s) => s.put(v));
    const all = await history.all();
    for (const old of all.slice(HISTORY_MAX)) await history.del(old.id);
    return v;
  },
  del: (id) => tx('history', 'readwrite', (s) => s.delete(id)),
  clear: () => tx('history', 'readwrite', (s) => s.clear()),
};

// 설정(폰 안 localStorage)
export const settings = {
  get(k, d = '') { try { return localStorage.getItem('mc.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mc.' + k, v); } catch {} },
};

/** 작은 미리보기 이미지(dataURL) */
export function thumbOf(canvas, side = 240) {
  const s = Math.min(1, side / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s)); c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
