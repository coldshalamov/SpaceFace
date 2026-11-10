# Accompanied formation progress

## Change
Formation work now counts leader displacement only from the start of the player's current uninterrupted in-band interval. Range breaks and new physical steps reset both the progress origin and hold clock. The authored time and displacement requirements are concurrent, not an extra delay after distance is met.

For scene 423, remain 60-180 WU from the leader for at least 8 seconds while the leader displaces at least 100 WU during that interval. Previously, leader travel while the player was absent could satisfy progress before a late stationary join. The shared formation observer also serves the other formation consumers. No authored scene, NPC navigation, reward, save, generator, trail, bow-angle or speed rule changes.

A real formation break now also says so once: `Formation lost. Rejoin <min>-<max> WU from the lead; the hold starts again.` The guidance is rate-limited to one line per three simulation seconds, is latched before the voice callback so a synchronous revisit cannot repeat it, and stays quiet for the initial approach and for continued absence. It changes no range, hold, leader displacement, reward, navigation, sponsor/decline or save policy, and the per-step feedback state resets beside the new progress origin.

## Regression evidence
- `node --test test/vignette-formation-progress.test.mjs`: 13/13, which is twelve focused cases plus one native case that runs the complete and Save routes.
- Cases cover late joins, concurrent time/distance, both range breaks and inclusive boundaries, gap-cross/formation sequencing, consecutive formation steps, fresh entry, hold-clock reset, missing/dead/non-finite subjects, single payout, sponsor/decline, timeout, and the break guidance firing once.
- The native fixture's observer had been reading the old `holdSince` before the director observed the range break, so its Save branch ran too early to prove an interruption after genuine reacquisition. It now waits until the physical break has actually cleared `formationStart`/`holdSince` (the observed reset), requires a new interval whose `holdSince` is later than the first, and asserts that ordering before the eight-second requirement. `assert.ok(observedReset)` keeps the reset itself part of the pass condition.
- Adjacent contracts: `test/rc-vignettes-459-4242.test.mjs` 15/15, `test/vignette-cost-verb.test.mjs` and `test/vignette-navigation.test.mjs` together 26/26. The RC route uses position fixtures; it is not native-flight evidence.

## Native qualification
Headless input-only route using actual tacticalAI, flightV3, aiPorts and Rapier physics; ordinary seed-1 lived selection at simulation 3600 in Ceres refinery, original 720 WU approach and actual patrol-lawman ring motion. No post-setup position, velocity, intent or body writes, damage suppression, reward injection, gate changes or NPC overrides.

Accepted at 3610.083333; the first hold ran 3611.083333 to the physical break; after the observed reset the new interval began at 3621.083333 and settled at 3629.083333 (8 seconds, 191.0 WU leader displacement from the new origin), paying 48 credits, +2 Helix and exactly one receipt. Player alive with hull 150; zero observed physics-impact events, and the loss guidance was observed on the event bus. The break cost the player real time: the same route took ten simulated seconds longer than the uninterrupted hold it replaces. This is not rendered visual, human-usability or frame-performance acceptance.

## Save interruption
A separate native route is interrupted 3 seconds into the genuinely new hold (`holdSince` 3621.083333, saved at 3624.133333) after the loss guidance was observed. Actual SaveSystem `serialize -> JSON round-trip -> loadEnvelope` succeeded without errors. Live/transient formation progress was not serialized; the consumed-scene stamp remained, player restored, no reward/rep/receipt occurred, and ordinary selection did not readmit scene 423. This preserves existing consume-on-start/abandon-active-scene policy; it does not introduce resumable active encounters.

## Provenance and limits
Current integration is on published master; the focused test and the report are this packet's paths, and `src/systems/vignetteInterpreter.js` carries the change on top of the current file rather than a snapshot. The earlier candidate pins (`0ebaf5d3260` base, `655c558cab0` interpreter blob, `746ff478d7c` test blob) describe the reviewed draft, not this composition.

Not claimed: a player-flown capture with rendering, a full-sector convoy arrival, or frame performance on this host. The native run is a selected-system route in the real owners, not a public browser gate.
