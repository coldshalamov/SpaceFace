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
| A-ac01 | `C:\sf-agents\ac01-kill-economy` | done | MERGE 2026-08-17 | Victim-scaled kill bursts + physical credit chips now on current owners. Surgical port; did not take their whole visualFactory. 24 focused tests green. | Keep worktree until pushed; then DROP the copy |
| A-ac02 | `C:\sf-agents\ac02-universal-vacuum` | near-done | CHECKPOINT | New `pickupAttraction.js` not on master. Leftover clone, not a live worktree. | Port after AC-01 family; one review + mining-owner apply |
| A-ac03 | `C:\sf-agents\ac03-kill-rp` | near-done | CHECKPOINT | Routes kills through RP writer; depends on `killRewards`. Leftover clone. | After AC-01 if that merges |
| A-ac04 | `C:\sf-agents\ac04-readable-tumble` | partial | CHECKPOINT | Tip edits live `tumbleStatus` / `tumbleStates`. Master already has tumble. | Diff tip vs current tumble; keep only unread consequences |
| A-ac05 | `C:\sf-agents\ac05-juice-discipline` | partial | CHECKPOINT | Leftover clone; 60 src files vs shared fork. | Extract tip-only juice rules; do not merge fork |
| A-ac06 | `C:\sf-agents\ac06-physics-arsenal` | near-done | CHECKPOINT | 3-file fields patch applies cleanly. Unreviewed vs later field work. | One review panel then MERGE or DROP |
| A-ac07 | `C:\sf-agents\ac07-massline-honesty` | superseded | DROP 2026-08-17 | Tip removes the 15% taut-sling flourish. Later master tests/probe/camera require that flourish. Opposing policy, not lost honesty. | Safe to delete worktree after receipt; do not port |
| A-ac08 | `C:\sf-agents\ac08-kill-causes` | near-done | CHECKPOINT | New `killCause.js` absent on master. Depends on AC-01 rewards. | After AC-01 |
| A-ac09 | `C:\sf-agents\ac09-death-signatures` | partial | CHECKPOINT | Edits live `vfx.js` / phased explosions. | Review vs current VFX owners; do not overwrite dirty VFX |
| A-ac10 | `C:\sf-agents\ac10-combat-pacing` | near-done | CHECKPOINT | New island-contact encounter file absent on master. | Review + port encounter only |
| A-ac11 | `C:\sf-agents\ac11-starter-envkill` | partial | CHECKPOINT | Edits `newGameDefaults` / starter builds. | Review before touching starter |
| A-ac12 | `C:\sf-agents\ac12-vacuum-inhale` | near-done | CHECKPOINT | New `pickupCaptureWave.js` absent on master. | Review + port after mining-owner check |
| A-ac13 | `C:\sf-agents\ac13-planets` | junk | DROP 2026-08-17 | Tip is a copy of AC-12 inhale, not planets. | Delete when A-ac12 is harvested |
| A-ac13r | `C:\sf-agents\ac13-planets-reroute` | partial | CHECKPOINT | Planet runtime + planets data. Real planet plunge work. | Review vs current planetRuntime |
| A-ac14 | `C:\sf-agents\ac14-living-chain` | partial | CHECKPOINT | Ceres living ore chain; edits traffic/encounters. | Review vs PQ-048 live Ceres |
| A-ac15 | `C:\sf-agents\ac15-wing-cargo` | partial | CHECKPOINT | Wing morale cargo dump. Master already has wingMorale. | Diff tip vs current wingMorale |
| A-ac16 | `C:\sf-agents\ac16-mote-pack` | near-done | CHECKPOINT | Mote swarm encounter; new encounter file missing on master. | Review + port encounter |
| A-ac17 | `C:\sf-agents\ac17-force-legibility` | partial | CHECKPOINT | Hostile anchor snares; edits enemies + fields. | Review with A-ac06 |
| A-ac18 | `C:\sf-agents\ac18-damage-dressing` | near-done | CHECKPOINT | New `shipDamageDressing.js` absent on master. Quality-sensitive. | Visual review before wire |
| A-ac19 | `C:\sf-agents\ac19-market-continuity` | near-done | CHECKPOINT | 3-file economyCycles patch applies cleanly. Unreviewed. | One review panel then MERGE or DROP |
| A-ac20 | `C:\sf-agents\ac20-wanted-lifecycle` | junk | DROP 2026-08-17 | Clone whose tip is a second copy of AC-03. | Delete with A-ac03 |
| A-ac-close | `C:\sf-agents\arcade-core-20` | junk | DROP 2026-08-17 | Tip is docs-only “campaign closed”. Packets live in A-ac01–19. | Delete after those rows are terminal |
| A-ac-husk | `C:\sf-agents\arcade-core-20-incomplete-20260815` | junk | DROP 2026-08-17 | Gitless partial factory-asset copy. No Hornet body. Not a source of unique ships. | Safe to delete folder |
| A-kestrel-audit | `C:\sf-agents\kestrel-a-list-audit` | junk | DROP 2026-08-17 | Empty leftover `.git` only. | Safe to delete folder |
| A-land | `C:\sf-agents\land-stale` | partial | CHECKPOINT | Menu polish on already-dirty UI files in the main tree. | Do not overwrite current UI dirty hunks |
| A-plan60 | `C:\sf-agents\plan60-kimi-review` | partial | CHECKPOINT | Whole new time-trial system + registry/save. Not a one-seam port. | Own packet; do not silent-merge |
| A-pr94 | `C:\sf-agents\pr94-policy-sparse` | partial | CHECKPOINT | Inference verification policy tip not in this master object db. | Compare to origin; not player models |
| A-pr95-ace | `C:\sf-agents\pr95-ace` | near-done | CHECKPOINT | Named ace escapes; new test absent. 2-file tip. | Review + port |
| A-pr95-all | `C:\sf-agents\pr95-all` | partial | CHECKPOINT | Wave-2 bundle, 13-file tip plus huge fork. | Split into leaf ports; do not merge branch |
| A-pr95-hud | `C:\sf-agents\pr95-hud` | partial | CHECKPOINT | Quiet combat HUD; collides with live HUD dirty hunks. | After HUD owners release those files |
| A-pr95-log | `C:\sf-agents\pr95-logistics` | near-done | CHECKPOINT | Dock-session market recovery. 5-file tip. | Review + port |
| A-pr95-mkt | `C:\sf-agents\pr95-market-qol` | junk | CHECKPOINT | Gitless leftover tree. Use A-pr95-log branch instead. | Delete after A-pr95-log harvested |
| A-pr95-skitter | `C:\sf-agents\pr95-skitter` | junk | CHECKPOINT | Gitless leftover; src hashes differ from main. Registered work is A-pr95-swarm. | Do not delete until swarm is harvested |
| A-pr95-swarm | `C:\sf-agents\pr95-swarmers` | near-done | CHECKPOINT | Distinct swarmer tells. 5-file tip. | Visual review + port |
| A-pr95-val | `C:\sf-agents\pr95-validation` | partial | CHECKPOINT | Validation battery / lab metrics. Support work. | Port only if it proves a production claim |
| A-basevis | `C:\sf-agents\baseline-vis` | junk | DROP 2026-08-17 | No longer in `git worktree list`. Gone. | None |

