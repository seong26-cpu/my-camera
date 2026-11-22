// ① 보정 — 수동·자동 보정, 자르기·회전, 내 스타일(LUT) 만들기·입히기, 여러 장 한 번에 저장
import { h, toast, progress, slider, segmented, pageHeader, pickButtons, errorText } from '../core/ui.js';
import { loadBitmap, toCanvas, makeCanvas, ctx2d, canvasToBlob, keepExif, shareOrDownload, zipBlobs, downloadBlob, baseName, stamp, tick } from '../core/img.js';
import { DEFAULT_ADJ, processImageData, processCanvas, computeAuto, applyGeometry } from '../core/adjust.js';
import { imageDataToLab, learnStats, buildLut, lutToCube, parseCube, findPairs, DEFAULT_BRIGHT } from '../core/lut.js';
import { luts as lutStore, history, thumbOf } from '../core/store.js';

const PREVIEW = 1280;
const S = {
  files: [], idx: 0, bmp: null, base: null,
  adj: { ...DEFAULT_ADJ }, geo: { rotate: 0, flip: false, ratio: 'orig', cropX: 0.5, cropY: 0.5 },
  lut: null, lutName: '', lutStrength: 1, showOriginal: false,
};
let stageCanvas, rafId = 0, els = {};

export function leave() { cancelAnimationFrame(rafId); S.bmp?.close?.(); S.bmp = null; }

export async function render(root) {
  Object.assign(S, { files: [], idx: 0, bmp: null, base: null, adj: { ...DEFAULT_ADJ }, geo: { rotate: 0, flip: false, ratio: 'orig', cropX: 0.5, cropY: 0.5 }, lut: null, lutName: '', lutStrength: 1 });
  stageCanvas = makeCanvas(10, 10);
  els.empty = h('div', { class: 'card' }, h('p', {}, '보정할 사진을 고르세요. 여러 장을 고르면 같은 보정을 한 번에 저장할 수 있어요.'), pickButtons(openFiles));
  els.workspace = h('div', { class: 'hidden' });
  root.append(pageHeader('보정', '원본은 그대로, 결과는 새 파일로'), els.empty, els.workspace, styleMaker());
  buildWorkspace();
}

async function openFiles(files) {
  S.files = files; S.idx = 0;
  els.empty.classList.add('hidden'); els.workspace.classList.remove('hidden');
  await renderStrip();
  await loadCurrent();
}

async function renderStrip() {
  els.strip.replaceChildren();
  if (S.files.length < 2) { els.strip.classList.add('hidden'); els.saveAll.classList.add('hidden'); return; }
  els.strip.classList.remove('hidden'); els.saveAll.classList.remove('hidden');
  els.saveAll.textContent = `🗂 ${S.files.length}장 모두 같은 보정으로 저장`;
  S.files.forEach((f, i) => {
    const img = h('img', { alt: f.name, class: i === S.idx ? 'on' : '', onclick: async () => { S.idx = i; [...els.strip.children].forEach((c, j) => c.classList.toggle('on', j === i)); await loadCurrent(); } });
    els.strip.append(img);
    loadBitmap(f).then((b) => { img.src = toCanvas(b, 128).toDataURL('image/jpeg', 0.6); b.close?.(); }).catch(() => {});
  });
}

async function loadCurrent() {
  const p = progress('사진 여는 중');
  try {
    S.bmp?.close?.();
    S.bmp = await loadBitmap(S.files[S.idx]);
    rebuildBase();
  } catch (e) { toast('사진을 열 수 없습니다: ' + errorText(e)); }
  finally { p.done(); }
}

function rebuildBase() {
  if (!S.bmp) return;
  const small = toCanvas(S.bmp, PREVIEW);
  S.base = applyGeometry(small, S.geo);
  stageCanvas.width = S.base.width; stageCanvas.height = S.base.height;
  if (S.adj.auto) S.adj.auto = computeAuto(ctx2d(S.base).getImageData(0, 0, S.base.width, S.base.height));
  schedule();
}

function schedule() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(draw); }
function draw() {
  if (!S.base) return;
  const g = ctx2d(stageCanvas);
  g.drawImage(S.base, 0, 0);
  if (!S.showOriginal) {
    const id = g.getImageData(0, 0, stageCanvas.width, stageCanvas.height);
    processImageData(id, S.adj, S.lut, S.lutStrength);
    g.putImageData(id, 0, 0);
  }
  els.badge.textContent = S.showOriginal ? '원본' : (S.lut ? `보정 · ${S.lutName}` : '보정');
}

