<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Bounded bug hunts and surgical fixes

Reproduce one named failure class, fix only a proven defect, and terminate honestly when the path is already correct.

**Tasks:** 150 · **Range:** `JULES-0171`–`JULES-0320`

## JULES-0171 — Whole-ship and modular asset routing — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Trace whole-ship and modular asset routing through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from wrong defId mapping, release/source path confusion, silent fallback, and stale route caches; fix only if current code demonstrates it.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0171 --format prompt`

## JULES-0172 — Whole-ship and modular asset routing — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Audit whole-ship and modular asset routing at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by wrong defId mapping, release/source path confusion, silent fallback, and stale route caches. Build the narrowest reproduction before changing code.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0172 --format prompt`

## JULES-0173 — Whole-ship and modular asset routing — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Inspect whole-ship and modular asset routing for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace whole-ship and modular asset routing through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for wrong defId mapping, release/source path confusion, silent fallback, and stale route caches and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0173 --format prompt`

## JULES-0174 — Whole-ship and modular asset routing — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ship-routing`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for whole-ship and modular asset routing. Verify that wrong defId mapping, release/source path confusion, silent fallback, and stale route caches fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace whole-ship and modular asset routing through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for wrong defId mapping, release/source path confusion, silent fallback, and stale route caches and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0174 --format prompt`

## JULES-0175 — Whole-ship and modular asset routing — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-ship-routing`

**Objective:** Follow whole-ship and modular asset routing from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** whole-ship and modular asset routing: wrong defId mapping, release/source path confusion, silent fallback, and stale route caches.

**Inspect:** `src/render/partsLibrary.js`, `src/render/assetLoader.js`, `src/data/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace whole-ship and modular asset routing through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for wrong defId mapping, release/source path confusion, silent fallback, and stale route caches and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:asset-reachability`
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0175 --format prompt`

## JULES-0176 — Npc and enemy authored-ship visibility — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Trace NPC and enemy authored-ship visibility through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission; fix only if current code demonstrates it.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/systems/traffic.js`, `src/systems/aiEncounter.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0176 --format prompt`

## JULES-0177 — Npc and enemy authored-ship visibility — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Audit NPC and enemy authored-ship visibility at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission. Build the narrowest reproduction before changing code.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/systems/traffic.js`, `src/systems/aiEncounter.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0177 --format prompt`

## JULES-0178 — Npc and enemy authored-ship visibility — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Inspect NPC and enemy authored-ship visibility for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/systems/traffic.js`, `src/systems/aiEncounter.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace NPC and enemy authored-ship visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0178 --format prompt`

## JULES-0179 — Npc and enemy authored-ship visibility — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-enemy-visibility`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for NPC and enemy authored-ship visibility. Verify that targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/systems/traffic.js`, `src/systems/aiEncounter.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace NPC and enemy authored-ship visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0179 --format prompt`

## JULES-0180 — Npc and enemy authored-ship visibility — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-enemy-visibility`

**Objective:** Follow NPC and enemy authored-ship visibility from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** NPC and enemy authored-ship visibility: targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission.

**Inspect:** `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/systems/traffic.js`, `src/systems/aiEncounter.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace NPC and enemy authored-ship visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for targetable entities with missing roots, partial accessories, release-load failure, culling, and disposal after admission and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0180 --format prompt`

## JULES-0181 — New-game authored-asset readiness — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Trace new-game authored-asset readiness through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states; fix only if current code demonstrates it.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0181 --format prompt`

## JULES-0182 — New-game authored-asset readiness — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Audit new-game authored-asset readiness at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states. Build the narrowest reproduction before changing code.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0182 --format prompt`

## JULES-0183 — New-game authored-asset readiness — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Inspect new-game authored-asset readiness for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace new-game authored-asset readiness through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0183 --format prompt`

## JULES-0184 — New-game authored-asset readiness — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-startup-readiness`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for new-game authored-asset readiness. Verify that loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace new-game authored-asset readiness through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0184 --format prompt`

## JULES-0185 — New-game authored-asset readiness — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-startup-readiness`

**Objective:** Follow new-game authored-asset readiness from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** new-game authored-asset readiness: loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states.

**Inspect:** `src/main.js`, `src/render/assetLoader.js`, `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace new-game authored-asset readiness through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for loading-to-flight gates, stale readiness promises, source/release mismatches, cancellation, and false-ready states and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0185 --format prompt`

## JULES-0186 — Station and world-prop visibility — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Trace station and world-prop visibility through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots; fix only if current code demonstrates it.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js`, `src/render/assetLoader.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0186 --format prompt`

## JULES-0187 — Station and world-prop visibility — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Audit station and world-prop visibility at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots. Build the narrowest reproduction before changing code.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js`, `src/render/assetLoader.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0187 --format prompt`

