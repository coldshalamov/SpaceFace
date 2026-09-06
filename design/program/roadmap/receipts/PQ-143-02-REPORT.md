<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-143.02 — Six texture one-offs

```text
DONE  PQ-143.02 — five authored set pieces now sit exactly where they belong on the starter route (an abandoned tug slowly spinning beside the Ceres refinery, a strut shrine across the refinery approach, a pirate charge-hulk with a ridiculous welded ram, a decades-old family pod field, a derelict bulk tanker that out-masses the yard), and the sixth — a courier flying her route far too fast — is a deterministic fixture of the start sector, stamped every pass by traffic's own authored-slot seam.
WHAT I FOUND     The starter sectors had working stations and authored POIs but nothing that was just THERE — no object you remember for its own sake, nothing that makes a place specific without a system attached.
WHAT I CHANGED   One authored inventory of set pieces that the world spawns verbatim every time their sector loads (no seed, no epoch, no randomness — a one-off is always exactly this field, this angle, this distance from the refinery), on the same non-colliding dressing substrate as all other props, with one slow-spinning hull advanced by the world tick; and one named express courier stamped onto her own dedicated traffic slot in the start sector, never a seed-hash pick.
WHAT YOU WILL FEEL   Flying out of the starter pocket you now pass things worth a second look: a dead tug turning a degree a season next to the refinery lights, a wreck with a refinery spine welded to its bow, a cold cluster of somebody's family pods, a shrine of ribbons across the refinery approach, a tanker bow bigger than the station — and a courier barge that screams past at liner sprint every time you fly the start sector. None of it has a mission hook; none of it pays.
THE NUMBERS      set pieces placed | 5 (+1 behavioural courier) | all inside the starter pocket's sectors | reachable from the new-game start without a second jump · placed props in Ceres Belt | 11 fx (tug + shrine + ram + pod hero + 7 shells), 0 colliders | excluded from the structural census as authored dressing · tug spin | 0.32 rad/s (slow-tumble band, test-pinned) · courier speed | 247 WU/s express role vs 52 WU/s courier cruise | "far too fast" is a measured 4.7× · courier presence | deterministic (authored slot, not the seed pick — a previous hash-pick version of this unit broke Ceres's authored cast and was rejected in review) · determinism | spawn is seed-free and epoch-free; the same sector activation reproduces all 11 positions exactly
THE FRAMES       the set pieces are static-dressing props at the shipping camera; the reachable-places evidence is the atlas gate (PASS) plus the placement test pinning every position against the real station rows; no capture was shot — these are places, not events (owed if the reviewer wants them in a headed strip)
NEXT             whatever --next returns (U5 of this batch: PQ-184.00 the UI budgets, measured)
```

## The six

| One-off | Where | What | Mechanism |
|---|---|---|---|
| The Long Berth — an abandoned yard tug | Ceres Belt, −260/+240 off station_ceres (the refinery, on the side away from the f_ceres_2 rock field) | `place_dead_hulk`, slow spin 0.32 rad/s | prop + world.js spin tick |
| The Strut Shrine | Ceres Belt, +980/+1140 off station_ceres, across the refinery approach | `place_memorial_array` | prop |
| Ramrod — the pirate charge-hulk | Ceres Belt, −620/+540 off station_ceres | `place_aftermath_wreck_corvette_forward__stripped_heavy` | prop |
| The Grey Family Pods — decades-old pod field | Ceres Belt, +820/−700 off station_ceres | 1 × `place_habitat_pod_derelict` + 7 breached/hazmat cargo-pod shells in authored offsets | prop cluster |
| Mass of Another Age — the great tanker | Helios Prime, −1500/+980 off station_helios | `place_aftermath_wreck_ore_freighter_bow__derelict` (the 179 m hero) | prop |
| The Cinder Run Courier | Helios Prime (the start sector), a dedicated express traffic slot | named lane contact on the `express` role (247 WU/s live V3 boost intent vs 52 WU/s courier cruise), stamped deterministically by traffic.js | data + one authored fixture seam in traffic.js |

No new art: every placeId is packaged (`test/world-one-offs.test.mjs` asserts the GLB on disk).
The held-back `yard_tug`/`volatiles_tanker` hulls stay held back — fielding them is an owner call
(traffic.js holds that note), so the tug reads through its name, its slow spin and its berth. The
shrine reuses the memorial array in CERES, not Helios, so the same art does not appear twice in
one sector (poi_memorial owns it in Helios).

## What exists, connected (nothing new was invented)

- The props ride `_spawnPlaceProp` — the same non-colliding fx substrate as the everyday-space-kit
  and wreck-aftermath dressing, killed with the sector's dressing on deactivation.
- The spawn pass sits beside the two existing data-driven dressing passes (`_spawnEverydaySpaceKitDressing`,
  `_spawnWreckAftermathDressing`) as `_spawnWorldOneOffs`; the only difference is that it reads
  authored absolute placements instead of seeded rolls.
- The courier is a `NAMED_LANE_CONTACTS` row on the pre-existing `express` traffic role — traffic.js
  already owns the express motion ("the live motion path is the V3 NPC boost intent"), npcJobsRuntime
  is untouched (it is dirty foreign work).