function buildWorkspace() {
  els.badge = h('span', { class: 'badge' }, '보정');
  const stage = h('div', { class: 'stage' }, stageCanvas, els.badge);
  const hold = (v) => () => { S.showOriginal = v; schedule(); };
  stage.addEventListener('pointerdown', hold(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => stage.addEventListener(e, hold(false)));
  els.strip = h('div', { class: 'strip hidden' });

  // 조정
  const sliders = [
    ['exposure', '밝기'], ['contrast', '대비'], ['highlights', '밝은 곳'], ['shadows', '어두운 곳'],
    ['saturation', '채도'], ['warmth', '색온도'], ['tint', '색조'], ['sharpen', '선명도', 0], ['vignette', '비네팅', 0],
  ].map(([k, label, min = -100]) => {
    const s = slider({ label, min, max: 100, value: S.adj[k], onInput: (v) => { S.adj[k] = v; schedule(); } });
    s.dataset.key = k; return s;
  });
  const autoBtn = h('button', { class: 'btn ghost', onclick: () => {
    if (S.adj.auto) { S.adj.auto = null; autoBtn.classList.remove('on'); }
    else { S.adj.auto = computeAuto(ctx2d(S.base).getImageData(0, 0, S.base.width, S.base.height)); autoBtn.classList.add('on'); }
    schedule();
  } }, '✨ 자동 보정');
  const resetBtn = h('button', { class: 'btn ghost', onclick: () => {
    S.adj = { ...DEFAULT_ADJ }; autoBtn.classList.remove('on');
    sliders.forEach((s) => s.setValue(0)); schedule();
  } }, '처음대로');
  const adjustPane = h('div', {}, h('div', { class: 'row' }, autoBtn, resetBtn), sliders, h('p', { class: 'muted small' }, '사진을 누르고 있으면 원본이 보여요. 슬라이더를 두 번 누르면 0으로.'));

  // 자르기·회전
  const posX = slider({ label: '좌우 위치', min: 0, max: 100, value: 50, onChange: (v) => { S.geo.cropX = v / 100; rebuildBase(); } });
  const posY = slider({ label: '위아래 위치', min: 0, max: 100, value: 50, onChange: (v) => { S.geo.cropY = v / 100; rebuildBase(); } });
  const cropPane = h('div', { class: 'hidden' },
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => { S.geo.rotate -= 90; rebuildBase(); } }, '⟲ 왼쪽'),
      h('button', { class: 'btn ghost', onclick: () => { S.geo.rotate += 90; rebuildBase(); } }, '⟳ 오른쪽'),
      h('button', { class: 'btn ghost', onclick: () => { S.geo.flip = !S.geo.flip; rebuildBase(); } }, '⇋ 좌우 뒤집기')),
    h('h2', {}, '비율로 자르기'),
    segmented([['orig', '원본'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['16:9', '16:9'], ['9:16', '9:16']], 'orig', (v) => { S.geo.ratio = v; rebuildBase(); }),
    posX, posY);

  // 내 스타일
  els.lutList = h('div', { class: 'chips' });
  const strength = slider({ label: '강도', min: 0, max: 100, value: 100, unit: '%', onInput: (v) => { S.lutStrength = v / 100; schedule(); } });
  const stylePane = h('div', { class: 'hidden' },
    h('p', { class: 'muted small' }, '보관함에 저장된 "내 스타일 표"를 골라 입혀요. 표가 없으면 아래 [내 스타일 만들기]부터.'),
    els.lutList, strength,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', onclick: importCube }, '📥 .cube 불러오기'),
      h('button', { class: 'btn ghost sm', onclick: () => { document.getElementById('maker').open = true; document.getElementById('maker').scrollIntoView({ behavior: 'smooth' }); } }, '🧪 내 스타일 만들기')));

  const panes = { adjust: adjustPane, crop: cropPane, style: stylePane };
  const tabs = h('div', { class: 'tabs' });
  for (const [k, label] of [['adjust', '조정'], ['crop', '자르기·회전'], ['style', '내 스타일']]) {
    tabs.append(h('button', { class: k === 'adjust' ? 'on' : '', onclick: (e) => {
      [...tabs.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on');
      Object.entries(panes).forEach(([pk, p]) => p.classList.toggle('hidden', pk !== k));
      if (k === 'style') refreshLutChips();
    } }, label));
  }

  els.saveAll = h('button', { class: 'btn green hidden', onclick: saveAll });
  els.workspace.append(
    els.strip, stage,
    h('div', { class: 'card' }, tabs, adjustPane, cropPane, stylePane),
    h('div', { class: 'sticky-actions' },
      h('button', { class: 'btn ghost', onclick: async () => { const fs = await (await import('../core/img.js')).pickFiles({ multiple: true }); if (fs.length) openFiles(fs); } }, '다른 사진'),
      h('button', { class: 'btn', onclick: saveOne }, '💾 저장')),
    els.saveAll);
  refreshLutChips();
}

