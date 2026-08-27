# PQ-131.10 Inclusion kit — Cycle 01 review (self, evidence_ready)

Candidate: `place_works_inclusion_kit` / master `SF_WORKS_INCLUSION_KIT_V1`
Hash: see `assets/works/inclusion_kit/source/HASHES.json` `masterGlb`.

Supported cameras: `works_top`, `works_edge`, `works_site` at 1920×1080. Original-resolution
inspection of those stills plus family sheets, clay/grazing/normal/ORM/material-ID/identity,
and no-emission site/top.

## What this cycle did

Authored 18 named variants (two each silver/gold/iron/nickel, three exotic lattices, two ice,
three gas fissures, vented scar, MK lock plate) with LOD0/1/2, shared 2048 atlas, local origin,
+Z out, footprint ≤ 0.7 cell. Source kit only — not wired, not released.

## Inspect and fix (one obvious failure)

First stills showed **host undersides baked onto the cut face**, so every cluster read as a
black disc, and the exotic octahedral cage sat as a **floating neon diamond** with the hopper
well punching through the pad.

Fix applied in this cycle: drop unseen host undersides before UV/bake; seat the cage in the
crust with thicker struts; clamp hopper well above the face; lift host/AO response;
recenter family sheets.

## Verdict

`keep` the kit as Cycle 01 `design_candidate` / `evidence_ready`.
G1/G2/G4 whole-asset: **open** (no independent reviewer).
Do not mark PQ-131.10 complete.

## Remaining (cycle 02+)

- Host rock is still darker than the pad; metals read, matrix less so at 19 px/cell.
- Gas mouths are small at family scale — olive host vs dark cavity needs more value gap.
- Hopper still casts a cubic shadow; further step/wall work.
- Atlas islands for non-host pieces are still small; texel density on flakes/chips can rise.
- works_edge of the *whole kit* parks the grid at frame-right (legal camera); per-variant
  edge sheets would show side walls better.
