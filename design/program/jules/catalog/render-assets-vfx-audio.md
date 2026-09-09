<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Rendering, assets, VFX, camera, and audio

Protect complete authored visuals, stable presentation, play-size readability, and honest resource ownership.

**Tasks:** 80 · **Range:** `JULES-0801`–`JULES-0880`

## JULES-0801 — Authoring and release manifest parity — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Trace authoring and release manifest parity from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`, `scripts/build-sg04-release-assets.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0801 --format prompt`

## JULES-0802 — Authoring and release manifest parity — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Run authoring and release manifest parity across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`, `scripts/build-sg04-release-assets.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace authoring and release manifest parity from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:asset-classifications`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0802 --format prompt`

## JULES-0803 — Authoring and release manifest parity — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for authoring and release manifest parity. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`, `scripts/build-sg04-release-assets.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace authoring and release manifest parity from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:asset-classifications`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0803 --format prompt`

## JULES-0804 — Authoring and release manifest parity — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Review authoring and release manifest parity at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`, `scripts/build-sg04-release-assets.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace authoring and release manifest parity from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:asset-classifications`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0804 --format prompt`

## JULES-0805 — Authoring and release manifest parity — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-manifest-parity`

**Objective:** Measure authoring and release manifest parity for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** authoring and release manifest parity: source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics.

**Inspect:** `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`, `scripts/build-sg04-release-assets.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace authoring and release manifest parity from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to source/release identity, metadata, runtime slots, missing or stale entries, deterministic build output, and actionable diagnostics; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:asset-classifications`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0805 --format prompt`

## JULES-0806 — Release asset build and packaging — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Trace release asset build and packaging from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs`, `tools/art/finalize_whole_ship.mjs`, `tools/art/finalize_part.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0806 --format prompt`

## JULES-0807 — Release asset build and packaging — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Run release asset build and packaging across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs`, `tools/art/finalize_whole_ship.mjs`, `tools/art/finalize_part.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace release asset build and packaging from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0807 --format prompt`

## JULES-0808 — Release asset build and packaging — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for release asset build and packaging. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs`, `tools/art/finalize_whole_ship.mjs`, `tools/art/finalize_part.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace release asset build and packaging from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0808 --format prompt`

## JULES-0809 — Release asset build and packaging — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Review release asset build and packaging at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs`, `tools/art/finalize_whole_ship.mjs`, `tools/art/finalize_part.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace release asset build and packaging from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0809 --format prompt`

## JULES-0810 — Release asset build and packaging — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-release-build`

**Objective:** Measure release asset build and packaging for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** release asset build and packaging: failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging.

**Inspect:** `scripts/build-sg04-release-assets.mjs`, `tools/art/finalize_whole_ship.mjs`, `tools/art/finalize_part.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace release asset build and packaging from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to failure atomicity, temporary directories, compression/transcode handoff, stale artifacts, cleanup, and reproducible release packaging; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:asset-classifications`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0810 --format prompt`

## JULES-0811 — Whole-ship composition and definition routing — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-whole-ships`

**Objective:** Trace whole-ship composition and definition routing from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** whole-ship composition and definition routing: definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace whole-ship composition and definition routing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0811 --format prompt`

## JULES-0812 — Whole-ship composition and definition routing — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-whole-ships`

**Objective:** Run whole-ship composition and definition routing across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** whole-ship composition and definition routing: definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace whole-ship composition and definition routing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0812 --format prompt`

## JULES-0813 — Whole-ship composition and definition routing — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-whole-ships`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for whole-ship composition and definition routing. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** whole-ship composition and definition routing: definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace whole-ship composition and definition routing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0813 --format prompt`

## JULES-0814 — Whole-ship composition and definition routing — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-whole-ships`

**Objective:** Review whole-ship composition and definition routing at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** whole-ship composition and definition routing: definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace whole-ship composition and definition routing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0814 --format prompt`

## JULES-0815 — Whole-ship composition and definition routing — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-whole-ships`

