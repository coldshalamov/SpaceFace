<!-- LIFETIME: CAMPAIGN -->
# X1 — One art direction: status

**Campaign:** X1 (Lane 6, LOOK & SOUND). **State: work landed; owner approval still OPEN.**
**Owner gate:** OPEN. Nothing in this file approves it. X2 mass production does not start until the
owner writes approval into this file (see "Owner approval" below).

## Done

- `DIAGNOSIS.md` — the measured cause chain (three media, no depth/scale rule, arena furniture
  built from three bare primitives).
- `STYLE_BIBLE.md` — one page: one medium per depth band, the planet rule (including the one-sun
  rule and the nebula value/saturation ceiling), the Forge prop rule, scale modules (including the
  pebble/boulder/monolith rock ladder), colour/light, never list, asset acceptance.
- `CENSUS.md` — every class that breaks the bible (B1–B7), every class that complies (K1–K7),
  scale census, manifest counts, and the 2026-11-06 plate-face value finding.
- **Production proof:** `src/render/arenaFinish.js` (new) — a chamfered unit box (60 tris, exact
  1×1×1 datum) and the shared three-value prop palette + hazard band / work lamp / panel helpers.
  Applied to `src/render/lawArenaDressing.js` (four law rooms + Mill/Hive boss dressing),
  `src/render/foundryBankSurface.js` and `buildFoundryToy` (the Ricochet Foundry furniture).
- **Foundry bank plate (second review fix):** one vertex-coloured surface, still exactly one mesh
  and one draw. The deck now carries a light working surface, two mid clamp rails, a dark recessed
  centre channel, a dashed safety band on the working edge only, a lamp housing with a pale lens
  bar on the top edge, and a near-black foundation skirt painted up the side walls. The picture's
  Box3 is exactly the collision datum (x ±48, y ±2.08, z ±16.9); the old skirt/clamp/housing/lamp
  meshes that protruded 1.25 WU above / 0.55 WU below the solid are gone. The batch plan is one
  specimen again, and the one geometry stays under its 100-triangle cap (92 tris).
- **Third review fix — furniture never outgrows its proxy:** the gate lamp rides the post cap,
  inside the hex footprint; the shutter/block lamp rides the top deck; and the furnace keeps the
  ember mouth as its only lit point so the two-solid cap holds. Red proof:
  `test/foundry-furniture-contact.test.mjs`; the hex-polygon lamp check is in
  `test/swarm-overhaul-foundry-read.test.mjs`.
- **Fourth review fix — gate/block/shutter carry the three-value deck:** each body is ONE
  vertex-coloured mesh (light top/panels, mid mechanical side/clamp rails, dark channel/foundation)
  plus the existing work lamp. The block/shutter use the bank deck surface scaled onto their
  collision datum; the gate post uses banded cap/facets/base. Still 1 body + 1 lamp = 2 solids.
- **Final review fix — the gate's visible side was one value:** a one-height-segment cylinder
  splits each facet into two full-height triangles whose centroids both sit at ±height/6, so the
  old ±0.18·height rule painted the whole side mid and only the caps supplied the third value; the
  old `distinct.size >= 3` test passed on that. The post is now cut into three height segments
  (48 tris) and painted light/mid/dark by band. `test/swarm-overhaul-foundry-read.test.mjs` asserts
  the **share** of each value on the visible side (≥20% each), a light cap, a dark base, and the
  block deck's top/side shares — not a whole-geometry distinct count. No third solid is added.
- **Law bank plate (first review fix):** `buildBankPlate` is now a leaned deck — light face, dark
  recessed channel, two mid clamp rails that overhang the ends, one working-edge hazard band,
  top-edge lamp housing with a lit lamp, and the foundation skirt. The lamp moved from the base
  (where it never read) to the top edge.
- **One sun (second review, re-qualified by the final review):** every `PROFILE_BY_ID` sky hero
  follows the renderer's *projected* key, derived from its own `screenNdc`, the 160 WU lateral
  distance and the fixed 96 WU key height: Helios 0.894, Vesta 0.873 (was −0.999), Veil 0.979
  (was −0.257), Fringe 0.899, Pallas 0.882, Ceres 0.906. The earlier `> 0.99` bar was a 2D-proxy
  artefact that omitted the height. `test/x1-one-sun.test.mjs` asserts dot > 0.85, rejects a
  collapse back onto the flat proxy, and still pins the old Vesta/Veil angles as failures
  (< 0.5). Only Helios has a reviewed sky capture; Vesta/Veil are data-proven, not visually proven.
- **Focused checks (real counts, 2026-11-07):**
  - `node --test test/foundry-bank-surface.test.mjs test/foundry-plate-contract.test.mjs
    test/swarm-overhaul-foundry-read.test.mjs test/foundry-environment.test.mjs
    test/pq133-08-law-dressing.test.mjs test/pq133-09-cryo-storm-dressing.test.mjs
    test/x1-one-sun.test.mjs test/foundry-furniture-contact.test.mjs
    test/sector-visual-profiles.test.mjs`
    — **75/75 pass, 0 fail**. The gate case now asserts the visible side's light/mid/dark share
    (≥20% each), and the one-sun case projects the real 96 WU key height (dot 0.873–0.979, bar 0.85).
  - `node --test test/x1-one-sun.test.mjs test/sector-visual-profiles.test.mjs`
    — every profile hero is covered; 2/2 one-sun cases pass.
  - The earlier "TDZ import failure" note is stale: it does not reproduce. Both law-dressing files
    import and pass.
  - Unrelated red on this shared tree (open, not X1): `test/pq-133-04-foundry.test.mjs` is **11/13**.
    The two failures are `Mirrorjaw materializes with real weapons and dies to Pulse hits through
    combat exactly once` (AI doctrine resolves `interceptor_flyby`, expected `brawler_commit`) and
    `ten wave schedules materialize under the unchanged cap and cleanup waits for real combat
    deaths` (the cleanup assertion at line 245). No X1 render path is imported by either test. The
    foundry suite is **not green**; record these as open sim/AI defects, do not claim it.

