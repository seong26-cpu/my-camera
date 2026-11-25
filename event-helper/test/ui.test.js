// 앱 화면 시험: 연속 응모 순서·로그인 몰아서 대상·자동 꺼짐 표시 (node event-helper/test/ui.test.js)
const { chromium } = require('playwright');
const path = require('path');
let pass = 0, fail = 0;
const check = (n, c, i) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, JSON.stringify(i)); } };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.join(__dirname, '../android/app/src/main/assets/ui/index.html'));
  const T = await p.evaluate(() => A.today());
  await p.evaluate((T) => {
    localStorage.recipes = JSON.stringify([
      { id: 'w1', name: '웹1', url: 'https://a.com', type: 'attend' },
      { id: 'lg', name: '로그인필요', url: 'https://b.com', type: 'attend', needLogin: true },
      { id: 'ap', name: '앱', url: 'https://c.com', type: 'attend', appPackage: 'x.y' },
      { id: 'fc', name: '선착순10시', url: 'https://d.com', type: 'fcfs', openTime: '10:00' },
      { id: 'fc2', name: '선착순9시', url: 'https://e.com', type: 'fcfs', openTime: '09:00' },
      { id: 'w2', name: '완료', url: 'https://f.com', type: 'attend', loginOk: T },
      { id: 'off', name: '꺼짐', url: 'https://g.com', enabled: false, autoOff: { date: T, reason: '2일 연속 마감' } },
      { id: 'tk', name: '앱주소', url: 'package:viva.republica.toss', type: 'quiz' },
    ]);
    localStorage.logs = JSON.stringify([{ date: T, recipeId: 'w2', name: '완료', code: 'SUCCESS' }]);
    onAppResume();
  }, T);
  await p.click('#startQueue');
  const q = await p.evaluate(() => window.__queue);
  check('연속 응모 순서: 웹 → 선착순(시각순) → 앱 → 로그인 필요, 완료·꺼짐 제외', JSON.stringify(q.ids) === JSON.stringify(['w1', 'fc2', 'fc', 'ap', 'tk', 'lg']) && q.mode === 'queue', q);
  await p.click('#loginRound');
  const l = await p.evaluate(() => window.__queue);
  check('로그인 몰아서: 로그인 필요 먼저, 앱·꺼짐·오늘 확인한 곳 제외', JSON.stringify(l.ids) === JSON.stringify(['lg', 'w1', 'fc', 'fc2']) && l.mode === 'login', l);
  await p.click('[data-tab=manage]');
  check('자동 꺼짐 표시', (await p.textContent('#tab-manage')).includes('자동 꺼짐 · 2일 연속 마감'), null);
  await p.click('[data-toggle=off]');
  check('다시 켜면 자동 꺼짐 표시 지움', await p.evaluate(() => { const r = JSON.parse(localStorage.recipes).find((x) => x.id === 'off'); return r.enabled && !r.autoOff; }), null);
  check('화면 오류 없음', errs.length === 0, errs);
  await b.close();
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
