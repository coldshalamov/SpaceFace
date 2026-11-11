# PARK-01 — Land the parked overnight work (tender haul fork, store sentence) without breaking replay

**Tier:** D (lead reviews). **Size:** medium.

## Situation
An overnight agent left ~4,000 lines uncommitted in the shared folder (missions: a "tender haul" job
with a physical fork; onboarding: the store sentence delivered at the first dock; HUD and mission-log
touches; an `economySlicing` flag flipped on; a new 47-A reference set). Its own tests pass (32/32)
and the game boots with it. But with it present, `npm run check:sim` (the deterministic 47-A replay)
**drifts** from the pinned v26 hash; without it, check:sim passes. The lead preserved it, byte for
byte, as one commit on branch `parked/overnight-lane-b-2026-11-09` (also on origin), and cleared it
from the folder.

## Job
1. See what it contains: `git show --stat parked/overnight-lane-b-2026-11-09`.
2. Bring its files back into the working tree **one file at a time** with
   `git show parked/overnight-lane-b-2026-11-09:<path> > <path>` (never `git checkout`/`merge`).
3. Find which part causes the check:sim drift: restore groups (the `simCoreFlags.js` flag; the mission
   files; onboarding/HUD) and run `npm run check:sim` after each group.
4. For each part that drifts the replay, decide with evidence:
   - if the drift is the **intended** result of a gameplay change (e.g. new jobs on the board change
     what the 47-A tape sees), follow the repository's reference process to record a new reference
     version openly (`grep -n "references" test/AGENTS.md scripts/AGENTS.md` for the process) — never
     edit an existing expected file to match;
   - if it is accidental (e.g. the economy flag), leave that part out and say why.
5. Land what is sound in one or two commits by exact path. Run `npm run gate` (if it exists) or
   `npm run check:playable` and `npm run check:sim` at the end; both must pass.

## Files you may edit
Only the files in that parked commit, plus a new reference version directory if step 4 calls for it.

Commit: `fleet(PARK-01): land the tender haul fork and the dock store sentence`.
