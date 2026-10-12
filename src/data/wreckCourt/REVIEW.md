# Wreck Court review

Two passes, both in this sitting. No second agent. Fixes are in the same tree the tests run.

## Physics

The first integrations were not credible, and the filings that depended on them were wrong.

- Pieces spawned inside each other. The contact solve then invented an impulse. Children are now offset along their departure. Vent scale is `noCollide` and is shed in the ship's state, so it records the coast instead of bouncing off the hull.
- The slingshot ship was bound (specific energy negative) and was still in the scene at the end. The inbound leg is now a positive-energy flyby. The ship is gone. Gravity back-integration of the vent scale matches to numerical noise. A straight line through the same samples misses by hundreds of WU.
- "Zero leftover momentum" on the barge counted the barge's own drift. The internal signature is spread speed about the center of mass, plus a shared origin. The tender is not in that set.
- The massline skiff was given a tangent velocity by hand. A timed impulse now is the whip. The tangent reading is whatever that impulse left after the short coast.
- The ricochet round is integrated from the post-impact coast, not from a discrete hit on the plate. A fast round tunneled the plate in an earlier step. The mirror fit is the check that this coast is the reflection of a line through the gunship, and that the straight line is not. That fit is what the careful filing requires.
- The lane decoy is a small simulated charge. The mass tugs it. It is not arranged into a symbol.

## Mystery

Solved with `carefulInvestigation` and `visualOnlyFiling` only. Neither reads `proofTruth`. Requirements are not in `publicView`.

- Opening view of the ambush does not contain the skiff. Tested.
- Flavor can be overwritten with the answer and the filing does not change. The notebook never stores it. Tested.
- A glance files the misread on all twelve. Instruments contradict it and support one other claim. Tested on seeds 40404 and 909.
- Cooking the isotope pod used to leave the raid claim fileable even after a full instrument pass, because only the ejection lead contradicted it. A buoy of a few kilos is not a ship. Weighing it now falsifies the raid. The glance, which never weighs it, can still file the raid. After the pod is cooked, neither claim closes.
- Shoving the rock along the hauler's scar crushes the skiff. The ambush claim no longer closes. The far-side groove, if you still go around, also kills the rock story, so the court does not quietly accept the accident either.
- The careful procedure groups bodies by the signal-scan transponder, and it only runs the vent and train fits on those public groups. A pilot who never takes a signal scan does not get those fits. That is the instrument, not a hidden flag.

## Left unapplied

The loss-investigation communicator hook, economy/heat/fact intents, and the save blob are described in `ADAPTER.md`. They are not wired. Silhouettes are extruded meshes from `assets/wreck-court/variants.json`, not Forge GLBs.
