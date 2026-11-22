// ⑥ 보관함·설정 — 내 스타일 표, 최근 결과, 인테리어 사진 연결(Apps Script), 저장 공간
import { h, toast, pageHeader, confirmBox } from '../core/ui.js';
import { downloadBlob, shareOrDownload, fmtBytes } from '../core/img.js';
import { luts, history, settings } from '../core/store.js';

let root;
export async function render(r) {
  root = r;
  root.append(pageHeader('보관함·설정', '모두 이 폰 안에만 저장돼요'));
  const prepBox = h('div', { class: 'card' }), lutBox = h('div', { class: 'card' }), histBox = h('div', { class: 'card' }), setBox = h('details', { class: 'card' }), diskBox = h('div', { class: 'card' });
  root.append(prepBox, lutBox, histBox, diskBox, setBox);
  drawPrep(prepBox); await drawLuts(lutBox); await drawHistory(histBox); drawSettings(setBox); drawDisk(diskBox);
}

async function drawLuts(box) {
  const all = await luts.all();
  box.replaceChildren(h('h2', { style: { marginTop: 0 } }, '🎨 내 스타일 표'),
    all.length ? h('ul', { class: 'list' }, all.map((l) => h('li', {},
      h('div', { class: 'grow' }, h('b', {}, l.name), h('div', { class: 'muted small' }, new Date(l.created).toLocaleDateString() + (l.pairs ? ` · ${l.pairs}쌍` : '') + (l.bright != null ? ` · 밝기 ${Math.round(l.bright * 100)}%` : ''))),
      h('button', { class: 'btn ghost sm', onclick: async () => { const n = prompt('새 이름', l.name); if (n) { l.name = n; await luts.put(l); drawLuts(box); } } }, '이름'),
      h('button', { class: 'btn ghost sm', onclick: () => downloadBlob(new Blob([l.cube], { type: 'text/plain' }), `${l.name}.cube`) }, '.cube'),
      h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmBox(`"${l.name}"을 지울까요?`, '지우기')) { await luts.del(l.id); drawLuts(box); } } }, '삭제'))))
      : h('p', { class: 'muted' }, '아직 없어요. [보정 → 내 스타일 만들기]에서 만들 수 있어요.'),
    h('p', { class: 'muted small' }, '.cube 는 표준 형식이라 라이트룸·포토샵·다빈치에서도 불러올 수 있어요.'));
}

async function drawHistory(box) {
  const all = await history.all();
  box.replaceChildren(h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, '🕘 최근 결과'),
    all.length ? h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmBox('최근 결과를 모두 지울까요? (이미 저장한 사진은 그대로)', '모두 지우기')) { await history.clear(); drawHistory(box); } } }, '모두 지우기') : null),
    all.length ? h('div', { class: 'thumbs', style: { marginTop: '10px' } }, all.map((it) => h('figure', {},
      it.thumb ? h('img', { src: it.thumb, alt: it.name, onclick: () => shareOrDownload([{ blob: it.blob, name: it.name }]) }) : h('div', { class: 'th', style: { aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: '10px', background: 'var(--soft)' }, onclick: () => shareOrDownload([{ blob: it.blob, name: it.name }]) }, '📄'),
      h('figcaption', {}, `${it.kind} · ${it.name}`))))
      : h('p', { class: 'muted' }, '아직 없어요'),
    h('p', { class: 'muted small' }, '사진을 누르면 다시 저장·공유할 수 있어요. 최근 40개까지만 보관해요.'));
}

