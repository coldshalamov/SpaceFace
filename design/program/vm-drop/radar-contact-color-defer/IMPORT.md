# IMPORT — radar-contact-color-defer

## How to apply

```bash
git fetch origin
git checkout -B import/radar-contact-color-defer origin/master
git am design/program/vm-drop/radar-contact-color-defer/patches/*.patch
node --test test/tactical-map-second-generation.test.mjs test/fix-f56-radar-range-ring.test.mjs
```

Includes / supersedes `radar-range-plate-cache`. If that package was already applied,
expect conflict — use this combined patch instead.

## Picture

Untouched. Hostile trails still paint on the contact pass.
