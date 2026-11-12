# Breakwater: Nessa reads the approaching original

2026-11-12. Candidate based on PR945 `33c0130c5a2754d6006fbc6b7c94b26234177ce5`. Owner: Adventure experience editor. Original physical restoration remains open, not accepted.

## Creative decision

The [original-haul pass](BREAKWATER_ORIGINAL_HAUL.md) brought an intact drive to the receiving mouth but never seated it: its yaw was roughly82degrees. Generic instructions and a silent missing Seat action do not explain that particular physical situation. Nessa is dispatch, not a magic installer. On opening the existing restoration offer, she now reads the actual surviving original within60WU of its own native cradle and gives a bounded practical observation:

* Skewed: square the cartridge before pushing through the mouth.
* Aligned but moving/turning too quickly: ease off and settle.
* Aligned and slow: enter the open mouth and meet rear support, then hold until Seat is offered. This never claims contact or readiness merely from proximity.

This uses the existing offer only, without unsolicited radio, prompts per simulation tick, new controls, rewards, replacement bodies or altered seating tolerances. No model request is necessary; existing visibly distinct originals and cradles serve the scene.

## Source toolbox and scope

* `src/features/breakwaterSpur/physical.js`: read-only `restorationGuidance` validates actual native original+receiver, loose custody, positive hull and60WU proximity; measures yaw and relative drift using the existing seat caps. It never calls the stateful mouth-crossing gate or increments the hold.
* `src/features/breakwaterSpur/runtime.js`: adds current observations only to an existing `restore` offer. Other dialogue, actions and event lanes remain unchanged.
* `test/breakwater-spotter.test.mjs`: staged native snapshot cases plus actual restoration-offer integration. Tests explicitly cover stale watch data: it cannot claim current contact or readiness.
* Existing `seatGate`, `updateSeatWatch`, `trySeat` remain authoritative and unchanged. Seat requires real mouth entry, rear support, alignment and stability before custody.

## Evidence and limits

Independent reviewer passed focused3/3 and existing Breakwater38/38. A private staged owner-attached native haul repeats the >200WU movement of the original drive and records the new offer: distance15.5996WU, yaw1.43694radians, hull900. Nessa correctly says skewed; no Seat action or custody granted. Save/load retains one loose original, empty socket and1000credits. Native haul1/1. Total42 unique checks, not a full-game pass.

Native haul begins with staged survey/player admission and an owner-attached line, then ordinary flight input and native physics; custom selected-system order. It does not prove ordinary tether acquisition, full production-order flight, completed seating, both-original restoration, earned campaign or rendered presentation. No new screenshots or visual acceptance.

Review removed an initial attempt to trust cached seatWatch for contact/readiness: an offer can arrive before the next physical update, so a stale watch is not current proof. The final code reads neither cached watch nor gate state for those claims.

## Open goals

* SF-SECTOR-COHERENCE / SF-LIVING-WORLD — Nessa offers context-sensitive practical work guidance; source-reviewed and scoped-tested, not visually accepted. Next: ordinary acquire→haul→align→seat for both originals, evaluate whether a human understands and can execute the rotation/push.
* SF-GAME — preserve strict physical custody and one-original persistence. Actual seating after the long haul remains open; do not loosen it merely because the private actor failed.
* SF-WORLD-DIRECTION — retain rescued Kroll→Nessa→restoration→charter causal chain. Do not replace physical work with instant dialogue completion.

User-dependent operations: none newly required. Publication does not merge or accept the conflicting draft.
