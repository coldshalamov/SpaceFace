# SpaceFace Full Solo Alpha — execution ledger

**Status:** Active · **authority:** current product-sprint execution authority beneath
`ARCHITECTURE.md`, `design/GDD_2_0.md`, and `design/spec2/00_MASTER_TASTE.md`.
`ARCHITECTURE.md` and the GDD own technical/design law; the spec2 taste document is historical
rejection context rather than a binding visual-token system. This ledger owns alpha scope, order,
evidence, and acceptance. Live player proof outranks synthetic checks and status prose.

**Unified current status:** [`design/program/README.md`](../program/README.md) and its numbered
companions separate verified done, remaining work, acceptance state, and dirty-tree recoverability.
When a status paragraph below conflicts with that live audited set or a current check, the current
check and unified set win; update this ledger in the same integration pass.

## Production operating layer

`design/production/README.md` is the durable draft suite for anti-shortcut orchestration,
professional quality, the Blender/image asset pipeline, multi-agent research, and temporal gameplay
observability. It refines how this ledger is executed and evidenced; it does not override this
ledger or the authority chain above. Read it for production-system, autonomous-campaign, asset,
observability, or model-routing work instead of relying on chat context or old terminal transcripts.

## Locked product decisions

- One seamless persistent 24-region galaxy: 10 authored story regions plus 14 stable frontier
  regions assembled once from the save seed.
- Regions are always present and traversable; story points toward places but does not create or
  unlock them. Region travel has no loading-screen levels, despawn boundaries, or origin resets.
- Solo-alpha target includes B0–B7 of 47-A, all five endings, post-ending play, major solo loops,
  and upgradeable outposts.
- Multiplayer/co-op, walkable interiors, planetary surfaces, freeform station-construction RTS,
  unbounded generation, and a duplicate World Director are out of scope.
- Every new game begins in the Hitch/Kestrel. First dock offers non-binding Hauler, Hunter, or
  Prospector origins.
- Top-50 research and candidate art may continue in the leased Blender lane, but broad production
  through the current campaign evaluators waits for Milestone-0 integrity gates. Independent
  in-game acceptance is required before any asset is promoted as player-facing truth.

## Four-slot operating cell

| Slot | Authority |
|---|---|
| Lead integrator | Owns this ledger, leases, locked lead files, integration, and acceptance. |
| Fresh code implementer | One bounded task and one explicit file lane; implements and self-checks, never commits. |
| Top-50 art author | May work concurrently only in its leased asset lane; cannot self-certify release use. |
| Independent review/verification | Read-only spec review, then quality review, then live verification/taste review where applicable. |

Only one code implementer writes at a time. A failed review returns to the same implementer and
must be re-reviewed before the next task begins.

## Evidence contract

Every task records `.devshots/alpha/<task>/evidence.json` with schema
`spaceface.alphaEvidence.v1`. `npm run check:alpha:evidence` recursively validates the real,
ignored `.devshots/alpha` corpus and every referenced artifact. The clean-CI contract gate is
`npm run check:alpha:evidence:contract`; it exercises the rejection matrix without requiring local
runtime captures.

- Capture/runtime pairs are fixed: `browser`/`browser`, `electron`/`electron`,
  `blender`/`blender`, and `synthetic`/`node`.
- `browser` and `electron` captures may be primary acceptance. `blender` and `synthetic` captures
  are supporting evidence only. Browser/Electron records name a non-empty GPU.
- Primary acceptance requires public keyboard/mouse, gamepad, touch, or public-intent input; no
  fixture input and no injected state/entities.
- Primary acceptance requires at least one check, every check passing, and at least one screenshot
  or video.
- Every screenshot/video artifact, including supporting evidence, must use an allowed media
  extension and have matching PNG/JPEG/WebP or MP4/WebM file-signature bytes.
- Fixture evidence may use injection only with `primaryAcceptance: false`.
- Every artifact is a real regular file contained under `.devshots/alpha/<task>/`; repository
  traversal, URI/absolute paths, ADS syntax, control characters, and misleading media labels fail.
- Synthetic checks protect regressions. They do not prove playability, readability, visual quality,
  fun, or task completion.
- `VISIBLE_IN_PLAY` is lifecycle/reachability status, not visual acceptance. Only an orchestrator
  record at `design/production/asset-classifications/<assetId>.json` can mark an asset accepted;
  wired assets may remain candidate, missing-evidence, or rejected while still visible in play.