## JULES-0188 — Station and world-prop visibility — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Inspect station and world-prop visibility for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js`, `src/render/assetLoader.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station and world-prop visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0188 --format prompt`

## JULES-0189 — Station and world-prop visibility — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-world-prop-visibility`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for station and world-prop visibility. Verify that markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js`, `src/render/assetLoader.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station and world-prop visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0189 --format prompt`

## JULES-0190 — Station and world-prop visibility — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-world-prop-visibility`

**Objective:** Follow station and world-prop visibility from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** station and world-prop visibility: markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots.

**Inspect:** `src/render/visualFactory.js`, `src/render/assetLoader.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station and world-prop visibility through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for markers around empty space, prepare/admission/eviction disagreement, far-landmark residency, and fallback roots and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0190 --format prompt`

## JULES-0191 — Background field blips and stray geometry — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-background-blips`

**Objective:** Trace background field blips and stray geometry through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability; fix only if current code demonstrates it.

**Context:** background field blips and stray geometry: objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace background field blips and stray geometry through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Evidence distinguishes never-created, created-then-removed, stale-but-present, and correctly disposed states.
- A proven defect receives the smallest owner-level fix plus a regression test or focused probe.
- The fix preserves unrelated dirty work and does not weaken readiness, visibility, or quality gates.
- When no defect is found, return NO_CHANGE with commands and observations; do not invent a patch.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0191 --format prompt`

## JULES-0192 — Background field blips and stray geometry — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-background-blips`

**Objective:** Audit background field blips and stray geometry at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability. Build the narrowest reproduction before changing code.

**Context:** background field blips and stray geometry: objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace background field blips and stray geometry through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The reproduction states the exact before/after boundary or event ordering.
- Any fix is deterministic and handles both sides of the boundary without broad timing delays.
- The ordinary path and one adjacent edge path remain green.
- No wall-clock sleep, magic retry loop, or quality reduction is introduced.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0192 --format prompt`

## JULES-0193 — Background field blips and stray geometry — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-background-blips`

**Objective:** Inspect background field blips and stray geometry for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Context:** background field blips and stray geometry: objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace background field blips and stray geometry through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0193 --format prompt`

## JULES-0194 — Background field blips and stray geometry — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-background-blips`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for background field blips and stray geometry. Verify that objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** background field blips and stray geometry: objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace background field blips and stray geometry through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0194 --format prompt`

## JULES-0195 — Background field blips and stray geometry — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-background-blips`

**Objective:** Follow background field blips and stray geometry from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** background field blips and stray geometry: objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability.

**Inspect:** `src/render/spaceBackground.js`, `src/render/starfield.js`, `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace background field blips and stray geometry through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objects popping with camera movement, reused geometry transforms, invalid depth/culling, monochrome cross artifacts, and seed instability and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:visual-stability`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0195 --format prompt`

## JULES-0196 — Thruster history trail — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Trace thruster history trail through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse; fix only if current code demonstrates it.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js`, `src/render/ships/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0196 --format prompt`

## JULES-0197 — Thruster history trail — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Audit thruster history trail at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse. Build the narrowest reproduction before changing code.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js`, `src/render/ships/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0197 --format prompt`

## JULES-0198 — Thruster history trail — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Inspect thruster history trail for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js`, `src/render/ships/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace thruster history trail through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0198 --format prompt`

## JULES-0199 — Thruster history trail — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-history-trail`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for thruster history trail. Verify that world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js`, `src/render/ships/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace thruster history trail through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0199 --format prompt`

## JULES-0200 — Thruster history trail — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-history-trail`

**Objective:** Follow thruster history trail from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** thruster history trail: world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse.

**Inspect:** `src/render/vfx.js`, `src/render/ships/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace thruster history trail through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for world-space history points, no pulse, no suck-back on deceleration, spawn cadence, discontinuity handling, and pooled segment reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:vfx:trail-instancing`
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0200 --format prompt`

## JULES-0201 — Radar and minimap glyph layer — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Trace radar and minimap glyph layer through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators; fix only if current code demonstrates it.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js`, `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0201 --format prompt`

## JULES-0202 — Radar and minimap glyph layer — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Audit radar and minimap glyph layer at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators. Build the narrowest reproduction before changing code.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js`, `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0202 --format prompt`

## JULES-0203 — Radar and minimap glyph layer — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Inspect radar and minimap glyph layer for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js`, `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace radar and minimap glyph layer through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0203 --format prompt`

## JULES-0204 — Radar and minimap glyph layer — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-radar-minimap`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for radar and minimap glyph layer. Verify that player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js`, `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace radar and minimap glyph layer through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0204 --format prompt`

## JULES-0205 — Radar and minimap glyph layer — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-radar-minimap`

**Objective:** Follow radar and minimap glyph layer from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** radar and minimap glyph layer: player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators.

