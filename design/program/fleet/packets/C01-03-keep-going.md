# C01-03 — Win at thirty, then "Keep going": the endless run returns after the win

**Commission:** EC-C01 + owner direction ("see how far you can go", Zombies). **Size:** medium-large.
**Tier:** D. Follows C01-01 (ca74e15f, the win at round 30) and C01-02 (478a068a, tests retired).

## Lead decision
A Swarm run is **winnable at round 30** (keep everything C01-01 built) **and** the player may then keep
going, as far as they can last. C01-02 found that cutting the course at 30 made a great deal of
finished content unreachable (champions `quiet_choir` w60, `brood_queen` w70, `brood_tendril` w80,
`nest_carrier` w90, `casket_worm` w100, `furnace_maw` w110, `adjudicator_44c` w130, `hive_hulk` w140,
the escalated "II+" rotation; late brood families `remora`…`poxsac`; brood strains `volatile`,
`plated`, `commander`; and the rest listed in the C01-02 receipt under "Content now unreachable").
All of it comes back, past round 30.

## What the player must see
1. Clearing round 30 shows the win screen exactly as now (`THE PIT IS YOURS`, the win is recorded and
   banked) with **two buttons**: **`Take the win`** (ends the run — today's behaviour) and
   **`Keep going`** (round 31 starts after the normal between-round pause).
2. Past 30 the run follows the old endless course (the rotation, escalation, late broods and strains
   at their old wave numbers). The win is already banked: dying past 30 does **not** take the win away;
   the purse earned after 30 follows the ordinary death rule.
3. The HUD round counter past 30 reads `ROUND 31 · DEEP` (keep the existing style).
4. Records gain **`Deepest round`** (best round reached past 30), shown on the results screen and the
   Swarm records view next to wins and best win time.

## Tests
Restore the assertions C01-02 retired, from git history (`git show 478a068a^:<test path>`), adjusted so
they run in the post-win endless phase; delete the matching lines from `test/RETIRED_SWARM_ENDLESS.md`
(delete the file if it empties). Add `test/swarm-keep-going.test.mjs`: win at 30 → `Keep going` →
round 31 spawns from the old course; dying at 35 keeps the win and records deepest 35; `Take the win`
ends the run.

## Files you may edit
`src/data/swarm*.js`, `src/systems/survival*.js`, the Swarm results UI file (C01-01 named it),
the Swarm HUD round label owner, test files, `test/RETIRED_SWARM_ENDLESS.md`. `git diff` first.

## Checks
`node --test test/swarm*.test.mjs test/survival*.test.mjs test/crucible*.test.mjs` — the only failures
allowed are the 30 that were already failing (C01-02 receipt lists them).
Commit: `fleet(C01-03): win at thirty, then keep going as deep as you can last`.