- `npm run check:asset-classifications` is the reproducible clean-clone corpus gate and permits
  absent ignored artifacts only for non-accepted records. The evidence-bearing acceptance gate is
  `npm run check:asset-classifications:evidence`, which requires every citation to be a contained
  regular file. Accepted records require real evidence and campaign state in both modes.
- Transcripts, self-scores, iteration counts, and file existence are not evidence.

**Pending evidence migration:** the current live Alpha corpus contains eight path-only v1 records.
They pass today's validator but are not yet per-artifact hash/producer-receipt bound. EVID-001 makes
that contract strict and emits the migration report; EVID-002 revalidates/recaptures or downgrades
each affected Complete claim. Milestone 0 cannot exit with a legacy record grandfathered.

## Current Milestone 0 status

- Task 0.1 established this ledger and strict evidence validator. Independent spec and quality
  reviews approved it. Supporting contract evidence is
  `.devshots/alpha/m0-alpha-evidence/evidence.json`.
- The authored-runtime recovery's technical pipeline is independently approved: transactional
  publication, exporter rollback, provenance, per-material texture roles, strict embedded-GLB
  storage, path containment, and no-bytecode checks pass. The source manifest still has 15
  classified unrelated residuals, and no asset receives default-route or taste acceptance from
  this technical evidence alone.
- The current-revision browser and Electron baselines are accepted at
  `.devshots/alpha/m0-live-baseline-browser/evidence.json` and
  `.devshots/alpha/m0-live-baseline-electron/evidence.json`. Both uninjected public routes used
  `master@6e27aa2b+dirty#04857c82b998`, visibly armed the Helios pointer action, reached the physical
  dock prompt in 26.384 seconds (browser) / 23.691 seconds (Electron), held 30 stable station frames
  on Intel D3D11, and completed owned teardown cleanly.
- Current graphics are classified in 19 durable orchestrator records: 3 candidate, 8 rejected,
  8 missing-evidence, and 0 accepted. Lifecycle wiring and authoring telemetry do not override
  those records.

| ID | Task | Status | Acceptance |
|---|---|---|---|
| 0.1 | Authoritative ledger + alpha evidence contract | Contract complete; live corpus RED | `npm run check:alpha:evidence:contract` passes, but the fresh 2026-07-14 live corpus reports 13 issues across 20 records. Repair/migrate the corpus before M0 exit. |
| 0.2 | Post-publisher live baseline | Historical acceptance; current revision stale | Browser/Electron evidence exists for `master@6e27aa2b+dirty#04857c82b998`, not current `05b9cf60`. Re-run the canonical routes and bind new evidence to current committed state. |
| 0.2a | Isolate visual-stability server ownership | Complete | Canonical in-process server on OS-assigned loopback port; lifecycle gate plus two independent 360-frame runs pass with 315 inspected frames, nine ships, zero failures/page errors, and clean teardown while unrelated 8123 listeners remain; `.devshots/alpha/m0-visual-probe-isolation/evidence.json`; independent spec and quality reviews approved. |
| 0.3 | Reclassify current graphics | Complete | `design/production/asset-classifications/*.json` contains 19 schema-validated orchestrator records: 3 candidate, 8 rejected, 8 missing-evidence, 0 accepted. Both the clean-clone `npm run check:asset-classifications` gate and evidence-bearing `npm run check:asset-classifications:evidence` gate pass. No Blender/structural artifact is mislabeled as player-facing acceptance. |
| 0.4 | P0/P1 truth register | In progress | Focus, station frames, Launch, map state, previews, geography, balance, assets, and performance have owners and reproduction evidence. |
| 0.5 | Safe external candidate control plane | Controller-waived / frozen | SAFE repair-2 passes 88/88 current destructive fixtures and is frozen under the 2026-07-12 controller waiver. Remaining review findings are known P2 control-plane debt; SAFE is not `ACCEPTED`, but no further SAFE cycle runs and it no longer gates supervised game, evidence, or Blender production. Future fully automated acceptance still requires the automatic supervisor and hash-bound integration/review contracts. |
| 0.6 | Gameplay Observatory v1 | Phase A recorder core committed; Phase B/browser pair open | Commit `14bfed98`; `check-observatory-contract`, `check-observatory-passive`, `check-observatory-rates`, `check-observatory-recording-health`, and 5/5 observer tests pass. The recorder remains intentionally in-memory and unwired from registry/main/filesystem/media. Phase B browser integration, the matched browser executions, media, detectors, and natural twenty-minute Helios route remain open. |

## Ordered milestones

