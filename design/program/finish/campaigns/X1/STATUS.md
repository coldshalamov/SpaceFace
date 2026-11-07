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
- **Third review fix — furniture never outgrows its proxy:** the gate lamp moved onto the post's
  face (inside the hex footprint, below the cap), the shutter/block lamp rides the body face, and
  the furnace keeps the ember mouth as its only lit point so the two-solid cap holds. Red proof:
  `test/foundry-furniture-contact.test.mjs`.
- **Law bank plate (first review fix):** `buildBankPlate` is now a leaned deck — light face, dark
  recessed channel, two mid clamp rails that overhang the ends, one working-edge hazard band,
  top-edge lamp housing with a lit lamp, and the foundation skirt. The lamp moved from the base
  (where it never read) to the top edge.
- **One sun:** Helios `signatureHero.lightAngle` is now `2.55` rad, matching the play key
  `(60,140,40)` projected through the 60° chase camera (upper-left). New focused check:
  `test/x1-one-sun.test.mjs`.
- **Focused checks (real counts, 2026-11-06):**
  - `node --test test/foundry-bank-surface.test.mjs test/foundry-plate-contract.test.mjs
    test/swarm-overhaul-foundry-read.test.mjs test/foundry-environment.test.mjs
    test/pq133-08-law-dressing.test.mjs test/pq133-09-cryo-storm-dressing.test.mjs`
    — **54/54 pass, 0 fail**.
  - Adding `test/x1-one-sun.test.mjs` and `test/foundry-furniture-contact.test.mjs`
    — **61/61 pass, 0 fail**.
  - `node --test test/x1-one-sun.test.mjs test/sector-visual-profiles.test.mjs`
    — **15/15 pass, 0 fail**.
  - The earlier "TDZ import failure" note is stale: it does not reproduce. Both law-dressing files
    import and pass.
  - Unrelated red on this shared tree: `test/pq-133-04-foundry.test.mjs` 11/13 (Mirrorjaw doctrine
    resolves `interceptor_flyby` instead of `brawler_commit`, and a 100k Pulse hit leaves a hull
    alive). That is sim/AI, not this render change; no X1 path is imported by those two tests.

## Draw cost (measured, not assumed)

- Foundry bank plate: **1 draw** (one mesh, one shared vertex-coloured material, no geometry
  groups). The batch specimen stays one group.
- Law bank plate: **9 draws** (face, dark channel, hue seam, two clamp rails, hazard band, lamp
  housing, lamp, foundation skirt). The law rooms already carried 5 hazard bands + 5 lamps from the
  first pass.
- The earlier "≤ 2 draws per arena prop" claim is **withdrawn**: it was never measured per prop.
  The E10 frame-time delta for these draws is **not measured**; measure it on the owner's laptop
  before X2 mass production.

## Captures — re-shot 2026-11-06

The old set was not proof: `before-foundry.jpg` is 800×500 with HUD and no bank plate, the after
frames are 729×536 with no HUD, and `after-plate-close.png` is not a close-up. Re-shot on this
machine at 1600×1000 through the ordinary title → Swarm → Ricochet Foundry route:

- `lineup/after-foundry-wide-1600.png` — HUD off, gameplay chase camera, plate mid-frame.
- `lineup/after-plate-close-1600.png` — HUD off, shipped **photo camera** at zoom 150; the plate
  spans ≈45% of frame width and the deck, skirt, clamp rails, channel, safety band and lens read.
- `lineup/turntable-00..05.png` — six views over 1.5 s while the chase camera orbits the plate.

**Still unmatched:** the before frame needs the pre-finish build; this shared checkout cannot be
reverted safely. The after frames are real captures; the pair is not a controlled A/B. The E10
delta is still unmeasured.

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
