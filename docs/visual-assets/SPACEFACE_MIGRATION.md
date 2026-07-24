# SpaceFace Visual-Asset Audit and Migration

## Finding

SpaceFace already has sound principles: normal-route evidence, no global taste ceilings, exact
manifest/runtime authority, and the rule that green checks do not prove quality. The gap is between
those principles and executable craft/acceptance evidence.

The audited Helios civilian builder demonstrates the failure concretely:

- primary forms are assembled mainly from beveled boxes, cylinders, cones, and thin attached strips;
- 64├ù64 arithmetic-noise/grid images and a neutral normal stand in for object-specific surfacing;
- Smart Project is used generally;
- LODs use fixed decimation ratios after merge-by-material;
- `gateOk` rewards triangle presence, sockets, collision, bounds, material names, and metadata rather
  than professional form, UV/bake quality, material response, or independent visual acceptance.

This is a useful deterministic blockout/layout/socket/evidence generator. It is not, by itself, a
production vehicle-art pipeline. Raising a triangle cap would make a more expensive blockout.

## Authority changes

- `docs/visual-assets/` becomes the canonical craft and acceptance route.
- Root/design/program documents retain scope/order authority.
- Manifests/runtime maps retain exact identity and reachability authority.
- Exporter/checks retain technical contract authority.
- G0ΓÇôG7 evidence and independent review own visual acceptance.

The compatibility technique reference no longer contains a ΓÇ£70%+ techniquesΓÇ¥ rule or a global
2ΓÇô6k/4k ship target. Concrete quotas were overriding the repoΓÇÖs better outcome-driven policy.

## Honest field names

Where schemas/checks evolve, separate:

```yaml
technicalContractOk: true
productionState: integration_candidate
gates:
  G0: pass
  G1: pass
  G2: pass
  G3: pass
  G4: pass
  G5: pass
  G6: pass
  G7: blocked
visualAcceptance:
  status: pending
  candidateHash: <exact release hash>
  reviewer: null
  evidencePacket: <path>
profileReport: <path>
waivers: []
```

A script can set technical fields. It cannot self-set G7.

Audit metadata claims against exported truth. A declared 1024 texture size must not pass when the
actual image is 64├ù64; a present normal texture must not imply object-specific normal information
when it is flat.

## Migration phases

### Phase 0 ΓÇö stop semantic drift

Install state vocabulary, reserve finished/shippable for `accepted`, rename misleading technical
gates when safe, classify primitive generators honestly, and remove contradictory technique/count
quotas.

### Phase 1 ΓÇö install standards and records

Route asset/ship/Blender instructions here. Add brief, performance, review, and acceptance records.
Make exact candidate hash and independent reviewer required for Tier A/B acceptance.

### Phase 2 ΓÇö one end-to-end pilot

Use Helios Lark as a strong pilot: compact and visible, with canopy, engines, control surfaces,
service regions, decals, LODs, and traffic cost sufficient to exercise the full pipeline.

Required pilot work:

- retain useful scale/socket/layout information;
- redesign continuous primary hull and rooted engine/canopy/control relationships;
- create believable frame/shell/access/cooling/service logic and negative space;
- author distinct major/panel/machined/glass edge families;
- create editable detailed source and controlled game mesh;
- deliberate UVs/density, clean high-to-low maps, mesh-aware materials and decals;
- authored LOD1/2 from projected size;
- exact normal-route/browser/package proof and representative traffic profile;
- independent G7 acceptance.

Do not rebuild every family member in parallel with one new recipe before the pilot is accepted.

### Phase 3 ΓÇö migrate the family

Extract only proven shared language: material roles, edge families, trim/decal atlas, fasteners,
engine/service interfaces, sockets, bake/export/profile templates. Keep unique per member: primary
silhouette, load/tool/cargo/engine architecture, panel segmentation, role wear/heat, hero markings,
and LOD silhouette decisions.

Cradle must not be Lark plus a mining tool. Span must not be a stretched Lark with boxes. Review each
in clay and the unlabeled same-scale lineup.

### Phase 4 ΓÇö migrate prominent assets by exposure

Prioritize starter/player/shipyard assets, frequent traffic/enemies, major stations/gates/landmarks,
signature weapons/tools, close mission props, then supporting/distant families. Status remains per
exact asset; accepted old assets stay available until replacements pass and rollback is proven.

### Phase 5 ΓÇö industrialize without flattening art

Automate validation, bake setup, evidence framing, compression, profiling, and approved bounded
variants. Do not automate final primary design or independent acceptance into a generator threshold.

## Pipeline architecture

1. **Authored source:** references, blockout/design, high/detail source, game LODs, cages, decals,
   sockets, collision, animations/states in editable Blender structure.
2. **Bake/material build:** validate source roles, duplicate/freeze export meshes, verify UV/density/
   padding/tangents, bake maps, pack runtime textures, validate dimensions/content/color spaces, render
   diagnostics.
3. **Exporter/release:** stamp exact metadata, validate contract, export GLB, Khronos-validate,
   meshopt/gltfpack/glTF-Transform/KTX2 process where reviewed, record hashes/profileΓÇönever art accept.
4. **Runtime verification:** exact no-fallback browser/package load, supported cameras/lighting/states,
   sockets/VFX, LOD transition, renderer/frame/memory/load profile, G6 packet.

## Check migration

Keep and strengthen glTF validation, exact status/reachability, no-fallback, transforms, sockets,
collision, maps/channels/color spaces, LOD availability/stability, route equivalence, and runtime
profile collection.

Add diagnostics for exported image dimensions versus metadata, near-flat maps, UV stretch/density and
padding, repeated pattern correlation on unique hero maps, material response sheets, LOD silhouette/
transition, exact reviewed-hash load, evidence completeness, and reviewer identity for Tier A/B.

Diagnostics with false positives should report for review rather than ban intentionally clean assets.

## Budget migration

Delete or demote universal asset caps unless tied to tier, supported camera, repetition, exact
representative scene, platform/browser, date, frame/memory headroom, and candidate. An asset below a
triangle alarm may still be costly due to draws, overdraw, textures, nodes, upload, or shaders; an
asset above it may be justified when it preserves visible form inside measured headroom.

No authoritative public current Destiny 2 per-asset triangle number was found that should govern this
Three.js game. Another engineΓÇÖs isolated number would not encode SpaceFace camera, traffic density,
WebGL upload/memory, materials, LODs, or draw structure.

## Migration success

The migration succeeds when a technical green build cannot grant `accepted`; every prominent asset
has an honest state/evidence packet; primary forms no longer expose primitive stacking at supported
views; maps are object-aware where required; materials survive varied light; LODs preserve identity;
exact reviewed candidates load in normal play within measured headroom; and independent reviewers can
reject weak work with specific gate defects.
