/**
 * 나의 카메라 — Pexels 중계 (Google Apps Script, 무료)
 * 하는 일: 앱이 보낸 검색어로 Pexels 무료 API를 대신 불러 실제 인테리어 사진 목록을 돌려준다.
 * 왜 필요한가: Pexels 키를 앱 코드(GitHub)에 넣으면 누구나 볼 수 있어서, 키는 여기(내 구글 계정)에만 둔다.
 *
 * 설치 (한 번만):
 *  1) 아래 PEXELS_KEY_HERE 자리에 Pexels 키를 붙여 넣는다
 *  2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 → 권한 허용
 *  3) 실행 로그에 나온 "앱 연결 비밀번호(APP_TOKEN)"를 복사해 둔다
 *  4) 키를 붙여 넣은 줄을 다시 PEXELS_KEY_HERE 로 지우고 저장 (키는 이미 안전한 곳에 저장됨)
 *  5) 배포 → 새 배포 → 유형 '웹 앱' → 실행: 나 / 액세스: 모든 사용자 → 배포 → 웹 앱 URL 복사
 *  6) 앱 [보관함·설정]에 URL 과 비밀번호를 붙여 넣고 [연결 시험]
 */

function setup() {
  var key = 'PEXELS_KEY_HERE';
  var props = PropertiesService.getScriptProperties();
  if (key && key !== 'PEXELS_KEY_HERE') props.setProperty('PEXELS_KEY', key.trim());
  if (!props.getProperty('PEXELS_KEY')) throw new Error('Pexels 키를 setup() 안에 붙여 넣고 다시 실행하세요.');
  var token = props.getProperty('APP_TOKEN');
  if (!token) { token = Utilities.getUuid().replace(/-/g, '').slice(0, 16); props.setProperty('APP_TOKEN', token); }
  Logger.log('앱 연결 비밀번호(APP_TOKEN): ' + token);
  Logger.log('이제 키를 지우고 저장한 뒤, 배포 → 새 배포(웹 앱)를 하세요.');
}

/** 비밀번호를 새로 바꾸고 싶을 때 실행 */
function resetToken() {
  var token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty('APP_TOKEN', token);
  Logger.log('새 앱 연결 비밀번호: ' + token);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var props = PropertiesService.getScriptProperties();
  if (!p.token || p.token !== props.getProperty('APP_TOKEN')) return json_({ error: 'unauthorized' });
  if (p.action === 'ping') return json_({ ok: true, pexels: !!props.getProperty('PEXELS_KEY') });
  if (p.action === 'pexels') return pexels_(p, props.getProperty('PEXELS_KEY'));
  return json_({ error: 'unknown action' });
}

function pexels_(p, key) {
  if (!key) return json_({ error: 'Pexels 키가 없습니다. setup()을 다시 실행하세요.' });
  var q = String(p.query || 'interior').slice(0, 120);
  var per = Math.min(30, Math.max(1, parseInt(p.per_page || '12', 10)));
  var params = 'query=' + encodeURIComponent(q) + '&per_page=' + per +
    (p.orientation ? '&orientation=' + encodeURIComponent(p.orientation) : '') +
    (p.locale ? '&locale=' + encodeURIComponent(p.locale) : '');
  // 같은 검색은 6시간 동안 저장해 두고 재사용 (무료 한도 아끼기)
  var cache = CacheService.getScriptCache();
  var ck = 'px:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, params));
  var hit = cache.get(ck);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var res = UrlFetchApp.fetch('https://api.pexels.com/v1/search?' + params, { headers: { Authorization: key }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return json_({ error: 'Pexels 응답 ' + res.getResponseCode() });
  var data = JSON.parse(res.getContentText());
  var out = JSON.stringify({
    photos: (data.photos || []).map(function (ph) {
      return { id: ph.id, url: ph.url, photographer: ph.photographer, photographer_url: ph.photographer_url, alt: ph.alt, src: ph.src && (ph.src.medium || ph.src.large) };
    })
  });
  try { cache.put(ck, out, 21600); } catch (err) {}
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
