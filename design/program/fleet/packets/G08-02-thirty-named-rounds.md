# G08-02 — Thirty rounds with names and a twist each

**Commission:** EC-G08 / EC-Z01. **Size:** medium. **Tier:** D.
**Do not start until C01-01 is BUILT** (both touch the Swarm round flow).

## Read first
- `git show origin/experience-commissions/EC-G13-integration-director:design/program/experience-commissions/12_SWARM_THE_PIT.md`
  — section "The Course — thirty rounds with names". Every round has a name and one twist.
  **Copy names and twists exactly.**
- `src/data/swarmLadder.js` and whatever `grep -rn "swarmEvents\|specialRound\|special_round" src` finds —
  the existing seam for special-round cards. Use it; do not build a second round system.
- `src/systems/survivalAnnounce.js` — how a round start is announced on screen.

## What to build
1. Frozen table `SWARM_COURSE` in new file `src/data/swarmCourse.js`: 30 rows
   `{ round, name, twist, twistId }` with the doc's text. `twistId` names which existing mechanic the
   twist uses (an existing mutator/event id). If a twist needs a mechanic that does not exist, set
   `twistId: null` and list it in the receipt — do not invent mechanics.
2. The round-start announcement shows **`ROUND 7 — <NAME>`** and the twist as a second line.
3. Every row with a non-null `twistId` applies that mechanic on its round, through the seam.

## Files you may edit
`src/data/swarmCourse.js` (new), `src/data/swarmLadder.js`, the swarm events/special-round file you
find, `src/systems/survivalAnnounce.js`, new test `test/swarm-course.test.mjs`. `git diff` first.

## Checks
- `node --test test/swarm-course.test.mjs`: 30 rows, unique names, round N's announcement is
  `ROUND N — NAME`, each non-null twistId resolves to a real mechanic.
- `node --test test/swarm*.test.mjs test/survival*.test.mjs` — report failures honestly.

Commit: `fleet(G08-02): Swarm's thirty rounds have names and twists`.
