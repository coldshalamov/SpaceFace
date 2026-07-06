# SPEC3-F8 — Graphics & Visual Direction (specs 33–36)
**Thread:** F8 · **Reads:** GDD §9–10, `design/CURRENT_BUILD_STATUS.md`, VISUAL_ASSET_PLAN.md · **Status:** PLAN
**Thread pitch:** a beautiful game on a budget renderer — depth you can feel, sectors you can name
from one frame, ships that never flicker, and a HUD that disappears until it matters.

Ground truth: Three.js under a tilted top-down camera; DOM/CSS overlay UI (hud.js + injectHudCss in
uiRoot.js); pooled VFX in `vfx.js` (130KB); ship assembly via `visualFactory.js`/`partsLibrary.js`
from authored GLB parts; bloom threshold ~0.65; ACES tone-mapping deliberately deferred (palette
was tuned pre-ACES; switching now re-grades every material — do it once, deliberately, or not at
all). KNOWN BUGS: whole-ship GLBs fail the authored-part runtime contract (missing `spacefaceAsset`
metadata/maps/chamfer assertions → modular fallback); ships flicker/disappear with NO stability
probe; measured 54 ms worst-frame hitches (shader compile + spawn spikes); some machines fall to
SwiftShader software rendering (2–3 fps — environment, not code; needs GPU-detect + dynamic
resolution). Perf gospel: GDD §10 — zero >32 ms frames in normal play.

---

## SPEC3-33 — Render pipeline: stability, depth & the hitch kill-list
**One-line pitch:** the unglamorous spec that makes everything else possible — ship-visual
stability, the parallax depth stack, shader warm-up, and a perf harness that keeps us honest.

### 1. Why
You can't art-direct a renderer that drops ships (flicker bug) or hitches 54 ms. Stability and
frame-pacing ARE the visual upgrade players feel first. CURRENT_BUILD_STATUS lists exactly this as
the blocking cluster.

### 2. The design
- **Ship visual stability probe FIRST** (the missing regression): a live probe recording, per
  visible ship over 300+ frames: mesh existence, `authoredAssetState`, `authoredCompositionId`,
  child mesh/static-batch counts, LOD level, bounds, on-screenness. Any transition not caused by a
  legit swap event = failure. Fix what it finds (likely culling bounds on batched parts, hot-swap
  ownership churn, or LOD hysteresis) BEFORE further perf cuts.
- **Parallax depth stack (GDD §9.1, locked):** skydome (exists) → 2–3 far dust sheets (additive
  planes, factor 0.15–0.3) → instanced mid debris (0.5–0.7, slow tumble) → near motes (1.2–1.5)
  that stretch into streaks on boost/cruise (the speed-sell layer, F3-18 drives stretch). All
  pooled, all camera-relative, motionReduce halves densities.
- **Hitch kill-list (GDD §10, sequenced):** (1) `renderer.compileAsync` warm-up of all
  material×light combos behind the loading veil + one hidden VFX salvo to warm particle pipelines;
  (2) spawn amortization ≤2 mesh-builds/frame + prebuilt pooled mesh per enemy archetype at sector
  load; (3) GC audit of 10-min play — kill per-frame allocations in event emission + HUD string
  building (memoize 10 Hz strings); (4) keep `backdrop-filter` removals.
- **GPU-detect + dynamic resolution:** boot probe (WEBGL_debug_renderer_info; SwiftShader/llvmpipe
  match → warn banner + auto-low preset). Dynamic resolution: render-target scale steps
  1.0/0.85/0.7/0.55 driven by 120-frame p95 frame-time; UI/DOM never scales. The 2–3 fps machine
  gets an honest 30+ at 0.55 with the DOM HUD still crisp.
- **Tone-mapping decision:** stay non-ACES this cycle (grade is tuned to it). Revisit ONLY as a
  one-shot "regrade week" post-SPEC3, never mid-stream.

### 3. Architecture & wiring
Probe: `scripts/check-ship-stability.mjs` driving the headless preview (SF global + manual frame
ticks — the proven harness). Parallax: new `render/parallaxStack.js` module, layers as pooled
instanced meshes keyed off camera transform (render-side only). Warm-up in renderer boot path;
dynamic-res in `renderer.js` frame loop. All render-side — zero sim/determinism contact.

