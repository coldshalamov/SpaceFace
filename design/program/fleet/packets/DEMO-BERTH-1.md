# DEMO-BERTH-1 — "[E] Fly to berth" never flies a stranger away from the station

**For:** an investigator-fixer agent. **Kind:** reproduce, find the cause, fix it. Commit your own files.

On the Adventure demo route, after the opening throw, pressing E ('Fly to berth Helios Station')
sometimes flies the ship AWAY first: one run closed to 214 m, then flew out to 1.6 km and came back,
docking ~60 s after E (another run: 411 m -> out to 642 m -> 72 m at 74 s; a good run: 392 -> 74 m by
53 s, direct). The chip 'to the Helios Station berth · steer to take over' is up the whole time.
Evidence: `.devshots/first-ten/me-1/` frames and facts (distance to Helios per frame), lane-a2 and
lane-a3 runs beside it.

## Do
1. Find the berth autopilot (grep 'berthAutopilot', 'Fly to berth', src/ui/input.js ~409 handles E,
   src/ui/berthOffer.js, the docking corridor / approach code under src/systems). Read how it picks
   its target point (station centre, berth anchor, corridor mouth) and its approach path.
2. Reproduce headlessly if you can: the sim runs in Node (see scripts/bench-sim-fight.mjs and
   scripts/probe-sim-step.mjs for how to build a state); seed 4242 New Game, run the opening to the
   throw, issue the berth command from ~200-400 m, log the autopilot target and the corridor-mouth
   point each second for 60 s. If you cannot, reason from the code and the frames.
3. Fix the cause (for example: the corridor mouth is on the far side, so the path loops round; a
   stale target; a clearance radius that pushes out). A stranger who presses E 200 m from the
   station must be flown straight to the berth (around the hull if needed), never 1.5 km out.
4. Add a focused test of the fix. `npm run check:sim` must stay green (report if it moves; never
   re-record).

## You may edit
The berth autopilot / docking approach files you find, src/ui/berthOffer.js, src/ui/input.js (the E
handler only), and tests. Before editing a file run `git diff -- <file>`; if it has changes you did
not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>`
after. Never git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; the cause with file:line evidence; the fix (commit); the before/after distance
trace; tests and check:sim.
