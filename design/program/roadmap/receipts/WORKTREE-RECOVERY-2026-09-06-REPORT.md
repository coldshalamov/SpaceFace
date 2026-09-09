# WORKTREE-RECOVERY-2026-09-06 report

**Disposition:** `DROP` `C:\Users\93rob\Documents\GitHub\sf-head-check` after parent review and
the exact cleanup gate. It contains no unique source, asset, or evidence value.

## Scope and reachability

- Registered detached worktree: `sf-head-check`, locked `initializing`, at
  `b030b78714c01fedeb496bb7f58fae20576775fa`.
- Audit master: `4a0e2e131087c6de5241cb0192355824c86036e8`.
- `b030` is reachable from audit master; `git rev-list master..b030` is `0`.
- The checkout is an incomplete initialization: its index is empty, while its physical copy contains
  only root metadata, `assets/`, and `design/`; no `src/`, `scripts/`, `test/`, or `package.json`
  payload is present. This is not an active implementation candidate.
- The worktree remained registered and locked throughout this audit. No file, index, ref, or process
  was changed.

## Bounded working-copy hash audit

One filtered `git hash-object --stdin-paths` batch compared every present file using the working-tree
attributes, excluding only `.git` and `node_modules`. This includes ignored source, binary, and
evidence inputs.

| Result | Files | Bytes | Disposition |
|---|---:|---:|---|
| Present working files | 27,297 | 21,509,166,557 | audited |
| Equal to detached `b030` blobs | 27,296 | 21,508,134,365 | `DROP` baseline copies |
| Working-only paths | 0 | 0 | none |
| Detached-baseline paths subsequently changed on master | 19 | — | `DROP` stale copies |

The 19 stale baseline copies are program/roadmap status and packet material plus root policy/workflow
files. They are current-master superseded copies, not uncommitted work.

## One differing physical file

`design/program/roadmap/receipts/fun-loop/strips/crucible/lagrange_crucible-energy_baseline-s8008/frame_009.png`
is the sole differing working-copy blob.

| Value | Working copy | Canonical `b030` and master |
|---|---|---|
| Git blob | `0b7bde4be928850b75526216b8b54f09f13d6ab4` | `db782ac40148164d935be597ff8a2b6d0a7b6f0c` |
| SHA-256 | `7f8de6451e2c130cbe0d9aef86986428813553c3e0f6a17db443fdc888afac31` | `ab29ad0cb16b2fabc15e570abeee97af2a267cda4b14c51c81a8c68e582009ca` |
| Bytes | 1,032,192 | 1,241,276 |

It is not an alternate frame: the working bytes are an exact prefix of the canonical PNG, end before
the `IEND` chunk, and cannot be decoded into RGB pixels. The canonical file is a complete 1280×720
RGB PNG. This is a partial file copy from failed initialization, so it is `DROP`; no recovery donor
was created.

The ignored, compact audit ledger is
`.devshots/worktree-recovery/sf-head-check-b030b78714c-ledger.json`. It records the batch method,
counts, hashes, and prefix finding without adding a 27k-path inventory to Git.

## Cleanup gate for parent

Before deleting the exact worktree, recheck that its registered path still resolves to `b030`, remains
locked with no live process, and that the canonical PNG still resolves to
`db782ac40148164d935be597ff8a2b6d0a7b6f0c`. Then remove only this named worktree; do not reset its
index, delete broad refs, or run object pruning.
