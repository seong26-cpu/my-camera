/* 응모 도우미 — 앱 화면 (오늘 / 이벤트 / 기록 / 설정)
 * window.Android = 안드로이드 앱이 넣어주는 연결 통로.
 * PC 브라우저에서 열면 localStorage 가짜 통로로 동작 (화면 시험용).
 */
'use strict';

const A = window.Android || (() => {
  const g = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const s = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} return true; };
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  return {
    getRecipes: () => g('recipes', '[]'), saveRecipes: (j) => s('recipes', j),
    getLogs: () => g('logs', '[]'),
    addLog: (j) => { const l = JSON.parse(g('logs', '[]')); l.push(JSON.parse(j)); return s('logs', JSON.stringify(l)); },
    getSettings: () => g('settings', '{}'), saveSettings: (j) => s('settings', j),
    today, appVersion: () => 'browser-preview', notifyAllowed: () => false,
    openSite: (id) => { window.__opened = id; toast('(미리보기) 응모 화면 열기: ' + id); },
    openExternal: (u) => window.open(u, '_blank'), testNotify: () => toast('(미리보기) 알림 시험'),
  };
})();

const TYPES = { attend: '출석·클릭', quiz: '퀴즈', form: '폼 입력', fcfs: '선착순' };
const CODES = {
  SUCCESS: ['성공', 'ok'], ALREADY_DONE: ['이미 참여', 'ok'], CLOSED: ['마감', 'warn'], USER_SKIPPED: ['건너뜀', ''],
  FAILED: ['실패', 'bad'], NETWORK_ERROR: ['네트워크 오류', 'bad'], TIMEOUT: ['시간 초과', 'bad'],
  LOGIN_REQUIRED: ['로그인 필요', 'warn'], CAPTCHA: ['캡차 대기', 'warn'], POPUP_BLOCKED: ['팝업 방해', 'bad'],
  SELECTOR_NOT_FOUND: ['버튼 못 찾음', 'bad'],
};
const DONE = new Set(['SUCCESS', 'ALREADY_DONE', 'CLOSED', 'USER_SKIPPED']);

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parse = (t, d) => { try { return JSON.parse(t); } catch (e) { return d; } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let recipes = [], logs = [], settings = {}, editingId = null;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function load() {
  recipes = parse(A.getRecipes(), []); logs = parse(A.getLogs(), []); settings = parse(A.getSettings(), {});
}
function saveRecipes() {
  if (!A.saveRecipes(JSON.stringify(recipes))) toast('저장 실패 — 다시 시도해 주세요');
}
function activeToday(r, t) {
  if (r.enabled === false) return false;
  if (r.start && t < r.start) return false;
  if (r.end && t > r.end) return false;
  return true;
}
function todayResult(id, t) {
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i];
    if (l.date !== t) break;
    if (l.recipeId === id) return l;
  }
  return null;
}
function codeBadge(code) {
  const [label, cls] = CODES[code] || [code, ''];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

/* ---------- 오늘 ---------- */
function renderToday() {
  const t = A.today();
  const list = recipes.filter((r) => activeToday(r, t))
    .sort((a, b) => (a.openTime || '99:99').localeCompare(b.openTime || '99:99'));
  const doneCount = list.filter((r) => { const l = todayResult(r.id, t); return l && DONE.has(l.code); }).length;
  $('#todaySummary').textContent = list.length ? `오늘 ${list.length}건 중 ${doneCount}건 완료` : '';
  const el = $('#tab-today');
  if (!list.length) {
    el.innerHTML = `<div class="empty">오늘 응모할 이벤트가 없어요.<br>아래 <b>🗂 이벤트</b> 탭에서 추가하세요.</div>`;
    return;
  }
  el.innerHTML = `<p class="help">[응모하기]를 누르면 사이트가 열립니다. 마지막 <b>제출·캡차·약관 동의는 직접</b> 눌러 주세요.</p>` +
    list.map((r) => {
      const l = todayResult(r.id, t);
      const done = l && DONE.has(l.code);
      return `<div class="card ${done ? 'done' : ''}">
        <div class="row">
          <div class="grow">
            <div class="name">${esc(r.name)}</div>
            <div class="meta"><span class="badge">${esc(TYPES[r.type] || r.type)}</span>${r.openTime ? `<span class="badge warn">${esc(r.openTime)} 오픈</span>` : ''}${l ? codeBadge(l.code) : ''}</div>
            ${r.quizAnswer ? `<div class="meta">오늘 정답: <b>${esc(r.quizAnswer)}</b> (열면 자동 복사)</div>` : ''}
          </div>
          <button class="${done ? 'ghost' : 'primary'}" data-open="${esc(r.id)}">${done ? '다시 열기' : '응모하기 ▶'}</button>
        </div>
      </div>`;
    }).join('');
}

/* ---------- 이벤트 관리 ---------- */
function renderManage() {
  const el = $('#tab-manage');
  if (editingId !== null) { renderEditor(el); return; }
  el.innerHTML = `<button class="primary wide" id="addBtn">＋ 이벤트 추가</button>
    <h2>등록된 이벤트 (${recipes.length})</h2>` +
    (recipes.length ? recipes.map((r) => `<div class="card">
      <div class="row">
        <div class="grow">
          <div class="name">${esc(r.name)} ${r.enabled === false ? '<span class="badge bad">꺼짐</span>' : ''}</div>
          <div class="meta"><span class="badge">${esc(TYPES[r.type] || r.type)}</span>${r.start || r.end ? `${esc(r.start || '…')} ~ ${esc(r.end || '…')}` : '매일'}</div>
          <div class="meta">${esc(r.url)}</div>
        </div>
        <button class="ghost" data-edit="${esc(r.id)}">수정</button>
      </div></div>`).join('') : `<div class="empty">아직 없어요. [＋ 이벤트 추가]를 눌러 주세요.</div>`) +
    `<h2>백업 · 복원</h2>
     <p class="help">아래 글자를 복사해 메모 앱 등에 보관하면, 폰을 바꿔도 붙여넣어 복원할 수 있어요.</p>
     <textarea id="backup">${esc(JSON.stringify(recipes, null, 1))}</textarea>
     <button class="ghost wide" id="restoreBtn">붙여넣은 내용으로 복원</button>`;
}

function renderEditor(el) {
  const r = recipes.find((x) => x.id === editingId) || { id: '', name: '', url: '', type: 'attend', enabled: true };
  el.innerHTML = `<h2>${r.id ? '이벤트 수정' : '이벤트 추가'}</h2>
    <label>이름</label><input type="text" id="f-name" value="${esc(r.name)}" placeholder="예: OO몰 매일 출석체크">
    <label>주소 <small>(사이트 주소 또는 앱 주소)</small></label>
    <input type="url" id="f-url" value="${esc(r.url)}" placeholder="https://...">
    <label>참여 방식</label>
    <select id="f-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <div class="two">
      <div><label>시작일 <small>(비우면 계속)</small></label><input type="date" id="f-start" value="${esc(r.start || '')}"></div>
      <div><label>종료일</label><input type="date" id="f-end" value="${esc(r.end || '')}"></div>
    </div>
    <label>오픈 시각 <small>(선착순만 · ${3}분 전 알림)</small></label>
    <input type="time" id="f-open" value="${esc(r.openTime || '')}">
    <label>오늘의 정답 <small>(퀴즈 · 열 때 자동 복사)</small></label>
    <input type="text" id="f-answer" value="${esc(r.quizAnswer || '')}">
    <label>메모</label><input type="text" id="f-note" value="${esc(r.note || '')}">
    <label class="check"><input type="checkbox" id="f-enabled" ${r.enabled !== false ? 'checked' : ''}> 사용 (끄면 오늘 목록에 안 나옴)</label>
    <label class="check"><input type="checkbox" id="f-tos" ${r.tosChecked ? 'checked' : ''}>
      이 사이트 이벤트 약관을 읽었고, 자동화 금지 조항이 없음을 확인함 <small>(2단계 자동 보조는 이 체크가 있어야 켜짐)</small></label>
    <button class="primary wide" id="saveBtn">저장</button>
    <button class="ghost wide" id="cancelBtn">취소</button>
    ${r.id ? `<button class="danger wide" id="delBtn">삭제</button>` : ''}`;
}

function saveEditor() {
  const v = (id) => $(id).value.trim();
  const name = v('#f-name'), url = v('#f-url');
  if (!name) { toast('이름을 넣어 주세요'); return; }
  if (!/^(https?:\/\/|intent:|[a-z][a-z0-9+.-]*:)/i.test(url)) { toast('주소는 https:// 로 시작해야 해요'); return; }
  const start = v('#f-start'), end = v('#f-end');
  if (start && end && end < start) { toast('종료일이 시작일보다 빨라요'); return; }
  const old = recipes.find((x) => x.id === editingId) || {};
  const r = Object.assign({}, old, {
    id: old.id || newId(), name, url, type: v('#f-type'), start, end,
    openTime: v('#f-open'), quizAnswer: v('#f-answer'), note: v('#f-note'),
    enabled: $('#f-enabled').checked, tosChecked: $('#f-tos').checked,
  });
  const i = recipes.findIndex((x) => x.id === r.id);
  if (i >= 0) recipes[i] = r; else recipes.push(r);
  saveRecipes(); editingId = null; toast('저장했어요'); renderAll();
}

/* ---------- 기록 ---------- */
function renderLogs() {
  const el = $('#tab-logs');
  const recent = logs.slice(-200).reverse();
  if (!recent.length) { el.innerHTML = `<div class="empty">아직 기록이 없어요.</div>`; return; }
  const fails = recent.filter((l) => !DONE.has(l.code)).length;
  el.innerHTML = `<p class="help">최근 ${recent.length}건 · 실패/확인 필요 ${fails}건</p>` +
    recent.map((l) => `<div class="card">
      <div class="row"><div class="grow"><div class="name">${esc(l.name)}</div>
      <div class="meta">${esc((l.ts || l.date || '').replace('T', ' ').slice(0, 16))} ${codeBadge(l.code)}</div>
      ${l.message ? `<div class="meta">${esc(l.message)}</div>` : ''}</div></div></div>`).join('');
}

/* ---------- 설정 ---------- */
function renderSettings() {
  const el = $('#tab-settings');
  el.innerHTML = `<label>아침 알림 시각</label>
    <input type="time" id="s-morning" value="${esc(settings.morningTime || '08:00')}">
    <p class="help">매일 이 시각에 "오늘 응모할 이벤트 N건" 알림이 옵니다. 폰 절전 때문에 몇 분 늦을 수 있어요.</p>
    <button class="primary wide" id="saveSettings">저장</button>
    <button class="ghost wide" id="testNotify">알림 시험</button>
    <p class="help">알림 권한: <b>${A.notifyAllowed() ? '켜짐' : '꺼짐 — 폰 설정 > 앱 > 응모 도우미 > 알림'}</b></p>
    <h2>안전 원칙</h2>
    <p class="help">· 최종 제출·캡차·약관 동의는 항상 직접 누릅니다.<br>
    · 캡차 자동 풀이, 여러 계정, 초 단위 연타 기능은 없습니다 (사이트 약관·계정 보호).<br>
    · 저장 내용(이벤트·기록)은 이 폰 안에만 있습니다.</p>
    <p class="help">버전 ${esc(A.appVersion())}</p>`;
}

function renderAll() { load(); renderToday(); renderManage(); renderLogs(); renderSettings(); }

/* ---------- 이벤트 연결 ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === 'tab-' + b.dataset.tab));
    window.scrollTo(0, 0); return;
  }
  if (b.dataset.open) { A.openSite(b.dataset.open); return; }
  if (b.dataset.edit) { editingId = b.dataset.edit; renderManage(); window.scrollTo(0, 0); return; }
  switch (b.id) {
    case 'addBtn': editingId = ''; renderManage(); break;
    case 'cancelBtn': editingId = null; renderManage(); break;
    case 'saveBtn': saveEditor(); break;
    case 'delBtn':
      if (confirm('이 이벤트를 삭제할까요? (기록은 남아요)')) {
        recipes = recipes.filter((x) => x.id !== editingId); saveRecipes(); editingId = null; renderAll();
      }
      break;
    case 'restoreBtn': {
      const arr = parse($('#backup').value, null);
      if (!Array.isArray(arr) || arr.some((x) => !x || !x.name || !x.url)) { toast('형식이 올바르지 않아요'); break; }
      if (!confirm(`${arr.length}건으로 바꿀까요? 지금 목록은 지워집니다.`)) break;
      recipes = arr.map((x) => Object.assign({ id: newId(), type: 'attend', enabled: true }, x));
      saveRecipes(); toast('복원했어요'); renderAll(); break;
    }
    case 'saveSettings': {
      const m = $('#s-morning').value || '08:00';
      settings = Object.assign({}, settings, { morningTime: m });
      toast(A.saveSettings(JSON.stringify(settings)) ? `매일 ${m} 알림으로 저장` : '저장 실패');
      break;
    }
    case 'testNotify': A.testNotify(); break;
  }
});

window.onAppResume = renderAll;
window.onAppBack = () => {
  if (editingId !== null) { editingId = null; renderManage(); return true; }
  return false;
};
renderAll();