**Objective:** Measure whole-ship composition and definition routing for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** whole-ship composition and definition routing: definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace whole-ship composition and definition routing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to definition-to-GLB routing, modular fallback boundaries, transform contracts, load diagnostics, clone ownership, and live reachability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0815 --format prompt`

## JULES-0816 — Enemy, traffic, and wingman visual roots — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-actor-visuals`

**Objective:** Trace enemy, traffic, and wingman visual roots from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** enemy, traffic, and wingman visual roots: every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories.

**Inspect:** `src/render/renderer.js`, `src/render/partsLibrary.js`, `src/systems/traffic.js`, `src/systems/wingmen.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace enemy, traffic, and wingman visual roots from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0816 --format prompt`

## JULES-0817 — Enemy, traffic, and wingman visual roots — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-actor-visuals`

**Objective:** Run enemy, traffic, and wingman visual roots across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** enemy, traffic, and wingman visual roots: every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories.

**Inspect:** `src/render/renderer.js`, `src/render/partsLibrary.js`, `src/systems/traffic.js`, `src/systems/wingmen.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace enemy, traffic, and wingman visual roots from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0817 --format prompt`

## JULES-0818 — Enemy, traffic, and wingman visual roots — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-actor-visuals`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for enemy, traffic, and wingman visual roots. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** enemy, traffic, and wingman visual roots: every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories.

**Inspect:** `src/render/renderer.js`, `src/render/partsLibrary.js`, `src/systems/traffic.js`, `src/systems/wingmen.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace enemy, traffic, and wingman visual roots from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0818 --format prompt`

## JULES-0819 — Enemy, traffic, and wingman visual roots — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-actor-visuals`

**Objective:** Review enemy, traffic, and wingman visual roots at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** enemy, traffic, and wingman visual roots: every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories.

**Inspect:** `src/render/renderer.js`, `src/render/partsLibrary.js`, `src/systems/traffic.js`, `src/systems/wingmen.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace enemy, traffic, and wingman visual roots from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0819 --format prompt`

## JULES-0820 — Enemy, traffic, and wingman visual roots — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-actor-visuals`

**Objective:** Measure enemy, traffic, and wingman visual roots for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** enemy, traffic, and wingman visual roots: every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories.

**Inspect:** `src/render/renderer.js`, `src/render/partsLibrary.js`, `src/systems/traffic.js`, `src/systems/wingmen.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace enemy, traffic, and wingman visual roots from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to every targetable actor receiving one complete visible root, correct identity, lifecycle stability, culling behavior, and no floating accessories; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0820 --format prompt`

## JULES-0821 — Stations, landmarks, props, and structures — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-world-props`

**Objective:** Trace stations, landmarks, props, and structures from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** stations, landmarks, props, and structures: authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence.

**Inspect:** `src/render/visualFactory.js`, `src/render/renderer.js`, `src/render/assetLoader.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace stations, landmarks, props, and structures from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0821 --format prompt`

## JULES-0822 — Stations, landmarks, props, and structures — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-world-props`

**Objective:** Run stations, landmarks, props, and structures across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** stations, landmarks, props, and structures: authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence.

**Inspect:** `src/render/visualFactory.js`, `src/render/renderer.js`, `src/render/assetLoader.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace stations, landmarks, props, and structures from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0822 --format prompt`

## JULES-0823 — Stations, landmarks, props, and structures — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-world-props`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for stations, landmarks, props, and structures. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** stations, landmarks, props, and structures: authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence.

**Inspect:** `src/render/visualFactory.js`, `src/render/renderer.js`, `src/render/assetLoader.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace stations, landmarks, props, and structures from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0823 --format prompt`

## JULES-0824 — Stations, landmarks, props, and structures — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-world-props`

**Objective:** Review stations, landmarks, props, and structures at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** stations, landmarks, props, and structures: authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence.

**Inspect:** `src/render/visualFactory.js`, `src/render/renderer.js`, `src/render/assetLoader.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace stations, landmarks, props, and structures from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0824 --format prompt`

## JULES-0825 — Stations, landmarks, props, and structures — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-world-props`