Refresh this table if `git worktree list` or `C:\sf-agents` gains or
loses a folder. Do not delete a row; mark `DROP` and date it.

## Track B — unused models in the main project

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| B-hitch-v9 | V9 Hitch source vs V7 compressed release | partial | CHECKPOINT 2026-08-17 | V9 extras exist in source only. Three still reviews all said do not rebuild the live compressed ship from this: toy antennas/orbs, mush stencil, lost name plate, fake greenhouse, slab trays. Live stays V7. | Next: another real Hitch polish pass, or strip the extras. Do not copy uncompressed V9 over release. |
| B-factory | `assets/ships/fleet_player_bodies_v1` | partial | CHECKPOINT 2026-08-17 | Hornet C52 review: open cage / tube+boxes, loses to Hitch, do not wire. Same factory method on the other ships. | PQ-050 form restart. Do not promote C52. Do not dump the factory folder. |
| B-traffic | `*_production_v1` traffic bodies | near-done | CHECKPOINT 2026-08-17 | Newer files exist. Live maps stay on older bodies because an earlier wire made traffic invisible (missing release identity / packages). | Finish release identity + package + load proof per role, then wire one role |
| B-markings | `assets/ships/foundry/spacepunk_markings_v1` | done-unwired | CHECKPOINT 2026-08-17 | Atlas finished, not on any hull. | Own integration packet: one family, UV/decal, KTX2 |
| B-ceres-props | Ceres render packages | near-done | CHECKPOINT 2026-08-17 | Packages exist in the generated manifest; not placed in world data. Main tree already dirty on those packages. | Place via place registration after that writer finishes; do not steal |
| B-liner | `assets/ships/massline_express_liner_v1` | partial | CHECKPOINT 2026-08-17 | Brief + donor only. No body. | PQ-049. Do not invent a liner to close this row |
| B-blocked-acc | `wholeships/pelican.glb`, `wasp.glb` | junk | DROP 2026-08-17 | Accessory-only, no hull. Already unwired on purpose. | Never wire |

## Closeout

- [ ] Every Track A row is MERGE, CHECKPOINT, DROP, or ADAPT
- [ ] Every Track B row is MERGE, CHECKPOINT, DROP, or ADAPT
- [ ] Every MERGE commit is on the current branch and pushed
- [ ] Hitch later polish is on the compressed live ship, or B-hitch-v9 says why not
- [ ] `C:\sf-agents` holds only live writers or named preserved donors
- [ ] Campaign `RESULT: DONE` only after the boxes above
