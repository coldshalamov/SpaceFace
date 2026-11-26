# INV-23 — Adventure: the first ten minutes

> **READ-ONLY investigation (director, 2026-11-19).** Change NO tracked file and make NO git writes.
> Read code, data, tests and docs; you may run read-only commands and single focused tests. Write your
> findings to your RECEIPT.md with `file:line` evidence for every claim. Be concrete and critical:
> the owner wants a game that sells. Combat is the atomic loop; everything else serves the dogfight.

**Context:** SpaceFace is a top-down 2.5D physics space game (browser + Electron): fly, fight, mine, trade,
build. Two doors: **Swarm** (a Crimsonland/Zombies horde arena with fast build specialisation) and
**Adventure** (Freelancer-style open world → mining → building → empire). The design authority is
`design/overhaul/` (start with `01_THE_GAME.md`, `00_RULINGS.md`); `ARCHITECTURE.md` is the code contract;
`docs/ORIENTATION.md` and `docs/MODULE_MAP.md` map the repo.

**Question:** Would a stranger who buys the game understand it and want to keep playing after ten
minutes of Adventure? Trace the ordinary route from the title (`src/ui/bootEntry.js`, the title and
menu screens) through New Game, the first flight, the first teaching moments (`src/ui/hudAttention.js`,
teach/first-use lines, tutorials), the first mission or contract, docking, the first purchase. Compare
with `design/overhaul/05_ADVENTURE.md`, `08_INTERFACE.md` and what players expect from games they know
(clear first goal, controls taught by doing, early win, a hook into the next hour). Note every moment
that is confusing, empty, slow, wordy or broken.

## Output (RECEIPT.md)

1. **What exists** — a short inventory of the systems you examined (file:line).
2. **What a player feels today** — the honest experience, as a player would describe it, with the code
   reason for each feeling.
3. **Gaps against the design** — where the code falls short of `design/overhaul/` (cite the section).
4. **The ten highest-impact fixes**, ranked by (player impact) ÷ (cost). For each: the change in one
   sentence, the files and functions, the size (S/M/L), the risk, and how to verify it on screen or in a
   test. Prefer fixing what exists over building new systems.
5. Anything broken you found on the way (bugs, dead code paths, unwired features) with file:line.
