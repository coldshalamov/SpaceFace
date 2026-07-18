# F01–F17 — Foundation Sprint

**Status:** integrated by `77a09790`, `32596ec7`, and the program commit containing this ledger.

## Goal

Complete the highest-fan-in 17 packets before another broad feature wave: establish truthful program
control, repair the confirmed passive-credit contract, turn CI into a complete diagnostic matrix, make
content and check surfaces inspectable, define honest deep-state fixture contracts, and expose the next
physics/coverage risks without pretending static reports are acceptance.

## Decision

The foundation slice is 17 packets because the reconstructed program contains 113 packets and 17/113 is
15.04%. These packets were selected for fan-in: every later lane depends on knowing what runs, what
exists, what persists, what owns state, and which evidence is current.

## Packet ledger

| ID | Outcome and implementation | Proof / terminal state |
|---|---|---|
| `F01` | Reconcile the attachment with live branch, recent commits, default backends, dirty tree, program authority, and current checks. Record the missing full-roadmap-file limitation. | Audit receipt in this roadmap; `INTEGRATED` when program commit lands. |
| `F02` | Establish the live path mutex and dynamic collision rule. Keep the external map/render/game-state edits out of all foundation commits. | `NOW.md` occupied lease plus explicit staged-path review; `INTEGRATED`. |
| `F03` | Make `design/program/` the obvious current execution entrance with a volatile `NOW.md`, roadmap index, and root/nested AGENTS routing. | Link audit and docs route check; `INTEGRATED`. |
| `F04` | Decompose the complete program into stable `F/G/T/A/W/R` IDs totaling 113, with dependencies and terminal outcomes. | Registry totals 113 and links all family briefs; `INTEGRATED`. |
| `F05` | Define the autonomous agent protocol: research, lease, red/characterization proof, implementation, layered verification, explicit staging, receipt, integration, drift recheck. | [`00_EXECUTION_PROTOCOL.md`](./00_EXECUTION_PROTOCOL.md); `INTEGRATED`. |
| `F06` | Audit the new 7/17 plan family, archive only finished menu/drill handoffs, repair references, register active Asteroid/map work, and log later verification debt. | `07_HISTORICAL_BUILDS.md`, plan registry, zero broken maintained references; `INTEGRATED`. |
| `F07` | Fix `asteroidSites._creditPassive` to record the finite numeric amount actually granted by automation and fail closed on invalid results. Correct the masking object-return stub and cover capped/uncapped production bridges. | Red observed at 88 vs 44; focused 30/30 green; commit `77a09790`; `INTEGRATED`. |
| `F08` | Upgrade CI report schema to v2 with conservative assertion, stale-golden, stale-pin, browser, Electron reset, timeout, signal, performance, missing-evidence, orphan, generic, and proven-flake classifications. | `test/check-ci-report.test.mjs`; `FOCUSED_GREEN`, integrate with F09. |
| `F09` | Recursively expand `package.json`'s `precheck` plus broad `check` chain into independent leaf commands; run all by default, retain optional `--fail-fast`/`--smoke`, emit per-command duration and ignored full logs, and make `check:ci` use this runner once. | Recursive matrix construction test and runner syntax; `FOCUSED_GREEN`. Full matrix result remains separate acceptance evidence. |
| `F10` | Build a deterministic census from live imported registries with stable IDs, counts, duplicate/missing/reference diagnostics, and no hard-coded content totals. | `test/content-census.test.mjs`; `FOCUSED_GREEN`. |
| `F11` | Expose declared, imported, runtime-reachable, fixture, natural-occurrence, and visual-acceptance evidence separately; provide report/check CLI and package wiring. Declaration is live-registry verified; import/runtime source chains stay labeled maintained references until mechanically proved. Never infer the last three columns from imports. | `npm run check:content-census`; current 18-category snapshot has zero maintained-reference issue while fixture/natural/visual evidence remains unassessed; `FOCUSED_GREEN`. |
| `F12` | Generate a deterministic check catalog from package scripts, including composite edges, heuristic runtime/route hints, missing dependencies, and cycles. Hints are explicitly not import-graph or execution proof. | `test/check-catalog.test.mjs`; current catalog has zero missing dependency/cycle; `FOCUSED_GREEN`. |
| `F13` | Define the thirteen-state deep save ladder—fresh through post-ending—with dependencies, public routes, and semantic claims. Reject dishonest artifact/status combinations. | `test/deep-state-fixture-ladder.test.mjs` and `npm run check:deep-state-fixture-ladder`; 0 captured/13 planned is the honest baseline; `FOCUSED_GREEN`. |
| `F14` | Add a canonical seed-47 RNG vector, serializable step/save continuity, named-stream isolation, initialization, and angle-range characterization. | `test/rng-contract.test.mjs`; `FOCUSED_GREEN`. This is coverage, not a newly found runtime defect. |
| `F15` | Audit high-fan-in blind spots before duplicating tests. Record existing coverage and next genuine gaps for RNG, encounter catalog/dispatch, spatial query, effects, ship construction, and combat trace. | Gap table below; `INTEGRATED`. |
| `F16` | Add a deterministic diagnostic-only transform-writer report separating physics owners, compatibility paths, and review candidates. Do not turn regex candidates into a false gate. | `test/physics-writer-audit.test.mjs`, `npm run report:physics-writers`; current snapshot 123 candidates: 28 authority, 21 compatibility, 74 review; `FOCUSED_GREEN`. |
| `F17` | Activate four collision-free next packets (`G01`, `T01`, `A01`, `W01`) with path budgets, dependencies, and proof. | `NOW.md` ready table and family briefs; `INTEGRATED`. |

