// ③ 인테리어 — 방 사진 + 원하는 분위기 → 분석·추천 + 실제 인테리어 사진(Pexels). 생성 이미지 없음
import { h, toast, progress, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, ctx2d } from '../core/img.js';
import { rgb2lab } from '../core/lut.js';
import { settings } from '../core/store.js';
import { ROOMS, STYLES, ROOM_TIPS, STYLE_WORDS, EXTRA_WORDS, parseBudget, budgetPlan } from '../data/interior.js';

const S = { canvas: null, room: 'living', useAi: false, desc: '', target: null, detected: null, palette: null, light: null };
let out, preview;

export async function render(root) {
  Object.assign(S, { canvas: null, target: null, detected: null, palette: null, light: null });
  preview = h('div');
  out = h('div');
  const roomChips = h('div', { class: 'chips' });
  const drawRooms = () => roomChips.replaceChildren(
    h('button', { class: 'chip' + (S.room === 'auto' ? ' on' : ''), onclick: () => { S.room = 'auto'; S.useAi = true; aiBox.checked = true; drawRooms(); } }, '🤖 자동'),
    ...ROOMS.map((r) => h('button', { class: 'chip' + (S.room === r.key ? ' on' : ''), onclick: () => { S.room = r.key; drawRooms(); } }, r.ko)));
  drawRooms();
  const desc = h('textarea', { placeholder: '예) 북유럽풍으로 넓어 보이게, 원목 가구, 고양이 있음, 예산 100만원', oninput: (e) => (S.desc = e.target.value), style: { minHeight: '90px' } });
  const aiBox = h('input', { type: 'checkbox', onchange: (e) => { S.useAi = e.target.checked; if (!S.useAi && S.room === 'auto') { S.room = 'living'; drawRooms(); } } });

  root.append(
    pageHeader('인테리어', '내 방 분석 + 실제 사진으로 추천'),
    h('div', { class: 'card' },
      h('p', { class: 'small' }, '① 방 전체가 보이게 찍은 사진을 고르세요 (가로 사진 추천)'),
      pickButtons(async ([f]) => { if (f) await setPhoto(f); }, { multiple: false }),
      preview,
      h('h2', {}, '② 어떤 공간인가요?'), roomChips,
      h('h2', {}, '③ 원하는 분위기·조건 (자유롭게)'), desc,
      h('label', { class: 'row small', style: { marginTop: '8px' } }, aiBox, '🤖 AI로 지금 방 스타일 판별 (처음 한 번 약 154MB 내려받음 · 와이파이 권장)'),
      h('button', { class: 'btn big', style: { width: '100%', marginTop: '12px' }, onclick: analyze }, '🔍 분석하고 추천받기')),
    h('div', { class: 'note' }, '사진 분석은 폰 안에서만 해요. 실제 인테리어 사진은 공개 사진 검색(Openverse)에서 자동으로 찾아 보여주며, 내 방이 아니라 "비슷한 조건의 실제 사진"이에요.'),
    out);
}

async function setPhoto(f) {
  const b = await loadBitmap(f);
  S.canvas = toCanvas(b, 640); b.close?.();
  const img = S.canvas.cloneNode(); ctx2d(img).drawImage(S.canvas, 0, 0);
  img.style.cssText = 'width:100%;border-radius:12px;margin-top:10px';
  preview.replaceChildren(img);
}

// ── 색 분석 ─────────────────────────────────────────
function palette(canvas, k = 5) {
  const c = toCanvas(canvas, 64), d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
  const px = [], lab = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { rgb2lab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, lab); px.push([lab[0], lab[1], lab[2], d[i], d[i + 1], d[i + 2]]); }
  // k-means (밝기 순서로 초기값)
  const sorted = [...px].sort((a, b) => a[0] - b[0]);
  let cent = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / k)].slice(0, 3));
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    px.forEach((p, i) => { let best = 0, bd = Infinity; cent.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } }); assign[i] = best; });
    cent = cent.map((c, j) => { const m = px.filter((_, i) => assign[i] === j); return m.length ? [0, 1, 2].map((t) => m.reduce((s, p) => s + p[t], 0) / m.length) : c; });
  }
  return cent.map((c, j) => {
    const m = px.filter((_, i) => assign[i] === j);
    const rgb = [3, 4, 5].map((t) => Math.round(m.reduce((s, p) => s + p[t], 0) / Math.max(1, m.length)));
    return { lab: c, rgb, share: m.length / px.length, hex: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), name: colorName(c, rgb) };
  }).filter((p) => p.share > 0.02).sort((a, b) => b.share - a.share);
}

