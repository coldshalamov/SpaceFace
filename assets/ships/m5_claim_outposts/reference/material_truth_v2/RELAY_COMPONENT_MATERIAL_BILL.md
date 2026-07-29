# Claim-outpost relay — component material bill (V2 candidate only)

## Purpose and freeze

This is a **candidate-only G1–G4 dossier**, not a canonical-asset change or an acceptance claim.
It repairs the documented game-camera failure: an otherwise valid authored relay reads as grey
cylinders, boxes, torus rings, and a cyan ring rather than an asteroid-bolted recovery facility.

| Frozen contract | Value |
|---|---|
| live identity | `place_claim_outpost_relay` / `SF_PLACE_CLAIM_OUTPOST_RELAY` / `spec_relay` |
| root | `SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT`, sole top-level node, identity TRS |
| forward/up | `+X` / `+Y`; retain +X as the longest axis |
| authored envelope | preserve the current 104.3364 m maximum envelope and the existing footprint anchors; current manifest magnitudes are `[104.3364, 55.3196, 95.859]` |
| LOD and materials | retain the three-level LOD contract and the semantic `Material_Hull`, `Material_Mechanical`, `Material_Accent`, `Material_Glass`, and `Material_Warm` roles |
| collision/runtime | preserve `COLLISION_HULL` geometry, transform, and non-presentation proxy role unchanged; exterior Asteroid Ops dressing remains non-colliding, while World Site proxy ownership remains in code |
| live source/release | `A93C7B4D…FDA8` / `DC07EBEF…FDCC`; do not overwrite either in this candidate packet |

The candidate must preserve these exact local socket transforms, names, and identity rotations/scales:

| Socket | Local translation |
|---|---:|
| `SOCKET_Structure_Core` | `[0, 0, 0]` |
| `SOCKET_Dock_Approach` | `[48, 0, -2]` |
| `SOCKET_Emissive` | `[0, 0, -24.472501754760742]` |
| `SOCKET_Module_Depot` | `[-20, -20, -1]` |
| `SOCKET_Module_Refinery` | `[-20, 20, -1]` |
| `SOCKET_Module_Defense` | `[20, -20, -1]` |
| `SOCKET_Module_Teleporter` | `[20, 20, -1]` |

Those anchors carry the live relay core, cargo brace, field-coil cradle, recovery collar, safety
coupler, and beacon-array interactions. They are interface locations, not discretionary decoration.

## Fiction-development agreement

The live World Site names a Helios Recovery Relay, a cargo brace, a field-coil cradle, a recovery
collar, a safety coupler, and a beacon array. It does **not** name a manufacturer, fabrication era,
or exact construction method. Therefore every fabrication and maintenance-history decision below is
**ART EXTRAPOLATION**: it is bounded visual development, not new setting canon.

| Component | Function and construction | Surface / optical response | Interfaces, history, and forbidden reads |
|---|---|---|---|
| Clamp shoes | **ART EXTRAPOLATION:** eight-to-twelve segmented steel shoes distribute relay load into drilled asteroid bolts; each shoe is a formed or cut plate, not a torus segment. | Blast-cleaned structural steel with local zinc-rich repair coating; matte-to-satin roughness, bolt-edge abrasion, sheltered dirt. | Shoes meet rock through standoffs, bolts, and gussets that visibly lead back to the core. Reject a perfect hoop, smooth rubber ring, floating clamp, or decorative teeth. |
| Core shell | **ART EXTRAPOLATION:** a stepped, lofted pressure/service shell carries the relay-core machine and transitions from rock root to the transfer spine. | Coated welded steel panels over darker structural frame; broad roughness changes by panel and heat-shadow, not generic noise. | Show plate overlap, recessed service hatches, weld seams, drain/vent breaks, and load paths. Reject one uninterrupted cuboid, universal bevels, or a blank slab with stuck-on strips. |
| Freight vessels | **ART EXTRAPOLATION:** the paired depot volumes are rolled-plate pressure vessels for transfer staging, with formed ends and load saddles. | Painted vessel steel with seam-direction roughness, limited rubbed edges, and darker saddle contact zones. | Give each vessel a cap, manway/access cover, saddles, band clamps only where they carry load, and service-line penetrations. Reject naked cylinders with ornamental torus bands or identical tank repetition. |
| Transfer spines | **ART EXTRAPOLATION:** two trussed, stepped cargo-transfer spines carry traffic from the core to the existing dock approach and depot side. | Dark machined/painted structural members; exposed faces catch hard light while recessed bays remain controlled and legible. | Use broad root block → narrower braced run → flanged approach sequence; show brackets, cable raceways, gaps, and bearing/clevis logic. Reject long featureless box bars, floating rails, or a new detached silhouette. |
| Recovery collar | The live `receiver_collar` receives `relay_field_coil` at `SOCKET_Dock_Approach`. **ART EXTRAPOLATION:** its visible body is a thick receiver frame with a gimbal/lock-lug cavity. | Hard metallic lip, insulated inner throat, protected sensor glass; cyan only as restrained recessed diagnostic light. | Preserve the exact socket and its 10 m World Site proxy. Show outer rim, inner wall, locking faces, service hatch, and cable termination. Reject a glowing torus, flat luminous disc, or an aperture with no depth. |
| Mast and aperture | The live beacon array is anchored at `SOCKET_Emissive`. **ART EXTRAPOLATION:** a titanium/aluminum lattice mast supports a perforated reflector, feed horn, gimbal, and rear service frame. | Differentiated lightly oxidized alloy and machined pivots; reflector highlights should explain curvature and perforation without mirror-plastic glare. | Keep the current mast/aperture mass in its established zone and preserve the emissive socket. Reject two torus “dish” rings, a flat cyan target, or an unexplained disc. |
| Waveguides and cables | **ART EXTRAPOLATION:** insulated copper power bus and shielded waveguides connect the core, vessels, collar, and mast through protected raceways. | Copper appears only where insulation is opened or at terminals; black/grey jackets stay low-sheen and use bend-radius-appropriate normal detail. | Terminate each run at glands, clamps, or junction boxes; place heat/wear near true joints and service access. Reject free-floating spaghetti, uniformly glowing cables, and repeated tube noise. |
| Instruments and emissives | The live asset uses accent/glass roles and a beacon state; **ART EXTRAPOLATION:** instruments are inset status windows, shielded inspection lights, and locator markers. | Glass is dark and depth-bearing; emissive output is localized behind a lens, slit, or aperture with readable non-emissive fixture geometry. | Light answers docking, receiver, or beacon function and survives with emission disabled. Reject cyan trim as identity, bloom masks, and omnidirectional neon hoops. |

