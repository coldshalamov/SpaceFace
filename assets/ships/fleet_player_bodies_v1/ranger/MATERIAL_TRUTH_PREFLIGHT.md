# Ranger material-truth preflight (PQ-050.03)

Class: player flyable, long-endurance surveyor. Revision: Cycle 32 accepted 2026-08-27.
Hitch untouched. Hornet/Drifter silhouettes and magnet-jaw language are not reused.

## 0. Frozen identity

The Ranger keeps its established ~19 m live longitudinal envelope, `SF_RANGER_PRODUCTION_V1` /
`ranger_production_v1`, eleven factory `SOCKET_*` names, collision/export contract, and three authored
LODs. Its role grammar is the Working Trades surveyor: broad five-pane dark greenhouse, pinched
survey waist, deep twin drives, a stepped dorsal sensor spine continuing aft into an articulated cool
crab pin, high flat slightly warped oval sensor paddles, three forward-splayed under-chin ranging rods,
and an open rack of mismatched pulse-gel drums. Ash-grey paint and bounded cold-blue instrument caps
replace the rejected tan fighter and continuous neon-rail reads.

## 1. Visible-zone register

Supported review cameras are the shipping chase views from
`tools/blender/spaceface_chase_camera.py`: 50 degree vertical FOV, 60 degree tilt, D=144
(`play_chase`, `play_chase_abeam`) and D=58 (`play_chase_close`).

| Zone | Class | Dominates supported view | Fiction | Forbidden read |
|---|---|---|---|---|
| Pressure hull | billed | yes | Ten authored station rings form bow cabin, shoulder, pinched survey waist, and flared drive bridge | Slab, fighter dart, boxes in a row |
| Greenhouse + tub | billed | yes | Five dark panes in a formed mechanical cage over a cut cockpit tub with floor and side walls | Black decal, glowing brick, interior diorama |
| Sensor spine | billed | yes | Four pressure-backed descending bays with joints, instrument housings, radiator ribs, and discrete cold-blue raceway caps | One toy rail or neon stripe |
| Crab pin | billed | yes | Pedestal, turntable, paired formed links, actuator, hinge pins, housing, and cool probe tip able to crab 90 degrees | Bent wire or claw |
| Oval array paddles | billed | yes | Thick rolled oval rims, shallow formed ceramic faces, physical seams, inboard cassettes, top yokes, rear A-frames, and dual-axis pivots | Poker chip, solar wing, dish |
| Pulse-gel rack | billed | yes | Open asymmetric cage with four mismatched upright service drums, lids, caps, base bands, and tie bars | Dashboard lights or painted patch |
| Chin range rods | billed | close/default silhouette | Three discrete forward-splayed mechanical rods with ceramic tips | Drill, weapon prongs, missing cluster |
| Twin drives | billed | yes | Rooted drive houses and saddles around flared bells, dark wells, ceramic collars, clamp bands, hubs, and internal vanes | Flat emissive discs or detached pods |
| Ventral cargo well / underside | outside_supported_view | no | Cargo opening and keel service path | Billed as chase-visible remaster work |

All supported-view zones are classified. No inherited visible zone remains unreviewed.

## 2. Material bill

| Material | Substrate + process | Finish | Value role |
|---|---|---|---|
| `Material_Hull` | Rolled survey hull alloy over frames | Ash-grey polyurethane coat with bounded clearcoat and mesh AO | Dominant light-mid value |
| `Material_Secondary` | Formed structural alloy | Blue-grey semi-metallic finish | Mid-dark load paths |
| `Material_Armor` | Thick protective plate and liners | Near-black coated alloy | Dark wells, rims, frames |
| `Material_Mechanical` | Machined fittings | Dark metallic tooling response | Joints, rails, vanes, ties |
| `Material_Ceramic` | Cast refractory / sensor dielectric | Warm-neutral matte mineral surface | Quiet light functional surfaces |
| `Material_Accent` | Instrument raceway covers | Cold-blue dielectric enamel, discrete caps only | Minority functional beat |
| `Material_Warning` | Replaceable pulse-gel service shell | Oxide-orange industrial coat | One bounded service accent |
| `Material_Radiator` | Blackened fin and service stock | Brown-black semi-metallic finish | Recessed utility dark |
| `Material_Canopy` | Laminated pressure glazing | Very dark neutral blue-black dielectric, low roughness and framed | Darkest inhabited-volume read |
| `Material_Thruster` | Sooted drive liner | Near-black recessed emission | Drive-throat depth only |