Integration receipt: `F07` landed in `77a09790`; the executable diagnostics and focused tests for
`F08–F16` landed in `32596ec7`; `F01–F06`, `F17`, routing, history, and final status land in the program
commit containing this ledger. The `FOCUSED_GREEN` rows above therefore also have their required
`INTEGRATED` state. This receipt does not promote any later player-route packet.

## F15 high-fan-in coverage audit

| Seam | Existing evidence | Genuine next gap |
|---|---|---|
| RNG/hash/streams | Many consumers indirectly exercise determinism; F14 now owns canonical vectors and stream isolation. | Audit duplicate local PRNG implementations and migrate only when behavior/save compatibility is proven. |
| Encounter catalog | Depth encounter loader/index tests cover declaration/loading and reference integrity. | `W01`: direct phase-dispatch ownership, duplicate dispatch, stale encounter state, and resume semantics. |
| Spatial query | `check-gameplay-core.mjs` and spatial-query checks cover broad behavior and scaling. | Add an ownership-focused stale-hash/repeated-init test only when a real failure is demonstrated; no duplicate generic suite now. |
| Effect runtime | Presentation and UI-effect checks cover visible integrations. | Inventory effect lifecycle/disposal and pause/save semantics before selecting a narrow defect packet. |
| Ship construction kit | Parts/manifests/asset wiring have substantial focused tests. | Prove runtime preview fidelity and authored loadout parity in `G12`/`R10`; do not add another count check. |
| Combat trace digest | Combat grammar checks prove repeated-command digest equality and phase-0 integration consumes it. | Add a small direct trace append/order/reset/save contract before using the digest as cross-pilot evidence. |

## Verification commands

```powershell
npm run check:foundation
npm run report:check-catalog -- --output scratch/check-catalog-review.json
npm run report:physics-writers
node --check scripts/check-ci-report.mjs
git diff --check -- <foundation-paths-listed-in-NOW.md>
```

Run the full `npm run check:ci` matrix only in a controlled long-running validation window with browser
and Electron ports/profiles reserved. Its purpose is to report every failure, not to manufacture a quick
green signal during concurrent player-route work.

## Residual risks

- Census import/runtime source chains are labeled maintained references and can drift; a later packet
  should derive/verify the import graph mechanically without collapsing reachability into visual acceptance.
- Deep-state contracts are not fixtures yet. `captured` requires a public route, real artifact, restore
  proof, and current build identity.
- Physics candidates require entity-kind/backend review. Promotion to an enforcement gate must first
  classify legitimate projectile/spawn/restore writes and migrate actual Rapier-body violations.
- The occupied map lane must rerun its cutover gate after its palette/source-pin change lands.
- The V3 and legacy sim runs are deterministic across uninterrupted/reload comparison, but their expected
  envelopes are stale at this tree. `check:sim:v3` remains red. Golden re-recording is a separate reviewed
  decision after the occupied `gameState`/HUD lane lands, not foundation cleanup.
- The complete CI runner still buffers each active child's full stdout/stderr until that command exits and
  only guarantees process-tree cleanup on timeout. Before `R16` platform/soak acceptance, stream full logs
  incrementally, retain bounded in-memory tails, and prove SIGINT/SIGTERM cleanup on Windows.
- Before any deep-state row is promoted from `planned`, recompute the canonical internal save checksum and
  validate a machine-readable successful public-route/restore receipt; file existence and SHA-256 alone are
  only capture-integrity checks.
