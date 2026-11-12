# Foundry: read the Breaker Yard links

Parent: `2425ad5ded2c20f78eea278fed202c02af7fb9f2`, PR #942. Draft source integration, not earned-gameplay or visual acceptance.

## Creative direction

After the third extraction offer, round 31 remains a generated transition. Preserve the existing Breaker Yard at 32–34: it already has three connected questions. A guard and its ward teach target choice in the active furnace; the Jackal and Bruiser teach crossing a mine lane under a committed hull; two linked pairs then demand a kill order while the lane closes. Their identity was obscured when the generic pack arrived before any specialist.

The new Foundry entries delay only ordinary ship/Brood pressure. They retain original specialist offsets (32:270/270 ticks; 33:300/300; 34:300/300 then360/360), bearings, distance, finite packages, rooms and the three-gun cap at34. No debut, extra boss, new asset or bonus population. The actual minor forecast at32 waits until1080 active-pilot ticks. Rounds33/34 have no scheduled forecast and do not invent one. Ordinary pressure begins at1080/1140/1320 respectively, releasing bounded Brood packets through the existing owner. Round35's boss cadence and noncanonical arenas/mutators/Circuit remain untouched.

## Reusable toolbox and source coverage

- `src/data/swarmMode.js`, `SWARM_ACT_ROUNDS_BY_WAVE`: implemented linked-pair package recipes, room phases and shooter cap. Do not confuse legacy `survivalActs`' finale with the real Swarm boss cadence.
- `src/data/swarmFoundryScore.js`: actual preview/preparation copy and first-read clocks. Existing `stagedReadTicks` is sufficient; no planner or AI rewrite needed.
- `src/systems/survivalWavePlanner.js`: copies original staged recipe offsets; `readAfterTicks` is a separate action-gated clock.
- `src/systems/survivalWave.js`: actual cohort admission, pause gate, refused-seat debt and fire shaping. A staged-only static owner test needed extra grace for the second pair's safe admission, not a forced spawn.
- `src/systems/swarmBrood.js`: existing finite queue/birth-reserve ownership; delay is not removal. Tests sum all held reserves, pending, live and removed population.
- `src/systems/swarmEvents.js`: existing major/minor forecast selection;32 retains the minor card,33/34 none.

## Evidence

Fresh GitHub PR inspection found open draft/conflicting #942 at the exact parent. Shared checkout remained untouched.

New owner tests plus adjacent Mooring:17/17. Existing Breaker Yard tests:12/12 after making their simulation explicitly active flight and extending observation beyond the new crowd clock. Their actual simultaneous-fire assertions remain:34 releases three guns,33 more than three but at most eight. Parent original suite12/12; this was an intentional test-contract update, not a preexisting failure.

Adjacent third-exit and Regent tests:10/10, loaded through explicit support copies because the shared checkout is stale. Total39 scoped checks.

Plan comparison across seeds1,4242,73311 and rounds1–40:111 plans byte-identical,9 intentional plans at32–34. Every changed plan retains original package fields except added read clocks, room phase, quota and act identity.

Production-manifest native scripted probe, seed73311 round32, ordinary input/aim/fire with stock energy baseline. Parent at120 had13 admitted ships and326 live Brood; pilot died288. Candidate at360 had only the original Warden/Corsair pair and0 Brood, then pilot died501 against that pair. This demonstrates scene separation, not sufficient balance, survival, earned progression or human readability. No body relocation, HP mutation, forced damage or reward grant after initial lab setup. The scripted actor initially waits for a target; the opening still requires visual/human review.

## Open goals

- **SF-GAME / SF-WORLD-DIRECTION — active.** Make the linked-pair act readable without erasing pressure. Source implementation and owner tests complete; earned traversal and kill-order play remain open. Owner: Swarm experience integration.
- **SF-SECTOR-COHERENCE — active.** Preserve31 transition and35 boss while connecting extraction30 to Breaker Yard. Next executable: earned refit/continue30 →31 → linked pairs32–34; verify economy/build strength and chosen kill order.
- **SF-LIVING-WORLD — active.** Furnace, shutters, mine lane and specialist coverage must interact in actual combat. Next executable: use appropriate late-run build and ordinary piloting to break each link; do not tune from this stock lab death alone.
- **SF-ASSETBANK / SF-ASSET-QUALITY — review only.** Reuses existing room/ships; no model request justified by this source pass.

Acceptance gaps: rendered composition/telegraph readability, audio, human pacing, earned late-run fight, full Save/Continue and performance. No claim of merge readiness; current PR conflicts and CI status must be checked at publication. No new user operation needed for these source changes; visual execution remains limited by the available browser environment.
