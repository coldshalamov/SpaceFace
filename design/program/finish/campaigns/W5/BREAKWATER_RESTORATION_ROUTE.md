# Breakwater: the restoration is a place, not a menu

2026-11-12. Exact candidate parent: `95c5fb02b75b202a4b0c0d2cbfbce0a27a715808`, PR #945, `experience-commissions/EC-S02-ceres-belt`.

## Experience decision

Kroll's confirmed rescue now offers a voluntary referral to Nessa's freight spur. The next beat should let the player understand and navigate a small piece of practical labor: identify what is missing, find its two originals, bring them back through a real receiving mouth, then decide what the restored place becomes. It must not imply a replacement can be spawned, that a marker follows an original, or that work was completed by opening a menu.

This increment connects the outbound and return paths in the existing chart and teaches the actual receiving action. It does not change the geometry, physical seating gates, mission state, resources, charter choice or rewards.

## Source-linked toolbox and corrections

- [`definition.js`](../../../../../src/features/breakwaterSpur/definition.js) places the frame at (-1250,-1650) and the search pocket at (-1150,-1900). The pocket is southeast, not the southwest previously announced by Nessa and the offer. Both original cartridges are 18t and are existing authored packages, not new asset production.
- [`physical.js`](../../../../../src/features/breakwaterSpur/physical.js) owns the original bodies and `seatGate`: correct identity, native cradle, passage through the mouth, whole footprint inside, genuine rear support contact, speed/rotation/alignment limits, then 1.5s stability. Its geometry is unchanged. The two cradles are at local x ±22, z -42, rotation0; their mouth faces negative Z.
- [`readModel.js`](../../../../../src/features/breakwaterSpur/readModel.js) now supplies two restoration-only chart points: the fixed original search pocket and a receiving approach at local (site.x,site.z-90), arrival radius20. Selecting either chart course uses the normal POI navigation owner and arms autopilot. This is not a proven safe-autopilot route, a socket snap, or live cargo tracking; actual travel while towing remains unverified. The console's existing Mark course action remains plot-only. Existing chartered receiver markers remain unchanged.
- The same read model explains matching cradle, alignment, rear support and stable Seat offer. Partial restoration still names actual cartridge states; it no longer claims both originals lie in the pocket. Unknown original location is not converted to known location.
- [`runtime.js`](../../../../../src/features/breakwaterSpur/runtime.js) corrects Nessa's compass direction and makes the console introduction independent of whether a socket was seated before the first console scan. Existing course handlers and physics writers remain untouched.
- [`project.js`](../../../../../src/features/breakwaterSpur/project.js) already separates physical restoration, paid commissioning and permanent charter. Preserve that causal sequence: labor creates a usable structure; materials commission it; charter selects future economic behavior.

## Player knowledge and revisit behavior

1. At discovery: dark frame, scan console and cradles. No new obligation.
2. During restoration: chart carries both the search area and receiving approach, so leaving to haul does not remove return guidance. The original search mark explicitly does not track a cartridge after it moves.
3. After one seat: named seated original is part of the frame; other remains loose or unconfirmed. The same chart receiving approach remains available.
4. At ready/commissioned/operating/failed/degraded: temporary restoration markers disappear. Existing site marker and charter-specific freight routes remain authoritative.
5. Continue: no new saved fields. The existing normalized project row reconstructs the same route; the worker's current projected row or explicit clear wins over a retained saved facade.

## Verification and limits

Focused tests cover state-dependent route visibility, source coordinates, detached nonmutation, partial-restoration normalization and production `buildSystemModel` / `resolveCourseTarget` conversion and the world course owner arming autopilot when the chart course is selected. Neighbor suites cover native original custody, material debit, worker projection and existing story handoff. Exact counts are retained in the accompanying logs.

This is source/owner-boundary verification. No fresh rendered screenshot, ordinary flight to the new approach, earned Kroll-to-two-cartridge restoration journey or human pacing acceptance was performed. Earlier supply-cartridge tow tests concern a different load and must not be cited as evidence that these original restoration cartridges have been flown into both cradles. Visual and physical player-route acceptance remain open.

## Open goals

| Marker | Outcome / state | Owner / evidence | Next executable action | User-dependent operation |
|---|---|---|---|---|
| SF-WORLD-DIRECTION | Rescue leads to intelligible optional freight labor; implemented, not accepted | Creative integration / Kroll referral + this route | Earn referral, fly to spur, restore originals through normal controls | None for permitted source work |
| SF-SECTOR-COHERENCE | Pocket→receiving loop readable; chart projection checked | Creative integration / new focused test | Observe actual flight and framing of two markers and cradle mouths | Render-capable assistant environment needed for visual proof |
| SF-LIVING-WORLD | Restored berth yields permanent economic role; existing implementation, unaccepted here | Breakwater project/economy owners | Exercise co-op or bonded work after earned restoration and Continue | No merge/deploy authorization implied |
| SF-GAME | Ordinary arrival→work→return playable | Integration / focused + neighboring tests only | Native production-order or live input journey through both seats | Same visual/earned gap, not closed by these tests |

No missing model is demonstrated. Reuse the existing frame, cradles, dispatcher console and original packages; do not open a duplicate asset-production lane.
