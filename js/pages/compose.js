// 🏠 내 방 사진 안에서 직접 배치 — 생성 이미지 없이 "실제 사진"만으로 합성
// ① 가구 넣기: 실제 가구 사진(위키미디어 공용)을 배경 자동 제거 후 내 방 사진에 올림
// ② 방 물건 옮기기: 내 사진 속 물건을 톡 → 자동 테두리 → 끌어서 다른 자리로 (빈자리 자동 채움)
// ③ 벽·바닥 색: 톡 한 면의 색을 추천 색으로 바꿔 봄 (그림자·질감 유지)
// ④ 추천대로 자동 배치: 스타일에 맞는 가구 2~3개를 알아서 찾아 올려 둠 → 손으로 미세 조정
import { h, toast, progress, slider, errorText, confirmBox } from '../core/ui.js';
import { makeCanvas, ctx2d, canvasToBlob, shareOrDownload, tick } from '../core/img.js';
import { rgb2lab, lab2rgb } from '../core/lut.js';
import { searchCommons, loadCorsImage } from '../core/photos.js';
import { history, thumbOf } from '../core/store.js';

export const FURNITURE = [
  { key: 'sofa', ko: '소파', q: 'sofa isolated white background' },
  { key: 'armchair', ko: '1인 의자', q: 'armchair isolated white background' },
  { key: 'bed', ko: '침대', q: 'bed furniture white background' },
  { key: 'desk', ko: '책상', q: 'desk furniture isolated white background' },
  { key: 'chair', ko: '의자', q: 'wooden chair isolated white background' },
  { key: 'table', ko: '테이블', q: 'coffee table isolated white background' },
  { key: 'shelf', ko: '책장·선반', q: 'bookcase furniture isolated white background' },
  { key: 'cabinet', ko: '수납장', q: 'cabinet furniture isolated white background' },
  { key: 'lamp', ko: '스탠드 조명', q: 'floor lamp isolated white background' },
  { key: 'plant', ko: '화분', q: 'potted plant isolated white background' },
  { key: 'mirror', ko: '거울', q: 'standing mirror isolated white background' },
  { key: 'rug', ko: '러그', q: 'rug carpet isolated white background' },
];
// 스타일 → 검색에 붙일 말
const STYLE_EN = { scandi: 'scandinavian', minimal: 'minimalist', modern: 'modern', japandi: 'wooden', natural: 'wooden', industrial: 'industrial metal', midcentury: 'mid century', classic: 'classic', vintage: 'vintage', plants: 'rattan' };
// 방 → 자동 배치 묶음 [가구, 가로 위치, 바닥선 위치, 폭 비율]
const AUTO_SET = {
  living: [['sofa', 0.5, 0.9, 0.46], ['lamp', 0.12, 0.9, 0.12], ['plant', 0.88, 0.94, 0.16]],
  bedroom: [['lamp', 0.15, 0.88, 0.12], ['plant', 0.86, 0.94, 0.15], ['cabinet', 0.5, 0.86, 0.26]],
  office: [['desk', 0.5, 0.9, 0.42], ['chair', 0.5, 0.96, 0.18], ['plant', 0.88, 0.94, 0.15]],
  studio: [['sofa', 0.45, 0.9, 0.4], ['shelf', 0.85, 0.9, 0.2], ['plant', 0.1, 0.94, 0.14]],
  dining: [['table', 0.5, 0.9, 0.4], ['plant', 0.88, 0.94, 0.15], ['lamp', 0.12, 0.9, 0.12]],
  kids: [['shelf', 0.82, 0.9, 0.22], ['armchair', 0.3, 0.92, 0.22], ['plant', 0.08, 0.94, 0.12]],
  default: [['plant', 0.86, 0.94, 0.16], ['lamp', 0.13, 0.9, 0.12], ['armchair', 0.5, 0.92, 0.26]],
};

let C; // 편집 상태