**Objective:** Measure stations, landmarks, props, and structures for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** stations, landmarks, props, and structures: authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence.

**Inspect:** `src/render/visualFactory.js`, `src/render/renderer.js`, `src/render/assetLoader.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace stations, landmarks, props, and structures from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to authored/procedural route choice, scale and framing, residency, culling, transforms, fallback visibility, and landmark persistence; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:asset-reachability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0825 --format prompt`

## JULES-0826 — Space background and starfield — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-space-background`

**Objective:** Trace space background and starfield from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** space background and starfield: camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/camera.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace space background and starfield from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0826 --format prompt`

## JULES-0827 — Space background and starfield — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-space-background`

**Objective:** Run space background and starfield across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** space background and starfield: camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/camera.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace space background and starfield from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0827 --format prompt`

## JULES-0828 — Space background and starfield — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-space-background`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for space background and starfield. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** space background and starfield: camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/camera.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace space background and starfield from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0828 --format prompt`

## JULES-0829 — Space background and starfield — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-space-background`

**Objective:** Review space background and starfield at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** space background and starfield: camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/camera.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace space background and starfield from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0829 --format prompt`

## JULES-0830 — Space background and starfield — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-space-background`

**Objective:** Measure space background and starfield for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** space background and starfield: camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/camera.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace space background and starfield from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to camera-relative placement, depth, wrap/recenter behavior, deterministic variation, flicker, visible poles, and long-flight continuity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0830 --format prompt`

## JULES-0831 — Parallax fields, dust, debris, and distant layers — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-parallax`

**Objective:** Trace parallax fields, dust, debris, and distant layers from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** parallax fields, dust, debris, and distant layers: layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior.

**Inspect:** `src/render/parallaxLayers.js`, `src/render/spaceBackground.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace parallax fields, dust, debris, and distant layers from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0831 --format prompt`

## JULES-0832 — Parallax fields, dust, debris, and distant layers — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-parallax`

**Objective:** Run parallax fields, dust, debris, and distant layers across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** parallax fields, dust, debris, and distant layers: layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior.

**Inspect:** `src/render/parallaxLayers.js`, `src/render/spaceBackground.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace parallax fields, dust, debris, and distant layers from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0832 --format prompt`

## JULES-0833 — Parallax fields, dust, debris, and distant layers — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-parallax`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for parallax fields, dust, debris, and distant layers. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** parallax fields, dust, debris, and distant layers: layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior.

**Inspect:** `src/render/parallaxLayers.js`, `src/render/spaceBackground.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace parallax fields, dust, debris, and distant layers from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0833 --format prompt`

## JULES-0834 — Parallax fields, dust, debris, and distant layers — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-parallax`

**Objective:** Review parallax fields, dust, debris, and distant layers at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** parallax fields, dust, debris, and distant layers: layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior.

**Inspect:** `src/render/parallaxLayers.js`, `src/render/spaceBackground.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace parallax fields, dust, debris, and distant layers from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0834 --format prompt`

## JULES-0835 — Parallax fields, dust, debris, and distant layers — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-parallax`

**Objective:** Measure parallax fields, dust, debris, and distant layers for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** parallax fields, dust, debris, and distant layers: layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior.

**Inspect:** `src/render/parallaxLayers.js`, `src/render/spaceBackground.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace parallax fields, dust, debris, and distant layers from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to layer anchoring, recentering, pop-in/out, scale language, pool reuse, camera cuts, and reduced-motion behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:camera`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0835 --format prompt`

## JULES-0836 — Thruster history trail and propulsion marks — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-history-trail`

**Objective:** Trace thruster history trail and propulsion marks from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** thruster history trail and propulsion marks: world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability.

**Inspect:** `src/render/vfx.js`, `src/render/ships`, `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace thruster history trail and propulsion marks from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0836 --format prompt`

## JULES-0837 — Thruster history trail and propulsion marks — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-history-trail`

**Objective:** Run thruster history trail and propulsion marks across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** thruster history trail and propulsion marks: world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability.

