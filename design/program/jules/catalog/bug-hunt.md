<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Bounded bug hunts and surgical fixes

Reproduce one named failure class, fix only a proven defect, and terminate honestly when the path is already correct.

**Tasks:** 50 · **Range:** `JULES-0041`–`JULES-0090`

## JULES-0041 — Whole-ship and modular asset routing — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Trace whole-ship and modular asset routing through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from wrong defId mapping, release/source path confusion, silent fallback, and stale route caches; fix only if current code demonstrates it.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js` `src/render/assetLoader.js` `src/data/ships.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace whole-ship and modular asset routing through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for wrong defId mapping, release/source path confusion, silent fallback, and stale route caches and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0041 --format prompt`

## JULES-0042 — Whole-ship and modular asset routing — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Audit whole-ship and modular asset routing at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by wrong defId mapping, release/source path confusion, silent fallback, and stale route caches. Build the narrowest reproduction before changing code.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js` `src/render/assetLoader.js` `src/data/ships.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace whole-ship and modular asset routing through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for wrong defId mapping, release/source path confusion, silent fallback, and stale route caches and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0042 --format prompt`

## JULES-0043 — Npc and enemy authored-ship visibility — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Trace NPC and enemy authored-ship visibility through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission; fix only if current code demonstrates it.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js` `src/render/renderer.js` `src/systems/traffic.js` `src/systems/aiEncounter.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace NPC and enemy authored-ship visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0043 --format prompt`

## JULES-0044 — Npc and enemy authored-ship visibility — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Audit NPC and enemy authored-ship visibility at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission. Build the narrowest reproduction before changing code.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js` `src/render/renderer.js` `src/systems/traffic.js` `src/systems/aiEncounter.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace NPC and enemy authored-ship visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0044 --format prompt`

## JULES-0045 — New-game authored-asset readiness — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Trace new-game authored-asset readiness through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states; fix only if current code demonstrates it.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js` `src/render/assetLoader.js` `src/render/partsLibrary.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace new-game authored-asset readiness through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0045 --format prompt`

## JULES-0046 — New-game authored-asset readiness — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Audit new-game authored-asset readiness at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states. Build the narrowest reproduction before changing code.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js` `src/render/assetLoader.js` `src/render/partsLibrary.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace new-game authored-asset readiness through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0046 --format prompt`

## JULES-0047 — Station and world-prop visibility — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Trace station and world-prop visibility through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots; fix only if current code demonstrates it.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js` `src/render/assetLoader.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station and world-prop visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0047 --format prompt`

## JULES-0048 — Station and world-prop visibility — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Audit station and world-prop visibility at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots. Build the narrowest reproduction before changing code.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js` `src/render/assetLoader.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station and world-prop visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0048 --format prompt`

## JULES-0049 — Thruster history trail — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Trace thruster history trail through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse; fix only if current code demonstrates it.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js` `src/render/ships/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace thruster history trail through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0049 --format prompt`

## JULES-0050 — Thruster history trail — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Audit thruster history trail at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse. Build the narrowest reproduction before changing code.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js` `src/render/ships/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace thruster history trail through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0050 --format prompt`

## JULES-0051 — Radar and minimap glyph layer — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Trace radar and minimap glyph layer through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators; fix only if current code demonstrates it.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js` `src/ui/screens/localmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace radar and minimap glyph layer through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0051 --format prompt`

## JULES-0052 — Radar and minimap glyph layer — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Audit radar and minimap glyph layer at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators. Build the narrowest reproduction before changing code.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js` `src/ui/screens/localmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace radar and minimap glyph layer through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0052 --format prompt`

## JULES-0053 — Full starmap navigation — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Trace full starmap navigation through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close; fix only if current code demonstrates it.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace full starmap navigation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:map-information-depth`
- `npm run check:map-camera`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0053 --format prompt`

## JULES-0054 — Full starmap navigation — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Audit full starmap navigation at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close. Build the narrowest reproduction before changing code.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace full starmap navigation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:map-information-depth`
- `npm run check:map-camera`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0054 --format prompt`

## JULES-0055 — Target panel and in-world target cues — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Trace target panel and in-world target cues through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement; fix only if current code demonstrates it.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace target panel and in-world target cues through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0055 --format prompt`

