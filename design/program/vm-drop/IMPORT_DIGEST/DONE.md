# DONE — IMPORT_DIGEST (report job)

## Summary

Import digest for measured hitch packages still on `vm-drop` and **not** already equivalent on master tip `35e519ebd`. Lists recommended import order, one-line evidence per package, explicit SKIP list, and apply quirks (notably `flight-propulsion-scratch` CRLF → `git apply --ignore-space-change`).

Fresh profile cite: `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/` (settled 60 s, 2026-09-23 ~00:09–00:11 EDT). Full ordered table + notes in `report.md`.

## Already on master (do not re-import)

- Lane C+D merge `1198e70e7`: runway hold prefetch, wave hull decode warmup, soft-GPU hitch floor
- `hitch-asteroid-cell-key` — numeric `cellKey` already in `asteroidField.js`
- `hitch-shed-floor` — `HITCH_FRAME_TICKS = 6.5` already in `simulationRunner.js`

## SKIP (explicit)

- `overview-contact-pool` (~1.04× microbench miss; never outboxed)
- `radar-contact-list-reuse` (~0.94×; no patches)
- `shader-admission-slice` (hitch regress on soft-GPU crucible)
- `hold-prefetch-inbound` (measured miss; lane-c inbound already on master)
- Other known misses: `hitch-opening-admission`, `midflight-wave-hull-decode`, `combat-entity-key-cache` / `syncCombatantBounds` early-out, cloneUniforms ocean (avoid)

## Picture / live game

Untouched. Report-only folder under the vm-drop fence.
