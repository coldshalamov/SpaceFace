# SPEC3-F9 — Asset Pipeline: Blender, Image-Gen & Audio (specs 37–39)
**Thread:** F9 · **Reads:** GDD §9, VISUAL_ASSET_PLAN.md, `design/program/README.md` · **Status:** PLAN
**Thread pitch:** the production lane that feeds every other thread — a Blender ship/part pipeline
that can't ship a broken runtime contract, an evidence-reviewed image-gen lane, and the procedural
audio identity extended to every new verb.

Ground truth: parts are authored in Blender → `assets/ships/parts/` (authoring inputs) → release
pipeline → `assets/ships/release/parts/` (runtime truth; browser + desktop identical).
`parts_manifest.json` / `release_manifest.json` track them; a Blender MCP bridge is available for
scripted authoring; the dev→release hot-swap seam is proven (zero-refactor part replacement).
Historical whole-ship candidates did not all satisfy the loader or visual contract. Current status
is per exact asset ID: Kestrel and Wasp have production whole-ship routes; Pelican and other
candidates must be checked against the live manifests, classification records, and normal-route
evidence. Historical map/chamfer/profile assertions are not independent visual-quality law.
Production coordination via `assets/ships/release.__lock/` + `release.__building/`. Audio uses the
Web Audio mix/event architecture and may combine procedural synthesis with licensed authored
sources when that produces the strongest identity and runtime result.

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
  composition fields) into GLB extras; validates declared runtime inputs plus pivot/scale conventions;
  reports material, texture, geometry, byte-size, and draw-call profiles; then exports. **Export
  refuses corrupt, unloadable, or runtime-incompatible assets with the exact failing assertion.**
  Visual technique and profile alarms proceed to evidence review rather than becoming universal caps.
- **Step 2 — repair the three whole-ships** by round-tripping them through the exporter (re-stamp
  metadata and satisfy declared loader inputs), then `check:assets:live` green with
  `failureCount: 0` and the player flying the intended whole-ship bodies. Decision locked: repair
  the GLBs or coherently evolve loader/manifest support; do not weaken the boot/readiness contract.
- **Step 3 — the authoring queue:** one `assets/QUEUE.md` table (id, kind, thread, tri budget,
  palette, status) seeded from SPEC3 needs (list above) + `wantsVisual` flags from F5-23. Queue
  discipline: nothing enters release without exporter pass + manifest entry + reachability check.
- **Art direction:** there is no universal hard-surface, emissive, trim-sheet, palette, or material
  recipe. Choose the technique that best communicates this asset's role, history, faction, and
  projected screen presence. Chamfers, emissives, shared materials, and texture reuse are tools,
  not identity requirements.
- **Budgets:** current triangle defaults are profiling alarms, not taste ceilings. Raise them when
  silhouette, material detail, or authored surface information needs it and attach perf evidence. Do
  not decimate a hero asset into blandness merely to satisfy a historical default.
- **LOD & batching by construction:** exporter generates screen-space-validated LODs whose geometry
  reduction is chosen per asset, rather than applying a fixed decimation ratio. `assetLoader` already
  supports LODs; authored assets arrive LOD-complete so F8-33 never sees improvised swaps.

### 3. Architecture & wiring
`tools/blender/spaceface_export.py` (new) + `scripts/build-release-assets.mjs` (extend existing
release step to call validation headlessly via `blender -b -P`). Manifest entries stay the current
schema. The MCP bridge is the *interactive* authoring path; the script is the *gate* — both end at
the same exporter. Runtime untouched (the hot-swap seam already works when the contract passes).

### 4. Key code
```python
# spaceface_export.py — runtime compatibility is hard; visual profiles are evidence:
def validate(obj, spec):
    extras = obj.get('spacefaceAsset')
    assert extras and extras.get('id') == spec.id, f"{spec.id}: missing spacefaceAsset extras"
    assert runtime_inputs_resolve(obj, spec), f"{spec.id}: unresolved declared runtime input"
    assert valid_pivot_scale(obj, spec), f"{spec.id}: invalid pivot/scale convention"
    report_profile(obj, tris=True, textures=True, bytes=True, draw_calls=True)
```

