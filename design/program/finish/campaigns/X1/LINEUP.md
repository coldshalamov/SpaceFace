<!-- LIFETIME: CAMPAIGN -->
# X1 lineup — the picture that proves the style bible

**Status: re-shot 2026-11-06; turntable and prop close-ups re-shot 2026-11-07; awaiting the
owner's approval.** Judge against [`STYLE_BIBLE.md`](./STYLE_BIBLE.md). The arena is Ricochet
Foundry (`helios_core`).

## The pair

| Frame | File | What it shows | Verdict |
|---|---|---|---|
| **Before** | [`lineup/before-foundry.jpg`](./lineup/before-foundry.jpg) | 800×500, HUD on, the 2026-11-05 baseline. The bank slab is not in this frame. | baseline only — **not matched** |
| **After — wide** | [`lineup/after-foundry-wide-1600.png`](./lineup/after-foundry-wide-1600.png) | 1600×1000, HUD off, gameplay chase camera. The finished foundry plate sits **bottom-centre** (≈21% of frame width) with its light deck, dark channel, hazard dashes and lens bar; the ringed giant reads lit from the upper-left. | captured 2026-11-06 |
| **After — plate close** | [`lineup/after-plate-close-1600.png`](./lineup/after-plate-close-1600.png) | 1600×1000, HUD off, **isolated capture camera aimed at the plate's own bounding-box centre** (not the shipped photo camera). The plate spans **62.3% of the frame width** (measured from the projected box corners, `CAPTURE.json`), showing the skirt, clamp rails, recessed channel, working-edge safety band and lamp-housing lens. | captured 2026-11-07 |
| **After — turntable** | [`lineup/turntable-00.png`](./lineup/turntable-00.png) … [`turntable-05.png`](./lineup/turntable-05.png) | 1600×1000, HUD off, six orbit views at 60° steps and +24° elevation, camera aimed at the plate centre. Widths measure 62.0–77.2% (the long-axis views are the wider pair). The plate's top face, clamp rails and channel change with the yaw. | captured 2026-11-07 |
| **After — edge-on** | [`lineup/turntable-edge.png`](./lineup/turntable-edge.png) | 1600×1000, camera aimed at the plate centre at **+6° elevation** (62.7% width). Thickness, foundation skirt and the dashed working-edge band read edge-on. | captured 2026-11-07 |
| **After — underside** | [`lineup/turntable-underside.png`](./lineup/turntable-underside.png) | 1600×1000, camera aimed at the plate centre at **−24° elevation** (62.6% width). The bottom face and the skirt's lower band read from below. | captured 2026-11-07 |

The earlier turntable claim was false: those six frames moved the **ship** while the chase camera
kept its yaw, so every frame showed the same top face. They are replaced by the aimed orbit above;
`turntable-edge.png` / `turntable-underside.png` are the frames a chase camera can never produce.

## Prop close-ups (second review)

| Prop | File | Camera / measured width |
|---|---|---|
| Gate post | [`lineup/close-gate-1600.png`](./lineup/close-gate-1600.png) | live foundry prop, aimed camera at 35° yaw / 20° elevation; the post is framed vertically, 13.1% of frame width (58% of height). Cap lamp visible; footprint inside the hex proxy. |
| Furnace | [`lineup/close-furnace-1600.png`](./lineup/close-furnace-1600.png) | **isolated factory render** (the live furnace only materializes on `furnace_active`/`boss` phases); 44.7% width. Brown kiln block with the ember mouth. |
| Shutter / block | [`lineup/close-shutter-1600.png`](./lineup/close-shutter-1600.png) | **isolated factory render** (the live shutter only materializes on the shutter phases); 53.2% width. Light deck, mid clamp rails, dark channel, hazard dashes and work lamp. |
| Crate block | [`lineup/close-block-1600.png`](./lineup/close-block-1600.png) | **isolated factory render**; 53.2% width. The same three-value block deck at the crate datum. |

The isolated frames are labeled as such in [`CAPTURE.json`](./CAPTURE.json): they render the
factory's own `buildFoundryToy` output, not a staged gameplay entity. The live gate close-up is the
ordinary room prop. The furnace/shutter/block close-ups are still real evidence of the shipped
finish, but they are not player-route frames.

Legacy frames kept for the record, **not proof**: `after-foundry-wide.png` (729×536, no HUD),
`after-lineup-plate-ship-sky.png` (729×536 Swarm frame) and `after-plate-close.png` (mislabelled —
it is a wide frame; the plate is ~12% of width). They are not a matched before/after.

The **before** is still unmatched: producing it would need the pre-finish build, and this shared
checkout cannot be reverted safely. Do not treat the pair as a controlled A/B; the after frames
above are the actual evidence of the current finish.

## What changed in the picture

- **Before:** `BoxGeometry` and `CylinderGeometry` with flat `MeshStandardMaterial` colours
  (0x14181e / 0x6f7880), no chamfer, no panels, no lamp; the bank slab's whole value range sat
  between 0x29 and 0x60.
