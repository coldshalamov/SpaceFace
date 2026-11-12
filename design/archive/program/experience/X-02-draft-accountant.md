# X-02 draft — The Accountant

## Rejected

Arming the Claim Jumper is out. Live AI drives the hull every tick and cancels the tow
(`onboarding.js:3254`, `tacticalAI.js:382,1221`). The shooter is a **second staged actor**.

## Proposal

All changes are in `src/systems/onboarding.js`.

- `_enterRaidBeat` (`:3194`) gets a new id slot, `gunner: null`. `_removeRaidActors` loops every
  slot, so restage, death and drift also clear the gunner.
- `_spawnRaidCast` (`:3214`): when `!clinic`, spawn
  `makeEnemySpawnSpec('wasp_swarmer', 1, at(300, -0.6))` as "Claim Jumper's Wing": hull 60,
  shield 0, `weapons [{id:'wpn_pulse_laser_s', dmgOverride:2, rofOverride:2}]`, `roe
  'weapons_free'`, `preferredRange 300`, `raidRole 'gunner'`. The clinic retry stays unarmed.
- In the `_resolveRaidDone` tick, add `_stepRaidGunner()`. When `hull/hullMax <= 0.30` or the beat
  is done, it sets `ai.forceFlee = true` and `roe = 'hold_fire'` and speaks "Wing's cut — he's
  running." once. From there `doctrine.js:111` FLEE and `egressExit.js:69` (960 wu → `despawnAt`)
  finish it, since the actor is not encounter-owned.
- In `_onRaidKilled`, a gunner kill only nulls its slot. It never completes or restages the beat.

## Numbers

- 4 dps raw, about 2.4 landed at 60 % hits. That breaks the Hitch's 55 shield in about 23 s;
  regen is 7/s after 3 s without a hit.
- The 140 hull then lasts about 58 s more, so time-to-kill is about 80 s against a 30–60 s beat.
- Gun heat runs 16/s against 12 dissip, so it self-vents at about 25 s.
- The 30 % flee line is 18 hull. The starter pulse breaks the wing in about 1.5 s.

Teeth, not lethal. Only spawn-spec numbers change.

**Risk:** `impulsePerHit 84` may nudge the swing. Measure on `pq-163-03/04`; zero it in the spec if
needed.

## Determinism and save

No `state.rng` draw (the bearing reuses `ang`). Entity ids shift, so rail digests need a
deliberate re-record. `legacy47a` skips it (`!ob.rescue`). Nothing is saved.

## Tests

- Add `test/x02-raid-gunner.test.mjs`: it fires at the player, flees at ≤30 %, is absent in
  clinic, and is removed on restage.
- Re-check `rc-458-round1-budget` `{raider:2}`. Count the gunner or exempt `raidRole`.
- Keep green: the raid pins listed in the audit.

**Verdict: shippable, M.**