Each material has its own generated base-colour, ORM, and tangent-normal map. LOD0 AO is baked from
the mesh into the authored surface package. No shared fleet-sheet tint or DCC default material is
used as a visible finish.

## 3. Shape-grammar repair

Cycles 18–25 retained a generic fighter/slab inheritance and external coil/pod vocabulary. Cycle 26
replaced that construction with the canonical surveyor systems. Cycles 27–30 restored the live 19 m
envelope and built the framed greenhouse, upright gel rack, stepped spine, crab pin, oval array
assemblies, chin cluster, and rooted manufactured drives. Cycle 31 improved the actual chase-layer
value hierarchy, shoulder integration, canopy cavity, paddle section, rack containment, and discrete
spine accents. Cycle 32 removed the only controller-found protruding paddle bracket and is the accepted
candidate.

## 4. Component reference decision

`generated_and_used_as_component_quality_target`. The project-local reference
`reference/ranger_trade_components_v1.png` (SHA-256
`FAF279972390FD9694980D5553777810E686DBAC69D8E14095FD2FAB489DB6E2`) was generated with OpenAI
image generation from the prompt retained in `reference/ranger_trade_components_v1.prompt.md`.
It fixed the component fiction for the stepped articulated spine, formed oval paddle, greenhouse plus
open pulse-gel rack, and deep twin drives. Those ideas were rebuilt as native Blender geometry and
authored materials. No generated pixel was used as albedo, normal, AO, ORM, decal, or runtime image.

## 5. Working source and accepted evidence

`tools/blender/build_ranger_mtx.py` is the deterministic authoring source. Each Cycle 32 still was
rendered after re-importing the finalized exported LOD0 GLB into a clean scene. The three independent
original-resolution asset reviews returned KEEP on the same exact cycle and accepted the fixed legal
camera headings/occupancy bands.

| Evidence | SHA-256 | Verdict |
|---|---|---|
| `evidence/ranger/cycles/cycle_32/play_chase.png` | `DB9073A8A154EC2AA964D2251EC9DD75B7C7CFB04DDC9F9CA6E4F0BE10808DA7` | KEEP |
| `evidence/ranger/cycles/cycle_32/play_chase_abeam.png` | `07DCD0E8673663DA3D21BB86BADD09330A54A70CB1E45952A7A704832BF64131` | KEEP |
| `evidence/ranger/cycles/cycle_32/play_chase_close.png` | `F47C20334B1B6360048933A0BE50E9BC996F03C8D829EE64D65D788674A4A3FB` | KEEP |
| `evidence/ranger/cycles/cycle_32/clay_play_chase.png` | `F977B4AB7A4192AA1DD91A1206FF99ADA6D8DCFE691526FBE5CAC74E3BE7C518` | controller pass |
| `evidence/ranger/cycles/cycle_32/grazing_close.png` | `A5C58B80FAAC971E5C776EACD2314C3F9F4E6CCFCC835B72F3FD2FC98A7413C2` | controller pass |

Accepted source hashes are
`C7A49AC369AB33A19DEF33C9C90066834144029192668EE35C3E3E6077DEDC2A` (LOD0),
`DF6AA72CAD21AA8FBC5AB8C2A2E1D9117BA6D873BAB6489975F8E646CD388F13` (LOD1), and
`15252A19E24C9F620689E23867BDDA4CC568DDE3B5470B19854A94B463DB2F2A` (LOD2). The authored ladder
is 31,594 / 31,342 / 30,536 triangles, with 5,294 / 5,294 / 4,704 pressure-hull triangles.
