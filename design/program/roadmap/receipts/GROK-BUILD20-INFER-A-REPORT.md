# GROK-BUILD20 inference A

Seed 4242. Six catalog lines. No commit.

## Focused proof

Command:

`node --test test/infer-build20-a.test.mjs`

Result: 11 tests, 11 pass, 0 fail. Duration 1056.6336 ms.

| Line | Tests in that file | Result |
|---|---|---|
| PIC-25 | 1 | pass |
| WORLD-30 | 1 | pass |
| WORLD-21 | 2 | pass |
| WORLD-42 | 3 | pass |
| WORLD-32 | 2 | pass |
| WORLD-35 | 2 | pass |

## Adjacent suites

Command:

`node --test test/npc-job-signature-vfx.test.mjs test/npc-job-reactions-deploy.test.mjs test/world-24-harasser-disengage-bark.test.mjs`

Result: 34 tests, 31 pass, 3 fail.

- `test/npc-job-signature-vfx.test.mjs`: 21 pass
- `test/npc-job-reactions-deploy.test.mjs`: 10 pass
- `test/world-24-harasser-disengage-bark.test.mjs`: 0 pass, 3 fail

The three WORLD-24 failures are the harasser disengage listener that was already registered twice in HEAD. This pass did not add or change that listener. The flee bark and the departing bark both speak, so the suite sees two lines (three on a re-emit) and one line when the attacker id is missing.

## What landed

- PIC-25: one `traffic:oreCollected` intake record, profile `mouth_open` (hatch-spill). Quiet when the miner is off the glass.
- WORLD-30: one `npcjobs:threatened` reaction for a miner job, same `go_dark` profile a close player already draws.
- WORLD-21: one spill-notice bark from the hull inside the watch, inside the ambient gap. One bark per notice.
- WORLD-42: one hauler-register grumble for an on-glass empty lot. Off-glass does not spend it.
- WORLD-32: one miner hail to the player when the player is the reserved help (`source: contact_hail`).
- WORLD-35: tourist traffic role selects `TOURIST_HAIL_REGISTER`. Freighter traffic stays on patrol-greeting. Scenic odds unchanged.
