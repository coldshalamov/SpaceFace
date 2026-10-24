# Salvage Tail: choices that alter the encounter

## Scope and retained stakes
Scene367 remains a Helios Prime sequel gated by completed opening_hauler_raid. The MTS Mule, Reach pack, 5–9 fuel-cell manifest, 320-credit/+7 defended reward and previous-loss penalty grading are retained. Continuity now describes a replacement lot and the recorded first raid, not an invented surviving captain after a loss.

Shadow keeps the original Mule on a 0.22 assisted powered course. Original raiders use their existing arrivalHoldUntil consumer to withhold first fire until the 26-second commit window, while steering and susceptibility to damage remain real. Positive damage to an original participant can commit earlier. Bait makes the Mule the lure: a brief 0.5 lateral Newtonian burn followed by zero-input coast, with raiders released immediately. It does not move the player's controls or secretly retarget the bait onto the player. Decline releases the pack while the Mule continues its burn.

The nominal bait slip threshold is three simulation seconds, observed at 4.083333 seconds under director cadence in native qualification. Player copy therefore says “brief”, not exactly three seconds. At the 150-second deadline this local watch ends without asserting dock arrival, retreat, victory or cargo theft.

## Ownership and interruption
Original object, occupant generation, canonical body, AI identity, encounter role/sector and exact Mule intent guard the temporary lease. Scalar fire-hold cleanup restores only an unchanged owned value on the same generation/body/AI; newer holds remain untouched. Mule cleanup likewise requires original generation/body/AI/packet. Confirmed capture/control callbacks are original-generation/body qualified. The scene never fixes global entity recycling or owns a persistent traffic job.

TerminalPending is set before effects to block synchronous payout/news reentry. Dead-original handling distinguishes observed original death from missing/reused occupants. Finite cargo custody, when present, must become terminal before loss/defended settlement; the existing native predation admission gap is explicitly not solved here.

A chosen answer is single-shot. Early unanswered damage or elapsed commitment consumes the offer and sends the existing waitStarted lifecycle event with the same encounter key, replacing ignored live buttons with a truthful choiceless wait. Resolution clears the card. No invented player answer or stale Digit1 action is recorded.

## Source and tests
- Scene blob: 5b9928ce1b2263d9ef5fae5d8b4e0a556b3d541f.
- Focused test: 6e2d7740dc10b247381fea5f0e2acbaeeb142946.
- Native fixture: ed6fe806486492101ca68560127681cd31413d6b.
- Final focused run: 13/13 passed in a mixed 783-module graph. It includes actual current encounterChoicePrompt/promptDeck adapter behavior, not GPU acceptance. UI pins: 4cb3fcc68730e36358b72c2c81204e2cc3d6570b and 6b2cd192650a0c7494d4fcef1eecc3e06dd62082.
- Seven final native scenarios passed, 9,120 stepped frames, on a mixed 1,588-module public-overlay/archive graph. The portable file is one top-level assertion test containing seven scenarios.
- Hosted gate check:salvage-tail-choices therefore reports 14 TAP tests: 13 focused plus one native file. It is reachable on static shard 2/3 in the inspected 311-command/233-static graph. Existing command order, classifications and workflows remain unchanged.
- Baseline public shadow/bait actor states were identical. An initial nine-case focused run was 8/9 because a fixture incorrectly expected an emitted receipt on speak:false; corrected to inspect authored receipt/live outcome rather than invent an emission. Reentry fixture initially used forbidden nested sim stepping, then correctly called the runtime directly. These were harness corrections, not suppressed game regressions.
- Initial 0.55 cover throttle produced 93.5 WU/s and left the pack about 900 WU behind at 35 seconds, so it was rejected as weak cover. Final 0.22 native qualification below includes actual fire and damage.

## Native maneuver evidence
Gate-respecting requestAuthoredEncounter(force:false) uses a configured Helios flight start and pre-existing defended first-raid record. This is not random scheduler discovery or flown first arrival. Real Wasp inputs follow the original Mule; production Rapier, flightV3 and SG06 tactical AI remain active.

Shadow records 1,560 fire-hold samples, releases the 26-second hold, first fire at 37.95 seconds and seven real autocannon damage records; Mule hull 174→133.05 by the 59-second sample. Bait releases immediately, ends lateral burn at 4.083333 seconds, coasts with zero movement controls, first fire at 29.35 seconds and one real damage record; hull 174→168.15. This proves distinct maneuver/fire timing on the selected route, not overall tactical balance or superiority.

The pilot contacts an original raider: 36 shadow and 19 bait impact records, all zero reported trauma. These are retained, not collision-suppressed or claimed contact-free. No teleports, immunity, enemy removal or stat changes produce the maneuver evidence.

## Native custody and Save boundaries
Five other scenarios cover interrupted Save, capture, foreign intent/hold successor, completed Save and lost Save. Capture uses actual admitCapturedVessel with a narrow owner adapter, not a player-flown shipjack gesture. The captured hull survives Continue and foreign packet/hold values are preserved.

Completed/lost terminals inject 100000 kinetic qualification damage through the real combat kernel. They are owner-lifecycle/Save checks, not ordinary player-fired victories or deaths. Completed 320 credits, cooldowns and resolved statistics survive serialize→JSON→load without replay. The defended path deliberately has no scene367 completion in story and no defended receipt-ring entry; do not claim either persists. The lost path records its normal loss receipt.

Unfinished transient scene state is abandoned by normal Save/Continue policy, not resumed offline. Native Mule death had predation null and no finite pickups: a pre-existing open manifest/predation admission gap, not a native cargo-spill success. The finite-custody wait is focused contract coverage only.

## Publication and limits
Built on sole public parent 719a82b85c07417e8661460147ed3977031ceb57, preserving newer master work. Refreshed open-head census through PR582 found no scene367/focused-test overlap. This is separate from Hawser PR580 and Pitborn PR582, not their private ancestry.

No shared AI/flight/traffic/Save/schema, models, UI owners, weapons, attachment kernel or workflow changes. No full populated-world, game-camera/browser, performance or ordinary full-rescue acceptance. Hosted exact-checkout gate and whole-CI status must be reported separately. Draft only; no merge/deploy.