**Inspect:** `src/render/vfx.js`, `src/render/ships`, `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace thruster history trail and propulsion marks from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0837 --format prompt`

## JULES-0838 — Thruster history trail and propulsion marks — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-history-trail`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for thruster history trail and propulsion marks. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** thruster history trail and propulsion marks: world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability.

**Inspect:** `src/render/vfx.js`, `src/render/ships`, `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace thruster history trail and propulsion marks from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0838 --format prompt`

## JULES-0839 — Thruster history trail and propulsion marks — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-history-trail`

**Objective:** Review thruster history trail and propulsion marks at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** thruster history trail and propulsion marks: world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability.

**Inspect:** `src/render/vfx.js`, `src/render/ships`, `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace thruster history trail and propulsion marks from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0839 --format prompt`

## JULES-0840 — Thruster history trail and propulsion marks — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-history-trail`

**Objective:** Measure thruster history trail and propulsion marks for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** thruster history trail and propulsion marks: world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability.

**Inspect:** `src/render/vfx.js`, `src/render/ships`, `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace thruster history trail and propulsion marks from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to world-space historical sampling, no suck-back, no pulsing jet behavior, spawn cadence, lifetime, turns, stops, pooling, and play-size readability; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0840 --format prompt`

## JULES-0841 — Weapon, projectile, beam, and tether effects — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-weapon-vfx`

**Objective:** Trace weapon, projectile, beam, and tether effects from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** weapon, projectile, beam, and tether effects: effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation.

**Inspect:** `src/render/vfx.js`, `src/render/energy`, `src/combat/attachments.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace weapon, projectile, beam, and tether effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0841 --format prompt`

## JULES-0842 — Weapon, projectile, beam, and tether effects — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-weapon-vfx`

**Objective:** Run weapon, projectile, beam, and tether effects across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** weapon, projectile, beam, and tether effects: effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation.

**Inspect:** `src/render/vfx.js`, `src/render/energy`, `src/combat/attachments.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace weapon, projectile, beam, and tether effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0842 --format prompt`

## JULES-0843 — Weapon, projectile, beam, and tether effects — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-weapon-vfx`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for weapon, projectile, beam, and tether effects. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** weapon, projectile, beam, and tether effects: effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation.

**Inspect:** `src/render/vfx.js`, `src/render/energy`, `src/combat/attachments.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace weapon, projectile, beam, and tether effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0843 --format prompt`

## JULES-0844 — Weapon, projectile, beam, and tether effects — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-weapon-vfx`

**Objective:** Review weapon, projectile, beam, and tether effects at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** weapon, projectile, beam, and tether effects: effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation.

**Inspect:** `src/render/vfx.js`, `src/render/energy`, `src/combat/attachments.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace weapon, projectile, beam, and tether effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0844 --format prompt`

## JULES-0845 — Weapon, projectile, beam, and tether effects — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-weapon-vfx`

**Objective:** Measure weapon, projectile, beam, and tether effects for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** weapon, projectile, beam, and tether effects: effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation.

**Inspect:** `src/render/vfx.js`, `src/render/energy`, `src/combat/attachments.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace weapon, projectile, beam, and tether effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to effect identity, attachment and endpoint tracking, pool lifecycle, impact handoff, damage-type legibility, and no sim mutation; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0845 --format prompt`

## JULES-0846 — Damage, breakup, explosion, and aftermath effects — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-damage-vfx`

**Objective:** Trace damage, breakup, explosion, and aftermath effects from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** damage, breakup, explosion, and aftermath effects: shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition.

**Inspect:** `src/render/vfx.js`, `src/combat/damage.js`, `src/systems/aftermathWrecks.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace damage, breakup, explosion, and aftermath effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0846 --format prompt`

## JULES-0847 — Damage, breakup, explosion, and aftermath effects — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-damage-vfx`

**Objective:** Run damage, breakup, explosion, and aftermath effects across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** damage, breakup, explosion, and aftermath effects: shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition.

