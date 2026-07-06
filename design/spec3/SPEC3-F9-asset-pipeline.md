# SPEC3-F9 — Asset Pipeline: Blender, Image-Gen & Audio (specs 37–39)
**Thread:** F9 · **Reads:** GDD §9, VISUAL_ASSET_PLAN.md, `design/CURRENT_BUILD_STATUS.md` · **Status:** PLAN
**Thread pitch:** the production lane that feeds every other thread — a Blender ship/part pipeline
that can't ship a broken contract, an image-gen lane with palette discipline, and the procedural
audio identity extended to every new verb.

Ground truth: parts are authored in Blender → `assets/ships/parts/` (authoring inputs) → release
pipeline → `assets/ships/release/parts/` (runtime truth; browser + desktop identical).
`parts_manifest.json` / `release_manifest.json` track them; a Blender MCP bridge is available for
scripted authoring; the dev→release hot-swap seam is proven (zero-refactor part replacement).
KNOWN FAILURE: `release/parts/wholeships/{kestrel,pelican,wasp}.glb` are declared + manifest-covered
but the live `assetLoader` REJECTS them — missing `spacefaceAsset` metadata, required maps, and
chamfer/bevel assertions → silent fallback to modular assemblies (`npm run check:assets:live` red).
Production coordination via `assets/ships/release.__lock/` + `release.__building/`. Audio is 100%
procedural (audioSystem.js + synth + audioRecipes patterns) — a shipping advantage, keep it.

---

## SPEC3-37 — The Blender ship & prop pipeline
**One-line pitch:** fix the whole-ship contract, then industrialize: a validated, scriptable
Blender→release lane with a prioritized authoring queue serving every SPEC3 thread.

### 1. Why
The best silhouettes in the game currently *cannot load* (contract failure) and nobody notices
until a check runs — the pipeline's exact job. Meanwhile SPEC3 threads queue ~30 small authored
parts (claim modules ×7, hunter signature parts ×12, landmarks ×4, vault/tower ×2, module-visual
variants ×8). Without an industrial lane, F5/F6/F8 starve.

### 2. The design
- **Step 1 — make the contract executable in Blender, not prose:** a `spaceface_export.py` Blender
  script (run via the MCP bridge or CLI) that: stamps `spacefaceAsset` metadata (id, kind, version,
  composition fields) into GLB extras; validates required maps (baked AO/roughness per the
  assetLoader contract), enforces chamfer/bevel assertions (min bevel segments on hard edges —
  the style law), checks tri budgets + pivot/scale conventions, THEN exports. **Export refuses on
  violation with the exact failing assertion.** The contract stops being tribal knowledge.
- **Step 2 — repair the three whole-ships** by round-tripping them through the exporter (re-stamp
  metadata, bake missing maps, re-bevel where asserted), then `check:assets:live` green with
  `failureCount: 0` and the player flying the intended whole-ship bodies. Decision locked: repair
  the GLBs to meet the contract; do NOT relax the contract (it guards visual coherence).
- **Step 3 — the authoring queue:** one `assets/QUEUE.md` table (id, kind, thread, tri budget,
  palette, status) seeded from SPEC3 needs (list above) + `wantsVisual` flags from F5-23. Queue
  discipline: nothing enters release without exporter pass + manifest entry + reachability check.
- **Style law (from VISUAL_ASSET_PLAN, enforced):** hard-surface, chamfered everything (no razor
  edges), one emissive accent material slot fed by sector/faction palette at runtime, tri budgets
  (part ≤1.2k, whole-ship ≤6k, prop ≤600, landmark ≤2.5k), no textures where vertex color + one
  trim sheet suffices.
- **LOD & batching by construction:** exporter generates LOD1 (decimate 45%) + LOD2 (silhouette
  hull) into the GLB; assetLoader already LODs — authored assets arrive LOD-complete so the F8-33
  stability probe never sees improvised swaps.

### 3. Architecture & wiring
`tools/blender/spaceface_export.py` (new) + `scripts/build-release-assets.mjs` (extend existing
release step to call validation headlessly via `blender -b -P`). Manifest entries stay the current
schema. The MCP bridge is the *interactive* authoring path; the script is the *gate* — both end at
the same exporter. Runtime untouched (the hot-swap seam already works when the contract passes).

### 4. Key code
```python
# spaceface_export.py — the assertion that would have caught the whole-ship failure:
def validate(obj, spec):
    extras = obj.get('spacefaceAsset')
    assert extras and extras.get('id') == spec.id, f"{spec.id}: missing spacefaceAsset extras"
    for m in spec.required_maps:                       # e.g. ['ao', 'roughness']
        assert has_baked_map(obj, m), f"{spec.id}: missing baked map '{m}'"
    for e in hard_edges(obj):
        assert e.bevel_segments >= 2, f"{spec.id}: unchamfered hard edge at {e.index}"
    assert tri_count(obj) <= spec.tri_budget, f"{spec.id}: {tri_count(obj)} tris > {spec.tri_budget}"
```