### 5. Assets & generation (the queue, priority order)
1. Whole-ship repairs ×3 (unblocks `check:assets:live`). 2. Claim module parts ×7 (F6-26).
3. Hunter signature parts ×12 (F4-22). 4. Landmarks ×4 + vault/tower ×2 (F7-30/31, F8-35).
5. Module-visual variants ×8 (F5-23). Each queue row records visual direction and measured profile
   evidence against the live manifest/exporter policy.

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
Relaxing runtime compatibility to ship an asset; authoring without the exporter (tribal knowledge
rot); unmeasured material/texture or draw-call proliferation; un-queued asset work (the queue
is the contract with the other threads); unreviewed runtime dependencies for build-time problems.

### 9. Ambition ceiling
Parametric part families: exporter-side scripts generate size variants (S/M/L battery masts) from
one master file — the queue's 30 items become ~14 masters.

---

## SPEC3-38 — Image-gen & procedural texture lane
**One-line pitch:** a disciplined image-generation pipeline for 2D and surface assets — atlases,
materials, backdrops, marketing, portraits — evidence-reviewed, seam-checked, and fallback-safe.

### 1. Why
The repo already learned that generated assets can help when their provenance, runtime use,
composition, and review path are explicit, and hurt when they are incoherent or unvalidated. This
spec makes the lane repeatable without locking the game to one rendering style or technique.

### 2. The design — initial generation scope and review boundary
- **Initial candidates:** a decal/UI mark atlas sized from the approved cue inventory (F8-34/36),
  a hard-surface material/trim study
  (panels/vents/greebles for SPEC3-37 parts), sector backdrop nebula plates (seamless-checked),
  splash/menu backgrounds, 18 crew portraits (F5-25) with a coherent reviewed direction,
  station ad-board plates (F8-35 core-world dressing), store/marketing capsules.
- **Generation boundary:** no asset technique is universally forbidden. Generated ship textures,
  trim sheets, vertex colors, decals, and authored maps are all allowed when they survive runtime,
  licensing, readability, and quality review. Text baked into localized UI remains a bad technique.
- **Prompt discipline:** prompts must specify the asset's role, screen exposure, desired detail,
  composition, and licensing/provenance. Palette, rendering style, number of candidates, and post-
  processing are choices to be justified by the asset, not inherited requirements. Consistency must
  not outrank per-image quality.
- **Asset checks:** use seam, resolution, format, provenance, and runtime readability checks where
  relevant. Do not hard-fail an asset merely because its colors diverge from a shared sector/UI
  palette; palette fit is a review question, not a universal machine gate.
- **Provenance & license log:** `assets/GENERATED.md` — file, tool, date, prompt hash. (Steam/
  storefront AI-disclosure rules are evolving — the log makes any future disclosure a copy-paste,
  and keeps reference-only vs shipped assets separated.)

### 3. Architecture & wiring
Assets land in the existing lanes (`assets/…` + manifests + reachability check — the
reference-only allowlist pattern already exists). Quantize/seam scripts in `tools/imagegen/`.
Runtime consumption unchanged (textures load like any other).

### 4. Key code
```js
// Optional palette-fit diagnostic. It reports distance; it does not overwrite a strong source.
for (const px of pixels) reportOklabDistance(referenceRoles, px);
```

### 5. Assets & generation instructions (revisable first batch)
1. UI/decal atlas: 8 glyphs (target-mark, seam, IFF friend/hostile/neutral, warning, claim, scan),
   monochrome white-on-alpha, 128² each, "geometric sci-fi glyph, single weight, flat" — then
   hand-kern in an atlas. 2. Material study: generate several treatments appropriate to actual ship
   exposure, then select by runtime review rather than a fixed palette or texture recipe. 3. Veil +
   Ashfall nebula plates (seamless). 4. Portrait
   sheet → 18 portraits. 5. Two ad-board plates (no text — text overlaid live by CSS).

### 6. Libraries / tooling
Build-time only: sharp or ImageMagick (present via media-processing tooling) for quantize/seam
scripts; toktx/basisu for KTX2. No runtime deps.

### 7. Build plan
1. Scripts (seam/profile/provenance) + GENERATED.md. 2. Atlas + selected material study (unblocks F8-34/37).
3. Nebula plates + skydome hookup. 4. Portraits (after F5-25 lands hiring). 5. Marketing capsules
(last — the game sells itself first).

