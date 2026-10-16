# Solid payload sensing and bounded Ceres recovery proof

PR #419 preserves generic solid non-cargo payload avoidance and cargo-objective precedence. Its original Ceres CI failure is reproducible: historical base `b4fa1e24fb0b82d790c78af55f226e5dc1a6fa3c` reaches extract at tick 7078; head `ce28f74785ddb953a6e0e1f611f52fda929ce7b8` remains in reacquire at the old 12000 cutoff.

The changed ambient world leads to an external asteroid impact, with the equivalent replay identifying a furnace material shard. The original impact receipt lacks occupant generation, so that shard linkage is a replay correspondence rather than generation-certified provenance. The worker then recovers normally at its authored safe pace. At 12000 it is moving toward the original work pose, with no blocked reason, under an active finite approach deadline 18443. The earlier hypothesis of a permanent penetration hold was not supported. No physics, recovery speed, seed, controls or sensor behavior is changed to recreate the old trajectory.

The test increment keeps 12000 as its normal-path bound. Only an already-active, production-validated final approach can use its original deadline, captured once and never extended. It checks original live occupants, unique role ownership, native bodies, mounted-head/cargo custody, unchanged plan geometry, physical progress and deadline on every additional ordinary tick. Missing, malformed, restarted, blocked or expired plans fail. Motion alone cannot pass: all original extract, save/Continue and player-custody assertions remain.

Validation on the historical PR closure:
- 54 focused guard tests passed, plus an import-only smoke using actual production planner/restorers.
- Base full production acceptance passed at extract 7078; candidate passed at extract 13128, before 18443.
- Both completed the unchanged Continue and player-custody proof. No output, heap or time-cap failures.
- Local Node 24.19.0 and Rapier 0.19.3; original failing CI used Node 22.23.3.

Current master `9f1f7dd224526e4075f5d49f40b76331963dc60b` shares the target test/recovery blobs, but 27 other dependency paths changed after the historical base. This local result is not current-master integration acceptance. Preserve those upstream changes; the updated PR's actual merge CI must pass before declaring it ready.

Broader world-depth delivery, long-session resilience and other integration goals remain open. This increment repairs one bounded acceptance contract; it does not claim those larger goals are finished.