### 4. Key code
```js
// Dynamic resolution — hysteresis or it oscillates visibly. Step down fast, up slow.
const P95_HI = 30, P95_LO = 20;                     // ms thresholds
if (p95 > P95_HI && scaleIdx < SCALES.length - 1) { scaleIdx++; cooldown = 240; }
else if (p95 < P95_LO && scaleIdx > 0 && --cooldown <= 0) { scaleIdx--; cooldown = 600; }
renderer.setPixelRatio(base * SCALES[scaleIdx]);    // DOM overlay untouched — text stays crisp
```

### 5–6. Assets / deps
Dust/mote textures: 2 procedural blob sprites (canvas-generated at boot — no files). No new deps
(post-processing stays the existing composer; no library swap this cycle).

### 7. Build plan
1. Stability probe → fix findings → probe green in CI. **Blocks all other F8 work.**
2. Warm-up + spawn amortization; extend `check:perf` with hitch-count assertion (0 frames >32 ms
   over scripted 60 s combat+mining).
3. GPU-detect + dynamic res + low preset.
4. Parallax stack + motionReduce + boost-streak hook.
5. GC audit pass (heap profile, memoize HUD strings).

### 8. Anti-patterns
Perf cuts before stability (you'll optimize the bug in); per-frame material/geometry creation
anywhere; scaling the DOM HUD with render res; ACES drive-by; parallax layers that parallax the
*play plane* (readability is sacred — depth lives strictly behind it).

### 9. Ambition ceiling
Sector-load "establishing shot": 1.2 s slow camera settle through the parallax stack on jump-in —
the depth stack becomes the arrival moment. Render-side, skippable, motionReduce-off.

---

## SPEC3-34 — VFX & the juice systems
**One-line pitch:** one pooled effects grammar for every system this plan adds — tether filaments,
siege telegraphs, vein strikes, kill beats — cheap, readable, and all state-change-driven.

### 1. Why
F3/F4/F6/F2 all order feedback from the same kitchen: `vfx.js`'s pooled architecture. Without one
spec owning the grammar, juice becomes 6 inconsistent dialects and a draw-call bill.

### 2. The design — the effect grammar (families, not one-offs)
- **Filaments** (tether, patrol scan-lock, teleport link): ribbon mesh, additive, vertex-color
  gradient, tension/state → color+amplitude. One family serves F3-17, F1-12 scans, F6-26 teleporter.
- **Decals/marks** (seam glow, siege target-mark, IFF arcs): camera-facing quads from one atlas,
  pooled 128. Amber = warning, red = imminent, cyan = info — never decorative.
- **Bursts** (shield-break ring, fracture, vein strike, kill breakup): the existing explosion pool
  re-parameterized (scale/color/count curves in data). Kill = interior flash → breakup chunks →
  shockwave ring (GDD §6.3 wiring).
- **Trails** (missiles, disruptor corkscrew, slingshot streak): pooled ribbon trails, 24 max,
  LOD'd off at low preset.
- **Status overlays** (vent stance glow, overload stutter, complicity tells): material emissive
  swaps on the ship mesh — zero extra draws.
- **The juice contract extension:** every NEW event this plan ships maps to ≤1 effect per family +
  ≤1 audio cue + optional trauma (F3-18's budget). A table in this spec's appendix is the single
  registry (implementers add rows, checks lint them against emitted events).

### 3. Architecture & wiring
All families live in `vfx.js` pools (extend, don't fork). Event→effect wiring via one data table
`src/data/vfxCues.js` (`{event, family, params, audioCue?, trauma?}`) consumed by a thin
`presentation/cueRouter.js` — new systems emit events and *never* call vfx directly (one seam,
lintable, motionReduce-aware).

### 4. Key code
```js
// cueRouter — the entire juice layer is data + one subscriber. Adding an effect = adding a row.
for (const cue of VFX_CUES) bus.on(cue.event, payload => {
  if (!passesFilter(cue, payload)) return;
  vfx.spawn(cue.family, cue.params, payload);
  if (cue.audioCue) audio.cue(cue.audioCue, payload);
  if (cue.trauma) camera.addTrauma(scaleTrauma(cue.trauma, payload));   // F3-18 momentum scaling
});
```

### 5–6. Assets / deps
One 8-glyph decal atlas (SPEC3-38 generates); everything else procedural. No new deps.

### 7. Build plan
1. cueRouter + vfxCues table; migrate 5 existing hardcoded wirings as proof;
   `scripts/check-vfx-cues.mjs` (every table event exists; every SPEC3 event with `juice:true`
   has a row; pool caps respected at worst case).
2. Filament family (tether first — F3-17's dependency).
3. Decal marks (siege + seam + IFF arcs). 4. Burst re-parameterization + kill beat.
5. Trails + LOD-off at low preset.

### 8. Anti-patterns
Direct vfx calls from systems (router or nothing); effects at rest (glow = state change, GDD
pillar); pool overflow silently dropping the IMPORTANT effect (priority field: warnings > deaths >
cosmetics); juice that hides gameplay (marks never occlude the reticle path).

### 9. Ambition ceiling
Damage-state persistence: hull-hit fire pinpoints that live on the mesh until repair (GDD §6.3) —
ships wear their history; the fleeing pirate trailing smoke is unscripted storytelling.

---

## SPEC3-35 — Sector visual identity & art direction
**One-line pitch:** ten sectors you can name from a paused screenshot — data-driven palettes,
signature skies, and readability discipline that makes beauty and clarity the same feature.

### 1. Why
GDD §9.2: palette data-driveness scored 2/5; sector palettes now pass `check:sector-palettes`, but
identity is more than tint — sky composition, prop dressing, fog character, and the *lighting story*
per sector are unowned. F7-30's verbs need matching looks.

### 2. The design
- **Palette block per sector (extend `sectors.js` palette):** key/rim/fill light colors, nebula
  tint, fog color+density, dust hue, emissive accent (used by stations/props), war-wash overlay hue
  (F6-28 flips shift accents over a game-day). Core = clean cyan/steel; belts = rust/amber haze;
  fringe = sodium-red murk; anomaly = violet/green wrongness (GDD baseline, kept).
- **Signature sky per sector:** the skydome + far-dust sheets (F8-33 stack) get per-sector
  composition params: nebula mass position (Veil: enveloping; Ashfall: a wound on one horizon),
  star density, one *landmark silhouette* (Helios' sun lens, Charon's cinder giant) — the "you are
  here" read at zero draw cost beyond the stack.
- **Readability discipline (GDD §9.3, enforced):** faction rim-light + engine glow (hostile warm /
  friendly cool, colorblind-redundant with IFF glyphs); nothing unidentifiable on screen >1 s
  (five-second test in CI screenshots); ambiguous translucent spheres get horizon-line + approach
  label treatment.
- **Prop dressing kits:** per-band prop palettes (core: clean gantries, ad boards; belt: slag
  heaps, gutted frames; fringe: graffiti'd wrecks; anomaly: Vael geometry) — 6–10 props per band
  from existing primitives + SPEC3-37/38 textures, instanced, density per sector data.
- **The grade:** per-sector fog + vignette strength only (no LUTs this cycle — ACES decision).
  Sker's murk is fog character, not a filter.

### 3. Architecture & wiring
Palette block read by renderer lighting rig + parallax stack + prop spawner + HUD accent (SPEC3-36
consumes one accent var). Dressing = data lists in `sectorAnchors.js` pattern. War-wash = lerp on
accent uniforms driven by `faction:sectorFlipped`. All render/data-side.

### 4. Key code
```js
// One palette struct, five consumers, zero special cases. Adding a sector look = data.
const PALETTE = { key:'#9fd8ff', rim:'#3a86ff', fill:'#16324f', nebula:'#5a3e8c',
  fog:{ color:'#0a1420', density:0.012 }, dust:'#7aa7c7', accent:'#59f0d8', warWash:'#c0392b' };
```

### 5–6. Assets / deps
Landmark silhouettes: 4 authored low-poly meshes (SPEC3-37); prop textures via SPEC3-38. No new deps.

### 7. Build plan
1. Palette block extension + lighting-rig consumption; extend `check:sector-palettes` (all 10
   populated, contrast ratios pass a11y floor).
2. Sky composition params + landmarks (Helios/Charon first).
3. Readability pass (rim-light, sphere labels) + five-second-test capture script.
4. Prop kits per band + density data.
5. War-wash hook.

### 8. Anti-patterns
Identity via post filters (light + composition, not Instagram); murk that eats readability (hostiles
must pop in Sker's red — test it); prop noise on the play plane (density caps; silhouettes stay
clean); palette drift (new colors enter via the block or not at all).

### 9. Ambition ceiling
Time-of-war lighting: a sector at `war` shifts its key light 10° and cools 300 K — players sense
something's wrong before reading anything. Data lerp, zero new tech.

---

## SPEC3-36 — HUD 2.0 & the UI visual system
**One-line pitch:** three anchors, one voice, zero rest-state glow — the HUD that GDD §9.4 specified,
extended to carry every SPEC3 system without growing a fourth anchor.

### 1. Why
GDD §9.4 locked the philosophy (three anchors: status cluster bottom-left, radar+overview
bottom-right, single priority line top-center; no visor motifs — user-rejected, permanent). SPEC3
adds many surfaces (ticker, siege, war, tether tension, charts) — without one gatekeeper spec they
will re-clutter the screen the 1.x way.

### 2. The design
- **Anchor budget law:** every new element must join an existing anchor or be contextual
  (appears on state, fades ≤4 s). The ticker = the priority line's *idle occupant* (chatter tier —
  it yields to everything). Tether tension = an arc on the status cluster. Siege wave/intermission =
  contextual top-center cards. War gauge/charts live in screens (map/market), never flight HUD.
- **Type & color discipline (locked):** one mono family, three sizes (11/13/16 px @1080), uppercase
  labels only; semantic palette cyan/amber/red + per-sector accent (from SPEC3-35 palette,
  ≤10% usage). Nothing pulses at rest; glow = state change, decays ≤600 ms.
- **The overview strip (GDD §7.5, built here):** right-edge 8-row contact list: IFF chip, class
  glyph, name, distance, closing arrow; hostiles first; click = target; collapsible. This is the
  "wtf is around me" killer and F4's targeting UX in one.
- **Contextual chips:** credits/cargo deltas appear as chips on change then fade (retiring the
  bottom text-strip per GDD); profit toast (F1-10) is the same chip family.
- **Screen system polish:** station hub/market/map screens adopt the same tokens (styles/ui.css
  vars) + a shared header pattern (location · credits · time) so screen-hopping stops feeling like
  app-switching.

### 3. Architecture & wiring
All DOM/CSS in hud.js + injectHudCss (uiRoot.js) — the proven seam. Chips/cards/strip are hud
components fed by bus events through the attention arbiter (SPEC3-40 owns priority policy; this
spec owns pixels). Headless verification: SF global + manual `hud.frame` ticks (rAF throttles in
headless — known trap). `check:ui-identity` extends to lint: anchor count ≤3, rest-state animation
= none, token usage only.

### 4. Key code
```css
/* The entire rest-state law in one rule — audited by check, not by vigilance. */
.hud [data-state="rest"] { animation: none; box-shadow: none; filter: none; }
.hud .chip { transition: opacity .3s; } .hud .chip[data-stale="true"] { opacity: 0; }
```

### 5–6. Assets / deps
Class/IFF glyphs from the SPEC3-38 atlas. No new deps (no font added — mono family already shipped).

### 7. Build plan
1. Overview strip + contact events; `scripts/check-overview-strip.mjs` (rows sort, cap 8+N, click
   targets, collapse persists).
2. Chip family (credits/cargo/profit) + strip retirement.
3. Tether arc + siege cards + ticker-as-idle-line.
4. Screen token unification pass; extend `check:ui-identity` lints.
5. Five-second test captures in CI (with SPEC3-35).

### 8. Anti-patterns
A fourth anchor (the law exists because everyone wants one); rest-state pulse "so it looks alive"
(the WORLD is alive — the HUD is furniture); numbers where arcs suffice; visor/cockpit motifs
(permanently rejected); per-screen bespoke styling.

### 9. Ambition ceiling
HUD "quiet mode" (H hold): everything but the priority line fades 90% for screenshots and flow
states — confidence expressed as a feature.
