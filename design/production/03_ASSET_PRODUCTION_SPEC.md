# 03 — Professional Asset Production Specification

**Status:** DRAFT proposed acceptance amendment; `design/spec3/SPEC3-F9-asset-pipeline.md` remains
the active asset authority until AUTH-001 reconciles and activates these additions. This draft must
not create new visual style, generation, texture, or triangle ceilings before activation.
**3D pipeline:** Blender source → observed validation → GLB → release optimization → runtime → play evidence

## 0. Authority and amendment boundary

This document cannot silently replace F9 or the activated taste/architecture contracts. Before any
conflicting rule is implemented, AUTH-001 produces an explicit F9 amendment/ADR and updates the
Grok skills/campaign docs that encode the old behavior.

| Surface | Current authority | Proposed production addition | Until AUTH-001 |
|---|---|---|---|
| LOD/collision/pivots/sockets | F9 + live runtime contract | profile/exposure-specific hard validation and silhouette proof | obey F9; additions may only make acceptance stricter |
| Ship/station texture generation | F9 restrictions on shared trim/generated ship textures | generated concepts, decals, masks, or plates only through `09_GENERATED_MEDIA_PIPELINE.md` | F9 wins; no generated hero PBR map is promoted |
| Technique coverage | Grok skill's broad percentage checklist | build-card applicability with required/conditional/N/A/forbidden | do not weaken F9; freeze scalable campaigns until skill amended |
| Art acceptance | Alpha evidence + F9 checks | independent hash-bound runtime and blind quality review | additive evidence is allowed; no self-score promotion |

Campaign scripts known to self-score remain candidate-generation tools only. Their DONE/export bars
have no acceptance authority.

## 1. Current integrity defects to repair first

The present pipeline cannot be scaled safely until these are closed:

- Some campaign scripts increase rubric scores from iteration/pass progress rather than visual truth.
- Some scripts ignore failed `lit_close_detail`/nozzle views when deciding pass/fail.
- Existing ledgers can claim export bars while their own render analysis remains false.
- Much of `revamp-evidence/` lacks its required ledger and render set; some deficiency logs contain
  repeated template prose rather than observed revisions.
- The exporter validates before stamping, but its chamfer proof inspects only marked sharp/creased
  edges and treats any qualifying bevel modifier as global coverage; finalizers can still fabricate
  chamfer claims that downstream validation trusts.
- Map checks can accept procedural nodes/factors as baked maps; finalization can synthesize neutral
  base/normal/ORM textures that satisfy transport without adding professional surface information.
- Runtime contract checks currently treat missing station-scale LOD chains as advisory.
- `ASSET_STATUS.json` is incomplete relative to the manifest and conflates lifecycle with quality.

Current working-tree audit snapshot (2026-07-10): 69 manifest entries; 61 evidence directories;
only 9 evidence directories contain an iteration ledger and render set, while 52 contain no image
evidence. Across the nine ledgers, 171 claimed iterations contain 676 render-analysis records, 274
of them `ok:false`. These numbers describe evidence integrity, not the quality of every unreviewed
source asset.

These are **P0 production-integrity defects**. Green packaging is not professional acceptance.

## 2. Asset profiles, not universal technique checklists

Every candidate receives a compiled build card that validates against
`schemas/asset-build-card.schema.json` before authoring:

| Technique/outcome | Required | Conditional | Not applicable | Forbidden | Reason/runtime proof |
|---|---|---|---|---|---|

Asset kind and exposure tier are separate. The kind selects technical obligations; the controller
derives exposure from the Alpha route, projected screen occupancy/duration, recurrence, player
ownership, narrative importance, and interaction criticality. The author cannot downgrade it.
Every technique applicability/N/A decision is controller-approved and hash-bound before authoring;
the semantic validator resolves that decision artifact rather than trusting a hash typed into the
card. An all-N/A card is legal only when those independent decisions and the profile genuinely prove
it, never as an escape from difficult craft work.

Exposure floors are: hero and recurring cast assets ≥20 meaningful macro-cycles, standard assets
≥8, and background assets ≥3. These are review budgets, never pass conditions. The asset kinds are:

- hero player ship;
- cast/NPC ship;
- capital/fleet ship;
- station/landmark;
- modular weapon/engine/cockpit/greeble;
- environment/asteroid/debris;
- repeated small prop;
- animated/mechanical asset;
- 2D texture/decal/icon/portrait;
- VFX/presentation family.

