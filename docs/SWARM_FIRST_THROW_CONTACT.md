# Swarm opening: acknowledge the first court strike

## Experience increment

Wave one already lands in the Foundry with an authored eight-prop throwing court, the launch pocket,
the lesson stone, and its existing opening/intermission callouts. The missing link was confirmation
that the room's physical opportunity had worked. In an ordinary, unmutated T0 Foundry Swarm run, the
first time a player-latched court mass makes a real Massline contact with a live wave-one hostile,
the existing combat net may say once:

> Rock strike: Wasp Swarmer. Keep moving.

The enemy name comes from the struck body's existing enemy definition. This is a contact cue, not a
damage/kill award, tutorial card, prompt, or requirement to release the tether. Both a mass still on
the line and a mass already in its actual sling window can qualify. The existing keyboard Massline
binding is Space (F remains its alias); the cue is entirely optional and does not choose a weapon or
move the player. The old wave-one result/intermission and next-wave preview remain untouched.

## Source-of-truth check and eligibility

Upstream was rechecked against fresh `master` head
`5fd0b6a7175ab2f5daa1c5476116340a57763ff6` (merge of PR806) and PR803 head
`4c8ea7d409737f34d16b7f6e07aeb75a2dfc0b47`. The candidate announcer's unmodified source is the
same blob at both refs. All evidence below refers to fresh master; where noted the untouched arena
owner is newer than the target PR.

| Owner | Exact source evidence |
| --- | --- |
| `src/data/swarmOpeningTerrain.js` (`13287a2bc22b36ee3844aee8149ee46d9d9d7f60`) | Foundry wave 1 has stage count 8; `STATIONS.slice(0, stage.count)` stamps `openingTerrainSlot` from zero. Slots 8–13 are explicitly added for waves 2–3. |
| `src/systems/swarmArena.js` (`d67f90c73b7d21dc636549c252e9b1a090da2f31`) | This fresh-master arena owner differs from PR803; it was not edited. It still stamps the numbered slot only for an `openingStage`, while ordinary top-up rocks have no slot. All use the existing `swarmArenaDebris` marker. Material `debris` uses the live `wreck` body type, so the callback allows both asteroid and wreck colliders. |
| `src/systems/rockCore.js` | `newGame()` initializes `state.rockCore.ratingT` to `0`; `swarmArena` feeds that same rating into the tier owner. The opening court planner only stages this layout for line tier 0. |
| `src/systems/survivalRun.js` (`ce7a73aaad3e4d15355144c220a1fecbef6197b8`) and `src/systems/survivalWavePlanner.js` (`1f1f4aa0b4a82082f371a08cef3082710e5b2a0f`) | The run creates wave 1 in `wave_intro`, calls `planWave` with `mode: 'swarm'` and the actual ruleset, and emits `run:wavePlanned`; ordinary generated Swarm plans carry `plan.swarm`. Only an authored opening lesson populates `plan.openingLesson`. |
| `src/systems/input.js` and `src/systems/tetherGameplay.js` (`9c55dbde7e59155ac102bf3d44cb2b8b068d862c`) | Existing default tether bindings are Space/F. A successful player latch emits `tether:latched` with source and target IDs. |
| `src/systems/masslineImpacts.js` (`09e376deaa5efea8da08a6c5595602fe238c1f71`) | The existing observer detects an actual moving-mass contact, stores its canonical receipt as `state.player.masslineImpacts.latest` and in `impacts`, then emits that same object on `tether:whipImpact`. It includes target/victim ID, `tick`, `time`, and `slung`; it contains no generation fields. |
| `src/systems/waveMaterialization.js` (`d44c10fa38761412ba633d03cb4b2e83927f575c`) and `src/systems/enemySpawnSpec.js` (`b6366796f7d88f12ca2e650d86c0df69f6a5b882`) | Actual hostile bodies receive `runCohort: 'survival'`, integer `runWave`, and `lootTableId: def.id`, matching the eligibility and enemy-name lookup. |
| `src/systems/scannerReadModel.js` (`ccc947ea1ff9edcf9cf76c1ae181d8e8b64413f9`) | This pure read-model exports `isHostileToPlayer`; the production announcer imports it directly rather than importing the much larger `scanner.js` owner. |
| `src/systems/input.js` (`92cdc0e3bcda60f0f4b28b52d2102fa9649b93da`) | This fresh-master input owner differs from PR803, but its default remains `tether: ['Space', 'KeyF']`. |