## JULES-0056 — Target panel and in-world target cues — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Audit target panel and in-world target cues at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement. Build the narrowest reproduction before changing code.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace target panel and in-world target cues through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0056 --format prompt`

## JULES-0057 — Screen mount/unmount lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Trace screen mount/unmount lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions; fix only if current code demonstrates it.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js` `src/ui/screenManager.js` `src/ui/screens/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace screen mount/unmount lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0057 --format prompt`

## JULES-0058 — Screen mount/unmount lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Audit screen mount/unmount lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions. Build the narrowest reproduction before changing code.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js` `src/ui/screenManager.js` `src/ui/screens/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace screen mount/unmount lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0058 --format prompt`

## JULES-0059 — Ui pointer and binding handoff — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Trace UI pointer and binding handoff through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling; fix only if current code demonstrates it.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js` `src/ui/bindings.js` `src/ui/controlPrompts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace UI pointer and binding handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0059 --format prompt`

## JULES-0060 — Ui pointer and binding handoff — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Audit UI pointer and binding handoff at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling. Build the narrowest reproduction before changing code.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js` `src/ui/bindings.js` `src/ui/controlPrompts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace UI pointer and binding handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0060 --format prompt`

## JULES-0061 — Mission objective progression — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Trace mission objective progression through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls; fix only if current code demonstrates it.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js` `src/data/missions.js` `src/ui/screens/missionLog.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mission objective progression through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0061 --format prompt`

## JULES-0062 — Mission objective progression — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Audit mission objective progression at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls. Build the narrowest reproduction before changing code.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js` `src/data/missions.js` `src/ui/screens/missionLog.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mission objective progression through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0062 --format prompt`

## JULES-0063 — Mining pickup and vacuum lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Trace mining pickup and vacuum lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup; fix only if current code demonstrates it.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js` `src/systems/cargo.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mining pickup and vacuum lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0063 --format prompt`

## JULES-0064 — Mining pickup and vacuum lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Audit mining pickup and vacuum lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup. Build the narrowest reproduction before changing code.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js` `src/systems/cargo.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mining pickup and vacuum lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0064 --format prompt`

## JULES-0065 — Asteroid works board runtime — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Trace Asteroid Works board runtime through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat; fix only if current code demonstrates it.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js` `src/ui/screens/drill.js` `styles/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Asteroid Works board runtime through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:asteroid-drive-cadence`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0065 --format prompt`

## JULES-0066 — Asteroid works board runtime — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Audit Asteroid Works board runtime at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat. Build the narrowest reproduction before changing code.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js` `src/ui/screens/drill.js` `styles/`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Asteroid Works board runtime through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:asteroid-drive-cadence`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0066 --format prompt`

## JULES-0067 — Spawn hostility and lawful first fire — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Trace spawn hostility and lawful first fire through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets; fix only if current code demonstrates it.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js` `src/ai/engagementAuthority.js` `src/systems/aiPorts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace spawn hostility and lawful first fire through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0067 --format prompt`

## JULES-0068 — Spawn hostility and lawful first fire — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Audit spawn hostility and lawful first fire at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets. Build the narrowest reproduction before changing code.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js` `src/ai/engagementAuthority.js` `src/systems/aiPorts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace spawn hostility and lawful first fire through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0068 --format prompt`

## JULES-0069 — Passive civilian traffic behavior — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Trace passive civilian traffic behavior through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads; fix only if current code demonstrates it.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js` `src/systems/aiPorts.js` `src/ai/perception.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace passive civilian traffic behavior through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0069 --format prompt`

## JULES-0070 — Passive civilian traffic behavior — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Audit passive civilian traffic behavior at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads. Build the narrowest reproduction before changing code.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js` `src/systems/aiPorts.js` `src/ai/perception.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace passive civilian traffic behavior through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0070 --format prompt`

## JULES-0071 — Stale ai contacts and target memory — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Trace stale AI contacts and target memory through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes; fix only if current code demonstrates it.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js` `src/ai/squad.js` `src/ai/shipDecision.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace stale AI contacts and target memory through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0071 --format prompt`

## JULES-0072 — Stale ai contacts and target memory — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Audit stale AI contacts and target memory at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes. Build the narrowest reproduction before changing code.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js` `src/ai/squad.js` `src/ai/shipDecision.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace stale AI contacts and target memory through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0072 --format prompt`

