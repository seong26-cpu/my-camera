// 실제 사진 찾기 — Openverse(워드프레스 재단의 공개 이미지 검색, 키·가입 불필요)
// CC0·퍼블릭 도메인 사진만 골라서 저작권 표시 의무 없이 쓴다. 결과는 폰에 7일 저장(하루 요청 아끼기)
const API = 'https://api.openverse.org/v1/images/';
const TTL = 7 * 24 * 3600 * 1000;
let last = 0;

function cacheGet(k) {
  try { const v = JSON.parse(localStorage.getItem('mc.ph.' + k) || 'null'); if (v && Date.now() - v.t < TTL) return v.d; } catch {}
  return null;
}
function cacheSet(k, d) { try { localStorage.setItem('mc.ph.' + k, JSON.stringify({ t: Date.now(), d })); } catch {} }

async function polite() {
  // 익명 사용은 초당 1회 정도로 제한돼 있어 간격을 둔다
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

/**
 * @returns {Promise<{id,thumb,url,link,title,creator,license,w,h}[]>}
 */
export async function searchPhotos(query, { n = 12, wide = false } = {}) {
  const key = query + '|' + n + '|' + (wide ? 'w' : '');
  const hit = cacheGet(key);
  if (hit) return hit;
  const base = `${API}?q=${encodeURIComponent(query)}&license=cc0,pdm&page_size=${Math.min(20, n)}`;
  const tries = [base + '&category=photograph' + (wide ? '&aspect_ratio=wide' : ''), base];
  let results = null;
  for (const u of tries) {
    await polite();
    const r = await fetch(u);
    if (r.status === 400) continue; // 모르는 조건이면 조건 없이 다시
    if (!r.ok) throw new Error('사진 검색 실패 (' + r.status + ')');
    results = (await r.json()).results || [];
    break;
  }
  const out = (results || []).filter((p) => !p.mature && p.thumbnail).map((p) => ({
    id: p.id, thumb: p.thumbnail, url: p.url, link: p.foreign_landing_url || p.detail_url,
    title: p.title || '', creator: p.creator || '', license: (p.license || '').toUpperCase(), w: p.width, h: p.height,
  }));
  if (out.length) cacheSet(key, out);
  return out;
}

/** 처음 화면 타일용 사진 한 장 (가로 사진 우선) */
export async function coverPhoto(query) {
  const k = 'cover|' + query;
  const hit = cacheGet(k);
  if (hit) return hit;
  const list = await searchPhotos(query, { n: 10, wide: true });
  const pick = list.find((p) => p.w && p.h && p.w >= p.h) || list[0] || null;
  if (pick) cacheSet(k, pick);
  return pick;
}