| Milestone | Player outcome | Status |
|---|---|---|
| 1 — First Flyby | Deterministic slow-time Focus, authoritative target latch, two-ship camera composition, stronger/mass-aware tether, three readable doctrines, and an unbroken new-game-to-first-dock route. | In implementation — time effects complete; Flyby Focus, tether, camera, doctrine, and focused autopilot checks are green. Camera commits `60637c56` and `f4ea3e03` pass the full `check:camera` suite, and `6235bbc4` removes duplicate B0 action copy. Commit `7b0ad557` captures an autopilot course after avoidance and passes its focused regression. Commit `ae1813c9` bounds interceptor extension so three readable strike cycles complete and makes accepted Hunter hostility mission-owned without bypassing Helios sanctuary; `check:m1:combat-doctrines` passes 23/23. Milestone acceptance remains red because the stable full M1 route still fails the physical Helios approach (best 294.777 WU, final 324.520 WU, no dock prompt). A fresh camera/onboarding capture and the unbroken public route remain required. |
| 2 — Seamless world | Global coordinates, floating origin, streamed live bubble, 24 persistent regions, continuous free-flight/lane/gate travel, one map, and save migration. | Architecture substantially complete; current acceptance RED — commits `eed065ae`, `f4ba6a91`, `a4cc2e8c`, `228ce7b0`, `dc627198`, and `f9dab574` implement the 24-region/global-coordinate foundation. The fresh combined check completed its browser save/Continue route but exited 1 when the Electron Playwright websocket reset. Restore the combined check and required clean-wave record before milestone exit. |
| 3 — First ninety minutes | Three origin chains, physical cargo/build identity, balanced careers/loadouts, truthful previews, focused HUD, readable damage/death. | In implementation — origin choice, first contracts, career ladders, deterministic starter builds, measured career cohorts, and truthful defeat receipts are committed. Commit `62231ecf` keeps all nine 30/60/90-minute career cells and held-out seeds inside their accepted bands. Commit `ae1813c9` moves Rook Nine to the Helios outer yard, preserves station sanctuary, arms only the accepted quarry after sanctuary exit, and completes repeatable interceptor strike cycles. The headed public route now proves natural Rook damage and natural Game Over; accepted evidence is `.devshots/alpha/m3-player-facing-public-route/02-readable-damage.png` and `03-after-action-receipt.png`. The recovery click did not produce a settled `player:respawn`/hidden-screen observation within 30 seconds, so recovery and the complete unassisted route remain open. Truthful engineering previews and broader objective navigation also remain open. |
| 4 — Living-galaxy diversity | Distinct regional ecology, six POI behavior families, deterministic encounter fingerprints, solvable causal contracts, persistent aftermath. | In implementation; current gate RED — six deterministic POI behavior grammars retain stable zone-bound aftermath (`a7021280`). Regional ecology data covers the intended 24-region scope, but the fresh `check:m4:regional-ecology` result is 8/9 on the registry/save initialization-order assertion. Ashline `5ae73146` remains unwired. Accepted art and held-out sparse/normal/crowded routes remain open. |
| 5 — Story/progression/ownership | Embodied B0–B7, five endings plus sandbox, thirteen-ship role lattice, and three visible outpost specializations. | In implementation — physical 47-A progression, consequences, endings, replay, sandbox, and physical outpost identities aligned to live claim specializations landed; commit `f4678c42` and the focused claim/story contracts pass. The 13-role lattice and 20 deterministic loadouts pass `check-ship-role-lattice`. Commits `b64a91e2`, `31a45bb6`, and `dbca66a7` now publish deterministic active-hull role packets and route one visible briefing through the production presentation adapter on New Game, Continue, and real hull switch. Loading-time New Game/Continue packets are retained until the shared playable-flight boundary so their five-second toast is not spent behind the authored-visual gate; the fresh direct `node scripts/check-m5-role-continuity.mjs` run is green across all 13 roles, the three lifecycle seams, and deferred loading-boundary delivery. Public player-route capture and held-out visible ownership acceptance remain open, so the sidecar alone does not complete M5. |
| 6 — Presentation/release | Independently accepted art/audio, browser/Electron parity, accessibility, save/packaging soak, and quality-preserving performance floors. | In implementation — release soak, corrupt-save, packaging, audio, performance instrumentation, and the evidence-bound capture pipeline landed; `8e849a01`, 4/4 capture-contract tests, and the no-browser self-test pass. Commit `4a6b3f56` routes and visually reviews the Wasp through New Game → Shipyard → Undock → save/Continue, but no Wasp asset-classification record exists, so it remains a routed candidate rather than canonically accepted. Store capture is absent. The latest crowded-flight artifact is red at 49.4 ms p95 with 75 hitches; quality-preserving performance, localization, parity, and five-wave release acceptance remain open. |