export function openComposer(root, room, ctx) {
  C = { base: copy(room), W: room.width, H: room.height, layers: [], sel: -1, mode: 'move', undo: [], credits: [], ctx, color: ctx.palette?.[0]?.[0] || '#f4f1ea', busy: false };
  const view = makeCanvas(C.W, C.H);
  const stage = h('div', { class: 'stage' }, view);
  const pickRow = h('div', { class: 'photos hidden', style: { marginTop: '8px' } });
  const modeBar = h('div', { class: 'row' });
  const layerBar = h('div', { class: 'card hidden' });
  const colorRow = h('div', { class: 'hidden' });
  const help = h('p', { class: 'small' });
  const credit = h('p', { class: 'muted small' });
  C.view = view; C.help = help; C.pickRow = pickRow; C.layerBar = layerBar; C.colorRow = colorRow; C.credit = credit;

  const modes = [
    ['move', '✋ 방 물건 옮기기', '사진 속 물건(침대·의자 등)을 톡 → 테두리가 자동으로 잡히면 끌어서 옮기세요. 빈자리는 자동으로 채워요.'],
    ['add', '🪑 가구 넣기', '아래에서 가구 종류를 고르고 마음에 드는 실제 가구 사진을 톡 → 배경이 지워져 내 방 사진에 올라가요.'],
    ['color', '🎨 벽·바닥 색', '색을 고르고, 바꿀 벽이나 바닥을 톡 하세요. 그림자와 질감은 그대로 두고 색만 바꿔요.'],
  ];
  const setMode = (m) => {
    C.mode = m;
    [...modeBar.children].forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    help.textContent = modes.find((x) => x[0] === m)?.[2] || '';
    furnBar.classList.toggle('hidden', m !== 'add');
    pickRow.classList.toggle('hidden', m !== 'add');
    colorRow.classList.toggle('hidden', m !== 'color');
  };
  modes.forEach(([k, label]) => modeBar.append(h('button', { class: 'btn ghost sm', 'data-m': k, onclick: () => setMode(k) }, label)));

  const furnBar = h('div', { class: 'chips hidden', style: { marginTop: '8px' } },
    FURNITURE.map((f) => h('button', { class: 'chip', onclick: (e) => { [...furnBar.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); showChoices(f); } }, f.ko)));

  // 색 고르기
  const swatches = (ctx.palette || []).map(([hex, name]) => h('button', { class: 'sw', style: { border: 0, background: 'none' }, onclick: () => { C.color = hex; markColor(); } }, h('i', { style: { background: hex } }), name));
  const custom = h('input', { type: 'color', value: C.color, oninput: (e) => { C.color = e.target.value; markColor(); }, style: { width: '64px', height: '44px', border: 0, background: 'none' } });
  const markColor = () => { colorRow.querySelectorAll('.sw i').forEach((i, k) => { i.style.outline = (ctx.palette[k]?.[0] === C.color) ? '3px solid var(--accent)' : ''; }); custom.value = C.color; };
  colorRow.append(h('div', { class: 'swatches', style: { marginTop: '8px' } }, swatches, h('div', { class: 'sw' }, custom, '직접 고르기')));

  root.append(
    h('div', { class: 'card' },
      h('h2', { style: { marginTop: 0 } }, '🏠 내 방 사진에 직접 배치해 보기'),
      h('p', { class: 'muted small' }, '생성 이미지가 아니라 내 사진 + 실제 가구 사진으로 합성해요.'),
      h('button', { class: 'btn green', style: { width: '100%' }, onclick: autoArrange }, `✨ ${ctx.styleKo} 스타일로 추천 가구 자동 배치`),
      h('div', { style: { marginTop: '10px' } }, modeBar), help, furnBar, colorRow),
    stage, pickRow, layerBar, credit,
    h('div', { class: 'sticky-actions' },
      h('button', { class: 'btn ghost', onclick: undo }, '↶ 되돌리기'),
      h('button', { class: 'btn', onclick: save }, '💾 저장')));
  setMode('move');
  markColor();
  bindPointer(stage);
  draw();
}

// ── 그리기 ───────────────────────────────────────────
function copy(c) { const o = makeCanvas(c.width, c.height); ctx2d(o).drawImage(c, 0, 0); return o; }