## JULES-0073 — Weapon hit registration — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Trace weapon hit registration through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence; fix only if current code demonstrates it.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js` `src/combat/actions.js` `src/combat/geometry.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace weapon hit registration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0073 --format prompt`

## JULES-0074 — Weapon hit registration — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Audit weapon hit registration at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence. Build the narrowest reproduction before changing code.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js` `src/combat/actions.js` `src/combat/geometry.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace weapon hit registration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0074 --format prompt`

## JULES-0075 — Combat cleanup after entity destruction — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Trace combat cleanup after entity destruction through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries; fix only if current code demonstrates it.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js` `src/combat/runtime.js` `src/combat/persistence.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace combat cleanup after entity destruction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0075 --format prompt`

## JULES-0076 — Combat cleanup after entity destruction — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Audit combat cleanup after entity destruction at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries. Build the narrowest reproduction before changing code.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js` `src/combat/runtime.js` `src/combat/persistence.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace combat cleanup after entity destruction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0076 --format prompt`

## JULES-0077 — Massline attachment lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Trace Massline attachment lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach; fix only if current code demonstrates it.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js` `src/core/constraints/masslineController.js` `src/systems/masslineInputGrammar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Massline attachment lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0077 --format prompt`

## JULES-0078 — Massline attachment lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Audit Massline attachment lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach. Build the narrowest reproduction before changing code.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js` `src/core/constraints/masslineController.js` `src/systems/masslineInputGrammar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Massline attachment lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0078 --format prompt`

## JULES-0079 — Browser/electron continue synchronization — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Trace Browser/Electron Continue synchronization through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery; fix only if current code demonstrates it.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js` `electron/main.cjs` `scripts/launch-electron.mjs`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Browser/Electron Continue synchronization through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0079 --format prompt`

## JULES-0080 — Browser/electron continue synchronization — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Audit Browser/Electron Continue synchronization at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery. Build the narrowest reproduction before changing code.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js` `electron/main.cjs` `scripts/launch-electron.mjs`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Browser/Electron Continue synchronization through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0080 --format prompt`

## JULES-0081 — Adventure and save migration — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Trace adventure and save migration through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore; fix only if current code demonstrates it.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js` `src/save/saveSystem.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace adventure and save migration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0081 --format prompt`

## JULES-0082 — Adventure and save migration — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Audit adventure and save migration at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore. Build the narrowest reproduction before changing code.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js` `src/save/saveSystem.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace adventure and save migration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0082 --format prompt`

## JULES-0083 — Audio cue duplication and silence — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Trace audio cue duplication and silence through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume; fix only if current code demonstrates it.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js` `src/systems/presentationOrchestrator.js` `src/presentation/cueRecipes.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace audio cue duplication and silence through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0083 --format prompt`

## JULES-0084 — Audio cue duplication and silence — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Audit audio cue duplication and silence at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume. Build the narrowest reproduction before changing code.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js` `src/systems/presentationOrchestrator.js` `src/presentation/cueRecipes.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace audio cue duplication and silence through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0084 --format prompt`

## JULES-0085 — Vfx pool recycling — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Trace VFX pool recycling through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse; fix only if current code demonstrates it.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace VFX pool recycling through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0085 --format prompt`

## JULES-0086 — Vfx pool recycling — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Audit VFX pool recycling at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse. Build the narrowest reproduction before changing code.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace VFX pool recycling through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0086 --format prompt`

## JULES-0087 — Crafting queue lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Trace crafting queue lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs; fix only if current code demonstrates it.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js` `src/data/blueprints.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace crafting queue lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0087 --format prompt`

## JULES-0088 — Crafting queue lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Audit crafting queue lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs. Build the narrowest reproduction before changing code.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js` `src/data/blueprints.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace crafting queue lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0088 --format prompt`

## JULES-0089 — Scanner and recon mission handoff — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Trace scanner and recon mission handoff through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets; fix only if current code demonstrates it.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js` `src/systems/missions.js` `src/ui/radar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace scanner and recon mission handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0089 --format prompt`

## JULES-0090 — Scanner and recon mission handoff — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Audit scanner and recon mission handoff at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets. Build the narrowest reproduction before changing code.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js` `src/systems/missions.js` `src/ui/radar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace scanner and recon mission handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0090 --format prompt`
