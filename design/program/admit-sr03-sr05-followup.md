# SR-03 / SR-05 follow-up after #285

Legend: **TRUE** = already on master before this branch · **BUILT** = landed here ·
**RESIDUAL** = still open, with the owner when it is outside this lane.

Proof metric: `branch_world_fact_delta`. This note is the follow-up to the partial slice in #285.
The mule fallback stays. It is the victim only after the readiness hold expires with no loaded barge in frame.
`design/program/NOW.md` on this branch matches master. The #285 claim row stays the board's row.

## What this branch records

| Fact | Status | Where it lives |
|---|---|---|
| A Helios ore barge that holds still at `poi_helios_tally` for 6 s writes one ledger row per manifest (cap 8, oldest dropped). Empty holds write nothing. The row round-trips on the traffic save and is absent after New Game. A later real dock closes that row as `delivered`. A later freight-loss of the same manifest closes it as `lost`. The opening raid does the same on `robbed` and `hauler_destroyed`, including a barge that is still alive after the ore leaves. `defended`, `raid_over`, and any other shape leave the row counted. Neither outcome overwrites the other. An unknown saved disposition reads back as `counted`. | BUILT | `src/systems/traffic.js` `heliosFreightTallies`; `test/starter-world-freight-tally-ledger.test.mjs` |
| The opening raid's cause names the hold it hit. Defended is contained and posts no job. Robbed posts replacement freight. A destroyed barge posts salvage and keeps `encounterFingerprint` on the dead hull. Flying on posts a corridor patrol, not a cargo loss. A living release clears that fingerprint. An unknown outcome records nothing. Other encounter shapes gain no freight fields. | BUILT | `src/world/encounterCausality.js`, `src/data/encounters/344-opening-hauler-raid.js`; `test/starter-world-opening-raid-cause.test.mjs` |
| A player who scoops a chip titled to the claim miner, inside Helios jurisdiction, with a witness, gets one `payload_theft` receipt. The receipt survives save/load. No witness is a denial and leaves no ledger. An untitled chip, the player's own chip, a zero take, and the barge's own scoop are not charges. | BUILT | `src/systems/lawSecurity.js`; `test/starter-world-titled-chip-theft.test.mjs` |
| Seed 4242 adopts `helios_starter_ore_carrier` / `ship_ironback` on the production runtime. The cause's `manifestId` is that barge's hold. 4242 is intercepted before a tally, so the ledger can be empty at the shot. The passive 800 WU ore magnet does not pull a chip titled to the cutter; flying into that chip still collects it. | BUILT | `test/starter-world-opening-raid-real-path.test.mjs`; `src/systems/mining.js`; `test/living-adventure-shift.test.mjs` |
| An authored teach-day beat is not pushed off its freight by tension recovery. Tutorial and pacing-gap were already exempt. Recovery was deferring the opening raid 21 s at a time, so the 60 s readiness hold never started. Recovery now leaves that beat on the hold. | BUILT, cross-lane, listed | `src/systems/encounterDirector.js` `_pump`; `test/opening-raid-waits-for-laden-carrier.test.mjs` |
| A scan at the opening-raid hulk already names the raid. The wreck materializes on the kill, before the cause is filed. When the raid resolves, that live body receives `causeContract`, the provenance evidence, remedy, and motive, and the aftermath line. The salvage pool is not replaced. Leaving the sector and coming back rematerializes the same marker. A salvor that replaces the pool object is what comes back, including an emptied pool, which stays empty and does not refill from the default scrap. Completing salvage once removes the marker. A second receipt and a later return do not bring it back. Marker ids mix a per-run `runToken` (0 until New Game, then incremented, saved, and restored; a save that omits it restores as 0). Stored marker ids are not rewritten. A New Game that reuses the victim id, the wreck entity id, the fingerprint, and the kill tick does not recreate the previous marker id, so a stale `salvage:completed` cannot spend the next wreck. | BUILT | `src/systems/aftermathWrecks.js`; `test/starter-world-wreck-return.test.mjs` |
| Flying on (`raid_over`) names the lowest-id living raider who does not already wear a minted callsign, through the existing `pirateDisengage:triggered` receipt. The hull stays in the world. The name, the ace-memory record (`fled`, return scheduled, last sector Helios), and the `ace-fled` news line survive that system's save and are cleared by New Game. A recycled hull id does not resurrect the record or the name. The disengage toast is skipped when `source` is `opening_hauler_raid`, because those hulls are still on the guns. Other disengage callers still toast. Defending the barge names nobody. | BUILT | `src/data/encounters/344-opening-hauler-raid.js` `rememberOpeningRaidEscape`; `src/systems/aceMemory.js`; `test/starter-world-raid-escape-identity.test.mjs` |

