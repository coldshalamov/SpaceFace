<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-169.02 — Weekly mutators

```text
DONE  PQ-169.02 — four weekly Crucible twists that are actually different games, and two machines in the same UTC week get the same one.

WHAT I FOUND     Daily seed and ghosts were already local. Every week still launched the same Swarm. compileChallenge(47, [], 'swarm') had wellCount 0, no reef recipe, and guns on. A hash lottery could have skipped a game for months.

WHAT I CHANGED   The door now has a Weekly control next to Daily and Ghost. UTC week picks one of four, in a fixed rotation — gravity slalom, heavies only, weapons cold, reef — never a random draw that can hide a game. The run seed stays. The twist is stamped on the queued challenge so midnight cannot relabel a live run, and a later free Swarm, Gauntlet, or Daily does not inherit it. Weapons cold strips guns from the launch loadout so they stay in the rack. No live-ops feed.

WHAT YOU WILL FEEL   Pick Weekly and this week's name is on the door. Gravity slalom puts three wells in the room. Heavies only throws out the wasp fodder. Weapons cold leaves the guns in the rack. Reef is a tight rock recipe, not Helios Core's empty floor. Next week is a different one of those four. Ordinary Swarm is still the default.

THE NUMBERS      bar | before | after | target
                 same UTC week, two clocks, two storages | missing | both 2026-W36 -> gravity_slalom | identical id
                 four consecutive UTC weeks | missing | gravity_slalom, heavies_only, weapons_cold, reef | all four once
                 gravity_slalom wellCount (seed 47 wave 1) | 0 | 3 | 3
                 heavies_only heavyCount / fodder | wasps | 10 / 0 | heavies, no fodder
                 weapons_cold physicsOnly / skipDraft | false / false | true / true | guns skipped
                 weapons_cold launch loadout | concussion + marker | whip only (guns stripped) | no wpn_
                 reef recipe | helios_core empty | crucible_reef | not default Helios
                 non-weekly Swarm/Gauntlet/Daily inherits the week | would | mutators empty, stamp consumed | no
                 PQ-169.00 daily seed 2026-09-06 | 1537801443 | 1537801443 | unchanged
                 PQ-169.01 ghost hash seed 47 3-frame | 1864785429 | 1864785429 | unchanged

THE FRAMES       Not a camera leaf. GPU was reserved. The claim is week keys, a four-game rotation, and strategy telemetry, proven in node tests.

NEXT             PQ-169.03 The hangar feed (optional; cosmetics only).
```

## Controller verification — 2026-09-07

Landed from `C:\sf-wt\pq16902` onto primary after review. Weapons-cold salvage: launch strips `wpn_` fittings so the starting concussion cannon cannot fire. Wells register through the existing environmental field kernel. Focused tests on primary: `test/crucible-meta.test.mjs` + `test/crucible-record-band.test.mjs`. `npm run check:crucible:meta`. Headed `check:crucible:route` not re-run (GPU reserved).
