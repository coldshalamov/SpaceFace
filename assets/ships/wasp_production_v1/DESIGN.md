# Wasp Production V1

Status: **accepted live production Wasp**

This packet replaces the rejected glare-heavy modular Wasp attempt with a new
fighter authored around the player-fighter concept and the material/detail bar
of the user-provided SF-K0 Borrowed-Time package. It does not copy Borrowed-Time
geometry. The Revamp package supplies first-party procedural PBR material maps
and production-method reference; the Wasp mesh, silhouette, LODs, sockets, and
runtime contract are new.

## Player-facing targets

- An unmistakable fighter silhouette at normal gameplay scale: arrowhead nose,
  separated twin nacelles, swept negative-space wings, and a compact canopy.
- Dark layered armor, exposed mechanical insets, cyan identification rails,
  and restrained orange safety markings remain readable without flattening the
  ship into a single gray mass.
- Twin drive apertures are emissive discs only. There is no baked plume mesh;
  runtime trail VFX owns plume length and never creates a white oval over the
  silhouette.
- LOD0/1/2 share the same macro silhouette. Meso and micro detail are removed by
  authored importance, not by replacing the ship with primitives.
- Static geometry is merged per semantic material and LOD. Sockets and the
  non-render collision hull remain separate contract nodes.

## Coordinate and material contract

- Blender: +X forward, +Y starboard, +Z up, metres.
- glTF: +X forward, +Y up, +Z starboard.
- Semantic materials: hull, armor, mechanical, accent, warning, canopy, and
  thruster. The first five use the Borrowed-Time OpenGL-normal / ORM contract.
- Runtime source sheets are exact 1K PNG payloads; every PBR role binds one
  baseColor, one OpenGL normal, and one shared AO/roughness/metallic texture.
  Canopy and drive apertures are explicitly declared factor-only materials.
- No embedded plume. Two trail sockets identify port/starboard drive centers;
  the legacy aggregate trail socket remains for runtime compatibility.

## Acceptance receipt

All acceptance conditions are satisfied:

1. Blender front, rear, top, and gameplay-scale renders beat the frozen rejected
   Wasp evidence for silhouette, material separation, and drive restraint.
2. Finalized GLBs pass size, socket, LOD, material-role, and reachability gates.
3. Fresh New Game and Continue captures show the same authored Wasp under the
   same pose/exposure with no emergency pressure shell or giant canopy/plume.
4. The canonical player-facing capture pair was reviewed at original resolution:
   the central hull, dark armor, canopy, and cyan rails remain distinct; drive
   bloom is restrained; the rejected white oval is absent.

Runtime evidence: `.devshots/alpha/m5-role-public-route-v2/evidence.json`, with
`04-wasp-role-after-undock.png` and `05-wasp-role-after-continue.png` under the
same directory. Durable hashes and technical metrics are recorded in
`evidence/acceptance.json`.
