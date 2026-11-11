# Brand packs

A brand pack changes how MemeCam FX looks and feels: popup colours, effect names, the cinema picture and caption, what rains down, the facepalm picture and the colour of the dust you turn into. Everyone picks their pack in the popup.

## Make one in five minutes

1. Copy a pack folder, for example `packs/party` → `packs/acme`. The folder name is the pack id: letters, numbers, `-` and `_` only.
2. Edit `packs/acme/pack.json` (format below) and drop your pictures into the folder.
3. Add the id to `packs/index.json`. The list order is the order in the popup:
   ```json
   { "packs": ["classic", "party", "office", "acme"] }
   ```
4. Check it:
   ```bash
   node scripts/validate-packs.mjs
   ```
5. Reload the extension in `chrome://extensions`, choose your pack in the popup and hit **Try it**.

## pack.json

Every field is optional except `name`. Anything you leave out comes from the Classic defaults.

```jsonc
{
  "name": "Acme",                         // shown in the popup (max 30 chars)
  "description": "Rocket rain and launch-day cinema.",

  "theme": {                              // popup colours, all "#rrggbb"
    "accent": "#ff6a00",                  // switches, buttons, highlights
    "accentInk": "#1a0d00",               // knob/text drawn on top of the accent
    "bg": "#120c08", "card": "#1d140e", "line": "#33241a",
    "text": "#fff1e6", "dim": "#b39a88"
  },

  "cinema": {                             // both hands up
    "label": "Launch day",                // popup wording: "Both hands up → Launch day"
    "image": "cinema.jpg",                // optional picture, relative to this folder
    "caption": "WE HAVE LIFTOFF"          // used when there's no picture, or no face in it
  },

  "facepalm": {                           // hand over eyes
    "label": "Facepalm",
    "image": "../_shared/facepalm.png",   // shared pictures live in packs/_shared/
    "opacity": 0.5                        // 0.1 – 1
  },

  "rain": {                               // double snap
    "label": "Rocket rain",
    "style": "images",                    // "bills", "emoji" or "images"
    "items": ["logo.png", "rocket.png"]   // pictures (images) or emoji characters (emoji), max 12
  },

  "dust": {                               // what you dissolve into when you snap
    "colors": ["#ff6a00", "#ffd23f"]      // one colour = ash; several = glitter
  }
}
```

### Cinema picture: face-swap or letterbox

- **A picture with a clear, front-facing face** (like the Classic pack's): when you raise your hands, the whole frame becomes that picture with *your* live face swapped in. Put the caption in the picture itself.
- **No picture, or no face found:** your video goes black-and-white with letterbox bars and the `caption` in big type. A face-less picture also pops up as a card in the corner.

Use JPG or PNG files, ideally around 1000 px and under 2 MB each.

### Rain styles

| style | items | looks like |
|---|---|---|
| `bills` | not needed. Set `symbol` (e.g. `"€"`), `value` (e.g. `"500"`) and optionally `palette`: a list of `["#light", "#dark"]` pairs | flipping banknotes |
| `emoji` | emoji characters, e.g. `["🎉", "🚀"]` | tumbling emoji |
| `images` | picture files in the pack folder, e.g. your logo as a transparent PNG | tumbling logos |

**Company logo rain** is the quickest way to brand it. Export your logo as a square, transparent PNG of about 256 px. Then use `"style": "images"` with `"items": ["logo.png"]`.

## Notes

- The **classic** pack must stay in `index.json`, because it's the fallback if a pack fails to load.
- Pictures someone picks with *Change…* in the popup override the pack's picture for that person only. *Use pack's* switches back.
- Only add pictures you're allowed to share. This repo is public, so for a company pack with internal logos or photos, keep it in a private fork.
