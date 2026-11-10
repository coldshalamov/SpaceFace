# Quiet beacon retirement deadline

Public parent: `316eed66ece598e2e88872cdaa90c28b829864a2` (fresh checked 2026-10-24).

## Defect and scope
A dynamic Kessler story beacon with `data.despawnAt = 45` survived at simulation time
59.999999999997875 when only it and the player existed. With the quiet optimization
disabled it retired at 45.016666666665394, the first floating-point tick reaching 45.
The deadline consumer, not H4 enrollment, was defective. No H4, director, Pilgrim,
body/renderer, persistence or index-membership changes are included.

The existing `radarContacts` index includes beacons and excludes asteroids. There is no
beacon-only lane. A narrow alive/type/deadline probe after the existing short-lived,
shipLike and wreck/asteroid guards restores the original clocks path. TTL semantics,
absolute comparisons, corpse compaction, identity events and ID allocation are unchanged.
Deadline-free beacons still skip clocks. No new index/cache or universe scan is added.

## Verification
- Unchanged original quiet suite: 8/8 passes.
- New test file against unchanged public-identical core: 9/12 passes; three expected failures
  prove the 60-second leak, post-quiet deadline assignment and zero deadline.
- Candidate quiet suite: 12/12 passes; core command-listener and player lifetime neighbors:
  4/4 passes; combined 16/16 passes.
- The two-body scene uses the exact public H4 spawnProp output (Kessler asset reference,
  radius 5, mass 1e6, hull 1), not the full director or native physics simulation.
- Tests compare skip on/off at the first due fixed tick, before/exact boundary, zero,
  future and cancelled deadlines, untimed quiet-walk behavior (not only survival),
  exact original destroyed.entity, once-only event/free ID, lane removal and new occupant
  survival after ID recycling. Original eight cases remain byte-for-byte unchanged.
- Source is the exact public core plus the narrow patch. Local dependency graph is the
  historical checkout, not a fully materialized public tree. No full-game, browser,
  target-device performance, Save/Continue or native-body teardown acceptance is claimed.

Proposed hosted alias: `check:lifetime-sweep-quiet-clocks-skip` =
`node --test test/lifetime-sweep-quiet-clocks-skip.test.mjs`.
Public package did not already reference this test. Publisher must append this alias and
append its invocation without reordering existing commands; no hosted result is yet claimed.
Broad check/check:ci and unrelated Anvil receiver tests were not run.

## Bounded cost check
RAM-only real core-created index probes, noisy shared host, medians of five runs.
These are diagnostic guard measurements, not a target-device performance qualification.

Scene: 9 ships + 20 stations + 1 untimed beacon, with either 0/2000 asteroids and 0/200 wrecks.
Radar probe adds 30 contacts or 230 with wrecks; an all-movables replacement would inspect
10/2010/2210 movers and double-visit the asteroid field before the existing guard.
Measured microseconds per probe (old / rejected all-movables / chosen radar):
- Fleet: 0.360 / 0.409 / 1.032.
- 2000 asteroids: 73.374 / 134.380 / 113.000 (especially noisy).
- 2000 asteroids + 200 wrecks: 89.994 / 144.756 / 100.983.
- First wreck timed: 0.187 / 46.315 / 0.175; chosen radar adds zero visits after earlier wake.
A separate no-beacon 100-ship + 200-station scene, using exact extracted helpers, costs
100 baseline vs 400 candidate visits; median 1.617 vs 5.636 microseconds. The extra contact
walk is real. It is preferred to a duplicate large asteroid walk; no zero-overhead claim.

## Ownership
Fresh changed-path census of all 68 open PRs (including 569 and 570) found no overlap with
coreSystem or this test. Public/local NOW had no exact current claim, and canonical target
paths had no dirty diff. Foreign canonical checkout and other candidates were read-only.
This is a separate bounded fix, not an H4 persistence or retirement-enrollment claim.
