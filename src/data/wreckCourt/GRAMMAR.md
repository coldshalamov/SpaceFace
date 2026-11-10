# Wreck Court grammar

A case is a finished incident. The player does not get a dialogue tree. They get bodies, and a list of claims. A claim closes only when the notebook supports it and nothing they measured contradicts it. An unsupported filing does not erase the scene.

## Evidence and flavor

| Kind | What it is | What it can do |
|---|---|---|
| Measurement | A scan, a trajectory sample, a comparison, a reconstruction, an assay | Can support or contradict a claim |
| Flavor | A rumor, a looping mayday, a painted story | Shown to the player. Never read by the support checker |

Materials in the field manual (`polymer_coat`, `tensile_neck`, `soot`, `groove`, and the rest) are general readings, not case spoilers. Temperature ages are blank once metal has cooled to ambient. Trajectory miss is reported with a few WU of sample noise; thresholds sit outside that noise.

## Ground truth

Each case is a list of bodies and timed events. `runIncident` integrates them at 1/30 s on the XZ plane with seeded layout jitter. Present positions and velocities are the stepper's output. The event log is sealed on the session as proof metadata. `publicView` does not include it. Hidden bodies (a skiff behind a rock, a cable on the far limb) are omitted until line of sight exists.

## Hypothesis space

Every case publishes three claims:

1. A careful reading that needs instruments.
2. A plausible misreading that a look from the start can support, and that those instruments contradict.
3. "Older than the lane," which requires a cooling age of thousands of seconds. Nothing in these incidents is that cold. The claim is there so the space is not a coin toss.

Filing the misreading pays a different party, writes a different world-fact intent, and stamps or sends a body on its way. It does not flash a correction and reset the field.

## Player operations

`scan` (visual, spectro, structure, trajectory, mass, thermal, magazine, signal, fuel), `position`, `grapple`, `tow` / `moveObstruction`, `compare`, `bringPod`, `reconstruct`, `file`.

Spectro on a volatile pod cooks it. Towing a body before its velocity is sampled spoils the historical reading. Towing a rock into a hidden crushable hull destroys that hull. Those are the tamper paths. The court does not restore them.

`reconstruct` fits samples the player already took. Models: ballistic common-origin, heading-versus-age, deflagration order, ejection lead, point-mass back-integration, mirror reflection off a scanned plate normal.

## Uncertainty, per case

The sealed cause is not written here. The public uncertainty is.

- **The Matched Pair.** Intent is not a measurement. A polymer coat can be seen; why it was sprayed cannot.
- **The Burn That Broke the Tug.** Cooling ages are good to seconds while the metal is warm. The pod's occupant is not a witness.
- **The Early Pod.** A transponder can wear a real raid code. Cooking the pod destroys the assay. A buoy that masses a few kilos is not a ship, once it is weighed.
- **The Core That Let Go.** Shared-origin residual includes the separation the pieces were given so they would not spawn inside each other. It is not zero. Spread speed is the internal signature.
- **The Sunward Face.** What is still in the rock's shadow is not evidence. Pushing the rock into that shadow can crush it.
- **The Necked Cable.** A nose pointed away is a present heading. A necked end and a cut end are different, and only the metal says which.
- **The Walking Nozzle.** Two pieces pointing apart only say the hull rotated.
- **The Lane That Kept Going Straight.** The ship is not in the scene. The decoy is a real small charge that the mass has tugged; the lie would be calling that charge the ship. The vent fit is a gravity integral, good against a straight line, not a name.
- **The Whip End.** A full magazine means those guns did not fire. The cable exists only after it can be seen.
- **The Pylon Face.** Which face is torn is the direction of the force. "Damaged" is not that.
- **The Spaced Cooks.** Gaps of seconds along the train are ages. A spectro burn removes a pod from the line.
- **The Plate in the Middle.** A gun that fired is not automatically the gun that killed. The straight back-projection ignores the plate.

## What this is not

Not a black-box pickup, not a patrol bounty, not a `choice` prompt. Completion is a ruling. Credits, heat, and world facts leave as intents. The salvage communicator hook that would offer the early case (`wc_desperate_rescue`) is unapplied; see `ADAPTER.md`.
