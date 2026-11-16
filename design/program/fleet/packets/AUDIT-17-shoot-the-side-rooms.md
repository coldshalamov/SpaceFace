# AUDIT-17 — Photograph the two hidden Combat Lab rooms next to the Foundry

**Lane 4 (capture only — change no game code, commit nothing).** Read
`C:\Users\93rob\AppData\Local\Temp\praudit\FIX-BRIEF.md` first. Every game launch goes through
`node scripts/fleet/game-lock.mjs run -- <cmd>`. Output to `.devshots/audit-17/`.

## Why
PR #981 wanted the Combat Lab door to offer two more rooms, `ceres_belt` and `tethys_hub`
(`src/data/combatLabSetups.js` ~276-287, admitted by `src/systems/survivalWavePlanner.js` ~84). The
door hides them because they were judged unpolished (build_map.md §37.3). The lead must see them
beside the shipped room before deciding what finishing them means.

## Capture
For each arena in `helios_core` (the shipped Ricochet Foundry, the reference), `ceres_belt`,
`tethys_hub`: start a real Swarm run in that room at round 1 through the existing harness —
`npm run player-truth -- --mode=swarm --start-round=1 --arena=<id>` (read scripts/AGENTS.md and
scripts/player-truth/ for the exact flags and where it writes screenshots; if `--arena` refuses the
hidden rooms, find the existing dev route that admits them, e.g. a URL param read in
src/ui/crucibleLaunch.js or survivalArena, and use it without editing code).
Per room take: (1) the arena intro / overview frame, (2) mid-fight at ~20 s, (3) one frame showing
the room's edge or gates. Also run the door screen on the bench at 1440x900
(`node scripts/ui-bench.mjs --shot=crucible-door --viewports=1440x900`).
If a room cannot be entered at all, record the exact error.

Receipt + `.devshots/audit-17/INDEX.md`: per room, the commands, PNG paths, and one honest line on
what you see (is it a finished-looking place: dressing, landmarks, readable cover — or an empty
field with rocks?). Also list each room's swarm event table (`SWARM_EVENT_TABLES[<id>]`) and whether
it has a star gate in `SWARM_ARENA_STAR_GATES` (src/data/swarmLadder.js).
