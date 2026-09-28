# SpaceFace source audit — where stronger creative direction is most useful

## Main judgment

**The strongest opportunity is not to add another list of systems. It is to make existing systems form convincing, controllable causal chains on the normal player route.** That is my design judgment from the inspected source and current program, not a claim from a full playtest. The repository already encodes the distinction between strong invention and a specific execution pass in [the build map](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/build_map.md#L23-L38) and [INFERENCE](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/program/INFERENCE_LANES.md#L72-L105).

The planbank therefore mixes conditional repairs, deeper behavior and complete integrated scenes. It does not assume all 300 ideas are missing. The [provenance](SOURCE_PROVENANCE.md) separates code observations, repository reports, local checks and design proposals.

## 1. A yard crusher is represented by a private pursuit radius

**Observed in source:** the selected tow-out encounter creates a private mouth point ahead of a hauler, advances that point toward the hauler, and resolves `crushed` by distance or deadline while scheduling despawn. The inspected script does not establish a real machinery-contact outcome. A targeted search for the encounter's mouth/signal state in render, systems and UI found no direct consumer in those searched paths; that is narrower than proving no generic rendering route could exist. [Source](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/encounters/346-yard-towout.js#L35-L105).

**Why it matters:** the game promises physical tools and usable machinery. A moving private hazard point can produce a superficially complete rescue without a machine the player can understand, obstruct or exploit. This is a stronger candidate than another mission-board row.

**Chosen improvement:** [SF-136 — Put a real crusher into the yard tow-out](plans/10-missions/SF-136-put-a-real-crusher-into-the-yard-tow-out.md). Bind the mission to a real site/machine phase and contact law; let tow, shutdown and interception be physical alternatives. A deadline may withdraw an offer or change a work phase, but must not assert a crush that never happened. [Detailed implementation](deep-dives/01-yard-crusher.md).

## 2. The Ceres work chain reportedly fails before its advertised payoff

**Reported, not reproduced here:** D89 says the authored hauler never reaches the approach carrying mined cargo in the scenario window. The ledger explicitly eliminates ambientPredation as the cause for the designated actor because its eligibility gate excludes that authored slot. [Ledger](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/program/DEMO_READINESS_2026-09-20.md#L240-L240) · [traffic owner](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js).

**Why it matters:** convincing economic life requires a mined lot to become a transfer, then a loaded ship, then a sink. Downstream aftermath/evidence assertions cannot compensate for a missing upstream workday.

**Chosen improvement:** [SF-076 — Restore the real Ceres miner-to-hauler cycle](plans/06-jobs/SF-076-restore-the-real-ceres-miner-to-hauler-cycle.md). Trace the first broken real stage and preserve quantity through the existing custody owner. Do not spawn a loaded hauler, extend a timeout blindly, or change pirate behavior already excluded by the evidence. [Detailed implementation](deep-dives/02-ceres-custody.md).

## 3. Hauling's remaining problem is described as economic structure, not arithmetic

**Reported:** D80 records an executable-quantity correction already made, then reports low remaining returns, thin initial lanes, toll-heavy cycles and long market-exhaustion idle time. Those are historical source measurements, not results measured here. [Ledger](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/program/DEMO_READINESS_2026-09-20.md#L236-L236).

**Why it matters:** a nominal career choice is thin if competent ordinary play cannot sustain its useful loop. Conversely, a benchmark is not authority to silently change income targets or ignore route costs.

**Chosen improvement:** [SF-106 — Make competent hauling viable through real terms](plans/08-economy/SF-106-make-competent-hauling-viable-through-real-terms.md). Compare real executable trips, full costs, supply replenishment and legitimate contract stacking. Change the demonstrated structural constraint, then prove the actual route. Do not reward a model-only strategy unavailable to the player. [Detailed implementation](deep-dives/03-hauling-economy.md).

## 4. Renderer work needs the exact critical path, not another 'optimize' pass

**Reported:** D38 narrows a remaining path to direct/instance-pool program twins and records a concurrency experiment that did not solve the visible wait. D61 describes asynchronous readiness records becoming obsolete before publication; rightful supersession and loss of a still-current candidate must be distinguished. [Ledger context](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/program/DEMO_READINESS_2026-09-20.md#L223-L235) · [material key](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/materialBatchKey.js) · [publisher](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/presentationPublisher.js).

**Chosen improvements:** [SF-256 — Remove needless direct-versus-instanced shader twins](plans/18-performance/SF-256-remove-needless-direct-versus-instanced-shader-twins.md) and [SF-257 — Publish authored sector assets only for their current generation](plans/18-performance/SF-257-publish-authored-sector-assets-only-for-their-current-generation.md). Use one eligible actual draw contract where it removes a needless twin; preserve current-generation publication and authored readiness. These require strong seam adjudication, not a weak agent inventing a scheduler. [Shader specification](deep-dives/04-shader-twins.md) · [generation specification](deep-dives/05-generation-publication.md).

A third report, D36, describes timers and frame callbacks stalling together. An in-page watchdog cannot run while its execution is starved; [SF-258 — Resolve main-thread starvation rather than inflating the Works watchdog](plans/18-performance/SF-258-resolve-main-thread-starvation-rather-than-inflating-the-works-watchdog.md) requires external attribution and a real production fix if the cause is owned. It is not permission to inflate timeout values.

## 5. A source map can lead a weaker agent to the wrong screen

**Observed:** the inspected module map includes old screen-path guidance, while the source snapshot's current Market and Shipworks implementations are under `src/ui/station/screens/`. The planbank validates existing paths rather than copying old paths into every task. [Module map](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/docs/MODULE_MAP.md) · [current Market](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/market.js) · [current Shipworks](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/shipworks.js).

**Chosen improvement:** supply current source seams and functional transaction/focus requirements. SF-241–SF-255 preserve [ORRERY](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/frontend/ORRERY.md); they do not restart UI design. The most useful change is a decision that remains truthful through stale data, refusal and return—not another attractive isolated panel.

## 6. A stale defect report should not become a new patch

**Direct check:** D86 describes a syntax failure in selectionSigil. In the pinned packet, `node --check src/render/selectionSigil.js` passed. The separate functional test could not load without `three`, so visual correctness remains unproven. Two focused custody/field-lifecycle suites passed 12 assertions. [Source report](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/program/DEMO_READINESS_2026-09-20.md#L240-L240) · [check evidence](evidence/focused-passing-tests.tap).

**Implication:** reported status, parsed code and live experience are different evidence levels. Every packet includes an equivalent-feature or fresh-reproduction gate. 'Already satisfied' is a legitimate result; changing a working file to satisfy an old description is not progress.

## 7. There is substantial existing machinery to reuse

The inspected source includes [dynamic G-stick](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/dynamicFlightStick.js), [drift bombs](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/bombs.js), [field laws](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/fields/fieldKernel.js), [NPC jobs](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js), [custody](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js), [aftermath](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/aftermathWrecks.js) and [Swarm drafting](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/survivalDraft.js). Their existence does not prove their final quality, but it changes the right task from 'add the system' to 'complete its distinctive use, counterexample and consequence.'

The existing [alien-ecology program](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/alien-ecology-program/00_CANON_SYNTHESIS.md) also already resolves important canon. SF-181–SF-195 build on that bounded direction instead of introducing another unrelated organism, omniscient hive or global infection manager.

## Creative judgment: the most promising connective tissue

My chosen directions are: useful wrecks that carry the consequence of combat; workers whose resumed labor proves a rescue mattered; build tradeoffs demonstrated in different physical jobs; law embodied in crossing geometry and recoverable custody; discoveries that improve a decision rather than only pay for text; and scenes that grow quieter because the player actually created safety. SF-286–SF-300 turn these into concrete integration packets.

These are design proposals. Their success must be judged in the played sequence, not inferred from source size, the number of passing checks or the length of this planbank.

## What this audit does not establish

It does not establish current art quality, audio quality, overall fun, actual device frame rates, completeness of all 11,623 selected files, or fresh reproduction of the historical ledger. No full media/game route was available. It does establish a detailed source-grounded starting bank, verified file seams, several concrete mechanisms worth examining and a way to avoid handing vague invention to weaker agents.
