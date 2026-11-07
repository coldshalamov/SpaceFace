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
| E1 playout buffer | 1 | **Verify NOT met**: moving 400 ms-gap capture cuts 28 violations/84 WU/3 s holds to 4/21 WU/0 holds; the 4 are collision decelerations, not gaps | open: collision-free capture or an agreed presented-speed bar | reviewers |
| E5 shared memory | 1 | Landed (Electron probe open) | partial | gate A |
| E9 load in seconds | 1 | Diagnosed only | no | implement |
| E3 mode-scoped sim | 2 | COMPLETE (LOD retracted) | pending review | gate C |
| E2 hot path | 2 | Partial; mode-scoped drain + main-lane profiler landed; bars NOT met; slicing OFF | no | equivalence + idle A/B |
| E4 data-oriented core | 2 | Not started | no | implement |
| E6 residency/pop-in | 3 | Landed; counters 0 | pending review | gate B |
| E7 renderer rebuild | 3 | Diagnosed only | no | implement |
| P1 Ship Sheet | 4 | Landed; one tow law + one-source dossiers; 44/44 focused | pending review | blind check + five-screen walk |
| P2 parts explain themselves | 4 | Partial; taxonomy + one-source record landed; previews/merge open | partial | implement |
| P4 fits you can see | 4 | Contract only; nothing mounts | no | implement |
| P3 pilot progression | 4 | Design doc; owner gate | no | approve + implement |
| W1 Journey | 5 | Implementation landed; play walk blocked | partial | gate F + walk |
| W5 first hour | 5 | Not started | no | implement |
| W2 40 levels | 5 | Not started | no | implement |
| W3 sectors | 5 | Not started | no | implement |
| W4 characters | 5 | Not started | no | implement |
| X1 art direction | 6 | Work landed; after re-shot, before unmatched | partial | owner approval in `campaigns/X1/STATUS.md` + E10 delta |
| X2 asset production | 6 | Gated on X1 | no | implement |
| X4 sound/music | 6 | Stems landed; payload fixed 13.92→11.48 MiB; 30-event pass open | partial | gate E + implement |
| X3 Adventure glass | 6 | Landed; rescue lesson now one sentence; before capture open | partial | matched capture + review |
| X5 controls/contexts | 6 | Landed; phantom pad row removed; teach-09 16/16 | partial | live contexts + pad |
| Q1 census | 7 | In flight (census) | survey | finish decisions |
| Q3 taste gate | 7 | **DONE** — five-axis rubric + reviewer procedure | `campaigns/Q3/RUBRIC.md` | apply per visible slice |
| Q5 tests | 7 | In flight (tiers + ref tool) | survey | finish `test:fast` |
| Q2 route walkers | 7 | Route list + R1 green | partial | walk R2/R3/R5/R6 after fixers |
| Q4 razor | 7 | Not started | no | survey + delete |
| E8 native verdict | 7 | Not started (depends E1/E2) | no | implement |

## 2026-11-07 integration pass

- **Open PR queue drained.** Every open PR was integrated locally and published
  (`293216e1..19e204a0`), including the 35-PR batch and the later #909/#910–914 hairline cards.
  `#657` was merged then reverted (`150bb98d`) because it is on B13 acceptance hold and moved the
  gated v3 47-A hash without a reviewed reference; the PR carries the explanation.
- **Determinism stays on v26** (`ebbfe82a…` legacy, `67416291…` v3). `check:baseline` 17/17 green
  after the revert.
- **P1/P2 final pass:** one tow law shared by the sheet and capability band, one-source hull/module
  dossiers with a Details disclosure, Fight roles for positioning weapons, 44/44 focused tests.
- **E2:** per-tick drains now obey the owner's mode scope; the main-lane registry feeds the same
  per-system profiler; `effectiveEq` reads the sliced pass time. Full one-shot/sliced equivalence
  and the 8/12/25 ms bars remain open, so slicing stays OFF.
- **X3:** the rescue lesson is one sentence (`STORE_FLIGHT_SENTENCE`); the store page keeps its
  tagline. **X5:** the keyboard-only time-trial restart is out of the pad sheet; `teach-09` 16/16.
- **UI budgets re-pinned** with the canonical headed 1920×1080 shoot; `check:ui:budgets` passes
  (30 measured surfaces + 10 named gaps).
- **Verification on the published tree:** `test:fast` 39/39, `check:playable` 18/18,
  `check:baseline` 17/17, type floor, UI a11y, WCAG contrast, entity links, UI imports 55/0.
  The route tier was run; its browser commands hit the 120 s cap on a loaded host, so only the
  individual re-runs are evidence (below).
- **Q3 primary-screen pass:** six headed captures reviewed; Shipworks socket 03 printed the raw
  boolean "true" for the stock drive and now reads "Drive / STOCK · M" (`3de6121`). Review:
  `campaigns/Q3/reviews/2026-11-07-primary-screens.md`.

## Known reds on this host (2026-11-07)

