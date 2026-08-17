<!-- LIFETIME: VOLATILE -->
# Orphan harvest ledger

```yaml
opened: 2026-08-17
playbook: design/program/ORPHAN_HARVEST_PLAYBOOK.md
status: open
```

This is the campaign checkpoint. A copy or unused model with no row is
still lost. Update the row when you classify, and again when you
MERGE / CHECKPOINT / DROP / ADAPT.

Dispositions and anti-loop rules live in the playbook, not here.

## Track A — orphan copies (`C:\sf-agents`)

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| A-ac01 | `C:\sf-agents\ac01-kill-economy` | unclassified | open | Arcade Core kill bursts / credit chips; not found on origin as of open | classify vs master |
| A-ac02 | `C:\sf-agents\ac02-universal-vacuum` | unclassified | open | pickup attraction; leftover clone, not a live worktree | classify vs master |
| A-ac03 | `C:\sf-agents\ac03-kill-rp` | unclassified | open | hostile kills through RP writer; leftover clone | classify vs master |
| A-ac04 | `C:\sf-agents\ac04-readable-tumble` | unclassified | open | readable tumble | classify vs master |
| A-ac05 | `C:\sf-agents\ac05-juice-discipline` | unclassified | open | combat juice discipline; leftover clone | classify vs master |
| A-ac06 | `C:\sf-agents\ac06-physics-arsenal` | unclassified | open | marked / transient mass response | classify vs master |
| A-ac07 | `C:\sf-agents\ac07-massline-honesty` | unclassified | open | honest Massline release | classify vs master |
| A-ac08 | `C:\sf-agents\ac08-kill-causes` | unclassified | open | physical kill styles | classify vs master |
| A-ac09 | `C:\sf-agents\ac09-death-signatures` | unclassified | open | readable deaths | classify vs master |
| A-ac10 | `C:\sf-agents\ac10-combat-pacing` | unclassified | open | populated-island combat contact | classify vs master |
| A-ac11 | `C:\sf-agents\ac11-starter-envkill` | unclassified | open | Hitch starter environment kill | classify vs master |
| A-ac12 | `C:\sf-agents\ac12-vacuum-inhale` | unclassified | open | vacuum pickups into hull | classify vs master |
| A-ac13 | `C:\sf-agents\ac13-planets` | unclassified | open | (tip message collided with inhale; verify) | classify vs master |
| A-ac13r | `C:\sf-agents\ac13-planets-reroute` | unclassified | open | physical credited planet plunges | classify vs master |
| A-ac14 | `C:\sf-agents\ac14-living-chain` | unclassified | open | Ceres living ore chain | classify vs master |
| A-ac15 | `C:\sf-agents\ac15-wing-cargo` | unclassified | open | broken wings flee and dump cargo | classify vs master |
| A-ac16 | `C:\sf-agents\ac16-mote-pack` | unclassified | open | Mote swarm pack | classify vs master |
| A-ac17 | `C:\sf-agents\ac17-force-legibility` | unclassified | open | hostile anchor snares | classify vs master |
| A-ac18 | `C:\sf-agents\ac18-damage-dressing` | unclassified | open | persisted hull damage dressing | classify vs master |
| A-ac19 | `C:\sf-agents\ac19-market-continuity` | unclassified | open | market regime blend; one dirty test delete | classify vs master |
| A-ac20 | `C:\sf-agents\ac20-wanted-lifecycle` | unclassified | open | leftover clone; tip reused AC-03 message | classify vs master |
| A-ac-close | `C:\sf-agents\arcade-core-20` | unclassified | open | “campaign closed” docs on an unmerged branch | classify vs master; do not trust the close |
| A-ac-husk | `C:\sf-agents\arcade-core-20-incomplete-20260815` | junk? | open | gitless partial assets copy | confirm no unique bytes, then DROP |
| A-kestrel-audit | `C:\sf-agents\kestrel-a-list-audit` | junk? | open | empty leftover `.git` husk | confirm empty, then DROP |
| A-land | `C:\sf-agents\land-stale` | unclassified | open | leftover menu polish / honesty scripts | classify vs master |
| A-plan60 | `C:\sf-agents\plan60-kimi-review` | unclassified | open | Ceres gate-ring time trial | classify vs master |
| A-pr94 | `C:\sf-agents\pr94-policy-sparse` | unclassified | open | inference verification policy | classify vs master |
| A-pr95-ace | `C:\sf-agents\pr95-ace` | unclassified | open | named ace escapes | classify vs master |
| A-pr95-all | `C:\sf-agents\pr95-all` | unclassified | open | Arcade Core wave 2 plans 32–35 | classify vs master |
| A-pr95-hud | `C:\sf-agents\pr95-hud` | unclassified | open | quiet combat HUD; one dirty gameState hunk | classify vs master |
| A-pr95-log | `C:\sf-agents\pr95-logistics` | unclassified | open | dock-session market recovery | classify vs master |
| A-pr95-mkt | `C:\sf-agents\pr95-market-qol` | unclassified | open | gitless leftover tree | classify or DROP |
| A-pr95-skitter | `C:\sf-agents\pr95-skitter` | unclassified | open | gitless leftover tree | classify or DROP |
| A-pr95-swarm | `C:\sf-agents\pr95-swarmers` | unclassified | open | distinct swarmer tells | classify vs master |
| A-pr95-val | `C:\sf-agents\pr95-validation` | unclassified | open | arcade-core validation battery | classify vs master |
| A-basevis | `C:\sf-agents\baseline-vis` | unclassified | open | detached full checkout at current HEAD | confirm no unique dirty work, then DROP if clean |

Refresh this table if `git worktree list` or `C:\sf-agents` gains or
loses a folder. Do not delete a row; mark `DROP` and date it.

## Track B — unused models in the main project

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| B-hitch-v9 | V9 Hitch source vs V7 compressed release | near-done | open | Later Hitch polish (greenhouse, antennas, trays, hatch, heat skirts) is not on the ship you fly | First model unit: rebuild release + render package from V9 source |
| B-factory | `assets/ships/fleet_player_bodies_v1` | partial | open | Newer remakes of Hornet and most other flyables are not live | Review per ship; wire only if it beats live; else PQ-050 |
| B-traffic | `*_production_v1` traffic bodies | near-done? | open | Newer traffic files exist; live still uses older bodies after an invisible-ship failure | Wire only with release identity + load proof |
| B-markings | `assets/ships/foundry/spacepunk_markings_v1` | done-unwired | open | Stencil atlas exists, not on any hull | Story-grounded subset on one family, or CHECKPOINT |
| B-ceres-props | untracked Ceres render packages | near-done? | open | Yard props packaged, not placed | Place via place/render-package route, or CHECKPOINT |
| B-liner | `assets/ships/massline_express_liner_v1` | partial | open | Brief + donor only | CHECKPOINT to PQ-049 |
| B-blocked-acc | `wholeships/pelican.glb`, `wasp.glb` | junk | open | Accessory-only, no hull | DROP from live maps; never wire |

## Closeout

- [ ] Every Track A row is MERGE, CHECKPOINT, DROP, or ADAPT
- [ ] Every Track B row is MERGE, CHECKPOINT, DROP, or ADAPT
- [ ] Every MERGE commit is on the current branch and pushed
- [ ] Hitch later polish is on the compressed live ship, or B-hitch-v9 says why not
- [ ] `C:\sf-agents` holds only live writers or named preserved donors
- [ ] Campaign `RESULT: DONE` only after the boxes above
