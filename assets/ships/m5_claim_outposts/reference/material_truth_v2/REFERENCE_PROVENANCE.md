# Claim-outpost relay — V2 candidate reference provenance

## Scope

This record supports only the material-truth candidate described in
`RELAY_COMPONENT_MATERIAL_BILL.md`. The generated images below are reference-only construction
studies. They are not donor meshes, textures, PBR maps, projected production pixels, or acceptance
evidence.

## Sources and authority

| Source | What it establishes | How this packet uses it |
|---|---|---|
| `docs/worldbuilding/README.md` | Worldbuilding authority order; implementation must be verified in live code rather than inferred from prose. | Routing only. |
| `docs/worldbuilding/vibe/vibe-CANONICAL.md` | The setting favors physical friction, worn industrial consequence, and non-heroic presentation. | Tone constraint only; it does not authorize a new relay history or markings. |
| `src/data/worldSiteManifests.js` | `world_site_helios_relay`: Helios Recovery Relay, recovery-collar receiver, field-coil payload, beacon array, stages, and Helios service route. | Canonical live role and interface semantics. |
| `src/data/worldSiteAssetBindings.js` | Exact root, source/release identities, and all seven socket transforms. | Immutable candidate preservation contract. |
| `assets/ships/parts/parts_manifest.json` | `place_claim_outpost_relay` identity, P0 place role, dimensions, LOD0 budget, five material slots, and seven socket names. | Asset identity and footprint baseline. |
| `src/render/partsLibrary.js` and `src/systems/asteroidSites.js` | `spec_relay` resolves to this place; anchored Asteroid Ops uses one player-owned, non-colliding relay at scale `0.16`. | Runtime continuity constraint. |
| `design/graphics-sprints/TOP_FIVE_MATERIAL_TRUTH_PLAN.md` | Candidate-only path convention and the identified G1 primitive-construction defect. | Production direction; not setting canon. |
| `design/program/roadmap/receipts/PQ-022-exterior-relay-collar-REPORT.md` | Recorded release/admission evidence and the game-camera primitive/default-material reservation. | Historical evidence and baseline critique, not current final art acceptance. |

No named Worldbuilding prose source found in the inspected authority map assigns this relay a maker,
age, owner history, visual faction language, paint scheme, slogan, or repair chronology. Those facts
must remain absent unless a later canon source is selected.

## Art-extrapolation ledger

The following are deliberate **ART EXTRAPOLATION**, bounded to visual manufacture rather than lore:

- segmented steel anchor shoes, drilled rock bolts, and specific steel/coating choices;
- copper power bus, shielded waveguide routes, and cable termination pattern;
- rolled pressure vessels, saddles, service hatches, trussed transfer spines, and receiver lock lugs;
- titanium/aluminum mast, perforated reflector, feed horn, gimbal, and instrument housing details;
- local wear, welds, heat staining, and maintenance grime derived from the final candidate geometry.

These choices may communicate function but must not imply a named organization, date, proprietor,
event, inscription, or narrative fact. They receive no faction logo, invented serial, graffiti, or
text without a separately sourced canon decision.

## Candidate-only custody

The V2 work starts from a copy of the existing Blend and writes only these isolated paths:

```text
assets/ships/m5_claim_outposts/blender/place_claim_outpost_relay_material_truth_v2.blend
assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb
assets/ships/m5_claim_outposts/release_candidates/material_truth_v2/places/place_claim_outpost_relay.glb
assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/
```

The current canonical source/release pair, m5 source copy, manifests, runtime maps, World Site data,
PQ-022 receipt, and durable route evidence remain read-only. A candidate cannot inherit acceptance by
sharing a filename or material-slot name with the live asset.

## Component-only generated references

Tool: OpenAI built-in image generation. Use case: `stylized-concept`. Generated 2026-07-28.

