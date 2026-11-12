# Breakwater: recovering the original is not yet seating it

2026-11-12. Research at PR #945 parent `b8a8596a1b2e67efbd17f06bd0380576ce133071`.

## Player sequence and creative decision

Keep the existing southeast salvage pocket and the open receiving approach. The next acceptance task is the precision handoff after hauling, not new asset production or a more permissive seating radius. A cartridge that reaches the loading frame is still a loose original until it has crossed its matching cradle mouth, aligned, touched rear support and held steady. Nessa's instructions and the currently authored chart approach correctly describe that distinction.

The drive and drum remain distinct released assets with real 18t bodies. Their original identity, damage, local custody and eventual commercial charter connect this activity to an inhabited workplace rather than a proximity delivery trigger.

## New evidence

`haul-asserted.mjs` used the existing native route test's selected-system order on the exact parent. Staged start: restoring state, Kestrel near the original drive, 1000 credits. No earned rescue/survey or normal New Game entry is claimed. Attachment was created through the production attachment owner directly, not acquired with ordinary cursor/scan input. Thereafter ordinary flight inputs and native tether/physics moved the original; no live-body pose writes.

The original moved over 200 WU from its authored pocket and finished 15.60 WU from the drive cradle center. Hull remained 900. The socket stayed empty and the original stayed loose. Native save serialize/load retained exactly one original at the same position, hull 900, stage 0 and 1000 credits. The stop condition checks player speed, not cargo settling; the original still has momentum. This is mouth-vicinity haul and immediate save/load evidence, not completed restoration or a long post-Continue flight.

An initial push diagnostic incorrectly used the result's nonexistent `id` rather than `attachment.id` when cutting the line; its failure is discarded. The corrected diagnostic asserted successful cut, but its actor did not stabilize/align the original. The arrival yaw was roughly 82 degrees, outside the existing 15-degree gate. That failed maneuver does not establish a gameplay bug or justify weaker gates. Diagnostic process exit success means only the script ran; it does not mean seating succeeded.

## Source-linked toolbox

- `src/features/breakwaterSpur/definition.js`: original pocket, two cartridges, -Z-facing shelf cradles, 15-degree and 1.5-second seating requirements.
- `src/features/breakwaterSpur/physical.js`: `seatGate`, mouth crossing, current native rear-support contact, identity-safe `trySeat` and custody cut.
- `src/features/breakwaterSpur/readModel.js`: receiving marker is site Z minus 90, on the mouth side. The older generic console course uses plus 90; do not confuse these.
- `test/breakwater-spur-native-route.test.mjs`: existing selected-system haul pattern concerns a cooperative supply load, not restoration originals.
- `test/breakwater-spur.test.mjs`: the existing seating test starts the original near the mouth and applies native force/torque; it does not prove ordinary full-haul seating.

## Open goals

- **SF-GAME / SF-SECTOR-COHERENCE**: in progress. Verify ordinary acquisition, controlled orientation and actual rear-support seating of the drive, then repeat for the drum. Owner: experience integration. Next: use a production-complete scene or validated input actor with explicit orientation control; no teleports or injected seating force.
- **SF-WORLD-DIRECTION / SF-LIVING-WORLD**: retain Kroll's referral, Nessa's real restoration conditions and both charters. Completion requires actual opening and repeated-return consequences, not this note.
- **SF-ASSETBANK / SF-ASSET-QUALITY**: no new asset request justified. Existing released originals and cradle collision surfaces are sufficient for the next trial; visual alignment/readability remains unreviewed.

No gameplay source change in this pass. Rendered review, full-production order, earned two-original restoration, later Continue flight and commissioning remain open. No user-dependent action newly required.
