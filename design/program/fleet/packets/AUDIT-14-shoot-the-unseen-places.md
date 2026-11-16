# AUDIT-14 — Photograph the places nobody has looked at

**Lane 4 (capture only — change no game code).** Read
`C:\Users\93rob\AppData\Local\Temp\praudit\FIX-BRIEF.md` first. Every capture runs through the
lock: `node scripts/fleet/game-lock.mjs run -- <cmd>`. Write everything to
`.devshots/audit-14/` (git-ignored). Commit nothing.

## Why
These pieces landed from old PRs and were proven only by tests (build_map.md §37.4 item 9). The lead
will judge the pictures; you only produce honest, well-framed captures.

## Capture (each at 1920x1080 unless the tool fixes the size; arrival + a framed close view)
Tools: `scripts/fleet/looks/sector-shots.mjs` (`?sector=<id>&shot=1`, see scripts/AGENTS.md),
`scripts/fleet-look.mjs` (read its header for flags), `scripts/ui-look.mjs`. Read each tool's header.
1. Dione lane look (sector id containing `dione`; `src/data/lookMoods.js`, `sectorVisualProfiles.js`).
2. Hyperion Cut with the yard tow-out encounter (`src/data/encounters/346-yard-towout.js`) visible if
   it can be forced through an existing dev/eval route; otherwise the plain sector.
3. Kepler and Orcus sectors (causal chains `src/data/sectorCausalChains.js` ~694-887): the places the
   chains stage.
4. Ceres Belt: Old Hob's winch anchors with cables drawn (`src/systems/ceresAnchorWinching.js`), the
   Ninth Mouth pocket and lamp (`src/world/ceresNinthMouthBodies.js`), the quarantine yard capstan.
5. A Frontier stead with its receiving ring + tag (`src/missions/frontierReceivingTags.js`).
6. A player outpost with its annexes (`src/systems/automation.js` ~1495-1647), if an existing dev/eval
   route can grant one; else say so.
7. Gauntlet wave 20 plate theft (`src/systems/foundryPlateTheft.js`): Swarm has `?swarmRound=N`; check
   whether Gauntlet has a start-at-wave route (`player-truth --mode=gauntlet --start-round`?). If none,
   say so — do not build one.
For each: the command you ran, the PNG paths, one line on what is in frame, and whether the feature
itself is visible (yes / no / could not stage, why).

Receipt at the path the runner names, plus a copy at `.devshots/audit-14/INDEX.md`.
