# DONE — npc-field-role-cache

## Summary

Cache resolved NPC field role (`scavenger_cone` / `anchor_well` / null) on the entity against `data`+`ai` object identities. Traffic/doctrine bindings are authored at spawn and almost never rewritten in place; `fields.js` asks every ship every tick.

Focused: pq147-01-fields-for-everyone + pq-147-01-fields-physics + npc-miner-shared-field → **8/8** pass.

## Before / after

### Offline microbench (primary — portable CPU)

200 ships × 100k rounds (20M calls), sticky roles:

| | Before | After (identity cache) | Speedup |
|---|---:|---:|---:|
| wall | **710.5 ms** | **196.3 ms** | **~3.6×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `npcFieldRole` **20.0 ms** self / 60 s settled.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-ai-cache-npcFieldRole-against-data-ai-identitie.patch`
- Scratch: `vm-work/npc-field-role-cache` @ `4833a998969b56fb76253d904d5064251f6bf88b`
- Microbench: `artifacts/npc-field-role-cache-microbench.json`
- Tests: `artifacts/npc-field-role-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/`
- Measured against master `35e519ebd`

## Apply order

Independent.

## Risks

- If a future path mutates `trafficRole` / `doctrine` / loot ids **in place** on the same `data`/`ai` objects without replacing those objects, clear `entity._sfNpcFieldRoleCached` (or replace `entity.data` / `entity.data.ai`). Today spawn/authorship replaces or sets fields once.