**Inspect:** `src/render/vfx.js`, `src/combat/damage.js`, `src/systems/aftermathWrecks.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace damage, breakup, explosion, and aftermath effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0847 --format prompt`

## JULES-0848 — Damage, breakup, explosion, and aftermath effects — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-damage-vfx`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for damage, breakup, explosion, and aftermath effects. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** damage, breakup, explosion, and aftermath effects: shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition.

**Inspect:** `src/render/vfx.js`, `src/combat/damage.js`, `src/systems/aftermathWrecks.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace damage, breakup, explosion, and aftermath effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0848 --format prompt`

## JULES-0849 — Damage, breakup, explosion, and aftermath effects — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-damage-vfx`

**Objective:** Review damage, breakup, explosion, and aftermath effects at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** damage, breakup, explosion, and aftermath effects: shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition.

**Inspect:** `src/render/vfx.js`, `src/combat/damage.js`, `src/systems/aftermathWrecks.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace damage, breakup, explosion, and aftermath effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0849 --format prompt`

## JULES-0850 — Damage, breakup, explosion, and aftermath effects — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-damage-vfx`

**Objective:** Measure damage, breakup, explosion, and aftermath effects for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** damage, breakup, explosion, and aftermath effects: shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition.

**Inspect:** `src/render/vfx.js`, `src/combat/damage.js`, `src/systems/aftermathWrecks.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace damage, breakup, explosion, and aftermath effects from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to shield/armor/hull differentiation, event dedupe, breakup sequence, persistent damage state, cleanup, accessibility, and camera/audio cue composition; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0850 --format prompt`

## JULES-0851 — Camera framing, shake, hit-stop, and motion language — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-camera-feel`

**Objective:** Trace camera framing, shake, hit-stop, and motion language from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** camera framing, shake, hit-stop, and motion language: chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior.

**Inspect:** `src/render/camera.js`, `src/render/feel.js`, `src/systems/presentationOrchestrator.js`, `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace camera framing, shake, hit-stop, and motion language from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:camera`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0851 --format prompt`

## JULES-0852 — Camera framing, shake, hit-stop, and motion language — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-camera-feel`

**Objective:** Run camera framing, shake, hit-stop, and motion language across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** camera framing, shake, hit-stop, and motion language: chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior.

**Inspect:** `src/render/camera.js`, `src/render/feel.js`, `src/systems/presentationOrchestrator.js`, `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace camera framing, shake, hit-stop, and motion language from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:camera`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0852 --format prompt`

## JULES-0853 — Camera framing, shake, hit-stop, and motion language — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-camera-feel`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for camera framing, shake, hit-stop, and motion language. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** camera framing, shake, hit-stop, and motion language: chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior.

**Inspect:** `src/render/camera.js`, `src/render/feel.js`, `src/systems/presentationOrchestrator.js`, `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace camera framing, shake, hit-stop, and motion language from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:camera`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0853 --format prompt`

## JULES-0854 — Camera framing, shake, hit-stop, and motion language — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-camera-feel`

**Objective:** Review camera framing, shake, hit-stop, and motion language at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** camera framing, shake, hit-stop, and motion language: chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior.

**Inspect:** `src/render/camera.js`, `src/render/feel.js`, `src/systems/presentationOrchestrator.js`, `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace camera framing, shake, hit-stop, and motion language from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:camera`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0854 --format prompt`

## JULES-0855 — Camera framing, shake, hit-stop, and motion language — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-camera-feel`

**Objective:** Measure camera framing, shake, hit-stop, and motion language for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** camera framing, shake, hit-stop, and motion language: chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior.

**Inspect:** `src/render/camera.js`, `src/render/feel.js`, `src/systems/presentationOrchestrator.js`, `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace camera framing, shake, hit-stop, and motion language from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to chase composition, focus changes, velocity read, bounded trauma, cue ownership, reduced motion, pause/slow-time interaction, and reset behavior; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:camera`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0855 --format prompt`

## JULES-0856 — Bloom, grading, and post-processing — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-post`