async function refreshLutChips() {
  const all = await lutStore.all();
  els.lutList.replaceChildren(
    h('button', { class: 'chip' + (S.lut ? '' : ' on'), onclick: () => { S.lut = null; S.lutName = ''; refreshLutChips(); schedule(); } }, '없음'),
    ...all.map((l) => h('button', { class: 'chip' + (S.lutName === l.name && S.lut ? ' on' : ''), onclick: () => {
      try { S.lut = parseCube(l.cube); S.lutName = l.name; refreshLutChips(); schedule(); } catch (e) { toast(e.message); }
    } }, l.name)));
  if (!all.length) els.lutList.append(h('span', { class: 'muted small' }, '저장된 스타일이 아직 없어요'));
}

async function importCube() {
  const { pickFiles } = await import('../core/img.js');
  const [f] = await pickFiles({ multiple: false, accept: '.cube,text/plain' });
  if (!f) return;
  try {
    const text = await f.text();
    parseCube(text);
    await lutStore.add(baseName(f.name), text, { source: 'import' });
    toast('보관함에 추가했어요: ' + baseName(f.name));
    refreshLutChips();
  } catch (e) { toast(e.message); }
}

/** 원본 해상도로 처리한 결과 Blob */
async function renderFull(file, bmp) {
  const full = applyGeometry(toCanvas(bmp), S.geo);
  const adj = { ...S.adj };
  if (adj.auto) adj.auto = computeAuto(ctx2d(full).getImageData(0, 0, full.width, full.height));
  await processCanvas(full, adj, S.lut, S.lutStrength);
  const blob = await keepExif(file, await canvasToBlob(full, 'image/jpeg', 0.92));
  return { blob, name: `${baseName(file.name)}_보정.jpg`, thumb: thumbOf(full) };
}

async function saveOne() {
  if (!S.bmp) return;
  const p = progress('원본 크기로 저장 중');
  try {
    const out = await renderFull(S.files[S.idx], S.bmp);
    await history.add('보정', out.name, out.blob, out.thumb);
    p.done();
    await shareOrDownload([out]);
    toast('저장했어요 (원본은 그대로)');
  } catch (e) { p.done(); toast(errorText(e)); }
}

async function saveAll() {
  const p = progress(`${S.files.length}장 보정 중`, { cancellable: true });
  const outs = [];
  try {
    for (let i = 0; i < S.files.length; i++) {
      if (p.cancelled) break;
      p.set(i / S.files.length, `${i + 1}/${S.files.length} · ${S.files[i].name}`);
      const bmp = await loadBitmap(S.files[i]);
      try { outs.push(await renderFull(S.files[i], bmp)); } finally { bmp.close?.(); }
      await tick();
    }
    if (!outs.length) { p.done(); return; }
    p.set(1, '묶는 중…');
    for (const o of outs) await history.add('보정', o.name, o.blob, o.thumb);
    if (outs.length <= 10) { p.done(); await shareOrDownload(outs); }
    else { const z = await zipBlobs(outs); p.done(); downloadBlob(z, `보정_${stamp()}.zip`); }
    toast(`${outs.length}장 저장 완료`);
  } catch (e) { p.done(); toast(errorText(e)); }
}

