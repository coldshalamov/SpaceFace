# X-02 draft — The Skeptic

**Verdict.** Nothing on the rail shoots back, so every hostile on it can safely be ignored. The Claim Jumper
must stay an unarmed hulk, because a live AI drive cancels the tow (`onboarding.js:3254`). The teeth have to
be a **separate actor**.

**Proposal — "Jumper's Wing"** (the staged actor's own spawn spec only).
- **Spawn.** In `_spawnRaidCast` (`onboarding.js:3213-3299`), add slot `raid.ids.wingman`:
  `makeEnemySpawnSpec('wasp_swarmer', 1, at(520, -0.6))`, hull/hullMax 90, shield 0.
  - Weapons `[{id:'wpn_pulse_laser_s', dmgOverride:3, rofOverride:3}]`: 9 raw dps, 4.5 on Standard.
  - That is 40 s or more to kill an idle Hitch (55 shield + 140 hull). The hits register as damage, but the
    lesson survives.
  - Spec flags: `onboardingRaid:true`, `roe:'hold_fire'`, `preferredRange:320`.
- **Arm.** `_onRaidLatched` (`:3315`) flips the wing to `weapons_free` on the first latch of the Claim
  Jumper, so the pressure arrives mid-swing.
- **Flee.** `_resolveRaidDone` runs each tick (`:2067`). At wing hull ≤ 27 (30%) it sets
  `ai.forceFlee = true` (`doctrine.js:111-121`) and `raid.wingmanFled = true`. The wing says "Claim's cold.
  I'm gone." and `egressExit` despawns it at 960 wu or more. This mirrors 1207 (`:322-327`).
- **Restage.** `_removeRaidActors` already sweeps every `raid.ids` key. A restage does not respawn a fled
  wing: you drove it off.

**Poke → reward.**
- Shoot it to 30% and it visibly breaks and runs.
- Gun it down before 960 wu for a light burst (one 40–90 cr chip plus scrap).
- Throw the Claim Jumper into it for existing whip credit (`combat.js:980-1007`).
- Latch the wing and it cuts your line (`tacticalAI.js:1221`). That teaches why the hulk is the one to
  throw.

Beat completion is untouched, because those handlers filter on `raid.ids.raider`.

**Regression risk.**
- This is an armed hostile in an `enemyDensity 0` sector (`sectors.js:58-60`). Engagement authority may veto
  its fire, so read `COMMON_BUGS` first.
- The seed-4242 stranger pilot must still earn the latch and raid milestones inside budget while taking chip
  damage.

Keep green:
- `inf-061-raid-discovery`, `rescue-opening:299`
- `pq-163-03/04`, `pq-163-opening-choice-pacing`
- `rc-458-first-half-hour`, `rc-458-round1-budget`
- `missing-three`, `first-hour-choice-contracts`
- `wave-b10-throw-determinism`
