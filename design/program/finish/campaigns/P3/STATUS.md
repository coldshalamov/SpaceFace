# P3 — one pilot, one progression — status

**2026-11-06, Lane 4 (SHIP). Stop point: waiting for the owner's approval.**

## Done

- `DIAGNOSIS.md` — the four progressions that never meet, measured (35 research nodes in 4 branches,
  6 Crucible perks, the Swarm draft, career/standing), and why the design, not a bug, is the
  bottleneck.
- `PILOT_TREE.md` — the design doc the master plan asks for **before** implementation:
  - **one pilot level** fed by Adventure, Crucible and Swarm (one XP bank);
  - **five verb branches** — Gunnery, Line Work, Piloting, Engineering, Salvage & Trade;
  - **40 nodes**, 8 per branch, every one a verb change with a preview sentence, plus the list of
    rejected node types ("+8% damage") and why;
  - research re-cast as the **blueprint catalogue** (where parts come from), run perks kept
    run-scoped but tagged with the same five words;
  - the level curve (level 5 inside the first hour), point costs, no respec trap;
  - the screen plan (pilot strip on the Ship Sheet, pilot page in the Record band);
  - the implementation plan: one owner (`src/systems/pilot.js`), one data file
    (`src/data/pilotTree.js`), a save migration that keeps research as blueprints and awards
    retroactive XP from counters the save already holds, verbs wired one branch at a time.

## Waiting on

**The owner.** `PILOT_TREE.md` §7 asks for four decisions: the five branches and 40 nodes, one
pilot level from every mode, research as the blueprint catalogue, and the level-5-first-hour pace.

## Not started (by design)

No `src/` file was created or edited for P3. Nothing is half-wired: the tree is data plus verbs, and
the first commit after approval should be the data file and the owner module, not a screen.
