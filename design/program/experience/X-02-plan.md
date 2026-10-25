# X-02 plan — P1 raid beat teeth: the Jumper's Wing

Row §1P 560. Audit `X-02-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit | auth | spec | cost | non-red | total |
|---|---|---|---|---|---|---|
| Skeptic | 5 | 4 | 5 | 4 | 4 | **22** |
| Accountant | 5 | 3 | 5 | 4 | 4 | **21** |
| Drifter | 5 | 5 | 4 | 4 | 4 | **22** |

Spliced: Skeptic's arm-on-latch and no-return; Accountant's unarmed clinic, non-gating kill, low numbers; Drifter's voice. All three misread `rc-458-round1-budget`: `{ raider: 2 }` is the fixture's `raid.ids` (`:43`), not a spawn budget; the pilot reads only `raid.ids.raider` (`playthroughPilots.mjs:1446`).

## Load-bearing finding — fire authority

As things stand the wing could never fire. `authorizeAIEngagement` denies `station_protection` to any non-lawful shooter whose target is within `HELIOS_STARTER_PROTECTION_RADIUS_WU = 1400` of the Helios origin (`engagementAuthority.js:178-180,604-617`). The player spawns at `(0,0)` (`newGameBoot.js:35`) and the beat stages around the player (`onboarding.js:3234`). Every other gate passes (spawn-spec motive/telegraph/window; team 1 vs 0 hostile, `:475`; cap of two owners, `:23,741`). Fix: one narrow named bridge shaped like `is47aScavengerCounterplayAuthorized` (`:204`).

## Design (`src/systems/onboarding.js` + one bridge)

1. **Spawn.** `_spawnRaidCast` (`:3213`) adds a `raid.ids.wing` slot.
   - It spawns only when the stage is not a clinic, `!raid.wingDone`, and the slot is empty.
   - Spawn call: `makeEnemySpawnSpec('wasp_swarmer', 1, at(480, -0.6), { startedTick: st.tick })`, named `Claim Jumper's Wing`.
   - Body: hull 60, shield 0, no regen.
   - Weapon (amended after plan-gate REJECT 4964e62b — `data.weapons` holds only *resolved* mounts, `combat.js:344-356`, read at fire time by `defId`/`dmg`/`rof`, `weapons.js:1250`): keep the resolved `wpn_pulse_laser_s` entry `makeEnemySpawnSpec` already produced for `wasp_swarmer` (drop every other resolved mount), then set that entry's `dmg = 2`, `rof = 2` and `impulsePerHit = 0` in place, so it never shoves the tow. If the wasp's resolved kit carries no pulse laser, resolve one through the same exported path the spec builder uses (export the resolver rather than hand-building an entry). Test: the wing actually emits `combat:fire` and lands `combat:damage` on the player after the first latch.
   - Tags: `data.onboardingRaidWing = true`, `ai.roe = 'hold_fire'`.
2. **Arm.** `_onRaidLatched` (`:3315`) sets `roe = 'weapons_free'` on the first latch of `raid.ids.raider`.
   - Wing comms: *"Hands off his boat."*
   - Rail followup: *"Keep swinging. He can't hold aim."*
3. **Flee.** A new `_stepRaidWing()` is called from `_resolveRaidDone` (`:3401`). It also runs from the raid `_beatDone`.
   - Trigger: `hull/hullMax <= 0.30` (18 hull), or the beat is done.
   - It sets `ai.forceFlee = true`, `roe = 'hold_fire'`, and `raid.wingDone = true`.
   - It speaks once. Comms: *"Not for his cut. I'm gone."* Rail: *"He's running. Let him."*
   - From there the existing code finishes the job: `doctrine.js:111-121` runs the flee, and `egressExit.js:60-71` despawns the wing at 960 wu. The wing is not encounter-owned and not `moraleImmune`.
4. **No respawn.** `_removeRaidActors({ keepWing })`.
   - Restages for a gun kill or drift pass `keepWing: true`.
   - `_finish` and `_teardown` clear every slot.
   - Player death puts the wing back on `hold_fire` until the next latch.
   - A wing kill, resolved by `payload.id === raid.ids.wing`, sets `wingDone` and never completes or restages the beat.
5. **Bridge.** Add `isOnboardingRaidWingAuthorized(state, self, target)`.
   - It returns true only when the target is the player, `state.onboarding.raid.active`, `self.id === raid.ids.wing`, `data.onboardingRaidWing`, and `!ai.forceFlee`.
   - It is ORed into the `scenarioCounterplay` term at `:178`. The cap and every other gate stay in force.

## Numbers

- Raw 4 dps breaks the Hitch's 55 shield in ~14 s of continuous hits; regen is 7/s after 3 s unhit, so a swinging pilot keeps it and a parked one takes the first hull bite.
- The 140 hull lasts ~35 s more; `interceptor_flyby` gaps fire between passes (`enemies.js:29-36`). Death restages, never walls.
- Hull 60, mass 16: a few starter pulses or the thrown Claim Jumper put it at 18.

