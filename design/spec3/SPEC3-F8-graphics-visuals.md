# SPEC3-F8 — Graphics & Visual Direction (specs 33–36)
**Thread:** F8 · **Reads:** GDD §9–10, `design/program/README.md`, VISUAL_ASSET_PLAN.md · **Status:** PLAN
**Thread pitch:** a beautiful game on a budget renderer — depth you can feel, sectors you can name
from one frame, ships that never flicker, and a HUD that disappears until it matters.

Ground truth: Three.js under a tilted top-down camera; DOM/CSS overlay UI (hud.js + injectHudCss in
uiRoot.js); pooled VFX in `vfx.js` (130KB); ship assembly via `visualFactory.js`/`partsLibrary.js`
from authored GLB parts; bloom threshold ~0.65; ACES tone-mapping deliberately deferred (palette
was tuned pre-ACES; switching now re-grades every material — do it once, deliberately, or not at
  all). Historical bugs included invalid whole-ship candidates, visual instability, and large
  shader/spawn hitches. Current routing, checks, and performance artifacts decide which remain;
  Kestrel and Wasp now have production whole-ship routes. Software-renderer fallback is a runtime
  diagnosis to surface, not permission to silently lower release quality. Perf target: GDD §10.

---

## SPEC3-33 — Render pipeline: stability, depth & the hitch kill-list
**One-line pitch:** the unglamorous spec that makes everything else possible — ship-visual
stability, the parallax depth stack, shader warm-up, and a perf harness that keeps us honest.

### 1. Why
You cannot art-direct an unstable renderer. Stability and frame pacing are visual qualities players
feel immediately; use the current program acceptance matrix and live measurements to identify the
actual blocking cluster.

### 2. The design
- **Ship visual stability probe FIRST** (the missing regression): a live probe recording, per
  visible ship over 300+ frames: mesh existence, `authoredAssetState`, `authoredCompositionId`,
  child mesh/static-batch counts, LOD level, bounds, on-screenness. Any transition not caused by a
  legit swap event = failure. Fix what it finds (likely culling bounds on batched parts, hot-swap
  ownership churn, or LOD hysteresis) BEFORE further perf cuts.
- **Parallax depth stack (GDD §9.1 reference):** skydome (exists) → 2–3 far dust sheets (additive
  planes, factor 0.15–0.3) → instanced mid debris (0.5–0.7, slow tumble) → near motes (1.2–1.5)
  that stretch into streaks on boost/cruise (the speed-sell layer, F3-18 drives stretch). All
  pooled, all camera-relative, motionReduce halves densities.
- **Hitch kill-list (GDD §10, sequenced):** (1) `renderer.compileAsync` warm-up of all
  material×light combos behind the loading veil + one hidden VFX salvo to warm particle pipelines;
  (2) spawn amortization ≤2 mesh-builds/frame + prebuilt pooled mesh per enemy archetype at sector
  load; (3) GC audit of 10-min play — kill per-frame allocations in event emission + HUD string
  building (memoize 10 Hz strings); (4) measure compositor-heavy CSS effects and retain them only
  where their player-facing benefit justifies the recorded cost.
- **GPU/runtime diagnosis without silent degradation:** detect software rendering and surface an
  actionable warning with measured attribution. Structural optimization, batching, culling,
  lifetime repair, and warm-up own the default performance target. Any emergency resolution/preset
  reduction is explicit and player-controlled, reported in evidence, and excluded from visual
  acceptance captures; it is not an automatic way to make a gate pass.
- **Tone-mapping baseline:** the current grade is non-ACES. Change it only as a deliberate full
  regrade with representative captures, material review, and performance evidence—not as a casual
  toggle or inherited prohibition.

### 3. Architecture & wiring
Probe: `scripts/check-ship-stability.mjs` driving the headless preview (SF global + manual frame
ticks — the proven harness). Parallax: new `render/parallaxStack.js` module, layers as pooled
instanced meshes keyed off camera transform (render-side only). Warm-up and runtime diagnostics stay
in the renderer boot/frame path. All render-side — zero sim/determinism contact.

### 4. Key code
```js
// Diagnose sustained pressure without mutating player quality behind their back.
if (p95 > TARGET_FRAME_MS) {
  performanceTelemetry.reportPressure({ p95, render, sim, ui, allocations, visibleWork });
}
```

### 5–6. Assets / deps
Procedural sprites and the current composer are starting candidates for dust/motes and post-processing.
Authored textures, media, renderer techniques, or dependencies are allowed when they materially improve
the result and document license, bundle/memory/performance, parity, and maintenance impact.

