# Three quarantine loads, one readable approach to the furnace

## Decision and playable change

Book1's actual refinery detail already issues three finite quarantine pods and requires their physical disposal at CR-FEED. Previously the fresh ledger placed all three at x1760, z1740/1810/1880, just70WU apart beside the refinery. Their approach to the intake required changing the tow direction around the site. The new fresh bank places them at x1760/1930/2100, z1640, aligned with the actual mouth at1480,1640. Adjacent12WU-radius pods now leave146WU between their surfaces rather than46WU. The intended order is the remaining pod nearest the intake first, leaving its route empty before fetching the next.

This is a concrete physical staging change on the early campaign route, not a new cargo system or guide-only patch. It preserves the quarantine choice to tow or fling, the finite consequence of losing a lot, actual receipt ownership, all40t masses, hulls, identities, and the furnace/hauler/site placements. No free replacement lot or changed reward is introduced. The mission tracker describes the bank only while its current target is still at that authored position. Legacy or moved loads use their current marker instead of being falsely described as banked cargo.

Only a missing lot ledger receives the new arrangement. Existing arrays, partial receipts, lost lots and saved/moved physical poses are left untouched. This deliberately does not teleport old saves into the new layout.

## Evidence and comparison

Author and independent reviewer `/root/build_adventure_route`: **30/30 passing**, including three new focused tests:

```
node --test test/furnace-pickup-bank.test.mjs test/furnace-receiving-lane.test.mjs test/furnace-casing-return.test.mjs test/ceres-furnace-aftermath.test.mjs test/w533-books-0-2.test.mjs test/mission-log-book1-continuity.test.mjs
```

Author log `/tmp/furnace-bank-combined.log`; independent `/tmp/furnace-bank-review.log`.

The native test accepts the actual Book1 board offer through the mission owner, materializes the real refinery's25 dressing pieces, and uses the starting Pelican with production flight, combat attachments, Massline, Line progression, native physics and furnace intake. It visits the live pods, catches each through ordinary cursor-Line input, tows each through the actual mouth, and verifies the canonical lot receipts. It never relocates the player or pods after materialization or assigns their velocities.

**Candidate result: all3 lots received,286.75 simulation seconds,3 player/pod contact events, no contacts involving other scene bodies, no lost lots.** The limited contact assertion covers the pilot and the three loads, not every ambient collision in the universe. These are not three fixture `furnace:fed` events or hand-placed mouth arrivals.

The same final native controller/order, with the exact before-source substituted through a read-only Node loader, receives slot0 but misses slot1 and fails the delivery assertion, with zero tracked impacts. Both author and reviewer reproduced this. Before logs `/tmp/furnace-bank-exact-before-final.log` and `/tmp/furnace-bank-review-before.log`. Loader `/tmp/furnace-bank-before-loader.mjs` reads the exact before snapshot. This establishes that the aligned arrangement supports this ordinary control route where the old one did not. It does **not** establish that old cargo was impossible, that the test controller is optimal, that contacts were reduced, or that all routes through the new bank are safe.

An earlier reverse-order old-layout attempt also missed its first delivered load; preserved `/tmp/furnace-bank-before.log`. No source force/mass/radius changes were used to tune the controller. The eventual comparison uses identical nearest-intake-first order and controls before/after.

Other tests exercise actual fresh mission spawning and unchanged40t bodies, live placement-aware tracker copy, and a copied/snapshotted legacy ledger with one received, one lost and one remaining old-position pod. Reconciliation retains that remaining pose and never advertises the new bank. This is a mission-ledger reconciliation test, not a complete UI Continue session.

## Scope, continuity and limits

Exact owned files:
- `src/missions/furnaceWorksite.js`
- `test/furnace-pickup-bank.test.mjs`
- This note.

Before `/tmp/furnaceWorksite.before-pickup-bank.js`, SHA256 `4a96857de9ac21239beb684fd0553fc54f77f23002973b79a0b58392aae7f05f`.
Increment `/tmp/furnaceWorksite.pickup-bank.increment.patch`.
Current fetched origin/master `f95de0eb1ba7560839209936afba48c7b96fe41a`. Current NOW checked and parent cleared this clean helper as not denied. No Lane B, held mission owner, runtime materializer, refinery data, model, physics, economy or foreign dirty file was changed.

The native route starts with previous Book1 steps and mite clearance supplied as fixtures. It does not play the earlier alloy/Scale4 journey or the live mite fight, and the scene uses dressing materialization without active ambient combat. Existing mission/runtime and earlier receiving/casing dependencies remain necessary; three files alone are not a standalone game build. No rendered screenshot, broad travel safety, full save-envelope/UI Continue, publication, merge, deploy or user acceptance is claimed. SF-GAME and sector coherence remain open beyond this bounded, reviewed physical route.
