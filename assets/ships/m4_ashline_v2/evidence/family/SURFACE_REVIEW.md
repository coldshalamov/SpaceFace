# Ashline V2 candidate surface review

Date: 2026-07-27

Status: **historical review retained; current exact-source visual acceptance is open**

This file preserves the 2026-07-27 art notes and images for comparison only. The source GLBs were
subsequently finalized again, so these images are not cryptographically bound to the current source
epoch and cannot close a visual gate. The authoritative machine status is
`finalize_report.json:evidenceEpoch`; it currently requires a new versioned exact-source render.
Nothing here replaces Browser/Electron gameplay, LOD-transition, dense-combat, or performance
acceptance.

## Historical art notes — not a current verdict

- **Dart:** readable stripped gunmetal, restrained red threat hardware, sparse repairs, and a
  non-repeating recognition slash. It remains the fastest and least armored family member.
- **Lode / Maul:** visibly older pale replacement armor, layered impact repairs, and a strong red
  drive/threat cue. It reads as the battered heavy brawler rather than a recolored Dart.
- **Rig / Hook:** darker towing grime, warm tether-service hardware, an asymmetric former-owner
  marking, and distinct twin-boom machinery. It reads as a working salvage/raiding machine.
- All three share oxidized gunmetal, oxide red, practical repair materials, and industrial surface
  logic without sharing one identical wear mask.
- The maps add hierarchy without changing geometry, sockets, collision, scale, or LOD meshes.

## Historical contacts — ineligible for acceptance

The contacts showed neutral close, game camera, zoomed-out silhouette, base color, roughness,
metallic, tangent normal, and AO at the time they were made:

| Ship | Contact | SHA-256 |
|---|---|---|
| Dart | `surface_review_dart.png` | `6DDE51D6F69C2B05BE3B2F7758B8A371F69BE8B45AB907925A1B856D4081135B` |
| Lode | `surface_review_lode.png` | `BCF01856A68CF2CFD131EEB1F4E492F425691AF444E7F10F01ED165BA87BF7D9` |
| Rig | `surface_review_rig.png` | `A457CDF103E5F22F96C17B7DEA4B40AF50B635532623AAE6253F304A0B6FB5F7` |

Each contact is 1660 by 760 pixels. They remain useful visual references, but are explicitly listed
under `legacyArtifacts` in the current evidence epoch and must not be cited as acceptance. The
offline renderer was given a temporary copy of the source
graph with nodes explicitly tagged `nonRender`/`collision` removed. The first unfiltered attempt
proved the generic part renderer otherwise frames the compound collision boxes as visible hulls;
those invalid images were discarded. LOD0 render geometry, materials, and texture images were not
changed in the filtered copies.

## Historical technical notes

- `node --test test/ashline-surface-maps.test.mjs`: 2/2 pass.
- Strict source texture audit: 39 images, 39 bound, 0 errors, 0 warnings, 0 info.
- Dart and Lode each contain 12 bound source images and 12 KTX2 candidate images.
- Rig contains 15 bound source images and 15 KTX2 candidate images.
- The current `node scripts/check-m4-ashline-v2.mjs` result is 0 errors and two warnings: no
  current exact-source visual evidence, and no live `lod_transition_contact.png`.
- Repeated finalizer runs replace the prior map set. They no longer accumulate orphaned embedded
  images.

Blender 5.1 cannot import the candidate GLBs because its bundled glTF importer does not support
`EXT_meshopt_compression`. Therefore the offline visual contacts use the uncompressed source graph;
the encoded candidates are separately proven to contain Meshopt, KTX2, the required sockets,
collision metadata, LODs, materials, and exact candidate hashes in `finalize_report.json`.

## Current remaining gates

1. Rebuild versioned offline contacts from the exact current source GLBs with a registered,
   hash-bound renderer, then bind each artifact to its ship input in `evidenceEpoch`.
2. Do not promote these files to live Ashline paths until the current `browser-gpu` lease is
   released and the candidate has current Browser and Electron captures at close, normal-flight,
   LOD-transition, and dense-combat scales. That live pass must also confirm texture residency,
   material-cache behavior, and no VFX or asset-load failures.
