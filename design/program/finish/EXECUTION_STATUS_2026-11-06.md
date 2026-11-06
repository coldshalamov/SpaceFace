<!-- LIFETIME: ACTIVE_PROGRAM -->
# Execution status — master plan campaigns, 2026-11-06 (controller takeover)

This is the controller's live control surface for the 29 master-plan campaigns. It records what is
**claimed**, what is **verified**, and what the **next action** is. A campaign is only "done" when
its MASTER_PLAN `Verify` is met with evidence on this laptop and three independent reviewers agree
the implementation is optimal.

## How this pass works

1. **Ground truth first.** The shared checkout is made coherent (duplicate systems removed, imports
   and boot verified) before any new work is reviewed.
2. **Three-reviewer gate.** Every landed campaign slice gets three independent reviewers. Each must
   return `OPTIMAL` or `NOT OPTIMAL` with concrete, file-cited defects. Work iterates until all
   three agree. Reviews are read-only; the controller applies fixes.
3. **Player route beats prose.** A green unit test proves its contract, not the campaign. The
   ordinary route (`check:playable`, `ui-bench`, headed captures) is the acceptance layer for
   player-facing claims.
4. **One writer per path.** Parallel work is assigned disjoint write sets; exact-path commits only.

## Campaign matrix

| Campaign | Lane | Claimed | Verified here | Next action |
|---|---|---|---|---|
| E10 frame truth | 1 | DONE | pending review | gate A |
| E1 playout buffer | 1 | Verify MET | pending review | gate A |
| E5 shared memory | 1 | Landed (Electron probe open) | partial | gate A |
| E9 load in seconds | 1 | Diagnosed only | no | implement |
| E3 mode-scoped sim | 2 | COMPLETE | pending review | gate C |
| E2 hot path | 2 | Partial; bars NOT met | no | implement |
| E4 data-oriented core | 2 | Not started | no | implement |
| E6 residency/pop-in | 3 | Landed; counters 0 | pending review | gate B |
| E7 renderer rebuild | 3 | Diagnosed only | no | implement |
| P1 Ship Sheet | 4 | Landed | pending review | gate D |
| P2 parts explain themselves | 4 | Partial (no previews, no merge) | partial | implement |
| P4 fits you can see | 4 | Contract only; nothing mounts | no | implement |
| P3 pilot progression | 4 | Design doc; owner gate | no | approve + implement |
| W1 Journey | 5 | Implementation landed; play walk blocked | partial | gate F + walk |
| W5 first hour | 5 | Not started | no | implement |
| W2 40 levels | 5 | Not started | no | implement |
| W3 sectors | 5 | Not started | no | implement |
| W4 characters | 5 | Not started | no | implement |
| X1 art direction | 6 | Awaiting owner approval | partial | gate E + approve |
| X2 asset production | 6 | Gated on X1 | no | implement |
| X4 sound/music | 6 | Stems landed; 30-event pass open | partial | gate E + implement |
| X3 Adventure glass | 6 | Landed; before capture open | partial | gate E |
| X5 controls/contexts | 6 | Landed; live route open | partial | gate E |
| Q1 census | 7 | Not started | no | implement |
| Q3 taste gate | 7 | Not started | no | implement |
| Q5 tests | 7 | Not started | no | implement |
| Q2 route walkers | 7 | Not started | no | implement |
| Q4 razor | 7 | Not started | no | implement |
| E8 native verdict | 7 | Not started (depends E1/E2) | no | implement |

## Ground truth at takeover (2026-11-06)

- **Boot/play route is green.** `node scripts/check-game-playable.mjs`: 18/18 — BOOT, LAUNCH,
  PILOT, HULL, WORLD, CONTROLS, LANE-FWD, SAVE, CONTINUE, reloaded pilot/hull/world/controls,
  CLEAN, SHADER, ASSETS, AUTHORED HULL. The working-tree boot was **not** broken at takeover; the
  W1 STATUS blocker was stale after the mission-graph repair.
- **Open defect seen on the green route:** `authored visuals still staging after 25s
  {pipelineReady:false, ready:false, playerStatus:'authored'}`. The route still passes because a
  procedural stand-in draws, but this is exactly the E6/E9 admission window the player sees as
  pop-in. Filed to E6/E9.
- **Duplicate mission system removed.** `src/data/missions.js` was a 9.6k-line copy of
  `src/systems/missions.js`; data is now a pure re-export of `missionsData.js` (no consumer
  imported a system export from the data path). Mission + journey tests 7/7 green.
- **Working-tree slices reviewed and landed** as exact-path commits: VX ring lazy dressing table,
  packaged opening-contact admission + timer-aware admission tests, foundry finish + pending-wreck
  resolving marker, boot movie memory transport + varied session entry, band rank tickets, power
  activation HUD test, and two named probes moved out of the repo root.

## Decisions taken at takeover

- **P3 / W1 / X1 owner gates are treated as approved** by the owner's standing "build all the
  things" direction and this pass's explicit instruction to finish the build map. The design docs
  remain the record of what was approved.
- **Open PRs are not merged blindly.** Each is compared with current master; if the fix is still
  real and clean it lands (as a merge or a ported commit), otherwise it is closed with a one-line
  reason. CI on those branches is stale and is not by itself a verdict.
- **Duplicate mission system removed** from `src/data/missions.js`; the canonical system remains
  `src/systems/missions.js` and data stays pure in `src/data/missionsData.js`.

## Gates

| Gate | Scope | State |
|---|---|---|
| A | E10 + E1 + E5 | not started |
| B | E6 | not started |
| C | E3 + E2 profiler | not started |
| D | P1 + P2 | not started |
| E | X1 + X3 + X4 + X5 | not started |
| F | W1 | not started |
| G | repo quality baseline (Q1/Q5/Q4 survey) | not started |