| File | SHA-256 | Selected construction traits | Rejected traits |
|---|---|---|---|
| `relay_recovery_collar_transfer_spine_reference.png` | `2B1D3523BF00DD60EE8E20FA5D2720E27D5C8D216D6252DFD91989F87BF79239` | open folded truss with large negative space; broad rooted load frame; protected service runs; thick receiver cavity; independent replaceable locking shoes; clean plate between interface zones | the full circular collar is a design study, not permission to recreate the current glowing torus; exact footprint, socket, scale, and number of lugs come from the live asset contract |
| `relay_aperture_assembly_reference.png` | `F69E1D83AD3F9A16E7D433AA2A8C55B86D2814403E138614F04281C192174F88` | faceted perforated aperture; rear ribs; real gimbal bearings; trussed mast; feed/waveguide/cable termination; rooted service base | light studio cleanliness, exact reflector outline, and hydraulic-arm proportions are not canon; do not copy every fastener or turn the relay into a terrestrial radio telescope |
| `relay_anchor_clamp_reference.png` | `6B0735BB25AF327F9E26F4536AA5AA5623F1DA85672AA3D8C3C951641F49611F` | separated clamp shoes; real rock contact pads and drilled bolts; clevis/pin/tension hardware; visible negative space; load-spreading spokes; protected service lines | the complete radial symmetry, white diagram arrows, and exact shoe count are presentation artifacts, not canon or production pixels; keep the existing relay footprint and do not build another continuous ring |

Recovery-collar prompt:

> Design an industrial asteroid-claim relay recovery collar and the open trussed cargo-transfer
> spine that supports it as one isolated machine component, not a whole station or ship. Show a
> folded box-girder spine with real negative-space web openings, broad load-spreading root, protected
> service raceways and clevises, terminating in a deep receiver collar with inner walls, replaceable
> locking lugs, hard contact shoes, protected sensor windows, and restrained recessed diagnostic
> lights. Use a neutral technical studio and consistent three-quarter, orthographic, cavity, and
> exploded views. Require real wall thickness, machining direction, causal abrasion, and a legible
> load path. Avoid a glowing torus, flat disk, glued cubes, perfect cylinders, plastic/clay/LEGO,
> random greebles, labels, logos, and watermark.

Relay-aperture prompt:

> Design an asteroid-bolted communications relay aperture assembly as one isolated component, not a
> whole station. Show a braced lattice mast carrying one shallow perforated faceted reflector or
> slotted aperture, with rear ribs, gimbal bearings, feed horn, shielded waveguide, ceramic
> isolators, maintenance hinge, cable glands, and recessed instruments. Use a neutral technical
> studio and consistent three-quarter, side, rear, and exploded-detail views. It must read as
> communications hardware with emission disabled and show real thickness and rooted load paths.
> Avoid torus dishes, glowing rings/disks, radial box wheels, plastic/clay/LEGO, random greebles,
> labels, logos, and watermark.

Anchor-clamp prompt:

> Design a segmented asteroid anchor-clamp assembly for an industrial communications relay as one
> isolated structural component around a short cutaway piece of irregular rock. Show six to eight
> independent steel shoes contacting the asteroid through replaceable pads and standoffs, tied to
> drilled rock bolts, hinge/clevis lugs, tension rods, load-spreading saddles, and gusseted trusses
> converging toward one core mount. Include a protected segmented service conduit. Use a neutral
> technical studio and consistent hero, side-section, exploded-shoe, and load-path views. Require
> real gaps between shoes and causal abrasion only at contacts. Avoid a whole station, continuous
> torus/tire/rubber ring, glowing hoop, decorative teeth, glued cubes, plastic/clay/LEGO, generic
> greebles, labels, logos, and watermark.

These references target construction logic only. The Blender result must preserve the existing
asset, socket, collision, and footprint contracts and need only approach the useful component logic;
it must not chase pixel-identical whole-reference reproduction.

## Rejected reference routes

- No whole-asset concept redesign: it would obscure the frozen root, footprint, sockets, collision,
  and gameplay role rather than repair the current relay.
- No whole-asset generated image and no generated substrate/PBR data. Component-only references are
  allowed only through the recorded prompts/hashes/selected/rejected traits above.
- No donor GLB, generic decal sheet, or generic texture atlas: the current defect is exactly a
  primitive/default read plus unrelated-substrate atlas reuse.
- No glowing-ring, flat-disc, or cyan-trim solution: tint and bloom cannot substitute for a receiver
  cavity, reflector, mast, load path, or construction detail.

## Current blockers and next evidence

Rig exclusively owns Blender, so this packet stops at dossier/reference preparation. After that mutex
is released, the candidate may make offline G1–G4 evidence: matched clay, neutral material,
hard-grazing, emission-off, supported-size, and exact-source candidate captures. PQ-034 still owns
headed Browser/Electron parity, independent game-camera verdict, and matched performance/residency/
cleanup evidence; none are claimed here. Canonical promotion also waits for an explicit
`asset-manifest` lease and downstream PQ-017/PQ-022 hash rebinding.
