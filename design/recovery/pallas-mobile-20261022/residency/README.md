# Additional recovery: exact residency correction

This append-only checkpoint extends the earlier recovery commit 5072f4251a39fcf51d6dc5d6209f75fc4af4dbaf without replacing its two historical snapshots. It remains RECOVERY ONLY, not an implementation PR or current-master integration. The original README's exclusion of later residency work describes that earlier checkpoint; this directory now preserves the separately validated correction.

## Exact chain and scope

1. Restore the original 34-path Pallas snapshot 77b7e2b1161b850783a2940b9ab8b19e5bed4dbe / tree 958959c62a2ceee1966795904a9c4beef6205983 from the parent directory.
2. Apply the complete 69-path upstream overlay, yielding reconciled candidate 14b80eeba8da81b81224286d133f34972dfdff30 / tree 61eba1857f51cabf27f6a69f633421a1e998ac72. This is a reconstruction of that exact historical candidate, not a claim it includes newer master changes.
3. Apply only the four-path residency derivative: three source changes and one test. It is not combined with the mobile repair.

All 69 overlay files and all four derivative files were reconstructed and compared byte-for-byte to their frozen source snapshots before publication. The full overlay tree independently recomputes to 61eba1857f51cabf27f6a69f633421a1e998ac72. Manifests pin each baseline/output Git blob, output SHA-256, compressed/uncompressed patch SHA-256 and all chunk identities. Every artifact is <=24 KiB.

## Recovery command

Starting from the repository root containing these recovery artifacts, use a NEW clean clone:

```sh
RECOVERY_DIR="$(pwd)/design/recovery/pallas-mobile-20261022"
git clone https://github.com/coldshalamov/SpaceFace.git ../spaceface-residency-recovery
git -C ../spaceface-residency-recovery checkout --detach e7f6122f8d8f2985223940bfbb60eb4f66272561
python3 "$RECOVERY_DIR/residency/restore-residency.py" ../spaceface-residency-recovery
```

The script calls the original Pallas restoration, then verifies/applies the overlay and residency patches in order. No dependency install or test is run automatically. Do not run this atop the separate mobile recovery or a newer master checkout.

## Handoff

Residency retains only a previously admitted exact reef entity/data/job/generation with a unique live world record. The guarded exception keeps live jobs and constraints across production membership exit and hard entry; real control leases, tow assistance, fleeing/completed jobs and disputed/extracted/lost material remain excluded. Normal/full cleanup is still destructive. Carrier pursuit follows the real released section with a stable receiving approach without injecting pose, velocity, force, stock or receipts; existing transfer identity, custody, line and native-body checks remain.

Fresh independent verification on this derivative passed 51/51 explicitly selected tests: 17 native residency/physical/read-model and 34 generic towing/wiring/traffic-restore tests. These 51 results apply to the exact 14b80-based derivative, NOT to 77b7 alone, NOT to mobile, and NOT to current master. See validation.json for exact commands and log identities.

Tests exercise production sector lifecycle APIs with the native fixture, not personally piloted gameplay. They assert original entity and line identity, finite stock, resumed work and a single carrier receipt after return, plus disputed-stock guards. The fixture omits unrelated world encounters. Protected actors remain live; destruction/rematerialization of those actors is not demonstrated. Camera/GPU/browser/controller feel, full-population performance, destination/offload/sale and broader episode acceptance remain open. Package gate registration and reconciliation with current master remain implementation work.

Earlier failed experiments are not reclassified as passes: baseline line/crew failures, corrected carrier-test initialization errors, a mining guard failure, partial-cut approach failures, and an undiagnosed parallel runner failure preceded the final passing serial run. The cause of the historical mining-duration failure was not independently reproduced; the frozen real mining-drain assertion passed in the fresh run. Historical test results are not aggregated into a fictitious combined suite.
