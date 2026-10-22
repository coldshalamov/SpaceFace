# Software emergency consistency recovery

RECOVERY ONLY. Exact reviewed patch against public PR496 commit eb34d11b9b1711380176a75791653542448a0524, source subtree a39bec406979ab10caf2d486a30ba2a6c2c3902e. This artifact does not integrate code, merge or deploy.

## Restore

Create a new clone and check out eb34d11b9b1711380176a75791653542448a0524 detached. Run `python3 /absolute/path/to/software-emergency-consistency/restore.py /absolute/path/to/new-clone`. The script checks baseline and patch hashes, applies the exact patch, and verifies all three output SHA256 values. It does not install packages or run tests. The two existing companion test sources are also preserved under test/ for reference; the new focused test is inside candidate.patch.

## Preserved change

Adaptive resolution accepts explicit initialScale and disabledScale with hardware-compatible defaults of 1. Software emergency initialization and runtime agree at the existing 0.34 floor. Disabling or refreshing dynamic resolution preserves that floor; healthy hardware still restores 1. Route eligibility precedes the initial sizing callback. Software-only bloom-off survives normal settings sync, sector normalization, and active transition scratch options without changing player settings.

src/render/bloom.js and src/core/gameState.js remain byte-identical to baseline; PR479 owns the separate bloom resize-level cap. No floors, global quality, player presets, graphics flags or telemetry routes changed. Package-script registration is not included.

## Evidence and limits

The preserved baseline test log has three expected failures (disabled/enabled controller mismatch and bloom re-enabled by ordinary sync), with the hardware control passing. The passing log is 13/13 for `node --test test/software-emergency-consistency.test.mjs test/mach-04-software-bloom.test.mjs test/dynres-target-pool.test.mjs`. The focused test executes actual exported renderer methods and production initialization/settings-refresh blocks with sizing/toast sinks stubbed. Temporary machine paths in logs are replaced by descriptive placeholders.

This establishes reviewed runtime consistency, not visual acceptance or a proven WebKit crash fix. No new screenshot exists. Current-master reconciliation, implementation publication, device performance and full gameplay acceptance remain separate. Do not run test/anvil-receiver-delivery.test.mjs or aggregates that include it.
