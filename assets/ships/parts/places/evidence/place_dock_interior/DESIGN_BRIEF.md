# H-04 Shipworks dock-interior method reset

**Asset:** `place_dock_interior`
**State:** offline source and release checkpoint promoted; `blocked` at G5 runtime presentation,
G6 live performance, and G7 independent art acceptance
**Tier / route:** P0 repeated Shipyard preview backdrop
**Builder:** `tools/blender/remaster_opening_dock_interior_v2.py`

## G0 identity and exclusions

The default dock is a neutral, reusable **H-04 Shipworks** maintenance bay. It is not a free-flight
interior and does not imply that every station belongs to Meridian Yards or another named company.
Its job is to frame the real selected ship in the Shipyard preview while making the surrounding
load path, service equipment, human scale, and maintenance function immediately readable.

The builder preserves the historical contract:

- Blender envelope: 52 m wide × 36 m deep × 17.425 m tall;
- glTF/SpaceFace orientation: +X forward, +Y up, +Z starboard;
- mount at the origin;
- root `place_dock_interior`;
- `SOCKET_Structure_Core`.

The unsupported historical `HOOK_Emissive` marker is intentionally retired. The worklight is an
authored emissive material, while the non-legacy runtime contract accepts only real drive or damage
hooks; the Shipworks preview does not consume this marker.

## Form decision

The abandoned iter280 source is not the modeling base. It exceeded the canonical envelope and
accumulated hundreds of disconnected pieces without resolving the sealed dark-slab read. The v3
builder starts from a small, causal structural system:

1. one deep portal bent at Blender Y = +16 m, behind the displayed ship;
2. floor-rooted rear jambs, a deep transverse header, and sparse knee haunches;
3. full-depth roof-edge stringers outside the camera aperture;
4. two outer crane runways along bay depth, with the bridge, trolley, and hoist parked at +15.5 m;
5. a rooted rear pressure bulkhead;
6. a low camera-side cutaway service plinth outside the central envelope;
7. a 28 m × 28 m × 13 m open-front ship aperture.

The initial three-bent candidate was rejected after exact Shipworks-camera ray sampling showed its
near portal and worklight stack projecting across representative ships. The corrected source removes
the foreground and mid-bay bents instead of compensating with a camera or material trick. The
durable gate now covers the live loading fallbacks for Kestrel, Pelican, Bastion, and Leviathan plus
the settled authored whole-ship Kestrel. At 0°, 45°, and 90°, 18,000 deterministic rays to visible
ship vertices report zero dock intersections.

The registration uses low-cost authored `H-04` strokes. Exact wording is also stored in metadata as
`H-04 SHIPWORKS`; no generated lettering is required.

## Surface and LOD strategy

The candidate consumes the deterministic industrial maps produced by
`tools/art/build_dock_interior_maps.py`. Ten semantic material roles bind base-color, OpenGL tangent
normal, and packed AO/roughness/metallic maps. Joined draw groups are unwrapped before tangents are
validated.

LOD0, LOD1, and LOD2 remain editable in the `.blend`. The candidate GLB exports **LOD0 only** because
`src/ui/shipPreviewMount.js` currently instantiates every loaded primitive and does not select a
place-asset LOD. Exporting all three would triple-render the bay. This is a deliberate runtime
compatibility boundary, not a claim that LOD acceptance is complete.

## Acceptance boundary

The source build is deterministic at the GLB boundary, preserves the root/socket/bounds/material
contract, and retains editable LOD0/1/2 geometry in Blender. The live preview GLB remains LOD0-only.
The checked-in `check-shipworks-dock-composition.mjs` repeats the representative ship-surface
occlusion proof against the canonical source.

This is offline route-composition evidence, not Browser/Electron or independent art acceptance.
Current runtime exposure, fog, frame pacing, live presentation admission, and the nondelegable G7
human-eye verdict remain explicit later gates.
