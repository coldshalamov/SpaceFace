# Live Truth Snapshot (orchestrator-collected)

**Date:** 2026-07-17  
**Master HEAD (shared):** `f277c5e7`  
**Depth worktree:** dirty with integrity + A1/A2/S4 wiring (not committed)

## Worktrees

| Tree | Branch | Status |
|---|---|---|
| SpaceFace | master @ f277c5e7 | Menu/HUD dirty concurrent WIP — **avoid** |
| SpaceFace-depth-actualization | grok/depth-player-route-actualization | Integration + Depth progress |
| SpaceFace-graphics-overhaul | codex/graphics-overhaul | Thrusters/Kestrel/Helios surfaces — **peer** |

## Already proven green in depth worktree (this sprint)

| Gate | Result | Notes |
|---|---|---|
| check:depth-program:f2 | GREEN | Global-coord soak + zone patrol; indexes regenerated |
| check:depth-program:gt1:loot-audit | GREEN | 13 live combat tables pinned |
| check:depth-program:sp1 | GREEN | investigation destStation; 10 routes modeled |
| check:depth-program:k1 | GREEN | EMP dmg fix + fixtures |
| check:depth-program:a1 | GREEN | + physical Quiessence/Hush actors |
| check:depth-program:a2 | GREEN | pause → Ship's Ledger wired |
| check:depth-program:r1/r2/v1/v2/e1/s3 | GREEN focused | Natural unassisted routes still open |
| check:alpha:evidence:contract | GREEN | Live corpus N/A (no .devshots in clean worktree) |
| check:doctrine-distinct | GREEN | |
| check:data-refs | GREEN | |

## Product already landed (depth worktree, uncommitted)

- Encounter director harness M2 global-coord fix
- EMP disruptor 45→96 (disable verb)
- SP1 investigation_recover_box destStationId
- A2 pause Ship's Ledger screen
- S4 titlesSystem registered after story
- A1 physical POIs: poi_quiessence (+17 hulls), poi_hush

## Program backlog still open (candidate — verify live)

From `design/program/02_REMAINING_WORK.md` but **re-audit before DONE claims**:

- M0 evidence corpus, baselines, observatory B, asset integrity (0 accepted classifications)
- M1 Helios strict dock route, Focus/camera natural, HUD hierarchy, visual family
- M2 Electron seamless revalidation / region-data hash drift risk
- M3 recovery, 90-min careers, nav HUD
- M4 ecology string contract, families, Ashline decision
- M5 story B0–B7 ordinary, ownership public routes
- M6 perf, store capture, Wasp classification, visual defects
- Depth: natural R1/R2/E1/SP1/V1/V2/GT1, D1 carriers, S3/S4 full, art chunks TODO

## Failure classification examples already seen

| Failure | Class | Resolution |
|---|---|---|
| M4 ecology `main.js` `['world','regionalEcology']` | STALE/HARNESS | Contract expects debug list; registry order already correct |
| F2 soak 2 encounters | HARNESS | Local pos vs global zones |
| GT1 13≠8 tables | STALE | Content grew; pin live count |
| Alpha AGENTS MASTER_TASTE wiring | STALE | Front door redesigned |
| K1 EMP residual HP | REAL | Product dmg too low for disable verb |
| SP1 destStationId null | REAL | Mission could never complete |

## Mining

Implementation largely present (mining:2, drill, massline, careers). Treat as **polish/feel/onboarding** not greenfield. Do not rewrite while graphics thrusters land.

## Hard fences

- No assets/Blender/thruster material remaster (graphics worktree)
- No menu overhaul / input.js races with master dirty
- No station shell redesign
- No SF-injection primary acceptance
