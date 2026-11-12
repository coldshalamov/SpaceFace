# Ceres first shift: recover useful machinery before buying a heavier line

## Decision and player route

At parent `19eca74705d3085a4a4063fe2693b56f1eaf0b36`, a new LARK lot offered a 65t engine and 50t cassette. The already-authored sorting refit (18t motor, 16t cassette) arrived only after the first lot closed. Its previous native pilot check literally paid for and forfeited the first claim before attempting the light load. That was the wrong first-shift invitation: useful starter work existed, but behind a sunk-cost detour.

Newly created first LARK lots now use that existing sorting refit. The catalog describes its two recoverable pieces and warns that the frame remains heavy. The player can inspect without paying, claim for the unchanged 80cr, control the motor with the ordinary starter MassLine, release the original clamp, fly it to the existing scale, brake, and hand it over once. The cassette is an independent next recovery, not a prize for clicking through the board. BELLWETHER and VESPER retain their crowded and hazardous escalation.

This is reuse and scene sequencing, not a new model or cheaper fictional mass. The sorting motor already has its own approved machine asset, real 18t native body and lower 160cr maximum value; cassette is 16t and 110cr. Condition still reduces payment. The 240t command frame and 80t saddle remain physical heavy work. No extra credits, repairs, autopilot, teleportation, receiver changes or completion flags are introduced.

## Exact continuity boundary

- [`model.js`](../../src/features/shipbreakingYard/model.js) selects a refit only while creating a new cycle-zero LARK job; existing odd return cycles stay refits and even return cycles stay the original heavy postal tender.
- [`layouts.js`](../../src/features/shipbreakingYard/layouts.js) keeps historical variants 0–5 unchanged and refits 6–11 unchanged. Only its explanatory comment changes.
- Existing offered **and paid** jobs retain their recorded variant through normalization. A player already inspecting a heavy LARK does not have that original exchanged behind their back.
- [`runtime.js`](../../src/features/shipbreakingYard/runtime.js) adds context only for an unclaimed first refit, not a generic promise that every LARK is light.
- [`shipbreaking-lark-refit.test.mjs`](../../test/shipbreaking-lark-refit.test.mjs) exercises first claim without forfeiture, real native starter pilot inputs and one paid recovery; historical-save normalization; replacement cycles; fresh native hydration of the paid first refit with its free motor and cassette receipt.

## Living toolbox / open goals

| Marker | Outcome / state | Evidence and next action |
|---|---|---|
| SF-WORLD-DIRECTION | First work introduces Ceres as a place where old postal hardware becomes useful machinery. Candidate assembled; acceptance open. | Existing postal sorting asset, native mass, condition-priced scale; review the station-to-yard approach in actual play. |
| SF-SECTOR-COHERENCE | Inspection → affordable first claim → physical recovery → next component, without sacrificing the first fee. Candidate assembled. | First-shift native pilot and persistence checks; still needs normal earned Ceres arrival and rendered first contact. |
| SF-LIVING-WORLD | Repeated lots retain heavy/light variety; old purchased originals stay unchanged. | Saved variant owner and unchanged replacement cycle sequence. Broader economy/service consequences are not claimed. |
| SF-GAME | Starter line can perform real useful work while heavier loads remain future capability. | No shortcuts in movement or settlement; assess human readability and pacing in live build. |
| SF-ASSETBANK / SF-ASSET-QUALITY | Existing machine/relay/frame assets reused. No production request. | No new visual review in this increment; asset silhouette/scale acceptance remains open. |

## Coverage boundary

This increment does not claim a complete campaign trip, live rendered review, visual acceptance, merge, deployment or owner acceptance. Native focused composition starts the pilot beside an authored yard with supplied test credits; movement after admission uses the existing flight, combat, tether and physics owners. Persisted semantic and native hydration checks do not equal a full browser Save/Continue session. Test results and artifact hashes belong in the accompanying handoff after execution completes.
