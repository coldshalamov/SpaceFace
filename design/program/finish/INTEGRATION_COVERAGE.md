# Whole-game integration coverage

Owner request, 2026-10-29: finish the whole game autonomously, preserve its intended UX, replace
broken implementations and obsolete agent assumptions, consolidate navigation, and integrate the
other agents' landings. This is the integration record for that request; the three lane boards
remain the detailed work lists. An inventory, audit report or passing fixture does not close a
player experience.

## Coverage and remaining work

| Area | Current examination | Required closure |
|---|---|---|
| Boot, loading, renderer, graphics recovery | Existing Lane 1 audit reused; reproduced two readiness/recovery defects and executable syntax diagnostics | Finish Lane 1 packets and findings; successful launch, context recovery, representative visual inspection, measured frame/load budgets |
| Flight, physics, AI, combat, weapons | Production V3/tactical/Rapier ownership checked; Lane 2 audit findings being repaired | Finish Lane 2 review and stress work; ordinary inputs, death/retry, damage/kill/reward chains and all affected modes |
| Swarm / Crucible | Run lifecycle and Circuit integration examined; full attached report extracted; headed gate started | Resolve core report gaps, complete the Foundry build/fight/repair loop, prove both population objectives and progression on the default route |
| Adventure, world, missions, economy, careers, story | Registry/route inventory started; existing Lane 3 audit is the source for further repairs | Review actual implementations and connections, including first dock/trade/mission, travel, persistent consequences and recovery |
| Fleet / automation | Confirmed wingman death payload did not match automation's damage consumer | Behavior fixture covers death and one loss receipt; preserve healthy ships across travel; remaining automation review stays on Lane 3 |
| UI, controls, accessibility, localization | Concurrent UI/units changes protected; navigation consolidation in progress | Exercise screens and controls at desktop/mobile sizes, remapping, reduced motion/flash, missing strings, cross-mode leakage |
| Audio and presentation | Repaired exact-audio relevance for runtime-pinned bodies and partial active sets | Review cues and voices through their real consumers; mix/readability and pooled lifetime work remains |
| Saves / resume / new game | Concurrent save changes protected; save-schema baseline passed | Review landed save changes; slot isolation, mid-run policies, reload, malformed imports and repeat initialization |
| Assets / units / dormant systems | Player-truth environment matched 8,654 asset blobs to HEAD before its run | Review useful assets through runtime maps, visible use and residency; integrate unused useful systems rather than assume presence means reachability |
| Build, packaging, browser / Electron | One Electron runtime-witness attempt timed out before flight | Repair/recheck launch; retail build and browser/Electron routes, applicable mobile routes and clean process teardown |
| Documents / policy | Finish routing conflicts identified; full PDF core and technical appendices read | Consolidate active entry points; retain owner UX/technical constraints; remove superseded agent process claims |
| Final build-map and recent commits | Pending, deliberately after other agents land and production gaps close | Read remaining build-map work; review the last 300 commits in coherent system groups and repair material misses |

The live system inventory is `src/runtime/authoritativeSystemManifest.js`; module ownership is in
`docs/MODULE_MAP.md`. Existing lane audit manifests enumerate the source chunks already assigned.
Reuse completed findings and do not start parallel reviews of chunks still being examined.

## Verified repair batch

Graphics/boot/audio repairs below were published in `90731639f61`. The Adventure lifecycle batch
has passed its focused checks and the default route's core gameplay checks; its route verdict is
INCOMPLETE for the explicitly unmeasured items below. Other gameplay batches remain pending.

Additional published batches: `d23c3aac5c8` preserves a live authored-asset consumer when a joined
consumer cancels, and bounds background work when the browser scheduler throws or rejects;
`8e2fedc8e01` repairs two tests that observed unrelated work instead of their named scenario;
`2df8bb0d53c` fingerprints the materialized runtime backends and resolves remounted UI controls by
semantic identity. Ambiguous or missing controls remain untried. Focused checks passed for each
batch; these are not whole-game acceptance claims.

- A second renderer joining graphics refill stayed hidden forever. Reproduced with two renderers;
  all waiters now leave the orientation hold. Package-detach and orientation tests: 15 passed.
- A hidden retired fallback falsely made a resident hull unready; alternate quality geometries
  were omitted from the same readiness query. The consult now matches admission eligibility and
  checks swappable geometries. Geometry-residency tests: 27 passed.
- Startup syntax diagnosis imported healthy candidate code and could execute it. A deliberately
  unresolved static dependency now prevents candidate evaluation while preserving syntax errors.
  Startup-failure diagnostics tests: 10 passed.
- Wingman death used `dmg` while automation reads `damage`, leaving a dead ship in the fleet
  ledger. The producer now uses the canonical field. Lifecycle tests: 2 passed.
- Choir runner-state normalization could permanently reserve a berth for a fractional or
  nonexistent identity. Discrete identities and loss masks now normalize without inventing
  service or assigning a nonexistent ordinal to another runner. Continuity tests: 21 passed.
- Docking cached manifests by entity id, losing replacement/revision truth; its proxy templates
  also ignored berth resizing. The resolver's identity cache now owns manifests, while geometry
  templates follow entity objects and their inputs. Lifecycle/latch/cradle/arrival checks: 13 passed.
- A station object used its transient entity id instead of its persistent berth id for refusal
  lookup, so guidance could miss an existing grudge. Object/string/catalog references now agree.
  Docking and Latch checks: 22 passed, including the corrected production-shaped restore fixture.
- Audio residency ignored `activity.pinnedExact` and treated a partial active-set miss as a final
  denial. Exact relevant voices now survive those cases. Focused pin tests: 2 passed.

## Integration observations

- Baseline attempt: 10 of 17 checks passed; 7 timed out under heavy concurrent host load. No
  passing whole-baseline claim. Do not increase deadlines or discard checks to turn this green.
