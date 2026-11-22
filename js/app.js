// 나의 카메라 — 화면 이동(라우터)과 처음 화면
import { h, toast } from './core/ui.js';

export const APP_VERSION = '1.1.0';

// 처음 화면 타일: 실제 사진(CC0·퍼블릭 도메인)을 Openverse에서 자동으로 찾아 배경으로 씀
const PAGES = {
  edit: { file: 'edit', icon: '🎨', title: '보정', desc: '밝기·색감·내 스타일', photo: 'camera lens photography' },
  object: { file: 'object', icon: '✂️', title: '물체 선택', desc: '톡 → 추출·옮기기', photo: 'armchair room' },
  ocr: { file: 'ocr', icon: '🔤', title: '글자 추출', desc: '사진 속 글씨 → 텍스트', photo: 'open book pages' },
  interior: { file: 'interior', icon: '🛋', title: '인테리어', desc: '방 분석 + 실제 사진', photo: 'living room interior' },
  batch: { file: 'batch', icon: '🗂', title: '일괄 처리', desc: '여러 장 한 번에', photo: 'old photographs pile' },
  convert: { file: 'convert', icon: '🔁', title: '파일 변환', desc: 'JPG·PNG·PDF·HEIC', photo: 'printed photos desk' },
  library: { file: 'library', icon: '📦', title: '보관함·설정', desc: '', photo: 'wooden storage shelves' },
  help: { file: 'help', icon: '❓', title: '도움말', desc: '', photo: 'notebook pen on desk' },
};
const HERO = 'vintage camera';

let current = null;
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.getElementById('install')?.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { installEvt = null; document.getElementById('install')?.classList.add('hidden'); toast('홈 화면에 설치됐어요'); });

async function fillPhoto(el, query) {
  try {
    const { coverPhoto } = await import('./core/photos.js');
    const p = await coverPhoto(query);
    if (!p) return;
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = `url("${p.thumb}")`; el.classList.add('on'); };
    img.src = p.thumb;
  } catch { /* 인터넷이 없으면 기본 색 배경 */ }
}

function home(root) {
  const tile = (key) => {
    const p = PAGES[key], bg = h('i', { class: 'bg' });
    fillPhoto(bg, p.photo);
    return h('a', { class: 'tile photo', href: '#/' + key }, bg, h('b', {}, p.title), h('span', {}, p.desc));
  };
  const wideTile = (key, title, desc) => {
    const bg = h('i', { class: 'bg' });
    fillPhoto(bg, PAGES[key].photo);
    return h('a', { class: 'tile photo', href: '#/' + key, style: { gridColumn: 'span 2', minHeight: '96px' } }, bg, h('b', {}, title), h('span', {}, desc));
  };
  const heroBg = h('i', { class: 'bg' });
  fillPhoto(heroBg, HERO);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  root.append(
    h('div', { class: 'hero-img' }, heroBg, h('img', { class: 'logo', src: './icons/icon-192.png', alt: '' })),
    h('section', { class: 'hero', style: { paddingTop: '8px' } },
      h('h1', {}, '나의 카메라'),
      h('p', {}, '사진은 폰 밖으로 나가지 않아요. 모든 기능 무료.')),
    h('div', { id: 'install', class: 'install' + (installEvt && !standalone ? '' : ' hidden') },
      h('b', {}, '📲 홈 화면에 앱으로 설치'),
      h('button', { class: 'btn ghost sm', onclick: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; document.getElementById('install')?.classList.add('hidden'); } }, '설치')),
    h('div', { class: 'grid' },
      ['edit', 'object', 'ocr', 'interior', 'batch', 'convert'].map(tile),
      wideTile('library', '보관함·설정', '내 스타일 표 · 최근 결과 · AI 모델 준비 상태'),
      wideTile('help', '도움말', '처음이면 여기부터')),
    h('p', { class: 'credit' }, `v${APP_VERSION} · 배경 사진: Openverse의 CC0·퍼블릭 도메인 실사 사진`));
}

async function route() {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0]) || '';
  const root = document.getElementById('app');
  try { current?.leave?.(); } catch {}
  current = null;
  root.replaceChildren();
  window.scrollTo(0, 0);
  if (!PAGES[key]) { document.title = '나의 카메라'; home(root); return; }
  document.title = PAGES[key].title + ' · 나의 카메라';
  try {
    const mod = await import(`./pages/${PAGES[key].file}.js`);
    current = mod;
    await mod.render(root);
  } catch (e) {
    console.error(e);
    root.append(h('div', { class: 'card' }, '화면을 여는 중 문제가 생겼습니다: ', e.message, h('p', {}, h('a', { href: '#/' }, '처음으로'))));
  }
}

window.addEventListener('hashchange', route);
route();

// 오프라인·설치(PWA)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// 와이파이일 때 AI 모델을 뒤에서 자동 준비 (사용자 조작 없음)
setTimeout(() => import('./core/prepare.js').then((m) => m.autoPrepare()).catch(() => {}), 4000);
