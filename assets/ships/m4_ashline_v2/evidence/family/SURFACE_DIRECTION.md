# Ashline V2 surface direction

Status: **reference approved for authored surfacing; not runtime art**

The V2 silhouette family remains the geometry authority. The generated paintover at
`surface_direction_2026-07-27.png` is a controlled surface study over the existing lineup, not a
texture, UV layout, normal map, release candidate, or authorization to alter sockets, collision,
scale, LODs, or primary form.

## Family language

- Keep enough oxidized gunmetal in the midtones for the ships to separate from the game sky.
- Use oxide-red as armor and identity paint, not as a full-hull dark wash.
- Use pale primer or bone-colored replacement plates sparingly to reveal repair history.
- Reserve tar-black values for machinery recesses and the deepest panel breaks.
- Use amber for service/readiness cues and cold cyan only for limited technical systems.
- Paint faction marks as masked industrial geometry. Exact serials and lettering remain
  conventionally authored; generated pseudo-text is not a source.
- Chips expose metal only at plausible contact, fastener, leading-edge, weapon-service, and repair
  zones. Corrosion, soot, fuel, cable grease, and weld discoloration follow the machinery that
  produces them.

## Separate service histories

| Ship | Surface history |
|---|---|
| Dart | Stripped interceptor with fewer armor plates, fresh leading-edge heat, quick field patches, and one sharp red recognition slash. |
| Lode / Maul | Heavy brawler with layered mismatched armor, repeated impact patches, thick weld repairs, one old pale replacement plate, and abrasion around weapon and docking-contact zones. |
| Rig / Hook | Tether-control raider with asymmetric towing grime, cable grease, hazard blocks at tether machinery, a partially scrubbed former-owner livery ghost, and improvised repair clamps. |

These histories are individual asset direction, not a random grime overlay. The three ships should
remain recognizably related without sharing identical masks.

## Translation into production maps

1. Author base-color panels and masks against the real V2 UVs.
2. Derive normal information from actual seams, fasteners, welds, repairs, and mesh/surface data.
3. Pack ORM conventionally as `R=AO, G=roughness, B=metallic`; paint and corrosion change
   roughness before they expose metallic response.
4. Keep emissive masks sparse and tied to real service or drive components.
5. Review close, normal-flight, under-45-pixel, 120-pixel, and dense-combat presentations before
   promotion.

## Generation provenance

- Generated through OpenAI image generation in Codex on 2026-07-27.
- Input: the existing `runtime_lineup.png` evidence image.
- Constraints: preserve silhouette, geometry, camera, relative scale, and three-panel composition;
  paint over surface treatment and lighting only.
- No third-party photographs or additional donor images were supplied.
- Generated source SHA-256:
  `24F10E6C920320F12F16CBA3ACE1946FE2C71D5D3153F504AD3A020B848FA935`.
- Output dimensions: 2172 by 724 pixels.
