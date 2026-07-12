# SpaceFace Current Build Status

Updated: 2026-07-04 · **Superseded for product priority 2026-07-09**

> **Unified product truth now lives in `design/vision/`.**  
> Read `design/vision/README.md` → `01_CURRENT_STATE.md` (done/play truth) → `03_MASTER_BUILD_PLAN.md` (what to build).  
> This file remains a historical Spec2 check map; it **drifts** and does not encode play-fun or the 2026-07-09 constitution.

This is the repo-facing status map for SpaceFace 2.0. It reconciles `design/GDD_2_0.md`,
`design/BUILD_PLAN_2_0.md`, `design/spec2/*`, live source files, and the named check scripts.

Target platform: PC/browser. Electron/packaged desktop is an optional distribution shell for the same
game route. Handheld-specific readiness is not a target and should not be used as a release blocker.

## Status Legend

- **Built/proven:** live code exists and the named check passed in this audit.
- **Built, needs proof/cleanup:** feature exists, but a dedicated check is missing/red or broader gates fail.
- **Not built:** required source/check artifacts are missing or the spec acceptance surface is absent.
- **Reference-only:** older plan/spec material retained for history, not a build order.

## Built/proven

| Area | Evidence |
|---|---|
| SPEC2/01 Massline feel | `node scripts/check-massline-feel.mjs` passed. |
| SPEC2/03 First-hour static pacing slice | `node scripts/check-first-hour.mjs` passed; `npm run check:onboarding` passed. Runtime proof is tracked below. |
| SPEC2/07 Audio identity | `node scripts/check-audio-identity.mjs` passed. |
| Bundle/build import surface | `npm run check:bundle` passed in the current tree: bundle builds clean and `check-asset-reachability` reports the referenced runtime assets exist and are bundled. |
| SPEC2/02 Flight/camera/juice contract slice | `node scripts/check-juice-contract.mjs` passed. Browser visual proof is tracked below. |
| SPEC2/05 Economy progression/mining additions | `node scripts/check-price-memory.mjs` passed; `npm run check:mining:2` passed; `npm run check:market-nav` passed. Runtime market-loop proof is tracked below. |
| SPEC2/06 UI identity | `node scripts/check-ui-identity.mjs` passed. |
| Mining 2.0 core | `npm run check:mining:2` passed. |
| AI telegraphs/readability | `npm run check:ai:telegraphs` passed. |
| Sector palette identity | `npm run check:sector-palettes` passed. |
| Parallax layers | `npm run check:parallax` passed. |
| Flight clean browser proof | `npm run check:flight:clean` passed: 5 clean desktop/mobile visual runs, nonblank canvas, no page errors, no strict warning failures. |
| Runtime authored asset loading | `npm run check:assets:live` passed: 66/66 declared release assets loaded, `failureCount: 0`, 10/10 ships authored, Kestrel/Wasp using whole-ship bodies with no fallback parts. |
| Ship visual stability / flicker proof | `npm run check:visual-stability` passed: 360 sampled frames, max 14 ships observed, zero stability failures, no page errors, no blank authored surfaces or malformed ship bounds. |

## Built, needs proof/cleanup

| Area | Current state | Next action |
|---|---|---|
| Cruise tier | `src/systems/cruise.js` is wired and `check-juice-contract` verifies charge/drop behavior. `scripts/check-cruise.mjs` **EXISTS** (11KB; verified 2026-07-06) — drives the real cruise system deterministically and asserts charge time, multipliers, damage/mass-lock/manual drops, weapons-block guard. | *(Corrected 2026-07-06: previously listed as "missing" — stale.)* Run `npm run check:cruise`; if it reds, the script exists, so debug the failure rather than looking for the file. |
| First-15 runtime | Static first-hour/onboarding checks pass, but `npm run check:first-15-runtime` currently times out. | Repair the runtime probe or the route it waits for; do not call first-15 release-ready until this is green. |
| Market first-loop runtime | `npm run check:market-nav` passes, but `npm run check:market-first-loop` currently times out. `npm run check:balance` exits 0 with warnings. | Repair the runtime market loop proof, then decide whether balance warnings are acceptable or need tuning before release. |
| Claim/base input proof | Map/scanner checks pass (`check:controls-discoverability`, `check:starmap-objective`, `check:localmap-routes`), but `npm run check:claim-base` currently fails around C-key fallthrough. | Fix the claim-base input binding/probe so scanner and claim-base controls share the input contract cleanly. |
| UI screen/import guard | `node scripts/check-ui-screen-imports.mjs` currently fails 4 checks in this dirty tree. | Fix or deliberately rebaseline those checks before broad release claims. |
| 47-A replay/goldens | `npm run check:sim:compare` fails the stale projectile-collision coverage precondition. | Re-record/rederive the 47-A telemetry/presentation expectations as a deliberate batch after sim-shape changes settle. |
| Strict PC/browser performance target | `npm run check:perf` now runs to completion on the release route, but strict mode fails `raf.frame.p95.target`: 16.9 ms vs 16.7 ms. Supporting budgets passed: 30fps floor, authored fallback count 0, draw calls 78, render phase 5.6 ms, sim frame 2.9 ms, UI phase 1.1 ms, heap growth 2.55 MB. | Treat this as a remaining release performance polish pass, not an asset-loading failure. Preserve authored visuals; reduce occasional present/compositor/post spikes until the 60fps target and no-long-frame bar are comfortably green. |
| Asset media reachability | Several cinematic/ore/pilot/UI media files exist but are not player-facing or are style-reference only. | Wire only the assets that improve default play; classify the rest as authoring/reference in an asset reachability check. |

