# Ceres disturbance recovery follow-on

Apply after the immutable disturbance WIP packet (`f433fee5c547f81ae6bd5f529828ff57b471431d054d7debee1d8090db79aae2`), including its original dependencies and native lifecycle correction. This follow-on changes only the existing Ceres controller/query helper and focused tests. It does not change geometry, masses, control limits, the one-WU initial cargo gate, the 211-WU reacquisition limit, or the 740-WU local work boundary.

## Corrections

- Revalidate actual relative pose, point velocity, native clearance and safe interior at the moment a head clamp is bound. A preceding tick's readiness cannot authorize binding after a new impact.
- Continue carrier point-velocity feed-forward and native swept-path refusal while the dock is pending. If the final approach is obstructed, return to the preceding authored corridor waypoint. A clear translation can precede rotation near the flush dock; every segment still uses the full native head compound, and only the original waypoint tolerances can advance the job.
- Require the carrier's original work pose for initial tow commissioning. A docked displaced carrier must use bounded reacquisition rather than tow directly across the gap.
- End a recovery lifetime before presentation/native admission can early-return on replaced hardware. All exact recovery participants are included; terminal handling drops local activity leases and pending control without inventing replacement custody.
- Test the already-added return deadline through real obstruction, braking, clearance, replanning and typed Continue. The deadline never resets. Expiry preserves the actual mount, ends the job and releases leases. Corrupt or future saved budgets fail closed.

## Evidence

The final manifest and verification report carry exact executed-source hashes and commands. The isolated overlay loader supplies the actual runtime code; older fixtures also print on-disk baseline hashes, which are not substituted for the executed-source audit. The frozen WIP remains immutable. The same new docking tests fail on the WIP because it binds stale readiness and bypasses carrier commissioning; overwritten-hardware lease tests also fail there. These are discriminating regression cases, not relaxed old expectations.

The selected-owner deadline fixture deliberately constructs an observer near the local route so the original site solids are admitted through the ordinary activity owner. A distant observer correctly caused the native query to refuse an unresolved nearby solid; no query exception was introduced to pass the fixture. The actual full Save/native-envelope probes are separate acceptance evidence.

Focused final source results: 24/24 new recovery/lifecycle/docking cases; 43/43 existing attachment Save, articulation, head-return, identity and native lifecycle cases. The existing runtime suite is 18/19: its unchanged seed47 fixed 7,600-tick extraction assertion remains red after the real collision. Its selected-owner complete cycle does secure at tick 64,267, but this is not full-factory acceptance.

The final-source actual historical mid-return Save reaches real Continue at tick 19,150, preserving exact plate pose, velocity, rotation, mass and a single durable identity. It earns extraction at 20,168 and remains physically moving through 20,768. The actual post-second-impact Save physically docks its head at tick 20,027 and passes actual Continue at 23,227 with the original return deadline 156,837 unchanged. It holds safely for player entity 1, replans when that obstruction clears at 93,521, returns to work, and earns extraction at 129,097. Through tick 129,697 the same 1,800-mass plate is moving with its real new tow and native body, and the process-local plate lease has been released. The earlier 90,000-step diagnostic ended while the carrier was still progressing at tick 107,826; that capped red result is preserved. The completed diagnostic covers the already-earned finite deadline, without changing the controller budget.

## Remaining boundaries

- A mobile free load that exceeds the conservative capture drift budget remains a safe `cargo-moving` hold. Relative-velocity rendezvous has not been implemented or accepted. The selected early reconstruction is a different physical scenario and remains open.
- Current-master normal full-factory acceptance is independently red at the receiver pads at tick 85,000. The plate and native bodies remain intact, but final retention was not earned and Continue was not reached. The older successful normal source is not proof for this source.
- Art was rejected separately. GPU acceptance and four world-site census mappings remain open; this packet makes no visual acceptance claim.

Run the focused files in the manifest with ordinary Node tests in the composed repository. Use the WIP's `scripts/probe-ceres-reacquire-saved.mjs` for the actual full Save fixtures. The final composed source needs its own current-master normal/Continue proof after all corrections.

## Reproduction

In the composed repository, run the new recovery tests plus the existing compatibility suite. The two actual Save probes are:

```sh
node --max-old-space-size=192 --max-semi-space-size=4 scripts/probe-ceres-reacquire-saved.mjs test/fixtures/ceres-reacquire/seed47-mid-return.json.gz 16000
node --max-old-space-size=192 --max-semi-space-size=4 scripts/probe-ceres-reacquire-saved.mjs test/fixtures/ceres-reacquire/seed47-after-second-impact.json.gz 140000
```

The 140,000-step observation bound reaches beyond the second fixture's original controller deadline. Success occurred before that deadline. The normal full-factory 85,000-tick assertion remains unchanged and independently red. Save fixtures and source proof are historical inputs; repeating on a newer master produces new evidence and must not reuse this source pin.