**Inspect:** `src/ui/radar.js`, `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace radar and minimap glyph layer through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for player identity, IFF distinction, waypoint salience, bloom contamination, glyph overlap, and off-screen indicators and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0205 --format prompt`

## JULES-0206 — Full starmap navigation — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Trace full starmap navigation through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close; fix only if current code demonstrates it.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0206 --format prompt`

## JULES-0207 — Full starmap navigation — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Audit full starmap navigation at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close. Build the narrowest reproduction before changing code.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0207 --format prompt`

## JULES-0208 — Full starmap navigation — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Inspect full starmap navigation for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace full starmap navigation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:map-information-depth`
- `npm run check:map-camera`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0208 --format prompt`

## JULES-0209 — Full starmap navigation — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-starmap`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for full starmap navigation. Verify that selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace full starmap navigation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:map-information-depth`
- `npm run check:map-camera`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0209 --format prompt`

## JULES-0210 — Full starmap navigation — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-starmap`

**Objective:** Follow full starmap navigation from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** full starmap navigation: selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace full starmap navigation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selection persistence, route ribbon, search pointer, camera bounds, waypoint identity, and repeated open/close and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:map-information-depth`
- `npm run check:map-camera`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0210 --format prompt`

## JULES-0211 — Target panel and in-world target cues — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Trace target panel and in-world target cues through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement; fix only if current code demonstrates it.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0211 --format prompt`

## JULES-0212 — Target panel and in-world target cues — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Audit target panel and in-world target cues at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement. Build the narrowest reproduction before changing code.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0212 --format prompt`

## JULES-0213 — Target panel and in-world target cues — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Inspect target panel and in-world target cues for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace target panel and in-world target cues through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0213 --format prompt`

## JULES-0214 — Target panel and in-world target cues — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `bug-target-panel`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for target panel and in-world target cues. Verify that stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace target panel and in-world target cues through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0214 --format prompt`

## JULES-0215 — Target panel and in-world target cues — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `bug-target-panel`

**Objective:** Follow target panel and in-world target cues from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** target panel and in-world target cues: stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace target panel and in-world target cues through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale target data, destroyed target cleanup, damage bar ordering, target swap races, and screen-edge arc placement and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0215 --format prompt`

## JULES-0216 — Screen mount/unmount lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Trace screen mount/unmount lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions; fix only if current code demonstrates it.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js`, `src/ui/screenManager.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0216 --format prompt`

## JULES-0217 — Screen mount/unmount lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Audit screen mount/unmount lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions. Build the narrowest reproduction before changing code.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js`, `src/ui/screenManager.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0217 --format prompt`

## JULES-0218 — Screen mount/unmount lifecycle — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Inspect screen mount/unmount lifecycle for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js`, `src/ui/screenManager.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace screen mount/unmount lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0218 --format prompt`

## JULES-0219 — Screen mount/unmount lifecycle — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-screen-lifecycle`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for screen mount/unmount lifecycle. Verify that duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js`, `src/ui/screenManager.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace screen mount/unmount lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0219 --format prompt`

## JULES-0220 — Screen mount/unmount lifecycle — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-screen-lifecycle`

**Objective:** Follow screen mount/unmount lifecycle from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** screen mount/unmount lifecycle: duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions.

**Inspect:** `src/ui/uiRoot.js`, `src/ui/screenManager.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace screen mount/unmount lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate listeners, cached stale DOM, pause leaks, hidden interactive elements, and repeated route transitions and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0220 --format prompt`

## JULES-0221 — Ui pointer and binding handoff — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Trace UI pointer and binding handoff through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling; fix only if current code demonstrates it.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0221 --format prompt`

## JULES-0222 — Ui pointer and binding handoff — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Audit UI pointer and binding handoff at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling. Build the narrowest reproduction before changing code.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0222 --format prompt`

## JULES-0223 — Ui pointer and binding handoff — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Inspect UI pointer and binding handoff for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace UI pointer and binding handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0223 --format prompt`

## JULES-0224 — Ui pointer and binding handoff — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ui-input`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for UI pointer and binding handoff. Verify that focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace UI pointer and binding handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0224 --format prompt`

## JULES-0225 — Ui pointer and binding handoff — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-ui-input`

**Objective:** Follow UI pointer and binding handoff from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** UI pointer and binding handoff: focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling.

**Inspect:** `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace UI pointer and binding handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for focus loss, stuck actions after modal close, incorrect scheme labels, pointer-events leaks, and duplicate key handling and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0225 --format prompt`

## JULES-0226 — Mission objective progression — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Trace mission objective progression through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls; fix only if current code demonstrates it.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0226 --format prompt`

## JULES-0227 — Mission objective progression — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Audit mission objective progression at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls. Build the narrowest reproduction before changing code.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0227 --format prompt`

## JULES-0228 — Mission objective progression — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Inspect mission objective progression for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mission objective progression through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0228 --format prompt`

