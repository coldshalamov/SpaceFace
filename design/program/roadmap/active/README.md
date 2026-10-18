# Active Roadmap Queue

<!-- LIFETIME: ACTIVE_PACKET -->

This is the admitted queue. It is sorted by packet number. Packet files live in this directory
while active. When a packet is fully integrated and has all its terminal receipts, it moves to
`../retired/`.

Packet creation rules, lifecycle states, gate rules, and execution protocol live in
[`00_EXECUTION_PROTOCOL.md`](../00_EXECUTION_PROTOCOL.md).

## Quick index

| Packet | One-line outcome | Current status |
|---|---|---|
| [`PQ-019.md`](../retired/PQ-019.md) | RETIRED 2026-09-13 — the contract board reads as an institution | — |
| [`PQ-020.md`](../retired/PQ-020.md) | RETIRED 2026-09-14 — Ceres topology is integrated with its Cathedral-keyed route, presence review, and matched performance | — |
| [`PQ-022.md`](./PQ-022.md) | run asset/family leaf packets through source→release→route→perf | exact leaf selected from the queue |
| [`PQ-023.md`](./PQ-023.md) | finish the broader physics-readable presentation umbrella through exact leaves | Gold Corridor-required cue subslice accepted at `93c76f65`; broader propulsion/environment/HUD/camera/dense-scene work remains TODO |
| [`PQ-024.md`](../retired/PQ-024.md) | RETIRED 2026-09-23 — the survey/claim lifecycle is integrated at `07d2ba53` with the route_accepted exterior relay blob bound | — |
| [`PQ-025.md`](./PQ-025.md) | observational held-out qualification, not a feature branch | PQ-019–024 exact integrated receipts and frozen owner evidence map |
| [`PQ-035.md`](../retired/PQ-035.md) | foreground/background lifecycle correctness | route-accepted, released, and retired at `f3046007`; physical host/package boundary assigned to PQ-041 |
| [`PQ-036.md`](../retired/PQ-036.md) | main-thread simulation/presentation ownership plus journals | route-accepted, released, and retired at `391e8658` from retained source-paired PERF-00 evidence plus current lifecycle authority |
| [`PQ-037.md`](../retired/PQ-037.md) | compile deterministic render packages outside gameplay | integrated, released, and retired at its exact production/acceptance boundary |
| [`PQ-040.md`](./PQ-040.md) | upload only changed GPU attribute/matrix component ranges | focused implementation on master; native GPU acceptance remains |
| [`PQ-041.md`](./PQ-041.md) | supported Electron 43.2 runtime | focused implementation on master; H1 harness repair plus exact-package/native acceptance remain |
| [`PQ-042.md`](./PQ-042.md) | select one GPU correction—or no GPU change—from valid pass evidence | PQ-034–041 accepted; clean trace selects A/B/C/D |
| [`PQ-045.md`](./PQ-045.md) | finish the R5 Ceres lived-world slice through exact dependency leaves | target motion integrated; tender client, topology, causal/NPC/art/VFX work, five-minute evidence, and human verdict; bounded late audit is independent |
| [`PQ-046.md`](../retired/PQ-046.md) | land five coherent high-leverage vision unlocks through inference expansion, cold review, and ordinary-route proof | integrated and retired through five leaf receipts and ordinary-route default pass (`test/infer-pq046-ordinary-route.test.mjs`) |
| [`PQ-048.md`](../retired/PQ-048.md) | deliver twenty new inference-to-convergence player outcome packages in four composed tranches | integrated and retired through 20 exact leaf receipts and four composed tranches at focused-green scope; ordinary headed portfolio route remains unproven |
| [`PQ-049.md`](./PQ-049.md) | build and accept a distinct civic Massline express-liner through DCC, release, render-package, runtime-map, and natural-route leaves | new express-only identity; first DCC candidate leaf is ready, later leaves are dependency-gated; parent remains unproven |
| [`PQ-050.md`](../retired/PQ-050.md) | remaster every live flyable ship except Hitch, one ship per leaf, under the MTX technique contract | integrated and retired 2026-10-03: all 22 leaves judged KEEP at the shipping camera; receipt `receipts/PQ-050-ACCEPT-REPORT.md`; Hitch untouched |
| [`PQ-129.md`](./PQ-129.md) | name every hitch on the live path, then remove compose/compile/upload/admission bricks without quality cuts | `--id PQ-129`; Wave A measure; Wave B ready after the classifier; Wave C planned |
| [`PQ-130.md`](./PQ-130.md) | put the player inside the asteroid; HUD is ugly and too big | `--id PQ-130`; theater/dashboard first; vanilla CSS shrink is a fail |
| [`PQ-191.md`](../retired/PQ-191.md) | RETIRED 2026-09-10 — standing review ceremony removed by owner direction; play-and-fix happens on request, inside the asking unit | — |
| [`PQ-193.md`](./PQ-193.md) | the 3D picture never looks broken: complete bodies, opening flyby, tubes, shelf hulls, places | `--id PQ-193`; first ready leaf `.00`; flyable remaster stays PQ-050; Hitch frozen |

PQ-043 and PQ-044 are admitted queue identities but remain deferred and packet-less until their
conditional triggers are proved.

PQ-046 retired through five exact leaf receipts at four production commits. Its five shipped vision unlocks are proven on the ordinary route without developer console (verified by `test/infer-pq046-ordinary-route.test.mjs`); the unclaimed ordinary-route acceptance note is retired.

PQ-048 retired through twenty exact leaf receipts and a final composition receipt. Its parent is
`integrated` / `focused_green`; no ordinary headed Browser/Electron portfolio route was run, so
`route_accepted` and `milestone_accepted` remain unclaimed.

PQ-049 is active for the formerly retained `GFX-MASSLINE-EXPRESS-LINER` outcome. Its parent is
`ready` / `unproven`; only `PQ-049.01` is dispatchable, with source/release, render-package,
runtime-map, and natural-route leaves waiting on its disposition.

PQ-129 is active for the frame-budget engine. Its parent is `ready` / `unproven`; only `PQ-129.01`
is dispatchable. Its initial trace must not commit code; it classifies hitches at 120 Hz and
produces the Wave B queue.

PQ-130 is active for the dashboard/theater pass. Its parent is `ready` / `unproven`; only
`PQ-130.01` is dispatchable. It builds the inside-the-asteroid canopy, theater lighting, and
shrink HUD without vanilla CSS shortcuts.

PQ-193 is active for the visual-integrity program. Its parent is `ready` / `unproven`; only
`PQ-193.00` is dispatchable. It freezes the non-flyable visual baseline so later leaves can
repair broken bodies, shelf hulls, opening flybys, and tubes without regressions.
