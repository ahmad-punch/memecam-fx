# MemeCam FX

Meme effects for your camera in Google Meet. Everyone on the call sees them, and it all runs on your own computer.

| Do this on camera | You get |
|---|---|
| **Snap** your fingers | You turn to dust and blow away, while your room stays visible. Snap again to come back. |
| **Double snap** quickly | It rains: cash, confetti, coffee… depending on your brand pack. |
| **Both hands up**, palms open, and hold | Cinema mode: your face swapped into the meme, or a black-and-white letterbox with a caption. |
| **Hand over your eyes** and hold | The facepalm meme fades in over you. |

Pick a **brand pack** in the popup to change the look, captions, rain and colours. Packs included: **Classic**, **Party** and **Office**. Making your own takes five minutes: see [docs/BRAND-PACKS.md](docs/BRAND-PACKS.md).

Also works in Teams, Zoom, Discord, Slack huddles and Whereby on the web.

---

## Install (2 minutes)

1. Download the latest `memecam-fx-x.y.z.zip` from this repo's **Releases** page. You can also use **Code → Download ZIP**, or `git clone` the repo.
2. Unzip it somewhere **permanent**, for example `Documents/memecam-fx`. Chrome loads it from that folder, so don't delete it afterwards.
3. Open `chrome://extensions` in Chrome (Edge, Brave and Arc work too).
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked** and choose the unzipped `memecam-fx` folder: the one that contains `manifest.json`.
6. Click the puzzle-piece icon in the toolbar and **pin** MemeCam FX.
7. Click the MemeCam FX icon, then **Try it**. A preview page opens with your camera, so you can practise every gesture without joining a call.

Already have Meet open? Reload that tab once.

## Using it in a call

- Effects start automatically when your camera turns on. The pre-join screen is a great place to practise.
- **Let it learn your room:** after your camera turns on, lean out of frame for 2 seconds. Then when you vanish, the wall behind you is really there instead of a blurry guess.
- **Snapping:** thumb and middle finger together, then snap the middle finger down into your palm, with your hand clearly in view. If snaps get missed, set *Snap sensitivity* to **High**. If effects trigger by accident, set it to **Low**.
- **Background blur:** turn Meet's own blur **off** and use *Blur my background* in the popup instead. Meet blurs after the effects, so it would smear them.
- **Keyboard backups** (click the call tab first): `Alt+Shift+S` snap · `Alt+Shift+M` rain · `Alt+Shift+C` cinema · `Alt+Shift+F` facepalm. On a Mac, `Alt` is `Option`.
- **Your own memes:** the popup's *Change…* buttons let you use any picture for cinema mode or facepalm. A picture with a face in it gets your live face swapped in.

## Updating

Download the new zip and unzip it **over the same folder**, replacing the files. Then click the ↻ reload button on the MemeCam FX card in `chrome://extensions` and reload your Meet tab. If you cloned the repo, `git pull` and reload instead. Your settings are kept.

## Privacy

- Everything runs locally. The hand, pose and face tracking models ship inside the extension, and nothing is sent anywhere.
- Your video only leaves your computer through the call itself, as normal.
- The microphone is analysed locally, only to hear the click of a snap. It is never recorded or sent. Turn *Snap to vanish* off to stop that.
- The extension only runs on the call sites listed in `manifest.json`, not on every website.

## Troubleshooting

| Problem | Fix |
|---|---|
| No effects at all | Reload the Meet tab. Check *Effects on* in the popup. Open **Try it** to rule out the call site. |
| Turned *Effects on* back on but nothing happens | Turn your camera off and on in the call, or reload the tab. |
| Text looks backwards to me | Keep *Fix backwards self-view* on. Your preview then shows what everyone else sees. |
| Video gets choppy | Close other heavy tabs. Older laptops without a graphics chip struggle with the tracking. MemeCam FX automatically sends your plain camera for a moment if it can't keep up. |
| Snaps don't register | Use more light, keep your hand fully in frame, set sensitivity to *High*, or switch on *Show tracking (debug)* to watch what it sees. Others see the debug view too, so turn it off afterwards. |

---

## For maintainers

```
manifest.json      extension definition (MV3)
page-hook.js       runs in the call page: wraps getUserMedia, pipes camera frames to the engine
content.js         creates the hidden engine iframe, passes settings to page-hook.js
engine/            effects engine (MediaPipe tracking, dust, rain, cinema, facepalm)
popup/             toolbar popup with brand-pack picker
preview/           "Try it" page
packs/             brand packs + packs.js loader
lib/, models/      MediaPipe Tasks Vision runtime and models (bundled, offline)
dev/               local test server + chrome.* shim (not shipped)
scripts/           icon generator, pack validator, packager
```

**Test without loading the extension:**

```bash
python3 dev/serve.py
```

Then open `http://localhost:8765/preview/preview.html?fakecam` (a moving test picture stands in for the camera) or `http://localhost:8765/preview/preview.html` (your real camera). The popup is at `http://localhost:8765/popup/popup.html`. The dev pages share settings, just like the real extension.

**Check packs, build the zip:**

```bash
node scripts/validate-packs.mjs
./scripts/package.sh            # → dist/memecam-fx-<version>.zip
```

**Release:** bump `version` in `manifest.json`, commit, then tag and push it (for example `git tag v1.0.1 && git push --tags`). The GitHub Action checks that the tag matches the manifest, builds the zip and attaches it to a new Release.

Third-party components: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