## JULES-0229 — Mission objective progression — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mission-progression`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for mission objective progression. Verify that objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mission objective progression through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0229 --format prompt`

## JULES-0230 — Mission objective progression — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-mission-progression`

**Objective:** Follow mission objective progression from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** mission objective progression: objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mission objective progression through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for objectives that cannot complete, duplicate completion, stale entity IDs, reward-before-proof, and reload stalls and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0230 --format prompt`

## JULES-0231 — Market transaction integrity — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-market-transactions`

**Objective:** Trace market transaction integrity through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries; fix only if current code demonstrates it.

**Context:** market transaction integrity: double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Inspect:** `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace market transaction integrity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0231 --format prompt`

## JULES-0232 — Market transaction integrity — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-market-transactions`

**Objective:** Audit market transaction integrity at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries. Build the narrowest reproduction before changing code.

**Context:** market transaction integrity: double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Inspect:** `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace market transaction integrity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0232 --format prompt`

## JULES-0233 — Market transaction integrity — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-market-transactions`

**Objective:** Inspect market transaction integrity for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Context:** market transaction integrity: double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Inspect:** `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace market transaction integrity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0233 --format prompt`

## JULES-0234 — Market transaction integrity — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-market-transactions`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for market transaction integrity. Verify that double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** market transaction integrity: double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Inspect:** `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace market transaction integrity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0234 --format prompt`

## JULES-0235 — Market transaction integrity — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-market-transactions`

**Objective:** Follow market transaction integrity from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** market transaction integrity: double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries.

**Inspect:** `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace market transaction integrity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double-click purchases, negative stock, stale displayed price, partial credit/cargo mutation, and sell-all boundaries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0235 --format prompt`

## JULES-0236 — Cargo capacity and removal edges — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-cargo-edges`

**Objective:** Trace cargo capacity and removal edges through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering; fix only if current code demonstrates it.

**Context:** cargo capacity and removal edges: fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Inspect:** `src/systems/cargo.js`, `src/ui/screens/market.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace cargo capacity and removal edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0236 --format prompt`

## JULES-0237 — Cargo capacity and removal edges — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-cargo-edges`

**Objective:** Audit cargo capacity and removal edges at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering. Build the narrowest reproduction before changing code.

**Context:** cargo capacity and removal edges: fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Inspect:** `src/systems/cargo.js`, `src/ui/screens/market.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace cargo capacity and removal edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0237 --format prompt`

## JULES-0238 — Cargo capacity and removal edges — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-cargo-edges`

**Objective:** Inspect cargo capacity and removal edges for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Context:** cargo capacity and removal edges: fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Inspect:** `src/systems/cargo.js`, `src/ui/screens/market.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace cargo capacity and removal edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0238 --format prompt`

## JULES-0239 — Cargo capacity and removal edges — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `bug-cargo-edges`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for cargo capacity and removal edges. Verify that fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** cargo capacity and removal edges: fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Inspect:** `src/systems/cargo.js`, `src/ui/screens/market.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace cargo capacity and removal edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0239 --format prompt`

## JULES-0240 — Cargo capacity and removal edges — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-cargo-edges`

**Objective:** Follow cargo capacity and removal edges from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** cargo capacity and removal edges: fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering.

**Inspect:** `src/systems/cargo.js`, `src/ui/screens/market.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace cargo capacity and removal edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for fractional/negative quantities, exact-capacity fits, duplicate cargo rows, stale mass, and event ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0240 --format prompt`

## JULES-0241 — Mining pickup and vacuum lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Trace mining pickup and vacuum lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup; fix only if current code demonstrates it.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0241 --format prompt`

## JULES-0242 — Mining pickup and vacuum lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Audit mining pickup and vacuum lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup. Build the narrowest reproduction before changing code.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0242 --format prompt`

## JULES-0243 — Mining pickup and vacuum lifecycle — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Inspect mining pickup and vacuum lifecycle for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mining pickup and vacuum lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0243 --format prompt`

## JULES-0244 — Mining pickup and vacuum lifecycle — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-mining-pickups`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for mining pickup and vacuum lifecycle. Verify that orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mining pickup and vacuum lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0244 --format prompt`

## JULES-0245 — Mining pickup and vacuum lifecycle — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-mining-pickups`

**Objective:** Follow mining pickup and vacuum lifecycle from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** mining pickup and vacuum lifecycle: orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace mining pickup and vacuum lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for orphan pickups, repeated collection, direct-to-cargo races, full-hold behavior, and destroyed-asteroid cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0245 --format prompt`

## JULES-0246 — Asteroid works board runtime — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Trace Asteroid Works board runtime through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat; fix only if current code demonstrates it.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js`, `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0246 --format prompt`