### 5. Assets & generation (the queue, priority order)
1. Whole-ship repairs ×3 (unblocks `check:assets:live`). 2. Claim module parts ×7 (F6-26).
3. Hunter signature parts ×12 (F4-22). 4. Landmarks ×4 + vault/tower ×2 (F7-30/31, F8-35).
5. Module-visual variants ×8 (F5-23). Each queue row carries its palette + budget from the style law.

### 6. Libraries / tooling
Build-time only: **gltf-transform** (MIT) in the release script for Draco/meshopt compression +
prune/dedup (≈40–60% GLB size cut; browser loader already supports Draco via three's loaders).
No runtime deps.

### 7. Build plan
1. Exporter script + validation; `scripts/check-exporter.mjs` (golden part round-trips; a
   deliberately-broken part fails with named assertion).
2. Whole-ship repair ×3 → `check:assets:live` failureCount 0 → F8-33 stability probe re-run.
3. Release-script integration + gltf-transform compression + reachability guard.
4. QUEUE.md + first content batch (claim modules).
5. LOD generation + probe assertions on LOD swaps.

### 8. Anti-patterns
Relaxing the contract to ship an asset (repair the asset); authoring without the exporter (tribal
knowledge rot); texture sprawl (trim sheet + vertex color first); un-queued asset work (the queue
is the contract with the other threads); runtime dependencies for build-time problems.

### 9. Ambition ceiling
Parametric part families: exporter-side scripts generate size variants (S/M/L battery masts) from
one master file — the queue's 30 items become ~14 masters.

---

## SPEC3-38 — Image-gen & procedural texture lane
**One-line pitch:** a disciplined image-generation pipeline for the 2D surfaces — UI atlas, trim
sheet, splash/marketing, portraits — palette-locked, seam-checked, and always a fallback-safe layer.

### 1. Why
The repo already learned this lesson (splash de-visor + clean bg swap; pilot portraits as
reference-only): generated images help exactly where they're *flat, stylized, and replaceable* —
and hurt when they drift off-palette or pretend to be 3D. This spec makes the lane repeatable.

### 2. The design — what gets generated (and what never does)
- **Generated:** the 8-glyph decal/UI atlas (F8-34/36), one 1024² hard-surface trim sheet
  (panels/vents/greebles for SPEC3-37 parts), sector backdrop nebula plates (skydome source, 2k,
  seamless-checked), splash/menu backgrounds, 18 crew portraits (F5-25) in one locked style,
  station ad-board plates (F8-35 core-world dressing), store/marketing capsules.
- **Never generated:** ship textures (trim sheet + vertex color law), HUD elements (CSS/canvas —
  crispness law), anything with text baked in (localization + blur).
- **Prompt discipline (the reusable recipe):** every asset generated with: (a) the palette hex
  list from SPEC3-35's block pasted into the prompt, (b) style anchors ("flat stylized sci-fi,
  hard-edge shapes, no photorealism, no lens effects"), (c) negative: "no text, no watermark, no
  faces [except portraits], no cockpit/visor framing", (d) generate 4 → pick 1 → *post-process to
  palette* (quantize-to-palette pass, below). Portraits add: one reference character sheet
  generated first, then "same style as reference" for the set — consistency beats per-image quality.
- **Seam & palette enforcement (scripted, not eyeballed):** `scripts/check-image-assets.mjs`:
  tileables pass a wrap-shift seam diff (<2% edge delta); all assets pass a palette-distance
  histogram (≥92% of pixels within ΔE 12 of the sector/UI palette); resolution/format budget
  (KTX2/basis for plates — build-time compression, browser-supported).
- **Provenance & license log:** `assets/GENERATED.md` — file, tool, date, prompt hash. (Steam/
  storefront AI-disclosure rules are evolving — the log makes any future disclosure a copy-paste,
  and keeps reference-only vs shipped assets separated.)

### 3. Architecture & wiring
Assets land in the existing lanes (`assets/…` + manifests + reachability check — the
reference-only allowlist pattern already exists). Quantize/seam scripts in `tools/imagegen/`.
Runtime consumption unchanged (textures load like any other).

### 4. Key code
```js
// Palette quantize pass — generation gets you 90% there; this buys the last 10% of coherence.
// Nearest-palette-color in Oklab space, dither only on plates (never on glyphs).
for (const px of pixels) px.set(nearestOklab(PALETTE, px, { dither: kind === 'plate' }));
```

### 5. Assets & generation instructions (first batch, exact)
1. UI/decal atlas: 8 glyphs (target-mark, seam, IFF friend/hostile/neutral, warning, claim, scan),
   monochrome white-on-alpha, 128² each, "geometric sci-fi glyph, single weight, flat" — then
   hand-kern in an atlas. 2. Trim sheet: "orthographic sci-fi panel trim sheet, flat color, hard
   shadows, cyan accent lines" + palette. 3. Veil + Ashfall nebula plates (seamless). 4. Portrait
   sheet → 18 portraits. 5. Two ad-board plates (no text — text overlaid live by CSS).

### 6. Libraries / tooling
Build-time only: sharp or ImageMagick (present via media-processing tooling) for quantize/seam
scripts; toktx/basisu for KTX2. No runtime deps.

### 7. Build plan
1. Scripts (seam/palette/provenance) + GENERATED.md. 2. Atlas + trim sheet (unblocks F8-34/37).
3. Nebula plates + skydome hookup. 4. Portraits (after F5-25 lands hiring). 5. Marketing capsules
(last — the game sells itself first).

### 8. Anti-patterns
Off-palette one-offs (quantize or reject); photoreal drift; baked text; generated UI chrome;
untracked provenance; using generation to *design* (it renders decisions made in specs — taste
stays here).

### 9. Ambition ceiling
Sector-palette re-tints of the one trim sheet done *procedurally at build* — one authored sheet,
ten sector variants, zero extra generation.

---

## SPEC3-39 — Procedural audio expansion
**One-line pitch:** extend the zero-asset synth identity to every new verb — tension you can hear,
sectors you can identify blind, and a mix that respects the one-voice law.

### 1. Why
Every SPEC3 thread ordered cues (tether hum, vent chime, siege stingers, ticker blips, vein
strikes). The procedural approach (audioSystem.js + audioRecipes patterns) is a shipping advantage —
and the semantic-cue groundwork (audio identity check green) is laid. What's missing is the
catalogue + the mixing law.

### 2. The design
- **New recipe families:** (a) *tension drones* — tether hum (pitch ∝ tension 80→220 Hz, breaks
  add noise burst "whipcrack"), cruise spool riser, siege approach bed; (b) *confirmation chimes* —
  vent-bonus, tracking-bonus tick, claim-built, chain-complete (all ≤180 ms, pentatonic family so
  overlaps never sour); (c) *world signals* — ticker blip (per headline class), convoy departure
  horn (distant, filtered), vein-strike rumble+arp, war-state shift (one low brass-ish swell);
  (d) *sector ambience pads* — one per palette class (core/belt/fringe/anomaly), 2-oscillator
  drones with sector-seeded detune so Veil never sounds like Sker.
- **The mixing law (one voice, for ears):** 4 buses — alerts > speech-equivalent (arbiter line
  blips) > world > ambience. Side-chain: alerts duck everything −6 dB, 120 ms attack. Max ONE
  world-signal per 4 s (matches bark cap). Combat intensity drives the existing adaptive music bed
  ±1 layer only (restraint = premium).
- **Every cue via the cueRouter** (F8-34): `audioCue` column in `vfxCues.js` — audio and visuals
  stay in lockstep by construction.
- **Accessibility:** all semantic cues carry a visual twin (existing radar/HUD redundancy law);
  a "reduced audio" setting caps simultaneous voices at 8.

### 3. Architecture & wiring
New recipes in `audioRecipes.js` (patterns exist to copy); buses/ducking in audioSystem.js master
graph (one-time). Sector pads keyed off palette class + sector seed. Cue triggers exclusively via
cueRouter rows. Headless verification stays "synthesizes without errors" + recipe unit checks
(node-graph shape assertions) since audio can't be heard in CI.

### 4. Key code
```js
// Tether hum — tension is a CONTINUOUS param, not retriggered one-shots. One voice, always alive
// while attached, silent at rest. Retriggering per tension change is the amateur mistake.
const hum = recipes.drone({ base: 80, q: 8 });
bus.on('tether:tension', ({ t01 }) => hum.set({ freq: 80 + 140 * t01, gain: 0.05 + 0.25 * t01 }));
bus.on('tether:cut', ({ slingshot }) => { hum.stop(); if (slingshot) recipes.whipcrack(); });
```

### 5–6. Assets / deps
Zero files (the whole point). No new deps (pure WebAudio; howler et al. explicitly rejected —
the procedural stack is the identity).

### 7. Build plan
1. Bus/ducking graph + `scripts/check-audio-mix.mjs` (bus routing, duck timing, voice caps).
2. Tension drones (tether first — F3-17 dependency).
3. Chime + world-signal families via cueRouter rows.
4. Sector pads + palette-class mapping; extend `check-audio-identity.mjs`.

### 8. Anti-patterns
Sample files "just this once"; retriggered one-shots for continuous states; cue spam (the 4 s law);
music that swells at rest; cues without visual twins; recipes outside audioRecipes patterns.

### 9. Ambition ceiling
Doppler-lite on world signals (convoy horns pitch-bend by closing speed) — spatial storytelling
for one multiply per frame.
