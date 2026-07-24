# COLLISION RESOLUTIONS — every flag and every collision-table row, resolved

> Companion to `REVIEWER_DECISIONS.md` (the reasoning). This file is the mechanical
> application: for each of the 16 flags in `_PACKET/03_COLLISION_AND_FLAG_MAP.md` §8,
> the resolution; for each row of the §2 collision table, the action taken.
> Actions: **FOLDED** (executes under an existing ID with the SF brief attached),
> **NEW-ID** (recommended new roadmap packet; lead assigns), **ABSORBED** (no separate
> step; merged into another step), **ALREADY_SATISFIED** (no work; prove and move on),
> **DEFERRED** (retained in backlog, post-corridor/post-release).

---

## 1. The 16 flags

| # | Flag | Resolution |
|---|---|---|
| 1 | Three competing depth authorities + SF = four | **Resolved by Q1 fold-in.** One work order (roadmap); depth-program keeps content *scope* for its 26 non-overlapping chunks; atlas keeps map/travel; SF sequence retired as a work order, kept as the brief library. The mapping table below is the artifact that prevents a fifth authority from ever forming. |
| 2 | Wreck Cathedral = depth H1a, TODO | **Author through H1a; SF-20 is the binding brief.** SF-20's prompt body (component roster, proxy counts, anti-placeholder list, task decomposition A→D) is strictly richer than the H1a stub, so H1a executes with SF-20's brief attached. No SF-20 authority exists. Placement: the graveyard pocket of the Ceres Belt recomposition (Q14). |
| 3 | Ship's Ledger screen already exists | **Wire, never rebuild.** Verified at HEAD `3d2dc765`: `src/ui/screens/shipLedger.js` exists with zero production importers. SF-30 executes as depth A2 = "wire the existing screen through the station-shell `ui:*` intent seam + build the fragment/image pipeline." Rebuilding the screen file is a forbidden shortcut. The station-UI ownership constraint (depth A2 was blocked by an active station-UI owner) is honored by routing through `design/STATION_SHELL_CONTRACT.md`'s intent grammar, never a parallel mutation path. |
| 4 | Atlas program inverted the travel plan | **Atlas wins for travel.** SF-26's travel half is `ALREADY_SATISFIED` (atlas D1 owns route follower + Travel Burn; textile journey 10/11). SF-26 narrows to *player-manufactured* infrastructure (Q20). SF-21 folds into the W-family as the physical sibling of W08's Ceres postcard (Q13). No SF step may re-sequence atlas work. |
| 5 | A08 forbids `state.sites` writes | **Binding constraint on SF-24.** SF-24 executes as A07+A09+A11 with the 2026-07-18 design ruling quoted in its brief: no `state.sites` field, no save-schema change outside A09 (live consequences) and A18 (persistence) boundaries. Signature/heat data flows through the PURE A08 kernel + A09 wiring. |
| 6 | Massline ID collision (T01–T18, 3 integrated) | **No rebuild of integrated packets.** T01 (orbit telemetry), T02 (invariants), T03 (target scoring) are INTEGRATED — SF steps consume them. SF-03 first *verifies* T02/T03 cover the user's 3 signals (closeness, turn-direction, cursor-center) and adds only the delta (pre-latch preview + any missing signal weight). SF-04 = T04+T06+T07+T16 under those IDs. SF-05 = T05. SF-27 = T11+T12+T13. SF-28 = T08+T09. |
| 7 | NPC jobs collide with sectorSim + W06 | **Ride, don't bypass.** SF-15 executes as W06's implementation: the job controller is a consumer/producer of `sectorSim.js` day-tick intents and `encounterDirector.js` spawn/materialization, never a parallel scheduler. All credits/rep/cargo via intents (Q23). Offscreen = statistical intents at virtualization boundaries. |
| 8 | Heat single-writer | **Binding constraint on SF-16/SF-24.** Heist and ops-attention consequences emit `faction:*`/aggression events that `heat.js` consumes; nothing else writes `state.player.heat`. The briefs quote this as a forbidden shortcut with a contract test. |
| 9 | Render/asset lease blocked | **Gate, don't force.** Any step touching `src/render/**`, asset manifests, or the admission pipeline first checks `08_GRAPHICS_OVERHAUL_CHECKPOINT.md` + `09_DONOR_VALUE_LEDGER.md` and the live dirty state. A03/A04 (SF-23) stay `BLOCKED_BY_LEASE` until the graphics lane frees the paths; the corrected sequence orders SF-23 *after* the graphics closeout lane lands. SF-31 coordinates all family assets through the checkpoint's admission gate. |
| 10 | Input contract LOCKED | **Specify, never edit.** SF-04/17/27/28/29/32 consume existing `actions.*` fields; new semantics (Space-as-massline and line-control modifier) are specified as a change request through the T16 lead lease. SF-07 is rejected: no pursuit-slot axes, MMB pursuit selection, or automatic station keeping. No build step edits `src/systems/input.js`. |
| 11 | Save schema is an integration mutex | **Request, never stage.** SF-19 (site persistence — `$.sites` row already added `edca7c7e`), SF-30 (ledger pages), SF-25 (claim), SF-35 (release) submit save needs to the lead/integration owner as change requests with schema sketches, never direct adapter edits. |
| 12 | Encounter director exists (1033 lines) but check is RED | **Treat as existing; treat the red as a W06 dependency.** SF-15's brief requires fixing/re-scoping `check:encounter-director` (the measured R1 cause: soak-harness sector-local coords vs global zone anchors + content-catalog selection) as part of W06, because the job controller materializes through that director. Not re-litigated, not ignored. |
| 13 | Camera D7 packet is a dirty concurrent writer | **Coordinate, don't collide.** SF-06's camera speed-language and SF-32's camera work are sequenced *after* the D7 band-3 packet lands or is formally closed by the lead; they specify the *requirements* (velocity zoom-out "regardless," per L1656) against the merged result, not against the dirty tree. If D7 is still dirty when SF-06 is reached, SF-06 implements predictor + release UI and leaves camera hooks behind the documented seam. |
| 14 | Three "foundation" ID spaces | **Naming discipline in all REVIEW artifacts:** roadmap packets are always written with the family letter and two digits (`F18`, `T05`); depth chunks always bare (`H1a`, `A2`); spec3 always prefixed (`SPEC3-F1`). No ambiguity introduced. |
| 15 | POLISH_BRIEFING defects (T2 membrane, T3 heat seam, T5 blind spots) | **Route through IDs, don't re-discover.** T2 (17 physics-membrane violations) → named debt list + F-family repair packet + SF-09's new-path enforcement (Q26). T3 (heat integration seam) → folded into SF-16's brief as a "do not extend the fallback; emit intents" constraint. T5 (zero-doc/zero-test high-fan-in modules) → each build brief that touches one of those modules must add its characterization test as part of its diff. |
| 16 | Handheld is a non-goal | **Recorded.** SF-35's platform closeout adds no handheld gates. Trackpad-first ergonomics (the user's actual input) is the binding constraint instead — see the Trackpad Ergonomic Contract in the build plan. |

