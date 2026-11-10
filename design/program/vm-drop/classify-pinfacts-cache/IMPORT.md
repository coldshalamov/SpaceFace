# IMPORT — classify-pinfacts-cache

## How to apply

```bash
git fetch origin
git checkout -B import/classify-pinfacts-cache origin/master
git am design/program/vm-drop/classify-pinfacts-cache/patches/*.patch
node --test test/activity-runtime.test.mjs
```

Supersedes `classify-closed-form-scan` (includes that filter plus pinFacts cache).
If closed-form was already applied, prefer this combined patch or cherry-pick carefully.

## Picture

Untouched. Portable CPU only.