function drawLayer(g, L) {
  const w = L.img.width * L.s, hgt = L.img.height * L.s;
  if (L.shadow) {
    g.save();
    g.translate(L.x, L.y + hgt / 2 - hgt * 0.03);
    g.scale(1, 0.18);
    const r = w * 0.48;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.save(); g.translate(L.x, L.y); g.rotate(L.r); g.scale(L.f ? -L.s : L.s, L.s);
  g.drawImage(L.img, -L.img.width / 2, -L.img.height / 2);
  g.restore();
}

function draw() {
  const g = ctx2d(C.view);
  g.drawImage(C.base, 0, 0);
  C.layers.forEach((L) => drawLayer(g, L));
  const L = C.layers[C.sel];
  if (L) {
    const w = L.img.width * L.s, hgt = L.img.height * L.s;
    g.save(); g.translate(L.x, L.y); g.rotate(L.r);
    g.setLineDash([C.W / 80, C.W / 120]); g.lineWidth = Math.max(2, C.W / 400); g.strokeStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4;
    g.strokeRect(-w / 2, -hgt / 2, w, hgt); g.restore();
  }
  drawLayerBar();
  C.credit.textContent = C.credits.length ? '가구 사진 출처: Wikimedia Commons — ' + C.credits.map((c) => `${c.creator || '작가 미상'}(${c.license || '라이선스 표기'})`).join(', ') : '';
}

function drawLayerBar() {
  const L = C.layers[C.sel];
  C.layerBar.classList.toggle('hidden', !L);
  if (!L) return;
  if (C.layerBar.dataset.for === String(C.sel) && C.layerBar.firstChild) { C.layerBar.sizeS.setValue(Math.round(L.s / L.s0 * 100)); C.layerBar.rotS.setValue(Math.round(L.r * 180 / Math.PI)); return; }
  C.layerBar.dataset.for = String(C.sel);
  const sizeS = slider({ label: '크기', min: 20, max: 300, value: Math.round(L.s / L.s0 * 100), unit: '%', onInput: (v) => { L.s = L.s0 * v / 100; draw(); } });
  const rotS = slider({ label: '회전', min: -45, max: 45, value: Math.round(L.r * 180 / Math.PI), unit: '°', onInput: (v) => { L.r = v * Math.PI / 180; draw(); } });
  const lightS = slider({ label: '밝기 맞춤', min: -40, max: 40, value: 0, onChange: (v) => { L.img = tone(L.orig, v); draw(); } });
  C.layerBar.sizeS = sizeS; C.layerBar.rotS = rotS;
  C.layerBar.replaceChildren(h('b', {}, L.name), sizeS, rotS, lightS,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', onclick: () => { L.f = !L.f; draw(); } }, '⇋ 뒤집기'),
      h('button', { class: 'btn ghost sm', onclick: () => { L.shadow = !L.shadow; draw(); } }, '🌑 그림자'),
      h('button', { class: 'btn ghost sm', onclick: () => { const i = C.sel; if (i < C.layers.length - 1) { [C.layers[i], C.layers[i + 1]] = [C.layers[i + 1], C.layers[i]]; C.sel++; draw(); } } }, '⬆ 앞으로'),
      h('button', { class: 'btn ghost sm', onclick: () => { const i = C.sel; if (i > 0) { [C.layers[i], C.layers[i - 1]] = [C.layers[i - 1], C.layers[i]]; C.sel--; draw(); } } }, '⬇ 뒤로'),
      h('button', { class: 'btn danger sm', onclick: () => { pushUndo(); C.layers.splice(C.sel, 1); C.sel = -1; draw(); } }, '🗑 빼기'),
      h('button', { class: 'btn sm', onclick: () => { C.sel = -1; draw(); } }, '✔ 완료')));
}

/** 밝기 조절한 새 레이어 이미지 */
function tone(src, v) {
  const c = copy(src), g = ctx2d(c), id = g.getImageData(0, 0, c.width, c.height), d = id.data, f = 1 + v / 100;
  for (let i = 0; i < d.length; i += 4) { d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
  g.putImageData(id, 0, 0); return c;
}

/** 방 사진의 조명에 맞춰 가구 사진 밝기·색을 살짝 맞춤 */
function matchRoom(layer) {
  const stat = (c, alphaOnly) => {
    const s = Math.min(1, 96 / Math.max(c.width, c.height)), w = Math.max(1, Math.round(c.width * s)), hh = Math.max(1, Math.round(c.height * s));
    const t = makeCanvas(w, hh); ctx2d(t).drawImage(c, 0, 0, w, hh);
    const d = ctx2d(t).getImageData(0, 0, w, hh).data, lab = [0, 0, 0]; let L = 0, A = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (alphaOnly && d[i + 3] < 128) continue; rgb2lab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, lab); L += lab[0]; A += lab[1]; B += lab[2]; n++; }
    return n ? [L / n, A / n, B / n] : [50, 0, 0];
  };
  const [rl, ra, rb] = stat(C.base, false), [ll, la, lb] = stat(layer, true);
  const f = Math.min(1.12, Math.max(0.82, 1 + 0.35 * (rl / Math.max(1, ll) - 1)));
  const da = (ra - la) * 0.15, db = (rb - lb) * 0.2;
  const out = copy(layer), g = ctx2d(out), id = g.getImageData(0, 0, out.width, out.height), d = id.data, lab = [0, 0, 0], rgb = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    rgb2lab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, lab);
    lab2rgb(Math.min(100, lab[0] * f), lab[1] + da, lab[2] + db, rgb);
    d[i] = rgb[0] * 255; d[i + 1] = rgb[1] * 255; d[i + 2] = rgb[2] * 255;
  }
  g.putImageData(id, 0, 0); return out;
}

