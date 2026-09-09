# PACKET ASSET-001 — RED asset-truth contract

> **Manual packet; exact activation required.** See `README.md`. Discovery does not activate it.

packetId: ASSET-001
milestone: M0 Wave B
kind: control-plane
lane: sole code_mutation lease through an ACCEPTED SAFE-001 runner
writablePaths: scripts/check-asset-truth-red.mjs, test/fixtures/asset-truth/**, design/production/packets/examples/asset-001-notes.md
coverage: ALPHA_PROGRAM Task 0.3 precondition; 01_BUILD_PROGRAM M0.1
dependsOn: SAFE-001@ACCEPTED, PROD-002@ACCEPTED, AUTH-001@ACCEPTED
externalPrerequisites: no active graphics/Blender ownership receipt
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Player outcome

No future asset can be promoted by iteration theater, excluded failed views, fabricated geometry or
surface claims, missing evidence, or camera-only “progress.” This packet adds detectors and bad/good
fixtures only. It does not repair the live pipeline and cannot accept any asset.

## Live holes this packet must detect

1. Campaign score/pass code in the six primary campaigns consumes iteration/pass/phase progress.
2. Required close views are excluded at the primary campaigns and twelve tracked acceptance sites;
   engines can pass while `lit_close_detail` and `lit_nozzle` fail.
3. `spaceface_export.py` examines only marked sharp/creased edges and treats any qualifying bevel
   modifier as coverage; both finalizers can fabricate chamfer claims that headless validation trusts.
4. Finalizers synthesize flat base/ORM/normal maps; transport/binding validation treats them as
   authored surface information and does not bind source provenance.
5. UV/storage validation is strong for engine drive surfaces but is not applied to every textured
   primitive.
6. Evidence prose can cite absent renders without a machine-declared artifact failure.
7. Alpha evidence artifacts are not individually SHA-256 bound. EVID-001 owns the general repair.
8. `sf_framing.py` pads clean analysis with iteration-selected craft notes to satisfy a quota.
9. Camera/render-only changes can be counted as asset macro-cycles without a substantive source or
   candidate delta.

The exact grounded anchors and current baselines live in the controller-owned PROD-002 audit and
the compiled input manifest. Do not copy mutable live ledgers into fixtures as authority; pin any
forensic sample by SHA-256 and pair it with minimal synthetic controls.

## Causal invariants

- Machine scoring/acceptance functions cannot consume iteration number, pass number, phase, or cycle
  count. Pearson correlation is not a gate: real improvement should correlate with iteration too.
- Byte-identical canonical evidence hashes produce byte-identical machine verdicts regardless of
  iteration metadata.
- Worker `weighted`, `export_bar_ok`, self-score, and completion fields have zero acceptance authority.
- Every bad fixture has a nearby good control so a detector cannot pass by rejecting all work.
- A macro-cycle requires a substantive source/candidate hash delta traceable to a measured defect;
  camera, framing, lighting, and prose-only changes do not qualify.

## Deliverable

Add `scripts/check-asset-truth-red.mjs` and minimal fixtures beneath
`test/fixtures/asset-truth/`. It exposes two explicit modes:

```powershell
node scripts/check-asset-truth-red.mjs --fixtures
node scripts/check-asset-truth-red.mjs --live-code
```

`--fixtures` exits zero only when all nine bad fixtures are rejected and all nine good controls are
accepted. `--live-code` exits nonzero against the current loopholes and prints exactly these stable
IDs; this intentional RED is never wired into `npm run check`:

1. `reject_iteration_causality`
2. `require_all_views_in_pass_decision`
3. `prove_chamfer_geometry`
4. `reject_neutral_or_unproven_maps`
5. `require_uv0_on_textured_meshes`
6. `require_declared_evidence`
7. `require_artifact_hash`
8. `reject_padded_deficiencies`
9. `require_substantive_source_delta`

Fixture requirements:

- iteration causality: identical evidence with different iteration metadata and verdicts, plus
  source-AST assertions rejecting iteration/phase inputs in acceptance functions;
- required views: one failed close view excluded from a bogus pass; engine control also requires
  `lit_nozzle`;
- chamfer: unmarked hard-angle/no bevel and irrelevant-bevel coverage failures; good control carries
  exporter-produced source inspection proof;
- maps: flat normal/ORM and noisy-but-unproven maps fail; good control binds exact source/output hashes;
- UV: minimal glTF+BIN textured non-engine primitive without `TEXCOORD_0`; good control has matching
  POSITION/UV accessor storage and counts;
- evidence/hash: exact declared missing path and valid media with missing/wrong hash;
- cycle truth: clean analysis with zero defects, padded craft notes, and unchanged source hash with
  camera-only change.

## Prohibited changes

Do not edit `package.json`, any existing validator/check, `tools/art/**`, `tools/blender/**`,
`assets/**`, `src/render/**`, manifests, release outputs, GLB/PNG/BLEND files, or existing evidence.
Do not normalize live RED to green and do not weaken a good control to obtain a pass.

## Acceptance evidence

- Controller-captured immutable receipts for both commands, including command, tool version, exit,
  stdout/stderr hashes, candidate hash, and input-manifest hash.
- `--fixtures`: 18/18 discriminations green.
- `--live-code`: nonzero with the exact nine IDs and no extra/missing ID.
- Write journal contains only the declared new detector/fixture paths.
- Independent reviewer verifies causal invariants, good controls, and that no repair entered ASSET-001.

## Submission

Return only a SAFE-001 worker submission bound to the controller-created input manifest and canonical
delta manifest (add/modify/delete with before/after hashes). Scripts themselves are not execution
evidence. `meaningfulCycles` is controller-derived from the cycle ledger, never trusted as a worker
integer.