## JULES-0247 — Asteroid works board runtime — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Audit Asteroid Works board runtime at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat. Build the narrowest reproduction before changing code.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js`, `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0247 --format prompt`

## JULES-0248 — Asteroid works board runtime — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Inspect Asteroid Works board runtime for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js`, `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Asteroid Works board runtime through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:asteroid-drive-cadence`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0248 --format prompt`

## JULES-0249 — Asteroid works board runtime — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-asteroid-works`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for Asteroid Works board runtime. Verify that one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js`, `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Asteroid Works board runtime through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:asteroid-drive-cadence`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0249 --format prompt`

## JULES-0250 — Asteroid works board runtime — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-asteroid-works`

**Objective:** Follow Asteroid Works board runtime from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** Asteroid Works board runtime: one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat.

**Inspect:** `src/systems/asteroidSites.js`, `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Asteroid Works board runtime through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for one-cell movement, board state persistence, event placement, authored-part fallback, zoom register, and input repeat and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:asteroid-drive-cadence`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0250 --format prompt`

## JULES-0251 — Spawn hostility and lawful first fire — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Trace spawn hostility and lawful first fire through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets; fix only if current code demonstrates it.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0251 --format prompt`

## JULES-0252 — Spawn hostility and lawful first fire — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Audit spawn hostility and lawful first fire at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets. Build the narrowest reproduction before changing code.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0252 --format prompt`

## JULES-0253 — Spawn hostility and lawful first fire — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Inspect spawn hostility and lawful first fire for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace spawn hostility and lawful first fire through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0253 --format prompt`

## JULES-0254 — Spawn hostility and lawful first fire — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-spawn-hostility`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for spawn hostility and lawful first fire. Verify that zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace spawn hostility and lawful first fire through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0254 --format prompt`

## JULES-0255 — Spawn hostility and lawful first fire — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-spawn-hostility`

**Objective:** Follow spawn hostility and lawful first fire from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** spawn hostility and lawful first fire: zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets.

**Inspect:** `src/systems/world.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace spawn hostility and lawful first fire through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for zero-heat player attacks, response-window omissions, team-number confusion, station jurisdiction, and stale incident targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0255 --format prompt`

## JULES-0256 — Passive civilian traffic behavior — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Trace passive civilian traffic behavior through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads; fix only if current code demonstrates it.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0256 --format prompt`

## JULES-0257 — Passive civilian traffic behavior — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Audit passive civilian traffic behavior at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads. Build the narrowest reproduction before changing code.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0257 --format prompt`

## JULES-0258 — Passive civilian traffic behavior — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Inspect passive civilian traffic behavior for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace passive civilian traffic behavior through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0258 --format prompt`

## JULES-0259 — Passive civilian traffic behavior — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-passive-traffic`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for passive civilian traffic behavior. Verify that civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace passive civilian traffic behavior through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0259 --format prompt`

## JULES-0260 — Passive civilian traffic behavior — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-passive-traffic`

**Objective:** Follow passive civilian traffic behavior from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** passive civilian traffic behavior: civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads.

**Inspect:** `src/systems/traffic.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace passive civilian traffic behavior through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for civilian fire intents, hostile radar flags, route stalls, despawn/reentry, and passive actors entering combat squads and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0260 --format prompt`

## JULES-0261 — Stale ai contacts and target memory — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Trace stale AI contacts and target memory through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes; fix only if current code demonstrates it.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/shipDecision.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0261 --format prompt`

## JULES-0262 — Stale ai contacts and target memory — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Audit stale AI contacts and target memory at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes. Build the narrowest reproduction before changing code.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/shipDecision.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0262 --format prompt`

## JULES-0263 — Stale ai contacts and target memory — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Inspect stale AI contacts and target memory for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/shipDecision.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace stale AI contacts and target memory through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0263 --format prompt`

## JULES-0264 — Stale ai contacts and target memory — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-ai-stale-contacts`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for stale AI contacts and target memory. Verify that removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/shipDecision.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace stale AI contacts and target memory through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0264 --format prompt`

## JULES-0265 — Stale ai contacts and target memory — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-ai-stale-contacts`

**Objective:** Follow stale AI contacts and target memory from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** stale AI contacts and target memory: removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes.

**Inspect:** `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/shipDecision.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace stale AI contacts and target memory through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for removed/out-of-range entities remaining targets, explicit hostile false lost, tie persistence, and target clearing on mode changes and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0265 --format prompt`

## JULES-0266 — Weapon hit registration — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Trace weapon hit registration through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence; fix only if current code demonstrates it.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js`, `src/combat/actions.js`, `src/combat/geometry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0266 --format prompt`

## JULES-0267 — Weapon hit registration — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Audit weapon hit registration at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence. Build the narrowest reproduction before changing code.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js`, `src/combat/actions.js`, `src/combat/geometry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0267 --format prompt`