function addLayer(img, name, { cx = 0.5, bottom = 0.9, width = 0.35 } = {}) {
  pushUndo();
  const fitted = matchRoom(img);
  const s = (C.W * width) / fitted.width;
  const L = { img: fitted, orig: fitted, name, x: C.W * cx, y: C.H * bottom - (fitted.height * s) / 2, s, s0: s, r: 0, f: false, shadow: true };
  C.layers.push(L); C.sel = C.layers.length - 1; draw();
  return L;
}

// ── 가구 사진 고르기·배경 지우기 ─────────────────────────
async function showChoices(f) {
  C.pickRow.classList.remove('hidden');
  C.pickRow.replaceChildren(h('p', { class: 'muted', style: { gridColumn: 'span 2' } }, `실제 ${f.ko} 사진 찾는 중…`));
  try {
    const q = `${STYLE_EN[C.ctx.style] || ''} ${f.q}`.trim();
    let list = await searchCommons(q, 16);
    if (list.length < 4) list = list.concat(await searchCommons(f.q, 16));
    if (!list.length) { C.pickRow.replaceChildren(h('p', { class: 'muted', style: { gridColumn: 'span 2' } }, '사진을 못 찾았어요. 다른 종류를 골라 보세요.')); return; }
    C.pickRow.replaceChildren(h('p', { class: 'small', style: { gridColumn: 'span 2' } }, '마음에 드는 사진을 톡 → 배경을 지워 내 방에 올려요'),
      ...list.slice(0, 12).map((p) => h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await placeFrom(p, f); } },
        h('img', { src: p.thumb, alt: p.title, loading: 'lazy', crossorigin: 'anonymous' }), h('small', {}, p.license || 'Commons'))));
  } catch (e) { C.pickRow.replaceChildren(h('p', { class: 'small', style: { gridColumn: 'span 2' } }, '사진 검색 실패: ' + errorText(e))); }
}

/** 실제 가구 사진 → 배경 제거된 캔버스 */
async function cutout(photo) {
  const img = await loadCorsImage(photo.thumb);
  const c = makeCanvas(img.naturalWidth, img.naturalHeight); ctx2d(c).drawImage(img, 0, 0);
  const { removeFlatBackground, trimTransparent, refineSelection } = await import('../core/mask.js');
  const flat = copy(c);
  const kept = removeFlatBackground(flat);
  if (kept > 0.06 && kept < 0.85) return trimTransparent(flat);
  // 배경이 단색이 아니면 AI로 가운데 물체만
  const { segmentOnce } = await import('../core/seg.js');
  const pts = [{ x: 0.5, y: 0.55, add: true }];
  const conf = await segmentOnce(c, pts);
  const { alpha } = refineSelection(conf, c, pts);
  const g = ctx2d(c), id = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < alpha.length; i++) id.data[i * 4 + 3] = Math.round(255 * Math.min(1, alpha[i] * 1.3));
  g.putImageData(id, 0, 0);
  return trimTransparent(c);
}

async function placeFrom(photo, f, where) {
  if (C.busy) return; C.busy = true;
  const p = progress(`${f.ko} 배경 지우는 중`);
  try {
    const cut = await cutout(photo);
    addLayer(cut, f.ko, where || { cx: 0.5, bottom: 0.9, width: f.key === 'sofa' || f.key === 'bed' ? 0.45 : f.key === 'plant' || f.key === 'lamp' ? 0.15 : 0.28 });
    C.credits.push({ creator: photo.creator, license: photo.license, link: photo.link });
    draw();
    if (!where) toast('끌어서 위치를, 두 손가락으로 크기를 맞추세요');
  } catch (e) { toast(errorText(e), 4500); console.error(e); }
  finally { p.done(); C.busy = false; }
}

