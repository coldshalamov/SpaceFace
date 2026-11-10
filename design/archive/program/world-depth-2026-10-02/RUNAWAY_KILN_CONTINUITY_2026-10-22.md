# Runaway Kiln interrupted rescue continuity

## Baseline and ownership

Public source baseline: `5e5b619b57c53be410e90c7e5f21bbb2fd0127f5`.
Preserves the payload damage correction from draft PR #515, head
`1608d857929257cc182e36582ed7d7a4ab2ee63d` (runtime blob
`a69b8f78db0752c7d4d63f3160c55011ea01b007`). PR #515's CI failure did not
execute its new damage gate: that gate was skipped after preceding Ceres validation failed.

The real Save owner successfully saved and loaded a moving rescue, then emitted
`save:loaded`, but the live coordinator and transient crucible were absent. The
focused baseline test failed with `Save/Continue dropped the live rescue coordinator`.
Save persisted director statistics, not the live encounter. This is a functional
continuity repair, not a new persistence owner for freight, Ceres, or squads.

## Authentic approach regression

The actual eligible Forge approach is (-480, 17104) globally; Depot Three is
(1120, 15824). Real station entities have numeric `id` and canonical `stationId`.
The prior runtime compared only `id`, missed Depot Three, and fell back to the
first station, the Forge. That coincided with the eligible approach and yielded
a zero drift vector, permitting an unearned rescue on the first tick.

The approved local correction recognizes canonical `stationId` while retaining
authored string-`id` compatibility. No station, zone, anchor, threshold or reward
is changed. An earlier displaced-anchor diagnostic is superseded, not ordinary
admission evidence. Final tests use the actual eligible zone and real World
station entities and assert the intended target, nonzero drift and no immediate pay.

## Continuation contract

A versioned, bounded `stats.openRunawayKiln` envelope contains only plain scalar
state: run identity, encounter location and provenance, elapsed time, finite pose,
velocity, hull, ring position and the once-only scratch/scan/latch counters. No
physical handles, entity references, or saved numeric target IDs are authoritative.

The active slot is an enumerable projection getter. Every serializer read creates
a fresh plain snapshot from the same live encounter. This matters because
`save:started` precedes capture, and paced Save can discard and restart a capture
at a newer tick without repeating that announcement. Reading does not mutate
state. Replaced directors and New Game invalidate retained getters. Inactive games
receive no null/empty continuity slot and retain baseline stats serialization.

Continue reconstructs one payload body and one coordinator without firing the
encounter again. Health, motion, elapsed time, causal identity and once-only
counters survive. Duplicate load notifications reuse the exact still-owned body.
Bindings validate object identity, occupant generation, data identity and owner
tags; foreign/recycled IDs are not adopted or cleaned up. Saved, detonated, lost,
drifted, hard-exit and New Game boundaries cannot resurrect a continuation.

Reconstructed scalar velocity is not a successful native observation. Settlement
reads the registered SG-02 owner’s current identity-bound native body, not writable
entity motion or sticky telemetry. Native position, rotation, linear and angular
velocity are read through the body API with origin, generation, readiness and
body-contract checks. Settlement also requires the owner’s completed current
canonical tick. Failed, stale, replaced or unregistered native authority cannot
fall back to projections. Historical no-physics unit fixtures remain explicitly
separate from native acceptance. An immediate
second Save before admission retains the finite reconstructed state; a corrupted
warm-up projection is not silently saved or paid as a rescue.

## Physical acceptance boundary

The fixture uses actual World, encounter director and Save serialization/validation/
load owners, with explicitly in-memory localStorage. Native movement is observed
through the registered SG-02 dynamic body owner. One-body native laboratory probes
isolate motion and impulse from placed-scene contacts; they are labeled fixtures.
The real placed-scene admission is also checked without changing its authored
anchor and gives no immediate reward. Exact scalar pose is checked at the logical
restore event; post-admission position is bounded within 5.001 WU in this fixture.
Observed 2.5–5 WU shifts come from the existing native coincident-center +x ladder
(2.5 WU per step), not lost scalar state. No physics placement policy is changed.
A controlled native impulse demonstrates the
one-time rescue reward, not ordinary player towing. Scan/latch counter probes use
labeled event fixtures. These are not live visual acceptance or proof of exact
whole-world native solver snapshot restoration.

The player tether is **not reattached** by this change. The player must relatch the
resumed load. No new radio warning is emitted during reconstruction, avoiding repeat
warnings on duplicate notifications. Existing tether/Save ownership remains intact. A real physics/attachment/tetherGameplay/
Save probe has one native line before Save, no active canonical/native line after
Continue, cleared player and private target caches, and exactly one native Kiln
body after admission. The observed load reports `nativeRestore.exact === false`.

## Checks

The first candidate passed 69 checks but failed independent review: writable
velocity/angular projections after native admission could be captured and pay a
rescue while actual native speed remained about 24. The corrected suite includes
that regression, native angular motion, stale completed ticks, native failure and
body-contract rejection, plus no immediate reward at actual placed admission.

22 continuity tests pass, plus 51 existing checks: 6 original Kiln, 3 payload-damage,
32 freight-custody, 7 Ceres ambush and 3 load-replanning checks. The first actual
Save/load loss and the canonical-station mismatch both have red baseline probes.
The native path covers 120 observed motion steps, repeat load, fresh native body
admission, actual player-line release and one controlled-impulse reward. The scoped
source closure was checked against verified public blob inventories (1,022 files).

Run the focused gate with `NODE_DISABLE_COMPILE_CACHE=1 npm run check:runaway-kiln-continuity`.
It is added exactly once to the existing `check` graph. The graph expands from 310
to 311 entries, with no other prior entry changed and no new unclassified command.
Graph inspection does not execute the aggregate.

Only the named checks ran; no full suite, browser acceptance, deployment or merge
occurred. Other source and asset owners are unchanged. No new runtime-imported
module or preload-list edit is introduced; the preload repair remains separate.
This corrective candidate requires independent re-review before publication.