function colorName([L, a, b], [r, g, bl]) {
  const C = Math.hypot(a, b);
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
  let hue = 0;
  if (max !== min) { hue = max === r ? ((g - bl) / (max - min)) % 6 : max === g ? (bl - r) / (max - min) + 2 : (r - g) / (max - min) + 4; hue = (hue * 60 + 360) % 360; }
  if (C < 8) return L > 88 ? '화이트' : L > 70 ? '라이트 그레이' : L > 40 ? '그레이' : L > 20 ? '차콜' : '블랙';
  if (C < 38 && hue >= 12 && hue < 70) return L > 80 ? '아이보리' : L > 62 ? '베이지' : L > 30 ? '원목·브라운' : '다크 브라운';
  if (hue < 15 || hue >= 345) return L > 70 ? '핑크' : '레드';
  if (hue < 45) return L > 65 ? '피치' : L > 40 ? '오렌지·테라코타' : '브라운';
  if (hue < 70) return L > 60 ? '옐로·머스터드' : '올리브 브라운';
  if (hue < 160) return L > 60 ? '라이트 그린' : '그린';
  if (hue < 200) return '청록';
  if (hue < 250) return L > 60 ? '하늘색' : '블루·네이비';
  if (hue < 290) return '보라';
  return '자주·핑크';
}

// ── 분석 ────────────────────────────────────────────
async function analyze() {
  if (!S.canvas) { toast('먼저 방 사진을 고르세요'); return; }
  const p = progress('방 분석 중');
  try {
    S.palette = palette(S.canvas);
    const Lmean = S.palette.reduce((s, c) => s + c.lab[0] * c.share, 0) / S.palette.reduce((s, c) => s + c.share, 0);
    const warm = S.palette.reduce((s, c) => s + c.lab[2] * c.share, 0);
    S.light = { L: Lmean, warm };
    S.detected = null;
    if (S.useAi) {
      const { classify, loadClip } = await import('../core/clip.js');
      await loadClip((r, t) => p.set(r * 0.9, t));
      p.set(0.92, '스타일 판별 중');
      const styleLabels = Object.entries(STYLES).map(([key, s]) => ({ key, en: s.clip }));
      const styles = await classify(S.canvas, styleLabels);
      let room = null;
      if (S.room === 'auto') {
        room = (await classify(S.canvas, ROOMS.map((r) => ({ key: r.key, en: r.en })), 'a photo of a {}'))[0].key;
        S.room = room;
      }
      S.detected = styles.slice(0, 3);
    }
    if (S.room === 'auto') S.room = 'living';
    const fromText = STYLE_WORDS.find(([re]) => re.test(S.desc))?.[1];
    S.target = fromText || S.detected?.[0]?.key || 'natural';
  } catch (e) { toast(errorText(e), 5000); console.error(e); }
  finally { p.done(); }
  if (S.palette) draw();
}

