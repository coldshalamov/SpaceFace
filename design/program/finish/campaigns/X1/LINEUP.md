<!-- LIFETIME: CAMPAIGN -->
# X1 lineup — the picture that proves the style bible

**Status: re-shot 2026-11-06; awaiting the owner's approval.** Judge against
[`STYLE_BIBLE.md`](./STYLE_BIBLE.md). The arena is Ricochet Foundry (`helios_core`).

## The pair

| Frame | File | What it shows | Verdict |
|---|---|---|---|
| **Before** | [`lineup/before-foundry.jpg`](./lineup/before-foundry.jpg) | 800×500, HUD on, the 2026-11-05 baseline. The bank slab is not in this frame. | baseline only — **not matched** |
| **After — wide** | [`lineup/after-foundry-wide-1600.png`](./lineup/after-foundry-wide-1600.png) | 1600×1000, HUD off, gameplay chase camera. The finished foundry plate sits bottom-centre (≈21% width) with its light deck, dark channel, hazard dashes and lens bar; the ringed giant reads lit from the upper-left. | captured 2026-11-06 |
| **After — plate close** | [`lineup/after-plate-close-1600.png`](./lineup/after-plate-close-1600.png) | 1600×1000, HUD off, shipped photo camera at zoom 150. The plate spans **≈45% of the frame width** and shows the skirt, clamp rails, recessed channel, working-edge safety band and lamp-housing lens. | captured 2026-11-06 |
| **After — turntable** | [`lineup/turntable-00.png`](./lineup/turntable-00.png) … [`turntable-05.png`](./lineup/turntable-05.png) | 1600×1000, HUD off, six views over 1.5 s while the chase camera orbits the plate. Thickness and skirt read on the edge-on frames. | captured 2026-11-06 |

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

The Helios giant's authored terminator is now `lightAngle: 2.55` (upper-left), matching the play key
`(60, 140, 40)` through the 60° chase camera. `test/x1-one-sun.test.mjs` pins the agreement; the old
`-0.72` would fail it.

## Independent image review (2026-11-06)

Two independent image reviews (three review passes total) rejected the first capture on defects that
were correct:

1. **Capture was not at the stated camera.** 729×536 from the running shared checkout, ship ~35 px.
   The style bible's 144 WU bar is the Adventure chase camera; the Swarm frame is the wider S6
   horde camera, so the ship is small *by mode composition*. The bible now states the camera per
   mode, and the detail must be judged on a real close-up.
2. **The plate read as a white card.** No thickness, no clamps, no dark share; bright seams read as
   tape. Fixed in the deck above: dark channel, mid clamp rails, working-edge safety band.
3. **The foundry plate outgrew its solid.** Skirt/clamp/housing/lamp protruded 1.25 WU above and
   0.55 WU below the collision slab. Fixed by merging the trim into the single vertex-coloured
   surface; `test/foundry-plate-contract.test.mjs` now measures the picture at the datum.
4. **The Helios terminator contradicted the play key.** Fixed at the authored data.

**Still open:** a matched pre-finish "before" at the same camera (the shared checkout cannot be
reverted safely) and the E10 frame-time delta. The after frames are captured; the A/B is not
controlled.

## What the owner is approving

1. The **depth-band rule**: painted authored sky plate, 3D play space, ORRERY glass.
2. The **prop finish**: three values, chamfer, manufactured panels, hazard band, lit points.
3. The **scale modules**: ship 1.72×radius, cargo pod 6–7 WU, arena furniture 1.5–4 ship lengths,
   rock ladder pebble/boulder/monolith.
4. The **never list** and the **asset acceptance loop** (capture + turntable + independent review +
   manifest row + no frame regression).

On approval, X2 starts with the seven arena kits, the Swarm silhouettes and the prop replacements.
