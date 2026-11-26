# CAM-AUDIT-EXPERIENCE-1 — professional polish and creative finishing audit

**For:** Gemini Neon 2. **Kind:** READ-ONLY creative/product investigation. Change no tracked file, create no worktree, do not commit. Write findings only to your RECEIPT.md. You may write ignored evidence artifacts under `.devshots/` only if a tool naturally produces them.

The owner wants SpaceFace to feel professional, sleek, creative, and finished — not just mechanically pass tests. The core concept is strong, but implementations are uneven and some areas are sparse. Your job is to look at the game as a demanding player/director would and produce a ranked polish map that later implementation lanes can execute.

## Read first

1. `AGENTS.md`
2. `design/overhaul/01_THE_GAME.md`
3. `design/overhaul/00_RULINGS.md`
4. `design/overhaul/02_INSPECTION_LEDGER.md`
5. `design/overhaul/03_COMBAT.md`, `04_SWARM.md`, `05_ADVENTURE.md`, `07_LOOK_AND_LIGHT.md`, `08_INTERFACE.md`
6. `design/overhaul/17_AGENTIC_CAMPAIGN.md`
7. `.devshots/director/demo/RESUME.md` if present

Also inspect recent contact sheets/reports under `.devshots/demo/`, `.devshots/director/`, and relevant fleet receipts. You may use `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=<id>` for a small number of static screen captures if that helps you judge UI. Do not boot the full game for this audit and do not run long performance probes.

## What to judge

Prioritize the player's first hour and the demo route:

1. title/loading/first minute;
2. Swarm rounds, teaching, death, Again, refit/run-over;
3. combat readability: ships, hits, enemy intent, effects, the Line, powers;
4. HUD/menu/station/map/pause quality and consistency;
5. Adventure opening: rope, berth, mining, first job, station, undock;
6. places/world identity and sparse or unfinished implementations;
7. which INFERENCE-style finish/remove/class/plant work would visibly improve existing play without feature spray.

## Output required

Produce a ranked task bank. Each row must include:

- player-facing problem or opportunity in plain language;
- why it matters now;
- evidence seen (document, capture, receipt, or UI bench frame);
- creative direction: what "professional" should feel like here;
- likely implementation seam/department;
- collision risk with current dirty files if known;
- proof required after implementation;
- type: mechanical / taste-sensitive / INFERENCE-finish / INFERENCE-remove / INFERENCE-class / INFERENCE-plant / expansion-later.

Separate recommendations into:

1. **Demo-critical** — must be right before showing the game;
2. **Professional polish** — high value once the demo path is stable;
3. **Creative enrichment** — sparse areas worth finishing;
4. **Do later** — expansion that would currently add mess.

Do not simply restate old plans. Reconcile them with what a player would notice now. Be opinionated. If something conceptually strong is badly implemented, say so plainly.

## Receipt format

Use the normal receipt headings, and inside **What the player now sees or feels** write "READ-ONLY audit; no player-facing change." Add these sections before **What is left**:

```
## Stranger's-eye critique
## Ranked task bank
## Creative direction themes
## What not to build yet
## Evidence inspected
```

This is a taste and product audit. Do not write code or edit plans.
