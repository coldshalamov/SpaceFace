<!-- LIFETIME: HISTORICAL -->
# PQ-045.prop-promotion — receipt

```yaml
unit: PQ-045.prop-promotion
resultCommit: e255e677 (master; candidates 3ef3e36b + d464ede6 on fable/prop-promotion)
date: 2026-08-10
workers: grok-4.5 (two sessions), fable controller (verification, integration)
verdict: PASS (focused_green; per-prop gameplay-distance art verdict remains with the packet's Phase 3 review)
```

## What changed

- Reproducibility gate closed twice over: the kit's 29/46 dual-build drift was nondeterministic
  triangle index-buffer order (fixed; 46/46 byte-identical), and the promotion pipeline exposed a
  second layer — Blender DECIMATE reordering and altering geometry — repaired with deterministic
  vertex/face sorting plus deterministic reduction on the unstable meshes. 16/16 source AND
  release dual-builds byte-identical; hash evidence committed with the kit evidence files.
- The sixteen selected props (BINDING_REVIEW_AND_SELECTION_LEDGER selection) promoted through the
  transactional publish tool (`tools/art/publish_everyday_space_props.mjs`) with PBR maps,
  strictly reducing LODs, tight collision, and manifest rows written by the tool.

## What passed

- `test/pq045-everyday-space-props-promotion.test.mjs` 4/4; `check:graphics:asset-receipts`
  (extended) PASS; `check:asset-reachability` OK; `check:baseline` 11/11 — worker runs and
  controller re-runs at integration.

## What remains unproven / excluded

- Per-prop gameplay-distance visual verdicts (human/Phase 3); runtime placement/usage wiring
  belongs to other PQ-045 leaves; the other 30 kit props stay unpromoted.
