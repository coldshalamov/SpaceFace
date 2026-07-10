# 09 — Generated Image and Video Production Pipeline

**Status:** DRAFT; subordinate to F9 and the taste constitution until AUTH-001

## 1. Purpose and boundary

Use Codex, Grok, agy, Claude where available, and future generators for concepts, orthographic
reference, decals/masks, trim inputs, icons, portraits, environment plates, and motion/cinematic
references. Generation is a candidate source, not a shortcut around Blender craft, provenance,
family consistency, runtime validation, or independent acceptance.

Until F9 is amended, generated ship/station PBR textures cannot be promoted as final. A generated
normal/ORM/roughness/metal/AO/base-color idea may enter Blender as `production_input`; the authored
source, bake/processing, channel validation, and GLB/runtime evidence create the final 3D material.

## 2. Lifecycle

```text
BRIEF_LOCKED
  → MULTI_GENERATOR_CANDIDATES
  → PROVENANCE_AUDIT
  → ROLE_COLORSPACE_VALIDATION
  → DOWNSTREAM_EDIT_OR_BAKE
  → FAMILY_AND_ARTIFACT_REVIEW
  → RUNTIME_OR_UI_REVIEW
  → PRODUCTION_INPUT or PRODUCTION_FINAL
```

Workers may submit `concept_only` or `production_input`. `production_final` requires the same
controller, technical evidence, blind cross-model review, and exact output hash used elsewhere.

## 3. Compiled generation packet

Every packet fixes:

- player-facing purpose and downstream consumer;
- media type, target kind, channel role, color space, dimensions/duration, and family constraints;
- positive/negative prompt, composition and separation/mask requirements, forbidden text/logos,
  reference sources and licenses;
- the same prompt/inputs for each generator in the bake-off;
- editability, tiling/seam, artifact, consistency, and runtime/UI tests;
- output staging path and `generated-media-manifest.schema.json` record;
- independent review and rejection/continuation rules.

The prompt, references, provider/model/version, seed when exposed, settings, source licenses, output,
and every edit are hash-bound. “The model made it” is not provenance.

## 4. Role and color-space contract

| Target | Color/channel contract | Production rule |
|---|---|---|
| Concept/orthographic reference | sRGB reference image; label as non-runtime | may guide Blender/design, never masquerade as an authored model |
| Base-color input | sRGB; no baked light/specular/shadows/text | 3D use remains input until authored/processed and validated |
| AO/roughness/metal/mask input | linear data; documented channel meaning; ORM is R=AO, G=roughness, B=metal | generated data is input only; validate variance, seams, role, and bake/source |
| Tangent normal | linear tangent-space, correct handedness and neutral baseline | direct generated normal is never final; bake/derive from authored surface |
| Decal/trim/mask | transparent or separated channels, no watermark/baked background | may become final input after edge/tiling/runtime review |
| Icon/portrait/UI plate | sRGB, required alpha, safe crop, family consistency, no baked UI text unless authored | can become final only through actual UI/accessibility review |
| Environment plate | sRGB/HDR contract declared, seamless/parallax role, tone-map exposure | actual runtime exposure and repetition review required |
| Motion/video reference | native fps/duration declared, no claim of gameplay footage | reference unless a cinematic packet separately clears provenance, encoding, continuity, and runtime integration |

## 5. Comparative bake-off

CAP-003 gives all available generators the same bounded packet and keeps outputs blind. Reviewers
measure constraint fidelity, family consistency, clean separation/masks, artifact/text/watermark
rate, editability, downstream Blender/UI/VFX value, provenance completeness, and cleanup time. A
pretty isolated image loses to a less flashy candidate that can actually be edited and shipped.

No provider receives a permanent role until repeated tasks establish it. Results update
`05_AGENT_CAPABILITY_MATRIX.md` with evidence rather than preference.

## 6. Ingestion and acceptance

- Generated outputs land in an isolated staging area, never directly in release/runtime assets.
- An evidence auditor validates the manifest, hashes, source/license record, dimensions, channel
  role, color space, alpha, tiling/seams, and forbidden artifacts.
- A downstream author incorporates the candidate into Blender/UI/VFX or rejects it; that edit is a
  new candidate with its own hash and evidence.
- Runtime/UI review uses actual game routes and family comparison, not a gallery sheet alone.
- The integrator promotes only the accepted exact hash and records generation disclosure/provenance.

Generated media that cannot establish usable rights, provenance, or provider terms remains
`concept_only` and cannot ship.
