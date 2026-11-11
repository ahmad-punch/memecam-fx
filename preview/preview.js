// Preview page: opens the camera through the same hook a call site gets, so
// people can try every effect without joining a call.
(() => {
  const $ = (id) => document.getElementById(id);
  const status = (t) => { $('status').textContent = t; };
  const buttons = [...document.querySelectorAll('[data-key]')];
  buttons.forEach((b) => { b.disabled = true; });

  window.addEventListener('message', (e) => {
    const f = document.getElementById('memecam-engine-frame');
    if (!f || e.source !== f.contentWindow || !e.data || e.data.__memecam !== 1) return;
    if (e.data.type === 'ready') { status('Effects ready. Try a gesture or the buttons below.'); buttons.forEach((b) => { b.disabled = false; }); }
    if (e.data.type === 'error') status(e.data.message);
    if (e.data.type === 'active' && !e.data.value) status('Effects are switched off in the popup.');
  });

  for (const b of buttons) {
    b.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: b.dataset.key, altKey: true, shiftKey: true, bubbles: true }));
    });
  }

  async function start() {
    $('start').hidden = true;
    status('Asking for your camera…');
    try {
      const video = { width: 1280, height: 720 };
      let stream;
      // The mic only helps confirm snaps; carry on without it if it's blocked or missing.
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }); }
      catch (e) { stream = await navigator.mediaDevices.getUserMedia({ video }); }
      $('video').srcObject = stream;
      const off = document.documentElement.getAttribute('data-memecam-enabled') === '0';
      status(off ? 'Effects are switched off in the popup.' : 'Loading the effects engine (first time takes a few seconds)…');
    } catch (e) {
      status(e && e.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow it from the camera icon in the address bar, then try again.'
        : 'Could not open the camera: ' + ((e && e.message) || e));
      $('start').hidden = false;
    }
  }

  $('start').addEventListener('click', start);
  start();
})();
