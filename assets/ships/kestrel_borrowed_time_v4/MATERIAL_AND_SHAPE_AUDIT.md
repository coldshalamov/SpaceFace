# Kestrel material and shape audit

**Scope:** `SF_K0_KESTREL_BORROWED_TIME_V4` LOD0/LOD1/LOD2 and the emergency procedural fallback
**Baseline:** exact promoted source LOD0 SHA-256
`0C0BE004FBF77202380384E7D925318262A2F9B75D886F592AF9620E7F8DA586`
**Disposition:** G1, G2, and G4 reopened; the structural/runtime contract remains authoritative but
does not constitute visual acceptance.

## V6 offline candidate result

The connected-Blender material-truth pass now replaces the failed camera-prominent families while
preserving canonical scale, sockets and overall identity:

- 66 obsolete hero objects are explicitly retired, including the three drive toruses, 16 rectangular
  nozzle petals, neon sensor hoop, mirrored 18.5-m shoulder slab, giant utility box, brow slab,
  radiator comb and `BORROWED` decal;
- 553 authored component objects are added, producing 733 visible mesh objects versus the 246-object
  pre-pass scene (2.98x), while the 72-fin radiator pack on each side is one efficient combined mesh;
- all 180 retained visible source meshes and every V6 mesh carry explicit component material-bill
  metadata; the fail-closed coverage result is zero missing;
- the drive is a segmented alloy/ceramic/vane assembly; the sensor is a filled dish and gimbal; the
  shoulders are five tapered sponson sections per side; the weapon deck is a recoil/trunnion/receiver
  module; the repair pod is an eight-sided pressure case; the radiators are recessed fin cassettes;
- `DIE LAUGHING` replaces the inventory-like `BORROWED` label;
- source texture normal amplitudes and material-node micro-bump strengths were reduced so coated
  metal no longer inherits the former leather/clay response.

Component-only generated studies, their source captures, hashes, prompt records and selected/rejected
traits are recorded in `reference/REFERENCE_PROVENANCE.md`. These studies are design references; the
candidate uses editable deterministic geometry and physically stated material roles, not projected
generated imagery.

The exact production blend and its three retained Blender renders are hash-bound in
`evidence/material_truth_v6/VISUAL_REVIEW.md`. That review caught and repaired a production-save
defect that had hidden the complete V5/V6 descendant collections while leaving GLB export green.
The corrected offline evidence supports keeping the named G1/G2/G4 remediation. Formal runtime
normal-route/LOD/performance proof and independent exact-hash G7 remain pending and must not be
inferred from the Blender result.

## Failed reads

| Region | Intended read | Observed read | Gate |
|---|---|---|---|
| Main pressure body | Repaired small-ship pressure vessel inside a load-bearing frame | Nearly perfect tube with broad leathery noise | G1/G4 |
| Axial drive | Rebuilt drive housing, isolator collar, and variable exhaust vanes | Cyan inner tube plus rectangular brown “chiclets” | G1/G2/G4 |
| Dorsal sensor | Field-repaired directional sensor | Unexplained glowing neon hoop | G1/G2/G4 |
| Shoulder and wing detail | Formed service rails, radiator edges, and protected cable runs | Floating rectangular sticks and uniform slabs | G1/G2 |
| Identity marking | A particular crew's gallows-humor ship name | Literal `BORROWED` inventory label | G0/G4 |
| Hull, armor, and engine surfaces | Distinct alloys, coating systems, heat shields, ceramic and glass | Shared plastic/clay response or coarse leather-like grain | G4 |

## Identity correction

The hero marking is **DIE LAUGHING**. It is a deliberately authored crew name, not a description of
the acquisition history. Registration, warning, service and ownership markings remain separate
information layers.

## Component material bill

| Component zone | Substrate and manufacture | Finish and interfaces | Expected read | Forbidden read |
|---|---|---|---|---|
| Pressure vessel | Rolled/welded low-alloy pressure shell with longitudinal seam reinforcement | Dark conversion coat, local patch primer, frame saddles and inspection seams | Broad restrained metal response; mild formed waviness only | Rubber tube, leather wrap, clay cylinder |
| Shoulder armor | Cut and brake-formed armor plate | Desaturated ceramic-rich coating; bolted stand-offs over the vessel | Hard planar armor with localized edge wear | Molded toy wing, one-piece plastic shell |
| Spine and keel | Machined and welded structural steel/aluminum members | Dark protective finish; brackets, access breaks and load joints | Stiff load path with distinct member sections | Floating bars, featureless cuboids |
| Drive housing | Cast/machined nickel-alloy casing | Heat-darkened metal, removable inspection bands and service fasteners | Heavy mechanical housing with sectional transitions | Perfect tube |
| Drive collar | Segmented refractory alloy clamp over ceramic isolators | Hinges/bolts at segment roots; no colored torus | Separate load-bearing segments with gaps and attachment logic | Cyan tire, rubber ring, smooth plastic doughnut |
| Nozzle vanes | Tapered refractory superalloy/ceramic laminate | Root pivots, shielded gaps, hot-edge discoloration | Thin formed vanes with mechanical roots | Rectangular chocolate blocks |
| Radiators/louvers | Corrugated or folded high-temperature sheet | Recessed tracks and frames, restrained anisotropic response | Thin repeated sheet with depth and rhythm | Stuck-on rectangle sticks |
| Canopy/viewport | Laminated transparent ceramic with conductive coating | Metallic pressure frame and seals | Dense dark glass with selective reflections | Glowing plastic bubble |
| Sensor array | Machined gimbal/yoke with ceramic radome or dish | Small emissive lens only where a sensor actively transmits | Directional instrument with pivot and cable path | Neon lightbulb hoop |
| Repair pod and utility panels | Mismatched salvaged alloy panels | Different primer age, conventional fasteners and patch seams | Credible repair history without collage noise | Random colored LEGO bricks |
| Hero markings | Stencil paint and layered service decals | Chipped/overpainted according to access and exposure | `DIE LAUGHING` remains legible at supported hero view | Generated lettering, `BORROWED` inventory label |

## Shape-grammar accountability

- The pressure body may retain a vessel-like longitudinal volume, but it must gain sectional taper,
  plane breaks/chines, saddle interfaces, and service seams so the primitive cylinder is no longer
  the final authored form.
- Drive collar segments, exhaust vanes, radiators and service rails require custom profiles, visible
  gaps and roots. Repeating a cube or torus and renaming it does not satisfy the requirement.
- Large rectangular members may remain only where their formed or machined section, load purpose,
  attachment, scale and transition into surrounding structure are visible.
- Emissive is reserved for active apertures, indicators and exhaust—not for drawing arbitrary
  geometry.
- LOD1/LOD2 may consolidate mechanisms, but must preserve the revised drive, sensor, pressure-vessel
  section, primary negative spaces and `DIE LAUGHING` identity.

## Required evidence

- matched source and candidate textureless orthographic/three-quarter views;
- engine and dorsal-sensor close crops under hard grazing light;
- material-ID isolation and neutral/bright/dark/grazing renders without bloom;
- normal-game-camera and Shipworks portrait crops;
- unchanged sockets, exact baseline collision geometry, scale, forward axis and LOD identity receipts
  (the V6 visible envelope may grow without changing the gameplay collision);
- exact source/export/release hashes, no-fallback runtime proof, and independent G7 review.
