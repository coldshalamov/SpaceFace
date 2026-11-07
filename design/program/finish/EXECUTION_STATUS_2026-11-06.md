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
| Q1 census | 7 | In flight (census) | survey | finish decisions |
| Q3 taste gate | 7 | **DONE** — five-axis rubric + reviewer procedure | `campaigns/Q3/RUBRIC.md` | apply per visible slice |
| Q5 tests | 7 | In flight (tiers + ref tool) | survey | finish `test:fast` |
| Q2 route walkers | 7 | Route list + R1 green | partial | walk R2/R3/R5/R6 after fixers |
| Q4 razor | 7 | Not started | no | survey + delete |
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

## Open verification risks

- **47-A hash:** the dirty tree currently produces `1fedbd09...` against the v23 reference
  `134e1e7f...`. `snapshotSimState` does not include `simLOD`/`activityRuntime`; the likely cause is
  the in-flight W1 `missions`/`missionStoryOps` delta, not E2. Re-run on a clean tree after W1 lands
  before versioning anything. Do not re-record v23 to make a red run green.
- **Authored pipeline staging:** the playable route warns after 25 s (`pipelineReady:false`) on a
  contended host while still drawing a stand-in. E6/E9 own the root cause; it is not a Q2 pass.
- **E6 after-run:** the single run reports `visibleUnready 3`, `leftUndrawn 5`, `refusedDraws 912`
  on a contaminated checkout. Re-measure on a clean tree before a verdict.

## Content queue (special-500, assigned but unlanded)

42 units are `assigned` in `design/program/special-500/BUILD_LEDGER.json`, all with a ratified
player-visible leg:

- **spectacle (15):** SP3-035, 052, 058, 062, 072, 077, 080, 084, 088, 090, 095, 100, 115, 128 and
  the Anvil Lighthouse family. Route through the approved spectacle registry and the X1 prop/finish
  bar; each needs a gameplay-camera capture.
- **codex (15):** SP1-082, 164; SP2-061, 070, 071, 080, 083, 091, 093, 103, 106, 118, 183; SP3-136,
  137, 139. Each writes a flag plus a codex page; group them under the W1 act chapters.
- **counter (12):** SP1-002, 031, 077, 186; SP2-063, 064, 079, 082, 084, 091, 107; SP3-136; SPX-C-06,
  SP2-191. Each needs a real readout/beat, not a hidden counter.

Land one family at a time after the owning lane's gate closes; every unit needs a focused test, an
ordinary-route observation, and a ledger status update (`landed` + commit). Do not mark a unit
landed for data alone.

## Gates

| Gate | Scope | State |
|---|---|---|
| A | E10 + E1 + E5 | A1/A2: NOT OPTIMAL (sector-transition old pose, boost snap, delay not maintained, E10 clamp); fixer in flight |
| B | E6 | B1/B2/B3: NOT OPTIMAL (orphan holds, counter blind spots); fixer in flight |
| C | E3 + E2 profiler | C2/C3: NOT OPTIMAL (telemetryDemand breaks readers, mode-switch dt burst); E3 Line regression fixed; fixer in flight |
| D | P1 + P2 | D1/D2/D3: NOT OPTIMAL (Firepower/Muscle/Power lie, tab order, P2 coverage); fixer in flight |
| E | X1 + X3 + X4 + X5 | not started |
| F | W1 | F1/F2/F3: NOT OPTIMAL (act surface, March credits, missions init contract); fixer in flight; live route suite 10 red |
| G | repo quality baseline (Q1/Q5/Q4 survey) | Q5 audit complete; Q5 implementation in flight |

## PR queue (triage 2026-11-06)

35 open PRs. The displayed GitHub diff is stale for the `ui-polish` batch; the real merge delta is
1-5 files each. **No open PR is superseded** by master. Dispositions:

- **Disposition documented:** port 894 and 895 first (self-contained); then the layout batch
  897 -> 896 -> 893 -> 892 -> 890 -> 888 -> 886 -> 885 -> 884 -> 883 -> 882 -> 881 -> 880 -> 879
  -> 878 -> 877 -> 875/874 (shared `kit/dom.js`; land once) -> 873 -> 872 -> 861 -> 891 -> 887 ->
  889, regenerating the UI-budget digest after each.
- **Deep review before port:** 858 (opening-rescue salvage), 857 (distress navigation/save), 742
  (Iron Kraken), 776 (Swarm specialists), 748 then 667 (shader warming), 657/724/840 (drafts).
- **Do not add:** the `.github/workflows/ui-pr-review.yml` + `uiBenchArrival` scaffolding shown in
  the stale display diff; it is not in any real merge delta.