**Objective:** Trace bloom, grading, and post-processing from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** bloom, grading, and post-processing: selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss.

**Inspect:** `src/render/bloom.js`, `src/render/post`, `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace bloom, grading, and post-processing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0856 --format prompt`

## JULES-0857 — Bloom, grading, and post-processing — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-post`

**Objective:** Run bloom, grading, and post-processing across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** bloom, grading, and post-processing: selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss.

**Inspect:** `src/render/bloom.js`, `src/render/post`, `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace bloom, grading, and post-processing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0857 --format prompt`

## JULES-0858 — Bloom, grading, and post-processing — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-post`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for bloom, grading, and post-processing. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** bloom, grading, and post-processing: selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss.

**Inspect:** `src/render/bloom.js`, `src/render/post`, `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace bloom, grading, and post-processing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0858 --format prompt`

## JULES-0859 — Bloom, grading, and post-processing — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-post`

**Objective:** Review bloom, grading, and post-processing at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** bloom, grading, and post-processing: selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss.

**Inspect:** `src/render/bloom.js`, `src/render/post`, `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace bloom, grading, and post-processing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0859 --format prompt`

## JULES-0860 — Bloom, grading, and post-processing — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-post`

**Objective:** Measure bloom, grading, and post-processing for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** bloom, grading, and post-processing: selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss.

**Inspect:** `src/render/bloom.js`, `src/render/post`, `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace bloom, grading, and post-processing from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to selective layers, render-target sizing, resize and context restoration, material identity, exposure bounds, disposal, and no global quality loss; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0860 --format prompt`

## JULES-0861 — Audio context, mix buses, and source lifecycle — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Trace audio context, mix buses, and source lifecycle from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js`, `src/audio/synth.js`, `src/data/audioRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0861 --format prompt`

## JULES-0862 — Audio context, mix buses, and source lifecycle — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Run audio context, mix buses, and source lifecycle across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js`, `src/audio/synth.js`, `src/data/audioRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0862 --format prompt`

## JULES-0863 — Audio context, mix buses, and source lifecycle — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for audio context, mix buses, and source lifecycle. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js`, `src/audio/synth.js`, `src/data/audioRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace audio context, mix buses, and source lifecycle from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:first-hour-audio`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0863 --format prompt`

## JULES-0864 — Audio context, mix buses, and source lifecycle — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Review audio context, mix buses, and source lifecycle at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js`, `src/audio/synth.js`, `src/data/audioRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace audio context, mix buses, and source lifecycle from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:first-hour-audio`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0864 --format prompt`

## JULES-0865 — Audio context, mix buses, and source lifecycle — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-audio-system`

**Objective:** Measure audio context, mix buses, and source lifecycle for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** audio context, mix buses, and source lifecycle: gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity.

**Inspect:** `src/audio/audioSystem.js`, `src/audio/synth.js`, `src/data/audioRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace audio context, mix buses, and source lifecycle from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to gesture startup, bus routing, source dedupe, voice caps, stop/dispose, pause/resume, save settings, and shell parity; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:first-hour-audio`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0865 --format prompt`

## JULES-0866 — Presentation cue recipes and arbitration — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-presentation-cues`

**Objective:** Trace presentation cue recipes and arbitration from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** presentation cue recipes and arbitration: schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents.

**Inspect:** `src/systems/presentationOrchestrator.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueRecipes.js`, `src/presentation/cueSchema.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace presentation cue recipes and arbitration from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:cue-priority-bus`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0866 --format prompt`

## JULES-0867 — Presentation cue recipes and arbitration — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-presentation-cues`

**Objective:** Run presentation cue recipes and arbitration across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** presentation cue recipes and arbitration: schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents.

**Inspect:** `src/systems/presentationOrchestrator.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueRecipes.js`, `src/presentation/cueSchema.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace presentation cue recipes and arbitration from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:cue-priority-bus`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0867 --format prompt`

## JULES-0868 — Presentation cue recipes and arbitration — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-presentation-cues`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for presentation cue recipes and arbitration. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** presentation cue recipes and arbitration: schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents.

