/* 응모 도우미 — 자동 보조 엔진 (사이트 페이지에 주입)
 * 하는 일: 팝업 닫기 → (퀴즈/폼) 값 입력 → 참여 버튼 찾아 '강조'만 → 사용자가 직접 누름 → 결과 문구 판정
 * 하지 않는 일: 참여·제출 버튼 자동 클릭, 캡차 풀이, 반복 연타, 봇 탐지 회피
 * 설정: window.__EH_CFG (안드로이드가 넣어줌) / 보고: window.EHBridge.report(json)
 */
(function () {
  'use strict';
  if (window.__EH && window.__EH.alive) return;
  var cfg = window.__EH_CFG || {};
  var P = cfg.patterns || {};
  var EH = (window.__EH = { alive: true, reports: [], target: null });

  var CLOSE_WORDS = ['닫기', '오늘 하루 보지 않기', '오늘 하루 열지 않기', '하루 동안 보지 않기', '하루동안 보지 않기',
    '오늘 그만 보기', '다시 보지 않기', '다시보지않기', '×', '✕', 'X', 'x', 'close', 'Close'];
  var FIND_TIMEOUT = cfg.findTimeoutMs || 15000;
  var ARM_MS = 20000;

  function report(type, code, msg) {
    var r = { type: type, code: code || '', msg: msg || '', url: location.href };
    EH.reports.push(r);
    try { if (window.EHBridge) window.EHBridge.report(JSON.stringify(r)); } catch (e) {}
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function has(text, list) {
    if (!text || !list) return '';
    for (var i = 0; i < list.length; i++) if (list[i] && text.indexOf(list[i]) >= 0) return list[i];
    return '';
  }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05;
  }
  function label(el) {
    return norm(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '');
  }
  /** 결과 문구 판정 (순서 중요: '이미 출석 완료' → 이미 참여) */
  function classify(text) {
    var m;
    if ((m = has(text, P.already))) return ['ALREADY_DONE', m];
    if ((m = has(text, P.closed))) return ['CLOSED', m];
    if ((m = has(text, P.login))) return ['LOGIN_REQUIRED', m];
    if ((m = has(text, P.captcha))) return ['CAPTCHA', m];
    if ((m = has(text, P.wrong))) return ['FAILED', m];
    if ((m = has(text, P.success))) return ['SUCCESS', m];
    return null;
  }
  EH.classify = classify;

  /* ---------- 팝업 닫기 (닫기 버튼만 누름) ---------- */
  function inOverlay(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (n.getAttribute('role') === 'dialog' || n.getAttribute('aria-modal') === 'true') return true;
      if ((s.position === 'fixed' || s.position === 'absolute') && (parseInt(s.zIndex, 10) || 0) >= 10) return true;
    }
    return false;
  }
  function isCloseButton(el) {
    var t = label(el);
    var aria = norm(el.getAttribute('aria-label'));
    var cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
    if (t.length <= 16 && CLOSE_WORDS.indexOf(t) >= 0) return true;
    if (/닫기|close/i.test(aria)) return true;
    if (t.length <= 16 && /(오늘|하루).*(보지|열지) ?않기/.test(t)) return true;
    return /(^|[\s_-])(btn[_-]?close|close[_-]?btn|popup[_-]?close|layer[_-]?close|modal[_-]?close|close)([\s_-]|$)/i.test(cls) && t.length <= 16;
  }
  function closePopups() {
    var n = 0;
    var els = document.querySelectorAll('button, a, [role=button], span, i, div, img');
    for (var i = 0; i < els.length && n < 5; i++) {
      var el = els[i];
      if (el === EH.target || (EH.target && EH.target.contains(el))) continue;
      if (!visible(el) || !isCloseButton(el) || !inOverlay(el)) continue;
      if (el.tagName === 'A' && /^https?:/i.test(el.getAttribute('href') || '') && el.href.split('#')[0] !== location.href.split('#')[0]) continue;
      try { el.click(); n++; } catch (e) {}
    }
    if (n) report('info', 'POPUP_CLOSED', '팝업 ' + n + '개 닫음');
    return n;
  }

  /* ---------- 로그인·캡차 화면 감지 ---------- */
  function detectBlockers() {
    var pw = document.querySelector('input[type=password]');
    if (pw && visible(pw)) { report('status', 'LOGIN_REQUIRED', '로그인 화면입니다. 직접 로그인해 주세요 (한 번 하면 유지돼요)'); return true; }
    var cap = document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha');
    var t = norm(document.body ? document.body.innerText : '').slice(0, 20000);
    var cm = has(t, P.captcha);
    if ((cap && visible(cap)) || cm) { report('status', 'CAPTCHA', '캡차(자동입력 방지)가 있어요. 직접 풀어 주세요'); return true; }
    return false;
  }

  /* ---------- 퀴즈 정답 / 폼 값 입력 ---------- */
  function setValue(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }
  function fillAnswer() {
    var ans = norm(cfg.answer);
    if (!ans) return false;
    var els = document.querySelectorAll('input:not([type]), input[type=text], input[type=search], textarea');
    var best = null, bestScore = -1;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el) || el.readOnly || el.disabled) continue;
      if (el.value && el.value !== ans) continue;
      var hint = (el.placeholder || '') + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '');
      var lab = el.id && document.querySelector('label[for="' + el.id + '"]');
      if (lab) hint += ' ' + lab.innerText;
      var score = /정답|답|answer|quiz|퀴즈/i.test(hint) ? 2 : 0;
      if (/검색|search/i.test(hint)) score -= 3;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (!best || bestScore < 0) { report('info', 'ANSWER_FIELD_NOT_FOUND', '정답 칸을 못 찾았어요. 붙여넣기 해 주세요 (복사돼 있어요)'); return false; }
    if (best.value !== ans) setValue(best, ans);
    report('info', 'ANSWER_FILLED', '정답 "' + ans + '" 입력함');
    return true;
  }

  /* ---------- 폼: 내 프로필 자동 입력 (빈 칸만, 동의 체크박스는 절대 안 건드림) ---------- */
  var PROFILE_RULES = [
    ['name', function (el, h) { return /이름|성명|성 ?함|\bname\b/i.test(h) && !/아이디|username|\bid\b|user ?id|닉네임|nick|회사|상품|검색/i.test(h); }],
    ['phone', function (el, h) { return el.type === 'tel' || /휴대폰|휴대전화|핸드폰|연락처|전화|phone|mobile|\bhp\b|\btel\b/i.test(h); }],
    ['email', function (el, h) { return el.type === 'email' || /이메일|e-?mail/i.test(h); }],
    ['birth', function (el, h) { return /생년월일|생일|birth/i.test(h); }],
  ];
  function fillProfile() {
    var pf = cfg.profile;
    if (!pf || cfg.type !== 'form') return 0;
    var els = document.querySelectorAll('input:not([type]), input[type=text], input[type=tel], input[type=email], input[type=number]');
    var done = {}, n = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el) || el.readOnly || el.disabled || el.value) continue;
      var h = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.title].join(' ');
      var lab = el.id && document.querySelector('label[for="' + el.id + '"]');
      if (lab) h += ' ' + lab.innerText;
      if (el.maxLength > 0 && el.maxLength <= 4) continue; // 010-xxxx-xxxx 처럼 나뉜 칸은 건너뜀 (직접 입력)
      for (var k = 0; k < PROFILE_RULES.length; k++) {
        var key = PROFILE_RULES[k][0];
        if (done[key] || !pf[key] || !PROFILE_RULES[k][1](el, h)) continue;
        setValue(el, pf[key]); done[key] = true; n++;
        break;
      }
    }
    if (n) report('info', 'PROFILE_FILLED', '프로필 ' + n + '칸 입력 (동의 체크·제출은 직접)');
    return n;
  }
  var profileDone = false;

  /* ---------- 참여 버튼 찾기 → 강조만 ---------- */
  function candidates() {
    return document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], input[type=image], [onclick]');
  }
  /** 다른 페이지로 가는 링크 = 메뉴 이동 (참여 버튼 아님) */
  function isNavLink(el) {
    if (el.tagName !== 'A') return false;
    var h = el.getAttribute('href') || '';
    if (!h || h.charAt(0) === '#' || /^javascript:/i.test(h)) return false;
    return el.href.split('#')[0] !== location.href.split('#')[0];
  }
  function findByWords(words, onlyLinks, allowNav) {
    if (!words || !words.length) return null;
    var els = onlyLinks ? document.querySelectorAll('a[href]') : candidates();
    var best = null, bestScore = -1e9;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      if (!onlyLinks && !allowNav && isNavLink(el)) continue;
      var t = label(el);
      if (!t || t.length > 30) continue;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (!word || t.indexOf(word) < 0) continue;
        var r = el.getBoundingClientRect();
        var score = (t === word ? 1000 : 0) + (words.length - w) * 50 - t.length * 3 + Math.min(r.width * r.height, 40000) / 2000;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') score -= 500;
        if (score > bestScore) { best = el; bestScore = score; }
        break;
      }
    }
    return best;
  }
  /** 사용자가 톡으로 지정한 버튼 (주소 → 글자 순) */
  function findPicked() {
    if (cfg.targetSelector) {
      try {
        var el = document.querySelector(cfg.targetSelector);
        if (el && visible(el)) return el;
      } catch (e) {}
    }
    return cfg.targetText ? findByWords([cfg.targetText], false, true) : null; // 직접 지정한 것은 링크여도 허용
  }
  function obstructed(el) {
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    var top = document.elementFromPoint(x, y);
    return !!top && top !== el && !el.contains(top) && !top.contains(el);
  }
  var tip = null;
  function highlight(el) {
    EH.target = el;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.style.setProperty('outline', '4px solid #ff1744', 'important');
    el.style.setProperty('outline-offset', '3px', 'important');
    el.style.setProperty('box-shadow', '0 0 0 9999px rgba(0,0,0,.25)', 'important');
    if (!tip) {
      tip = document.createElement('div');
      tip.setAttribute('data-eh', 'tip');
      tip.textContent = '👆 이 버튼을 직접 눌러 주세요';
      tip.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483647;' +
        'background:#ff1744;color:#fff;font:bold 15px sans-serif;padding:10px 16px;border-radius:24px;pointer-events:none;';
      document.body.appendChild(tip);
    }
  }

  /* ---------- 사용자가 누른 뒤 결과 판정 ---------- */
  var armedUntil = 0, resultSent = false, addedText = '';
  document.addEventListener('pointerdown', function (e) {
    if (e.isTrusted) armedUntil = Date.now() + ARM_MS;
    if (tip && EH.target && (e.target === EH.target || EH.target.contains(e.target))) { tip.remove(); tip = null; }
  }, true);
  function onAdded(text) {
    if (resultSent || Date.now() > armedUntil) return;
    addedText = (addedText + ' ' + text).slice(-4000);
    var c = classify(addedText);
    if (c) { resultSent = true; report('result', c[0], '화면 문구: "' + c[1] + '"'); }
  }
  var mo = new MutationObserver(function (muts) {
    var t = '';
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') t += ' ' + (m.target.data || '');
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (n.nodeType === 3) t += ' ' + n.data;
        else if (n.nodeType === 1 && n.getAttribute('data-eh') !== 'tip') t += ' ' + (n.innerText || n.textContent || '');
      }
      if (m.type === 'attributes' && m.target.nodeType === 1 && visible(m.target)) t += ' ' + (m.target.innerText || '');
    }
    t = norm(t);
    if (t) onAdded(t);
  });
  if (document.body) mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });

  /* ---------- 실행 순서 ---------- */
  function navigateOnce() {
    var nav = (cfg.navText ? [cfg.navText] : []).concat(cfg.navKeywords || []);
    var key = '__eh_nav_' + (cfg.id || '');
    try { if (sessionStorage.getItem(key)) return false; } catch (e) {}
    var a = findByWords(nav, true);
    if (!a || a.href.split('#')[0] === location.href.split('#')[0]) return false;
    try { sessionStorage.setItem(key, '1'); } catch (e) {}
    report('info', 'NAVIGATE', '"' + label(a) + '" 메뉴로 이동');
    location.href = a.href; // 메뉴 이동만 (참여 버튼이 아님)
    return true;
  }

  var started = Date.now(), done = false, ticks = 0;
  function tick() {
    if (done) return;
    if (++ticks <= 3) closePopups(); // 처음 3초만 팝업 정리 (계속 누르지 않음)
    if (detectBlockers()) { done = true; return; }
    if (cfg.type === 'quiz' || cfg.type === 'form') fillAnswer();
    if (!profileDone && fillProfile()) profileDone = true;
    var el = findPicked() || findByWords(cfg.keywords || []);
    if (el) {
      if (obstructed(el)) { closePopups(); if (obstructed(el)) { report('status', 'POPUP_BLOCKED', '팝업이 버튼을 가리고 있어요. 팝업을 직접 닫아 주세요'); } }
      highlight(el);
      report('status', 'READY', '"' + label(el) + '" 버튼을 찾았어요 → 직접 눌러 주세요');
      done = true;
      return;
    }
    if (Date.now() - started > 3000 && navigateOnce()) { done = true; return; }
    if (Date.now() - started > FIND_TIMEOUT) {
      report('status', 'SELECTOR_NOT_FOUND', '참여 버튼을 못 찾았어요 (사이트 화면이 바뀌었을 수 있음). 직접 찾아 눌러 주세요');
      done = true;
      return;
    }
    setTimeout(tick, 1000);
  }
  report('info', 'ENGINE_START', '자동 보조 시작');
  setTimeout(tick, 500);
})();