## JULES-0268 — Weapon hit registration — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Inspect weapon hit registration for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js`, `src/combat/actions.js`, `src/combat/geometry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace weapon hit registration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0268 --format prompt`

## JULES-0269 — Weapon hit registration — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-weapon-hit-registration`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for weapon hit registration. Verify that tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js`, `src/combat/actions.js`, `src/combat/geometry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace weapon hit registration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0269 --format prompt`

## JULES-0270 — Weapon hit registration — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-weapon-hit-registration`

**Objective:** Follow weapon hit registration from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** weapon hit registration: tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence.

**Inspect:** `src/systems/weapons.js`, `src/combat/actions.js`, `src/combat/geometry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace weapon hit registration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tunneling, duplicate hit IDs, dead-target hits, owner immunity, range expiry, and collision-order dependence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0270 --format prompt`

## JULES-0271 — Combat cleanup after entity destruction — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Trace combat cleanup after entity destruction through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries; fix only if current code demonstrates it.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js`, `src/combat/runtime.js`, `src/combat/persistence.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0271 --format prompt`

## JULES-0272 — Combat cleanup after entity destruction — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Audit combat cleanup after entity destruction at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries. Build the narrowest reproduction before changing code.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js`, `src/combat/runtime.js`, `src/combat/persistence.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0272 --format prompt`

## JULES-0273 — Combat cleanup after entity destruction — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Inspect combat cleanup after entity destruction for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js`, `src/combat/runtime.js`, `src/combat/persistence.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace combat cleanup after entity destruction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0273 --format prompt`

## JULES-0274 — Combat cleanup after entity destruction — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-combat-cleanup`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for combat cleanup after entity destruction. Verify that dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js`, `src/combat/runtime.js`, `src/combat/persistence.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace combat cleanup after entity destruction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0274 --format prompt`

## JULES-0275 — Combat cleanup after entity destruction — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-combat-cleanup`

**Objective:** Follow combat cleanup after entity destruction from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** combat cleanup after entity destruction: dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries.

**Inspect:** `src/core/entity.js`, `src/combat/runtime.js`, `src/combat/persistence.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace combat cleanup after entity destruction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dangling projectiles, statuses, attachments, target pointers, event listeners, and derived combatant entries and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0275 --format prompt`

## JULES-0276 — Massline attachment lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Trace Massline attachment lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach; fix only if current code demonstrates it.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js`, `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0276 --format prompt`

## JULES-0277 — Massline attachment lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Audit Massline attachment lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach. Build the narrowest reproduction before changing code.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js`, `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0277 --format prompt`

## JULES-0278 — Massline attachment lifecycle — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Inspect Massline attachment lifecycle for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js`, `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Massline attachment lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0278 --format prompt`

## JULES-0279 — Massline attachment lifecycle — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-massline-lifecycle`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for Massline attachment lifecycle. Verify that double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js`, `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Massline attachment lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0279 --format prompt`

## JULES-0280 — Massline attachment lifecycle — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-massline-lifecycle`

**Objective:** Follow Massline attachment lifecycle from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** Massline attachment lifecycle: double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach.

**Inspect:** `src/combat/attachments.js`, `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Massline attachment lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for double attach/cut, target deletion, save/load, ordinary snap regression, and input intent remembered across detach and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0280 --format prompt`

## JULES-0281 — Browser/electron continue synchronization — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Trace Browser/Electron Continue synchronization through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery; fix only if current code demonstrates it.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0281 --format prompt`

## JULES-0282 — Browser/electron continue synchronization — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Audit Browser/Electron Continue synchronization at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery. Build the narrowest reproduction before changing code.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0282 --format prompt`

## JULES-0283 — Browser/electron continue synchronization — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Inspect Browser/Electron Continue synchronization for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Browser/Electron Continue synchronization through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0283 --format prompt`

## JULES-0284 — Browser/electron continue synchronization — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-continue-sync`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for Browser/Electron Continue synchronization. Verify that shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Browser/Electron Continue synchronization through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0284 --format prompt`

## JULES-0285 — Browser/electron continue synchronization — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-continue-sync`

**Objective:** Follow Browser/Electron Continue synchronization from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** Browser/Electron Continue synchronization: shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery.

**Inspect:** `src/save/saveSystem.js`, `electron/main.cjs`, `scripts/launch-electron.mjs`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace Browser/Electron Continue synchronization through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for shared player-save mirroring, stale slot lists, last-writer arbitration, isolated evidence pollution, and failed copy recovery and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0285 --format prompt`

## JULES-0286 — Adventure and save migration — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Trace adventure and save migration through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore; fix only if current code demonstrates it.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0286 --format prompt`

## JULES-0287 — Adventure and save migration — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Audit adventure and save migration at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore. Build the narrowest reproduction before changing code.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0287 --format prompt`

## JULES-0288 — Adventure and save migration — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Inspect adventure and save migration for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace adventure and save migration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0288 --format prompt`

