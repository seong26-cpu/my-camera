// ⑦ 물체 선택 — 사진 속 물체를 톡 → 그 물체만 추출(투명 PNG) / 지우기 / 옮기기
import { h, toast, progress, slider, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, makeCanvas, ctx2d, canvasToBlob, shareOrDownload, baseName, keepExif } from '../core/img.js';
import { segment, resetImage } from '../core/seg.js';
import { dilate, bboxOf, fastFill, lamaFill, lamaReady } from '../core/inpaint.js';
import { history, thumbOf } from '../core/store.js';

const WORK = 2048;
let S, stage, view, els = {};

function fresh() {
  return { file: null, img: null, W: 0, H: 0, taps: [], conf: null, strokes: [], mask: null, mode: 'add', brush: 24,
    moving: null, bg: null, layer: null, pos: null };
}

export function leave() { resetImage(); }

export async function render(root) {
  S = fresh();
  view = makeCanvas(10, 10);
  stage = h('div', { class: 'stage' }, view);
  els.empty = h('div', { class: 'card' },
    h('p', {}, '사진을 고른 뒤, 원하는 물체를 손가락으로 톡 누르세요. 그 물체만 골라져요.'),
    pickButtons(open, { multiple: false }),
    h('div', { class: 'note', style: { marginTop: '10px' } }, '처음 한 번 물체 인식 모델을 내려받아요(와이파이 권장). 이후엔 폰에 저장돼 빨라요.'));
  els.ws = h('div', { class: 'hidden' });
  root.append(pageHeader('물체 선택', '톡 → 추출·지우기·옮기기'), els.empty, els.ws);
  buildWs();
  bindPointer();
}

async function open([file]) {
  if (!file) return;
  const p = progress('사진 여는 중');
  try {
    const bmp = await loadBitmap(file);
    S = { ...fresh(), file, img: toCanvas(bmp, WORK) }; bmp.close?.();
    S.W = S.img.width; S.H = S.img.height;
    view.width = S.W; view.height = S.H;
    resetImage();
    els.empty.classList.add('hidden'); els.ws.classList.remove('hidden'); els.saveCur.classList.add('hidden');
    setMode('add'); setPhase('select');
    draw();
  } catch (e) { toast(errorText(e)); }
  finally { p.done(); }
}

// ── 화면 ─────────────────────────────────────────────
function buildWs() {
  const modeBtn = (m, label) => h('button', { class: 'btn ghost sm', 'data-m': m, onclick: () => setMode(m) }, label);
  els.modes = h('div', { class: 'row' }, modeBtn('add', '➕ 톡 선택'), modeBtn('sub', '➖ 톡 빼기'), modeBtn('paint', '🖌 칠해서 더하기'), modeBtn('erase', '🧽 칠해서 빼기'));
  els.brush = slider({ label: '붓 크기', min: 6, max: 120, value: 24, onInput: (v) => (S.brush = v) });
  els.selPanel = h('div', { class: 'card' },
    els.modes, els.brush,
    h('p', { class: 'muted small' }, '덜 잡혔으면 ➕로 더 톡, 너무 많이 잡혔으면 ➖로 톡. 테두리는 붓으로 다듬어요.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', onclick: undo }, '↶ 되돌리기'),
      h('button', { class: 'btn ghost sm', onclick: () => { S.taps = []; S.strokes = []; S.conf = null; rebuildMask(); draw(); } }, '선택 지우기')),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn grow', onclick: extract }, '✂️ 추출 (투명 PNG)'),
      h('button', { class: 'btn green grow', onclick: () => startMove() }, '✋ 옮기기'),
      h('button', { class: 'btn ghost grow', onclick: removeObj }, '🧹 지우기')),
    els.saveCur = h('button', { class: 'btn hidden', style: { width: '100%', marginTop: '8px' }, onclick: () => saveCanvas(S.img, '지움') }, '💾 지금 사진 저장'));

  els.scale = slider({ label: '크기', min: 20, max: 300, value: 100, unit: '%', onInput: (v) => { if (S.pos) { S.pos.s = v / 100; draw(); } } });
  els.rot = slider({ label: '회전', min: -180, max: 180, value: 0, unit: '°', onInput: (v) => { if (S.pos) { S.pos.r = (v * Math.PI) / 180; draw(); } } });
  els.flipBtn = h('button', { class: 'btn ghost sm', onclick: () => { S.pos.f = !S.pos.f; draw(); } }, '⇋ 좌우 뒤집기');
  els.hqBtn = h('button', { class: 'btn ghost sm', onclick: hqFill }, '🪄 빈자리 고품질로 다시 채우기');
  els.movePanel = h('div', { class: 'card hidden' },
    h('p', { class: 'small' }, '물체를 손가락으로 끌어 옮기세요. 두 손가락으로 크기·회전도 돼요.'),
    els.scale, els.rot, h('div', { class: 'row' }, els.flipBtn, els.hqBtn),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn ghost grow', onclick: () => setPhase('select') }, '← 선택으로'),
      h('button', { class: 'btn grow', onclick: saveMoved }, '💾 저장')));

  els.ws.append(stage, els.selPanel, els.movePanel,
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost', onclick: async () => { const { pickFiles } = await import('../core/img.js'); open(await pickFiles({ multiple: false })); } }, '다른 사진')));
}

