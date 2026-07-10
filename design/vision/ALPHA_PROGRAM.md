# SpaceFace Full Solo Alpha — execution ledger

**Status:** Active · **authority:** current product-sprint execution authority beneath
`ARCHITECTURE.md`, `design/GDD_2_0.md`, and `design/spec2/00_MASTER_TASTE.md`.
Those documents still own technical, design, and taste law. This ledger owns alpha scope,
order, evidence, and acceptance. Live player proof outranks synthetic checks and status prose.

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
- Top-50 art continues in parallel, but independent in-game acceptance is required before any
  asset is promoted as player-facing truth.

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
- Transcripts, self-scores, iteration counts, and file existence are not evidence.

## Current Milestone 0 status

- Task 0.1 established this ledger and strict evidence validator. Independent spec and quality
  reviews approved it. Supporting contract evidence is
  `.devshots/alpha/m0-alpha-evidence/evidence.json`.
- The authored-runtime recovery is back under a scoped asset lock after independent spec review
  rejected source-provenance, part-budget, and engine-validation regressions. Its valid LOD/socket
  work remains candidate material until the repaired source and release gates are re-reviewed.
- A clean post-publisher browser/Electron baseline and independent Top-50 reacceptance are still due.

| ID | Task | Status | Acceptance |
|---|---|---|---|
| 0.1 | Authoritative ledger + alpha evidence contract | Complete | `npm run check:alpha:evidence:contract` and `npm run check:alpha:evidence`; supporting record present; independent spec and quality reviews approved. |
| 0.2 | Post-publisher live baseline | Queued | Reproducible browser/Electron evidence; current checks, viewport, runtime, GPU, and worktree recorded. |
| 0.3 | Reclassify current graphics | Queued | Each output marked accepted/candidate/rejected from live game captures; Blender shots labeled honestly. |
| 0.4 | P0/P1 truth register | In progress | Focus, station frames, Launch, map state, previews, geography, balance, assets, and performance have owners and reproduction evidence. |

## Ordered milestones

| Milestone | Player outcome | Status |
|---|---|---|
| 1 — First Flyby | Deterministic slow-time Focus, authoritative target latch, two-ship camera composition, stronger/mass-aware tether, three readable doctrines, and an unbroken new-game-to-first-dock route. | Queued after M0 |
| 2 — Seamless world | Global coordinates, floating origin, streamed live bubble, 24 persistent regions, continuous free-flight/lane/gate travel, one map, and save migration. | Queued |
| 3 — First ninety minutes | Three origin chains, physical cargo/build identity, balanced careers/loadouts, truthful previews, focused HUD, readable damage/death. | Queued |
| 4 — Living-galaxy diversity | Distinct regional ecology, six POI behavior families, deterministic encounter fingerprints, solvable causal contracts, persistent aftermath. | Queued |
| 5 — Story/progression/ownership | Embodied B0–B7, five endings plus sandbox, thirteen-ship role lattice, and three visible outpost specializations. | Queued |
| 6 — Presentation/release | Independently accepted art/audio, browser/Electron parity, accessibility, save/packaging soak, and quality-preserving performance floors. | Queued |

Do not advance a milestone while its route has an unresolved player-visible P0/P1. Update a status
only alongside its named evidence path and fresh check results.

## Accepted and queued Milestone 1 packets