## The PQ-020 contract (the trap this unit hit)

The Ceres-topology acceptance check pins a structural-cost digest over the sector's live entities.
Ten new dressing entities would have moved it. The check owns an explicit additive-dressing
classification for exactly this: props flagged in their spawn data are censused separately and
excluded from the core cost. The one-offs carry `worldOneOff: true` (the third flag next to
`everydaySpaceKit`/`wreckAftermath`), and the checker's expected census gained the group
(10 fx, 0 collidable) — a contract update with this receipt as its causal record, not a silent
digest repin: `check:pq020:ceres-topology` PASS with the digest unchanged.

## Verification evidence

- `test/world-one-offs.test.mjs` (6/6): the six exist (5 placed + the courier); every anchor
  resolves against the real SECTORS rows and sits inside the sector radius; every one-off is in
  the starter pocket's sectors (reachable without a second jump); every placeId's GLB is packaged
  on disk; the spin is in the slow-tumble band; every spawned prop carries the `worldOneOff`
  additive-dressing flag; the courier's role is express, numerically far too fast (≥ 3× courier
  cruise, measured 4.7×), and her sector list is exactly the start sector (never a pick pool); the
  spawn pass reproduces the exact authored positions verbatim (station_ceres − 260/+240 for the
  tug, +980/+1140 for the shrine) with no rng; one second of tick advances the tug by exactly its
  spin and nothing else; the spin list resets with the dressing lifecycle; world.js owns
  spawn-on-dressing, tick-in-update, reset-on-strip.
- `test/ceres-activity-traffic-cast.test.mjs` (16/16) — the authored Ceres cast is untouched by
  the courier (see the review round below).
- `npm run check:atlas-integrity` PASS (the packet's named gate).
- `npm run check:pq020:ceres-topology` PASS (see the contract section above).
- `npm run check:baseline` at exit: 14/15 children green — the one red is the known pre-existing
  `check:sim` 47-A hash drift owned by the live PQ-137.11 row's dirty `sg02DynamicBodyOwner.js`
  (same pre-existing red recorded in the PQ-186.00/PQ-139.04 receipts; this diff ships no sim
  path, and the reviewer reproduced the identical drifted hash with this diff reverted).
- `node scripts/check-program-docs.mjs`: pre-existing PQ-187/PQ-188 packet-shape errors only
  (foreign packets; recorded in earlier receipts of this batch).

## Review findings and dispositions

Subagent integrator review round 1 (REJECT) — both blockers fixed before commit:

1. BLOCKER — the courier's `sector_ceres_belt` entry enlarged Ceres's named-contact pick pool, so
   on some seeds the pick landed on her and the sector's authored seam miner lost its identity
   (`test/ceres-activity-traffic-cast.test.mjs` red). Fixed: she is out of every pick pool —
   her sector list is exactly `['sector_helios_prime']`, and the cast test is green again.
2. BLOCKER — as a pick-pool member she was also a seed lottery (~25 % per new game in Helios),
   failing "placed and reachable". Fixed: traffic.js stamps her as a deterministic fixture of the
   start sector on her own dedicated express slot every pass (`_ensureCinderRunCourierFixture`),
   mirroring the Ceres authored-slot pattern; the generic single-named-contact rule ignores her
   slot so the picked contact still appears alongside. Disclosed seam: traffic.js is one of the
   packet's named sources, was clean, and is claimed by no live row.
3. should — the strut shrine reused poi_memorial's exact GLB in the SAME sector. Fixed: the
   shrine moved to Ceres Belt (across the refinery approach), so the art is unique per sector.
4. should — test hygiene: the vacuous `|| true` assertion, the tautological deactivation block
   and the dead filter are gone; the test now asserts the `worldOneOff` flag on every spawned
   prop, that exactly the tug is tracked, and that one tick moves only the tug (rot snapshot).
5. should — fixed alongside 1–3 (the census count is 11, the tug was nudged out of the f_ceres_2
   rock-field radius, the data file is frozen like its siblings, the courier's gimmick has a
   target-panel label).
6. nit — the baseline wording fixed: exactly ONE red child (`sim`), not two.

## Tradeoff deliberately spent

Eleven more dressing props in Ceres Belt and one in Helios (non-colliding, draw-capped by the
existing dressing budgets, killed with the sector), one more named traffic identity in the start
sector, and one dedicated express slot that skips the seed-hash pick — bought with the only
memorable, non-systemic landmarks in the starter pocket. The tug's spin costs one entity-rot add
per world tick for one prop.

## How this can be got wrong later

- Adding a Ceres one-off without updating the checker's `worldOneOff` expected census:
  `check:pq020:ceres-topology` fails on the additive-dressing census — the right failure, since
  the contract names the expected authored content.
- Spawning one-offs through a seeded roll: the placement test fails (positions are asserted
  verbatim; a one-off is not dressing noise).
- Fielding the held-back tug/tanker hulls to traffic to make it "read better": that is an owner
  call (traffic.js note), not this leaf's.
