// 자동 보조 엔진 시험: node event-helper/test/engine.test.js
// 안드로이드가 하는 것처럼 페이지 로드 후 설정+runner.js 주입 → 결과 보고와 '자동 제출 안 함' 확인
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ENG = path.join(__dirname, '../android/app/src/main/assets/engine');
const runner = fs.readFileSync(path.join(ENG, 'runner.js'), 'utf8');
const D = JSON.parse(fs.readFileSync(path.join(ENG, 'defaults.json'), 'utf8'));
const pageUrl = (f) => 'file://' + path.join(__dirname, 'pages', f);
const cfg = (type, extra = {}) => Object.assign({ id: 't-' + type, type, keywords: D.keywords[type], navKeywords: D.navKeywords[type], patterns: D.patterns, findTimeoutMs: 4000 }, extra);

async function inject(p, c) {
  await p.evaluate(([c, src]) => { window.__EH_CFG = c; (0, eval)(src); }, [c, runner]);
}
const reports = (p) => p.evaluate(() => (window.__EH ? window.__EH.reports : []));
const codes = async (p) => (await reports(p)).map((r) => r.type + ':' + r.code);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + '  ' + JSON.stringify(info)); }
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();

  console.log('1) 출석형: 팝업 닫기 → 버튼 강조 → 자동 클릭 안 함 → 사용자 클릭 후 성공 판정');
  await p.goto(pageUrl('attend.html')); await inject(p, cfg('attend'));
  await wait(2500);
  let c = await codes(p);
  check('팝업 닫음', c.includes('info:POPUP_CLOSED'), c);
  check('버튼 찾음(READY)', c.includes('status:READY'), c);
  check('강조 표시', await p.$eval('#go', (e) => e.style.outline.includes('4px')), null);
  check('자동 제출 0회', (await p.evaluate(() => window.__submitted)) === 0, null);
  check('페이지 안내문(참여 완료 시…)으로 오판 안 함', !c.some((x) => x.startsWith('result:')), c);
  await p.click('#go'); await wait(800);
  c = await codes(p);
  check('사용자 클릭 후 SUCCESS', c.includes('result:SUCCESS'), c);

  console.log('2) 퀴즈형: 검색칸 말고 정답칸에 입력 → 정답 판정');
  await p.goto(pageUrl('quiz.html')); await inject(p, cfg('quiz', { answer: '배당' }));
  await wait(1500);
  c = await codes(p);
  check('정답 입력', c.includes('info:ANSWER_FILLED') && (await p.inputValue('#ans')) === '배당', c);
  check('검색칸 비어 있음', (await p.inputValue('input[type=search]')) === '', null);
  check('자동 제출 0회', (await p.evaluate(() => window.__submitted)) === 0, null);
  await p.click('text=정답 제출'); await wait(800);
  check('SUCCESS', (await codes(p)).includes('result:SUCCESS'), await codes(p));

  console.log('3) 폼형: 중복 참여 문구 → ALREADY_DONE');
  await p.goto(pageUrl('form.html')); await inject(p, cfg('form'));
  await wait(1200); await p.click('text=응모하기'); await wait(800);
  check('ALREADY_DONE', (await codes(p)).includes('result:ALREADY_DONE'), await codes(p));

  console.log('4) 선착순형: 소진 문구 → CLOSED');
  await p.goto(pageUrl('fcfs.html')); await inject(p, cfg('fcfs'));
  await wait(1200);
  check('쿠폰 받기 버튼 READY', (await codes(p)).includes('status:READY'), await codes(p));
  await p.click('text=쿠폰 받기'); await wait(800);
  check('CLOSED', (await codes(p)).includes('result:CLOSED'), await codes(p));

  console.log('5) 닫기 버튼 없는 팝업이 가림 → POPUP_BLOCKED');
  await p.goto(pageUrl('blocked.html')); await inject(p, cfg('attend'));
  await wait(1500);
  check('POPUP_BLOCKED', (await codes(p)).includes('status:POPUP_BLOCKED'), await codes(p));
  check('자동 제출 0회', (await p.evaluate(() => window.__submitted)) === 0, null);

  console.log('6) 버튼 없음 + 유의사항 문구 → SELECTOR_NOT_FOUND (이미참여/마감으로 오판 안 함)');
  await p.goto(pageUrl('nobutton.html')); await inject(p, cfg('form', { navKeywords: [] }));
  await wait(5500);
  c = await codes(p);
  check('SELECTOR_NOT_FOUND', c.includes('status:SELECTOR_NOT_FOUND'), c);
  check('결과 오판 없음', !c.some((x) => x.startsWith('result:')), c);

  console.log('7) 로그인 화면 → LOGIN_REQUIRED');
  await p.goto(pageUrl('login.html')); await inject(p, cfg('attend'));
  await wait(1200);
  check('LOGIN_REQUIRED', (await codes(p)).includes('status:LOGIN_REQUIRED'), await codes(p));

  console.log('8) 캡차 → CAPTCHA (풀지 않음)');
  await p.goto(pageUrl('captcha.html')); await inject(p, cfg('form'));
  await wait(1200);
  check('CAPTCHA', (await codes(p)).includes('status:CAPTCHA'), await codes(p));
  check('자동 제출 0회', (await p.evaluate(() => window.__submitted)) === 0, null);

  console.log('9) 이벤트 모음 → "출석체크" 메뉴 1회 이동 → 버튼 강조');
  await p.goto(pageUrl('hub.html')); await inject(p, cfg('attend', { id: 'hub' }));
  await p.waitForURL(/attend\.html/, { timeout: 8000 });
  await p.waitForLoadState('load'); await inject(p, cfg('attend', { id: 'hub' }));
  await wait(2500);
  c = await codes(p);
  check('이동 후 READY', c.includes('status:READY'), c);
  check('자동 제출 0회', (await p.evaluate(() => window.__submitted)) === 0, null);

  console.log('10) 사이트 알림창 문구 판정 (안드로이드도 같은 규칙 사용)');
  const cls = await p.evaluate(() => [__EH.classify('이미 출석하셨습니다'), __EH.classify('이미 출석 완료'), __EH.classify('이벤트가 종료되었습니다'), __EH.classify('로그인이 필요합니다'), __EH.classify('안녕하세요')]);
  check('알림 판정', cls[0][0] === 'ALREADY_DONE' && cls[1][0] === 'ALREADY_DONE' && cls[2][0] === 'CLOSED' && cls[3][0] === 'LOGIN_REQUIRED' && cls[4] === null, cls);

  await b.close();
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