- Runtime witness attempt: Electron page load exceeded 180 seconds; no flight samples, so launch
  and gameplay remain unverified. See `.devshots/runtime-witness/report.md` for that attempt.
- Headed Swarm gate: both idle and active passes FAILED before the main menu. No gameplay frames
  were observed. Active pass recorded harness-process freezes of 122 and 39 seconds; idle pass
  ended with 909 MiB free memory. Screenshot remained at the 18.1% opening boot stage. This does
  not distinguish stalled startup from host scheduling pressure; do not claim either is fixed.
- Subsequent headed Swarm batch reached the complete public route and active flight on the Intel
  GPU in both passes. Player models, realm isolation, input response, edge markers, VFX coverage
  and visibility checks passed. The batch still FAILS: fourteen passive bodies moved without
  explained provenance at spawn, and the active actor did not clear wave 1 before its eight-minute
  wall cap. Launch took approximately four minutes. Active-play frame time was p50 331 ms and
  p99 1,824 ms on this contended host; this is a serious observed usability problem, not certified
  quiet-host performance. Artifacts: `.devshots/finish/integration-2026-10-29/player-truth-swarm-current/`.
- That batch exposed two check defects, distinct from production defects: the idle yaw probe
  completed a full revolution and was misgraded by endpoint-only comparison; a self-destructing
  nonhostile wreck was counted as an enemy death. Corrections are being checked against the saved
  trace and regression fixtures. They do not close the remaining spawn or wave failures.
- Current Adventure batch reached public Launch and flew 228.5 simulated seconds. No FAIL:
  route, spawn motion, input control, tumble, player rendering, LOD, visibility, VFX/backdrop
  coverage and uninterrupted HUD checks passed. Verdict INCOMPLETE because no suitable encounter
  supplied readability/edge-marker samples and this contended host cannot establish quiet-host
  frame performance. Observed frame time p50 41 ms, p99 285 ms; do not call this release performance.
  Artifacts: `.devshots/finish/integration-2026-10-29/player-truth-adventure-current/`.
- Scheduler memoization and scratch actor retention are bounded in `ba23b684f1b`; scheduling
  phases remain stable through owner churn. Focused scheduler checks: 10 passed. No speed claim.
- Source coverage has continued through asteroid formations/sites, Ceres/Choir/Cinder,
  contract/custody, mission recap/situation composition, and faction presence/occupation/spawn
  budget packets. The Choir malformed-save berth deadlock is fixed and published; formation invalidation after removal
  is reviewed and pending publication. Per-packet boundaries are under the ignored integration folder;
  unexamined dependencies remain open.
- Existing source review inventories currently enumerate 2,756 JS/TS source files. Lane 1 has
  112 reports for 135 assigned chunks and Lane 3 has 154 for 303 chunks. A report is an input to
  triage, not an approval. Local snapshot: `.devshots/finish/integration-2026-10-29/coverage-inventory.json`.
- Concurrent Git synchronization briefly removed dirty/new files, including `src/ui/units.js`,
  while an autostash was active. They returned after the merge. A missing module observed during
  that interval is not a new source deletion; recheck a dependent failed test on the stable tree.
- Keep finished repairs in exact-path commits and publish them; preserve other agents' staged and
  unstaged work. Never use a broad stash/reset to make integration convenient.

## Attached design report

`SpaceFace_Swarm_Renaissance_Extended_Design_Bible.pdf` (171 pages, 2026-10-28) is requested design
input. Its core is Parts I–X; its catalogs explicitly form an optional design bank. Full extraction
is under `.devshots/finish/integration-2026-10-29/docs/`. The implementation gap map belongs beside
this record as `SWARM_RENAISSANCE_GAPS.md`. Preserve existing owners for movement, physics, damage,
wallet and run phase. Fortify, maneuver and stealth work must compose those owners rather than
create parallel writers. Do not treat a one-device prototype as the PDF's complete Fortify pilot.

## Current integration checkpoint

- The latest headed Swarm batch reaches round 3. No core gameplay FAIL: idle spawn motion and
  hostile-death/reward checks pass; active controls, wave resolution and transitions pass. Verdict
  remains INCOMPLETE for LOD/readability/performance samples. The native force observer now confirms
  actual authored arena-well delivery before input rather than exempting unexplained motion.
  Artifacts: `.devshots/finish/integration-2026-10-29/player-truth-swarm-fixed/`.
- An uninstrumented active Swarm CPU profile advanced 1.78 to 9.55 sim seconds with 10 tagged
  wave-one ships/drones, Intel D3D11, render scale 1. Whole-machine CPU busy was 82%; the 8-second
  target occupied 11.93 seconds including profiler handoff. Native layout reads (1.02 s) and
  material texture serialization (339 ms) are measured contributors; 58.5% unattributed program
  time prevents a claim about the dominant total delay. No performance bar is closed by this run.
  Artifacts: `.devshots/crucible-cpu-profile/swarm_bare_active_20261029/`.
- Consolidated agent operations, lessons and validation guidance into their existing entry points.
  Removed duplicated Git/review rules, obsolete implementation exemptions and contradictory quality
  rules. Current batch checks and failure gates remain; source fixtures do not certify full play.
- Continued source coverage found an optional Rapier observer counting radius-ball overlaps instead
  of actual craft contacts. Its candidate uses deduplicated native narrow-phase body pairs. Frozen
  browser/worker/headless paths now share the same law/dock/save/input keepalive contract.
- Fortify implementation is underway through existing run-wallet, phase, physics and damage owners.
  The full four-device/two-wave/repair/siege pilot, hero maneuvers, optional stealth mission, remaining
  source coverage, final build-map pass and last-300-commit review are still unfinished.