---

## 2. The §2 collision table — action per row

| SF-XX | Existing ID(s) | Action | Notes |
|---|---|---|---|
| SF-00 truth reconciliation | program/NOW.md, PLAN_REGISTRY, 02_REMAINING_WORK | **ALREADY_SATISFIED** | The mapping table this review produces was the only missing artifact (Q2). The precheck repair moves to baseline closeout (Q25). |
| SF-01 browser/Electron/graphics/perf baseline | 08_GRAPHICS_OVERHAUL_CHECKPOINT, R12–R13 | **ABSORBED** into Step 0 | The live graphics/perf closeout lane (NOW.md immediate-next) *is* this step. No SF-01 execution; the corridor gates reuse its evidence. |
| SF-02 deterministic physics lab | T01 (INTEGRATED), masslineOrbitTelemetry.js | **KEPT as a new fixture** (recommend F-family or T-family lab packet) | Builds *on* T01's telemetry; does not rebuild it. This is the tuning harness for Q21/Q5. |
| SF-03 intent-aware acquisition | T02/T03 (INTEGRATED) | **FOLDED → T02/T03 delta work** | Verify 3-signal coverage; add pre-latch preview + missing weights (Q6-flag check). No new scorer. |
| SF-04 input grammar | T04+T06+T07+T16 | **FOLDED → T04/T06/T07/T16** | Space binding + tap/hold + reel/pay-out via the T16 input lease (Q7). The ergonomic core of the whole plan. |
| SF-05 orbit assist | T05 | **FOLDED → T05** | The user's #1 ask (L421). Pulled forward into the same wave as T04 (see sequence). Tuning per Q21. |
| SF-06 release predictor / sling / speed language | T07 + atlas D7 (camera) | **FOLDED → T07 extension + D7 coordination** | Predictor + Arm/Snap + a11y release UI (Q8, Q22); camera hooks behind the D7 seam (FLAG 13). |
| SF-07 G-mode replacement | T16 control correction | **REJECTED; NO NEW ID** | Preserve G auto-target/draw-to-fly and independent weapon lead. Never add pursuit-slot/autopursuit behavior or retire the requested control (Q5 user override). |
| SF-08 compound collision + docking | none (foundational gap) | **NEW-ID (recommend F18)** | The keystone primitive. Unblocks SF-17/18/19/20 and honest docking. |
| SF-09 universal weapon impulse | T08 (as the whip's consumer) | **FOLDED → T08 prerequisite layer** | Kernel beneath T08; new-path membrane enforcement (Q26). |
| SF-10 physics-weapon slice (3 weapons) | impulse-charge plumbing exists | **KEPT as its own step** under the combat systems seam | Concussion, vector mine, RCS disruptor + enemy light-tier balance (Q11). |
| SF-11 Mass Seed anchor | none | **NEW-ID (recommend T20)** | Anchor mode only for the slice; Well mode is SF-12's field-kernel consumer. |
| SF-12 continuous field kernel | none | **NEW-ID (recommend T21)** | One primitive → well / repulsor / cone. |
| SF-13 mass-coupling tactics | none | **NEW-ID (recommend T22)** | Shunt / Mark / Sink. Wave-2 (post-corridor) per critical path, unless combo demand pulls it forward. |
| SF-14 planetary sling/skim/reentry | depth W1/W2 + gravity Brief 16 | **FOLDED → depth W1/W2 with SF-14 brief** | The trailer moment. Atlas-record planet contract (Q18). One planet only. |
| SF-15 NPC job controller | W06 + sectorSim + encounterDirector | **FOLDED → W06** | Includes the encounter-director red re-scope (FLAG 12). Miner/hauler/patrol only for the slice. |
| SF-16 mass driver + heist + heat | W03/W04/W05 partially, heat.js, factions.js | **KEPT as its own step** under world-systems, folding W03–W05 doctrines as escort/patrol behaviors | The GTA pillar. Intent-only heat/rep/cargo (FLAG 8). |
| SF-17 interaction descriptors + component targeting | STATION_SHELL_CONTRACT, combat/ui contracts | **KEPT as its own step** (recommend folding under F18's wave) | Descriptor grammar consumed by SF-18/19/20. |
| SF-18 industrial beam + payloads | A12 + ASTEROID_SITES_BRIEF | **FOLDED → A12 extension** | Same primitive as the sites brief; one RMB, contextual verbs. |
| SF-19 World Site kernel | A15 + asteroidSites.js + `$.sites` | **FOLDED → A15 kernel** | Save via mutex (FLAG 11). |
| SF-20 Wreck Cathedral | **depth H1a** | **FOLDED → H1a** (FLAG 2) | Brief attached; Ceres graveyard pocket placement. |
| SF-21 sector recomposition | atlas + W07–W10 | **FOLDED → W-family (Ceres physical recomposition, sibling of W08)** | Coordinates on `galaxyMap.js`/`world.js`/`sectors.js` with the atlas owner (Q13). |
| SF-22 environmental machinery/hazard | none | **NEW-ID (recommend W21), DEFERRED to Wave-2** | One machine + one hazard in the recomposed sector, post-corridor. |
| SF-23 asteroid exteriorization + survey | A03/A04 (BLOCKED_BY_LEASE) | **FOLDED → A03/A04** | Sequenced after the graphics lane frees render paths (FLAG 9). |
| SF-24 ops heat/signature/diagnostics | A07/A09/A11 (+A06/A08 INTEGRATED) | **FOLDED → A07/A09/A11** | A08 ruling binding (FLAG 5). |
| SF-25 transforming claim / outpost | A15 + W17 | **FOLDED → A15/W17** | First stage only for corridor (repair → working depot); full specializations post-M5 per vision. |
| SF-26 manufactured physics/travel infra | atlas D1 (travel half) | **SPLIT: travel = ALREADY_SATISFIED; manufacturing = KEPT, late-P3** | One acceleration ring + one support structure (Q20). |
| SF-27 tractor / frame coupler / elastic whip | T11/T12/T13 (+T06) | **FOLDED → T11/T12/T13** | Wave-2. Frame Coupler resolves the F15 inversion by deferring Meteor Express (Q12). |
| SF-28 monofilament + transverse snare | T08/T09 | **FOLDED → T08/T09** | Wave-2. |
| SF-29 twin bridle (object-to-object) | none | **NEW-ID (recommend T23), Wave-2** | User's object-to-object framing is binding; ship-between-two is a forbidden shortcut. |
| SF-30 Ship's Ledger + image pipeline | **depth A2** + `shipLedger.js` + production media pipeline | **FOLDED → A2** (FLAG 3) | Wire the screen; anti-cartoon image discipline is an acceptance gate, not a prompt hope. |
| SF-31 visual-family pipeline | **depth S1–S4** + graphics-sprints + 08_GRAPHICS_OVERHAUL_CHECKPOINT | **FOLDED → S1–S4 via the checkpoint's admission gate** | All family assets admitted through the existing checkpoint machinery (FLAG 9). |
| SF-32 HUD/VFX/camera/a11y consolidation | R01–R09 + atlas D7 | **FOLDED → R-family + new VFX-language packet (Q16)** | Single VFX owner; merged forbidden-shortcut list; D7 coordination (FLAG 13). |
| SF-33 gold corridor 30/90-min | **G17/G18** | **FOLDED → G17/G18** | Not new work; the integration proof of everything above. |
| SF-34 story/ownership/endings | W12–W20 | **FOLDED → W12–W20** | Post-corridor. |
| SF-35 release closeout | R12–R18 + M6-* | **FOLDED → R12–R18** | No parallel release authority (FLAG 16: no handheld gates). |

---

## 3. Resulting ID-space summary

- **Roadmap packets consumed/upgraded:** T02/T03 (delta), T04, T05, T06, T07, T08,
  T09, T11, T12, T13, T16, A03, A04, A07, A09, A11, A12, A15, W03–W06, W07–W10
  (coordination), W12–W20, G17, G18, R01–R09, R12–R18.
- **Depth chunks absorbed (ID survives, SF brief binds):** H1a, A2, W1, W2, S1–S4.
- **Atlas decisions honored as authority:** D1 (route spine), D2 (4096-WU lattice),
  D7 (camera, dirty-writer coordination).
- **New IDs recommended (lead assigns):** F18 (compound collision), T20 (Mass Seed),
  T21 (field kernel), T22 (mass coupling),
  T23 (twin bridle), W21 (environmental machinery), + a dedicated R-family VFX-
  language packet (Q16).
- **Retired as work-order, retained as brief library:** the SF-00…SF-35 sequence.
- **Depth chunks retained as FUTURE content scope (untouched by this plan):** A1,
  A3–A5, B1–B20, C2–C15, D1–D12, E1–E8, F1–F15, G1–G15, H1b–H1h, L1, PR1, PR2,
  ADD-1, ADD-3, and the already-checkpointed IP-CP set pending HEAD re-verification
  (Q24).