## Not built

| Spec/plan | Missing evidence |
|---|---|
| SPEC2/04 World Alive | `src/systems/encounterDirector.js` **EXISTS** (1033 lines; verified 2026-07-06) — the living-universe campaign director (combat + civilian decks, sector-zone anchors, pressure/pacing gate). `scripts/check-encounter-director.mjs` **also EXISTS** (13KB) — drives determinism + budget + one-voice assertions. *(Corrected 2026-07-06: previously listed both as "missing" — stale.)* Existing interdiction/bulk-haul pieces remain partial plumbing on top of the director. | Remaining SPEC2/04 work is coverage/completeness against the spec, not building the director from scratch. Run `npm run check:encounter-director`; gaps surface as failing assertions. The `voiceArbiter.js` one-voice gate (`src/systems/voiceArbiter.js`, 215 lines) is the related "attention arbiter." |
| SPEC2/08 PC/browser release readiness | `scripts/check-release-soak.mjs` exists and `npm run check:release-soak` passes its deterministic quick campaign; `test/release-soak-contract.test.mjs` passes 13/13. Capsule/store capture, the accepted 60s gameplay capture, target/floor performance receipts, and the full browser/Electron release matrix remain open. |
| Asset production longform lane | The Blender/asset-production plan in `design/spec2/AGENT_PROMPTS.md` is not a completed production run. Treat it as a future asset lane, coordinated by `assets/ships/release.__lock/` and `release.__building/`. |

## Reference-only / superseded docs

- `design/GDD_2_0.md` is the design authority.
- `ARCHITECTURE.md` is the technical authority.
- `design/BUILD_PLAN_2_0.md` is the execution plan, but older table rows can drift; this file is
  the current reconciliation point.
- `design/HUD_REVAMP_DESIGN.md` is superseded where it asks for visor/cockpit/helmet HUD motifs.
- `design/V2_MASTER_PLAN.md`, `design/IMPROVEMENT_IDEAS.md`, and `design/specs/*.md` are historical
  or reference material unless a current 2.0 doc explicitly revives a section.

## Continued Build Plan

1. **Stabilize current truth gates.**
   Keep `check:bundle`, `check:flight:clean`, `check:assets:live`, and `check:visual-stability` green; then fix `check-ui-screen-imports`,
   `check:first-15-runtime`, `check:market-first-loop`, `check:claim-base`, and
   `check:cruise`; then re-run the targeted checks above.

2. **Re-record 47-A expectations deliberately.**
   Adjust `test/47a.inputs.json` if needed so the tape still exercises projectile collision after
   Mining 2.0 fracture changes, then refresh the telemetry/presentation expected files in one named
   batch and make `npm run check:sim:compare` green.

3. **Implement SPEC2/04 World Alive.**
   Build `src/systems/encounterDirector.js` and `scripts/check-encounter-director.mjs`, including
   deterministic encounter budgets, cruise interdiction, patrol scan, distress, named bounty, convoy,
   toll/econ/faction integration, and one-voice trace checks.

4. **Finish asset/media integration.**
   Preserve the now-green whole-ship GLB runtime contract for Kestrel/Pelican/Wasp and the
   `npm run check:visual-stability` flicker proof, expose useful cinematics/ore/pilot
   assets in default player-facing UI where tasteful, and classify bible/contact-sheet/concept assets
   as authoring/reference unless they become clean runtime materials.

5. **Run SPEC2/08 as PC/browser release readiness.**
   Build the release soak, PC browser/Electron performance proof, capture scripts, zero-console loop,
   and `check:ci` closeout. Do not add handheld-specific work.

6. **Optional expansion after the core is clean.**
   Sector-count expansion, additional store-page captures, or broader asset-production phases are
   follow-up production work, not blockers for repairing the current 2.0 proof surface.
