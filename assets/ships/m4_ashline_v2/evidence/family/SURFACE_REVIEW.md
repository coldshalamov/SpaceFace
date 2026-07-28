# Ashline V2 candidate surface review

Date: 2026-07-27

Status: **offline surface pass accepted; live promotion remains on hold**

This review covers the deterministic service-history maps embedded by
`tools/art/finalize_m4_ashline_v2_candidate.mjs`. It does not replace Browser/Electron gameplay,
LOD-transition, dense-combat, or performance acceptance.

## Art verdict

- **Dart:** readable stripped gunmetal, restrained red threat hardware, sparse repairs, and a
  non-repeating recognition slash. It remains the fastest and least armored family member.
- **Lode / Maul:** visibly older pale replacement armor, layered impact repairs, and a strong red
  drive/threat cue. It reads as the battered heavy brawler rather than a recolored Dart.
- **Rig / Hook:** darker towing grime, warm tether-service hardware, an asymmetric former-owner
  marking, and distinct twin-boom machinery. It reads as a working salvage/raiding machine.
- All three share oxidized gunmetal, oxide red, practical repair materials, and industrial surface
  logic without sharing one identical wear mask.
- The maps add hierarchy without changing geometry, sockets, collision, scale, or LOD meshes.

## Durable contacts

The contacts show neutral close, game camera, zoomed-out silhouette, base color, roughness,
metallic, tangent normal, and AO:

| Ship | Contact | SHA-256 |
|---|---|---|
| Dart | `surface_review_dart.png` | `6DDE51D6F69C2B05BE3B2F7758B8A371F69BE8B45AB907925A1B856D4081135B` |
| Lode | `surface_review_lode.png` | `BCF01856A68CF2CFD131EEB1F4E492F425691AF444E7F10F01ED165BA87BF7D9` |
| Rig | `surface_review_rig.png` | `A457CDF103E5F22F96C17B7DEA4B40AF50B635532623AAE6253F304A0B6FB5F7` |

Each contact is 1660 by 760 pixels. The offline renderer was given a temporary copy of the source
graph with nodes explicitly tagged `nonRender`/`collision` removed. The first unfiltered attempt
proved the generic part renderer otherwise frames the compound collision boxes as visible hulls;
those invalid images were discarded. LOD0 render geometry, materials, and texture images were not
changed in the filtered copies.

## Technical proof

- `node --test test/ashline-surface-maps.test.mjs`: 2/2 pass.
- Strict source texture audit: 39 images, 39 bound, 0 errors, 0 warnings, 0 info.
- Dart and Lode each contain 12 bound source images and 12 KTX2 candidate images.
- Rig contains 15 bound source images and 15 KTX2 candidate images.
- `node scripts/check-m4-ashline-v2.mjs`: 0 errors, one known warning for the missing live
  `lod_transition_contact.png`.
- Repeated finalizer runs replace the prior map set. They no longer accumulate orphaned embedded
  images.

Blender 5.1 cannot import the candidate GLBs because its bundled glTF importer does not support
`EXT_meshopt_compression`. Therefore the offline visual contacts use the uncompressed source graph;
the encoded candidates are separately proven to contain Meshopt, KTX2, the required sockets,
collision metadata, LODs, materials, and exact candidate hashes in `finalize_report.json`.

## Remaining gate

Do not promote these files to the live Ashline paths until the current `browser-gpu` lease is
released and the candidate has current Browser and Electron captures at close, normal-flight,
LOD-transition, and dense-combat scales. That live pass must also confirm texture residency,
material-cache behavior, and no VFX or asset-load failures.
