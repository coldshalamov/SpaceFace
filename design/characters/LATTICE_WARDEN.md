# Lattice Warden / MTS Survey Cell 9 — the trap architect

**Implemented:** a mid-game capital hunt delivered as source, not a plan-only boss. The fight is a
capital-score encounter (`src/data/encounters/capital-boss/lattice-warden.js`) executed by the same
Tollman machinery, with its lattice state riding inside the fight record so saves round-trip it.
No existing character, mission, pull list, or player hull is replaced.

## The reason to make this

SpaceFace's capital fights ask the player to read a hull. The Lattice Warden asks the player to
read a ROOM. It is a rogue lane-marking automaton — the same survey machine breed the Lane Guild
once licensed to stake salvage corridors for Meridian freight — still running its survey program
long after the Working Light collapse made the survey obsolete. It does not hate you. It has
measured you, found you inside its cell, and will now close the lane around you with the patience
of a machine that was built to wait.

## What it is in the fiction

An MTS survey platform, hull class roughly capital-adjacent, re-tasked by nobody. It drives three
**stakes** — breakable tether-lattice nodes — in a triangle around whatever it is surveying, then
measures. In the old days the measurement updated a lane chart. Now the measurement IS the attack:
the intact cell is the targeting solution for its Phase Lance, and a ship inside when the lance
lands takes the collapse packet straight through the hull.

## Personality and voice

Cold, procedural, and faintly courteous — a form letter delivered by a machine that outlived its
forms. Voice lines are prefixed `LATTICE WARDEN:` and read like survey telemetry, not taunts:

- On deploy: `Survey cell bound. Hold position.`
- On hold-fire inside the cell: `Measurement in progress. Do not interfere.`
- On a broken stake: `Stake lost. Survey void.`
- On collapse: `Lane closed.`

The personality does the mechanic's work: the player learns that the machine literally asks them
to hold still so it can kill them, and that breaking a stake is not damage output — it is
interrupting a survey.

## The fight, mechanically

- **Deploy.** The score emits `latticeDeploy`; the mission-owned spawn port lands three nodes
  (hull 150, radius 10) in a triangle around the target at deployRadius 150. Stakes are real
  entities — persistent, tetherable, mission-tagged — never cosmetic.
- **Survey.** While the target sits inside an intact cell, the Warden holds position and holds
  fire. Geometry is the weapon; the hold is the tell.
- **Lance.** Outside the cell, or after the survey, the Warden telegraphs the Phase Lance
  (>=138-tick tell). Inside an intact cell when it lands, the collapse packet detonates;
  a straight-line escape lane still punishes.
- **Counter.** Kill any ONE stake and the armed lance cancels, the cell voids, and the Warden
  staggers for 150 ticks under `status_unmoored` — long enough to throw mass or leave.
- **Re-stake.** Deploys are finite (`maxDeploys: 3`). A Warden that cannot re-stake is a hull.

## The model and the field

The forge hull (`tools/blender/forge/ships/lattice_warden.py`) is a slim teal-lit spindle with a
tri-vane projector collar — three blades at ±56° yaw around the nose, each carrying an emitter
lens — so the silhouette says "survey tripod weaponized" before the fight starts. In game,
`src/render/latticeWardenTethers.js` draws the live field: three world-space beams run from the
collar to each live stake, stake glints pulse, the collar band brightens into the lance tell, and
the collapse flashes once before the field goes dark. Everything honors motionReduce/flashReduce.

## Placement

Normal route, no endgame unlock: `CAPITAL_HUNTS` posts "Throw the Lattice Warden down" on
**station_drift** (Pallas Drift, MTS, riskTier 2) — the first mid-game capital hunt that is not
an endgame pull. Completion accepts `throw_the_capital` or `outgun_the_capital`; the kill's
trophy is a **Warden Stake Core** (`cmdty_warden_stake_core`) — one intact stake salvaged from
the collapsed cell, salvage-only so it exists to be carried, not traded.

## What it teaches

Geometry is readable. A boss can hold fire as a threat. And a machine that has been measuring
lanes for a century will still take the measurement personally.
