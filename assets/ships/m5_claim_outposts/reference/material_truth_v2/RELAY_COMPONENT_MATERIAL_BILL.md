# Claim-outpost relay — component material bill (V2 integration)

## Purpose and freeze

This is the authoring, review-lineage, and integration dossier for the V2 relay. It records a
canonical asset change and a focused-green implementation claim, but not exact-final route or
performance acceptance. It repairs the documented game-camera failure: an otherwise valid authored
relay reads as grey cylinders, boxes, torus rings, and a cyan ring rather than an asteroid-bolted
recovery facility.

| Frozen contract | Value |
|---|---|
| live identity | `place_claim_outpost_relay` / `SF_PLACE_CLAIM_OUTPOST_RELAY` / `spec_relay` |
| root | `SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT`, sole top-level node, identity TRS |
| forward/up | `+X` / `+Y`; retain +X as the longest axis |
| authored envelope | preserve the current 104.3364 m maximum envelope and the existing footprint anchors; current manifest magnitudes are `[104.3364, 55.3196, 95.859]` |
| LOD and materials | retain the three-level LOD contract and the semantic `Material_Hull`, `Material_Mechanical`, `Material_Accent`, `Material_Glass`, and `Material_Warm` roles |
| collision/runtime | preserve `COLLISION_HULL` geometry, transform, and non-presentation proxy role unchanged; exterior Asteroid Ops dressing remains non-colliding, while World Site proxy ownership remains in code |
| live source/release | `57F6E1A4…06C9` / `85B8D74E…67A8`; promoted transactionally from the validated V2 technical candidate |

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

## Candidate lineage and acceptance boundary

The implementation preserves each state instead of relabeling evidence across a changed producer or
artifact hash:

| State | Blend SHA-256 | GLB SHA-256 | Evidence meaning |
|---|---|---|---|
| initial candidate | `98668A1F…CED9` | `25E806CD…B303` | first reproducible V2 build; superseded |
| reviewed visual candidate | `091428F4…0A7` | `24274895…76E3` | six matched original-resolution views; independent whole-asset `G1/G2/G4 = KEEP` |
| final technical candidate | `7B069F78…810F` | `A8789308…0A7A` | exact LOD export, tangents, frozen contracts, and closed welded topology; Foundry/Khronos zero-issue |
| promoted live source | n/a | `57F6E1A4…06C9` | canonical source with production metadata |
| generated live release | n/a | `85B8D74E…67A8` | 15/15 KTX2 textures with mips and 65 Meshopt buffer views |

Candidate and evidence paths:

- `assets/ships/m5_claim_outposts/blender/place_claim_outpost_relay_material_truth_v2.blend`
- `assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb`
- `assets/ships/m5_claim_outposts/release_candidates/material_truth_v2/places/place_claim_outpost_relay.glb`
- `assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/`

The exact `PQ-022.relay-reauthor` unit was owned by `codex-primary` for this build. No historical
worker, review, or hardware note was treated as a live blocker. Canonical source, release, manifests,
and runtime bindings now carry the final technical candidate. The retained KEEP verdict applies only
to reviewed source `24274895…76E3`; the final live hashes require the downstream one-use H1 capture
and causal review for exact-final visual binding.

## 2026-08-04 execution preflight and visible-zone register

```yaml
dispatchUnit: PQ-022.relay-reauthor
canonicalBlendSha256: E922CBEB95762B749B00F303E3A0399D3AB4771858F112EF3F89325C869D300A
initialCandidateBlendSha256: 98668A1F77F8FE8713219536809E8B73F08CA16078206AD13B140D01592FCED9
initialCandidateGlbSha256: 25E806CD62F01939F03FB818818FB0D9ACFFE9912FD95B98F2066EB68455B303
reviewedCandidateBlendSha256: 091428F4C4DA171F24487D4703D75692496BA499344475512BA7C958C96CE0A7
reviewedCandidateGlbSha256: 242748956EC90AD328E6CABAA52823FEFF213C3C6FA17A9E1FD4920F022A76E3
technicalCandidateBlendSha256: 7B069F78A8FF289B32705FB0614E156E24E37FF4A0D432CC57CBC6D8040D810F
technicalCandidateGlbSha256: A8789308E39F733BC6565198B2AFEE0BA5FD106AFFC54A22DD7D30E40AC10A7A
liveSourceSha256: 57F6E1A42D0F1B259AADA019E1960D1CBB4F81CBE0AAABFE66ED0248A8E206C9
liveReleaseSha256: 85B8D74E7719203766937289B2ED5756294C4A9D48612C0432C6F036644167A8
allSupportedViewZonesClassified: true
generatedWholeAssetReferenceUsed: false
canonicalAssetsModified: true
exactFinalVisualBinding: false
```

| Visible zone | Required support views | Classification and authored response |
|---|---|---|
| asteroid body and contact boundary | front, rear, side, top, both three-quarters | Retained role, newly deterministic faceted rock. The rock is the natural substrate and must remain visually distinct from manufactured members. |
| clamp shoes, drilled bolts, gussets, and outboard load paths | front, rear, top, both three-quarters | Full manufactured zone. Separated structural shoes and converging beams replace the continuous decorative hoop; four terminal shoes preserve the frozen envelope. |
| core shell and recessed service bay | front, rear, top, both three-quarters | Full manufactured zone. Faceted pressure shell, end frames, returned bay rim, dark recess, and lens-backed indicators replace the blank cuboid. |
| paired freight vessels, caps, saddles, manways, and junctions | front, rear, side, top, both three-quarters | Full manufactured zone. Formed caps and physical supports replace naked cylinders and ornamental torus bands; port/starboard service details are intentionally asymmetric. |
| transfer-spine roots, open trusses, braces, flanges, and collector members | front, rear, top, both three-quarters | Full manufactured zone. Open four-rail trusses with warm causal bracing expose the load path from core to receiver. |
| recovery receiver, inner throat, lock lugs, inspection window, diagnostics | front, rear, side, top, both three-quarters | Full manufactured interaction zone centered on the frozen dock socket. Thick segmented outer frame and recessed dark throat replace the glowing torus/disc read. |
| lattice mast, gimbal, reflector, rear ribs, feed, and waveguide | rear, side, top, both three-quarters | Full manufactured signal zone. A shallow faceted reflector with rear support and physical feed replaces concentric cyan rings. |
| module hardpoints, service cables, glands, instruments, ownership markers | front, rear, top, both three-quarters | Supporting manufactured zones. Every cable terminates at a junction/gland; accents remain sparse, recessed, and fixture-backed. |
| collision proxy | none | Deliberately excluded from presentation. `COLLISION_HULL` is hash/transform-preserved as the existing broadphase-only proxy. |

The reproducible builder is
`tools/blender/build_claim_outpost_relay_material_truth_v2.py`; the matched six-view renderer is
`tools/blender/render_claim_outpost_relay_material_truth_v2.py`. Build facts and frozen-contract
verification are recorded in `evidence/place_claim_outpost_relay_material_truth_v2/build_report.json`.
The technical build, zero-issue validators, lineage-bound whole-asset review, and guarded promoter
authorize this focused-green canonical integration. They do not by themselves close exact-final
G1/G2/G4 on the player route; that remains the downstream H1 and causal-review boundary.
