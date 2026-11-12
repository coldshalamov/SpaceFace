# Cinderglass: clear the working berth, then bring the original home

Source baseline: PR #982, `d859b6bf98a4e4e69badb4566a4e85ffe80d0042`.

## Creative decision
Preserve the physical outbound recovery rather than weakening Massline obstruction or adding an automatic handoff. The quiet-service position is a working recess, not a towing lane. After opening the latch, the pilot must clear the gantry before casting a clean line onto CG-7. The existing cradle course then carries the same original to Tala; only an explicit receiver acceptance pays the job.

Useful combination: original sealed pod + maintenance gantry + physical Massline + existing `autopilotCradle` action + cargo-owner receiving quote. No new model or geometry is required by the evidence in this pass.

## Source-linked toolbox
- `src/features/cinderglassJob/convoy.js`: original pod, native carrier and escorts.
- `src/features/cinderglassJob/physical.js`: native industrial gantry body and latch mount.
- `src/features/cinderglassJob/custody.js`: actual release, native Line custody, receiver radius/speed and original identity.
- `src/features/cinderglassJob/runtime.js`: explicit recovery course and receipt-bound acceptance.
- `src/systems/tetherGameplay.js`: ordinary acquisition, preview and latch. A player-selected gun target alone is not an unconditional Massline lock.
- `src/world/asteroidField.js:isMasslineObstructed`: existing bounding-disc obstruction for wreck/station structures. The original service position lies within the gantry bounds; a direct line from there is blocked even though the quiet-service latch ray was clear.

## Observed sequence
A staged, law-active post-alloy native scene used the production scanner, AI, physics, flight, tether, cargo, economy and save owners. It did not relocate live bodies, seed scan knowledge, directly create a player attachment or directly mutate mission progress after acceptance.

1. Real scan at58.10s, quiet release at97.90s.
2. Initial generic, nearest and cursor attempts selected the gantry, not the original. Diagnostics showed CG-7 present in the spatial query, but its rope segment was obstructed. These failed actor attempts are not evidence that towing is broken.
3. A short eastward clearance course followed by deliberate cursor paint and the ordinary acquisition receipt allowed the same original pod528 to latch at103.37s.
4. Existing `autopilotCradle` accepted. Physical cargo receiver accepted the intact original at111.15s for450CR, no deposit refund, player hull140.
5. Final repeat asserted original528/generation53 and one original, credit total5450 from5000, intact receipt and450CR settlement. A serialize/restore plus60 further native steps retained the completed outcome and5450CR without a duplicate payout. This is a same-process native Continue check, not browser persistence or cold-load acceptance.

The large fixture time jumps in diagnostic logs are sampling intervals, not teleportation. Distances and receipt times are simulation values, not wall-clock performance claims.

## Scope and acceptance gaps
This helper explicitly seeds post-alloy campaign eligibility,5000CR and a starting approach position, and supplies a presentation-ready acknowledgment. It uses a custom system sequence, not a resolved complete production runtime profile. There is no rendered image or human-input playthrough here.

A separate filtered-production-order experiment did not reproduce convoy travel. Since that subset omits production configuration/services, it does not prove a live runtime bug; do not silently promote custom-order results to production parity. Recover an actual earned save or run the complete supported production profile before claiming the route accepted.

No gameplay source changes are justified by this pass. No witness/range gates, geometry, rewards, acquisition rules, model ownership or clocks were changed.

## Stable open goals
| Marker | Intended outcome | State / owner | Evidence | Next action | User-dependent operations |
|---|---|---|---|---|---|
| SF-WORLD-DIRECTION | Recovery feels like bringing a disputed working object home | Native staged sequence supported / creative direction | same original intact receiver receipt | Review journey in complete production runtime | none for source research |
| SF-SECTOR-COHERENCE | Service recess opens onto a readable outbound tow lane | Physical clearance supported, visual open / scene integration | gantry obstruction + successful clearance | Visually inspect whether berth exit and correct rope target are legible | available authorized rendered build |
| SF-LIVING-WORLD | Dask and guards retain independent traffic/law behavior | Partial / native owners | active guards and witness gates during service | Earn route and observe departure with actual production profile | none for existing allowed sources |
| SF-GAME | Release, tow, receive, Continue without duplicate payout | Staged native acceptance only / integration | receiver identity and credit checks | Earn post-alloy run and test production Save/Continue | rendered build access still open |

Keep SF-ASSETBANK/SF-ASSET-QUALITY as review/integration responsibilities. No new model request is warranted. The larger twenty-concept scope remains unchanged.