## Chosen construction grammar

1. **Stepped lofts, not replacement massing.** Keep the core, vessel, dock, and mast anchor zones,
   but reform the visible shell as broad load root → chamfered transition → narrower trussed transfer
   run → flanged receiver approach. This retains the existing silhouette/footprint while making the
   load path legible at the 30–100 m player band.
2. **True inset/recess construction.** Receiver, hatches, mast base, vessel access, and instruments
   need outer walls, inner returns, shadow gaps, rims, and service interfaces. A shallow decal or
   floating panel may describe only genuinely shallow information.
3. **Zoned detail.** Macro is anchor/core/vessel/mast arrangement; meso is seams, saddles, trusses,
   cavities, access, and hardware; micro is substrate-appropriate roughness, sparse weld/fastener
   evidence, and causal abrasion. LOD1 keeps the load path, vessel/collar/aperture identity, and
   material boundaries; LOD2 keeps the asteroid-bolted relay read.

Component construction references:

- `relay_recovery_collar_transfer_spine_reference.png` — use the rooted open truss, protected service
  race, receiver depth, and replaceable lock-shoe logic; do not copy its full circular silhouette as
  another glowing hoop.
- `relay_aperture_assembly_reference.png` — use the faceted perforated aperture, rear ribbing, gimbal,
  feed, waveguide, and rooted lattice logic; do not copy its exact outline or every terrestrial
  mechanism.
- `relay_anchor_clamp_reference.png` — use separated shoes, rock-contact pads, clevis/tension
  hardware, drilled bolts, protected service lines, and visible load-spreading members; reject its
  presentation arrows and do not turn the shoes into another continuous radial hoop.

The selection/provenance record and source prompts are in `REFERENCE_PROVENANCE.md`.

## Explicitly rejected methods

- Whole-asset redesign, moved sockets, a new runtime identity, or a replacement facility silhouette.
- Another glowing ring or flat disc in place of the recovery collar or aperture.
- Generic plate-grid, leather-like, tiled, or recolored-atlas noise across unrelated substrates.
- Random greeble accumulation, uniform bevels, floating strips, or detail that does not explain a
  joint, load, access, cooling, signal, or service path.
- Generated whole-asset imagery, projected generated pixels, or generated normal/AO/ORM maps.

## Candidate and acceptance boundary

Candidate paths only:

- `assets/ships/m5_claim_outposts/blender/place_claim_outpost_relay_material_truth_v2.blend`
- `assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb`
- `assets/ships/m5_claim_outposts/release_candidates/material_truth_v2/places/place_claim_outpost_relay.glb`
- `assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/`

Current blockers are intentional: Rig owns the Blender mutex; PQ-034 owns headed Browser/Electron,
independent visual review, and matched performance/cleanup evidence. Canonical promotion additionally
requires the asset-manifest lease and coordinated rebinding of the PQ-017/PQ-022 pinned hashes. This
dossier neither claims nor alters any of those surfaces.
