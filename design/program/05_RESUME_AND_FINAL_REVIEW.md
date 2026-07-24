# Resume and Final Review Procedure

This is the pickup contract for a new agent and the final acceptance procedure when implementation
appears complete. [`NOW.md`](./NOW.md) and the active
[`roadmap/`](./roadmap/README.md) own current work order; the Alpha/Depth pages below remain acceptance
truth and milestone roll-ups.

## Current recovery handoff — 2026-07-23

Start from clean `master` `dff6e4fc` in the sole registered worktree. The immediate goal is to keep
the game playable for the user's own test, not to open a broad automated validation campaign.

1. Start the ordinary game route and let the user play.
2. Convert any user-visible failure into one bounded repair with the narrowest relevant check.
3. Keep `codex/recovery-worldbuilding-20260723`, the Lark recovery ref, and the VP-220 recovery ref
   outside `master` until each candidate receives a separate product decision.
4. Once the playable checkpoint is stable, resume the canonical queue at PQ-018.

## Resume: first fifteen minutes

1. Read `AGENTS.md`, [`README.md`](./README.md), and [`NOW.md`](./NOW.md).
2. Read the active [`roadmap`](./roadmap/README.md), its
   [`execution protocol`](./roadmap/00_EXECUTION_PROTOCOL.md), then
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) and
   [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md).
3. Confirm branch, upstream, staging, and live dirty counts using
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md).
4. Do not reset, stash, clean, restore, or bulk-stage the shared worktree.
5. Check active station/input/asset/render ownership before touching those lanes.
6. Re-run the narrow check for the item selected; never inherit a green result from prose.
7. Work one roadmap packet or coherent acceptance unit. Parallelize only non-overlapping lanes.
8. Shared-tree workers do not stage product files or commit. They return exact changed paths, check
   results, evidence paths, tree identity, and review verdict to the lead; the lead owns the Git index,
   exact staging, commits, `NOW.md`, and other `design/program/**` updates. A verified isolated worktree
   may commit its own packet only when the lead explicitly assigned that worktree.

## Current pickup order

1. **User playtest on clean `master`.** Do not interpose a multi-day validation loop.
2. **Bounded repairs from observed failures.** Keep each repair small enough to return immediately to
   a playable checkpoint.
3. **PQ-018 Wreck Cathedral runtime promotion.** Use the integrated source candidate and reviewed
   readiness handoff; do not confuse source-asset completion with runtime or route acceptance.
4. **Later canonical queue work.** Continue from `CANONICAL_BUILD_MAP.md` and
   `roadmap/program-queue.json` only after the game remains playable between slices.

## Per-item completion ritual

For every roadmap packet, Alpha packet, or Depth chunk:

1. Identify the roadmap packet and any corresponding acceptance row in `02_REMAINING_WORK.md`.
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

- All 113 roadmap packets have reached their declared terminal state and
  `02_REMAINING_WORK.md` contains no open product or integration item.
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
