<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Rendering, assets, VFX, camera, and audio

Protect complete authored visuals, stable presentation, play-size readability, and honest resource ownership.

**Tasks:** 5 · **Range:** `JULES-0151`–`JULES-0155`

## JULES-0151 — Authoring and release manifest parity — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Trace authoring and release manifest parity from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json` `assets/ships/release/release_manifest.json` `scripts/build-sg04-release-assets.mjs`

**Read first:** `build_map.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace authoring and release manifest parity from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:asset-classifications`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0151 --format prompt`

## JULES-0152 — Release asset build and packaging — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Trace release asset build and packaging from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs` `tools/art/finalize_whole_ship.mjs` `tools/art/finalize_part.mjs`

**Read first:** `build_map.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace release asset build and packaging from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0152 --format prompt`

## JULES-0153 — Audio context, mix buses, and source lifecycle — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Trace audio context, mix buses, and source lifecycle from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js` `src/audio/synth.js` `src/data/audioRecipes.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace audio context, mix buses, and source lifecycle from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:first-hour-audio`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0153 --format prompt`

## JULES-0154 — Audio context, mix buses, and source lifecycle — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Run audio context, mix buses, and source lifecycle across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js` `src/audio/synth.js` `src/data/audioRecipes.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace audio context, mix buses, and source lifecycle from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:first-hour-audio`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0154 --format prompt`

## JULES-0155 — Renderer ownership, lifecycle, and resource disposal — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Trace renderer ownership, lifecycle, and resource disposal from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js` `src/render/assetLoader.js` `src/render/visualFactory.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace renderer ownership, lifecycle, and resource disposal from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:asset-runtime-disposal`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0155 --format prompt`