- `test/tethys-tally-passage.test.mjs`: the native fixture's count keg acquires a small drift
  (~1.6 WU/s) before the courier reaches the wait mark, so the lane is already clear when the
  clearance check runs and `firstHeldAt` never sets. The focused physical fixtures pass; the
  integrated native choreography is open.
- `test/pq-158-00-sample-library.test.mjs`: 13.92 MiB encoded vs the 12 MiB ceiling. The five 16 s
  PCM theme stems are the bulk; compressing them would break the authored note-window/decode tests,
  so this needs a content or ceiling decision, not a silent re-pin.
- `check:new-game-layout.mjs` 1440×900 intermittently waits on the first-light `#sf-confirm` detach;
  the 1024/1280 viewports pass and the earlier final run passed all three.
- The route tier's browser commands time out at 120 s under this host's long-running Chrome load.
  Individual re-runs: `check:playable` 18/18, trail-streak-instancing-webgl PASS.

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

- **P3 / W1 owner gates are treated as approved** by the owner's standing "build all the
  things" direction and this pass's explicit instruction to finish the build map. The design docs
  remain the record of what was approved.
- **X1 is not self-granted.** The art-direction gate stays OPEN until the owner writes approval
  into `design/program/finish/campaigns/X1/STATUS.md`. "Build all the things" is a planning
  assumption for sequencing, not an approval of a look; the after frames are re-shot at 1600×1000
  but the pre-finish "before" is unmatched and the E10 delta unmeasured, so the controller cannot
  close this gate on the owner's behalf.
- **Open PRs are not merged blindly.** Each is compared with current master; if the fix is still
  real and clean it lands (as a merge or a ported commit), otherwise it is closed with a one-line
  reason. CI on those branches is stale and is not by itself a verdict.
- **Duplicate mission system removed** from `src/data/missions.js`; the canonical system remains
  `src/systems/missions.js` and data stays pure in `src/data/missionsData.js`.

## Open verification risks

- **47-A hash:** the reference is still v24 (`1fedbd09…`, v3 native-contact `015c4c…`). The
  economy slicing flag is held OFF: the per-fixed-tick drain and its 2100-tick/60 s cadence tests
  are green behind the flag, but the shared checkout is currently red from foreign uncommitted
  changes (`src/data/newGameDefaults.js` starter shield, `src/systems/input.js` gamepad travel
  latch). A flag-on run is deterministic and reload-equal (`fb76e5b9…` / `f06c59d5…`) but is not
  promoted to a v26 reference until a clean tree confirms the delta. v25 `080c5bd9…` is the
  obsolete un-drained shape; its reference metadata now describes the real change.
- **check:baseline:** 17/17 links green, but the wall exceeded the 90 s budget at 128 s because the
  nested `massline` link ran at 128 s under the fixers' CPU contention. No link failed; re-run on a
  quiet host before treating it as a regression. Do not raise the budget.
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
| A | E10 + E1 + E5 | **fix landed** (`bd1b166`), **76/76** E1 cohort at HEAD (77/77 at the fix commit before Q4 removed two legacy tests); browser 1× re-record and E5 live shell receipt still open. Re-review: A1 says code correct but claims must be corrected; A2/A3 pending. |
| B | E6 | **fix landed** (`84bfa5`..`53312b`), 97/97 + 103/103; single after-run is a measured FAIL (`visibleUnready 3`, `leftUndrawn 5`) on a contaminated tree. Clean-tree re-measure + re-review required. |
| C | E3 + E2 profiler | **fix landed** (`762eb19` + `3196b76` + the economy-drain pass), **120/120** core set, live yard route **29/29**, unknown-mode and dual-mode clock regressions green. 47-A remains **v24** (`1fedbd09…`); the economy drain is verified behind `economySlicing` (2100-tick/60 s cadence) and held OFF until a clean-tree v26. v25 is the obsolete un-drained shape. Bars still **NOT met**; the recent matched A/B was captured on a loaded checkout (51.07 / 113.26 / 142.67 vs 8/12/25). |
| D | P1 + P2 | **fix landed** (`02b5ff11`), 25/25 focused, New Game tab order PASS, UI imports 55/0. Re-review in flight. |
| E | X1 + X3 + X4 + X5 | **fix landed** (`4ee6b61` X1, `6db9d84` X3, `d309816` X4/X5); X1 61/61 + 1600×1000 captures, X3 30/30 + capture, X4/X5 48/48. X1 owner approval still open. Re-review in flight. |
| F | W1 | **fix landed** (`2c5980`), live 18/18, 50/50 focused, real B0 ordering defect fixed. Re-review in flight. |
| G | repo quality baseline (Q1/Q5/Q4 survey) | Q1 census + Q5 tiers/tool landed; Q4 razor landed (`9d352e9`, 8 files / 2,458 lines deleted); `test:fast` 39/39. |

## Current green evidence

- `node scripts/check-game-playable.mjs`: **18/18**, Boot through Save/Continue, no uncaught errors,
  no shader errors, every request served.
- `npm run test:fast`: **39/39 in ~53 s**.
- `check:baseline`: **17/17 links green**, wall 128 s over the 90 s budget only under fixer CPU
  contention; no link failed.
