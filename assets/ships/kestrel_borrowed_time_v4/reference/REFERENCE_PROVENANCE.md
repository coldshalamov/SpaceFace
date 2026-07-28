# Kestrel material-truth component references

These images are reference-only inputs to `scripts/material_truth_v6.py`. They are not runtime
textures, PBR data maps, acceptance captures, or substitutes for editable Blender geometry.

## Authoritative problem captures

| File | Origin | SHA-256 |
|---|---|---|
| `kestrel_user_review_drive_close.png` | User-supplied exact promoted Kestrel close-up, 2026-07-28 | `1C37DA9CD29F68841F9D201E28630CAD8205CEC20C14906B2AD23526DFF573F2` |
| `kestrel_user_review_three_quarter.png` | User-supplied exact promoted Kestrel three-quarter capture, 2026-07-28 | `39C31F4B59CE6CCD9E014907EA3703ED63224FE4FC50B6ED007E218D722F62B2` |

## Generated component studies

All studies were generated with OpenAI's built-in image-generation tool in Codex task
`019fa6a4-f178-7530-8a98-a35eab6ec617` on 2026-07-28. The tool did not expose a model/version
identifier, seed, or resumable generation-session identifier, so those fields are honestly recorded
as unavailable rather than invented. The prompt records below are retained prompt summaries; the
exact tool-call record remains in that task. Each prompt isolated a component from the named exact
Kestrel capture, preserved footprint, orientation, role and interfaces, required real manufacture
and materials, and forbade plastic, clay, leather, toy bevels, floating primitives and whole-ship
redesign.

| Component / file | Source capture | Prompt record (summary) | Selected traits translated into Blender | Rejected traits | SHA-256 |
|---|---|---|---|---|---|
| Drive clamp and nozzle — `kestrel_drive_material_truth_reference_v1.png` | `kestrel_user_review_drive_close.png` | Segmented industrial axial-drive load clamp with machined alloy segments, ceramic isolators, tapered refractory vanes, pivots, fasteners, casing courses and service panels; retain the exact aft-drive footprint. | Segmented load collar, ceramic capture layers, tapered pivoted vanes, actuator links, casing courses, throat ribs and restrained hot core. | Whole-ship redesign, decorative tire/torus, rectangular nozzle blocks, fake generated PBR maps. | `8E862661A2209E1292A44729E743E56FFEBD5DE4AE5272C8B4CFE907FE145AD1` |
| Sensor head — `kestrel_sensor_material_truth_reference_v1.png` | `kestrel_user_review_three_quarter.png` | Filled directional salvage-band dish on a tapered pedestal, mismatched yoke arms, machined bearing faces, feed horn, service lead and one small active aperture; retain the dorsal position and scale. | Filled ribbed dish, two bearing/yoke assemblies, tapered cable-chase pedestal, rim fasteners, feed horn and confined aperture. | Neon hoop, lightbulb ring, decorative glow, generic antenna replacement. | `7105DDB05E7AAA41B175AA42ACA2F1EFB38253EA7D88A924B402E55154FF80C1` |
| Midship pressure shell and shoulders — `kestrel_midship_material_truth_reference_v1.png` | `kestrel_user_review_three_quarter.png` | Rolled/welded pressure-vessel courses with frame saddles, separate tapered shoulder sponsons, replaceable armor, stand-offs, hatches, rails, access recesses and visible load paths. | Flattened pressure-shell courses, frame saddles, five tapered sponson sections per side, separate outer armor, top courses, service bays and gussets. | Perfect tube as final form, one mirrored 18.5-m slab, generic box greebles, wallpaper noise. | `D76CEB5BDFE938F5D36F94667B5AFEDB31D7125FDFED9CE2CC4374C4491E9E77` |
| Forward weapon spine — `kestrel_bow_weapon_spine_reference_v1.png` | `kestrel_user_review_three_quarter.png` | Shipyard-surplus armored twin-weapon spine using brake-formed armor, machined trunnions, refractory jackets, recoil rails, recessed maintenance bays, gussets and cable conduits; preserve bow wedge and barrel axes. | Split armor courses, recoil bed, separate receivers, trunnions, load gussets, recoil rails, barrel jackets/isolators, service hatch and confined optical pickups. | Giant brow slab, rods placed on a box, cyan decorative rings, floating rails, readable generated text. | `68676DD170FB0C2F0BECC529442555DA83C8F35ED9EEDA1518904F855E85EAF7` |
| Field-repair pod — `kestrel_repair_pod_material_truth_reference_v1.png` | `kestrel_user_review_three_quarter.png` | Ceres industrial pressure-rated repair pod with chamfered rolled/welded case, loading hatch, restraint bands, saddle isolators, connector face, latches and one field-adapter plate; preserve footprint and salvage green. | Eight-sided pressure case, replaceable end caps, continuous bands, loading hatch/inset, saddle mounts, small elastomer isolators, ceramic connector inserts and adapter plate. | Green plastic cube, giant orange block, decorative bars, unbounded kitbash clutter. | `714EE119FE39F8FDAB64DB8B20E739D74D091A98B04BDC9846BD61D9693CE9C0` |
| Shoulder radiator cassette — `kestrel_radiator_cassette_reference_v1.png` | `kestrel_user_review_three_quarter.png` | Recessed high-temperature heat-exchanger cassette with many thin folded nickel-alloy fins, slotted protective ribs, manifolds, hinges, coolant rail and feed/return couplings; preserve the long shoulder footprint. | One efficient 72-fin mesh per side, recessed base/core, cover ribs, perimeter rails, end manifolds, hinge unions, coolant rail and couplings. | Giant separate wedge comb, floating rectangle sticks, rubber radiator, decorative emission. | `1A60AC2E9ED1E64FF2EDF6A97EDF92219E7A37D856F63EBD028AFF1BEB75C86D` |

The Kestrel-specific resemblance target was at least 70 percent for each isolated component while
preserving the canonical sockets, overall ship identity and normal-route silhouette. This percentage
is not a repository-wide quota.