function draw() {
  const room = ROOMS.find((r) => r.key === S.room) || ROOMS[0];
  const st = STYLES[S.target];
  const bright = S.light.L > 68 ? '밝은 편' : S.light.L > 48 ? '보통' : '어두운 편';
  const tone = S.light.warm > 8 ? '따뜻한 톤' : S.light.warm < -2 ? '차가운 톤' : '중간 톤';
  const extras = EXTRA_WORDS.filter(([re]) => re.test(S.desc)).map(([, en]) => en);
  const budget = budgetPlan(parseBudget(S.desc));

  const myTips = [];
  if (S.light.L < 48) myTips.push('방이 어두운 편이라 전구색 스탠드·간접조명을 2곳 이상 더하고, 러그·커튼은 밝은 색으로 고르면 좋아요.');
  if (S.palette.filter((c) => Math.hypot(c.lab[1], c.lab[2]) > 25).length >= 3) myTips.push('눈에 띄는 색이 많아요. 큰 면적(벽·커튼·러그)을 2~3색으로 줄이면 정돈돼 보여요.');
  if (S.light.warm < -2 && ['natural', 'scandi', 'japandi', 'plants', 'vintage'].includes(S.target)) myTips.push('지금은 차가운 톤이에요. 전구색 조명과 원목·베이지 패브릭으로 따뜻하게 바꾸는 게 첫걸음.');
  if (S.light.warm > 10 && ['modern', 'minimal', 'industrial'].includes(S.target)) myTips.push('지금은 따뜻한 톤이에요. 회색·블랙 포인트와 흰 조명을 섞으면 원하는 분위기에 가까워져요.');

  const styleChips = h('div', { class: 'chips' }, Object.entries(STYLES).map(([k, s]) => h('button', { class: 'chip' + (k === S.target ? ' on' : ''), onclick: () => { S.target = k; draw(); } }, s.ko)));
  const list = (title, arr) => h('div', {}, h('b', {}, title), h('ul', { class: 'steps' }, arr.map((t) => h('li', {}, t))));
  const swatch = ([hex, name]) => h('div', { class: 'sw' }, h('i', { style: { background: hex } }), name);

  const photos = h('div', { class: 'photos' });
  const query = [st.en.replace(' interior', ''), room.en, ...extras].join(' ');

  out.replaceChildren(
    h('div', { class: 'card' },
      h('h2', { style: { marginTop: 0 } }, `지금 ${room.ko}`),
      h('p', {}, `밝기: ${bright} · 색감: ${tone}`),
      h('div', { class: 'swatches' }, S.palette.map((c) => h('div', { class: 'sw' }, h('i', { style: { background: c.hex } }), `${c.name} ${Math.round(c.share * 100)}%`))),
      S.detected ? h('p', { class: 'small', style: { marginTop: '10px' } }, '🤖 지금 스타일 추정: ', S.detected.map((d) => `${STYLES[d.key].ko} ${Math.round(d.score * 100)}%`).join(' · ')) : h('p', { class: 'muted small' }, 'AI 판별을 켜면 지금 스타일도 추정해 드려요.'),
      myTips.length ? list('💡 이 방에 먼저 할 것', myTips) : null),
    h('div', { class: 'card' },
      h('h2', { style: { marginTop: 0 } }, '추천 스타일'), styleChips,
      h('h2', {}, `${st.ko} — ${st.say}`),
      h('div', { class: 'swatches' }, st.colors.map(swatch)),
      list('🧱 소재', st.materials), list('🛋 가구', st.furniture), list('💡 조명', st.light), list('🌿 소품', st.props),
      list(`📍 ${room.ko} 요령`, ROOM_TIPS[room.key] || []), list('🚫 피하면 좋은 것', st.avoid),
      budget ? list('💰 예산 쓰는 순서', budget) : null),
    h('div', { class: 'card' },
      h('h2', { style: { marginTop: 0 } }, '📷 실제 인테리어 사진'),
      h('p', { class: 'muted small' }, `검색어: ${query}`),
      photos,
      h('p', { class: 'muted small', style: { marginTop: '8px' } }, '사진: Openverse의 CC0·퍼블릭 도메인 실사 사진 (누르면 원본 페이지)')));
  loadPhotos(query, photos);
}

async function loadPhotos(query, box) {
  const gas = settings.get('gasUrl'), token = settings.get('gasToken');
  const more = h('a', { class: 'btn ghost', href: `https://openverse.org/search/image?q=${encodeURIComponent(query)}&license=cc0,pdm`, target: '_blank', rel: 'noopener', style: { gridColumn: 'span 2', textAlign: 'center', textDecoration: 'none' } }, '실제 사진 더 보기 ↗');
  const tile = (p) => h('a', { href: p.link, target: '_blank', rel: 'noopener' },
    h('img', { src: p.thumb, alt: p.title || '인테리어 사진', loading: 'lazy', referrerpolicy: 'no-referrer' }), h('small', {}, p.credit));
  box.replaceChildren(h('p', { class: 'muted', style: { gridColumn: 'span 2' } }, '실제 인테리어 사진 찾는 중…'));
  let list = [];
  try {
    if (gas) {
      // (선택) Pexels 연결이 돼 있으면 Pexels 사진
      const j = await (await fetch(`${gas}?action=pexels&token=${encodeURIComponent(token)}&query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`)).json();
      if (j.error) throw new Error(j.error);
      list = (j.photos || []).map((p) => ({ thumb: p.src, link: p.url, title: p.alt, credit: `📷 ${p.photographer} / Pexels` }));
    }
  } catch { list = []; }
  try {
    if (!list.length) {
      // 기본: Openverse (키·가입 없이 자동, CC0·퍼블릭 도메인 실사 사진만)
      const { searchPhotos } = await import('../core/photos.js');
      let r = await searchPhotos(query, { n: 12, wide: true });
      if (r.length < 4) r = r.concat(await searchPhotos(query.split(' ').slice(0, 3).join(' '), { n: 12, wide: true }));
      list = r.slice(0, 12).map((p) => ({ ...p, credit: `${p.license}${p.creator ? ' · ' + p.creator : ''}` }));
    }
    if (!list.length) { box.replaceChildren(h('p', { class: 'muted', style: { gridColumn: 'span 2' } }, '맞는 사진이 없어요. 설명을 줄여 보세요.'), more); return; }
    box.replaceChildren(...list.map(tile), more);
  } catch (e) {
    box.replaceChildren(h('p', { class: 'small', style: { gridColumn: 'span 2' } }, '사진을 못 불러왔어요: ' + errorText(e)), more);
  }
}
