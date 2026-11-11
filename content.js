// Runs in the extension's isolated world on call sites (and on the built-in
// preview page). Creates the hidden effects-engine iframe when the page hook
// asks for it, and mirrors the settings the page hook needs onto <html>
// attributes, because the page hook has no access to chrome.* APIs.
(() => {
  if (window.__memecamContent) return;
  window.__memecamContent = true;

  const root = document.documentElement;
  const FRAME_ID = 'memecam-engine-frame';

  const flag = (name, v) => root && root.setAttribute('data-memecam-' + name, v === false ? '0' : '1');
  try {
    root.setAttribute('data-memecam-origin', new URL(chrome.runtime.getURL('')).origin);
    chrome.storage.local.get({ enabled: true, unmirror: true, snap: true }, (s) => {
      flag('enabled', s.enabled); flag('unmirror', s.unmirror); flag('snap', s.snap);
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      for (const k of ['enabled', 'unmirror', 'snap']) if (ch[k]) flag(k, ch[k].newValue);
    });
  } catch (e) { /* extension was reloaded or removed; the page hook passes video through */ }

  document.addEventListener('memecam:need-engine', () => {
    const old = document.getElementById(FRAME_ID);
    if (old && old.isConnected) return;
    let src;
    try { src = chrome.runtime.getURL('engine/engine.html'); } catch (e) { return; }
    const f = document.createElement('iframe');
    f.id = FRAME_ID;
    f.src = src;
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText =
      'position:fixed!important;width:2px!important;height:2px!important;left:-20px!important;top:-20px!important;' +
      'border:0!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;';
    (document.body || document.documentElement).appendChild(f);
  });
})();