## Draw cost (measured, not assumed)

- Foundry bank plate: **1 draw** (one mesh, one shared vertex-coloured material, no geometry
  groups). The batch specimen stays one group.
- Foundry gate/block/shutter: **2 draws each** (one vertex-coloured body + one work lamp). No third
  solid; the two-solid cap is unchanged.
- Law bank plate: **9 draws** (face, dark channel, hue seam, two clamp rails, hazard band, lamp
  housing, lamp, foundation skirt). The law rooms already carried 5 hazard bands + 5 lamps from the
  first pass.
- The earlier "≤ 2 draws per arena prop" claim is **withdrawn**: it was never measured per prop.
  The E10 frame-time delta for these draws is **not measured**; measure it on the owner's laptop
  before X2 mass production.
- **Open:** the foundry plate's lens is painted to preserve the one-draw/one-specimen batch
  contract. A real emissive plate lamp (a second draw) is not landed; the law plate and the
  gate/block/shutter carry real lamps. The law plate's 9 draws / 6 materials are a recorded
  exception to the bible's one-draw-per-material rule.

## Captures — re-shot 2026-11-06, turntable/props 2026-11-07

The old set was not proof: `before-foundry.jpg` is 800×500 with HUD and no bank plate, the after
frames are 729×536 with no HUD, and `after-plate-close.png` is not a close-up. The current set is
1600×1000 through the ordinary title → Swarm → Ricochet Foundry route:

- `lineup/after-foundry-wide-1600.png` — HUD off, gameplay chase camera. The plate is
  **bottom-centre at ≈21% width**, not mid-frame; that caption is corrected here. This is the
  2026-11-06 frame, kept because the new route pose framed the plate at the top edge.
- `lineup/after-plate-close-1600.png` — HUD off, an **isolated capture camera aimed at the plate's
  bounding-box centre**. The **visible plate spans 40.9%** of frame width (AABB envelope 62.6%;
  both in `lineup/CAPTURE.json`), not the old claimed 45%/41%.
- `lineup/turntable-00..05.png` — six orbit views at 60° steps, +24° elevation, camera aimed at the
  plate centre. **Visible widths 29.0–50.3%** (AABB envelope 62.0–64.3%). This is a real turntable;
  the old "turntable" moved the ship under a fixed-yaw chase camera and showed the same top face
  six times.
- `lineup/turntable-edge.png` (44.9% visible, AABB 65.7%; +6° elevation) and
  `lineup/turntable-underside.png` (45.8% visible, AABB 65.0%; −24°) — the edge-on thickness/skirt
  and the underside, which the chase camera cannot show.
- `lineup/close-gate-1600.png` — live gate prop, aimed camera; the **visible post is 7.6% wide**
  (AABB 13.1%) and 56.1% tall, with the light cap, light/mid/dark side bands and dark base.
- `lineup/close-furnace-1600.png`, `close-shutter-1600.png`, `close-block-1600.png` — **isolated
  factory renders** of `buildFoundryToy`, because the live furnace/shutter only materialize on
  their authored wave phases. **Visible 40.6% / 51.8% / 51.6% width** (AABB 44.7% / 52.6% / 52.4%).
  They are labeled as isolated in `CAPTURE.json`; they are not player-route frames.

`CAPTURE.json` stores **both** numbers per frame: `aabbWidthPct` is the projected bounding-box
envelope and `visibleWidthPct` is the rendered silhouette (pixels differing from the `0x07090c`
capture clear). Captions cite the visible silhouette. The measurement is validated against the
review: the old committed close-up's visible width is **54.4%** against its 62.3% AABB, and the
gate is **7.6%** against 13.1%.

**Still unmatched:** the before frame needs the pre-finish build; this shared checkout cannot be
reverted safely. The after frames are real captures; the pair is not a controlled A/B. The E10
delta is still unmeasured. Owner approval remains open.

## Published

- `25fd5cf` — campaigns, arena finish, Adventure glass, input contexts, music stems, tests.
- `60b7778` — the X1/X3 hunks inside the two shared files (`visualFactory.js`, `hudAdapter.js`);
  their other in-flight changes stay in the working tree for their owners.
- Local master could not merge back the second publish commit because a concurrent uncommitted
  `src/render/vfx.js` edit would be overwritten; the working tree preserves it.

## Owner approval

The owner gate is **open** until the owner writes approval into this file. The controller's
takeover note may treat P3/W1 gates as planning assumptions; it cannot approve X1 on the owner's
behalf. What the owner is approving is listed in [`LINEUP.md`](./LINEUP.md).

## Next

1. Owner approves or amends the lineup (`LINEUP.md`) — after the re-shoot above.
2. X2 starts: Swarm enemy silhouettes, boss chunks, the 7 arena kits, planets/backdrops, prop
   replacements, part visuals for Lane 4, the ship-sheet hangar. Each through Forge + image review.
3. Measure the arena-finish delta on the E10 dashboard and record it here.
