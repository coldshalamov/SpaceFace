# Resume and Final Review Procedure

This is the pickup contract for a new agent and the final acceptance procedure when implementation
appears complete.

## Resume: first fifteen minutes

1. Read `AGENTS.md` and [`README.md`](./README.md).
2. Read [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) and
   [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md).
3. Confirm branch, upstream, staging, and live dirty counts using
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md).
4. Do not reset, stash, clean, restore, or bulk-stage the shared worktree.
5. Check active station/input/asset/render ownership before touching those lanes.
6. Re-run the narrow check for the item selected; never inherit a green result from prose.
7. Work one coherent acceptance unit to a logical commit. Parallelize only non-overlapping lanes.
8. Workers return exact check results, evidence paths, tree identity, and review verdict to the lead.
   Only the lead/status integrator edits `design/program/**`, preventing parallel status races.

## Current pickup order

1. **Recovery checkpoint:** preserve and commit coherent dirty Depth work and durable evidence
   manifests without absorbing asset dumps or protected files.
2. **M0 evidence:** repair the 20-record Alpha corpus and current-revision baselines.
3. **M1:** restore strict Helios docking, then close Focus/camera/tether/doctrine/HUD acceptance.
4. **M3:** close natural recovery and all three unassisted career routes.
5. **M4:** restore ecology 9/9 and complete living-galaxy/visual-family routes.
6. **M6 performance:** repair startup/crowded-flight behavior with full visual parity.
7. **M5 and Depth completion:** ordinary story/endings/ownership routes plus all remaining chunks.
8. **M6 release:** parity, localization, accessibility, platform/soak, store capture, and clean waves
   if the draft production policy is adopted.

This order can be parallelized where ownership is disjoint. It must not be reordered in a way that
leaves working-tree-only implementation at risk or claims a later release gate while an earlier
player-visible P0/P1 remains red.

## Per-item completion ritual

For every Alpha packet or Depth chunk:

1. Identify the exact acceptance row in `02_REMAINING_WORK.md`.
2. Verify implementation is reachable through default browser and Electron gameplay.
3. Run the named focused checks and determinism/no-regression floor.
4. Run the natural public-input route without state/entity injection when primary acceptance requires it.
5. Capture current screenshots/video and review hierarchy, composition, readability, originality,
   material/detail quality, and coherence.
6. Record commit/tree identity and durable evidence paths.
7. Obtain the required independent quality review.
8. Return the acceptance packet to the lead/status integrator.
9. The lead moves the item to `01_VERIFIED_DONE.md` only when every required acceptance dimension
   is green, then removes it from `02_REMAINING_WORK.md` or records its next explicit subtask.
10. The lead updates `03_LIVE_ACCEPTANCE_MATRIX.md`, including clean-wave count only when the
    controller has adopted the draft production policy.

## Standard verification stack

Choose the relevant subset for each commit, then run the full release stack at final review:

```powershell
npm run check:launch-policy
npm run check:demo-opening
npm run check:alpha:evidence
npm run check:depth-program:contracts
npm run check:sim:compare
npm run check:flight:clean
npm run check:assets:live
npm run check:asset-reachability
npm run check:ui-a11y
npm run check:wcag-contrast
npm run check:ui:perf
npm run check:perf
npm run check:bundle
npm run check
```

Milestone-specific routes remain required in addition to this stack; consult the acceptance matrix
and `design/production/01_BUILD_PROGRAM.md`.

## Final professional-game review

The overall task is complete only when all of the following are true:

- `02_REMAINING_WORK.md` contains no open product or integration item.
- Every Depth chunk is DONE with committed implementation and durable evidence.
- M0–M6 each have current browser and Electron evidence and, if the controller adopted the draft
  production policy, their clean-wave requirement.
- The first ninety minutes are understandable and survivable without developer explanation.
- Enemies have authored motives, locations, telegraphs, formations, counterplay, and lawful-zone behavior.
- Focus/tether/camera/weapon heat and recovery feel usable under normal play, not only harness input.
- Objectives, waypoints, radar, contact roster, and station navigation are clear without text overlap.
- B0–B7, five endings, sandbox, roles, careers, outposts, and save variants work through normal play.
- Every visual/audio family is independently accepted; no primitive fallback is mistaken for authored art.
- Target and floor hardware meet performance/startup/memory floors without reducing accepted quality.
- Browser and packaged Electron expose the same game, assets, settings, and content.
- Localization, accessibility, corrupt-save recovery, resize/alt-tab, soak, and platform matrix pass.
- Store screenshots/video come from actual play and meet the same visual bar as the release.
- `master` reproduces the result from a clean checkout with no required dirty or ignored-only artifact.

## Final handoff format

The closing report must contain:

1. Final commit and release artifact identity.
2. M0–M6 acceptance matrix and, when the draft production policy was adopted, clean-wave counts.
3. All 31 Depth chunk verdicts.
4. Full verification command/result table.
5. Player-route evidence links and independent review verdicts.
6. Performance/startup/memory comparison against the target budgets.
7. Clean worktree or an explicit, non-product residual inventory.
8. Honest remaining risks; if any product item remains, the overall program is not complete.