async function autoArrange() {
  const set = AUTO_SET[C.ctx.room] || AUTO_SET.default;
  const p = progress(`${C.ctx.styleKo} 스타일 가구 찾는 중`);
  let ok = 0;
  try {
    for (let i = 0; i < set.length; i++) {
      const [key, cx, bottom, width] = set[i];
      const f = FURNITURE.find((x) => x.key === key);
      p.set(i / set.length, `${f.ko} 찾는 중…`);
      const q = `${STYLE_EN[C.ctx.style] || ''} ${f.q}`.trim();
      let list = await searchCommons(q, 10);
      if (!list.length) list = await searchCommons(f.q, 10);
      for (const photo of list.slice(0, 4)) {
        try {
          const cut = await cutout(photo);
          if (cut.width < 40 || cut.height < 40) continue;
          addLayer(cut, f.ko, { cx, bottom, width });
          C.credits.push({ creator: photo.creator, license: photo.license, link: photo.link });
          ok++; break;
        } catch { /* 다음 사진 */ }
      }
      await tick();
    }
  } catch (e) { toast(errorText(e), 4500); }
  finally { p.done(); }
  C.sel = -1; draw();
  toast(ok ? `${ok}개를 놓았어요. 톡 해서 위치·크기를 다듬으세요` : '가구 사진을 가져오지 못했어요 (인터넷 확인)', 4500);
}

// ── 방 물건 옮기기 · 색 바꾸기 ────────────────────────────
async function selectAt(nx, ny) {
  const { segment, resetImage } = await import('../core/seg.js');
  const { refineSelection } = await import('../core/mask.js');
  resetImage();
  const taps = [{ x: nx, y: ny, add: true }];
  const conf = await segment(C.base, taps);
  resetImage();
  return refineSelection(conf, C.base, taps);
}

