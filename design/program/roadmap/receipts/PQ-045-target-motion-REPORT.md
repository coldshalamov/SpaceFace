<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-045
leafId: PQ-045.choreography-repair
lifecycle: integrated
acceptance: focused_green
disposition: PASS
candidateCommit: 2cda03cb430a9ea527d739412a566413e1be3123
-->
# PQ-045.choreography-repair — Ceres jobs pursue the real things their routes name

## Player outcome

Three existing traffic-owned Ceres jobs across five exact route-target relationships no longer steer
only toward their authored offset while claiming to work on a different live object. At ordinary simulation time they resolve and approach
the exact cargo pod, refinery station, ore clast, grave shard, or Cathedral root named by the current
route mark. The controller uses a target-specific safe envelope, settles without penetrating the
target, and retains the existing authored waypoint as its fail-closed fallback.

This is the completed, corrected interpretation of the formerly over-broad
`PQ-045.choreography-repair` unit. It does **not** replace the seven intentional abstract
`activity:` marks, create the refinery tender's disabled client, change route topology, implement an
ambient causal chain, or close the five-minute Ceres gate.

## Exact production boundary

Commit `2cda03cb430a9ea527d739412a566413e1be3123`, parent
`883765c05f015075474960fd121783d0ce7f997e`, changes exactly:

- `src/systems/npcJobsRuntime.js`
- `test/ceres-activity-runtime-lifecycle.test.mjs`

The runtime admits only five seed-derived, literal Ceres actor/job/route/target tuples. It does not
install a generic `targetRef` movement language and does not consume `activity:` or `actor:` refs.
Steady-state resolution is O(1) through retained exact entry/job/entity/data authority; bounded scans
occur only at assignment, rematerialization, and lifecycle events. Numeric entity ids are neither
cached across authority changes nor serialized.

Intent precedence remains:

1. an active external control claim;
2. the existing FLEE branch;
3. the released exact Ceres escort formation;
4. this exact-five real-target controller;
5. the pre-existing authored waypoint controller.

The job kernel remains the sole owner of phase, progress, route index, sequence, loop count, and job
clock. The new controller writes no entity pose, velocity, RNG, receipt, economy, cargo, damage,
faction, heat, or save state.

## Authority and lifecycle proof

The focused matrix covers:

- exact seed/world-record/job/slot/kind/sector/cast ownership for actor and target;
- canonical two-mark route identity and current route-index applicability;
- missing, dead, terminal, wrong-sector, wrong-kind, malformed, duplicate, wrapper-replaced, and
  in-place reclassified actors/targets;
- real queued post-delete delivery, numeric-id reuse, ambiguity retention/recovery, and canonical-only
  release cleanup;
- same-sector enter, real sector exit, New Game, deserialize/relink, and checksum-valid legacy
  Continue with traffic target-ref adoption before rematerialization;
- route invalidation without stale movement, restoration revival, foreign replacement writes, or a
  stranded canonical `jobId`/brake marker;
- inside- and outside-envelope production geometry, Rapier no-penetration/settle behavior, bounded
  non-boost throttle, moving-target heading, and authored-route fallback;
- control-claim, FLEE, exact escort, ordinary Ceres, and non-Ceres parity.

## Verification bound to the final candidate

| Proof | Result |
|---|---|
| `node --test test/ceres-activity-runtime-lifecycle.test.mjs` | PASS — 30/30 |
| `node --test test/npc-jobs-runtime-wiring.test.mjs test/ceres-escort-formation.test.mjs` | PASS — 47/47 |
| `node --test test/ceres-visible-job-actions.test.mjs` | PASS — 47/47 |
| source/test syntax checks | PASS |
| exact two-path diff check | PASS |

Earlier topology and deterministic V3 compare evidence remained green before the final
lifecycle-only hardening. The unchanged broad baseline was not rerun after its prior functionally
green 11/11 result exceeded the wall-time budget under shared-tree contention; this receipt does not
turn that null timing result into a performance claim.

The reviewed binary diff hash was
`2691ca040f3d2a78fa3ff1eb56d47353aaf31c8e`. Before publication the staged projection matched that
hash, `origin/master` still matched the reviewed parent, and the remote commit was verified to contain
only the two named paths.

## Honest residual

Acceptance is `focused_green`, not `route_accepted` or `milestone_accepted`. The separately admitted
`PQ-045.tender-client-materialization` leaf must materialize the disabled refinery client, preserve
its exact tender route ref across Continue, and update the fixed five-minute object census. The other
seven `activity:` refs remain abstract scan, throughline, and perimeter semantics; inventing physical
objects for them is no longer a requirement. Route topology, causal microevents, occupational
identity, art, headed Browser/Electron evidence, matched performance, and the named human verdict
remain downstream.

Two late review hypotheses remain explicitly **unconfirmed**: terminal cleanup when a retained actor's
numeric ID now resolves to another object, and target-ambiguity revalidation after an unrelated
same-type destruction event. `PQ-045.target-motion-late-audit` may reproduce or dismiss only those two
questions and records its own receipt. It is non-retroactive and does not gate the tender, later Ceres
leaves, or five-minute acceptance unless a causal defect is actually reproduced.
