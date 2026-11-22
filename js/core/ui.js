// 화면 공통 조각
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

/** 진행 표시창. set(비율0~1, 글) / done() */
export function progress(title, { cancellable = false } = {}) {
  let cancelled = false;
  const bar = h('div', { class: 'pbar-fill' });
  const msg = h('div', { class: 'pmsg' }, '준비 중…');
  const btn = cancellable ? h('button', { class: 'btn ghost', onclick: () => { cancelled = true; btn.disabled = true; btn.textContent = '멈추는 중…'; } }, '멈추기') : null;
  const box = h('div', { class: 'overlay' }, h('div', { class: 'pbox' }, h('div', { class: 'ptitle' }, title), h('div', { class: 'pbar' }, bar), msg, btn));
  document.body.appendChild(box);
  return {
    set(r, text) { if (r != null) bar.style.width = Math.round(Math.max(0, Math.min(1, r)) * 100) + '%'; if (text) msg.textContent = text; },
    get cancelled() { return cancelled; },
    done() { box.remove(); },
  };
}

export function confirmBox(text, ok = '확인', cancel = '취소') {
  return new Promise((res) => {
    const close = (v) => { box.remove(); res(v); };
    const box = h('div', { class: 'overlay' }, h('div', { class: 'pbox' },
      h('div', { class: 'pmsg', style: { whiteSpace: 'pre-line' } }, text),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, cancel), h('button', { class: 'btn', onclick: () => close(true) }, ok))));
    document.body.appendChild(box);
  });
}

/** 슬라이더 한 줄 */
export function slider({ label, min = -100, max = 100, step = 1, value = 0, unit = '', onInput, onChange }) {
  const val = h('span', { class: 'sval' }, value + unit);
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => { val.textContent = input.value + unit; onInput?.(+input.value); });
  input.addEventListener('change', () => onChange?.(+input.value));
  input.addEventListener('dblclick', () => { input.value = 0; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
  const row = h('label', { class: 'slider' }, h('span', { class: 'slabel' }, label), input, val);
  row.setValue = (v) => { input.value = v; val.textContent = v + unit; };
  return row;
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  const set = (v) => { value = v; [...wrap.children].forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); };
  for (const [v, label] of options) wrap.append(h('button', { type: 'button', 'data-v': v, onclick: () => { set(v); onChange(v); } }, label));
  set(value);
  wrap.set = set;
  return wrap;
}

export function pageHeader(title, sub) {
  return h('header', { class: 'phead' },
    h('a', { href: '#/', class: 'back', 'aria-label': '처음 화면' }, '‹'),
    h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'sub' }, sub) : null),
    h('a', { href: '#/help', class: 'helpbtn', 'aria-label': '도움말' }, '?'));
}

/** 사진 고르기 버튼 두 개(갤러리 / 카메라) */
export function pickButtons(onFiles, { multiple = true, accept = 'image/*', label = '사진 고르기' } = {}) {
  const pick = async (capture) => {
    const { pickFiles } = await import('./img.js');
    const files = await pickFiles({ multiple: capture ? false : multiple, accept, capture });
    if (files.length) onFiles(files);
  };
  return h('div', { class: 'row' },
    h('button', { class: 'btn big', onclick: () => pick(false) }, '🖼 ', label),
    accept.includes('image') ? h('button', { class: 'btn big ghost', onclick: () => pick(true) }, '📷 찍기') : null);
}

export function errorText(e) {
  const m = e?.message || String(e);
  if (/fetch|network|Failed to load|NetworkError/i.test(m)) return '인터넷 연결이 필요합니다(처음 한 번 모델을 내려받는 중). 와이파이에서 다시 해 보세요.';
  if (/memory|allocation|OOM/i.test(m)) return '폰 메모리가 부족합니다. 사진 크기를 줄이거나 다른 앱을 닫고 다시 해 보세요.';
  return m;
}
