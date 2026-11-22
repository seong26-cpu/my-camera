// 사진 읽기·저장·공유 공통 도구
// 원칙(편남 v8.0): 원본은 절대 덮어쓰지 않는다. 결과는 항상 새 파일로 만든다.

const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export function isImageFile(f) {
  return (f.type && f.type.startsWith('image/')) || IMG_EXT.test(f.name || '');
}
export function isHeic(f) {
  return /heic|heif/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || '');
}
export function isPdf(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
}
export function baseName(name) {
  return (name || 'photo').replace(/\.[^.]+$/, '');
}

/** 파일 고르기. capture=true 면 카메라로 바로 찍기 */
export function pickFiles({ multiple = true, accept = 'image/*', capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    });
    // 취소하면 change 가 안 올 수 있어서 포커스 복귀 때 정리
    window.addEventListener('focus', () => setTimeout(() => { if (document.body.contains(input) && !input.files?.length) { input.remove(); resolve([]); } }, 1200), { once: true });
    input.click();
  });
}

let heicLoader = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('불러오기 실패: ' + src));
    document.head.appendChild(s);
  });
}
async function heicToJpeg(file) {
  // 안드로이드 크롬은 HEIC 를 직접 못 여는 경우가 많아 변환 라이브러리를 필요할 때만 불러온다
  heicLoader ||= loadScript('./vendor/heic2any.min.js');
  await heicLoader;
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

/** 파일 → ImageBitmap (폰 사진 회전 정보 반영) */
export async function loadBitmap(file) {
  let blob = file;
  if (isHeic(file)) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { blob = await heicToJpeg(file); }
  }
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // 일부 형식은 <img> 로만 열림
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export function ctx2d(c) {
  return c.getContext('2d', { willReadFrequently: true });
}

/** 비트맵을 캔버스로. maxSide 를 주면 긴 변을 그 크기로 줄인다 */
export function toCanvas(src, maxSide = 0) {
  const w = src.width, h = src.height;
  const s = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1;
  const c = makeCanvas(w * s, h * s);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('저장 실패'))), type, quality));
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export function mimeOf(ext) { return MIME[ext] || 'image/jpeg'; }
export function extOf(mime) { return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'; }

// ── 촬영 정보(EXIF) 유지 ─────────────────────────────
function blobToBinary(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsBinaryString(blob); });
}
function binaryToBlob(bin, type) {
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
/** 원본 JPEG 의 EXIF 를 결과 JPEG 에 옮긴다. 회전값은 1(정방향)로 정리. 실패하면 결과 그대로 */
export async function keepExif(originalFile, jpegBlob) {
  try {
    if (!window.piexif || jpegBlob.type !== 'image/jpeg') return jpegBlob;
    if (!/jpe?g/i.test(originalFile.type || '') && !/\.jpe?g$/i.test(originalFile.name || '')) return jpegBlob;
    const exif = window.piexif.load(await blobToBinary(originalFile));
    if (exif['0th']) exif['0th'][window.piexif.ImageIFD.Orientation] = 1;
    delete exif.thumbnail; exif['1st'] = {};
    const bytes = window.piexif.dump(exif);
    return binaryToBlob(window.piexif.insert(bytes, await blobToBinary(jpegBlob)), 'image/jpeg');
  } catch { return jpegBlob; }
}

// ── 내보내기 ──────────────────────────────────────────
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 안드로이드 공유 시트 → '갤러리에 저장'·카카오톡 등으로 보내기. 안 되면 다운로드 */
export async function shareOrDownload(items) {
  const files = items.map(({ blob, name }) => new File([blob], name, { type: blob.type }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  for (const it of items) downloadBlob(it.blob, it.name);
  return 'downloaded';
}

export async function zipBlobs(items, onProgress) {
  const zip = new window.JSZip();
  const used = new Set();
  for (const { blob, name } of items) {
    let n = name, k = 1;
    while (used.has(n)) n = name.replace(/(\.[^.]+)?$/, `_${k++}$1`);
    used.add(n);
    zip.file(n, blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress?.(m.percent));
}

export function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function fmtBytes(n) {
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}

/** 화면이 멈추지 않게 잠깐 쉬기 */
export const tick = () => new Promise((r) => setTimeout(r, 0));