function setMode(m) {
  S.mode = m;
  [...els.modes.children].forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  els.brush.classList.toggle('hidden', !(m === 'paint' || m === 'erase'));
}
function setPhase(p) {
  els.selPanel.classList.toggle('hidden', p !== 'select');
  els.movePanel.classList.toggle('hidden', p !== 'move');
  if (p === 'select') { S.moving = null; S.layer = null; S.bg = null; S.pos = null; }
  draw();
}

function draw() {
  if (!S.img) return;
  const g = ctx2d(view);
  if (S.layer && S.pos) {
    g.drawImage(S.bg, 0, 0);
    const { x, y, s, r, f } = S.pos, L = S.layer;
    g.save(); g.translate(x, y); g.rotate(r); g.scale(f ? -s : s, s);
    g.drawImage(L, -L.width / 2, -L.height / 2);
    g.restore();
    return;
  }
  g.drawImage(S.img, 0, 0);
  if (S.mask) {
    const ov = g.getImageData(0, 0, S.W, S.H), d = ov.data, m = S.mask;
    for (let i = 0; i < m.length; i++) if (m[i]) { const k = i * 4; d[k] = d[k] * 0.45 + 217 * 0.55; d[k + 1] = d[k + 1] * 0.45 + 101 * 0.55; d[k + 2] = d[k + 2] * 0.45 + 59 * 0.55; }
    g.putImageData(ov, 0, 0);
  }
  const R = Math.max(6, S.W / 90);
  for (const t of S.taps) {
    g.beginPath(); g.arc(t.x * S.W, t.y * S.H, R, 0, Math.PI * 2);
    g.fillStyle = t.add ? '#2f7a68' : '#b3261e'; g.fill(); g.lineWidth = R / 3; g.strokeStyle = '#fff'; g.stroke();
  }
}

