// 오프라인 동작용 서비스 워커
// - 앱 화면 파일: 미리 저장(버전이 바뀌면 새로 받음)
// - AI 엔진(jsDelivr)·물체 인식 모델(Google): 처음 쓸 때 저장해 두고 다음부터 폰에서 바로
const VERSION = 'v1.2.0';
const APP = 'mc-app-' + VERSION;
const RUNTIME = 'mc-runtime-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/core/ui.js', './js/core/img.js', './js/core/adjust.js', './js/core/lut.js', './js/core/store.js',
  './js/core/ocr.js', './js/core/photos.js', './js/core/prepare.js', './js/core/seg.js', './js/core/inpaint.js', './js/core/clip.js', './js/data/interior.js',
  './js/pages/edit.js', './js/pages/object.js', './js/pages/ocr.js', './js/pages/interior.js', './js/pages/batch.js',
  './js/pages/convert.js', './js/pages/library.js', './js/pages/help.js', './js/pages/compose.js', './js/core/mask.js',
  './vendor/jszip.min.js', './vendor/piexif.js', './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs', './vendor/jspdf.umd.min.js', './vendor/heic2any.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];
const RUNTIME_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('mc-app-') && k !== APP).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 앱 파일: 저장본 먼저, 뒤에서 새것 확인
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) caches.open(APP).then((c) => c.put(req, res.clone())); return res; }).catch(() => hit || caches.match('./index.html'));
      return hit || net;
    }));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && (res.type === 'cors' || res.type === 'basic')) c.put(req, res.clone()).catch(() => {});
      return res;
    }));
  }
});
