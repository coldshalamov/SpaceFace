# INV-25 — Places with different vibes, and things to do

> **READ-ONLY investigation (director, 2026-11-19).** Change NO tracked file and make NO git writes.
> Read code, data, tests and docs; you may run read-only commands and single focused tests. Write your
> findings to your RECEIPT.md with `file:line` evidence for every claim. Be concrete and critical:
> the owner wants a game that sells. Combat is the atomic loop; everything else serves the dogfight.

**Context:** SpaceFace is a top-down 2.5D physics space game (browser + Electron): fly, fight, mine, trade,
build. Two doors: **Swarm** (a Crimsonland/Zombies horde arena with fast build specialisation) and
**Adventure** (Freelancer-style open world → mining → building → empire). The design authority is
`design/overhaul/` (start with `01_THE_GAME.md`, `00_RULINGS.md`); `ARCHITECTURE.md` is the code contract;
`docs/ORIENTATION.md` and `docs/MODULE_MAP.md` map the repo.

**Question:** Do the regions and sectors feel like different places a player wants to explore, each
with its own look, mood and things to do? Examine sector/region data (`src/data/sectors*.js`,
`src/data/regions*.js`, `src/data/lookMoods.js`, skies and backgrounds `src/render/spaceBackground.js`,
set dressing, points of interest, microevents, NPC activity), and what a player can DO in each place
(missions, mining, salvage, races, events). Compare with `design/overhaul/05_ADVENTURE.md` and
`07_LOOK_AND_LIGHT.md`. Which places are memorable, which are interchangeable or empty, and what would
make each one distinct and alive?

## Output (RECEIPT.md)

1. **What exists** — a short inventory of the systems you examined (file:line).
2. **What a player feels today** — the honest experience, as a player would describe it, with the code
   reason for each feeling.
3. **Gaps against the design** — where the code falls short of `design/overhaul/` (cite the section).
4. **The ten highest-impact fixes**, ranked by (player impact) ÷ (cost). For each: the change in one
   sentence, the files and functions, the size (S/M/L), the risk, and how to verify it on screen or in a
   test. Prefer fixing what exists over building new systems.
5. Anything broken you found on the way (bugs, dead code paths, unwired features) with file:line.
