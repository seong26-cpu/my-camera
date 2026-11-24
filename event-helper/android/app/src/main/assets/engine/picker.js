/* 응모 도우미 — 버튼 톡 지정 (사이트 페이지에 주입)
 * 다음 한 번의 톡을 '가로채서' 그 버튼을 기억만 함 (누른 동작은 사이트에 전달하지 않음).
 * 설정: window.__EH_PICK_MODE = 'target'(참여 버튼) | 'nav'(이동할 메뉴)
 * 보고: EHBridge.report({type:'picked', mode, selector, text})
 */
(function () {
  'use strict';
  if (window.__EH_PICKING) return;
  window.__EH_PICKING = true;
  var mode = window.__EH_PICK_MODE || 'target';
  var CLICKABLE = 'button, a, [role=button], input[type=button], input[type=submit], input[type=image], [onclick], label';

  function report(r) {
    r.type = 'picked'; r.mode = mode;
    try { if (window.EHBridge) window.EHBridge.report(JSON.stringify(r)); } catch (e) {}
    (window.__EH_PICKS = window.__EH_PICKS || []).push(r);
  }
  function label(el) {
    return String(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 30);
  }
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'); }
  /** 다시 찾을 수 있는 짧은 주소(CSS selector) 만들기. 자동 생성된 듯한 id/class(숫자 많음)는 피함 */
  function stable(name) { return name && !/\d{3,}/.test(name) && name.length < 40; }
  function selectorFor(el) {
    if (el.id && stable(el.id) && document.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
    var parts = [], n = el;
    for (var depth = 0; n && n.nodeType === 1 && n !== document.body && depth < 5; depth++) {
      var part = n.tagName.toLowerCase();
      if (n.id && stable(n.id)) { parts.unshift('#' + esc(n.id) + ' > ' + part); break; }
      var cls = Array.prototype.filter.call(n.classList || [], stable).slice(0, 2);
      if (cls.length) part += '.' + cls.map(esc).join('.');
      var p = n.parentElement;
      if (p) {
        var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === n.tagName; });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      var sel = parts.join(' > ');
      try { if (document.querySelectorAll(sel).length === 1 && document.querySelector(sel) === el) return sel; } catch (e) {}
      n = p;
    }
    var full = parts.join(' > ');
    try { return document.querySelector(full) === el ? full : ''; } catch (e) { return ''; }
  }

  var box = document.createElement('div');
  box.setAttribute('data-eh', 'tip');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px dashed #2962ff;background:rgba(41,98,255,.12);display:none;';
  var tip = document.createElement('div');
  tip.setAttribute('data-eh', 'tip');
  tip.textContent = mode === 'nav' ? '🎯 들어갈 메뉴를 톡 하세요' : '🎯 참여(출석·응모) 버튼을 톡 하세요';
  tip.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;background:#2962ff;color:#fff;' +
    'font:bold 15px sans-serif;padding:10px 16px;border-radius:24px;pointer-events:none;';
  document.body.appendChild(box); document.body.appendChild(tip);

  var picked = null;
  function pick(e) {
    var t = e.target && e.target.closest ? (e.target.closest(CLICKABLE) || e.target) : null;
    if (!t || t.getAttribute('data-eh')) return null;
    var r = t.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    return t;
  }
  function block(e) { e.stopPropagation(); e.stopImmediatePropagation(); }
  function onDown(e) { picked = pick(e) || picked; block(e); }
  function onClick(e) {
    e.preventDefault(); block(e);
    var el = pick(e) || picked;
    if (!el) return;
    finish();
    report({ selector: selectorFor(el), text: label(el), tag: el.tagName.toLowerCase() });
  }
  var evs = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'];
  function finish() {
    evs.forEach(function (n) { document.removeEventListener(n, n.indexOf('down') >= 0 || n === 'touchstart' ? onDown : block, true); });
    document.removeEventListener('click', onClick, true);
    setTimeout(function () { box.remove(); tip.remove(); window.__EH_PICKING = false; }, 800);
  }
  evs.forEach(function (n) { document.addEventListener(n, n.indexOf('down') >= 0 || n === 'touchstart' ? onDown : block, { capture: true, passive: true }); });
  document.addEventListener('click', onClick, true);
  window.__EH_PICK_CANCEL = function () { finish(); };
})();