### 7. Build plan
1. Stability probe → fix findings → probe green in CI. **Blocks all other F8 work.**
2. Warm-up + spawn amortization; extend `check:perf` with hitch-count assertion (0 frames >32 ms
   over scripted 60 s combat+mining).
3. GPU/runtime diagnosis + explicit player-controlled fallback settings; no automatic quality cut.
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
- **Filaments** (tether, patrol scan-lock, teleport link): share a semantic family whose shape,
  motion, material, and state mapping are selected from representative captures. Ribbons, beams,
  particles, geometry, or shaders are candidate techniques, not a mandated implementation.
- **Decals/marks** (seam glow, siege target-mark, IFF arcs): use a reusable mark system with
  priority, occlusion, colorblind-safe shape/motion redundancy, and measured pool growth. Atlases,
  signed-distance fields, projected geometry, or authored meshes may be combined when they produce
  the clearest result.
- **Bursts** (shield break, fracture, vein strike, kill breakup): compose a readable event arc from
  the smallest effective set of layers. Re-parameterizing existing pools is a starting candidate;
  authored meshes, particles, lights, distortion, decals, or animation are allowed when evidence
  shows a stronger result within the measured frame budget.
- **Trails** (missiles, disruptor corkscrew, slingshot streak): choose geometry, particles, shaders,
  or hybrids from motion readability and profiling. Capacity, culling, and LOD/HLOD thresholds are
  derived from worst-case scenes rather than fixed here.
- **Status overlays** (vent stance, overload, complicity tells): prefer changes that remain readable
  on the moving ship without obscuring its identity. Material changes are one candidate alongside
  decals, particles, animation, lights, and spatial UI.
- **The cue contract extension:** every new event registers its visual, audio, camera, haptic, and
  accessibility candidates in the cue table. Layer and voice counts follow salience, masking, and
  measured performance; checks enforce registration, priority, cleanup, and budgets established by
  representative stress captures rather than universal per-event ceilings.

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
SPEC3-38 may produce atlases, authored marks, textures, meshes, or other source assets after an
in-game comparison. Procedural and authored techniques may be mixed. Dependencies are acceptable
when their license, bundle/performance, determinism/save, browser/Electron parity, and maintenance
impact are documented and the player-facing gain is demonstrated.

### 7. Build plan
1. cueRouter + vfxCues table; migrate a representative cross-section of existing hardcoded wirings;
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
  (F6-28 flips shift accents over a game-day). The listed core/belt/fringe/anomaly palettes are
  examples, not a universal visual requirement; each sector may earn a distinct art direction.
- **Signature sky per sector:** the skydome + far-dust sheets (F8-33 stack) get per-sector
  composition params: nebula mass position (Veil: enveloping; Ashfall: a wound on one horizon),
  star density, one *landmark silhouette* (Helios' sun lens, Charon's cinder giant) — the "you are
  here" read at zero draw cost beyond the stack.
- **Readability discipline (GDD §9.3, enforced):** affiliation and threat must survive motion,
  distance, color-vision differences, and visually complex sectors. Rim lights, engine treatments,
  silhouettes, formation, IFF glyphs, labels, audio, and behavior are candidate redundant channels;
  choose combinations through capture and playtest evidence rather than fixed warm/cool semantics or
  a universal identification-time threshold.
- **Prop dressing kits:** develop per-sector or per-region prop families whose density, variety,
  silhouette, material, interaction, and reuse are judged in representative routes. Instancing and
  authored/procedural sources are implementation tools, not fixed counts or band recipes.
- **The grade:** use lighting, fog, exposure, color management, post-processing, authored skies,
  and selective grading techniques as the sector requires. LUTs and equivalent tools are candidates
  when they improve identity without damaging readability or consistency.

### 3. Architecture & wiring
Palette block read by renderer lighting rig + parallax stack + prop spawner + HUD accent (SPEC3-36
consumes one accent var). Dressing = data lists in `sectorAnchors.js` pattern. War-wash = lerp on
accent uniforms driven by `faction:sectorFlipped`. All render/data-side.

### 4. Key code
```js
// A sector look remains data-driven while each value is art-directed from in-game evidence.
const LOOK = { lighting, atmosphere, sky, materials, accents, grading, readabilityTreatments };
```

### 5–6. Assets / deps
Landmarks and dressing assets are authored to the number, fidelity, and technique the approved sector
compositions require. Reuse is encouraged where it strengthens a visual family, not as a fixed cap.