### 8. Anti-patterns
Incoherent one-offs without player-facing review; baked localized text; unreadable generated UI
surfaces; untracked provenance; unlicensed sources; assets shipped without runtime and quality proof.

### 9. Ambition ceiling
Build-time material variation is one candidate for extending a coherent visual family. Compare trim
sheets, authored material sets, decals, masks, geometry detail, procedural variation, and hybrids in
normal-route captures; choose the smallest maintainable set that preserves asset identity and meets
the visual bar. Neither a single sheet nor procedural recoloring is a quality requirement.

---

## SPEC3-39 — Audio identity expansion
**One-line pitch:** extend the audio identity to every new verb — tension you can hear,
sectors you can identify blind, and a mix whose priorities remain intelligible under load.

### 1. Why
Every SPEC3 thread ordered cues (tether hum, vent chime, siege stingers, ticker blips, vein
strikes). The procedural system is strong for continuous parameterized state, and the semantic-cue
groundwork is laid. Authored recordings may provide impact, material, ambience, music, or voice when
they outperform synthesis. What's missing is the catalogue, source/provenance policy, and mixing law.

### 2. The design
- **New recipe families:** explore continuous tension cues, confirmation cues, world signals, and
  sector ambience. Oscillator ranges, envelope lengths, intervals, instrumentation, authored versus
  synthesized sources, and layering are starting hypotheses to audition in context—not identity
  rules. Each family must communicate its state, remain distinct in the mix, and avoid listener
  fatigue across representative play sessions.
- **The mixing policy:** route semantic categories through buses that support priority, ducking,
  accessibility, and settings control. Start from the current graph, then measure masking, peak/RMS
  headroom, latency, voice pressure, and intelligibility during quiet flight and worst-case combat.
  Bus count, duck depth/attack/release, signal cadence, music layers, and concurrency caps are tunable
  hypotheses recorded with the evidence that justifies them.
- **Every cue via the cueRouter** (F8-34): `audioCue` column in `vfxCues.js` — audio and visuals
  stay in lockstep by construction.
- **Accessibility:** semantic cues have an equivalent visual or haptic channel where applicable.
  Reduced-audio behavior controls density, dynamics, startling transients, and masking; establish its
  concurrency and mix policy through accessibility review rather than a fixed global voice count.

### 3. Architecture & wiring
New recipes in `audioRecipes.js` (patterns exist to copy); buses/ducking in audioSystem.js master
graph (one-time). Sector pads keyed off palette class + sector seed. Cue triggers exclusively via
cueRouter rows. Headless verification stays "synthesizes without errors" + recipe unit checks
(node-graph shape assertions) since audio can't be heard in CI.

### 4. Key code
```js
// Continuous state drives a continuous parameter source; values are tuned from an in-game audition.
const hum = recipes.continuousCue(tetherHumCandidate);
bus.on('tether:tension', ({ t01 }) => hum.set(mapTensionToAudibleState(t01)));
bus.on('tether:cut', ({ slingshot }) => { hum.stop(); if (slingshot) recipes.whipcrack(); });
```

### 5–6. Assets / deps
Use the smallest maintainable mix of procedural recipes and licensed authored sources that meets the
bar. New files or dependencies require provenance, bundle/memory/latency, accessibility, and
maintenance evidence; neither presence nor absence of dependencies is a quality result by itself.

### 7. Build plan
1. Bus/ducking graph + `scripts/check-audio-mix.mjs` (routing, priority behavior, headroom, masking,
   cleanup, settings response, and evidence-backed timing/concurrency bounds).
2. Tension drones (tether first — F3-17 dependency).
3. Chime + world-signal families via cueRouter rows.
4. Sector pads + palette-class mapping; extend `check-audio-identity.mjs`.

### 8. Anti-patterns
Unlicensed or untracked sources; retriggered one-shots for continuous states; cue spam that masks
priority; cues without accessible visual twins; bypassing the common bus/event architecture; judging
audio quality by whether it is synthesized or sampled rather than by the in-game mix.

### 9. Ambition ceiling
Doppler-lite on world signals (convoy horns pitch-bend by closing speed) — spatial storytelling
for one multiply per frame.
