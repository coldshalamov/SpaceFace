# ROCK-03 — Rock polish: slag veins glow (not black), dark rocks read against space, Adventure field rocks surfaced

Evidence: `.devshots/fleet/runs/ACCEPT-05-first-hour.hydrogen.*/RECEIPT.md`, crops in `.devshots/fleet/accept05/`
(`crop-r1-ember-rock.png`, `crop-r2-dark-rock.png`, `crop-r3-dark-rock.png`, `adventure/22..24`). Prior rock work: `d01d4b4498`
(triplanar, substance identity, one shared program), `162b763736`, `9d680087ef`, textures in
`assets/ships/release/surfaces/rock-triplanar/`.

1. **Slag ember veins render as a pure-black jagged band** (RGB ~0,0,0) across the rock instead of glowing. Find why (the
   emissive vein mask sampled as albedo? emissive intensity 0 / tone-mapped away? a mask channel inverted?) and fix so
   the veins are thin, hot and glowing (small, emissive, bloom-eligible) on near-black glassy slag.
2. **Dark rocks vanish against space** (R2 charcoal/violet boulders "barely legible"). Keep them dark, but guarantee
   silhouette separation: a cool rim term on rough rock that lifts the edge against black (subtle — rough rocks get a
   dim, broad rim, not a glassy line), and/or a slightly raised minimum albedo for the darkest substances. Check against
   the nebula and against pure black.
3. **Adventure field rocks** ("Metallic Asteroid" and Helios field rocks) still render as smooth low-poly icosahedra
   (procedural `astMaterial` path). Route them through the same triplanar family (substance by their type: metallic →
   metal ore, etc.) without adding programs beyond the shared family; no per-rock materials.
Verify with look-bench (`scripts/fleet/looks/look-bench.mjs`, frozen frame, file-safe variant names) on a Swarm r1–r3
frame and the Helios opening frame; report the before/after crop paths and GPU pass/program counts. Tests for touched
files; exact-path commits (renderer/visualFactory have other writers: own-commit.sh).