- **After:** one chamfered unit box (60 tris, exact 1×1×1 datum) and the shared prop palette
  (light primary 0xa9b1b8 / paint 0x9fb7c4, mid 0x6d7680, dark 0x1c2128, hazard 0xd9a03a,
  lens 0xffd9a8). Every box in the four law rooms and the Foundry gets the chamfer and three-value
  materials; the law rooms and the Mill/Hive boss dressing share the same finish.

## Bank plate (second review)

The foundry plate is one mesh, one draw, and exactly the authored collision slab. The deck paints:

- a light working surface with alternate hatch panels;
- two mid-value clamp rails down the deck;
- one dark recessed centre channel (the dark share the old flat slab never had);
- a dashed safety band on the working edge only;
- a lamp housing with a pale lens bar on the top edge;
- a near-black foundation skirt up the bottom of the side walls.

The law plate (`lawArenaDressing.js`) carries the same parts as real geometry: a dark recessed
channel with the room-hue seam, two mid clamp rails, one working-edge hazard band, a top-edge lamp
housing with a **lit** lamp, and a foundation skirt. The old per-plate skirt/clamp/housing/lamp
meshes are gone from the foundry plate because they protruded past the solid; its lens is painted
to keep the one-specimen batch contract.

## One sun

The renderer re-aims the play key per sector at the hero's `screenNdc`. Through the 60° chase
camera (right = −X, up = +Z) that aimed light lands on screen at `(−ndcX, +ndcY)`. Every
`PROFILE_BY_ID` hero now follows that same aimed direction, computed from its own authored
`screenNdc`:

| Sector | hero `screenNdc` | aimed `lightAngle` | dot vs aimed key |
|---|---|---|---|
| Helios | (0.58, 0.32) | 2.638 | 1.000 |
| Vesta Forge | (0.44, 0.30) | 2.542 (was −0.6) | 1.000 (was −0.999) |
| Veil Nebula | (−0.48, 0.22) | 0.430 (was −1.4) | 1.000 (was −0.257) |
| Fringe / Io Reach | (−0.42, 0.28) | 0.588 (was 0.95) | 1.000 |
| Pallas Drift | (−0.46, 0.30) | 0.578 | 1.000 |
| Ceres Belt | (−0.44, 0.28) | 0.567 | 1.000 |

`test/x1-one-sun.test.mjs` derives the expected angle from `screenNdc` for every profile and pins
the old Vesta/Veil angles as failures. The old test only modelled Helios's construction key
`(60,140,40)` and missed the renderer's per-sector re-aim.

## Independent image review (2026-11-06, second pass 2026-11-07)

Two independent image reviews (three review passes total) rejected the first capture on defects
that were correct:

1. **Capture was not at the stated camera.** 729×536 from the running shared checkout, ship ~35 px.
   The style bible's 144 WU bar is the Adventure chase camera; the Swarm frame is the wider S6
   horde camera, so the ship is small *by mode composition*. The bible now states the camera per
   mode, and the detail must be judged on a real close-up.
2. **The plate read as a white card.** No thickness, no clamps, no dark share; bright seams read as
   tape. Fixed in the deck above: dark channel, mid clamp rails, working-edge safety band.
3. **The foundry plate outgrew its solid.** Skirt/clamp/housing/lamp protruded 1.25 WU above and
   0.55 WU below the collision slab. Fixed by merging the trim into the single vertex-coloured
   surface; `test/foundry-plate-contract.test.mjs` now measures the picture at the datum.
4. **The Helios terminator contradicted the play key.** Fixed at the authored data — and extended
   to every hero in the second pass (see "One sun").
5. **The turntable was a drive-by.** The second pass replaced it with an aimed orbit and a true
   edge-on/underside pair (above). The old six frames are gone.
6. **The close-up caption was 45%; the frame measured 41%.** The new aimed close-up measures
   **62.3%** and the caption cites the measured number, not an eyeball.
7. **The gate/block/shutter finish was one flat value.** The second pass gives each a single
   vertex-coloured three-value body (light/mid/dark) plus the work lamp; the gate lamp footprint is
   tested against the hex polygon, not just its AABB. Close-ups are in the table above.

**Still open:** a matched pre-finish "before" at the same camera (the shared checkout cannot be
reverted safely) and the E10 frame-time delta. The after frames are captured; the A/B is not
controlled. **Owner approval is still open; nothing here grants it.** The foundry plate's lens bar
is still painted (the deliberate one-draw batch contract), not a real emissive lamp; the law plate
and the gate/block/shutter carry real lamps. The law plate's 9 draws / 6 materials remain a
recorded exception to the bible's one-draw-per-material rule, not a measured win.

## What the owner is approving

1. The **depth-band rule**: painted authored sky plate, 3D play space, ORRERY glass.
2. The **prop finish**: three values, chamfer, manufactured panels, hazard band, lit points.
3. The **scale modules**: ship 1.72×radius, cargo pod 6–7 WU, arena furniture 1.5–4 ship lengths,
   rock ladder pebble/boulder/monolith.
4. The **never list** and the **asset acceptance loop** (capture + turntable + independent review +
   manifest row + no frame regression).

On approval, X2 starts with the seven arena kits, the Swarm silhouettes and the prop replacements.
