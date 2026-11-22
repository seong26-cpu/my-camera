// 방 종류·스타일 판별 — CLIP(OpenAI, transformers.js 변환판)을 폰 안에서 실행, 무료
// 처음 한 번 약 154MB(압축판) 내려받음 → 이후 폰에 저장
const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
const MODEL = 'Xenova/clip-vit-base-patch32';
let clf = null;

export async function loadClip(onProgress) {
  if (clf) return clf;
  const T = await import(TF);
  T.env.allowLocalModels = false;
  const files = {};
  const progress_callback = (e) => {
    if (e.status === 'progress' && e.file) { files[e.file] = [e.loaded || 0, e.total || 0]; }
    const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
    if (t) onProgress?.(l / t, `판별 모델 내려받는 중 ${Math.round(l / 1048576)} / ${Math.round(t / 1048576)}MB (처음 한 번)`);
  };
  const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
  try {
    clf = await T.pipeline('zero-shot-image-classification', MODEL, { dtype: 'q8', device, progress_callback });
  } catch (e) {
    if (device === 'wasm') throw e;
    clf = await T.pipeline('zero-shot-image-classification', MODEL, { dtype: 'q8', device: 'wasm', progress_callback });
  }
  return clf;
}

/** labels: [{key, en}] → [{key, score}] 높은 순 */
export async function classify(canvas, labels, template = '{}') {
  const c = await loadClip();
  const url = canvas.toDataURL('image/jpeg', 0.9);
  const out = await c(url, labels.map((l) => l.en), { hypothesis_template: template });
  const byEn = Object.fromEntries(out.map((o) => [o.label, o.score]));
  return labels.map((l) => ({ key: l.key, score: byEn[l.en] || 0 })).sort((a, b) => b.score - a.score);
}
