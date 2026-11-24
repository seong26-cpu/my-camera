/**
 * 응모 도우미 — Gmail 알림 중계 (Google Apps Script, 무료)
 * 하는 일: 앱이 보낸 '실패 알림·하루 요약'을 내 Gmail로 보냄. 받는 사람은 항상 '나'로 고정 (다른 주소로 못 보냄).
 * 왜 이렇게: Gmail 비밀번호·키를 폰이나 GitHub에 두지 않기 위해. 메일은 내 구글 계정 안에서만 발송됨.
 *
 * 설치 (한 번만, 약 5분):
 *  1) script.google.com → 새 프로젝트 → 이 파일 내용을 통째로 붙여넣기 → 저장
 *  2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 → 권한 허용 (내 계정으로 메일 보내기 권한)
 *  3) 실행 로그의 "앱 연결 비밀번호(APP_TOKEN)" 복사. 내 Gmail에 '설치 완료' 메일이 오면 정상
 *  4) 배포 → 새 배포 → 유형 '웹 앱' → 실행: 나 / 액세스: 모든 사용자 → 배포 → 웹 앱 URL(…/exec) 복사
 *  5) 앱 [⚙ 설정] → 메일 알림에 URL과 비밀번호 붙여넣기 → [연결 시험]
 *  · 비밀번호를 바꾸려면 resetToken 실행 후 앱에 새 비밀번호 입력
 */
var MAX_PER_DAY = 20; // 하루 최대 발송 수 (구글 발송 한도 보호, 폭주 방지)
var PREFIX = '[응모 도우미] ';

function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('APP_TOKEN');
  if (!token) { token = Utilities.getUuid().replace(/-/g, '').slice(0, 20); props.setProperty('APP_TOKEN', token); }
  MailApp.sendEmail(me_(), PREFIX + '설치 완료', '응모 도우미 메일 알림이 준비됐어요.\n이제 배포(웹 앱) 후 앱 설정에 URL과 비밀번호를 넣어 주세요.');
  Logger.log('앱 연결 비밀번호(APP_TOKEN): ' + token);
}

function resetToken() {
  var token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  PropertiesService.getScriptProperties().setProperty('APP_TOKEN', token);
  Logger.log('새 앱 연결 비밀번호: ' + token);
}

function doGet() { return json_({ ok: true, hint: 'POST only' }); }

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  var props = PropertiesService.getScriptProperties();
  if (!req.token || req.token !== props.getProperty('APP_TOKEN')) return json_({ ok: false, error: 'unauthorized' });
  if (req.kind === 'ping') return json_({ ok: true, left: left_(props) });

  var kinds = { fail: '⚠ 실패 알림', summary: '📋 하루 요약', test: '✅ 연결 시험' };
  if (!kinds[req.kind]) return json_({ ok: false, error: 'unknown kind' });
  if (left_(props) <= 0) return json_({ ok: false, error: 'daily limit' });

  var subject = PREFIX + kinds[req.kind] + (req.subject ? ' — ' + String(req.subject).slice(0, 80) : '');
  var text = String(req.text || '').slice(0, 20000);
  MailApp.sendEmail(me_(), subject, text + '\n\n— 응모 도우미 (이 메일은 내 Apps Script가 나에게 보낸 것입니다)');
  count_(props);
  return json_({ ok: true, left: left_(props) });
}

function me_() { return Session.getEffectiveUser().getEmail(); }
function key_() { return 'cnt_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd'); }
function left_(props) { return MAX_PER_DAY - Number(props.getProperty(key_()) || 0); }
function count_(props) {
  var k = key_();
  props.getKeys().forEach(function (x) { if (x.indexOf('cnt_') === 0 && x !== k) props.deleteProperty(x); }); // 지난 날짜 정리
  props.setProperty(k, String(Number(props.getProperty(k) || 0) + 1));
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