## JULES-0289 — Adventure and save migration — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-adventure-migration`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for adventure and save migration. Verify that partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace adventure and save migration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0289 --format prompt`

## JULES-0290 — Adventure and save migration — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-adventure-migration`

**Objective:** Follow adventure and save migration from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** adventure and save migration: partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore.

**Inspect:** `src/systems/adventureMigration.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace adventure and save migration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for partial old records, repeated migration, missing IDs, non-idempotent defaults, and migration after failed restore and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0290 --format prompt`

## JULES-0291 — Audio cue duplication and silence — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Trace audio cue duplication and silence through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume; fix only if current code demonstrates it.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/cueRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0291 --format prompt`

## JULES-0292 — Audio cue duplication and silence — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Audit audio cue duplication and silence at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume. Build the narrowest reproduction before changing code.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/cueRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0292 --format prompt`

## JULES-0293 — Audio cue duplication and silence — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Inspect audio cue duplication and silence for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/cueRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace audio cue duplication and silence through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0293 --format prompt`

## JULES-0294 — Audio cue duplication and silence — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-audio-duplication`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for audio cue duplication and silence. Verify that duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/cueRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace audio cue duplication and silence through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0294 --format prompt`

## JULES-0295 — Audio cue duplication and silence — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `bug-audio-duplication`

**Objective:** Follow audio cue duplication and silence from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** audio cue duplication and silence: duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/cueRecipes.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace audio cue duplication and silence through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate event subscriptions, repeated AudioContext setup, stale looping sources, muted critical cues, and pause/resume and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:audio-identity`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0295 --format prompt`

## JULES-0296 — Vfx pool recycling — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Trace VFX pool recycling through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse; fix only if current code demonstrates it.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0296 --format prompt`

## JULES-0297 — Vfx pool recycling — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Audit VFX pool recycling at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse. Build the narrowest reproduction before changing code.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0297 --format prompt`

## JULES-0298 — Vfx pool recycling — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Inspect VFX pool recycling for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace VFX pool recycling through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0298 --format prompt`

## JULES-0299 — Vfx pool recycling — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-vfx-pools`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for VFX pool recycling. Verify that stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace VFX pool recycling through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0299 --format prompt`

## JULES-0300 — Vfx pool recycling — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-vfx-pools`

**Objective:** Follow VFX pool recycling from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** VFX pool recycling: stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace VFX pool recycling through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale transforms/material state, pool exhaustion, double release, segment resurrection, and event-light reuse and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0300 --format prompt`

## JULES-0301 — Station docking interaction — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-docking`

**Objective:** Trace station docking interaction through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch; fix only if current code demonstrates it.

**Context:** station docking interaction: dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Inspect:** `src/systems/world.js`, `src/ui/screens/stationHub.js`, `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station docking interaction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0301 --format prompt`

## JULES-0302 — Station docking interaction — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-docking`

**Objective:** Audit station docking interaction at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch. Build the narrowest reproduction before changing code.

**Context:** station docking interaction: dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Inspect:** `src/systems/world.js`, `src/ui/screens/stationHub.js`, `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station docking interaction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0302 --format prompt`

## JULES-0303 — Station docking interaction — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-docking`

**Objective:** Inspect station docking interaction for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Context:** station docking interaction: dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Inspect:** `src/systems/world.js`, `src/ui/screens/stationHub.js`, `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station docking interaction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0303 --format prompt`

## JULES-0304 — Station docking interaction — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-docking`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for station docking interaction. Verify that dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** station docking interaction: dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Inspect:** `src/systems/world.js`, `src/ui/screens/stationHub.js`, `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station docking interaction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0304 --format prompt`

## JULES-0305 — Station docking interaction — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-docking`

**Objective:** Follow station docking interaction from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** station docking interaction: dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch.

**Inspect:** `src/systems/world.js`, `src/ui/screens/stationHub.js`, `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace station docking interaction through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for dock prompts around absent stations, target swap, pause ownership, undock input leakage, and station ID mismatch and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0305 --format prompt`

## JULES-0306 — Ship outfitting and derived stats — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-outfitting-derived-stats`

**Objective:** Trace ship outfitting and derived stats through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure; fix only if current code demonstrates it.

**Context:** ship outfitting and derived stats: stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Inspect:** `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/data/modules.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace ship outfitting and derived stats through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0306 --format prompt`

## JULES-0307 — Ship outfitting and derived stats — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-outfitting-derived-stats`

**Objective:** Audit ship outfitting and derived stats at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure. Build the narrowest reproduction before changing code.

**Context:** ship outfitting and derived stats: stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Inspect:** `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/data/modules.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace ship outfitting and derived stats through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure and the facet named by this task.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0307 --format prompt`

## JULES-0308 — Ship outfitting and derived stats — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-outfitting-derived-stats`

