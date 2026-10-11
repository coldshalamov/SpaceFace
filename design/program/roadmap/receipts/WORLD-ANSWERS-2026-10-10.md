# WORLD-ANSWERS — the collisions and the toy-chest consequences (2026-10-10/11)

One batched unit: `build_map.md` §15.6 collisions C5–C12 plus the consequence halves of §15.5
toys T1/T6/T8/T9/T10/T11/T13. The audit that sized it: C3 was real; C1/C2/C4 partial; C5–C12 had
no listener at all; of the toys only T12 was real — every other toy had its physics and not its
story ("I did X and Y happened, so then Z" stopped at Y). The world did not answer. Each unit below
is a listener and a rule on an existing single writer, never a new system.

## Landed (all on `origin/master`, pathspec commits)

| Unit | What the world now does | Receipt / event | Commit | Tests |
|---|---|---|---|---|
| C6 mass slam × station | A hull the player throws through a berth's ring (closing ≥30 WU/s, mass ≥8 t) → `economy` files `mass×closing×0.08` cr (150..2500) on the note, downs that berth's repair bay 10 min (`state.economy.stationOutages`, saved only while live), bumps the insurance deductible 1.2× to a 2× cap, rep −2 to the owner, Dock control / Yardmaster speaks; `sectorSim` lane impulse (danger +0.02, price +0.02, owner influence −0.01); the yard quote reads the outage | `station:slammed` v1 | `a036e3af4` | `world-answers-c6-dock-slam` 6/6 |
| C8 economy × seam smashing | `environment:fractured` → `sectorSim` sums the shards' yield, names the dominant ore, credits the actor from impulse provenance, pushes price pressure −0.03 − 0.004/u (cap −0.25): 10 u dips the chart, ~25 u crosses `route_surplus` so the existing `surplus_haul_out` board template posts a haul-out; dust (<2 u) is not a flood | `economy:oreFlood` v1 | `a036e3af4` | `world-answers-c8-ore-flood` 8/8 |
| Chart legibility | `dangerModel.classifyDrivers` annotates `ore_flood` / `dock_slam` / `lane_disruption`; `causePhrases` prose; starmap "Driven by" labels; `check-cause-ledger` OK | — | `f6f9a2a7d` | pinned in C6/C8 tests |
| C5 well × route hauler | A player well dragging a loaded route hauler ≥45 WU off its dead-reckoned line → its shadowing escorts regroup and hold on it (cap 4, 6 s), the hauler heaves to 4 s and re-plans, the destination lane takes price +0.03..0.06 by manifest, one bark | `well:haulerDragged` v1, `traffic:haulerRegroup` | `5206d88e3` | `world-answers-c5-well-hauler` 16/16 |
| C7 pods × pirate hunt | Wounded pirates (hull ≤0.5, ≤900 WU) drop aggro and run a hold-fire errand to an ejected pod; contact captures it (ransom), the pirate flees 20 s; a hit on the hunter ends the errand; a pod under player tow cannot be captured | `survivorPod:captured`, `survivorPod:resolved {captured}` | `5a3ec5db0` | `world-answers-c7-pods-pirates` 35/35 |
| T10 rescue cools heat | A player-towed rescue of a lawful-faction pod cools WANTED heat 0.08, ≤0.20 per rolling minute, once per pod id, never the player's own pod | `survivorPod:heatCooled` | `5a3ec5db0` | same file |
| Capture seen / voiced / remembered | `captured` VFX variant (grapple filament, no glow disc); `POD_HUNT_BARKS` in five faction registers picked by `hash32`; moral-memory cause `captured_survivors` | — | `4a82af80d` | 11 files green |
| C10 tumble × battle line | A tumbling heavy's battery (≥10 mounts) rakes its own line through the combat kernel for the tumble's duration; the player is never source nor victim | `combat:tumbleRake` | `77b9c504e` | `world-answers-c10-tumble-rake` 9/9 |
| T8 ace ram pass | `ram` is a fourth ace style: a boss whose player has rammed ≥60 answers with a telegraphed head-on pass (window 420..700 WU) | bark + `aiPorts.acePassAuthorization` | `77b9c504e` (+ hunks swept into `8d965f4a0`) | `world-answers-t8-ace-ram-pass` 6/6 |
| C11 heat × contracts | WANTED → outlaw-friendly fences post `deniable_job` at 2× lawful pay; an ambush clause is rolled once at accept (60 % at heat 1 → 100 % at 5) and fires once at the drop as an `ambush_snare` | `ambush:clauseFired` | `0554d6b4c` | `world-answers-c11-deniable-jobs` 10/10 |
| C12 mining × pirates | A depleted seam's scarcity term (0..1) adds +0.35 combat rate on that route, one rumor at 0.5 | — | `0554d6b4c` | `world-answers-c12-scarcity-ambush` 6/6 |
| T11 the long tow | Towed mass accrues `dir.noise.tow` (cap 3, decays like mining noise) → +0.4 combat rate | — | `0554d6b4c` | `world-answers-t11-tow-noise` 7/7 |
| T1 the bolas | Twin Bridle evidence (orbit ≥90°, closing ≥0.25 cruise) → `bolas` / `bolas_pair`; "Two hulls, one rope, one rock." | stunt grammar | `20177a037` | `world-answers-t1-bolas-pair` 9/9 |
| T6 ore shotgun | `ore_shotgun` trick (17th id): a player-shoved cargo pod kills → "That was your iron ore. The pod killed him." | stunt grammar | `20177a037` | `world-answers-t6-ore-shotgun` 8/8 |
| T9 dead man's mass | `own_wingman` variant when the wreck's origin faction equals the victim's → "His own wingman finished him." | stunt grammar | `20177a037` | `world-answers-t9-own-wingman` 8/8 |
| T13 trophy heads | The three ace heads carry `loadCapacityMult` 1.15 / 1.3 / 1.5 — tension, impulse and yank limits scale; release/spring untouched | — | `20177a037` | `pq-170-03-legendary-heads` (new case) |
| Hygiene | One `LAWFUL_STATION_FACTIONS` (literal — only Concord is `personality:'lawful'`), four copies removed | — | `8e113516d` | 4 consumer tests |

Follow-ups in flight at receipt time: deniable ambush next beats (burned / emboldened fences, quiet
thanks); the ledger remembers who took the survivors (`captorFactionId`, abandonment rule,
lifeLedger classes); two triage waves over tests found red against committed code.

## Not done / known edges

- C9 draw-path × towing: not in this batch (`PQ-137.08` owner; needs the follower to read coupled mass).
- C5: an ambient hauler's re-pick may name a different destination than the receipt did.
- C7: `pirateDisengage.disengageUntil` is written but never read — fled pirates stay fled until egress.
- T1: bridle evidence is not serialized; a save mid-rope loses the pending bolas.
- T8: the head-on `intercept()` change also applies to existing heavy `ram-plate` hunters (`maneuver.js:830`).
- C11: `missions.js` allows one board row per source, so a deniable offer can displace the ordinary
  economy offer at that dock for the epoch.
- Baseline `sim`/`sim-v3` 47a goldens drift in the dirty tree; every lane verified the same hash with
  its hunks removed (no listener in this batch fires in the 47a trace). Not re-recorded.