## Production probe (player at the Helios origin, no injected readiness)

Measured on this box before the ledger/cause/chip edits, production profile, `nodeSafeOnly`:

```
SEED 4242 raidDue=119.5  readyS=159.0  raid=conflict t=160.0
  adopted=fm_e31374c5  hauler=ship_ironback  slot=helios_starter_ore_carrier
  ore0=157.6  tally0=-  minLoaded=206  adoptRange=260
SEED 8008 raidDue=170  readyS=61.0  raid=conflict t=191.0
  adopted=fm_adb5d8d2  hauler=ship_ironback  slot=helios_starter_ore_carrier
  ore0=16.7  tally0=70.3  minLoaded=232
```

4242 becomes ready inside the 60 s director hold. The barge is intercepted before a tally completes, so that seed's ledger is empty when the raid fires. The cause names the hold on the hull anyway.

8008, on the pre-edit probe, counted a hold at ~70 s and was adopted at t=191 inside a hold that started when the beat came due at 170 s. A later run on this branch, before the tension exemption, never started that hold: `tension_recovery` (`allowCombat: false`) gate-deferred the beat by 21 s from t=170 onward (`defers=1`, `due=191.1`, `fireReadyHoldSince` unset) while the barge's return drifted. That seed is not a committed production assertion. The exemption puts the beat back on the 1 s readiness recheck. Whether 8008's barge is inside 260 WU before the hold expires still depends on the flight.

Production line from `test/starter-world-opening-raid-real-path.test.mjs`, twice in a row after the magnet fix (about 47 s and 42 s wall, exit 0 both times):

```
REAL_PATH seed=4242 t=131.0 manifest=fm_e31374c5 qty=1 commodity=cmdty_silicate tallies=0 tallyEvents=0
```

The earlier `t=160.0` line is the same hold (`fm_e31374c5`, silicate, no tally). On the rebased tip the idle player's ore magnet, now an impulse the physics body actually follows, was taking that chip before the barge's scoop. The raid then fired the mule. That miss is sim-tick deterministic. It is not wall-clock or load, and the dock/loss commits (`9049d2456c`, `a16dda0cef`) do not touch the scoop or the magnet. A titled crew cut stays where it was cut. Loose ore still seeks the player.

## Player-truth

Adventure mode is the surface that should see the adopted barge. After the barge dies, a scan of the still-present wreck should name Reach raid wing and `cargo_raid`. After flying on (`raid_over`), one named raider should still be in the world. This lane does not edit `scripts/player-truth/**` (lane g-truth-v2-takeover / #294) and does not claim a harness pass. #285's adventure harness (`--mode=adventure --duration=300 --tag=sr03`) flew its own route and never reached the raid. Swarm would only show these traces if a wreck or a law receipt is on that mode's path.

## RESIDUAL

- A live raider-fired kill of the adopted barge. Aftermath tests still deliver `entity:killed` themselves. Firing rights sit in `src/ai/engagementAuthority.js`, outside this lane.
- `robbed` and `hauler_destroyed` leave no living raider to name. The custody record and the wreck cause remain the theft facts. This lane does not invent a person for a wing that is already dead.
- The named raider's later return is the existing ace-memory return (`returnAt` is at least 360 s). That return does not check whether the named hull is still in the sector. A long stay can field the return crew beside the original ship. This lane does not add a second return engine.
- Chronicler does not ingest `traffic:freightTallied`. `src/chronicler/schema.js` is outside this lane. The tally ledger is the durable fact.
- The mule remains the expired-hold fallback for a seed whose barge never enters the 260 WU frame. Do not delete it.
- 4242 does not need a tally row before the intercept. Later trips can still be counted.
- Seed 8008's return into the adopt frame is not locked. One probe adopted `fm_adb5d8d2` at t=191 after a tally at 70.3 s. A later run deferred on tension recovery and the barge was still ~400 WU out at t=240. The teach-day exemption stops that deferral. It does not promise the barge's flight.
