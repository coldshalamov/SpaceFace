# SpaceFace · Loading Terminal — Continuous Signal-Field Engine
## Engineering Handoff & Architecture Brief (2026-08-19)

---

### 1. What this is

The boot loading screen is a single **continuous, fully abstract GPU feedback
simulation** — not a set of scripted scenes. Every frame is derived from the
previous frame; every pixel changes every frame. The dot-matrix / ASCII
character grid is the **display technology** (a phosphor character screen at
~2-3px cells), never the pixel budget: the simulation underneath renders at
full canvas resolution.

Direction history (why it looks like this):

- The first agent built hand-scripted "acts" (a mascot face, a city, a
  dogfight) at a 120×60 character raster. That read as a cheap NES-era
  slideshow and was rejected: static backgrounds, a few chunked elements
  moving in simple ways, a cartoon ball-person with janky tubes.
- The second iteration went full-resolution WebGL with the same scripted-scene
  concept. Still fundamentally static per scene.
- The current engine removes the concept of a "scene" entirely. There is one
  evolving field, choreographed as five blended **phases** on a 32.5s loop:

```
GENESIS ──> CURRENTS ──> BLOOM ──> TEMPEST ──> SINGULARITY ──> (rebirth)
 dark water   emerald     kaleido-   torn field,  collapse into   whiteout,
 finds first  streams     scope      twin bolts   a core + rings  loop
 light        + fog       mandala    + flecks     (zoom ramp)
```

Phases cross-blend over the last 14% of their window; the simulation state
carries across transitions, so phases morph — there are no cuts anywhere in
the loop.

---

### 2. Architecture

`src/ui/loadingTerminalArt.js` — one module, two engines:

- **`createEngineGL(host)`** (default): WebGL2 ping-pong feedback. Pass 1
  renders the next simulation frame into FBO B by sampling FBO A (the previous
  frame) through:
  - a curl-noise flow warp (`curl2` of 4-octave fbm),
  - per-frame zoom / rotation about the center,
  - a kaleidoscope sector fold (BLOOM ramps it in/out),
  - row-coherent jitter (analog tape unrest, strongest in TEMPEST),
  - hue rotation + phosphor decay + saturation hold,
  - then adds new energy: phase emitter sets (embers / stream heads / petal
    rings / twin discharges / accretion core) and a full-frame living fog
    substrate (fbm-based, per-phase strength) so the frame never has dead
    zones.
  Pass 2 (`GLSL_POST`) displays FBO B as the character screen: ~2-3px cells
  pick a 16-step density-ramp glyph with per-cell color, plus chromatic
  aberration, mip-bloom, barrel distortion, aperture grille, scanlines,
  retrace band, tear/dropout glitch and the CRT power-on band.
  Cosine palettes (IQ-style `A + B·cos(2π(C·t+D))`) are interpolated by the JS
  choreographer per phase, so color morphs continuously too.
- **`createEngine(host)`** (fallback): the same direction in 2D — a particle
  swarm advected by a curl-ish value-noise flow field with per-phase speed,
  swirl, attractor, symmetry echo and palette, drawn onto the 120×120
  subpixel phosphor buffer (half-block cells + density-ramp glyphs, IGN
  dither, bloom, anamorphic flare, decay, phase burn-in crossfade).

Both factories are fully self-contained (no module-scope references) because
they are stringified into a Web Worker (`WORKER_BOOTSTRAP`); shader sources
travel via `host.sources`.

Phase choreography lives in JS (`PH` table + `phaseParams(tt)` inside
`createEngineGL`, `FLOWP` table inside `createEngine`): every knob (zoom, rot,
flowAmp/flowScale, drift, swirl, jitter, symmetry, decay, hue, beat period,
fog, palette, emitter mode) is a timeline parameter, cross-blended between
phases. Beats drive injection pulses and the waveform strip.

---

### 3. The lifecycle law (do not break)

**The artwork is decoration. It must never prevent the game from starting.**

- `createTerminalArtwork` is idempotent per canvas (`canvas.__sfTerminalArt`)
  — `transferControlToOffscreen` is irreversible and two boot paths set up
  the same element.
- After a successful transfer, a Worker failure keeps driving the SAME
  OffscreenCanvas on the main thread; there is no context to fall back to.
- GL is validated on a throwaway canvas first; any failure (compile, link,
  FBO, runtime) falls back to the 2D engine; a runtime GL error kills only
  the animation (`glRuntimeError`), never the game.
- Pinned by `test/loading-boot-resilience.test.mjs` and
  `test/loading-terminal-art.test.mjs`. Real-route proof:
  `npm run check:playable` and `npm run check:playable:desktop` (14 checks
  each: boot → menu → flight → controls → save/continue → no uncaught
  errors).

Engine health is observable: worker `glFallback` / `glInitError` /
`glRuntimeError` messages are forwarded to `console.warn` and to
`instance.__status()`.

---

### 4. Dev lab

`scripts/loading-terminal-lab.html` (serve with `npm run serve`, open
`http://localhost:8123/scripts/loading-terminal-lab.html`):

- `?act=0..4` pins a phase, `&t=X` scrubs local time, `&freeze=1` freezes the
  clock. With the clock frozen the feedback converges to its steady state at
  that `t` (~40+ frames) — ideal for deterministic screenshots.
- `&gl=0` forces the 2D fallback engine.
- Keys: `1-5` pin phase · `0` auto loop · `space` freeze · `[ ]` scrub ·
  `p` progress · `r` reduced-motion. The HUD shows `engine:` health.
- Mouse moves bias the flow field center (same interaction as the real boot
  screen).

Reduced motion scales flow/zoom/rotation/hue/jitter to ~30%, doubles beat
periods, halves symmetry, dims the whiteout — the field stays alive but calm.

---

### 5. Tuning cheat-sheet

- Trails too short/long → `flowAmp` (per phase; ~0.004-0.016 uv/frame).
- Frame feels empty → raise phase `fog`, emitter amplitudes/sizes in
  `inj0..inj4`, or `energy`.
- Too bright/washy → lower post gain (`outc = cellCol*glyphMix*1.95`) or
  emitter amps; decay > 0.98 accumulates fast.
- Cell density → `cellPxX = clamp(W/440, 2.0, 3.0)` in the GL frame loop
  (and `uCellPx` aspect 1.72).
- Phase character → the `PH` table is the entire choreography; add fields by
  packing them into the `uWarp/uFlow/uLook/uDrive/uAux` vec4s (one spare in
  `uAux.w`).
