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
    mailTest: () => setTimeout(() => window.onMailTest({ ok: false, error: '(미리보기) 폰 앱에서만 발송돼요' }), 300),
    mailStatus: () => '{}', sendSummaryNow: () => false,
    startQueue: (ids, mode) => { window.__queue = { ids: JSON.parse(ids), mode }; toast(`(미리보기) ${mode === 'login' ? '로그인 몰아서' : '연속 응모'} ${JSON.parse(ids).length}건`); return true; },
    shareFile: (name, mime, content) => { window.__shared = { name, mime, content }; return true; },
    pickBackup: () => {}, replaceLogs: (j) => s('logs', j),
    getProfile: () => g('profile', '{}'), saveProfile: (j) => s('profile', j), clearProfile: () => s('profile', '{}'),
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
  APP_ONLY: ['앱 전용', 'warn'],
};
const DONE = new Set(['SUCCESS', 'ALREADY_DONE', 'CLOSED', 'USER_SKIPPED']);

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parse = (t, d) => { try { return JSON.parse(t); } catch (e) { return d; } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let recipes = [], logs = [], settings = {}, editingId = null, catFilter = '';
const PRESETS = window.PRESETS || [];

/** 자동 보조 상태: on(약관 확인함) / lock(약관 제한) / off(미확인) */
function assistState(r) {
  if (r.tosStatus === 'restricted') return 'lock';
  return r.tosChecked ? 'on' : 'off';
}
const GROUP_LABEL = { 'CJ ONE': 'CJ ONE 계열', 'L.POINT': '롯데 L.POINT 계열' };
/** 여는 방식 표시: 연결 앱 / 브라우저 */
function openBadge(r) {
  if (r.appPackage) return `<span class="badge warn">📱 ${esc(r.appLabel || '앱')}</span>`;
  if (r.useBrowser) return '<span class="badge warn">🌐 브라우저</span>';
  return '';
}
function groupBadge(r) { return r.group ? `<span class="badge ok">👥 ${esc(GROUP_LABEL[r.group] || r.group)}</span>` : ''; }
function assistBadge(r) {
  const st = assistState(r);
  if (st === 'lock') return '<span class="badge bad">🔒 바로가기만</span>';
  if (st === 'on') return '<span class="badge ok">🤖 자동 보조</span>';
  return '<span class="badge">약관 미확인</span>';
}
function importPresets() {
  const have = new Set(recipes.map((r) => r.id));
  let n = 0;
  PRESETS.forEach((p) => { if (!have.has(p.id)) { recipes.push(Object.assign({}, p)); n++; } });
  saveRecipes();
  return n;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function load() {
  recipes = parse(A.getRecipes(), []);
  // 예전에 불러온 추천 이벤트에도 그룹(통합회원) 정보 채우기
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  recipes.forEach((r) => { if (r.preset && byId[r.id] && byId[r.id].group && !r.group) r.group = byId[r.id].group; });
  logs = parse(A.getLogs(), []);
  settings = parse(A.getSettings(), {});
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
const isExternal = (r) => !!(r.appPackage || r.useBrowser || r.deepUrl || /^package:/.test(r.url || ''));
/** ▶ 연속 응모 순서: ① 로그인된 웹 ② 선착순(오픈 시각 순) ③ 앱/브라우저 ④ 로그인 필요 — 오늘 아직 안 한 것만 */
function sortQueue(list, logsArr, today) {
  const doneToday = (id) => logsArr.some((l) => l.date === today && l.recipeId === id && DONE.has(l.code));
  const rank = (r) => (r.needLogin ? 3 : isExternal(r) ? 2 : r.openTime ? 1 : 0);
  return list.filter((r) => activeToday(r, today) && !doneToday(r.id))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || (rank(a.r) === 1 ? (a.r.openTime || '').localeCompare(b.r.openTime || '') : 0) || a.i - b.i)
    .map((x) => x.r.id);
}
/** 🔑 로그인 몰아서 하기 대상: 켜진 웹 이벤트 중 로그인 필요 표시가 있거나 아직 로그인 확인 안 한 곳 (🔒 제한·앱 이벤트 제외) */
function loginTargets(list) {
  return list.filter((r) => r.enabled !== false && !isExternal(r) && /^https?:/.test(r.url) && (r.needLogin || !r.loginOk))
    .sort((a, b) => (b.needLogin ? 1 : 0) - (a.needLogin ? 1 : 0)).map((r) => r.id);
}
function startQueue() {
  const ids = sortQueue(recipes, logs, A.today());
  if (!ids.length) { toast('오늘 남은 응모가 없어요 🎉'); return; }
  A.startQueue(JSON.stringify(ids), 'queue');
}
window.startQueueFromApp = () => { load(); startQueue(); };
let queueSummary = null;
window.onQueueDone = (sum) => { queueSummary = sum; renderAll(); window.scrollTo(0, 0); };
function summaryCard() {
  if (!queueSummary) return '';
  const t = A.today();
  const ids = queueSummary.ids || [];
  const res = ids.map((id) => ({ r: recipes.find((x) => x.id === id), l: todayResult(id, t) })).filter((x) => x.r);
  const ok = res.filter((x) => x.l && DONE.has(x.l.code)).length;
  const fail = res.filter((x) => x.l && !DONE.has(x.l.code)).length;
  const login = (queueSummary.loginList || []).map((id) => recipes.find((x) => x.id === id)).filter(Boolean);
  const title = queueSummary.mode === 'login' ? '🔑 로그인 몰아서 하기 끝' : '▶ 연속 응모 끝';
  return `<div class="card" style="border-color:var(--green)"><div class="name">${title}</div>
    <div class="meta">완료 ${ok} · 실패 ${fail} · 남음 ${res.length - ok - fail}</div>
    ${login.length ? `<div class="meta">🔑 로그인 필요: ${login.map((r) => esc(r.name)).join(', ')}</div>
      <button class="ghost wide" id="loginRound">🔑 이 ${login.length}곳 로그인 몰아서 하기</button>` : ''}
    <button class="ghost wide" id="closeSummary">닫기</button></div>`;
}

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
  const left = sortQueue(recipes, logs, t).length;
  const needLogin = loginTargets(recipes).length;
  el.innerHTML = summaryCard() + (left ? `<button class="primary wide" id="startQueue" style="font-size:18px;padding:16px">▶ 오늘 ${left}건 연속 응모</button>
    <p class="help">한 번 누르면 차례대로 열려요. 강조된 버튼만 누르면 결과를 자동 판정해 <b>2초 뒤 다음 사이트</b>로 넘어갑니다.
    로그인 화면이 나오면 건너뛰고 끝에 모아서 알려 드려요. (제출·캡차·약관 동의는 직접)</p>` : `<p class="help">🎉 오늘 응모를 모두 마쳤어요.</p>`) +
    (needLogin ? `<button class="ghost wide" id="loginRound">🔑 로그인 몰아서 하기 (${needLogin}곳 · 처음 한 번)</button>
    <p class="help">켜진 사이트를 연달아 열어요. 로그인 칸에서 <b>삼성 패스·구글 비밀번호 자동완성</b>을 쓰면 빨라요. 한 번 로그인하면 유지돼요.</p>` : '') +
    list.map((r) => {
      const l = todayResult(r.id, t);
      const done = l && DONE.has(l.code);
      return `<div class="card ${done ? 'done' : ''}">
        <div class="row">
          <div class="grow">
            <div class="name">${esc(r.name)}</div>
            <div class="meta"><span class="badge">${esc(TYPES[r.type] || r.type)}</span>${r.openTime ? `<span class="badge warn">${esc(r.openTime)} 오픈</span>` : ''}${openBadge(r)}${assistBadge(r)}${l ? codeBadge(l.code) : ''}</div>
            ${r.quizAnswer ? `<div class="meta">오늘 정답: <b>${esc(r.quizAnswer)}</b> (열면 자동 복사)</div>` : ''}
          </div>
          <button class="${done ? 'ghost' : 'primary'}" data-open="${esc(r.id)}">${done ? '다시 열기' : (r.appPackage || r.useBrowser ? '앱으로 ▶' : '응모하기 ▶')}</button>
        </div>
      </div>`;
    }).join('');
}

/* ---------- 이벤트 관리 ---------- */
function renderManage() {
  const el = $('#tab-manage');
  if (editingId !== null) { renderEditor(el); return; }
  const notImported = PRESETS.filter((p) => !recipes.some((r) => r.id === p.id)).length;
  const cats = [...new Set(recipes.map((r) => r.cat).filter(Boolean))];
  const shown = recipes.filter((r) => !catFilter || r.cat === catFilter || ('g:' + r.group) === catFilter);
  const onCount = recipes.filter((r) => r.enabled !== false).length;
  el.innerHTML = `<button class="primary wide" id="addBtn">＋ 이벤트 직접 추가</button>
    ${notImported ? `<button class="ghost wide" id="presetBtn">⭐ 추천 이벤트 ${notImported}곳 불러오기 (꺼진 상태로 추가)</button>` : ''}
    <p class="help">추천 목록은 2026-11-24 검색으로 주소를 확인한 곳입니다. 진행 여부·약관은 직접 확인 후 <b>켜기</b>를 누르세요.
    🔒 표시는 이벤트 유의사항에 '비정상적 방법·프로그램 참여 금지' 문구가 확인되어 자동 보조 없이 바로가기만 합니다.</p>
    <h2>등록된 이벤트 (${recipes.length}, 켜짐 ${onCount})</h2>
    <p class="help">👥 <b>가입 팁</b>: <b>CJ ONE</b>(올리브영·CGV·온스타일·더마켓 등)과 <b>L.POINT</b>(롯데 계열) 통합회원부터 만들면 가입 횟수가 줄어요.
    아래 분야에서 '👥 … 계열'을 고르면 모아 볼 수 있어요. (사이트마다 'CJ ONE/L.POINT로 로그인' 버튼이 있는지 확인)</p>
    ${cats.length ? `<select id="catSel"><option value="">전체 분야</option>${Object.keys(GROUP_LABEL).map((g) => `<option value="g:${esc(g)}" ${('g:' + g) === catFilter ? 'selected' : ''}>👥 ${esc(GROUP_LABEL[g])}</option>`).join('')}${cats.map((c) => `<option ${c === catFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}` +
    (shown.length ? shown.map((r) => `<div class="card ${r.enabled === false ? 'done' : ''}">
      <div class="row">
        <div class="grow">
          <div class="name">${esc(r.name)}</div>
          ${r.autoOff && r.enabled === false ? `<div class="meta"><span class="badge bad">🧹 자동 꺼짐 · ${esc(r.autoOff.reason || '')} (${esc(r.autoOff.date || '')})</span></div>` : ''}
          <div class="meta">${r.cat ? `<span class="badge">${esc(r.cat)}</span>` : ''}${groupBadge(r)}${r.needLogin ? '<span class="badge warn">🔑 로그인 필요</span>' : ''}<span class="badge">${esc(TYPES[r.type] || r.type)}</span>${openBadge(r)}${assistBadge(r)}${r.start || r.end ? `${esc(r.start || '…')} ~ ${esc(r.end || '…')}` : ''}</div>
          ${(r.flags || []).map((f) => `<div class="meta">· ${esc(f)}</div>`).join('')}
        </div>
        <div>
          <button class="${r.enabled === false ? 'primary' : 'ghost'}" data-toggle="${esc(r.id)}">${r.enabled === false ? '켜기' : '끄기'}</button><br>
          <button class="ghost" data-edit="${esc(r.id)}" style="margin-top:6px">수정</button>
        </div>
      </div></div>`).join('') : `<div class="empty">아직 없어요. [⭐ 추천 이벤트 불러오기] 또는 [＋ 직접 추가]를 눌러 주세요.</div>`) +
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
    <label>찾을 버튼 글자 <small>(쉼표로 구분 · 비우면 유형별 기본값)</small></label>
    <input type="text" id="f-keywords" value="${esc(Array.isArray(r.keywords) ? r.keywords.join(', ') : (r.keywords || ''))}" placeholder="예: 출석체크하기, 응모하기">
    <label>이동할 메뉴 글자 <small>(이벤트 모음에서 찾아 들어갈 메뉴 · 비우면 기본값)</small></label>
    <input type="text" id="f-nav" value="${esc(Array.isArray(r.navKeywords) ? r.navKeywords.join(', ') : (r.navKeywords || ''))}" placeholder="예: 출석체크">
    ${r.targetText || r.targetSelector || r.navText ? `<p class="help">🎯 직접 지정함: ${r.targetText ? `참여 버튼 "<b>${esc(r.targetText)}</b>"` : ''} ${r.navText ? `· 메뉴 "<b>${esc(r.navText)}</b>"` : ''}
      <button class="ghost" id="clearPick" style="padding:4px 10px;font-size:13px">지정 지우기</button></p>`
      : `<p class="help">🎯 버튼을 못 찾으면: 응모 화면 아래 <b>[🎯 버튼 지정]</b> → 사이트의 버튼을 톡 하면 기억해요 (약관 확인 사이트만).</p>`}
    <h2>📱 여는 방식</h2>
    <p class="help">${r.appPackage ? `<b>📱 ${esc(r.appLabel || r.appPackage)}</b> 앱으로 바로 열어요.` : r.useBrowser ? '<b>🌐 기본 브라우저</b>로 바로 열어요 (구글 로그인 사이트 등).' : '앱 안 브라우저로 열어요 (로그인 유지 · 자동 보조 가능).'}
    ${r.appPackage || r.useBrowser || r.deepUrl ? '<button class="ghost" id="unlinkApp" style="padding:4px 10px;font-size:13px">앱 안 브라우저로 되돌리기</button>' : '앱 전용 이벤트면 응모 화면 [⋯ 더보기 → 📱 앱으로 열기]에서 앱을 고르세요.'}</p>
    <p class="help">${r.deepUrl ? `🔗 <b>앱 화면 주소 저장됨</b> (공유로 가져옴) — 앱이 지원하면 이벤트 화면으로 바로 열려요.` : `🔗 <b>앱 메인만 열리면</b>: 쇼핑몰 앱에서 이벤트 화면 → <b>[공유] → 응모 도우미</b> → 이 이벤트 선택. 그 화면 주소로 바로 열어요 (앱마다 지원 여부 다름).`}</p>
    <label>앱 안 경로 메모 <small>(앱으로 열 때 알림에 표시 · 예: 마이 → 출석체크)</small></label>
    <input type="text" id="f-path" value="${esc(r.appPath || '')}" placeholder="예: 혜택 탭 → 출석체크">
    <label>메모</label><input type="text" id="f-note" value="${esc(r.note || '')}">
    ${(r.flags || []).map((f) => `<p class="help">· ${esc(f)}</p>`).join('')}
    ${r.source ? `<p class="help">주소 출처: 웹 검색 (${esc(r.checkedAt || '')})</p>` : ''}
    <label class="check"><input type="checkbox" id="f-enabled" ${r.enabled !== false ? 'checked' : ''}> 사용 (끄면 오늘 목록에 안 나옴)</label>
    ${r.tosStatus === 'restricted'
      ? `<p class="help">🔒 <b>자동 보조 사용 불가</b> — ${esc(r.tosNote || '')}<br>그래서 이 사이트는 알림·바로가기·기록만 합니다.</p>`
      : `<label class="check"><input type="checkbox" id="f-tos" ${r.tosChecked ? 'checked' : ''}>
      이 사이트 이용약관·이벤트 유의사항을 읽었고, 매크로·자동화 프로그램 금지 조항이 없음을 확인함 <small>(체크해야 자동 보조가 켜짐)</small></label>`}
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
    openTime: v('#f-open'), quizAnswer: v('#f-answer'), note: v('#f-note'), appPath: v('#f-path'),
    keywords: v('#f-keywords'), navKeywords: v('#f-nav'),
    enabled: $('#f-enabled').checked,
    tosChecked: old.tosStatus === 'restricted' ? false : !!($('#f-tos') && $('#f-tos').checked),
  });
  const i = recipes.findIndex((x) => x.id === r.id);
  if (i >= 0) recipes[i] = r; else recipes.push(r);
  saveRecipes(); editingId = null; toast('저장했어요'); renderAll();
}

/* ---------- 내보내기 · 백업 ---------- */
/** CSV 칸: 쉼표·따옴표·줄바꿈은 따옴표로 감싸고, =,+,-,@ 로 시작하면(엑셀 수식 주입 방지) 앞에 ' 를 붙임 */
function csvCell(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function buildCsv(list) {
  const rows = [['날짜시간', '이벤트', '결과', '결과코드', '내용']];
  list.forEach((l) => rows.push([(l.ts || l.date || '').replace('T', ' ').slice(0, 19), l.name, (CODES[l.code] || [l.code])[0], l.code, l.message || '']));
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM: 엑셀에서 한글 안 깨짐
}
function buildBackup() {
  const st = Object.assign({}, settings);
  delete st.mailToken; // 비밀번호는 백업에 넣지 않음 (복원 후 다시 입력)
  return JSON.stringify({ app: 'event-helper', format: 1, exportedAt: new Date().toISOString(), version: A.appVersion(),
    recipes, settings: st, logs }, null, 1);
}
/** 백업 파일 검사 → 문제 있으면 이유 문자열, 괜찮으면 null */
function checkBackup(b) {
  if (!b || b.app !== 'event-helper' || b.format !== 1) return '응모 도우미 백업 파일이 아니에요';
  if (!Array.isArray(b.recipes) || b.recipes.some((r) => !r || typeof r.id !== 'string' || !r.name || !r.url)) return '이벤트 목록 형식이 올바르지 않아요';
  if (!Array.isArray(b.logs) || (b.settings && typeof b.settings !== 'object')) return '기록 형식이 올바르지 않아요';
  return null;
}
window.onBackupPicked = (text) => {
  const b = parse(text, null);
  const err = checkBackup(b);
  if (err) { toast('❌ ' + err); return; }
  if (!confirm(`백업(${(b.exportedAt || '').slice(0, 10)})으로 바꿀까요?\n이벤트 ${b.recipes.length}개 · 기록 ${b.logs.length}건\n지금 목록과 기록은 백업 내용으로 바뀝니다.`)) return;
  const keep = { mailToken: settings.mailToken }; // 이 폰의 메일 비밀번호는 유지
  A.saveRecipes(JSON.stringify(b.recipes));
  A.replaceLogs(JSON.stringify(b.logs));
  A.saveSettings(JSON.stringify(Object.assign({}, b.settings || {}, keep.mailToken ? keep : {})));
  toast('복원했어요'); renderAll();
};
const stamp = () => A.today().replace(/-/g, '');

/* ---------- 기록 ---------- */
function renderLogs() {
  const el = $('#tab-logs');
  const recent = logs.slice(-200).reverse();
  if (!recent.length) { el.innerHTML = `<div class="empty">아직 기록이 없어요.</div>`; return; }
  const fails = recent.filter((l) => !DONE.has(l.code)).length;
  el.innerHTML = `<button class="ghost wide" id="exportCsv">📤 기록 CSV 내보내기 (엑셀)</button>
    <p class="help">최근 ${recent.length}건 · 실패/확인 필요 ${fails}건</p>` +
    recent.map((l) => `<div class="card">
      <div class="row"><div class="grow"><div class="name">${esc(l.name)}</div>
      <div class="meta">${esc((l.ts || l.date || '').replace('T', ' ').slice(0, 16))} ${codeBadge(l.code)}</div>
      ${l.message ? `<div class="meta">${esc(l.message)}</div>` : ''}</div></div></div>`).join('');
}

/* ---------- 설정 ---------- */
function mailStatusText() {
  const st = parse(A.mailStatus ? A.mailStatus() : '{}', {});
  if (!st.at) return '아직 보낸 메일이 없어요.';
  return `마지막 발송 ${esc(st.at)} · ${st.ok ? '✅ 성공' : '❌ 실패: ' + esc(st.error)}`;
}
window.onMailTest = (r) => {
  toast(r.ok ? '✅ 시험 메일을 보냈어요. Gmail을 확인하세요' : '❌ ' + r.error);
  const el = $('#mailStatus'); if (el) el.innerHTML = r.ok ? '✅ 연결 성공' : '❌ ' + esc(r.error);
};
function renderSettings() {
  const el = $('#tab-settings');
  const profile = parse(A.getProfile ? A.getProfile() : '{}', {});
  el.innerHTML = `<label>아침 알림 시각</label>
    <input type="time" id="s-morning" value="${esc(settings.morningTime || '08:00')}">
    <p class="help">매일 이 시각에 "오늘 응모할 이벤트 N건" 알림이 옵니다. 폰 절전 때문에 몇 분 늦을 수 있어요.</p>
    <button class="ghost wide" id="testNotify">알림 시험</button>
    <h2>📧 Gmail 알림</h2>
    <p class="help">내 구글 계정의 Apps Script가 <b>나에게만</b> 메일을 보냅니다 (Gmail 비밀번호는 앱에 저장하지 않음).
    설치 방법: 저장소 <b>event-helper/apps-script/Mailer.gs</b> 맨 위 설명 (약 5분).</p>
    <label>웹 앱 URL <small>(https://script.google.com/macros/s/…/exec)</small></label>
    <input type="url" id="m-url" value="${esc(settings.mailUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">
    <label>앱 연결 비밀번호 <small>(setup 실행 로그의 APP_TOKEN)</small></label>
    <input type="password" id="m-token" value="${esc(settings.mailToken || '')}" autocomplete="off">
    <label class="check"><input type="checkbox" id="m-fail" ${settings.mailFail !== false ? 'checked' : ''}> 실패하면 바로 메일 (네트워크 오류·버튼 못 찾음·로그인 필요 등)</label>
    <label class="check"><input type="checkbox" id="m-summary" ${settings.mailSummary !== false ? 'checked' : ''}> 매일 저녁 하루 요약 메일 (완료·실패·아직 안 한 것)</label>
    <label>요약 받을 시각</label><input type="time" id="m-time" value="${esc(settings.summaryTime || '21:00')}">
    <button class="primary wide" id="saveSettings">설정 저장</button>
    <button class="ghost wide" id="mailTest">📧 연결 시험 (시험 메일 보내기)</button>
    <button class="ghost wide" id="summaryNow">📋 오늘 요약 지금 보내기</button>
    <p class="help" id="mailStatus">${mailStatusText()}</p>
    <p class="help">알림 권한: <b>${A.notifyAllowed() ? '켜짐' : '꺼짐 — 폰 설정 > 앱 > 응모 도우미 > 알림'}</b></p>
    <h2>내 프로필 <small style="font-weight:400">(폼 입력형 응모 자동 채움)</small></h2>
    <p class="help">폰의 안드로이드 키 저장소로 <b>암호화</b>해 이 폰에만 저장합니다. '폼 입력' 유형 + 약관 확인한 사이트의 <b>빈 칸에만</b> 넣고,
    개인정보 동의 체크·제출은 직접 하셔야 해요. 쓰기 싫으면 비워 두세요.</p>
    <label>이름</label><input type="text" id="p-name" value="${esc(profile.name || '')}" autocomplete="off">
    <label>휴대폰 <small>(숫자만)</small></label><input type="text" inputmode="numeric" id="p-phone" value="${esc(profile.phone || '')}" autocomplete="off">
    <label>이메일</label><input type="text" inputmode="email" id="p-email" value="${esc(profile.email || '')}" autocomplete="off">
    <label>생년월일 <small>(예: 19800101)</small></label><input type="text" inputmode="numeric" id="p-birth" value="${esc(profile.birth || '')}" autocomplete="off">
    <button class="primary wide" id="saveProfile">프로필 암호화 저장</button>
    <button class="danger wide" id="clearProfile">프로필 지우기</button>
    <h2>💾 백업 · 복원</h2>
    <p class="help">폰을 바꾸거나 앱을 다시 설치하기 전에 백업 파일을 만들어 드라이브·메일에 보관하세요.
    (이벤트·기록·설정 포함 / <b>메일 비밀번호와 프로필은 보안상 제외</b> → 복원 후 다시 입력)</p>
    <button class="ghost wide" id="exportBackup">💾 전체 백업 파일 만들기</button>
    <button class="ghost wide" id="importBackup">📂 백업 파일 불러오기</button>
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
  if (b.dataset.toggle) {
    const r = recipes.find((x) => x.id === b.dataset.toggle);
    if (r) { r.enabled = r.enabled === false; if (r.enabled) delete r.autoOff; saveRecipes(); toast(r.enabled ? `켰어요 — 오늘 목록에 나와요` : '껐어요'); renderAll(); }
    return;
  }
  switch (b.id) {
    case 'addBtn': editingId = ''; renderManage(); break;
    case 'startQueue': startQueue(); break;
    case 'loginRound': {
      const ids = queueSummary && queueSummary.loginList && queueSummary.loginList.length ? queueSummary.loginList : loginTargets(recipes);
      if (!ids.length) { toast('로그인할 사이트가 없어요'); break; }
      queueSummary = null; A.startQueue(JSON.stringify(ids), 'login'); break;
    }
    case 'closeSummary': queueSummary = null; renderToday(); break;
    case 'presetBtn': { const n = importPresets(); toast(`${n}곳 추가 (꺼진 상태). 원하는 곳만 [켜기] 하세요`); renderAll(); break; }
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
      const url = $('#m-url').value.trim();
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { toast('URL은 https://script.google.com/macros/s/…/exec 형식이어야 해요'); break; }
      settings = Object.assign({}, settings, {
        morningTime: m, mailUrl: url, mailToken: $('#m-token').value.trim(),
        mailFail: $('#m-fail').checked, mailSummary: $('#m-summary').checked, summaryTime: $('#m-time').value || '21:00',
      });
      toast(A.saveSettings(JSON.stringify(settings)) ? `저장했어요 (아침 ${m} 알림${url ? ` · 요약 메일 ${settings.summaryTime}` : ''})` : '저장 실패');
      break;
    }
    case 'mailTest':
      if (!settings.mailUrl || !settings.mailToken) { toast('URL과 비밀번호를 넣고 [설정 저장]부터 눌러 주세요'); break; }
      toast('보내는 중…'); A.mailTest(); break;
    case 'summaryNow':
      toast(A.sendSummaryNow() ? '요약 메일을 보내는 중이에요 (인터넷 연결 시 발송)' : 'Gmail 연결 설정이 먼저 필요해요'); break;
    case 'testNotify': A.testNotify(); break;
    case 'exportCsv':
      toast(A.shareFile(`응모기록_${stamp()}.csv`, 'text/csv', buildCsv(logs)) ? `기록 ${logs.length}건 — 저장할 곳을 고르세요` : '내보내기 실패'); break;
    case 'exportBackup':
      toast(A.shareFile(`응모도우미_백업_${stamp()}.json`, 'application/json', buildBackup()) ? '백업 파일 — 드라이브나 메일에 저장하세요' : '백업 실패'); break;
    case 'importBackup': A.pickBackup(); break;
    case 'saveProfile': {
      const pv = (id) => $(id).value.trim();
      const pf = { name: pv('#p-name'), phone: pv('#p-phone').replace(/\D/g, ''), email: pv('#p-email'), birth: pv('#p-birth').replace(/\D/g, '') };
      if (pf.phone && !/^01\d{8,9}$/.test(pf.phone)) { toast('휴대폰 번호를 확인해 주세요 (예: 01012345678)'); break; }
      if (pf.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pf.email)) { toast('이메일 형식을 확인해 주세요'); break; }
      if (pf.birth && !/^(19|20)\d{6}$/.test(pf.birth)) { toast('생년월일은 8자리 숫자로 (예: 19800101)'); break; }
      toast(A.saveProfile(JSON.stringify(pf)) ? '암호화해서 저장했어요' : '저장 실패'); renderSettings(); break;
    }
    case 'clearProfile':
      if (confirm('프로필을 지울까요?')) { A.clearProfile(); toast('지웠어요'); renderSettings(); }
      break;
    case 'unlinkApp': {
      const r = recipes.find((x) => x.id === editingId);
      if (r) { delete r.appPackage; delete r.appLabel; delete r.useBrowser; delete r.appOnly; delete r.deepUrl; saveRecipes(); toast('앱 안 브라우저로 되돌렸어요'); renderManage(); }
      break;
    }
    case 'clearPick': {
      const r = recipes.find((x) => x.id === editingId);
      if (r) { delete r.targetSelector; delete r.targetText; delete r.navText; saveRecipes(); toast('지정을 지웠어요'); renderManage(); }
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'catSel') { catFilter = e.target.value; renderManage(); }
});

window.onAppResume = renderAll;
window.onAppBack = () => {
  if (editingId !== null) { editingId = null; renderManage(); return true; }
  return false;
};
renderAll();