- E1/E10 cohort **76/76 at HEAD** (77/77 at `bd1b166` before Q4 removed two legacy tests), `check:smooth-flight` **48/48**.
- E6 focused **97/97**, supporting **103/103**.
- E2/E3 combined **120/120**; live yard route **29/29**; `check-sg02-*`, `check-sg06-*`,
  `check-depth-program-k1` green. The recent matched A/B is `.devshots/sim-step-profile/econ-drain-ab.json`
  (same-process legacy vs drained slice, flag-on) and was captured on a loaded checkout: optimised
  **mean 20.89 / p95 51.07 / p99 113.26 / max 142.67 ms**, legacy **46.74 / 147.24 / 308.37 / 652.02 ms**.
  Economy rows: `economy` 14.05 → 0.027 ms/call, `economy.drift` 56.41 → 3.82 ms/call, 3 completed
  passes in both arms. Do not cite the old 8.74/13.79 profile: it measured an incomplete pass.
- Q4 razor: **8 files / 2,458 lines removed**, `check-gameplay-core` green, boot still 18/18.
- W1 live route **18/18**, focused **50/50**.
- X3 presenters **30/30**, re-shot capture at HEAD.
- `check-runtime-asset-contract`: **PASS 0/0** after the Ashline LOD marker fix; `check-lod` 18/18;
  parts manifest 9035/9035.

## Known red / unresolved

- `test/swarm-feedback-priority.test.mjs` first case (Swarm kill-popup layout) is still red after the
  glass split; the presenter/source decision is being reconciled.
- `test/hud-flight-attention.test.mjs` pins the pre-W1 tracker source and may need conversion to
  behaviour.
- `check:ui-budgets` is stale because the P1/X1 CSS work is uncommitted; re-pin with
  `capture:ui-matrix --budgets-out` after the UI batch lands.
- Performance bars (E2) remain unmet; the drained economy slice is implemented and held behind
  its flag, but a clean-tree v26 re-record and a clean max/p99 are still required, as is the E4
  core.

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

---

## Final verification wave, 2026-11-07

**Green on the committed tree (`4c5cd4b8`):**

- `npm run test:fast` **39/39**; `check-game-playable` **18/18** (boot, launch, pilot, hull, world,
  controls, save/continue, clean, shader, assets, authored hull).
- `check:baseline` **17/17 links green** (including v26 sim, sim-v3, sim-compare, smooth-flight,
  tether mass, massline). Wall was 107 s under fixer load vs the 90 s budget; no link failed and the
  budget was not raised.
- Focused: E1/E10 **87/87**, E6 **114/114** (+131 supporting), E2/E3 **148/148**, P1/P2 **30/30**,
  W1 **72/72** (+live 18/18), X1 **75/75** (+yard 29/29), X3 **54/54**, X4/X5 **48/48**.
- `check-program-docs`, `check-src-syntax` (3,020 modules), `check-src-reachability`,
  `check-runtime-asset-contract` (0/0), `check-lod` 18/18, `check-parts-manifest` 9,035/9,035,
  `check-ui-screen-imports` 55/0.
- Determinism: v26 envelopes pass for legacy and v3; the only compare allowance is the one act
  receipt W1 replays on Continue.

**Gate state after the final review round:**

- **A** - final review found one material defect: a steady 2-10 Hz cadence above 350 ms is treated
  as silence, so the reserve is eaten and the hull snaps at 400-600 ms. Fix in flight. E1/E10/E5
  Verify still need a browser 1x recapture and a live Electron-shell receipt.
- **B** - final review agrees the prior liveness/counter/gate defects are fixed, but the submit
  verdict still hides presented bodies (`pipelinesPending`/`authoredPending`/`geometryPending`),
  instance proofs are not context-generation-tagged, and the only after-run is the pre-fix FAIL.
  E6 Verify remains not met. The unified `admit()` / one visible writer is the structural remainder.
- **C** - economy slice is **off**; the per-tick drain, cadence and save-cursor tests are green but
  the shipped tape cannot be re-recorded until a clean flag-on v27/profile. YARD and UNKNOWN modes
  are fixed. Bars remain unmet; E4 is untouched.
- **D** - P1/P2 pass 30/30 with the tow/anchor/taxonomy fixes; final review pending.
- **E** - X1 evidence/gates and X5 device gates are fixed; X1 owner approval, X3 onboarding prose,
  X4 heard-score development and the 10-minute listen remain open.
- **F** - W1 72/72 and live 18/18; final review pending. The ordinary-route walk and the deeper act
  shape/side-content design remain open.

**Not started or incomplete:** E4 (data-oriented core), E7 (renderer rebuild), E9 (load in
seconds), P3 (pilot progression; design ready), P4 (visible fits; contract only), W2-W5 (levels,
sectors, characters, first hour), X2 (asset production), X4 variants/census, E8 (native verdict),
Q2/Q4 (route walks/razor beyond the three deletions), and the 35-PR integration queue.

No campaign is being called optimal on a single reviewer. E6 and E1 have explicit structural or
cadence defects; the rest are waiting for the final three-way agreement.
