// ② 글자 추출 — 사진 속 글씨를 텍스트로 (여러 장 가능)
import { h, toast, progress, segmented, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, downloadBlob, baseName, stamp, tick } from '../core/img.js';
import { recognize, prepareForOcr, endWorker } from '../core/ocr.js';
import { history } from '../core/store.js';

const O = { lang: 'kor+eng', enhance: true };
let outEl, results = [];

export function leave() { endWorker(); }

export async function render(root) {
  results = [];
  outEl = h('div');
  root.append(
    pageHeader('글자 추출', '문서·간판·메모 사진 → 복사 가능한 글'),
    h('div', { class: 'card' },
      pickButtons(run, { label: '사진 고르기' }),
      h('h2', {}, '언어'),
      segmented([['kor+eng', '한글+영어'], ['kor', '한글만'], ['eng', '영어만']], O.lang, (v) => (O.lang = v)),
      h('label', { class: 'row small', style: { marginTop: '10px' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => (O.enhance = e.target.checked) }), '흑백·대비 강화해서 읽기 (보통 더 정확)'),
      h('div', { class: 'note', style: { marginTop: '10px' } },
        h('b', {}, '잘 읽히게 찍는 법: '), '글씨가 화면에 꽉 차게, 정면에서, 그림자 없이. 손글씨·기울어진 글씨는 정확도가 떨어져요. 처음 한 번은 한글 데이터(약 5MB)를 내려받아요.')),
    outEl);
}

async function run(files) {
  const p = progress('글자 읽는 중', { cancellable: true });
  try {
    for (let i = 0; i < files.length; i++) {
      if (p.cancelled) break;
      const f = files[i];
      p.set(i / files.length, `${i + 1}/${files.length} · ${f.name}`);
      const bmp = await loadBitmap(f);
      const c = prepareForOcr(bmp, O.enhance); bmp.close?.();
      const r = await recognize(c, O.lang, (m) => {
        if (m.status === 'recognizing text') p.set((i + m.progress) / files.length, `${i + 1}/${files.length} · 읽는 중 ${Math.round(m.progress * 100)}%`);
        else if (m.status) p.set(null, m.status.includes('load') ? '엔진·언어 데이터 준비 중 (처음 한 번)' : m.status);
      });
      results.push({ name: f.name, ...r, thumb: toCanvas(c, 240).toDataURL('image/jpeg', 0.6) });
      await tick();
    }
  } catch (e) { toast(errorText(e), 5000); console.error(e); }
  finally { p.done(); }
  draw();
  if (results.length) {
    const all = joined();
    history.add('글자', `글자_${stamp()}.txt`, new Blob([all], { type: 'text/plain' }), results[0].thumb).catch(() => {});
  }
}

function joined() {
  return results.map((r) => (results.length > 1 ? `[${r.name}]\n` : '') + r.text).join('\n\n');
}

function draw() {
  outEl.replaceChildren();
  if (!results.length) return;
  results.forEach((r, i) => {
    const ta = h('textarea', { class: 'ocrtext', 'aria-label': r.name + ' 결과' });
    ta.value = r.text || '(읽은 글자가 없어요. 더 가까이 정면에서 찍어 보세요)';
    ta.addEventListener('input', () => (r.text = ta.value));
    outEl.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('img', { src: r.thumb, alt: '', style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' } }),
        h('div', { class: 'grow' }, h('b', {}, r.name), h('div', { class: 'muted small' }, `믿음 정도 ${r.confidence}%` + (r.confidence < 60 ? ' — 낮아요, 다시 찍으면 좋아져요' : '')))),
      ta,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => copy(r.text) }, '📋 복사'),
        h('button', { class: 'btn ghost sm', onclick: () => downloadBlob(new Blob([r.text], { type: 'text/plain' }), `${baseName(r.name)}.txt`) }, 'TXT 저장'),
        h('button', { class: 'btn danger sm', onclick: () => { results.splice(i, 1); draw(); } }, '지우기'))));
  });
  if (results.length > 1) outEl.append(h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: () => copy(joined()) }, '📋 전체 복사'),
    h('button', { class: 'btn ghost', onclick: () => downloadBlob(new Blob([joined()], { type: 'text/plain' }), `글자모음_${stamp()}.txt`) }, '전체 TXT 저장')));
}

async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('복사했어요'); }
  catch { toast('복사가 막혀 있어요. 글을 길게 눌러 직접 복사해 주세요'); }
}
