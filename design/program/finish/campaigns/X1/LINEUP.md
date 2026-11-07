<!-- LIFETIME: CAMPAIGN -->
# X1 lineup — the picture that proves the style bible

**Status: awaiting the owner's approval.** Judge these against [`STYLE_BIBLE.md`](./STYLE_BIBLE.md).
The arena is Ricochet Foundry (`helios_core`), the same room as the 2026-11-05 baseline.

## The pair

| Frame | File | What it shows |
|---|---|---|
| **Before** | [`lineup/before-foundry.jpg`](./lineup/before-foundry.jpg) | The baseline: bank plates as flat tan/grey slabs, photographic Saturn, ship as a separate medium. |
| **After — wide** | [`lineup/after-foundry-wide.png`](./lineup/after-foundry-wide.png) | The same room after the finish: three-value chamfered machinery, dark recessed seams, safety band, work lamps. |
| **After — composed** | [`lineup/after-lineup-plate-ship-sky.png`](./lineup/after-lineup-plate-ship-sky.png) | Ship + bank plate + rock + sky planet in one frame at the gameplay camera. |
| **After — plate detail** | [`lineup/after-plate-close.png`](./lineup/after-plate-close.png) | The plate close: foundation skirt, hold-down clamps, lamp housing, dashed safety band, hatch panels. |

## What changed in the picture

- **Before:** `BoxGeometry` and `CylinderGeometry` with flat `MeshStandardMaterial` colours
  (0x14181e / 0x6f7880), no chamfer, no panels, no lamp; the bank slab's whole value range sat
  between 0x29 and 0x60.
- **After:** one chamfered unit box (60 tris, exact 1×1×1 datum) and the shared prop palette
  (light primary 0xa9b1b8 / paint 0x9fb7c4, mid 0x6d7680, dark 0x1c2128, hazard 0xd9a03a,
  lamp 0xffd9a8). Bank plates get a foundation skirt, two clamps, a lamp housing and a dashed
  safety band; every box in the six law rooms and the Foundry gets the chamfer and three-value
  materials.

## Independent image review (2026-11-06)

The first review rejected the first capture on two grounds that were correct:

1. **The capture was not at the stated camera.** It was a 729×536 canvas from the running shared
   checkout; the ship read ~35 px. The style bible's 144 WU bar is the Adventure chase camera; the
   Swarm frame is the wider S6 horde camera, so the ship is small *by mode composition*. The
   bible now states the camera per mode, and the detail is judged on the plate close-up.
2. **The plate had no thickness, no clamps, no dark share, bright seams that read as tape.** Fixed:
   dark side/end values, dark recessed seams, a foundation skirt, two clamps, a hatch panel, a
   dashed safety band, and a housed raised lamp.

**Still open (named, not hidden):** the Helios sky giant's painted terminator reads lit from the
right while the play key reads upper-left. `sectorVisualProfiles.js` authors `lightAngle: -0.72`;
the fix is a value in that data file, to be re-shot in X2. The nebula is soft/painterly; the sky
recede gate (contrast below the play plane) is the enforcement point, not a posterise pass.

## What the owner is approving

1. The **depth-band rule**: painted authored sky plate, 3D play space, ORRERY glass.
2. The **prop finish**: three values, chamfer, manufactured panels, hazard band, lit points.
3. The **scale modules**: ship 1.72×radius, cargo pod 6–7 WU, arena furniture 1.5–4 ship lengths.
4. The **never list** and the **asset acceptance loop** (capture + turntable + independent review +
   manifest row + no frame regression).

On approval, X2 starts with the seven arena kits, the Swarm silhouettes and the prop replacements.
