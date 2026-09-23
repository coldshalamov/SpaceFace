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

## Also this session

New measured packages outboxed beside this digest:

- `combat-subsystem-key-cache` (~7.5× subsystem id sort cache) — row 23
- `npc-field-role-cache` (~3.6× data/ai identity cache) — row 24
- `docking-corridor-publish-scratch` (~3.7× proxy-diag scratch + key cache) — row 25
- `customs-scan-cone-scratch` (~1.38× WeakMap cone pool) — row 26

## Picture / live game

Untouched. Report-only folder under the vm-drop fence.

- #27 `hostile-for-ai-earlyout` @ `1ef01cc3c`
- #28 `stunt-flight-range-prefilter` @ `342fde89b`
