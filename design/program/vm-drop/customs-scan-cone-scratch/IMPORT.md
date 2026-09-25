# IMPORT — customs-scan-cone-scratch

## What it is

Reuse one `customsScanConeOf` cone object per scanner entity via WeakMap so law cone update stops allocating `{origin,heading,...}` on every probe/read.

## How to apply

```bash
git fetch origin
git checkout -B import/customs-scan-cone-scratch origin/master
git am design/program/vm-drop/customs-scan-cone-scratch/patches/*.patch
# CRLF on master for lawSecurity.js — if am complains:
#   git apply --ignore-space-change design/program/vm-drop/customs-scan-cone-scratch/patches/*.patch
node --test \
  test/pq-148-02-smuggling-physics.test.mjs \
  test/pq-151-01-patrol-nets.test.mjs
```

## Picture

Untouched.

## Apply order

Independent. Law long-tail.