**Objective:** Inspect ship outfitting and derived stats for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Context:** ship outfitting and derived stats: stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Inspect:** `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/data/modules.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace ship outfitting and derived stats through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0308 --format prompt`

## JULES-0309 — Ship outfitting and derived stats — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-outfitting-derived-stats`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for ship outfitting and derived stats. Verify that stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** ship outfitting and derived stats: stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Inspect:** `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/data/modules.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace ship outfitting and derived stats through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0309 --format prompt`

## JULES-0310 — Ship outfitting and derived stats — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-outfitting-derived-stats`

**Objective:** Follow ship outfitting and derived stats from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** ship outfitting and derived stats: stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure.

**Inspect:** `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/data/modules.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace ship outfitting and derived stats through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for stale derived stats, illegal slot sizes, partial transactions, preview/live mismatch, and rollback on failure and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0310 --format prompt`

## JULES-0311 — Crafting queue lifecycle — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Trace crafting queue lifecycle through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs; fix only if current code demonstrates it.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0311 --format prompt`

## JULES-0312 — Crafting queue lifecycle — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Audit crafting queue lifecycle at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs. Build the narrowest reproduction before changing code.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0312 --format prompt`

## JULES-0313 — Crafting queue lifecycle — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Inspect crafting queue lifecycle for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace crafting queue lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0313 --format prompt`

## JULES-0314 — Crafting queue lifecycle — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `bug-crafting-queue`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for crafting queue lifecycle. Verify that duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace crafting queue lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0314 --format prompt`

## JULES-0315 — Crafting queue lifecycle — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `bug-crafting-queue`

**Objective:** Follow crafting queue lifecycle from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** crafting queue lifecycle: duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace crafting queue lifecycle through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for duplicate completion, insufficient-input rollback, queue persistence, time jumps, and deleted recipe IDs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0315 --format prompt`

## JULES-0316 — Scanner and recon mission handoff — audit create-to-remove lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Trace scanner and recon mission handoff through creation, activation, replacement or route transition, and removal. Reproduce one lifecycle defect class from scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets; fix only if current code demonstrates it.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js`, `src/systems/missions.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0316 --format prompt`

## JULES-0317 — Scanner and recon mission handoff — audit edge conditions and transition races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Audit scanner and recon mission handoff at the exact thresholds, same-tick event order, rapid input, and transition boundaries implicated by scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets. Build the narrowest reproduction before changing code.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js`, `src/systems/missions.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0317 --format prompt`

## JULES-0318 — Scanner and recon mission handoff — hunt stale references and cache drift

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Inspect scanner and recon mission handoff for stale cached identity, retained entity/root references, outdated derived values, or route-local state surviving replacement. Focus on scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js`, `src/systems/missions.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace scanner and recon mission handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The investigation proves whether cache identity follows the canonical owner and invalidates on every real mutation path.
- A fix, when needed, adds an explicit invalidation/ownership seam rather than periodic brute-force rebuilding.
- A regression test covers replacement or reload, not just first construction.
- No global cache flush or per-frame recomputation is used as camouflage.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0318 --format prompt`

## JULES-0319 — Scanner and recon mission handoff — exercise failure and fallback paths

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `bug-scanner-recon`

**Objective:** Force the realistic missing, rejected, malformed, unavailable, or partially initialized dependency paths for scanner and recon mission handoff. Verify that scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets fails visibly and safely rather than hanging, silently degrading, or corrupting state.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js`, `src/systems/missions.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace scanner and recon mission handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The failure injection uses a real seam and restores it after the test.
- The result is either an explicit diagnostic/recoverable fallback or a deliberate fail-closed gate consistent with repository policy.
- A fallback never masquerades as accepted authored quality or completed gameplay.
- Any production fix remains bounded to the current owner and includes focused coverage.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0319 --format prompt`

## JULES-0320 — Scanner and recon mission handoff — verify the default-route integration

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `bug-scanner-recon`

**Objective:** Follow scanner and recon mission handoff from its initiating input/event/data row through the selected live backend to its player-visible or persisted result. Find and repair one broken handoff only when the default route proves it.

**Context:** scanner and recon mission handoff: scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets.

**Inspect:** `src/systems/scanner.js`, `src/systems/missions.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `docs/COMMON_BUGS.md`, `docs/MODULE_MAP.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Trace scanner and recon mission handoff through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for scan cooldown edges, duplicate reveal, stale question marks, mission credit radius, and save/reload of discovered targets and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The trace names the live selection seam and avoids fixing a legacy implementation by mistake.
- The check reaches at least two owners in the actual integration path and proves the final effect, not merely an intermediate flag.
- Any fix preserves determinism, single writers, save behavior, and Browser/Electron route parity where relevant.
- NO_CHANGE is the correct result when the current route is intact; speculative cleanup is forbidden.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0320 --format prompt`
