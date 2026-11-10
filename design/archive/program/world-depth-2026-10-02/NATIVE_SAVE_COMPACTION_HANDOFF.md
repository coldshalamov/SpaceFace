# Native save attestation compaction

## Contract

Save version 16 writes native snapshot schema 4: repeated body contracts and native observations are stored once in inspectable tables, with canonical references on each body. Expansion reconstructs independent schema-3 body graphs without changing the solver snapshot, geometry, entity state, attachment observations, or JSON distinctions. The native owner expands only at its existing adoption boundary. Existing reel and sleep ownership is unchanged.

The 15→16 migration is deliberately a no-op. Legacy schema-3 snapshots, scalar saves without a native snapshot, and recoil-only physics records remain accepted. New manual/iterator/autosave-capture writers use the same encoder; encoding failure refuses the write instead of silently dropping physics. Main, exported-worker and inline-worker preflights apply equivalent validation.

No new Mile/Orchard assets, custody sections, runtime flags, geometry changes, schema-17 migration or restore-readiness extension are part of this increment.

## Bounds

The existing wire envelope remains bounded at 200,000 nodes and 12 MiB. Compact native graphs and expanded native observations are independently bounded at 200,000 nodes and 12 MiB, with depth 62 and at most 2,048 bodies. Invalid references/order/table shapes, accessors, prototype pollution, cycles, sparse arrays and expanded fanout are refused before reconstruction.

## Validation

Local qualification against public source plus this increment:

- Existing CI native-restore entrypoint: 69 passed, 0 failed, 0 skipped; 3.086 seconds under a 256 MiB Node heap limit.
- The new real SaveSystem transaction uses the actual simulation core, physics and save implementations with two ordinary ships and three units of scrap cargo. `serialize` emits schema 4; worker encode/prepare preserves all native observations; normal `loadEnvelope` calls the real `completeRestoreSteps` and reports exact native adoption. Both bodies and cargo survive, and another capture still emits a native snapshot. An explicitly absent snapshot follows the expected `legacy_missing` scalar path.
- Existing native tests also cover sleeping-policy and response-mass continuation, attachment ordering, contact episodes, entity remapping, atomic refusal and rollback.
- Independent focused compact adoption/refusal test previously passed separately. Pure compact/parity tests: 43 passed; local pure selection deliberately skips the two new native cases.
- The actual public schema generator passes `--check`: version 16, 390 serialized paths. Its document delta is limited to the version and migration coverage.
- Combined execution loaded 854 exact public source/vendor files and 11 candidate source/test files, with no installed package modules. Local native qualification used the public vendored Rapier bundle (Git blob `ff2d3aba6c046657d6e50dc367c93c4bfff9cdb8`), including its embedded WASM, under Node 24.19.0. Repository CI retains its existing Node 22 and package/vendor runtime selection.

The local native supervisor enforced 120 seconds plus bounded teardown, 1 MiB total output, a 770 MiB launch free-space floor and a 768 MiB live floor. No limit triggered. These are qualification limits, not gameplay performance claims.

## CI selection and reproduction

The existing `.github/workflows/check.yml` “Validate native restore transactions” step already runs `test/sg02-native-save-reconciliation.test.mjs`. That entrypoint now imports the three compact suites. Both new native cases run by default; no new workflow or package script is required.

Run the combined entrypoint:

    node --max-old-space-size=256 --test-concurrency=1 --test test/sg02-native-save-reconciliation.test.mjs

For an explicitly pure local run:

    COMPACT_PURE_ONLY=1 node --test test/native-attestation-tables.test.mjs test/native-attestation-save-parity.test.mjs test/native-attestation-save-roundtrip.test.mjs

`COMPACT_PURE_ONLY` skips only the two new native cases, not the native tests already present in the existing entrypoint. A future all-tests glob that discovers the new suites directly and also runs the importing entrypoint can execute those suites twice in separate test processes; this is harmless duplication, not extra coverage.

Remote CI for the eventual public commit, full-game/browser Continue, long native campaigns and full-world acceptance remain to be verified. The focused tests do not claim those broader results.