// ── 선택 ─────────────────────────────────────────────
function rebuildMask() {
  const n = S.W * S.H;
  const m = new Uint8Array(n);
  if (S.conf) for (let i = 0; i < n; i++) m[i] = S.conf[i] > 0.5 ? 1 : 0;
  S.brushAdd = new Uint8Array(n);
  for (const st of S.strokes) {
    const r = st.r, r2 = r * r;
    for (const [px, py] of st.pts) {
      const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(S.W - 1, Math.ceil(px + r));
      const y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(S.H - 1, Math.ceil(py + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if ((x - px) ** 2 + (y - py) ** 2 > r2) continue;
        const i = y * S.W + x; m[i] = st.add ? 1 : 0; S.brushAdd[i] = st.add ? 1 : 0;
      }
    }
  }
  S.mask = m.some((v) => v) ? m : null;
}

let segBusy = false;
async function tapAt(nx, ny, add) {
  if (segBusy) return;
  segBusy = true;
  S.taps.push({ x: nx, y: ny, add, t: Date.now() });
  draw();
  let p = null;
  const slow = setTimeout(() => (p = progress('물체 인식 모델 준비 중 (처음 한 번)')), 400);
  try {
    S.conf = await segment(S.img, S.taps);
    rebuildMask();
  } catch (e) {
    S.taps.pop(); console.error(e);
    toast(errorText(e), 5000);
  } finally { clearTimeout(slow); p?.done(); segBusy = false; draw(); }
}

function undo() {
  if (S.strokes.length && (!S.taps.length || S.strokes.at(-1).t > (S.taps.at(-1).t || 0))) S.strokes.pop();
  else if (S.taps.length) { S.taps.pop(); if (!S.taps.length) S.conf = null; else return tapReplay(); }
  rebuildMask(); draw();
}
async function tapReplay() {
  try { S.conf = await segment(S.img, S.taps); } catch {}
  rebuildMask(); draw();
}

// ── 손가락 처리 ───────────────────────────────────────
function bindPointer() {
  const ptrs = new Map();
  let painting = null, drag = null, pinch = null;
  const toImg = (e) => { const r = view.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * S.W, ((e.clientY - r.top) / r.height) * S.H]; };
  stage.addEventListener('pointerdown', (e) => {
    if (!S.img) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, toImg(e));
    if (S.layer) {
      if (ptrs.size === 1) { const [x, y] = toImg(e); drag = { x, y, ox: S.pos.x, oy: S.pos.y }; }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), s: S.pos.s, r: S.pos.r };
        drag = null;
      }
      return;
    }
    if (S.mode === 'paint' || S.mode === 'erase') {
      const r = (S.brush / view.getBoundingClientRect().width) * S.W;
      painting = { add: S.mode === 'paint', r, pts: [toImg(e)], t: Date.now() };
      S.strokes.push(painting); rebuildMask(); draw();
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, toImg(e));
    if (S.layer) {
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        S.pos.s = Math.max(0.2, Math.min(3, pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
        S.pos.r = pinch.r + Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.ang;
        els.scale.setValue(Math.round(S.pos.s * 100)); els.rot.setValue(Math.round((S.pos.r * 180) / Math.PI));
      } else if (drag) { const [x, y] = toImg(e); S.pos.x = drag.ox + x - drag.x; S.pos.y = drag.oy + y - drag.y; }
      draw(); return;
    }
    if (painting) { painting.pts.push(toImg(e)); rebuildMask(); draw(); }
  });
  const up = (e) => {
    const start = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (S.layer) { if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; return; }
    if (painting) { painting = null; return; }
    if (e.type === 'pointerup' && start && (S.mode === 'add' || S.mode === 'sub')) {
      const [x, y] = start; tapAt(x / S.W, y / S.H, S.mode === 'add');
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
}

// ── 결과 만들기 ───────────────────────────────────────
function needMask() { if (!S.mask) { toast('먼저 물체를 톡 눌러 선택하세요'); return false; } return true; }

/** 물체만 잘라낸 투명 캔버스 + 위치 */
function cutLayer() {
  const bb = bboxOf(S.mask, S.W, S.H);
  const c = makeCanvas(bb.w, bb.h), g = ctx2d(c);
  g.drawImage(S.img, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
  const id = g.getImageData(0, 0, bb.w, bb.h), d = id.data;
  for (let y = 0; y < bb.h; y++) for (let x = 0; x < bb.w; x++) {
    const i = (bb.y + y) * S.W + bb.x + x;
    let a = 0;
    if (S.mask[i]) a = S.brushAdd?.[i] || !S.conf ? 1 : Math.min(1, Math.max(0.35, (S.conf[i] - 0.3) / 0.4));
    d[(y * bb.w + x) * 4 + 3] = a * 255;
  }
  g.putImageData(id, 0, 0);
  return { canvas: c, bb };
}

async function extract() {
  if (!needMask()) return;
  const { canvas } = cutLayer();
  const blob = await canvasToBlob(canvas, 'image/png');
  const name = `${baseName(S.file.name)}_물체.png`;
  await history.add('추출', name, blob, thumbOf(canvas));
  await shareOrDownload([{ blob, name }]);
  toast('투명 배경 PNG로 저장했어요');
}

function holeMask() {
  const r = Math.max(3, Math.round(Math.max(S.W, S.H) * 0.006));
  return dilate(S.mask, S.W, S.H, r);
}

async function filledBackground(hq) {
  const bg = makeCanvas(S.W, S.H); ctx2d(bg).drawImage(S.img, 0, 0);
  const hole = holeMask();
  if (hq) {
    const p = progress('고품질 채움');
    try { await lamaFill(bg, hole, (r, t) => p.set(r, t)); }
    finally { p.done(); }
  } else fastFill(bg, hole);
  return bg;
}

async function removeObj() {
  if (!needMask()) return;
  const hq = await askQuality();
  if (hq == null) return;
  try {
    const bg = await filledBackground(hq);
    S.img = bg; S.taps = []; S.strokes = []; S.conf = null; S.mask = null; resetImage();
    els.saveCur.classList.remove('hidden');
    draw();
    toast('지웠어요. [💾 지금 사진 저장]으로 저장하거나 다른 물체를 더 고르세요', 4000);
  } catch (e) { toast(errorText(e), 5000); }
}

async function askQuality() {
  const ready = await lamaReady();
  return new Promise((res) => {
    const close = (v) => { box.remove(); res(v); };
    const box = h('div', { class: 'overlay' }, h('div', { class: 'pbox' },
      h('div', { class: 'ptitle' }, '빈자리를 어떻게 채울까요?'),
      h('p', { class: 'pmsg' }, '빠른 채움: 바로 되고 작은 물체에 좋아요.', h('br'), '고품질: AI가 배경을 그려 넣어요' + (ready ? ' (준비됨)' : ' — 처음 한 번 모델을 내려받아요(와이파이 권장)') + '. 폰에 따라 수십 초 걸릴 수 있어요.'),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => close(null) }, '취소'),
        h('button', { class: 'btn ghost', onclick: () => close(false) }, '빠른 채움'),
        h('button', { class: 'btn', onclick: () => close(true) }, '고품질'))));
    document.body.append(box);
  });
}

