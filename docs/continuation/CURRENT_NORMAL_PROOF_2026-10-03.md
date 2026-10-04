# Current-source normal cycle: verified failure

This supersedes the earlier WIP statement that the current full-production normal/Continue proof was unrun. It does not change the frozen source packet.

The direct Node production-factory test completed at the original85,000-tick bound and failed its `secured` assertion: the job remained in `pads`, entered at tick59,518. The original1,800-mass plate and all three hardware bodies remained live; `nativeFailure` is null and the935-input source closure stayed unchanged. The assertion occurs before Save/Continue, so no current full-cycle Continue acceptance exists.

Exact source closure: `3c2fbd2b28c02d9e74014047a961babbd749872b6f50a959ee514a4e07f83273`, based on upstream `dc142c0108ce7663bc03574349623c3fda1033fa` plus frozen WIP manifest `703db6edda9be6f35ba838aede9f03da491e36c4851c9f44134f5e6a4bfba007`. Seed48, production profile, tactical AI, v3 flight and rapier-dynamic native owner.

Execution: `node --max-old-space-size=192 --max-semi-space-size=4 --unhandled-rejections=strict test/ceres-workfleet-production-cycle.test.mjs`. Assertions, simulation bounds, gameplay source and goldens were unchanged. The start receipt's old-space label is a hardcoded256; actual execArgv proves192MiB old-space/4MiB nursery. A preceding256/8 attempt exited137 after its last logged tick12,000, with cause unconfirmed. That execution problem is separate from the completed lower-heap gameplay failure.

At termination, the cradle is blocked by the original plate at slide0.944444. Plate x is about2WU off the cradle center; the receiver clamp remains active and slack. These observations identify a receiver-state regression to reduce, not proof of its cause. No tolerance increase, snap, force bypass or longer timeout has been substituted.

See `../verification/current-normal-proof-result.json` for the compact exact result, source/execution pins and raw-receipt/output hashes. Treat the Ceres feature as WIP/failed acceptance until the receiver cause is corrected and the complete current normal/Continue proof passes. Entry/native focused and strict continuation results remain separately scoped.