The other checked gameplay owners in the table (opening terrain, `rockCore`, tier ladder, run/planner,
tether gameplay, Massline observer, wave materialization, enemy spawn spec, entity-generation helper,
and pure scanner read model) are byte-identical between PR803 and this fresh master. In particular,
the Massline observer is blob `09e376deaa5efea8da08a6c5595602fe238c1f71` at both refs; no second observer
overlay is needed to cover the target branch and merge target.

At `run:wavePlanned`, the announcer resets the wave and arms the one-throw watch before speaking the
ordinary opener. The watch requires the actual player object and generation to exist. A player latch
must identify that same pilot and one live, generation-stamped tagged body in court slots 0–7. A
contact must be the exact current observer receipt (same object in `latest` and the log, same current
tick/time), hit that latched object without an ID/generation replacement, and identify a live,
generation-stamped hostile from the current wave-one cohort. It also requires the original run seed,
Foundry arena, ordinary Swarm plan, flight mode, no active modal, T0 tier, and no mutators/Circuit.
Training/lesson plans, other arenas, upgraded tiers, and all later waves keep their existing owners.

The impact observer does not stamp a victim generation. The callback therefore compares the victim
against the live entity map and requires a current generation stamp at the synchronous event seam;
it does not invent a generation claim on the immutable observer receipt. The player and latched mass
generations are captured at arming/latch time and checked again on impact.

## Priority, lifetime, and cost

The reaction uses the existing `bark` channel (priority 50), below imminent danger, tutorial, and
objective/clear feedback. It emits only if the existing per-wave line count is below four, reserving
the fifth slot for the round result. One receipt is consumed at most once; a per-module `WeakSet`
also rejects duplicate delivery. The arming record is cleared on wave reset/clear, phase exit, and
destroy. No saved `latest` receipt is polled or replayed on restart/restore.

This adds two event subscriptions and O(1) callbacks in `survivalAnnounce`; there is no tick/update
scan, entity census, physics write, RNG, score/economy mutation, new module, asset, preload, or change
to arena placement/caps. The full Massline observer remains the single producer of contact truth.

## Patch and validation

Shipping diff is limited to `src/systems/survivalAnnounce.js` and the new
`test/swarm-first-throw-contact.test.mjs`. The latter loads the production callback and exact current
Massline observer source in a VM with explicitly injected ports (event bus, world state, and the
hostility predicate); it is not a browser/renderer/physics-engine boot. Its tests cover held and
released contact, the production wreck slot, non-eligible plans/tiers, slot 8, wrong/unrelated mass,
stale/forged/posthumous receipts, recycled pilot/rock IDs, no voice slot, wave clear, and reload.

Commands run from the artifact root:

```sh
node --test test/swarm-first-throw-contact.test.mjs
node --experimental-loader ./test/overlay-loader.mjs --test ./test/crucible-announce.remote.test.mjs
node --check src/systems/survivalAnnounce.js
```

Results: 9/9 focused contact tests pass; 26/26 existing `crucible-announce` regressions pass; syntax
check passes. The existing focused suite was fetched from exact fresh master and run against the
candidate announcer. Its unchanged dependency imports were resolved from the read-only sparse
checkout; the two missing newer dependencies (`swarmSpecialists.js`, `scannerReadModel.js`) were
fetched at the same exact master commit into this artifact overlay. That run exercises opener,
plan freshness, hinting, cap, clear/starved, ended/defeat, victory/intermission, and channel/TTL
behavior, but is not a full exact-master build. Browser rendering could not be exercised in this
environment.

## Provenance correction

The sparse workspace contains foreign unpublished throw-coaching code/tests. They are not present
at PR803 head or fresh master and were not ported or used as authority. The Massline observer and
regression suite stored under this artifact's `src/` and `test/` are local test dependencies only;
they are not extra shipping files. Confirmed production source identity: `survivalAnnounce.js`
baseline blob `4d58a143b25f486d7f507436ce31199b4e5fbb5d`, PR803 head above; current Massline observer
blob `09e376deaa5efea8da08a6c5595602fe238c1f71`, identical at PR803 head and fresh master
`5fd0b6a7175ab2f5daa1c5476116340a57763ff6`.

Root repeated the final corrected-byte candidate: **9/9** contact and **26/26** existing announcer tests passed.
The original announcer is unchanged across original PR base67 and current4c8: the verified cumulative
PR comparison before this increment contains no survivalAnnounce.js change. Reverse application of
the source patch reproduces baseline Git blob4d58a143b25f486d7f507436ce31199b4e5fbb5d exactly.

SF-WORLD-DIRECTION, SF-SECTOR-COHERENCE, SF-LIVING-WORLD and SF-GAME remain open. This establishes
source/event and component behavior, not rendered ordinary-input, Save/Continue or performance acceptance.
