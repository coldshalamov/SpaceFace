<!-- LIFETIME: HISTORICAL -->
# PQ-018 Wreck Cathedral — acceptance attempt receipt

```yaml
packet: PQ-018
candidateBranch: claude/pq018-rebase-20260725
candidateRevision: 06ef580b0e8b6bc5b7985b2b1271c56d669347d6
authorizedBase: 167f36901bb206860427354ca1ed5a8d855152e5
worktree: C:\Users\93rob\sf-claude-20260725
baselineWorktree: C:\Users\93rob\sf-claude-pq018-baseline
result: BLOCKED
acceptance: unproven
lifecycle: implemented (not integrated)
```

## Disposition

**BLOCKED.** Not for lack of implementation — PQ-018 was already built out-of-band and is now rebased
onto current master with focused tests green. It is blocked on one live-layer defect that stops the
public route at the fifth operation, and on acceptance-boundary items that are integrator authority.

No acceptance launch was spent. Every live run was `--diagnostic`, so the
`maxLaunchesPerCandidate: 1` budget for `pq018-wreck-cathedral` remains unused.

## What changed

The implementation came from `codex/pq018-integration-review-20260725` (tip `136cba98`). It could not
be merged: that branch forks below master's FIX3–FIX10 lab-integrity work and a merge would have
deleted `test/holistic-fix3..10-regression.test.mjs`. It was rebased instead.

| Commit | Change |
|---|---|
| `a890d7b8` | Restore branch-authoritative route `snapshot()` — the rebase silently reverted `a149f475`'s hardening, dropping root identity from `<siteId>/root` back to `<siteId>` |
| `8eb0cd2c` | Re-pin `PQ018_AUTHORIZED_BASE_SHA` to the real parent; replace the tautological guard with a real staleness check |
| `1ab9ae08` | Capture `beam:denied` so an operation that never completes names its refusal instead of reporting a bare timeout |
| `a36cd4a3` | Refresh NOW.md (stale by 28 against its own 25-commit expiry) and record the claimant lease |
| `20a07c2a` | **Product fix:** announce dependency-blocked beam refusals; teach the route to recover a re-failed hull |
| `06ef580b` | Correct two defects of my own: a false-positive then under-strict staleness check, and hull recovery running before the approach that breaks it |

## The product defect found

Approaching a component with autopilot can ram the hull past `cathedral_hull_impact`'s 220 dp
threshold. That re-fails the hull, which **retracts** `stabilize_cathedral_hull` from
`completedOperations` and leaves every dependent operation `dependency-incomplete`.
`_runWorldSiteBeam` returned on that path **without emitting `beam:denied`** — the only refusal path
in the function that stayed silent. A player holding the beam on a dependency-blocked component got
no cue at all, indistinguishable from a slow operation. This violates the packet's requirement for
legible operation-availability and denial semantics.

Reproduced deterministically in the kernel before any fix: after applying the impact,
`completedOperations` drops to exactly the three operations the live run reported, and
`cut_cargo_clamp_forensics` returns `dependency-incomplete`. Regression added in
`test/world-site-interactions.test.mjs`, driving the real code path.

Confirmed fixed live: `lastBeamDenial` moved from `null` to
`{verb:"extract", reason:"dependency-incomplete", targetId:323, tick:20039}`.

## What passed

- PQ-018 + world-site + broker + middle-mouse focused suites: **143/144**
- Master's holistic FIX3–FIX10 suites on the rebased branch: **148/148**
- `check-program-docs` **PASS**; `test/program-control-tools` **8/8**
- `check:asset-reachability`, `check:assets:live`, `check:visual-stability`: exit 0
- `check-pq018-coordinate-reservation`: pass — 620 WU envelope, local 300/2700, global −11988/10892,
  minimum clearance 76.632, digest `1bc57a7c…`
- Matched baseline captured and validated at the authorized base for both cells:
  browser p95 **33.4 ms** / 160 hitches, Electron p95 **200.4 ms** / 748 hitches

## Route observed

Boot → reduced-flash enabled through the settings UI → seeded new game → Helios→Ceres through an
ordinary gate → Star Map search → Track Target → approach → **Cathedral admitted (15 site entities)**
→ **authored cavity traversed under ordinary WASD flight, 582 WU through a 70-radius centre gate** →
four operations completed with evidence receipts (`missing_convoy`, `capital_hull_located`,
`clock_stopped_first`) → **stalls at `cut_cargo_clamp_forensics`**.

## What remains unproven

- **Route acceptance.** Browser and Electron acceptance cells never ran. Cavity traversal, four
  operations, and admission are demonstrated; payload delivery, damage/recovery, save/Continue,
  return, and history are not.
- **Matched performance beyond approach.** The relative baseline comparison applies only to
  `ceresApproach`. `activeOperation` and `leaveReturn` get hard candidate floors but no comparison.
  Operations are structurally incomparable (the base tree has no Cathedral); `leaveReturn` is not
  Cathedral-specific and could be made matched by extending the baseline route. Not done.
- **Independent visual review** at close/default/far/motion/LOD/damage/recovery: not performed.
- **Accessibility semantics** for target/availability/denial/progress/damage/receipt/recovery beyond
  the denial fix: not audited.

## Findings referred to the integrator

- `assets/ships/parts/parts_manifest.json` marks the Cathedral `"status":"accepted"` while
  `design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml` still says
  `review_status: needs_review`, `route_accepted: false`. **Not changed here:** asset acceptance state
  is integrator authority under the packet, only `blocked`/`accepted` exist in this manifest, and no
  runtime consumer of the field was found.
- The acceptance route drives keyboard and pointer only. `src/systems/gamepad.js` exists, so the
  packet's "applicable controller path" is applicable and uncovered.

## Deliberately excluded

- Re-authoring or repairing the source asset — the candidate loads and traverses correctly.
- Differentiating the seven operations mechanically. All share `player-industrial-beam` and differ
  only by threshold, so the player's physical action is identical every time. This is the main
  fun-risk in the current design and the strongest improvement candidate, but it is a design change
  beyond this packet and would invalidate the acceptance evidence mid-flight.
- Any mutation of the primary checkout, `master`, or the codex/Grok branches.
