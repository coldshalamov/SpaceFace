<!-- LIFETIME: DURABLE -->
# Ship mesh transition evidence

## Observed failure, not a claimed cause

PR461 successor b7bc0f7adba079751d80d68a9a0b2b828c65d487's browser3 artifact
12276478528 reports ship_mule id356 changing35→37 meshes at frame262 with the same
root UUID, lod0 and23 authored surfaces. Eighty retained failure rows describe that
same discrepancy. The direct public baseline did not finish this probe. Existing
receipts cannot identify the added children, attribute this failure to the salvor
increment, or establish a baseline defect.

## Reproduced production path

The actual exported syncShipAuxPools calls attachShipHeadlamps only for an eligible
visible root. The latter adds GLTFKit_Headlamp_Lenses and GLTFKit_Headlamp_Beam.
A browserless Three.js fixture exercises those real functions:35 initial meshes,
23 tagged authored surfaces, hidden root remains35, first eligible sync becomes37,
subsequent sync stays37. This is a synthetic geometric fixture, not a new capture
of the historical Mule. It proves a plausible late topology mutation path, not the
identity of the historical extra meshes. No production behavior is changed here.

A correct lifecycle repair must cover detached authored GPU preparation, cached
root templates, mounted boundary rebinding and whole-ship LOD replacement. Merely
attaching to every hidden ship or excluding all auxiliary meshes from the oracle
would risk new hitches, wrong fit or duplicate lamps and would hide real churn.

## Bounded observer addition

The existing browser probe now retains mesh membership deltas for count changes or
its existing composition/authored-state/slots signals. A root/generation/mounted-LOD
change establishes a new baseline, never compares unrelated ownership. Stable
frames reuse the previous observation without another subtree walk. Changes keep
at most256 mesh identities,16 added/removed rows per side and180 characters per
text field. Missing/duplicate IDs, collection failure or overflow explicitly mark
membership incomplete.256 exact nodes remain complete;257 do not. Each retained
transition includes observedAtFrame; repeated failure rows refer to that original
observation, not a new mutation. Equal-count replacements without any existing
identity signal are intentionally not a universal per-frame membership oracle.

The collector holds scalar records only, not mutable mesh references. Its exact
self-contained implementation is embedded in the serialized Playwright callback
on the Node side. No window global, module fetch, gameplay write, timer, extra frame,
new await, timeout adjustment or acceptance exemption is added. All original
stability predicates remain unchanged. Diagnostic overhead is not an FPS measure.

## Validation and next action

Nine focused tests cover production aux reproduction, real added/removed IDs,
no unchanged-frame rewalk, ownership/LOD reset, bounded overflow, failure, exact
callback serialization and same-count identity-signal replacement. Existing
headlamp and aux-pool neighboring tests also pass. Both new test modules are
imported once by the existing visual-probe-server lifecycle parent, keeping the
existing command graph and browser budget unchanged.

Publish source-only on the current public baseline and inspect exact-head browser3
identityChange rows. If they identify headlamps, move attachment into the proper
prepared owner lifecycle and recheck all replacement/LOD/disposal paths; otherwise
fix the actual identified writer. Do not mark the visual gap or game accepted merely
because these diagnostic tests pass. No live screenshot or whole-game acceptance
is claimed by this change.
