// Runs in the page's own JS world at document_start (and on the preview page).
// Wraps getUserMedia so the camera track the call site receives is routed
// through the effects engine running in a hidden extension iframe. Everyone on
// the call sees the effects, and so do you in your self-view.
//
// Design rules:
// - Never break the call. Any failure falls back to the raw camera.
// - The camera light must turn off when the site stops the camera, including
//   when the site stopped only clones of the track.
// - A slow or missing engine must not slow the video down.
(() => {
  if (window.__memecamHook) return;
  window.__memecamHook = true;
  if (typeof MediaDevices === 'undefined' || !MediaDevices.prototype.getUserMedia) return;

  const TAG = '[MemeCam FX]';
  const FRAME_ID = 'memecam-engine-frame';
  const FRAME_TIMEOUT_MS = 250;
  const attr = (n) => document.documentElement && document.documentElement.getAttribute('data-memecam-' + n);
  const enabled = () => attr('enabled') !== '0';

  const origGUM = MediaDevices.prototype.getUserMedia;
  const origTrackClone = MediaStreamTrack.prototype.clone;
  const origTrackStop = MediaStreamTrack.prototype.stop;
  const origStreamClone = MediaStream.prototype.clone;
  const safeStop = (t) => { try { origTrackStop.call(t); } catch (e) { /* already stopped */ } };

  // ------------------------------------------------------------ engine link
  let engineWin = null;
  let engineReady = false;
  let engineActive = true;   // engine reports when effects are switched off
  let lastRequest = -1e9;
  let timeouts = 0;
  let bypassUntil = 0;
  const pending = new Map();
  let nextId = 1;

  const engineFrame = () => document.getElementById(FRAME_ID);

  function requestEngine() {
    const f = engineFrame();
    if (f && f.isConnected) return;
    const now = performance.now();
    if (now - lastRequest < 2000) return;
    lastRequest = now;
    engineWin = null;
    engineReady = false;
    document.dispatchEvent(new CustomEvent('memecam:need-engine'));
  }

  // True when the engine frame we talked to is still in the page. Sites that
  // rebuild their DOM can remove it; we then ask for a fresh one.
  function engineAlive() {
    const f = engineFrame();
    if (f && f.isConnected && engineWin && f.contentWindow === engineWin) return true;
    if (!f || !f.isConnected) { engineReady = false; engineWin = null; requestEngine(); }
    return false;
  }

  window.addEventListener('message', (e) => {
    const f = engineFrame();
    if (!f || e.source !== f.contentWindow) return;
    const d = e.data;
    if (!d || d.__memecam !== 1) return;
    engineWin = f.contentWindow;
    if (d.type === 'ready') {
      engineReady = true;
      timeouts = 0;
      bypassUntil = 0;
      console.info(TAG, 'effects engine ready');
    } else if (d.type === 'active') {
      engineActive = !!d.value;
    } else if (d.type === 'result') {
      const cb = pending.get(d.id);
      if (cb) { pending.delete(d.id); cb(d.bitmap || null); }
      else if (d.bitmap) d.bitmap.close();   // arrived after we gave up on it
    } else if (d.type === 'error') {
      console.warn(TAG, d.message);
    }
  });

  function toEngine(msg, transfer) {
    if (!engineWin) return false;
    engineWin.postMessage(Object.assign({ __memecam: 1 }, msg), attr('origin') || '*', transfer || []);
    return true;
  }

  // A few missed frames in a row: send the plain camera for 2 s. If that keeps
  // happening (engine crashed, or the extension was reloaded mid-call), drop
  // the engine and ask for a fresh one; until it reports ready, video passes
  // straight through.
  let strikes = 0;
  function onFrameTimeout() {
    if (++timeouts < 3) return;
    timeouts = 0;
    bypassUntil = performance.now() + 2000;
    if (++strikes >= 3) {
      strikes = 0;
      engineReady = false;
      engineWin = null;
      const f = engineFrame();
      if (f) f.remove();
      console.warn(TAG, 'effects engine stopped responding; using the normal camera');
      return;
    }
    console.warn(TAG, 'effects engine is slow; sending the plain camera for a moment');
  }

  function processBitmap(bmp, tid) {
    return new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); onFrameTimeout(); resolve(null); }, FRAME_TIMEOUT_MS);
      pending.set(id, (b) => { clearTimeout(timer); timeouts = 0; strikes = 0; resolve(b); });
      let sent = false;
      try { sent = toEngine({ type: 'frame', id, tid, bitmap: bmp }, [bmp]); } catch (e) { sent = false; }
      if (!sent) { clearTimeout(timer); pending.delete(id); try { bmp.close(); } catch (e) {} resolve(null); }
    });
  }

  const canUseEngine = () => engineReady && engineActive && performance.now() >= bypassUntil && engineAlive();

  // ------------------------------------------------------------ track groups
  // One group per real camera track: the processed track we hand out plus any
  // clones the site makes of it. The camera stops when all of them stopped.
  const trackGroup = new WeakMap();
  const groups = new Set();
  let groupSeq = 0;

  function dress(t, src) {
    // Make a processed track look like the real camera to the site.
    for (const name of ['getSettings', 'getCapabilities', 'getConstraints']) {
      try { t[name] = () => src[name](); } catch (e) {}
    }
    try { t.applyConstraints = (c) => src.applyConstraints(c); } catch (e) {}
    try { Object.defineProperty(t, 'label', { get: () => src.label, configurable: true }); } catch (e) {}
    try {
      Object.defineProperty(t, 'contentHint', {
        get: () => src.contentHint, set: (v) => { src.contentHint = v; }, configurable: true,
      });
    } catch (e) {}
  }

  function createGroup(src) {
    const g = { tid: ++groupSeq, src, live: new Set(), stopped: false, onStop: null };
    g.finish = () => {
      if (g.stopped) return;
      g.stopped = true;
      groups.delete(g);
      for (const t of g.live) safeStop(t);
      g.live.clear();
      safeStop(src);
      if (g.onStop) try { g.onStop(); } catch (e) {}
      if (!groups.size) stopMirrorFix();
    };
    g.adopt = (t) => {
      trackGroup.set(t, g);
      g.live.add(t);
      dress(t, src);
      t.stop = function stop() {
        safeStop(t);
        if (g.live.delete(t) && !g.live.size) g.finish();
      };
      return t;
    };
    // Effects only matter while at least one handed-out track is enabled.
    g.wantsEffects = () => { for (const t of g.live) if (t.enabled) return true; return false; };
    src.addEventListener('ended', g.finish);
    groups.add(g);
    return g;
  }

  MediaStreamTrack.prototype.clone = function clone() {
    const c = origTrackClone.call(this);
    const g = trackGroup.get(this);
    if (g && !g.stopped) g.adopt(c);
    return c;
  };

  // stream.clone() copies tracks internally, bypassing track.clone(); route it
  // through our clone so those copies are counted too.
  MediaStream.prototype.clone = function clone() {
    const tracks = this.getTracks();
    if (!tracks.some((t) => trackGroup.has(t))) return origStreamClone.call(this);
    return new MediaStream(tracks.map((t) => t.clone()));
  };

  // ------------------------------------------------------------ frame pumps
  function pumpInsertable(src, g) {
    const processor = new MediaStreamTrackProcessor({ track: src, maxBufferSize: 1 });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    const reader = processor.readable.getReader();
    const writer = generator.writable.getWriter();

    (async () => {
      while (!g.stopped) {
        let r;
        try { r = await reader.read(); } catch (e) { break; }
        if (r.done) break;
        const frame = r.value;
        let out = frame;
        if (g.wantsEffects() && canUseEngine()) {
          try {
            const res = await processBitmap(await createImageBitmap(frame), g.tid);
            if (res) {
              try { out = new VideoFrame(res, { timestamp: frame.timestamp }); frame.close(); }
              catch (e) { out = frame; }
              finally { res.close(); }
            }
          } catch (e) { out = frame; }
        }
        if (g.stopped) { try { out.close(); } catch (e) {} break; }
        try { await writer.write(out); } catch (e) { try { out.close(); } catch (_) {} break; }
      }
      try { reader.cancel(); } catch (e) {}
      try { writer.close(); } catch (e) {}
    })();

    return generator;
  }

  function pumpCanvas(src, g) {
    // Fallback for browsers without insertable streams.
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    video.srcObject = new MediaStream([src]);
    video.play().catch(() => {});
    const s = src.getSettings();
    const canvas = document.createElement('canvas');
    canvas.width = s.width || 640; canvas.height = s.height || 480;
    const ctx = canvas.getContext('2d');
    const out = canvas.captureStream(s.frameRate || 30).getVideoTracks()[0];
    let busy = false;
    g.onStop = () => { video.srcObject = null; };

    const tick = async () => {
      if (g.stopped) return;
      if (!busy && video.videoWidth) {
        busy = true;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        }
        let drawn = false;
        if (g.wantsEffects() && canUseEngine()) {
          try {
            const res = await processBitmap(await createImageBitmap(video), g.tid);
            if (res) { ctx.drawImage(res, 0, 0, canvas.width, canvas.height); res.close(); drawn = true; }
          } catch (e) {}
        }
        if (!drawn) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        busy = false;
      }
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(tick);
      else setTimeout(tick, 33);
    };
    tick();
    return out;
  }

  function wrapVideoTrack(src) {
    requestEngine();
    const g = createGroup(src);
    const insertable = typeof MediaStreamTrackProcessor !== 'undefined' && typeof MediaStreamTrackGenerator !== 'undefined';
    let out;
    try {
      out = insertable ? pumpInsertable(src, g) : pumpCanvas(src, g);
    } catch (e) {
      // Undo the group without stopping the camera; the caller sends it raw.
      g.stopped = true;
      groups.delete(g);
      src.removeEventListener('ended', g.finish);
      throw e;
    }
    g.adopt(out);
    startMirrorFix();
    return out;
  }

  // ------------------------------------------------- un-mirror your self-view
  // Call sites flip your self-view like a mirror, which makes captions read
  // backwards for you. We cancel that flip on videos showing our track, so you
  // see exactly what everyone else sees.
  let mirrorTimer = 0;
  function isMirrored(el) {
    let sign = 1;
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform && cs.transform !== 'none') {
        try { if (new DOMMatrixReadOnly(cs.transform).a < 0) sign = -sign; } catch (e) {}
      }
      if (cs.scale && cs.scale !== 'none' && cs.scale.trim().startsWith('-')) sign = -sign;
    }
    return sign < 0;
  }
  function fixMirrors() {
    const want = attr('unmirror') !== '0';
    for (const v of document.querySelectorAll('video')) {
      const so = v.srcObject;
      const ours = want && so && typeof so.getVideoTracks === 'function' && so.getVideoTracks().some((t) => trackGroup.has(t));
      const flipped = v.hasAttribute('data-memecam-flip');
      if (!ours) {
        if (flipped) { v.style.removeProperty('scale'); v.removeAttribute('data-memecam-flip'); }
        continue;
      }
      if (isMirrored(v)) {
        if (flipped) { v.style.removeProperty('scale'); v.removeAttribute('data-memecam-flip'); }
        else { v.style.setProperty('scale', '-1 1', 'important'); v.setAttribute('data-memecam-flip', ''); }
      }
    }
  }
  function startMirrorFix() { if (!mirrorTimer) mirrorTimer = setInterval(fixMirrors, 600); }
  function stopMirrorFix() {
    if (!mirrorTimer) return;
    clearInterval(mirrorTimer); mirrorTimer = 0;
    for (const v of document.querySelectorAll('video[data-memecam-flip]')) {
      v.style.removeProperty('scale'); v.removeAttribute('data-memecam-flip');
    }
  }

  // ---------------------------------------------- snap sound detection (mic)
  // Analysed locally only, to help confirm a finger snap. Never recorded or sent.
  let audioCtx = null;
  let lastSpike = 0;
  function tapAudio(track) {
    if (attr('snap') === '0') return;
    let clone = null, iv = 0, node = null;
    const cleanup = () => {
      clearInterval(iv);
      try { if (node) node.disconnect(); } catch (e) {}
      if (clone) safeStop(clone);
    };
    try {
      audioCtx = audioCtx || new AudioContext();
      clone = origTrackClone.call(track);
      node = audioCtx.createMediaStreamSource(new MediaStream([clone]));
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      node.connect(hp); hp.connect(an);
      const buf = new Float32Array(an.fftSize);
      let avg = 0.003;
      track.addEventListener('ended', cleanup);
      iv = setInterval(() => {
        if (track.readyState === 'ended') { cleanup(); return; }
        if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); return; }
        if (!track.enabled || !groups.size) return;
        an.getFloatTimeDomainData(buf);
        let peak = 0, sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (peak > 0.07 && rms > avg * 5 && now - lastSpike > 300) {
          lastSpike = now;
          toEngine({ type: 'audioSpike' });
        }
        avg = avg * 0.94 + rms * 0.06;
      }, 16);
    } catch (e) { cleanup(); /* the mic hint is optional */ }
  }

  // --------------------------------------------------------- keyboard backups
  const KEYS = { KeyS: 'snap', KeyC: 'cinema', KeyM: 'rain', KeyF: 'facepalm' };
  const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const action = KEYS[e.code];
    if (!action || !groups.size || !engineReady || isEditable(e.target)) return;
    toEngine({ type: 'key', action });
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---------------------------------------------------------------- the patch
  async function getUserMedia(constraints) {
    const stream = await origGUM.call(this, constraints);
    try {
      if (!enabled()) return stream;
      const audio = stream.getAudioTracks();
      const videos = stream.getVideoTracks();
      audio.forEach(tapAudio);
      if (!videos.length) return stream;
      const out = wrapVideoTrack(videos[0]);
      return new MediaStream([out, ...videos.slice(1), ...audio]);
    } catch (e) {
      console.warn(TAG, 'could not apply effects, using the normal camera', e);
      return stream;
    }
  }

  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
    value: getUserMedia, writable: true, configurable: true,
  });
})();
