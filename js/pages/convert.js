// ⑤ 파일 변환 — JPG·PNG·WebP 서로 바꾸기, 크기·용량 줄이기, HEIC→JPG, 사진→PDF, PDF→사진
import { h, toast, progress, slider, segmented, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, canvasToBlob, keepExif, shareOrDownload, zipBlobs, downloadBlob, baseName, stamp, isPdf, fmtBytes, mimeOf, extOf, tick, makeCanvas, ctx2d } from '../core/img.js';
import { history, thumbOf } from '../core/store.js';

const O = { fmt: 'jpg', quality: 90, maxSide: 0, keepMeta: true, pdfPage: 'fit' };
let files = [], listEl;

export async function render(root) {
  files = [];
  listEl = h('ul', { class: 'list' });
  const q = slider({ label: '화질', min: 40, max: 100, value: O.quality, unit: '%', onInput: (v) => (O.quality = v) });
  const qWrap = h('div', {}, q, h('p', { class: 'muted small' }, '낮출수록 용량이 작아져요. 보통 80~90%면 눈으로 차이가 거의 없어요.'));
  const fmt = segmented([['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP'], ['pdf', 'PDF로 합치기']], O.fmt, (v) => { O.fmt = v; qWrap.classList.toggle('hidden', v === 'png'); });
  const size = h('select', { 'aria-label': '크기', onchange: (e) => (O.maxSide = +e.target.value) },
    [[0, '원래 크기'], [4096, '긴 변 4096'], [2560, '긴 변 2560'], [1920, '긴 변 1920'], [1280, '긴 변 1280 (메신저용)'], [1080, '긴 변 1080 (SNS용)'], [720, '긴 변 720']].map(([v, t]) => h('option', { value: v }, t)));
  const meta = h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (O.keepMeta = e.target.checked) }), '촬영 정보(EXIF) 유지 (JPG만)');

  root.append(
    pageHeader('파일 변환', '사진·PDF를 원하는 형식으로'),
    h('div', { class: 'card' }, pickButtons(add, { accept: 'image/*,.heic,.heif,application/pdf', label: '파일 고르기' }),
      h('p', { class: 'muted small' }, 'PDF를 고르면 쪽마다 사진으로 바꿔요. HEIC(아이폰 사진)도 됩니다.'), listEl),
    h('div', { class: 'card' },
      h('h2', { style: { marginTop: 0 } }, '바꿀 형식'), fmt, qWrap,
      h('label', { class: 'field' }, h('span', {}, '크기'), size), meta),
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn ghost', onclick: () => { files = []; draw(); } }, '비우기'), h('button', { class: 'btn', onclick: run }, '🔁 변환하기')));
  draw();
}

function add(fs) { files.push(...fs); draw(); }
function draw() {
  listEl.replaceChildren(...files.map((f, i) => h('li', {},
    h('span', { class: 'grow' }, f.name), h('span', { class: 'muted small' }, fmtBytes(f.size)),
    h('button', { class: 'btn ghost sm', onclick: () => { files.splice(i, 1); draw(); } }, '빼기'))));
  if (!files.length) listEl.append(h('li', { class: 'muted' }, '아직 고른 파일이 없어요'));
}

let pdfjs = null;
async function pdfLib() {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** PDF → 쪽별 캔버스 */
async function* pdfPages(file) {
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 2 });
    const c = makeCanvas(vp.width, vp.height);
    const g = ctx2d(c); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, canvas: c, viewport: vp }).promise;
    yield { canvas: c, n, total: doc.numPages };
  }
}

async function* sources() {
  for (const f of files) {
    if (isPdf(f)) { for await (const p of pdfPages(f)) yield { file: f, canvas: p.canvas, name: `${baseName(f.name)}_p${p.n}` }; }
    else { const b = await loadBitmap(f); const c = toCanvas(b, O.maxSide); b.close?.(); yield { file: f, canvas: c, name: baseName(f.name) }; }
  }
}

async function run() {
  if (!files.length) { toast('먼저 파일을 고르세요'); return; }
  const p = progress('변환 중', { cancellable: true });
  const outs = [];
  try {
    if (O.fmt === 'pdf') {
      if (!window.jspdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = './vendor/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
      const { jsPDF } = window.jspdf;
      let doc = null, i = 0;
      for await (const s of sources()) {
        if (p.cancelled) break;
        p.set(i / files.length, `${++i}번째 넣는 중`);
        const c = O.maxSide ? toCanvas(s.canvas, O.maxSide) : s.canvas;
        const orient = c.width > c.height ? 'l' : 'p';
        const W = 210, H = 297; // A4 (mm)
        const pw = orient === 'l' ? H : W, ph = orient === 'l' ? W : H;
        if (!doc) doc = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' }); else doc.addPage('a4', orient);
        const sc = Math.min((pw - 10) / c.width, (ph - 10) / c.height);
        const dw = c.width * sc, dh = c.height * sc;
        doc.addImage(c.toDataURL('image/jpeg', O.quality / 100), 'JPEG', (pw - dw) / 2, (ph - dh) / 2, dw, dh);
        await tick();
      }
      if (doc) outs.push({ blob: doc.output('blob'), name: `사진모음_${stamp()}.pdf` });
    } else {
      const mime = mimeOf(O.fmt);
      let i = 0;
      for await (const s of sources()) {
        if (p.cancelled) break;
        p.set(i / Math.max(1, files.length), `${++i}번째 · ${s.name}`);
        let blob = await canvasToBlob(s.canvas, mime, O.quality / 100);
        if (mime === 'image/jpeg' && O.keepMeta && !isPdf(s.file)) blob = await keepExif(s.file, blob);
        if (mime === 'image/webp' && blob.type !== 'image/webp') toast('이 폰은 WebP 저장을 지원하지 않아 PNG로 저장했어요');
        outs.push({ blob, name: `${s.name}.${extOf(blob.type)}`, thumb: thumbOf(s.canvas) });
        await tick();
      }
    }
    if (!outs.length) { p.done(); return; }
    const before = files.reduce((a, f) => a + f.size, 0), after = outs.reduce((a, o) => a + o.blob.size, 0);
    for (const o of outs.slice(0, 20)) await history.add('변환', o.name, o.blob, o.thumb || '');
    if (outs.length <= 10) { p.done(); await shareOrDownload(outs); }
    else { p.set(1, '묶는 중…'); const z = await zipBlobs(outs); p.done(); downloadBlob(z, `변환_${stamp()}.zip`); }
    toast(`${outs.length}개 완료 · ${fmtBytes(before)} → ${fmtBytes(after)}`, 4000);
  } catch (e) { p.done(); toast(errorText(e)); console.error(e); }
}
