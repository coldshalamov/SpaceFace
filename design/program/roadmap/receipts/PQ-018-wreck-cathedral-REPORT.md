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

## The payload-latch blocker — resolved in the harness, not a shared change

**Correction to an earlier revision of this receipt**, which called this a shared-change request
against `tetherGameplay`. That was wrong: it traced the dead publisher without tracing what replaced
it.

Commit `4d00867e` (2026-07-24, the PQ-007 draw-to-fly restore) replaced `_consumeAcquisitionReceipt`
with `_acquireCommandTarget`, which resolves the latch target at press time and prefers
`state.player.targetId` outright:

```js
if (!nearestOnly && selected && !selectedDenial) return { entity: selected, ... };
```

So the **game path is correct** — the selection wins, and the diagnostic confirmed the payload was
correctly selected. Only the **route harness** was stale, still waiting on a pre-latch receipt the new
design deliberately never publishes. Fixed by waiting on the truthful precondition for the current
design (payload selected, alive, inside tether reach), with the latch still verified after the press
against the attached tether's `worldRecordId`. `scripts/lib/pq017WorldSitePublicRoute.mjs` is inside
this packet's write set as a narrow extension of the PQ-017 route owner.

**This unblocks PQ-017's payload latch as well** — both routes share the helper. PQ-017 is `integrated`
but its route has been unable to latch a payload since 2026-07-24.

### Residual, referred: the Massline pre-latch HUD preview is dead

`src/ui/masslineHud.js:176` (`_updateAcquisitionPreview`) still reads `state.masslineAcquisition`,
which is now permanently null, so that preview never renders. `_refreshAcquisitionPreview`
(`tetherGameplay.js:282`) is orphaned with no call sites. `test/massline-acquisition-preview.test.mjs`
was updated by the same commit to assert the field **is** null, so the removal was deliberate and
codified rather than accidental — but the HUD branch and the builder were left behind as dead code.
Not restored here: reinstating the preview would contradict tests that currently assert its absence,
and that is a PQ-007 decision, not a PQ-018 one.

## Historical: the original blocker analysis

After the hull-recovery fix the route advanced from four operations to **six**, through
`cut_cargo_clamp_forensics` and `repair_marker_service_spine`, and then stopped at payload delivery:

```
NORMAL_ROUTE_BLOCKED: Massline acquisition did not publish the selected World Site payload
  expectedWorldRecordId: world_site_wreck_cathedral/payload/cathedral_black_box
  selectedWorldRecordId: world_site_wreck_cathedral/payload/cathedral_black_box   <- correctly selected
  acquisition: null
```

**`state.masslineAcquisition` can never be non-null in the current build.** The only function that
creates the receipt, `_refreshAcquisitionPreview` (`src/systems/tetherGameplay.js:282`), has **no call
sites anywhere** in `src/`, `test/`, or `scripts/` — verified repo-wide, including dynamic dispatch.
Its two assignments (`:291`, `:305`) are unreachable. The remaining assignment,
`invalidateAcquisitionReceipt` (`:928`), early-returns unless a receipt already exists, so it cannot
publish one either. Everything else only ever nulls the field.

Consequences beyond this packet:

- Any route helper waiting on `masslineAcquisition` — including PQ-017's shared
  `waitForMasslineAcquisitionWorldRecord` — cannot succeed.
- If the acquisition preview drives a player-facing Massline targeting cue, players are not getting
  it either.

**This is why the packet is BLOCKED rather than merely incomplete.** Evidence page five,
*What Was Carried*, depends on physically hauling the black box, which depends on Massline
acquisition. Repairing that means rewiring an update path in `tetherGameplay` — a physics/input
owner outside PQ-018's bounded write set, under the `physics-authority` mutex, with golden-telemetry
exposure. Under the packet's stop conditions that is a shared-change request, not a PQ-018 edit, so
it was deliberately not attempted here.

## Route defects found and fixed (16)

Nineteen diagnostic runs. Each surfaced a real blocker; none were cosmetic. Two were product bugs,
the rest were route/harness defects that had never been exercised because the route had never been
run to completion.

| # | Defect | Class |
|---|---|---|
| 1 | Rebase silently reverted `a149f475`'s `snapshot()` hardening | rebase |
| 2 | `PQ018_AUTHORIZED_BASE_SHA` stale; its guard compared the constant to itself | evidence integrity |
| 3 | A refused operation reported only a timeout, never the refusal | diagnosability |
| 4 | **Dependency-blocked beam refusals were silent** — no `beam:denied`, no cue | **product** |
| 5 | Route could not recover a hull its own approach had broken | route |
| 6 | Payload latch waited on a receipt PQ-007 stopped publishing (also blocked PQ-017) | stale contract |
| 7 | Impact run-up staged from inside the wreck's clearance envelope | route |
| 8 | Tow pull-through ignored tether rest length — ship arrived, cargo did not | route |
| 9 | Staged impact began from an already-broken hull | route |
| 10 | Withdrawal at speed 40 broke the hull it was preparing to test | route |
| 11 | Fixed tow target cannot steer a payload on a slack line | control |
| 12 | **`planPq017ReceiverServiceTarget` had ten unit tests and zero callers** | **dead wiring** |
| 13 | Departure clipped the wreck, mutating the record leave/return proves unchanged | route |
| 14 | Bounded event journal evicted `economy:grantCredits` before it was read | false negative |
| 15 | Return approach fatal only after recovery (hull starts `failed`, so early clips were no-ops) | state asymmetry |
| 16 | Cross-wreck transits pathed through the structure rather than around it | route |

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
**six operations completed** with their evidence receipts → **blocked at payload acquisition**.

Four successive diagnostic runs, each advancing further: op 4 → op 4 (with the refusal named) → op 6
→ op 6 + payload. No acceptance launch spent.

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

## Design findings (not defects, but they shape the experience)

- **A single clip erases all visible progress.** `dark` is the only stage with no prerequisites, so
  any hull impact retracts `stabilize_cathedral_hull` and drops the site from `archived` straight to
  `dark` while every other operation stays complete. Nothing is lost — re-stabilizing restores it —
  but the presentation implies catastrophe. Consider a stage floor, or a distinct "damaged" dressing
  that preserves earned progression.
- **All seven operations are mechanically identical.** They share `player-industrial-beam` and differ
  only by threshold (48/24/20/28/36/30/1). The verbs vary the fiction and presentation; the player's
  physical action is "hold the beam on the thing" seven times. This is the largest fun-risk in the
  packet and the strongest improvement candidate.
- **The physical haul is where the design earns its keep, and where it is most fragile.** Six of the
  sixteen defects cluster around recovering and delivering the black box. That is the Massline doing
  real physics rather than a scripted pickup — the distinctive value — but the margins are thin.

## Environmental constraint on live evidence

Acceptance probes contend for the GPU with Grok's headless Blender renders in the primary checkout.
Run 18 starved to ~9 sim ticks/second (tick 3300 in 360 s, against 20k-56k in healthy runs) and timed
out on an approach that had succeeded many times. The probe already carries every Chrome
anti-throttling flag, so this is host contention, not configuration. Codex independently declined to
launch probes for the same reason. **Route acceptance needs a quiet machine**, or the timing evidence
is not trustworthy.

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