**Inspect:** `src/systems/presentationOrchestrator.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueRecipes.js`, `src/presentation/cueSchema.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace presentation cue recipes and arbitration from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:cue-priority-bus`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0868 --format prompt`

## JULES-0869 — Presentation cue recipes and arbitration — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `render-presentation-cues`

**Objective:** Review presentation cue recipes and arbitration at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** presentation cue recipes and arbitration: schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents.

**Inspect:** `src/systems/presentationOrchestrator.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueRecipes.js`, `src/presentation/cueSchema.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace presentation cue recipes and arbitration from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:cue-priority-bus`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0869 --format prompt`

## JULES-0870 — Presentation cue recipes and arbitration — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-presentation-cues`

**Objective:** Measure presentation cue recipes and arbitration for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** presentation cue recipes and arbitration: schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents.

**Inspect:** `src/systems/presentationOrchestrator.js`, `src/systems/presentationAdapters.js`, `src/presentation/cueRecipes.js`, `src/presentation/cueSchema.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace presentation cue recipes and arbitration from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to schema validation, cue dedupe and priority, camera/audio/UI fan-out, stale-drop, repeated initialization, and accessibility equivalents; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:cue-priority-bus`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0870 --format prompt`

## JULES-0871 — Materials, canvas textures, and shader variants — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-materials`

**Objective:** Trace materials, canvas textures, and shader variants from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** materials, canvas textures, and shader variants: cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage.

**Inspect:** `src/render/materialLibrary.js`, `src/render/canvasTextures.js`, `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace materials, canvas textures, and shader variants from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The trace names the exact source/release/runtime identities and selected live path.
- A failure produces an actionable diagnostic or deliberate fail-closed state rather than invisible partial quality.
- Procedural fallback is not reported as authored acceptance.
- The focused live/reachability check proves the final player-consumed object or cue.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:colour-tokens`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0871 --format prompt`

## JULES-0872 — Materials, canvas textures, and shader variants — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-materials`

**Objective:** Run materials, canvas textures, and shader variants across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** materials, canvas textures, and shader variants: cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage.

**Inspect:** `src/render/materialLibrary.js`, `src/render/canvasTextures.js`, `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace materials, canvas textures, and shader variants from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:colour-tokens`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0872 --format prompt`

## JULES-0873 — Materials, canvas textures, and shader variants — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-materials`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for materials, canvas textures, and shader variants. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** materials, canvas textures, and shader variants: cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage.

**Inspect:** `src/render/materialLibrary.js`, `src/render/canvasTextures.js`, `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace materials, canvas textures, and shader variants from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:colour-tokens`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0873 --format prompt`

## JULES-0874 — Materials, canvas textures, and shader variants — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-materials`

**Objective:** Review materials, canvas textures, and shader variants at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** materials, canvas textures, and shader variants: cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage.

**Inspect:** `src/render/materialLibrary.js`, `src/render/canvasTextures.js`, `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace materials, canvas textures, and shader variants from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:colour-tokens`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0874 --format prompt`

## JULES-0875 — Materials, canvas textures, and shader variants — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `render-materials`

**Objective:** Measure materials, canvas textures, and shader variants for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** materials, canvas textures, and shader variants: cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage.

**Inspect:** `src/render/materialLibrary.js`, `src/render/canvasTextures.js`, `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace materials, canvas textures, and shader variants from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to cache keys, color-space and texture settings, variant explosion, disposal, context restoration, visual identity, and compile coverage; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:colour-tokens`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0875 --format prompt`