### 7. Build plan
1. Look-data extension + lighting/render consumption; extend `check:sector-palettes` (every shipped
   sector has complete data and player-facing information meets the accessibility floor).
2. Sky composition params + landmarks (Helios/Charon first).
3. Readability pass + representative motion/still capture and identification review.
4. Prop kits per band + density data.
5. War-wash hook.

### 8. Anti-patterns
Identity via post filters (light + composition, not Instagram); murk that eats readability; prop noise
on the play plane; palette choices without a player-facing reason or evidence. Colors may diverge
when the asset or location needs it.

### 9. Ambition ceiling
Time-of-war presentation: a sector at `war` develops a perceptible environmental change before the
player reads a label. Compare lighting, atmosphere, traffic, material, audio, and landmark treatments;
store the selected transition in data and tune it against representative sector captures.

---

## SPEC3-36 — HUD 2.0 & the UI visual system
**One-line pitch:** a clear hierarchy, an unmistakable primary focus, and purposeful motion — a HUD
that carries every SPEC3 system without accreting competing surfaces.

### 1. Why
GDD §9.4 established a proven reference hierarchy (three anchors: status cluster bottom-left,
radar+overview bottom-right, single priority line top-center; no visor motifs remains a standing user
decision). The anchor count and rest-state treatment are not universal visual ceilings. SPEC3
adds many surfaces (ticker, siege, war, tether tension, charts) — without one gatekeeper spec they
will re-clutter the screen the 1.x way.

### 2. The design
- **Composition guidance:** new elements should join a coherent hierarchy or be contextual
  (appears on state, fades ≤4 s). The ticker = the priority line's *idle occupant* (chatter tier —
  it yields to everything). Tether tension = an arc on the status cluster. Siege wave/intermission =
  contextual top-center cards. War gauge/charts live in screens (map/market), never flight HUD.
- **Type and color discipline:** preserve legibility, hierarchy, and meaningful state change, but do
  not require one font family, fixed pixel sizes, cyan/amber/red, a per-sector accent quota, or a
  universal glow/animation recipe. Choose what best serves the surface and verify it in screenshots.
- **The overview strip (GDD §7.5, built here):** right-edge 8-row contact list: IFF chip, class
  glyph, name, distance, closing arrow; hostiles first; click = target; collapsible. This is the
  "wtf is around me" killer and F4's targeting UX in one.
- **Contextual chips:** credits/cargo deltas appear as chips on change then fade (retiring the
  bottom text-strip per GDD); profit toast (F1-10) is the same chip family.
- **Screen system polish:** station hub/market/map screens share legible interaction grammar and
  location/credits/time context where useful, without forcing identical tokens or layout onto every
  surface. Screen-hopping should feel like one game, not app-switching.

### 3. Architecture & wiring
All DOM/CSS in hud.js + injectHudCss (uiRoot.js) — the proven seam. Chips/cards/strip are hud
components fed by bus events through the attention arbiter (SPEC3-40 owns priority policy; this
spec owns pixels). Headless verification: SF global + manual `hud.frame` ticks (rAF throttles in
headless — known trap). `check:ui-identity` extends to catch overlap, inaccessible state cues,
unbounded animation/compositor cost, and unreadable priority—not historical token conformance.

### 4. Key code
```css
/* State remains explicit; treatment is selected and measured per surface. */
.hud [data-state="rest"] { --hud-state: rest; }
.hud .chip { transition: opacity .3s; } .hud .chip[data-stale="true"] { opacity: 0; }
```

### 5–6. Assets / deps
Class/IFF glyphs may begin from the SPEC3-38 atlas and shipped typography. New media, type, or
dependencies are allowed when they materially improve legibility/identity and document impact.

### 7. Build plan
1. Overview strip + contact events; `scripts/check-overview-strip.mjs` (rows sort, cap 8+N, click
   targets, collapse persists).
2. Chip family (credits/cargo/profit) + strip retirement.
3. Tether arc + siege cards + ticker-as-idle-line.
4. Screen token unification pass; extend `check:ui-identity` lints.
5. Five-second test captures in CI (with SPEC3-35).

### 8. Anti-patterns
A fourth anchor without a hierarchy reason; rest-state motion with no purpose; unreadable density;
visor/cockpit motifs remain a product preference. Per-screen bespoke styling is allowed when it is
intentional and coherent rather than accidental.

### 9. Ambition ceiling
HUD "quiet mode" (H hold): everything but the priority line fades 90% for screenshots and flow
states — confidence expressed as a feature.