Do not advance a milestone while its route has an unresolved player-visible P0/P1. Update a status
only alongside its named evidence path and fresh check results.

## Milestone 1 packet status

| ID | Task | Status | Acceptance |
|---|---|---|---|
| 1.0 | New Game action visibility and keyboard route | Complete | Headed and headless browser geometry pass at 1024×768, 1280×720, and 1440×900; `check:new-game-first-run`, `check:new-game-layout:ci`, UI/a11y and UI-perf floors pass; `.devshots/alpha/m1-new-game-layout/evidence.json`; independent spec and quality reviews approved. |
| 1.1 | Sole time-effects owner | Complete | `check:time-effects` passes; pause, modal, save/load, death, hit-stop, and Focus requests share one authority with guarded transition restoration. |
| 1.2 | Exact Flyby Focus targeting and timing | In progress — active targeting owner | Deterministic threat selection, locked target, 50% scale, 1.5–2.5 simulation-second window, exact-target `F`, five cluttered live flybys. Do not overwrite the active lane. |
| 1.3 | Two-ship Focus/tether camera | Implementation checks green; visual acceptance pending | `check:camera` covers the 300-unit exact hostile pair, the authored 0.35-second ease, honest overflow, reduced-motion parity, and post-attach composition. A fresh player-facing before/after pair is still required. |
| 1.4 | Tether strength, operational mass, and spools | In progress — active tether/massline owner | Standard base limits +30%; cargo-aware operational mass and non-stacking 1.0/1.5/3.0/6.0 spools; starter survives normal benchmark seeds. Do not overwrite the active lane. |
| 1.5 | Three readable combat doctrines | Candidate implemented; acceptance pending | `check:m1:combat-doctrines` passes 23/23, including three repeated interceptor strike cycles and an escaping-target counterexample. The Hunter route proves natural damage/death, but held-out public-route counterplay and recovery remain open. |

## P0/P1 truth register

Open means confirmed by a current check or code-path audit but not yet accepted through the player
route. Unreproduced reports remain explicit; they are not silently converted into implementation
work until a live capture distinguishes product failure from harness failure.

