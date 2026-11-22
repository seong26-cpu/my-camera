// ④ 일괄 처리 — 여러 장을 고르고 같은 작업을 한 번에 (편남 v8.0 '넣는곳 폴더 감시'를 폰용으로 바꾼 것)
import { h, toast, progress, slider, segmented, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, canvasToBlob, keepExif, shareOrDownload, zipBlobs, downloadBlob, baseName, stamp, tick, mimeOf, extOf, ctx2d, fmtBytes } from '../core/img.js';
import { DEFAULT_ADJ, processCanvas, computeAuto } from '../core/adjust.js';
import { parseCube } from '../core/lut.js';
import { luts as lutStore, history, thumbOf } from '../core/store.js';

const O = { auto: true, lutId: '', lutStrength: 100, maxSide: 0, fmt: 'jpg', quality: 90, ocr: false, rename: '', keepExif: true };
let files = [], countEl, thumbsEl;

export async function render(root) {
  files = [];
  countEl = h('b', {}, '0장');
  thumbsEl = h('div', { class: 'thumbs' });
  const lutSel = h('select', { 'aria-label': '내 스타일', onchange: (e) => (O.lutId = e.target.value) }, h('option', { value: '' }, '사용 안 함'));
  for (const l of await lutStore.all()) lutSel.append(h('option', { value: l.id }, l.name));
  const qWrap = h('div', {}, slider({ label: '화질', min: 40, max: 100, value: O.quality, unit: '%', onInput: (v) => (O.quality = v) }));

  root.append(
    pageHeader('일괄 처리', '여러 장에 같은 작업을 한 번에'),
    h('div', { class: 'card' }, pickButtons((fs) => { files.push(...fs); drawList(); }, { label: '사진 여러 장 고르기' }),
      h('p', {}, '고른 사진: ', countEl, h('button', { class: 'btn ghost sm', style: { marginLeft: '8px' }, onclick: () => { files = []; drawList(); } }, '비우기')), thumbsEl),
    h('div', { class: 'card stack' },
      h('h2', { style: { marginTop: 0 } }, '할 일 고르기'),
      check('✨ 자동 보정 (밝기 범위·화이트밸런스)', 'auto'),
      h('label', { class: 'field' }, h('span', {}, '🎨 내 스타일 입히기'), lutSel),
      slider({ label: '스타일 강도', min: 0, max: 100, value: 100, unit: '%', onInput: (v) => (O.lutStrength = v) }),
      h('label', { class: 'field' }, h('span', {}, '📐 크기'),
        h('select', { onchange: (e) => (O.maxSide = +e.target.value) }, [[0, '원래 크기'], [2560, '긴 변 2560'], [1920, '긴 변 1920'], [1280, '긴 변 1280'], [1080, '긴 변 1080']].map(([v, t]) => h('option', { value: v }, t)))),
      h('div', {}, h('span', { class: 'muted small' }, '💾 저장 형식'), segmented([['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], O.fmt, (v) => { O.fmt = v; qWrap.classList.toggle('hidden', v === 'png'); })),
      qWrap,
      check('🔤 글자도 추출해서 TXT로 같이 저장', 'ocr'),
      check('📷 촬영 정보(EXIF) 유지 (JPG)', 'keepExif'),
      h('label', { class: 'field' }, h('span', {}, '🏷 이름 바꾸기 (비우면 원래 이름_보정)'), h('input', { type: 'text', placeholder: '예: 제주여행 → 제주여행_001.jpg', oninput: (e) => (O.rename = e.target.value.trim()) }))),
    h('div', { class: 'note' }, '원본은 그대로 두고 결과만 새 파일로 만들어요. 10장 이하는 공유(갤러리 저장), 그보다 많으면 ZIP 파일로 받아요.'),
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn', onclick: run }, '▶ 한 번에 처리하기')));
  drawList();
}

function check(label, key) {
  return h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!O[key], onchange: (e) => (O[key] = e.target.checked) }), label);
}

function drawList() {
  countEl.textContent = `${files.length}장`;
  thumbsEl.replaceChildren();
  files.slice(0, 24).forEach((f) => {
    const img = h('img', { alt: f.name });
    thumbsEl.append(h('figure', {}, img, h('figcaption', {}, f.name)));
    loadBitmap(f).then((b) => { img.src = toCanvas(b, 160).toDataURL('image/jpeg', 0.6); b.close?.(); }).catch(() => {});
  });
  if (files.length > 24) thumbsEl.append(h('p', { class: 'muted small' }, `…외 ${files.length - 24}장`));
}

async function run() {
  if (!files.length) { toast('먼저 사진을 고르세요'); return; }
  let lut = null;
  if (O.lutId) { const l = (await lutStore.all()).find((x) => x.id === O.lutId); if (l) lut = parseCube(l.cube); }
  let ocr = null;
  if (O.ocr) ocr = await import('../core/ocr.js');
  const p = progress(`${files.length}장 처리 중`, { cancellable: true });
  const outs = [], t0 = Date.now(), fails = [];
  const pad = String(files.length).length < 3 ? 3 : String(files.length).length;
  try {
    for (let i = 0; i < files.length; i++) {
      if (p.cancelled) break;
      const f = files[i];
      p.set(i / files.length, `${i + 1}/${files.length} · ${f.name}`);
      try {
        const bmp = await loadBitmap(f);
        const c = toCanvas(bmp, O.maxSide); bmp.close?.();
        const adj = { ...DEFAULT_ADJ };
        if (O.auto) adj.auto = computeAuto(ctx2d(c).getImageData(0, 0, c.width, c.height));
        if (O.auto || lut) await processCanvas(c, adj, lut, O.lutStrength / 100);
        const mime = mimeOf(O.fmt);
        let blob = await canvasToBlob(c, mime, O.quality / 100);
        if (blob.type === 'image/jpeg' && O.keepExif) blob = await keepExif(f, blob);
        const stem = O.rename ? `${O.rename}_${String(i + 1).padStart(pad, '0')}` : `${baseName(f.name)}_보정`;
        outs.push({ blob, name: `${stem}.${extOf(blob.type)}`, thumb: thumbOf(c) });
        if (ocr) {
          p.set(null, `${i + 1}/${files.length} · 글자 읽는 중`);
          const r = await ocr.recognize(ocr.prepareForOcr(c, true));
          outs.push({ blob: new Blob([r.text], { type: 'text/plain' }), name: `${stem}.txt` });
        }
      } catch (e) { fails.push(f.name); console.error(e); }
      await tick();
    }
    if (ocr) await ocr.endWorker();
    if (!outs.length) { p.done(); toast('처리된 사진이 없어요'); return; }
    for (const o of outs.filter((x) => x.thumb).slice(0, 20)) await history.add('일괄', o.name, o.blob, o.thumb);
    const sec = Math.round((Date.now() - t0) / 1000), size = outs.reduce((a, o) => a + o.blob.size, 0);
    const msg = `완료 ${outs.filter((o) => o.thumb).length}장 · ${sec}초 · ${fmtBytes(size)}` + (fails.length ? ` · 실패 ${fails.length}장` : '');
    if (outs.length <= 10) { p.done(); await shareOrDownload(outs); }
    else { p.set(1, 'ZIP으로 묶는 중…'); const z = await zipBlobs(outs, (r) => p.set(r / 100)); p.done(); downloadBlob(z, `일괄_${stamp()}.zip`); }
    toast(msg, 5000);
  } catch (e) { p.done(); toast(errorText(e)); }
}
