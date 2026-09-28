import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import './style.css';

const $ = (id) => document.getElementById(id);
const MAX_BYTES = 2300;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const state = { mode: 'generate', type: 'url', color: '#182445', size: 1024, payload: '', renderId: 0, fileId: 0, method: 'image' };
let renderTimer;
let toastTimer;
let previewUrl;
let scanner;
let cameraId = 0;
let cameraState = 'idle';
let cameras = [];
let currentCamera = 0;

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

function httpUrl(value, complete = false) {
  const input = value.trim();
  if (!input || /\s/.test(input)) return null;
  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    const url = new URL(complete && !hasScheme ? `https://${input}` : input);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function qrOptions() {
  return { width: state.size, margin: 4, errorCorrectionLevel: 'M', color: { dark: state.color, light: '#ffffff' } };
}

function setPreviewStatus(ready, label) {
  $('qr-canvas').hidden = !ready;
  $('qr-empty').hidden = ready;
  $('download-png').disabled = !ready;
  $('download-svg').disabled = !ready;
  $('preview-badge').textContent = label;
  $('preview-badge').classList.toggle('waiting', !ready);
}

async function renderQr() {
  const id = ++state.renderId;
  state.payload = '';
  const raw = $('content').value;
  const payload = state.type === 'url' ? httpUrl(raw, true) : raw;
  const bytes = new TextEncoder().encode(payload || raw).length;
  $('byte-count').textContent = `${bytes} / ${MAX_BYTES} 字节`;
  $('preview-type').textContent = state.type === 'url' ? '链接二维码' : '文本二维码';
  $('preview-detail').textContent = `${state.size} × ${state.size} px · PNG / SVG`;
  let error = '';
  if (raw && !payload && state.type === 'url') error = '请输入有效的 http / https 网站链接。';
  if (bytes > MAX_BYTES) error = '内容过长，请缩短至 2300 字节以内（中文通常每字占 3 字节）。';
  $('content-error').textContent = error;
  $('content-error').hidden = !error;
  $('content').setAttribute('aria-invalid', String(Boolean(error)));
  if (!payload || error) { setPreviewStatus(false, error ? '请检查内容' : '等待输入'); return; }
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, payload, qrOptions());
    if (id !== state.renderId) return;
    const output = $('qr-canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    output.getContext('2d').drawImage(canvas, 0, 0);
    state.payload = payload;
    setPreviewStatus(true, '已生成');
  } catch {
    if (id !== state.renderId) return;
    $('content-error').textContent = '这段内容无法生成二维码，请缩短后重试。';
    $('content-error').hidden = false;
    setPreviewStatus(false, '请检查内容');
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  ++state.renderId;
  state.payload = '';
  setPreviewStatus(false, '正在生成');
  renderTimer = setTimeout(renderQr, 100);
}

function chooseType(type) {
  state.type = type;
  document.querySelectorAll('[data-type]').forEach((button) => {
    const selected = button.dataset.type === type;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('content-label').textContent = type === 'url' ? '网站链接' : '文本内容';
  $('content').placeholder = type === 'url' ? 'https://example.com' : '输入想要分享的文字，支持中文、换行和 Emoji。';
  $('content-hint').textContent = type === 'url' ? '自动补全缺失的 https://' : '';
  $('content-hint').hidden = type !== 'url';
  renderQr();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('generator').hidden = mode !== 'generate';
  $('scanner').hidden = mode !== 'scan';
  $('page-title').textContent = mode === 'generate' ? '生成二维码' : '识别二维码';
  $('privacy-note').textContent = mode === 'generate' ? '你的内容只留在浏览器里。' : '照片与摄像头画面不会上传。';
  $('page-description').textContent = mode === 'generate' ? '输入链接或文字，生成属于你的二维码。' : '上传照片或打开摄像头，轻松提取二维码内容。';
  if (mode !== 'scan') stopCamera();
}

function saveBlob(blob, extension) {
  if (!blob) { toast('下载失败，请重试。'); return; }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `qrcode-${state.size}.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function scanStatus(message, kind = '') {
  $('scan-status').textContent = message;
  $('scan-status').className = `scan-status ${kind}`;
}

function clearResult() {
  $('scan-result').value = '';
  $('result-empty').hidden = false;
  $('result-content').hidden = true;
  $('result-badge').hidden = true;
  $('open-result').hidden = true;
  $('open-result').removeAttribute('href');
}

function showResult(data) {
  $('scan-result').value = data;
  $('result-empty').hidden = true;
  $('result-content').hidden = false;
  $('result-badge').hidden = false;
  const url = httpUrl(data);
  $('result-label').textContent = url ? '链接内容' : '文本内容';
  $('open-result').hidden = !url;
  if (url) $('open-result').href = url;
  else $('open-result').removeAttribute('href');
  scanStatus('识别成功，内容已显示在结果区。', 'success');
}

async function scanFile(file) {
  if (!file) return;
  const id = ++state.fileId;
  clearResult();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = undefined; }
  $('source-image').removeAttribute('src');
  $('image-preview').hidden = true;
  $('drop-zone').hidden = false;
  if (!/^image\/(png|jpeg|webp|gif|bmp|svg\+xml)$/i.test(file.type)) {
    scanStatus('请选择 PNG、JPG、WebP、GIF、BMP 或 SVG 图片。HEIC 照片请先转为 JPG。', 'error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) { scanStatus('图片超过 20 MB，请压缩后重试。', 'error'); return; }
  scanStatus('正在识别图片…');
  previewUrl = URL.createObjectURL(file);
  $('source-image').src = previewUrl;
  $('image-name').textContent = file.name || '粘贴的图片';
  $('image-preview').hidden = false;
  $('drop-zone').hidden = true;
  try {
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
    if (id === state.fileId) showResult(result.data);
  } catch {
    if (id === state.fileId) scanStatus('没有找到可识别的二维码。请尝试更清晰的图片，并保留二维码四周的白边。', 'error');
  }
}

function updateCameraControls() {
  const active = cameraState !== 'idle';
  $('camera-toggle').querySelector('span').textContent = cameraState === 'starting' ? '取消开启' : active ? '停止摄像头' : '开启摄像头';
  $('camera-switch').disabled = cameraState !== 'running' || cameras.length < 2;
  $('camera-placeholder').hidden = cameraState === 'running';
  $('camera-guide').hidden = cameraState !== 'running';
}

async function stopCamera() {
  ++cameraId;
  const previous = scanner;
  scanner = undefined;
  cameraState = 'idle';
  updateCameraControls();
  const video = $('camera-video');
  video.srcObject?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  if (previous) {
    await previous.pause(true);
    previous.destroy();
  }
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    scanStatus('摄像头需要 HTTPS 和浏览器支持。请通过 HTTPS 访问本站，或改用图片识别。', 'error');
    return;
  }
  await stopCamera();
  const id = ++cameraId;
  cameraState = 'starting';
  updateCameraControls();
  clearResult();
  scanStatus('请允许访问摄像头，然后将二维码放入画面。');
  try {
    // Acquire explicitly so permission errors are preserved instead of being
    // collapsed into the scanner library's generic "Camera not found" error.
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (id !== cameraId) { stream.getTracks().forEach((track) => track.stop()); return; }
    // The library delays part of its teardown. A fresh video keeps an old
    // scanner's pending cleanup from stopping a newly started camera stream.
    const video = $('camera-video').cloneNode(false);
    $('camera-video').replaceWith(video);
    video.srcObject = stream;
    const instance = new QrScanner(video, (result) => {
      if (id !== cameraId || state.mode !== 'scan') return;
      showResult(result.data);
      stopCamera();
    }, { preferredCamera: 'environment', maxScansPerSecond: 8, returnDetailedScanResult: true, onDecodeError: () => {} });
    instance.setInversionMode('both');
    scanner = instance;
    await instance.start();
    if (id !== cameraId) { await instance.pause(true); instance.destroy(); return; }
    cameraState = 'running';
    updateCameraControls();
    scanStatus('正在扫描，对准二维码即可自动识别。');
    try { cameras = await QrScanner.listCameras(); } catch { cameras = []; }
    if (id !== cameraId) return;
    const activeId = $('camera-video').srcObject?.getVideoTracks()[0]?.getSettings().deviceId;
    currentCamera = Math.max(0, cameras.findIndex((camera) => camera.id === activeId));
    updateCameraControls();
  } catch (error) {
    if (id !== cameraId) return;
    await stopCamera();
    const message = String(error);
    if (/permission|notallowed|denied/i.test(message)) scanStatus('摄像头权限被拒绝。请在浏览器的网站设置中允许摄像头，或使用图片识别。', 'error');
    else if (/notfound|not found|devices|overconstrained/i.test(message)) scanStatus('没有找到可用摄像头，请连接摄像头或使用图片识别。', 'error');
    else scanStatus('无法开启摄像头，可能被其他应用占用。请关闭占用后重试，或使用图片识别。', 'error');
  }
}

function setMethod(method) {
  if (state.method === method) return;
  state.method = method;
  ++state.fileId;
  stopCamera();
  clearResult();
  document.querySelectorAll('[data-method]').forEach((button) => {
    const selected = button.dataset.method === method;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('image-source').hidden = method !== 'image';
  $('camera-source').hidden = method !== 'camera';
  if (method === 'image') {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    $('source-image').removeAttribute('src');
    $('image-preview').hidden = true;
    $('drop-zone').hidden = false;
  }
  scanStatus(method === 'image' ? '选择一张包含二维码的图片。' : '点击开启摄像头，允许访问后即可扫描。');
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => chooseType(button.dataset.type)));
document.querySelectorAll('[data-method]').forEach((button) => button.addEventListener('click', () => setMethod(button.dataset.method)));
$('content').addEventListener('input', scheduleRender);
$('clear-content').addEventListener('click', () => { $('content').value = ''; renderQr(); $('content').focus(); });
$('size').addEventListener('change', () => { state.size = Number($('size').value); renderQr(); });
document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => {
  state.color = button.dataset.color;
  document.querySelectorAll('[data-color]').forEach((swatch) => {
    const selected = swatch === button;
    swatch.classList.toggle('selected', selected);
    swatch.setAttribute('aria-pressed', String(selected));
  });
  renderQr();
}));
$('download-png').addEventListener('click', () => { if (state.payload) $('qr-canvas').toBlob((blob) => saveBlob(blob, 'png'), 'image/png'); });
$('download-svg').addEventListener('click', async () => {
  if (!state.payload) return;
  try { saveBlob(new Blob([await QRCode.toString(state.payload, { ...qrOptions(), type: 'svg' })], { type: 'image/svg+xml' }), 'svg'); }
  catch { toast('下载失败，请重试。'); }
});
['drop-zone', 'change-image'].forEach((id) => $(id).addEventListener('click', () => $('image-file').click()));
$('image-file').addEventListener('change', (event) => { scanFile(event.target.files[0]); event.target.value = ''; });
['dragenter', 'dragover'].forEach((name) => $('image-source').addEventListener(name, (event) => { event.preventDefault(); $('drop-zone').classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => $('image-source').addEventListener(name, (event) => { event.preventDefault(); $('drop-zone').classList.remove('dragging'); }));
$('image-source').addEventListener('drop', (event) => scanFile(event.dataTransfer.files[0]));
document.addEventListener('paste', (event) => {
  if (state.mode !== 'scan') return;
  const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
  if (!image) return;
  event.preventDefault();
  setMethod('image');
  scanFile(image.getAsFile());
});
$('camera-toggle').addEventListener('click', () => {
  if (cameraState !== 'idle') { stopCamera(); scanStatus('摄像头已关闭。'); }
  else startCamera();
});
$('camera-switch').addEventListener('click', async () => {
  if (!scanner || cameras.length < 2) return;
  const instance = scanner;
  const id = cameraId;
  $('camera-switch').disabled = true;
  currentCamera = (currentCamera + 1) % cameras.length;
  try { await instance.setCamera(cameras[currentCamera].id); }
  catch {
    if (id === cameraId) { await stopCamera(); scanStatus('切换镜头失败，请重新开启摄像头。', 'error'); }
  }
  if (id === cameraId) updateCameraControls();
});
$('copy-result').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('scan-result').value); toast('内容已复制'); }
  catch { $('scan-result').focus(); $('scan-result').select(); toast('请按 ⌘ C / Ctrl C 复制已选内容。'); }
});
$('regenerate').addEventListener('click', () => {
  const value = $('scan-result').value;
  $('content').value = value;
  chooseType(httpUrl(value) ? 'url' : 'text');
  setMode('generate');
  $('content').focus();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && cameraState !== 'idle') { stopCamera(); scanStatus('页面已切到后台，摄像头已关闭。'); }
});
window.addEventListener('pagehide', () => { stopCamera(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
renderQr();