| Surface | Severity/status | Current truth and proof |
|---|---|---|
| New Game Launch | Closed | Footer/action rail is visible and keyboard reachable at all three target viewports. Accepted evidence: `.devshots/alpha/m1-new-game-layout/evidence.json`. |
| Flyby Focus | P0 acceptance open; implementation active | The implementation has moved beyond the old 72-unit/1.15-second snapshot. Targeting and tether work are actively owned; do not restate old constants without a fresh live audit. Public-route exact-target, timing, composition, and cluttered-flyby acceptance remains open. |
| Station black frames | Closed as baseline P0; regression retained | The clean browser and Electron public routes physically docked and rendered the same Helios station content for the final 30 consecutive `requestAnimationFrame` observations with a hidden transition overlay and visible enabled Undock action. Both `06-station-hub.png` captures are populated, not black. This closes the transition blackout only; it does **not** accept the station's world-space geometry or materials. Accepted proof: `.devshots/alpha/m0-live-baseline-browser/evidence.json` and `.devshots/alpha/m0-live-baseline-electron/evidence.json`. |
| Autopilot obstacle avoidance | Focused regression closed; M1 route P1 open | Commit `7b0ad557` captures the intended course after avoidance and the focused autopilot regression passes. The stable full M1 browser route still fails to surface the Helios dock prompt: player final `(1602.536,-384.176)`, Helios `(1280,-420)`, best 294.777 WU and final 324.520 WU. Treat this as a product-route failure, not a green docking claim. |
| Hunter opening combat | Natural damage/death accepted; recovery P1 open | Commit `ae1813c9` gives Rook Nine an explicit accepted-writ motive outside sanctuary and prevents an unaccepted Wasp or lawful patrol from inheriting hostility. The public route captured readable natural damage and a source-specific Game Over receipt; recovery did not settle within 30 seconds after the click. |
| Flight information hierarchy | P1 open | Real captures repeat the beacon instruction across the objective, contract banner, tutorial block, target lock, and Kessler message; the dock capture also retains obsolete `Latch it. G.` guidance. Milestone 1 must remove duplication on the golden route; Milestone 3 owns the general one-objective/one-action/one-threat HUD rule. |
| Map authority | Closed | `mapAuthority.openGalaxyMap` now routes keyboard, gamepad, touch, pause, mission-log, station, and generic UI map intents into one `galaxyMap` canvas with local/system/galaxy focus. Legacy local/starmap registrations remain tool fixtures only. `check:m2:map-cutover`, map confidence, inspector stability, mission-log handoff, and sector-geography checks pass. |
| Galaxy-map pointer action | Closed route blocker; broader map P1 remains | The prior visible `Set Waypoint` control detached during inspector refresh and the public pointer click could not arm autopilot (`.devshots/alpha/m0-live-baseline-electron-failure-2026-07-10T13-02-57-794Z/failure-report.json`). `npm run check:galaxy-map-inspector` now proves persistent focus/listener/lifecycle behavior, and both accepted public routes visibly arm the pointer action. This does not close the map hierarchy/cutover defects above. |
| Station information hierarchy | Protected regression surface | The station UI was restored to its last-known-good state by explicit user direction. Do not refactor or “repair” it in the current campaign; retain regression checks and reopen only on a new explicit user request. |
| Engineering previews | P1 open | Several preview paths fabricate simplified fittings/geometry rather than using the runtime asset and loadout. Milestone 3 owns truthful previews after the asset lane is accepted. |
| Sector geography | Closed | The global-coordinate corridor now covers 24 unique authored region origins with reciprocal connected gates, bounded three-region residency, continuous no-teleport membership, and durable dematerialize/rematerialize records. `check:m2b:region-data`, `check:m2b:sector-graph`, `check:m2:continuous-handoff`, and the sector-geography gate pass. |
| Career/economy balance | P1 open; detailed claims unreproduced | The warning-only estimator reports raw DPS outliers and implausible peak income, but it does not prove dominant/dead weapons or sustained thirty-minute career earnings because it omits capital, inventory, travel, costs, market exhaustion, and scenario counterplay. Milestone 3 first owns truthful hard benchmarks, then tuning. |
| Authored asset source contract | Technical recovery closed; visual taste P1 open | Recovery-caused quality defects are repaired and independently approved: the 14-job pipeline contract, strict GLB/finalizer rollback, SG-04, 66/66 runtime parsing, status, and reachability checks pass. `check-parts-manifest` retains 15 classified unrelated residuals. The durable review corpus at `design/production/asset-classifications/*.json` is 3 candidate / 8 rejected / 8 missing-evidence / 0 accepted. The public route proves a detailed runtime Hitch is reachable, but independent taste rejects player-facing graphics acceptance: `03-flight-after-input.png` loses the rear silhouette under white engine glare, while `05-dock-prompt.png` contains unexplained opaque black and bright unshaded geometry. Presentation owns the glare/material repair; wiring is not acceptance. |
| Authored decoder retirement | Fatal abort closed; P1 follow-up | Preview teardown no longer revokes KTX2/DRACO worker URLs while owned loads are pending. Independent spec/quality review approved the task-ownership lifecycle and the accepted browser route contains zero `blob:`, `ERR_ABORTED`, `pageerror`, or `requestfailed` records. One nonfatal multiple-active-KTX2-loader warning remains and must be considered with Electron and memory/performance work. |
| Visual-stability harness | Closed | Default probe owns the canonical in-process server on `127.0.0.1:0`, gates its lifecycle before the full browser probe, reports cleanup failures, and passes while unrelated IPv4/IPv6 port-8123 listeners remain untouched. Accepted supporting evidence: `.devshots/alpha/m0-visual-probe-isolation/evidence.json`. |
| Performance | Descriptive browser/Electron baselines accepted; release floor open | The uninjected browser route recorded 236 samples at 100.1 ms p95 with 20 frames over 32 ms and heap growth from 22.7 MB to 640.2 MB (710.8 MB max). Electron recorded 241 samples at 116.7 ms p95 with 24 frames over 32 ms and heap growth from 36.6 MB to 636.0 MB (645.5 MB max). Capture/automation overhead is included, so no Milestone-6 threshold is claimed. The high heap trajectories and KTX2 warning remain explicit investigation inputs, not waived noise. |

## File leases and repository safety

- Stay on `master`. Preserve the dirty working tree; never reset, stash, clean, restore, or revert
  unrelated work.
- `assets/**`, release outputs/manifests, and `src/render/**` require an explicit coordinated lease.
  Asset locks, build directories, and live Blender/export processes are ownership signals.
- `src/systems/input.js` and the lead-owned flight/HUD paths remain lead-only. Do not edit
  `test/*.expected.json` to obtain a pass.
- Every new file receives `git add -N` immediately so it remains visible without staging contents.
- Subagents do not commit. The user has authorized the controller to curate and push logical,
  ownership-safe chunks on `master`; exclude active lanes, locks, temporary exports, caches,
  terminals, build directories, and iteration-frame floods.