// ── 내 스타일 만들기 (편남 v8.0 방식) ─────────────────────
function styleMaker() {
  const st = { pairs: [], labs: null, stats: null, bright: DEFAULT_BRIGHT, lut: null, before: [], after: [] };
  const info = h('div', { class: 'note' }, '비포(원본)·애프터(내가 보정한 사진) 짝 3~7쌍이면 충분해요. 맑은 날·흐린 날·실내·저녁을 섞을수록 좋아요.');
  const pairInfo = h('p', { class: 'small' });
  const cmp = h('div', { class: 'row' });
  const brightS = slider({ label: '밝기 반영', min: 0, max: 100, value: 40, unit: '%', onChange: (v) => { st.bright = v / 100; if (st.stats) rebuild(); } });
  const nameIn = h('input', { type: 'text', value: '내 스타일', 'aria-label': '스타일 이름' });
  const result = h('div', { class: 'hidden' },
    h('h2', {}, '결과 비교 (왼쪽: 원본에 표를 입힌 것 · 오른쪽: 실제 애프터)'), cmp, brightS,
    h('p', { class: 'muted small' }, '사진이 하얗게 뜨면 밝기 반영을 낮추고, 변화가 적으면 올리세요 (v8.0 기본값 40%).'),
    h('label', { class: 'field' }, h('span', {}, '이름'), nameIn),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => {
        const cube = lutToCube(st.lut, nameIn.value || '내 스타일');
        await lutStore.add(nameIn.value || '내 스타일', cube, { pairs: st.pairs.length, bright: st.bright });
        toast('보관함에 저장했어요'); refreshLutChips();
      } }, '보관함에 저장'),
      h('button', { class: 'btn ghost', onclick: () => downloadBlob(new Blob([lutToCube(st.lut, nameIn.value)], { type: 'text/plain' }), `${nameIn.value || '내스타일'}.cube`) }, '.cube 내려받기')));

  async function rebuild() {
    st.lut = buildLut(st.stats, st.bright);
    cmp.replaceChildren();
    const first = st.pairs[0];
    const bb = await loadBitmap(first.before), ab = await loadBitmap(first.after);
    const c1 = toCanvas(bb, 360), c2 = toCanvas(ab, 360); bb.close?.(); ab.close?.();
    const g = ctx2d(c1), id = g.getImageData(0, 0, c1.width, c1.height);
    processImageData(id, DEFAULT_ADJ, st.lut, 1); g.putImageData(id, 0, 0);
    [c1, c2].forEach((c) => { c.style.width = 'calc(50% - 4px)'; c.style.borderRadius = '10px'; });
    cmp.append(c1, c2);
    result.classList.remove('hidden');
  }

  async function make() {
    let pairs = findPairs([...st.before, ...st.after]);
    if (!pairs.length && st.before.length && st.before.length === st.after.length) {
      // 이름 규칙이 없으면 고른 순서(이름순)대로 짝짓기
      const by = (a, b) => a.name.localeCompare(b.name);
      const B = [...st.before].sort(by), A = [...st.after].sort(by);
      pairs = B.map((b, i) => ({ key: b.name, before: b, after: A[i] }));
    }
    if (!pairs.length) { toast('짝을 못 찾았어요. 비포·애프터를 같은 개수로 고르거나 이름을 "이름_before / 이름_after"로 맞춰 주세요.', 4200); return; }
    const p = progress('내 스타일 배우는 중');
    try {
      const B = [], A = [];
      for (let i = 0; i < pairs.length; i++) {
        p.set(i / pairs.length, `${i + 1}/${pairs.length}쌍 읽는 중`);
        for (const [f, arr] of [[pairs[i].before, B], [pairs[i].after, A]]) {
          const bmp = await loadBitmap(f); const c = toCanvas(bmp, 512); bmp.close?.();
          arr.push(imageDataToLab(ctx2d(c).getImageData(0, 0, c.width, c.height)));
          await tick();
        }
      }
      p.set(0.95, '표 만드는 중');
      st.pairs = pairs; st.stats = learnStats(B, A);
      await rebuild();
      pairInfo.textContent = `${pairs.length}쌍 사용` + (pairs.length < 3 ? ' — 쌍이 적어 색이 덜 안정적일 수 있어요' : '') + ` · 배운 밝기 차 ${st.stats.learnedBrightDiff >= 0 ? '+' : ''}${st.stats.learnedBrightDiff.toFixed(1)}`;
    } catch (e) { toast(errorText(e)); }
    finally { p.done(); }
  }

  const cnt = h('p', { class: 'small' }, '비포 0장 · 애프터 0장');
  const upd = () => { cnt.textContent = `비포 ${st.before.length}장 · 애프터 ${st.after.length}장`; };
  const pick = async (which) => {
    const { pickFiles } = await import('../core/img.js');
    const fs = await pickFiles({ multiple: true });
    if (fs.length) { st[which] = fs; upd(); }
  };
  return h('details', { id: 'maker', class: 'card' },
    h('summary', {}, '🧪 내 스타일 만들기 (비포/애프터로 배우기)'),
    info,
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn ghost grow', onclick: () => pick('before') }, '① 비포(원본) 고르기'),
      h('button', { class: 'btn ghost grow', onclick: () => pick('after') }, '② 애프터(보정본) 고르기')),
    cnt,
    h('p', { class: 'muted small' }, '한 번에 섞어서 골라도 돼요: 파일 이름이 "사진1_before / 사진1_after" 또는 "_원본 / _보정"이면 알아서 짝을 맞춥니다. 아니면 비포·애프터를 같은 순서·같은 개수로 고르세요.'),
    h('button', { class: 'btn', onclick: make }, '③ 스타일 표 만들기'),
    pairInfo, result);
}
