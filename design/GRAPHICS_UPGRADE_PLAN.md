# SpaceFace Graphics Upgrade Plan

Upgrade in-game visuals with Blender-authored low-poly GLB assets (drop-in, **zero engine refactor**)
plus selective open-source tooling, on a no-GPU laptop. Pipeline is proven and reusable.

**Streamlined pipeline (per batch, NOT per-asset):** build all in one Blender pass → texture (GPU-free
PNG, flat/compressible) → **one** `check-parts-manifest` run → **one** in-game probe (background) →
**one** contact-sheet render → KTX2 release rebuild **once at the end** (background; deterministic).
Tooling in session scratchpad; details in the `spaceface-blender-assets` memory.

## Tier 1 — Ship parts (Blender, zero `src/` edits, no-GPU-safe) — IN PROGRESS
Hulls (silhouette backbone — highest leverage; the player Kestrel + every NPC):
- [x] `hull_starter` — player hull
- [x] `hull_fighter` — wide flat delta (combat NPCs)
- [x] `hull_freighter` — long boxy hauler (traders)
- [x] `hull_gunship` — heavy armored warship
- [x] `hull_interceptor` — sleek flat racer
- [x] `hull_miner` — wide industrial
- [x] `hull_corvette` — mid warship   ← ALL 7 HULLS DONE

Engines (animated glow drive — fan/core/plume hooks):
- [x] `engine_ion_twin` — player drive
- [ ] `engine_ion_small` · [ ] `engine_industrial` · [ ] `engine_resonator`

Weapons (hardpoint silhouette + glowing muzzle):
- [x] `weapon_pulse_cannon` — player gun
- [ ] `weapon_heavy_cannon` · [ ] `weapon_turret_dual` · [ ] `weapon_lance`

## Tier 2 — World props (Blender + ~40-line additive prop loader, high screen-area value)
- [ ] Asteroids (3–4 low-poly rock variants; ~90 fill each mining belt — currently crude procedural)
- [ ] Station (hub centerpiece — currently procedural-only)
- Needs one small fallback-guarded loader module. Coordinate around the perf agent (they edit `src/render`).

## Tier 3 — Render polish (Three.js post-processing / open-source, GPU-aware, coordinate w/ perf agent)
- [ ] Tone mapping + color grade (big perceived-quality win, cheap) — note: ACES deferred for a bloom
      invariant (see `spaceface-skills-spec`); do it right in the composite shader.
- [ ] SMAA/FXAA edge antialiasing (low-poly benefits a lot)
- [ ] Subtle vignette + film grain
- Touches `src/render` → collision risk; defer until the perf agent's refactor settles.

## Done so far (verified in-game, `check-parts-manifest` 0-fail, probe failureCount 0)
- Player loadout: `hull_starter`, `engine_ion_twin`, `weapon_pulse_cannon`.
- NPC hulls (batch 2, streamlined pipeline): `hull_fighter`, `hull_freighter`, `hull_gunship` — live on
  NPCs in-game (freighter on 5 ships, fighter on 1). Deployed to dev path (runtime loads dev per perf
  agent's `PART_RELEASE_ROOT=PART_ROOT`). KTX2 release rebuild deferred to a single end-of-run pass.

**Next 3:** `hull_interceptor`, `hull_miner`, `hull_corvette` (completes all 7 hulls). Then engines + weapons.
