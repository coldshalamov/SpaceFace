# INV-22 — Guns and hits: does shooting feel good?

> **READ-ONLY investigation (director, 2026-11-19).** Change NO tracked file and make NO git writes.
> Read code, data, tests and docs; you may run read-only commands and single focused tests. Write your
> findings to your RECEIPT.md with `file:line` evidence for every claim. Be concrete and critical:
> the owner wants a game that sells. Combat is the atomic loop; everything else serves the dogfight.

**Context:** SpaceFace is a top-down 2.5D physics space game (browser + Electron): fly, fight, mine, trade,
build. Two doors: **Swarm** (a Crimsonland/Zombies horde arena with fast build specialisation) and
**Adventure** (Freelancer-style open world → mining → building → empire). The design authority is
`design/overhaul/` (start with `01_THE_GAME.md`, `00_RULINGS.md`); `ARCHITECTURE.md` is the code contract;
`docs/ORIENTATION.md` and `docs/MODULE_MAP.md` map the repo.

**Question:** Does every gun feel distinct and satisfying, from the first starter pistol to late weapons?
Examine `src/data/weapons.js`, `src/data/gunFamilies.js` (families: hose, pew, burn, needle, thump, boom,
trick), `src/systems/weapons.js` (fire, heat, vent, gimbal, spread), projectile flight, impact
presentation (`src/render/vfx/weaponImpactVfx.js`, `src/render/feel.js`), weapon audio cues
(`src/audio/`), and the ruling R5 "every gun trades damage for kick" (`design/overhaul/03_COMBAT.md` §3).
Check: time-to-kill per family, readability of hits on the target, heat as a rhythm or a punishment,
the muzzle/projectile look, sound, and the first-minute experience with the starting gun in Swarm and
Adventure.

## Output (RECEIPT.md)

1. **What exists** — a short inventory of the systems you examined (file:line).
2. **What a player feels today** — the honest experience, as a player would describe it, with the code
   reason for each feeling.
3. **Gaps against the design** — where the code falls short of `design/overhaul/` (cite the section).
4. **The ten highest-impact fixes**, ranked by (player impact) ÷ (cost). For each: the change in one
   sentence, the files and functions, the size (S/M/L), the risk, and how to verify it on screen or in a
   test. Prefer fixing what exists over building new systems.
5. Anything broken you found on the way (bugs, dead code paths, unwired features) with file:line.
