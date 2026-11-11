// Development only (never shipped). Lets the extension pages run on a plain
// localhost server so they can be tested in any browser tab:
// - fakes chrome.runtime / chrome.storage / chrome.tabs
// - with ?fakecam in the URL, replaces the camera with a moving test picture
// Loaded by dev/serve.py, which injects it at the top of every extension page.
(() => {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return;

  const KEY = 'memecam-dev-storage';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const listeners = [];
  const bc = new BroadcastChannel('memecam-dev');
  bc.onmessage = (e) => listeners.forEach((l) => l(e.data, 'local'));

  function get(defaults) {
    const s = read();
    if (defaults == null) return s;
    if (typeof defaults === 'string') defaults = [defaults];
    const out = {};
    if (Array.isArray(defaults)) { for (const k of defaults) if (k in s) out[k] = s[k]; }
    else for (const k of Object.keys(defaults)) out[k] = k in s ? s[k] : defaults[k];
    return out;
  }
  function set(obj) {
    const s = read();
    const changes = {};
    for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: s[k], newValue: v }; s[k] = v; }
    localStorage.setItem(KEY, JSON.stringify(s));
    bc.postMessage(changes);
    listeners.forEach((l) => l(changes, 'local'));
  }

  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    id: 'dev',
    getURL: (p) => location.origin + '/' + String(p).replace(/^\//, ''),
    getManifest: () => ({ version: 'dev' }),
  };
  window.chrome.storage = {
    local: {
      get(d, cb) { const r = get(d); if (cb) { setTimeout(() => cb(r)); return undefined; } return Promise.resolve(r); },
      set(o, cb) { set(o); if (cb) { setTimeout(cb); return undefined; } return Promise.resolve(); },
    },
    onChanged: { addListener: (f) => listeners.push(f) },
  };
  window.chrome.tabs = { create: ({ url }) => window.open(url) };

  if (!new URLSearchParams(location.search).has('fakecam')) return;

  // A fake webcam: a room with a person (the classic pack's picture) who bobs a little.
  const img = new Image();
  img.src = '/packs/classic/cinema.jpg';
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const g = canvas.getContext('2d');
  const t0 = performance.now();
  function draw() {
    const t = (performance.now() - t0) / 1000;
    const bg = g.createLinearGradient(0, 0, 1280, 720);
    bg.addColorStop(0, '#6d7f8f'); bg.addColorStop(1, '#3d4752');
    g.fillStyle = bg; g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#c9b38a'; g.fillRect(80, 90, 220, 300);      // a picture frame
    g.fillStyle = '#7a5c3a'; g.fillRect(960, 380, 260, 340);    // a shelf
    g.fillStyle = '#2d6a4f'; g.beginPath(); g.arc(1090, 330, 70, 0, 7); g.fill();  // a plant
    if (img.complete && img.naturalWidth) {
      const s = 640 / img.naturalHeight;
      g.drawImage(img, 640 - (img.naturalWidth * s) / 2 + Math.sin(t * 1.3) * 12, 80 + Math.sin(t * 2) * 4, img.naturalWidth * s, 640);
    }
    requestAnimationFrame(draw);
  }
  draw();
  const fake = async () => new MediaStream([canvas.captureStream(30).getVideoTracks()[0]]);
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { value: fake, writable: true, configurable: true });
})();
