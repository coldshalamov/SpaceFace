# Kestrel V6 material-truth offline visual review

**Candidate:** `kestrel_material_truth_v6_production.blend`
**Generation fingerprint:** `50B71F1D32C9135FC380BB6F89EE217E3FE65E31CEDDAFD33AFC86E7F343411D`
**Production blend SHA-256:** `300629CACF382191981C0B07BAC89F1A90D186F11A60EAE63CB9E6D09FD827AF`
**Disposition:** offline keep; isolated candidate only; no live promotion

## Scope and continuity

This is the promoted Kestrel rebuilt in place, not a clean-sheet ship. The V5 production blend remains
the immutable baseline. V6 preserves the canonical collision mesh, approximate overall proportions
and identity, scale and forward axis, all nine sockets, the principal
pressure-vessel/shoulder/bow/drive relationships, and the runtime material-role contract. The visible
authoring bounds grow modestly from `27.8406 × 14.04 × 6.942` to
`28.1105 × 14.04 × 7.1685` Blender units while the gameplay collision stays exact. V6 replaces named
failed component families and their surface response.

The exact candidate contains 180 retained visible baseline meshes and 553 new authored component
objects. Sixty-six obsolete hero objects are hidden, including the cyan drive toruses, rectangular
nozzle petals, emissive sensor hoop, repeated wing bars, giant utility box and `BORROWED` marking.

## Evidence

| View | Camera and purpose | SHA-256 |
|---|---|---|
| `kestrel_v6_final_material_aft_three_quarter.png` | `(-32,-38,23)`, 58 mm; complete material response and identity | `88CBB316FEE66795D2F6C48A4150EC1CC5F5E7354CA33818A26A7742C4BCF1D9` |
| `kestrel_v6_final_clay_aft_three_quarter.png` | matched camera; material override to expose geometry and primitive dependence | `7E62B218694D4ED1386CF28426559CCD56B541FBCA8025C91D89480A7EF24C6A` |
| `kestrel_v6_final_drive_grazing_close.png` | `(-20.5,-13.5,6.2)`, 72 mm; hard grazing drive/interface inspection | `9444B87F8B5B9C544FA72FEE48DBCD5FC5246C6F0DE6B2C35E31F8CDD8A8B362` |

All images were rendered from the hash-bound production blend above in Blender 5.1 EEVEE. Evidence
camera, floor and lights were created after opening the candidate and were not saved into the
production blend.

## Visual findings

- The ship remains recognizably the same long pressure-vessel Kestrel with paired shoulders, dorsal
  service spine, twin bow pulse installation and axial drive.
- The aft drive now reads as a multi-part manufactured assembly: external segmented casing courses,
  alternating service alloy, rails, bulkhead, ceramic isolators, tapered refractory vanes, pivots,
  actuator roots and a recessed throat. The cyan inner tube and rectangular chocolate-block read are
  absent.
- The pressure body retains the broad volume required by its fiction and collision contract, but its
  visible read is interrupted by saddles, courses, chines, shoulder transitions and access hardware.
- The former hoop is now a directional dish/yoke/bearing/feed assembly. Emissive is confined to the
  active aperture.
- Shoulder slabs are broken into tapered underframes, armor courses, fasteners, recessed service
  hatches, radiator cassettes, manifolds and protected coolant rails.
- `DIE LAUGHING` reads as crew identity paint. `BORROWED` is absent.
- Material response separates coated hull, armor, drive alloy, service steel, refractory ceramic,
  radiator sheet, repair primer, elastomer cable and active aperture roles. The prior broad
  leather/plastic micro-bump is not visible in the retained views.

## Pipeline defect found by visual review

The first exact-blend renders incorrectly showed the old smooth aft shell because the production
save step marked the complete V5 and V6 child collections `hide_render=true`, even though the GLB
exporter still traversed their objects. Structural GLB tests therefore stayed green while Blender
evidence was false. The candidate builder now keeps the complete source descendant collection tree
render-visible, records the visibility map in its receipt and fails a focused test if the source,
V5, V6 or rig collection is hidden.

## Gate status

- G1/G2/G4: offline candidate evidence supports **keep** for the named remediation, but this is not
  formal runtime acceptance.
- G3: source and release validation are recorded in the build/finalize receipts and focused tests.
- G5: live LOD transitions, representative cost and residency remain open.
- G6: Browser/Electron default-route and no-fallback presentation remain open behind the active
  validation broker.
- G7: independent human art verdict remains open.

No headed game proof, runtime-performance claim or live asset promotion is represented by this
review.
