import { listPacks, DEFAULT_PACK } from '../packs/packs.js';

const DEFAULTS = {
  enabled: true, snap: true, rain: true, cinema: true, facepalm: true,
  bgBlur: false, unmirror: true, debug: false, sensitivity: 'normal',
  pack: DEFAULT_PACK, cinemaImage: null, palmImage: null,
};
const TOGGLES = ['enabled', 'snap', 'rain', 'cinema', 'facepalm', 'bgBlur', 'unmirror', 'debug'];
const MAX_SIDE = 900;

const $ = (id) => document.getElementById(id);
let packs = [];
let current = null;
let state = { ...DEFAULTS };

function showError(msg) { $('error').textContent = msg || ''; }

async function save(obj) {
  try { await chrome.storage.local.set(obj); showError(''); }
  catch (e) { showError('Could not save: ' + ((e && e.message) || e)); throw e; }
}

function applyTheme(p) {
  for (const [k, v] of Object.entries(p.theme)) document.documentElement.style.setProperty('--' + k, v);
  const sw = $('swatches');
  sw.replaceChildren(...['accent', 'card', 'text'].map((k) => {
    const s = document.createElement('span'); s.style.background = p.theme[k]; return s;
  }));
}

function setThumb(boxId, src) {
  const box = $(boxId);
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    img.onerror = () => box.replaceChildren(Object.assign(document.createElement('div'), { className: 'none', textContent: "Couldn't load" }));
    box.replaceChildren(img);
  } else {
    box.replaceChildren(Object.assign(document.createElement('div'), { className: 'none', textContent: 'Caption only' }));
  }
}

function render() {
  const p = current;
  if (!p) return;
  applyTheme(p);
  $('packDesc').textContent = p.description;
  $('rainLabel').textContent = p.rain.label;
  $('cinemaLabel').textContent = p.cinema.label;
  $('palmLabel').textContent = p.facepalm.label;

  const cinemaSrc = state.cinemaImage || p.cinema.image;
  setThumb('cinemaPrev', cinemaSrc);
  $('cinemaSrc').textContent = state.cinemaImage ? 'Your picture' : 'From pack';
  $('cinemaClear').disabled = !state.cinemaImage;
  $('cinemaHint').textContent = cinemaSrc
    ? 'Your face swapped into the picture, live'
    : `Black-and-white letterbox: “${p.cinema.caption}”`;

  setThumb('palmPrev', state.palmImage || p.facepalm.image);
  $('palmSrc').textContent = state.palmImage ? 'Your picture' : 'From pack';
  $('palmClear').disabled = !state.palmImage;
}

// Shrinks a picked picture so it fits comfortably in extension storage.
async function fileToDataUrl(file) {
  const bmp = await createImageBitmap(file);
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.9);
  } finally {
    bmp.close();
  }
}

function wirePicture(key, pickId, clearId, fileId) {
  $(pickId).addEventListener('click', () => $(fileId).click());
  $(clearId).addEventListener('click', async () => {
    await save({ [key]: null });
    state[key] = null;
    render();
  });
  $(fileId).addEventListener('change', async () => {
    const f = $(fileId).files[0];
    $(fileId).value = '';   // so picking the same file again still fires
    if (!f) return;
    let dataUrl;
    try { dataUrl = await fileToDataUrl(f); }
    catch (e) { showError("That file couldn't be read as a picture. Try a JPG, PNG or WebP."); return; }
    await save({ [key]: dataUrl });
    state[key] = dataUrl;
    render();
  });
}

async function main() {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  [packs, state] = await Promise.all([listPacks(), chrome.storage.local.get(DEFAULTS)]);

  const sel = $('pack');
  sel.replaceChildren(...packs.map((p) => new Option(p.name, p.id)));
  current = packs.find((p) => p.id === state.pack) || packs[0];
  sel.value = current.id;
  sel.addEventListener('change', async () => {
    current = packs.find((p) => p.id === sel.value) || packs[0];
    await save({ pack: current.id });
    render();
  });

  for (const k of TOGGLES) {
    $(k).checked = !!state[k];
    $(k).addEventListener('change', async () => {
      const v = $(k).checked;
      await save({ [k]: v });
      // Turning effects back on only reaches a camera that starts after this.
      if (k === 'enabled') $('rejoin').style.display = v && !state.enabled ? 'block' : 'none';
    });
  }
  $('sensitivity').value = state.sensitivity;
  $('sensitivity').addEventListener('change', () => save({ sensitivity: $('sensitivity').value }));

  wirePicture('cinemaImage', 'cinemaPick', 'cinemaClear', 'cinemaFile');
  wirePicture('palmImage', 'palmPick', 'palmClear', 'palmFile');
  $('try').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('preview/preview.html') }));

  render();
}

main().catch((e) => showError('Settings failed to load: ' + ((e && e.message) || e)));
