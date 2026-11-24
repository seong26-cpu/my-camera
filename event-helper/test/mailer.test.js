// Apps Script(Mailer.gs) 동작 시험: 구글 서비스를 흉내 낸 가짜 객체로 실행
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../apps-script/Mailer.gs'), 'utf8');
const props = {}; const sent = [];
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; },
    deleteProperty: (k) => { delete props[k]; }, getKeys: () => Object.keys(props) }) },
  MailApp: { sendEmail: (to, subject, body) => sent.push({ to, subject, body }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  Utilities: { getUuid: () => '1234abcd-5678-90ef-aaaa-bbbbccccdddd', formatDate: () => '20261124' },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  Logger: { log: () => {} },
};
vm.createContext(ctx); vm.runInContext(src, ctx);
let pass = 0, fail = 0;
const check = (n, c, i) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, JSON.stringify(i)); } };
const post = (o) => ctx.doPost({ postData: { contents: JSON.stringify(o) } });

ctx.setup();
const token = props.APP_TOKEN;
check('setup: 비밀번호 생성 + 설치 메일(나에게)', token && sent[0].to === 'owner@example.com', sent[0]);
check('비밀번호 틀리면 거부·발송 안 함', post({ token: 'x', kind: 'fail', text: 'a' }).error === 'unauthorized' && sent.length === 1, null);
check('ping 은 메일 안 보냄', post({ token, kind: 'ping' }).ok && sent.length === 1, null);
let r = post({ token, kind: 'fail', subject: 'G마켓 · 네트워크 오류', text: '내용', to: 'evil@example.com' });
check('실패 알림 발송 · 받는 사람은 항상 나 (to 무시)', r.ok && sent[1].to === 'owner@example.com' && sent[1].subject.includes('실패 알림'), sent[1]);
check('모르는 종류 거부', post({ token, kind: 'spam' }).error === 'unknown kind', null);
props.cnt_20261123 = '5';
for (let i = 0; i < 25; i++) post({ token, kind: 'summary', text: 's' });
check('하루 20통 제한', sent.length === 1 + 20 && post({ token, kind: 'test' }).error === 'daily limit', sent.length);
check('지난 날짜 카운터 정리', !('cnt_20261123' in props), Object.keys(props));
check('잘못된 JSON 처리', ctx.doPost({ postData: { contents: '{bad' } }).error === 'bad json', null);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
