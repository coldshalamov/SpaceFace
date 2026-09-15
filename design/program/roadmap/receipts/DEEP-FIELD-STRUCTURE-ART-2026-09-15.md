# Deep-field structure art — report (2026-09-15)

## Done

The two Helios backdrop objects that read as glitches are replaced with authored art, baked once into
offscreen textures and drawn as quads. On the default route, next to the ringed planet, a passerby can
now name them: a **relay mast / antenna tower** and a **broken freighter hull**.

- `helios-relay-mast` — tapering lattice truss with cross-bracing, two graduated cross-arms with
  upward antenna elements, a solid parabolic dish on a feed-horn strut, a service platform and an apex
  beacon. It was also rendered **upside down** before (the old `rotateX(-PI/2)` sent the authored
  "+y = top" to world `-z`, i.e. down the frame); it now stands up.
- `helios-derelict-hauler` — a freighter in profile: fore half with bridge block and a dorsal container
  stack, aft half dropped and yawed with ventral containers, three engine bells with dead exhaust
  voids, a window row, frame ribs, and a **wide torn midsection** with an exposed dark cross-section
  and floating debris.

## What changed and why it was broken

| Old | New |
|---|---|
| 12-vertex flat plate, unlit | authored object art, lit/shadow planes, panel lines, windows |
| shading normalized to the shape's bounding box → washed out to one value on a thin shape (mast top and mid-body sampled identical RGB) | explicit per-plane value ramp; the object reads from contrast between its own planes |
| hard aliased stair-step edges | canvas antialiasing plus a soft-edged outer pass |
| body RGB(35,51,79) vs void RGB(11,12,15) — 3-5x void, blue-saturated | base near void, only thin edge highlights rise; ghostly, not foreground-loud |
| per-frame plate shader on every structure pixel | baked once; no per-frame shading at all |

Structures are rasterized once into a `CanvasTexture` at 256/384/512 px (low/mid/high tier) and cached
in an LRU (`structureTexCache`, max 8, keyed `recipe|structure|tier`, disposed on eviction and at
teardown) — the same bake-once/cache/evict shape as `planetCache`. `forceSinglePass` is set because
three otherwise splits a double-sided *transparent* material into two submissions.

## Verification

- `node test/deep-field-browser.mjs` — passes; now also captures a Helios matrix at 5 zoom/azimuth
  combinations. Draw calls **14/10/9/10/12** across the five sectors: **identical to the pre-change
  baseline**, and triangles slightly lower (14589 vs 14605 for Helios). No page or shader errors.
- Pixel diff of the pre/post Helios component frame: only columns 800-960 change (the two objects);
  the rest of the frame is unchanged, so nothing else moved.
- `scripts/capture-space-background-acceptance.mjs` on the canonical route (port 41732,
  `SPACEFACE_PLAYER_STORE_DIR=''`): no page errors; structures visible and legible next to the planet
  in the live frame and in the motion video.
- `node --test test/deep-field-*.test.mjs test/space-background-*.test.mjs` — 35/35 pass.
- `npm run check:baseline` — 14/15 green. The single FAIL was `massline`, whose only red child
  (`check:47a:physical-branches`) **timed out** against a loaded host; it is explicitly reported as a
  contention signal, not an assertion. Re-run alone it passes. Unrelated to the background.
- `npm run probe:runtime-witness` — the probe host was heavily contended (85% CPU busy, memory
  31/32 GB) so its whole-frame p95 is not a usable regression signal. The change is a strict
  per-frame reduction for this layer: same draw calls, fewer triangles, and one texture fetch instead
  of the retired per-pixel plate shader; the only added cost is a one-time CPU canvas bake
  (~19 ms in the live route, inside the existing bake budget).

## Audit of the other background layers

- **Ribbons (helios x3, core_trade_constellation x2, galactic_spur x1)** — kept procedural, not baked.
  They are volumetric particulate (dust lane / high cirrus / galactic band), not objects, and they pass
  the passerby test as what they are. A faithful bake would need a CPU re-implementation of the ribbon
  noise, sampled at grazing angles, at a memory cost well above the current tiny vertex buffers, with a
  real risk of regressing the one accepted authored composition (`galactic_spur`). Flagged as a
  deliberate decision, not an omission. Confirmed they still read correctly in the live captures.
- **Star associations** — density weights on the existing single Points draw call; no failure.
- **Pinned empty sectors** — `belt_broken_dust_lane`, `fringe_tidal_filament` and
  `anomaly_electromagnetic_scar` remain pinned to `ribbons: []` (and have no structures). Per the
  standing instruction these were **not** un-pinned. Audit result: on the canonical route they read as
  sparse, deliberate starfields with a planet landmark — quiet, not broken, and with no flat slab or
  noise artifact. No change made; recorded here as a flagged design decision.
- **Planets** — untouched, beyond the structures now matching their value register.

## Not done / follow-up

- No authored objects were added to the other five recipes. Their "middle layer" is still empty by
  design; adding recognizable distant forms there is a product decision, not a rendering fix.
