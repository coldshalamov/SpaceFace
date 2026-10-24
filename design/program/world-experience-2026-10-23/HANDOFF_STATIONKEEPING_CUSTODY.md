# THE HANDOFF: deliberate stationkeeping and native cargo motion

## Behavior

A 60 WU/s fly-through of the seller's 210 WU offer ring no longer bonds illegal freight to the player or pays the original 60-credit / Quiet +2 contact reward. Acceptance requires a continuously observed six-second hold alongside the seller at relative speed no greater than 6.4 WU/s, with quiet guns and a live, active, undocked player in flight.

Acceleration, leaving the ring, absent or invalid velocity observations, player absence/death/disable/docking, leaving flight mode, firing, or hitting a counterpart resets the hold. Observation gaps over two simulation seconds restart it; paused time cannot advance it. Approach and withdrawal comms explain that passing through signs nothing.

The original four physical pods and finite cargo remain authoritative. Acceptance cuts one original undelivered pod from the conveyor and settles custody/reward once. Actual buyer completion takes priority; incomplete expiry uses `deal_lapsed` instead of false delivery. The receipt describes paid pods remaining as real bodies, not cargo loaded into the buyer's hold.

For native dynamic bodies, buyer receipt and bonded-pod redirection now enqueue one mass-scaled impulse through the existing authority membrane. Receipt matches buyer drift; a bonded shove adds 3.2 WU/s toward the player to player drift. The legacy backend retains its existing exclusive velocity integration. No pose writes, new ledger, substitute cargo, actors, UI, or reward changes are introduced.

The encounter prewarms `places/place_cargo_pod_standard.glb`, the actual rigged place asset selected by its cargo producer, rather than an unrelated capsule. A real producer-to-selector/place-slot regression verifies the declaration. This does not establish measured hitch reduction.

## Focused verification

- Revised focused consumer overlay: 40/40 passed (28 focused custody/motion/asset cases, 7 original THE HANDOFF cases, 5 NXB-040 cases), independently repeated.
- Exact public authority membrane (blob `9005b621` prefix), rock substances, doctrine, and model-selector sources were qualified against public master `3095a835eb3dbda178d359bbb0541e3ee6124f4c`. Remaining transitive dependencies were not all public-qualified.
- Original public encounter blob `a8e6ebd04606ca26c314bb8b013e575c44040587` fails the fly-through negative control.
- Earlier stationkeeping review passed 31/31 plus five boundary probes; the asset prewarm revision passed 32/32. These are historical focused results, not current-tree whole-game acceptance.
- Both npm aliases are appended once to the existing `check` chain. Original order and CRLF are preserved; reversing each narrow package addition exactly restores its prior bytes.

```sh
node --test test/handoff-stationkeeping-custody.test.mjs test/cr-hollow-1-the-handoff.test.mjs test/next-wave-nxb-040.test.mjs
node --test test/handoff-stationkeeping-native.test.mjs
npm run check:handoff-stationkeeping-custody
npm run check:handoff-stationkeeping-native
```

Separate local execution of the npm aliases was NOT RUN for publication. Direct test evidence is described above and below.

## Qualified native-motion evidence

The new portable native test runs real Flight V3 and Rapier at 60 Hz, observing the encounter on the real calendar cadence through 110.7 simulated seconds. After initial spawn it does not repeatedly overwrite fixture poses or velocities. The old implementation passes 0/2; the revised candidate passes 2/2.

- Fly-through: no bond or reward; all four original pods received by 17.5833 seconds.
- Settled hold: one original pod bonded at 7.0833 seconds; exactly one 60-credit / Quiet +2 settlement.
- Bonded pod: directed displacement over the first two seconds is +6.39985 WU toward the player, versus -5.43974 WU before the correction.
- First early buyer receipt: the next six native ticks show zero relative speed/displacement, versus the old 3.2 WU/s and 0.320 WU displacement. Later physical collisions remain allowed.

This is a qualified isolated native diagnostic: radius-2 synthetic carriers, not production MTS hull geometry; only the relevant public authority sources were overlaid, not the entire production dependency graph. Contact capture is not comprehensive collision telemetry. It does not prove a full production-manifest playthrough.

## Open residual and limits

After `contact_made`, encounter receipt processing stops. In the native hold scenario, original pod 5 remains seller-owned. The remainder of the deal therefore must not be described as completing after the player joins. This residual is not solved by the current increment.

Full current-tree production physics/geometry acceptance, Save/Continue integration, live visual playthrough, performance acceptance, and broad local `check` / `check:ci` were NOT RUN. Paid pods are not claimed to be loaded into a hold. No merge, deployment, release readiness, or whole-game acceptance is claimed.

## Remote CI history

- Initial head `12ec3648a09a019a54a01104bcf8f83c0614967c`: [run 40041069235](https://github.com/coldshalamov/SpaceFace/actions/runs/40041069235) failed, with eight failed jobs whose failure sections matched public-parent CI, one cancelled browser shard, and a failed aggregate.
- Asset-prewarm head `34e88d275571b4cf86ae5b76b8fdd1a3a0a33ca8`: [run 40043961635](https://github.com/coldshalamov/SpaceFace/actions/runs/40043961635) likewise failed, with eight baseline-matching failed jobs, one cancelled browser shard, and a failed aggregate.
- In both runs static shard 1 skipped its matrix after the earlier visual-continuity failure. The focused handoff alias was therefore NOT RUN remotely.
- The native-motion revision is tracked separately for its exact published head in the pull request. Earlier red CI and isolated focused passes are not substitutes for that result.