async function liftObject(nx, ny) {
  const p = progress('물체 테두리 찾는 중');
  try {
    const { mask, alpha } = await selectAt(nx, ny);
    const { bboxOf, dilate, fastFill } = await import('../core/inpaint.js');
    const bb = bboxOf(mask, C.W, C.H);
    if (!bb) { toast('물체를 못 찾았어요. 물체 한가운데를 톡 해 보세요'); return; }
    pushUndo();
    const lay = makeCanvas(bb.w, bb.h), lg = ctx2d(lay);
    lg.drawImage(C.base, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    const id = lg.getImageData(0, 0, bb.w, bb.h);
    for (let y = 0; y < bb.h; y++) for (let x = 0; x < bb.w; x++) {
      const i = (bb.y + y) * C.W + bb.x + x;
      id.data[(y * bb.w + x) * 4 + 3] = mask[i] ? 255 * Math.min(1, alpha[i] * 1.4) : 0;
    }
    lg.putImageData(id, 0, 0);
    p.set(0.6, '빈자리 채우는 중');
    fastFill(C.base, dilate(mask, C.W, C.H, Math.max(3, Math.round(Math.max(C.W, C.H) * 0.006))));
    const L = { img: lay, orig: lay, name: '내 물건', x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, s: 1, s0: 1, r: 0, f: false, shadow: false };
    C.layers.push(L); C.sel = C.layers.length - 1; draw();
    toast('끌어서 옮기세요. 빈자리가 어색하면 물체 선택 메뉴의 고품질 채움을 쓰세요', 4500);
  } catch (e) { toast(errorText(e), 4500); console.error(e); }
  finally { p.done(); }
}

async function recolorAt(nx, ny) {
  const p = progress('색 바꾸는 중');
  try {
    const { mask, alpha } = await selectAt(nx, ny);
    pushUndo();
    const hex = C.color, t = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    const tl = [0, 0, 0]; rgb2lab(t[0], t[1], t[2], tl);
    const g = ctx2d(C.base), id = g.getImageData(0, 0, C.W, C.H), d = id.data, lab = [0, 0, 0], rgb = [0, 0, 0];
    let sum = 0, n = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { rgb2lab(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255, lab); sum += lab[0]; n++; }
    if (!n) { toast('면을 못 찾았어요. 벽·바닥 한가운데를 톡 해 보세요'); return; }
    const k = tl[0] / Math.max(1, sum / n); // 원래 명암 무늬는 유지하면서 목표 밝기로
    for (let i = 0; i < mask.length; i++) {
      const a = mask[i] ? Math.min(1, alpha[i] * 1.2) : 0; if (!a) continue;
      const j = i * 4;
      rgb2lab(d[j] / 255, d[j + 1] / 255, d[j + 2] / 255, lab);
      lab2rgb(Math.min(100, lab[0] * (0.25 + 0.75 * k)), tl[1], tl[2], rgb);
      d[j] = d[j] * (1 - a) + rgb[0] * 255 * a; d[j + 1] = d[j + 1] * (1 - a) + rgb[1] * 255 * a; d[j + 2] = d[j + 2] * (1 - a) + rgb[2] * 255 * a;
    }
    g.putImageData(id, 0, 0); draw();
  } catch (e) { toast(errorText(e), 4500); console.error(e); }
  finally { p.done(); }
}

// ── 손가락 ──────────────────────────────────────────
function hitLayer(x, y) {
  for (let i = C.layers.length - 1; i >= 0; i--) {
    const L = C.layers[i];
    const dx = x - L.x, dy = y - L.y, c = Math.cos(-L.r), s = Math.sin(-L.r);
    const lx = (dx * c - dy * s) / L.s * (L.f ? -1 : 1) + L.img.width / 2, ly = (dx * s + dy * c) / L.s + L.img.height / 2;
    if (lx < 0 || ly < 0 || lx >= L.img.width || ly >= L.img.height) continue;
    const a = ctx2d(L.img).getImageData(lx | 0, ly | 0, 1, 1).data[3];
    if (a > 30) return i;
  }
  return -1;
}

function bindPointer(stage) {
  const ptrs = new Map(); let drag = null, pinch = null, moved = false;
  const toImg = (e) => { const r = C.view.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * C.W, ((e.clientY - r.top) / r.height) * C.H]; };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, toImg(e)); moved = false;
    const [x, y] = toImg(e);
    if (ptrs.size === 1) {
      const hit = hitLayer(x, y);
      if (hit >= 0) { C.sel = hit; const L = C.layers[hit]; drag = { x, y, ox: L.x, oy: L.y, undo: false }; draw(); }
      else drag = null;
    }
    if (ptrs.size === 2 && C.layers[C.sel]) {
      const [a, b] = [...ptrs.values()], L = C.layers[C.sel];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), s: L.s, r: L.r }; drag = null;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), cur = toImg(e); ptrs.set(e.pointerId, cur);
    if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 2) moved = true;
    const L = C.layers[C.sel]; if (!L) return;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      L.s = Math.max(L.s0 * 0.2, Math.min(L.s0 * 3, pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
      L.r = pinch.r + Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.ang; draw();
    } else if (drag) {
      if (!drag.undo) { pushUndo(); drag.undo = true; }
      L.x = drag.ox + cur[0] - drag.x; L.y = drag.oy + cur[1] - drag.y; draw();
    }
  });
  const up = async (e) => {
    const start = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size) return;
    const wasDrag = drag; drag = null;
    if (e.type !== 'pointerup' || moved || wasDrag || !start) return;
    // 빈 곳을 톡 한 경우
    if (C.sel >= 0) { C.sel = -1; draw(); return; }
    const [x, y] = start, nx = x / C.W, ny = y / C.H;
    if (C.mode === 'move') await liftObject(nx, ny);
    else if (C.mode === 'color') await recolorAt(nx, ny);
    else toast('위에서 가구 종류를 먼저 고르세요');
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
}

// ── 되돌리기·저장 ─────────────────────────────────────
function pushUndo() {
  C.undo.push({ base: copy(C.base), layers: C.layers.map((L) => ({ ...L })), credits: [...C.credits] });
  if (C.undo.length > 6) C.undo.shift();
}
function undo() {
  const u = C.undo.pop();
  if (!u) { toast('되돌릴 것이 없어요'); return; }
  C.base = u.base; C.layers = u.layers; C.credits = u.credits; C.sel = -1; draw();
}
async function save() {
  const out = makeCanvas(C.W, C.H), g = ctx2d(out);
  g.drawImage(C.base, 0, 0); C.layers.forEach((L) => drawLayer(g, L));
  const blob = await canvasToBlob(out, 'image/jpeg', 0.93);
  const name = `인테리어_배치_${Date.now()}.jpg`;
  await history.add('인테리어', name, blob, thumbOf(out));
  await shareOrDownload([{ blob, name }]);
  toast('저장했어요 (원본 방 사진은 그대로)');
}

/** 추천 스타일이 바뀌면 자동 배치·가구 검색 기준만 바꿈 (배치한 내용은 유지) */
export function updateContext(ctx) { if (C) C.ctx = { ...C.ctx, ...ctx }; }

export async function confirmLeave() { return !C?.layers.length || confirmBox('배치한 내용을 저장하지 않고 나갈까요?', '나가기'); }