async function drawPrep(box) {
  const P = await import('../core/prepare.js');
  const rows = {};
  const label = (k) => (P.isDone(k) ? '✅ 준비됨' : '⏳ 아직');
  const list = h('ul', { class: 'list' }, P.ITEMS.map((it) => h('li', {}, h('span', { class: 'grow' }, it.name, h('span', { class: 'muted small' }, ' · ' + it.size)), rows[it.key] = h('span', { class: 'small' }, label(it.key)))));
  const auto = h('input', { type: 'checkbox', checked: settings.get('autoPrep', 'on') !== 'off', onchange: (e) => settings.set('autoPrep', e.target.checked ? 'on' : 'off') });
  const btn = h('button', { class: 'btn', onclick: async () => {
    btn.disabled = true; btn.textContent = '준비 중… (이 화면을 나가도 계속돼요)';
    await P.prepareAll((k, st, r) => { rows[k].textContent = st === 'ok' ? '✅ 준비됨' : st === 'fail' ? '⚠️ 실패(인터넷 확인)' : `⬇ ${Math.round((r || 0) * 100)}%`; });
    btn.disabled = false; btn.textContent = '🔄 남은 것 다시 준비';
  } }, '⬇ 지금 한 번에 준비 (와이파이 권장)');
  box.replaceChildren(h('h2', { style: { marginTop: 0 } }, '🤖 AI 모델 준비 상태'),
    h('p', { class: 'small' }, '와이파이에 연결되면 앱이 알아서 내려받아요. 누를 것 없어요.'),
    list, h('label', { class: 'row small', style: { margin: '8px 0' } }, auto, '와이파이에서 자동으로 준비하기'), btn);
}

function drawSettings(box) {
  const url = h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: settings.get('gasUrl') });
  const tok = h('input', { type: 'password', placeholder: '앱 연결 비밀번호', value: settings.get('gasToken') });
  const state = h('p', { class: 'small' });
  const save = () => { settings.set('gasUrl', url.value.trim()); settings.set('gasToken', tok.value.trim()); };
  box.replaceChildren(h('summary', {}, '⚙️ (선택·고급) Pexels 사진도 쓰기'),
    h('p', { class: 'small' }, '안 해도 됩니다. 인테리어 실제 사진은 이미 자동(Openverse)으로 나와요. Pexels 사진을 더 보고 싶을 때만 Apps Script를 연결하세요.'),
    h('label', { class: 'field' }, h('span', {}, '웹 앱 URL'), url),
    h('label', { class: 'field' }, h('span', {}, '앱 연결 비밀번호'), tok),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => {
        save();
        if (!url.value) { state.textContent = '저장했어요 (연결 안 함)'; return; }
        state.textContent = '시험 중…';
        try {
          const j = await (await fetch(`${url.value.trim()}?action=ping&token=${encodeURIComponent(tok.value.trim())}`)).json();
          state.textContent = j.ok ? (j.pexels ? '✅ 연결됐어요' : '⚠️ 연결은 됐지만 Pexels 키가 없어요 (setup 다시 실행)') : j.error === 'unauthorized' ? '❌ 비밀번호가 달라요' : '❌ ' + (j.error || '알 수 없는 오류');
        } catch { state.textContent = '❌ 연결 실패 — URL이 /exec 로 끝나는지, 배포 액세스가 "모든 사용자"인지 확인'; }
      } }, '저장 + 연결 시험'),
      h('a', { class: 'btn ghost', href: '#/help', style: { textDecoration: 'none' } }, '연결 방법 보기')),
    state);
}

async function drawDisk(box) {
  let usage = '';
  try { const e = await navigator.storage.estimate(); usage = `${fmtBytes(e.usage || 0)} 사용 중`; } catch {}
  box.replaceChildren(h('h2', { style: { marginTop: 0 } }, '💾 저장 공간'),
    h('p', { class: 'small' }, usage || '확인할 수 없어요'),
    h('p', { class: 'muted small' }, 'AI 모델(물체 선택·고품질 채움·스타일 판별·글자)은 처음 한 번 내려받아 폰에 저장돼요. 공간이 부족하면 지울 수 있고, 다음에 쓸 때 다시 내려받아요.'),
    h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmBox('내려받은 AI 모델을 지울까요?\n(내 스타일·최근 결과는 그대로)', '지우기'))) return;
      for (const k of await caches.keys()) if (!k.startsWith('mc-app')) await caches.delete(k);
      for (const k of Object.keys(localStorage)) if (k.startsWith('mc.prep.')) localStorage.removeItem(k);
      toast('모델 저장분을 지웠어요'); drawDisk(box);
    } }, 'AI 모델 저장분 지우기'));
}
