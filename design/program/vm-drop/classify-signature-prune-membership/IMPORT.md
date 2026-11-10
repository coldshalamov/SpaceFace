# IMPORT — classify-signature-prune-membership

1. Apply `patches/0001-perf-activity-gate-classify-signature-prune-on-entity.patch` on master tip (or after #37).
2. Independent of opening/hitch packages. Stacks after #37 classify-closed-form-index.
3. Verify: `node --test test/activity-runtime.test.mjs` → 21/21.