## JULES-0876 — Renderer ownership, lifecycle, and resource disposal — audit authored reachability and fallback truth

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Trace renderer ownership, lifecycle, and resource disposal from manifest/data declaration through load/admission/composition to the live scene or audio/presentation output. Fix one missing route, silent rejection, or dishonest fallback only when proven.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js`, `src/render/assetLoader.js`, `src/render/visualFactory.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0876 --format prompt`

## JULES-0877 — Renderer ownership, lifecycle, and resource disposal — eliminate pop, flicker, and stale presentation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Run renderer ownership, lifecycle, and resource disposal across camera motion, route transitions, spawn/despawn, resize, pause, and repeated frames. Reproduce and repair one pop-in/out, one-frame blank, z-fight, stale transform, or duplicated cue.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js`, `src/render/assetLoader.js`, `src/render/visualFactory.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace renderer ownership, lifecycle, and resource disposal from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The reproduction captures the frame/state transition where visibility or presentation diverges.
- The fix follows canonical world/camera identity and does not pin or redraw everything.
- Representative 360-frame or repeated-cycle evidence remains stable.
- Reduced-motion and ordinary quality settings both remain correct.

**Suggested proof:**
- `npm run check:asset-runtime-disposal`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0877 --format prompt`

## JULES-0878 — Renderer ownership, lifecycle, and resource disposal — prove resource and lease lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Audit creation, clone/lease ownership, replacement, removal, cache warmth, and final disposal for renderer ownership, lifecycle, and resource disposal. Add a repeat-cycle test or probe and fix one proven leak, premature dispose, or stale shared resource.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js`, `src/render/assetLoader.js`, `src/render/visualFactory.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace renderer ownership, lifecycle, and resource disposal from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Every resource has one clear creator/owner and shared leases survive until the last consumer releases them.
- Repeated cycles converge to baseline or a documented bounded warm set.
- Scene/audio/UI objects disappear when their entity/cue/route is gone.
- The fix does not weaken authored readiness or dispose resources still in use.

**Suggested proof:**
- `npm run check:asset-runtime-disposal`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0878 --format prompt`

## JULES-0879 — Renderer ownership, lifecycle, and resource disposal — improve play-size identity and accessibility

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Review renderer ownership, lifecycle, and resource disposal at the actual chase/game camera and ordinary window. Make one bounded change so identity, role, depth, motion, or state reads at play size without relying on a beauty crop.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js`, `src/render/assetLoader.js`, `src/render/visualFactory.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace renderer ownership, lifecycle, and resource disposal from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- Before/after evidence uses the same canonical camera, framing, quality, and state.
- The improvement changes what the player can perceive at play size, not hidden geometry or invisible detail.
- Color is not the sole carrier of critical meaning and reduced-motion/flash modes remain legible.
- No soft billboard/card stand-in replaces a designed world object.

**Suggested proof:**
- `npm run check:asset-runtime-disposal`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0879 --format prompt`

## JULES-0880 — Renderer ownership, lifecycle, and resource disposal — make a quality-preserving presentation optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `render-lifecycle`

**Objective:** Measure renderer ownership, lifecycle, and resource disposal for shader, draw, upload, allocation, pool, decode, or frame-pacing cost and implement one structural optimization while preserving the same authored picture and cue behavior.

**Context:** renderer ownership, lifecycle, and resource disposal: create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches.

**Inspect:** `src/render/renderer.js`, `src/render/assetLoader.js`, `src/render/visualFactory.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/render/AGENTS.md`, `docs/visual-assets/README.md`, `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`

**Work:**
1. Trace renderer ownership, lifecycle, and resource disposal from source/data declaration through live loading/composition/presentation and final disposal.
2. Capture or measure the actual player route relevant to create/admit/replace/remove ownership, listeners, geometry/material/texture leases, scene removal, context loss, repeated route transitions, and bounded caches; source presence alone is not proof.
3. Implement one bounded route, stability, lifecycle, readability, or structural-performance correction without quality cuts.
4. Run exact reachability/lifecycle checks and compare representative play-scale evidence when visible output changes.

**Acceptance:**
- The named cost improves in the same representative scene and settings.
- Visual/audio parity is reviewed at ordinary play scale, including transient states.
- Default quality, asset identity, population, particles, shadows, bloom, and post are not reduced.
- Cache/pool keys and disposal remain correct after the optimization.

**Suggested proof:**
- `npm run check:asset-runtime-disposal`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when current live evidence is correct. Do not wire a weaker asset, accept a procedural fallback as authored, or change global quality to manufacture improvement.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0880 --format prompt`