Do not require “70% of Blender.” Booleans, sculpting, geometry nodes, multiple UV sets, trim sheets,
rigging, shape keys, clearcoat, anisotropy, decals, or unique bakes are used only when they solve the
asset's visual/functional problem and survive export/runtime. Unjustified technique use is itself a defect.

## 3. End-to-end macro-cycle

Hero/cast work receives at least twenty **meaningful review cycles**, but count never grants a pass.
Each cycle treats the candidate as a full asset rather than reserving tiny work for later:

1. Open the canonical source and verify hash/provenance.
2. Render full-view clay, lit, close, and runtime-relevant angles; reframe invalid shots before review.
3. Audit form, construction hierarchy, surfacing, story/wear, functionality/life, and runtime fit.
4. Select the highest-impact failing outcomes and the techniques appropriate to repair them.
5. Perform a substantial repair pass across every critical failing domain.
6. Export and render again from a reproducible rig.
7. Record source/GLB hashes, changed objects/materials/maps, mesh/material stats, and before/after evidence.
8. Submit to independent review when the author believes it is ready; continue beyond twenty if rejected.

Camera-only, lighting-only, filename-only, metadata-only, or neutral-texture-only changes do not count.
The controller derives the count from the cycle ledger by recomputing each measured defect,
substantive before/after source/candidate hash, repair technique, and new evidence; the author never
earns cycle credit by reporting an integer.

## 4. Professional outcome gates

### Visual craft

- Role/class silhouette reads at actual game-camera scale.
- Macro, meso, and micro detail form an intentional hierarchy rather than random greeble.
- Hard edges, normals, and bevel language respond cleanly under neutral lighting.
- Material zones remain legible with emissives disabled.
- Roughness/normal/AO/emissive maps contain authored information appropriate to the asset.
- Wear, repair, decals, and asymmetry communicate role/faction/history without noise.

### Functional/runtime craft

- Correct units, transforms, origin, pivot, bounds, semantic materials, and stable names.
- LODs required by projected screen size and exposure; no visible thrash/pop.
- Collision proxies, sockets, mounts, docking/interaction anchors, and animation only where consumed.
- GLB optimization, material reuse, texture budgets, and runtime performance are measured.
- Actual Three.js lighting/material result matches the review intent; Blender beauty renders alone never pass.

### Family craft

- Meaningful silhouettes and identities across the family.
- Shared trim/material language without clone repetition.
- Variants are categorized honestly: hull, module/loadout, faction skin, damage state, or LOD.
- The observatory reports time-weighted exposure and repetition before the family is accepted.

## 5. Evidence and blind review

Each submission includes:

- source and candidate hashes;
- reproducible camera/lighting rig and required views;
- geometry/material/texture/LOD/collision/socket report;
- map flats and variance/role validation;
- full-view Blender renders and actual in-game frames;
- at least one short runtime incident/approach clip;
- performance and loader/fallback evidence;
- defects addressed and unresolved debt.

The blind critic sees randomized before/after/reference sets without iteration count or author score.
Acceptance requires no unresolved critical/major defect. Weighted scores may help prioritize repairs,
but they are never a pass condition.

The reviewer captures fresh held-out angles from the hash-bound GLB. It must not rely solely on the
author's camera, lighting, framing, or selected views. No close/nozzle/muzzle/runtime view may be
excluded from the final decision.

Machine evidence must reject:

- flat or near-neutral normal/ORM/base maps where authored surface information is required;
- metadata-only chamfer claims without measured source geometry/modifiers;
- named LOD nodes without meaningful triangle reduction and silhouette preservation;
- hashes that changed only because metadata, packing, or camera evidence changed;
- full-view shots that are dark, cropped, edge-contacting, or too small to inspect;
- lifecycle claims not derived from the actual runtime map and rendered surface.

## 6. Generated-media boundary

The 2D texture/decal/icon/portrait and VFX profiles do not imply that every output travels through
Blender/GLB. Their generation, provenance, color-space/map-role rules, and ingestion gate live in
`09_GENERATED_MEDIA_PIPELINE.md`. Any generated image used as a 3D material input must still be
processed into the authored Blender/source and survive the 3D runtime checks above.

## 7. Technique library

Tutorials, transcripts, Blender manuals, and proven internal experiments become **technique cards**:

`problem solved · applicable profiles · source/provenance · steps · export survival · runtime cost · proof asset · failure modes`

Research agents expand the library; asset authors consume cards chosen by the profile. The user does
not need to know Blender terminology to obtain a complete professional pipeline. An accepted card
must validate against `design/production/schemas/technique-card.schema.json` and name a proof asset;
a tutorial transcript alone remains `research`.
