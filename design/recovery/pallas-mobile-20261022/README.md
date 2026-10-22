# SpaceFace recovery checkpoint: Pallas and mobile HUD

RECOVERY ONLY. This branch adds recovery artifacts, not runtime implementation. It is not an integrated PR, merge approval, visual acceptance, or a claim that both changes were tested together. Later residency work is excluded. Preserve newer master work when integrating.

Two independent frozen snapshots are preserved:

- Pallas light-cut: parent e7f6122f8d8f2985223940bfbb60eb4f66272561; candidate 77b7e2b1161b850783a2940b9ab8b19e5bed4dbe; tree 958959c62a2ceee1966795904a9c4beef6205983. Exactly 34 changed paths, including actual Blender source, source/release/runtime GLBs, generator, source and tests. Historical focused validation: 85 passing tests. All 34 changed files were reconstructed from the binary patch and compared byte-for-byte with the frozen snapshot before publication.
- Mobile HUD lane repair: same base e7f6122f8d8f2985223940bfbb60eb4f66272561; seven changed files. Historical focused validation: 126 passing tests. All seven files were independently reconstructed and compared byte-for-byte with the frozen repair before publication. This is source/stand-in DOM validation, not computed-layout/browser acceptance.

## Exact recovery

Keep this directory outside the recovery checkout. Use two NEW, clean clones, one per snapshot. Requires Python 3 with standard-library lzma and Git. No package install or test execution is part of recovery.

```sh
RECOVERY_DIR="$(pwd)/design/recovery/pallas-mobile-20261022"
git clone https://github.com/coldshalamov/SpaceFace.git ../spaceface-pallas-recovery
git -C ../spaceface-pallas-recovery checkout --detach e7f6122f8d8f2985223940bfbb60eb4f66272561
python3 "$RECOVERY_DIR/restore.py" pallas ../spaceface-pallas-recovery

git clone https://github.com/coldshalamov/SpaceFace.git ../spaceface-mobile-recovery
git -C ../spaceface-mobile-recovery checkout --detach e7f6122f8d8f2985223940bfbb60eb4f66272561
python3 "$RECOVERY_DIR/restore.py" mobile ../spaceface-mobile-recovery
```

The script validates chunk SHA-256/Git blob hashes, compressed and uncompressed patch SHA-256, exact base commit, clean checkout and baseline blob identities. It applies one patch and validates every output SHA-256 and Git blob identity. `manifest.json` is the complete identity record. The patches use Git binary patch format where needed. Chunks are ordered base64 text of XZ-compressed patches; every payload file is at most 24 KiB. Recovery does not require any private download link or a local backup service.

## Handoff and acceptance limits

Pallas preserves native finite resources and clamp/cut/tug/reel/carrier-line transfer mechanics, rollback, retirement and Continue. The source/release/package geometry and serialization paths were covered by the frozen focused validation. Ordinary leave/return reconstruction, destination/offload/sale, broader episode, live worker/browser/GPU/camera acceptance and current-master integration remain open. Mobile lane work needs computed CSS geometry, safe-area hardware, scrolling, font wrapping, hit testing and player-readability verification after integration. Long critical receipts and authored race/cadence overlays remain caveats.

Do not apply both snapshots to a newer master and label the historical results as current. Reconcile source conflicts, preserve unrelated work, run explicitly reviewed targeted tests and complete the actual implementation PR separately. No combined test pass is claimed. This checkpoint does not alter workflows, deploy, merge, or close the requested PR-delivery work.
