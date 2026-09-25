# tools/cinematic — offline cinematic baker

Bakes authored cinematics to shipped video instead of rendering them live at
runtime. The intro visualizer (`assets/cinematics/intro-visualizer.mp4`) is the
boot/loading-screen visual: a 32s, 1920x1080, 24fps loop rendered from the
game's real GLB assets with a deterministic `t → frame` scene graph, a film
grade (chromatic aberration, grain, vignette, split-tone), bloom, and a
synthesized ambient bed.

## Files

- `intro.html` — harness page. Loads the scene, exposes `window.__cine`
  (`render(t)`, `renderFrame(i)`, `snapshot(type)`, `ready`, `frames`, `fps`).
  `?play=1` runs a realtime preview.
- `intro-scene.js` — the piece itself. Six shot groups (wake / witness /
  field / courier / gate / lapse), all motion a pure function of `t`; first and
  last frames match so the loop is seamless.
- `render-intro.mjs` — the baker. Drives the harness over Chrome DevTools
  Protocol, captures every frame, encodes h264 + synthesized audio via ffmpeg,
  writes `intro-visualizer.mp4` and the `.jpg` poster.
- `probe-frames.mjs` — look iteration: `node tools/cinematic/probe-frames.mjs 6 24`
  writes `.devshots/intro-cine/t_<t>.png` at 1280x720.
- `probe-boot-video.mjs` — runtime check: loads the real `index.html` and
  reports whether `#boot-intro-video` went live and played.

## Baking

Requires: `node server.js 8123` serving the repo root, Chrome on CDP :29229,
`ffmpeg`+`ffprobe` on PATH, `playwright-core` installed.

```
node tools/cinematic/render-intro.mjs            # full bake → mp4 + poster
node tools/cinematic/render-intro.mjs --skip-render  # re-encode existing frames
node tools/cinematic/render-intro.mjs --crf 24 --maxrate 7M --poster-t 24
```

## Playback path

`#boot-intro-video` sits inside `#boot-overlay` above the terminal canvas. On
`canplay` the overlay gets `boot-video-live`, the canvas hides, and the live
worker tableaux are never started; on any failure the element is removed and
the tableaux run instead. Reduced motion holds on the poster frame. The same
clip plays inside the cinematic splash `.cine-bg` and lives in the codex
signal archive (`VZ`).