async function startMove() {
  if (!needMask()) return;
  const { canvas, bb } = cutLayer();
  const p = progress('빈자리 채우는 중');
  try { S.bg = await filledBackground(false); } finally { p.done(); }
  S.hole = holeMask();
  setPhase('move');
  S.layer = canvas;
  S.pos = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, s: 1, r: 0, f: false };
  els.scale.setValue(100); els.rot.setValue(0);
  draw();
  toast('물체를 끌어서 옮겨 보세요');
}

async function hqFill() {
  try {
    const bg = makeCanvas(S.W, S.H); ctx2d(bg).drawImage(S.img, 0, 0);
    const p = progress('고품질 채움');
    try { await lamaFill(bg, S.hole, (r, t) => p.set(r, t)); } finally { p.done(); }
    S.bg = bg; draw(); toast('빈자리를 다시 채웠어요');
  } catch (e) { toast(errorText(e), 5000); }
}

async function saveMoved() {
  const out = makeCanvas(S.W, S.H), g = ctx2d(out);
  g.drawImage(S.bg, 0, 0);
  const { x, y, s, r, f } = S.pos, L = S.layer;
  g.save(); g.translate(x, y); g.rotate(r); g.scale(f ? -s : s, s); g.drawImage(L, -L.width / 2, -L.height / 2); g.restore();
  await saveCanvas(out, '옮김');
}

async function saveCanvas(c, tag) {
  let blob = await canvasToBlob(c, 'image/jpeg', 0.93);
  blob = await keepExif(S.file, blob);
  const name = `${baseName(S.file.name)}_${tag}.jpg`;
  await history.add(tag, name, blob, thumbOf(c));
  await shareOrDownload([{ blob, name }]);
  toast('저장했어요 (원본은 그대로)');
}
