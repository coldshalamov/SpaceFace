# PACKET ASSET-002 — Repair the live asset-truth pipeline

packetId: ASSET-002
milestone: M0 Wave B
kind: code
lane: sole code_mutation lease through an ACCEPTED SAFE-001 runner
writablePaths: tools/art/lib/**, tools/art/blender/sf_framing.py, tools/art/blender/quality_render_runner.py, tools/art/blender/asteroid_densify_campaign.py, tools/art/blender/engine_vector_campaign.py, tools/art/blender/engine_vector_join_fix.py, tools/art/blender/hull_starter_campaign.py, tools/art/blender/hull_starter_clean_rebuild.py, tools/art/blender/hull_starter_fix_export.py, tools/art/blender/hull_starter_fuse_and_bake.py, tools/art/blender/hull_starter_reframe_pass.py, tools/art/blender/hull_starter_weld_export.py, tools/art/blender/place_gate_jump_ring_campaign.py, tools/art/blender/place_lane_beacon_campaign.py, tools/art/blender/place_lane_beacon_reframe.py, tools/art/blender/place_station_trade_hub_campaign.py, tools/blender/spaceface_export.py, tools/art/finalize_part.mjs, tools/art/finalize_whole_ship.mjs, scripts/check-exporter.mjs, scripts/check-asset-pipeline-contract.mjs, test/asset-pipeline-gate-wiring.test.mjs, test/finalizer-texture-contract.test.mjs, test/source-texture-role-validation.test.mjs, test/textured-mesh-uv-validation.test.mjs, test/spaceface-export-state.test.py
coverage: ALPHA_PROGRAM authored-asset truth precondition; 01_BUILD_PROGRAM M0.1
dependsOn: SAFE-001@ACCEPTED, ASSET-001@ACCEPTED, EVID-001@ACCEPTED
externalPrerequisites: no graphics lock, live Blender process, or campaign job receipt
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Player outcome

Asset campaigns can no longer manufacture professional-looking receipts. Scores follow measured
evidence, every required view participates, geometry/material claims originate in source inspection,
textured primitives are structurally valid, and an iteration counts only when it materially repairs
an observed defect.

## Required implementation

1. Add shared pure truth helpers under `tools/art/lib/` and a pure Python campaign contract beside
   `sf_framing.py`; campaign and headless paths call one authority rather than reimplementing it.
2. Remove iteration/pass/phase inputs from scoring and acceptance in all six primary campaigns.
   Identical canonical evidence must yield identical verdicts.
3. Include every profile-required view at every tracked acceptance site. Engines require
   `lit_nozzle`; a failed close view cannot be excluded from `pass`.
4. Make `quality_render_runner.py` capture and report measured defects. It must not apply a
   predetermined iteration recipe or pad clean analysis. Grok/Blender performs repairs from an
   explicit defect→technique→source-delta plan in a separate authoring session.
5. Strengthen `spaceface_export.py` to inspect unmarked hard angles, prove bevel/chamfer coverage per
   relevant edge, and prove required baked-image information/provenance. Preserve its existing
   validate-before-stamp ordering and stale-stamp regression.
6. Make both finalizers preserve validated proof. They never fabricate chamfer claims, invent
   required surface maps, or treat neutral/noisy-unproven maps as authored content.
7. Extract/generalize the engine drive-surface accessor/storage checks and apply them to every
   textured primitive, including non-engine categories.
8. Remove duplicate exporter-validator logic or make it call the canonical authority.
9. Reverse permissive tests that currently require neutral-map synthesis. Add good controls for
   legitimate untextured/profile-exempt assets so the repair cannot reject everything.
10. After EVID-001, wire the now-green live truth contract exactly once into
    `scripts/check-asset-pipeline-contract.mjs`; update the wiring test to reject duplicate/omitted
    invocation.

## Explicit non-goals

Do not edit `assets/**`, `src/render/**`, release outputs, manifests, `.blend`, GLB, PNG, evidence
folders, or `package.json`. Do not regenerate or “improve” any asset in this packet. Do not weaken a
required asset profile to preserve old outputs. ASSET-003 owns profile-specific LOD/pivot/collision/
socket policy; ASSET-004 owns historical classification.

## Acceptance

All commands run in the isolated candidate, then again after stale-safe integration:

```powershell
node scripts/check-asset-truth-red.mjs --fixtures
node scripts/check-asset-truth-red.mjs --live-code
npm run check:asset-pipeline-contract
node scripts/check-exporter.mjs
python -B test/spaceface-export-state.test.py
node test/finalizer-texture-contract.test.mjs
node test/source-texture-role-validation.test.mjs
node test/textured-mesh-uv-validation.test.mjs
npm run check:runtime-assets
npm run check:asset-status
```

Exit bar:

- ASSET-001 fixture controls remain 18/18 and live-code reports zero loopholes.
- Existing exporter stale-stamp behavior still passes.
- No neutral required map is synthesized; no textured primitive lacks valid UV0 storage/counts.
- The canonical delta/cycle ledger proves each repair changed substantive code and was driven by a
  named RED fixture; worker cycle counts have no authority.
- Runtime-assets remains 66 required parses with zero required failures; asset-status remains
  truthful. The known eight station-LOD advisories and 15 parts-manifest residuals are not silently
  called green or pulled into this packet.
- Independent technical reviewer and fresh reward-hacking reviewer both PASS the exact candidate
  hash with zero open critical/major defects.