| ID | Task | Status | Acceptance |
|---|---|---|---|
| 1.0 | New Game action visibility and keyboard route | Complete | Headed and headless browser geometry pass at 1024×768, 1280×720, and 1440×900; `check:new-game-first-run`, `check:new-game-layout:ci`, UI/a11y and UI-perf floors pass; `.devshots/alpha/m1-new-game-layout/evidence.json`; independent spec and quality reviews approved. |
| 1.1 | Sole time-effects owner | Queued after M0 | Minimum active request wins; pause, modal, save/load, death, hit-stop, and Focus cannot restore over one another; transient requests reset on new/load. |
| 1.2 | Exact Flyby Focus targeting and timing | Queued | Deterministic threat selection, locked target, 50% scale, 1.5–2.5 simulation-second window, exact-target `F`, five cluttered live flybys. |
| 1.3 | Two-ship Focus/tether camera | Queued | Both ships remain within 10% margins, zoom 58–180, 0.35-second composition ease, reduced-motion parity, post-attach composition. |
| 1.4 | Tether strength, operational mass, and spools | Queued | Standard base limits +30%; cargo-aware operational mass and non-stacking 1.0/1.5/3.0/6.0 spools; starter survives normal benchmark seeds. |
| 1.5 | Three readable combat doctrines | Queued | Interceptor/flyby, tether-control raider, and ranged disengager differ in approach, position, target priority, disengagement, and counterplay. |

## P0/P1 truth register

Open means confirmed by a current check or code-path audit but not yet accepted through the player
route. Unreproduced reports remain explicit; they are not silently converted into implementation
work until a live capture distinguishes product failure from harness failure.

| Surface | Severity/status | Current truth and proof |
|---|---|---|
| New Game Launch | Closed | Footer/action rail is visible and keyboard reachable at all three target viewports. Accepted evidence: `.devshots/alpha/m1-new-game-layout/evidence.json`. |
| Flyby Focus | P0 open | Live system still uses the old 72-unit threshold and 1.15-second window, does not own time scale or player target, and allows ordinary latch selection to compete with the Focus target. Task 1.1–1.3 owns it. |
| Station black frames | Unreproduced P0 report | Synthetic station checks have not reproduced a product blackout. Requires the clean post-asset headed route before any station/render edit. |
| Map authority | P1 open | Legacy local/starmap surfaces and the newer galaxy map coexist; one public map route has not yet replaced all callers. Milestone 2 owns the cutover. |
| Engineering previews | P1 open | Several preview paths fabricate simplified fittings/geometry rather than using the runtime asset and loadout. Milestone 3 owns truthful previews after the asset lane is accepted. |
| Sector geography | P1 open | The current sector-geography gate is red on `poi_helios_yard`; continuous global-region geography has not been implemented. Milestone 2 owns it. |
| Career/economy balance | P1 open | `check:balance` is warning-only: plasma/siege dominate, railgun/torpedo are dead choices, and sustained activity income is not comparable. Milestone 3 owns hard career-parity benchmarks. |
| Authored asset source contract | P1 open | `check-parts-manifest` is red (`2628 ok, 81 fail`); independent review identified recovery-caused provenance/texture rewrites, a miner budget bypass, and weakened engine validation. The asset author is repairing under re-review. |
| Visual-stability harness | P1 control-plane blocker | Default probe can select port 8123 despite an unrelated IPv6 Dota listener, then accept the wrong HTTP page and time out before `window.SF`. An explicit fresh SpaceFace URL passes 360 frames. Task 0.2 must isolate the server before baseline capture. |
| Performance | Baseline pending | No post-publisher browser/Electron p95 baseline is accepted yet. Quality may not be reduced to obtain one. |

## File leases and repository safety

- Stay on `master`. Preserve the dirty working tree; never reset, stash, clean, restore, or revert
  unrelated work.
- `assets/**`, release outputs/manifests, and `src/render/**` require an explicit coordinated lease.
  Asset locks, build directories, and live Blender/export processes are ownership signals.
- `src/systems/input.js` and the lead-owned flight/HUD paths remain lead-only. Do not edit
  `test/*.expected.json` to obtain a pass.
- Every new file receives `git add -N` immediately so it remains visible without staging contents.
- Subagents do not commit. No one commits, pushes, branches, or opens a PR without explicit user
  authorization. If later authorized, curate one accepted-task commit and exclude locks, temporary
  exports, caches, terminals, build directories, and iteration-frame floods.