## Save / determinism

- No `state.rng` draw: the bearing reuses `ang`.
- Entity ids shift by one, so rail digests need a deliberate re-record ("raid wing actor"). Likely `onboarding-stranger-replay-stability`, plus `wave-b10-throw-determinism` if its fixtures are bound to ids.
- `legacy47a` skips the beat (`:3199`).
- Nothing new is saved; the slot lives inside `ob.raid`.

## Tests to add — `test/x02-raid-wing.test.mjs`

1. A normal stage spawns one wing on `hold_fire`. A clinic stage spawns none.
2. Before the latch, the wing→player shot is denied. After `tether:latched` on the raider it is allowed with the player at `(0,0)`.
3. A different hostile at the same spot is still denied `station_protection`.
4. At hull 18/60: `forceFlee`, `wingDone`, fire denied. At 960 wu or more, `despawnAt` is stamped.
5. Gun-kill and drift restages keep the wing id. After `wingDone`, no wing respawns.
6. A wing kill never calls `_beatDone` or a restage.

## Must stay green

- **Raid lesson:** `inf-061-raid-discovery`, `rescue-opening`, `pq-163-03`, `pq-163-04`, `wave-b10-throw-determinism`
- **First-session pacing and stranger route:** `pq-163-opening-choice-pacing`, `rc-458-first-half-hour`, `rc-458-round1-budget`, `missing-three`, `first-hour-choice-contracts`, `onboarding-stranger-replay-stability`
- **Engagement authority:** `ai-engagement-authority`, `47a-jurisdiction-engagement`, `core-first-ten-minute-contract`
- **Gate:** `npm run player-truth -- --mode=adventure --gate`

## Non-goals

- The Claim Jumper stays an unarmed hulk.
- No retune of archetypes, the player, or global weapons. No change to the 1400 wu radius.
- No new encounter.


## v3 amendment (after plan-gate REJECT 390312bc)

- **No wing→Claim Jumper kill loop.** The damage gate already rejects same-team NPC hits unless `npcCrossfireAdmits` finds a `'reckless'` shooter (`src/combat/damage.js:33-45,187-188`; `src/ai/temperament.js:79-98` — reckless pilots fire through same-team hulls *that are not their own wingmates*). (a) Stamp the wing and the Claim Jumper as wingmates using whatever wingmate key that crossfire rule honours (find it where the "own wingmates" exclusion is evaluated; reuse it, do not invent one), so a wing round into the towed raider is rejected as `friendly_fire`. (b) Belt and braces in `_onRaidKilled` (`onboarding.js:3359-3366`): when `payload.killerId`/`ownerId === raid.ids.wing`, do not say "the raider broke off"; restage silently and count `raid.strayKills += 1`; a second stray resolves the beat exactly like the second gun kill (`_beatDone` + `momentumKill {cause:'stray'}`) so the beat always converges. Test: force a reckless wing temperament with the wingmate stamp removed → the stray path converges in ≤2 restages; with the stamp → zero `combat:damage` packets from wing to raider over a 60 s tow.
- **Restage fork named.** `_respawnRaidRaider(line, opts = {})` gains `opts.wing`: `'keep'` (default for gun-kill retry and drift restage — the wing stays and stays armed if it was armed; pressure during the retry is intended), `'disarm'` (player-death path `_onRaidPlayerDeath` — the wing, if alive, is set back to `roe:'hold_fire'` and re-arms on the next first latch), and the wing is never respawned once `raid.wingDone` (fled or killed). `_spawnRaidCast` keeps `_removeRaidActors` from deleting a kept wing (skip the `wing` slot when `opts.wing !== 'respawn'`).
- Cite fixes: `_resolveRaidDone` is `:3403`; `protectedStationAt` `:599-617`; station-protection deny `:181`.

## Approvals

- v1 REJECT 4964e62b (dead weapon mount); v2 amended — gate restarted
- v2: abc98e75 APPROVE, cd65c632 APPROVE, 390312bc REJECT (wing-credited raider kill loop; restage fork unnamed)
- v3: amendment section above — gate restarted
- v3: plan-gate reviewer 8c3dfd2c — APPROVE (2026-10-24)
- v3: plan-gate reviewer 04b9da1c — APPROVE (2026-10-24)
- v3: plan-gate reviewer 544bd39a — APPROVE (2026-10-24) — plan✓3
- implementer notes from v3 reviewers: the wingmate exclusion is `data.ai.squadId` in `src/ai/fireDiscipline.js:44-48` (lane hold, not a damage-gate reject) so clause (b) stray convergence is load-bearing; `entity:killed` carries `killerId` only; hook `_stepRaidWing` on the raid `_beatDone`
