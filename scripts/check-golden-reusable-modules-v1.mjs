#!/usr/bin/env node
// Static/unit contract for the scratch-only Blender reusable-module foundry recipe.
// This intentionally does not launch Blender, mutate GLBs, or make visual-quality claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPE = resolve(ROOT, 'assets/ships/parts/scripts/golden_reusable_modules_v1.py');
const SPEC_PATH = resolve(ROOT, 'assets/ships/parts/scripts/golden_reusable_modules_v1.spec.json');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const REPORT_PATH = resolve(ROOT, 'assets/ships/parts/revamp-evidence/golden-reusable-modules-v1.audit.json');
const args = new Set(process.argv.slice(2));

assert.ok(existsSync(RECIPE), 'Blender recipe exists');
assert.ok(existsSync(SPEC_PATH), 'machine-readable recipe spec exists');
assert.ok(existsSync(MANIFEST_PATH), 'parts manifest exists');

const recipeText = readFileSync(RECIPE, 'utf8');
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const manifestParts = new Map(manifest.parts.map((part) => [part.id, part]));

assert.equal(spec.schema, 'spaceface.goldenReusableModules.recipeSpec.v1');
assert.equal(spec.recipeId, 'golden-reusable-modules-v1');
assert.deepEqual(Object.keys(spec.modules).sort(), ['cockpit_slab', 'engine_industrial', 'weapon_railgun']);
assert.match(recipeText, /bpy\.ops\.import_scene\.gltf/, 'recipe imports immutable GLB snapshots');
assert.match(recipeText, /guard_output_path\(output_dir\)/, 'recipe guards its output root');
assert.match(recipeText, /refusing production\/release output path/, 'recipe fails closed on production/release output');
assert.match(recipeText, /sha256Before/, 'recipe records pre-build source hash');
assert.match(recipeText, /sha256After/, 'recipe records post-build source hash');
assert.match(recipeText, /semanticNodesPreserved/, 'recipe records semantic-node invariants');
assert.match(recipeText, /rootTransformsPreserved/, 'recipe records root-transform invariants');
assert.match(recipeText, /boundsInsideSource/, 'recipe records source-bounds containment');
assert.match(recipeText, /ShaderNodeBsdfPrincipled/, 'recipe uses Principled BSDF');
assert.match(recipeText, /ShaderNodeNormalMap/, 'recipe wires tangent-space normal maps');
assert.match(recipeText, /glTF Material Output/, 'recipe wires packed ORM AO metadata');
assert.match(recipeText, /matchesPreviousRun/, 'recipe exposes repeated-run hash comparison');
assert.match(recipeText, /except BaseException:/, 'Blender CLI boundary catches every Python failure class');
assert.match(recipeText, /traceback\.print_exc\(file=sys\.stderr\)/, 'CLI boundary writes a real traceback to stderr');
assert.match(recipeText, /sys\.stdout\.flush\(\)/, 'CLI boundary flushes stdout');
assert.match(recipeText, /sys\.stderr\.flush\(\)/, 'CLI boundary flushes stderr');
assert.match(recipeText, /os\._exit\(1\)/, 'CLI boundary forces nonzero status despite Blender SystemExit handling');
assert.match(recipeText, /Transmission Weight/, 'optical materials author Principled transmission');
assert.match(recipeText, /spacefaceAuthoredIOR/, 'optical materials preserve authored IOR metadata');
assert.match(recipeText, /spacefaceAuthoredThicknessM/, 'optical materials preserve authored thickness metadata');
assert.match(recipeText, /spacefaceRuntimeSinglePassTransmission/, 'optical materials preserve live single-pass override metadata');
assert.match(recipeText, /ShaderNodeVolumeAbsorption/, 'optical materials author volume attenuation intent');
assert.match(recipeText, /glTF KHR_materials_volume thickness/, 'optical materials expose glTF thickness intent');
assert.doesNotMatch(recipeText, /\bimport\s+random\b|\bfrom\s+random\b/, 'recipe does not use nondeterministic random');
assert.doesNotMatch(recipeText, /bpy\.ops\.wm\.open_mainfile/, 'recipe never opens or overwrites a source blend');

const syntax = compilePython(RECIPE);
assert.equal(syntax.exitCode, 0, `Python syntax compile passes: ${syntax.output}`);
const mainSource = recipeText.slice(recipeText.indexOf('def main()'), recipeText.indexOf('def cli_entrypoint()'));
assertOrdered(mainSource, [
  'verify_candidate_artifacts(report)',
  'atomic_write_json(report_path, report)',
  'verify_final_receipt(report_path, report)',
  'return {',
], 'main verifies candidate hashes, publishes the report, re-verifies it, then returns success');
const boundarySource = recipeText.slice(recipeText.indexOf('def cli_entrypoint()'), recipeText.indexOf('if __name__ == "__main__"'));
assertOrdered(boundarySource, ['receipt = main()', 'print(json.dumps(receipt'], 'CLI prints success only after main returns its verified receipt');
const failureBoundary = runBoundaryProbe(RECIPE, true);
assert.equal(failureBoundary.exitCode, 1, `extracted CLI failure boundary forces exit 1: ${failureBoundary.output}`);
assert.match(failureBoundary.stderr, /RuntimeError: boundary-probe/, 'failure boundary flushes traceback evidence');
assert.doesNotMatch(failureBoundary.stdout, /"ok"\s*:\s*true/, 'failure boundary never prints a success receipt');
const successBoundary = runBoundaryProbe(RECIPE, false);
assert.equal(successBoundary.exitCode, 0, `extracted CLI success boundary exits 0: ${successBoundary.output}`);
assert.match(successBoundary.stdout, /"ok"\s*:\s*true/, 'success boundary prints a receipt after main returns');

const requiredRoleProfiles = new Set();
const roleSignatures = new Set();
for (const [role, profile] of Object.entries(spec.materialProfiles)) {
  requiredRoleProfiles.add(role);
  assert.equal(profile.roughnessRange.length, 2, `${role} has a roughness range`);
  assert.ok(profile.roughnessRange[0] < profile.roughnessRange[1], `${role} roughness is spatially nonuniform`);
  assert.equal(profile.metallicRange.length, 2, `${role} has a metallic range`);
  assert.ok(profile.macroScale > 0 && profile.microScale > profile.macroScale, `${role} separates broad and fine scales`);
  assert.ok(profile.normalStrength >= 0 && profile.normalStrength <= 1, `${role} normal strength is bounded`);
  const signature = JSON.stringify({
    base: profile.baseRgb,
    roughness: profile.roughnessRange,
    metallic: profile.metallicRange,
    scales: [profile.macroScale, profile.microScale],
    pattern: profile.pattern,
  });
  assert.ok(!roleSignatures.has(signature), `${role} is not a duplicate material profile`);
  roleSignatures.add(signature);
}
for (const role of ['canopy_glass', 'sensor_lens']) {
  const profile = spec.materialProfiles[role];
  assert.ok(profile.metallicRange[0] >= 0 && profile.metallicRange[1] <= 0.02, `${role} is physically dielectric`);
  assert.ok(profile.transmissionWeight > 0 && profile.transmissionWeight <= 1, `${role} has authored transmission`);
  assert.ok(profile.ior > 1 && profile.ior < 2, `${role} has a plausible dielectric IOR`);
  assert.ok(profile.thicknessM > 0, `${role} has physical thickness intent`);
  assert.ok(profile.attenuationDistanceM > profile.thicknessM, `${role} attenuation distance exceeds its thickness`);
  assert.equal(profile.runtimeSinglePassTransmission, 0, `${role} retains current runtime single-pass policy`);
}
assert.ok(!('emissionRgb' in spec.materialProfiles.canopy_glass), 'whole canopy glass is not emissive');

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const sourceAudit = [];
for (const [moduleId, moduleSpec] of Object.entries(spec.modules)) {
  const part = manifestParts.get(moduleId);
  assert.ok(part, `${moduleId} exists in the parts manifest`);
  assert.equal(part.file.replaceAll('\\', '/'), moduleSpec.input, `${moduleId} input matches manifest`);
  assert.equal(part.tris, moduleSpec.baseline.triangles, `${moduleId} baseline triangles match manifest`);
  assert.deepEqual(part.bounds.min, moduleSpec.baseline.boundsMin, `${moduleId} minimum bounds match manifest`);
  assert.deepEqual(part.bounds.max, moduleSpec.baseline.boundsMax, `${moduleId} maximum bounds match manifest`);
  assert.deepEqual([...part.hooks].sort(), [...moduleSpec.baseline.hooks].sort(), `${moduleId} hooks match manifest`);
  assert.deepEqual([...part.sockets].sort(), [...moduleSpec.baseline.sockets].sort(), `${moduleId} sockets match manifest`);

  const sourcePath = resolve(ROOT, 'assets/ships/parts', moduleSpec.input);
  assert.ok(existsSync(sourcePath), `${moduleId} source GLB exists`);
  const bytes = statSync(sourcePath).size;
  const sha256 = sha256File(sourcePath);
  assert.equal(bytes, moduleSpec.sourceSnapshot.bytes, `${moduleId} source size matches immutable snapshot`);
  assert.equal(sha256, moduleSpec.sourceSnapshot.sha256, `${moduleId} source hash matches immutable snapshot`);

  const details = moduleSpec.details;
  assert.equal(details.length, moduleSpec.expectedCandidateBand.addedObjects, `${moduleId} declared object count is exact`);
  assert.equal(new Set(details.map((detail) => detail.name)).size, details.length, `${moduleId} detail names are unique`);
  assert.deepEqual([...new Set(details.map((detail) => detail.tier))].sort(), ['macro', 'meso', 'micro'], `${moduleId} has hierarchical detail`);
  for (const detail of details) {
    assert.ok(requiredRoleProfiles.has(detail.role), `${moduleId}/${detail.name} uses a defined material role`);
    assert.ok(recipeText.includes(`"${detail.name}"`), `${moduleId}/${detail.name} is implemented in the Blender recipe`);
  }
  const usedRoles = [...new Set(details.map((detail) => detail.role))].sort();
  assert.deepEqual(usedRoles, [...moduleSpec.requiredMaterials].sort(), `${moduleId} role declaration matches implemented detail`);

  const doc = await io.read(sourcePath);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const nodeNames = new Set(nodes.map((node) => node.getName()).filter(Boolean));
  for (const name of [...moduleSpec.baseline.hooks, ...moduleSpec.baseline.sockets]) {
    assert.ok(nodeNames.has(name), `${moduleId} live GLB contains semantic node ${name}`);
  }
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const triangles = primitives.reduce((total, primitive) => total + primitiveTriangles(primitive), 0);
  assert.equal(triangles, moduleSpec.baseline.triangles, `${moduleId} decoded source triangle count matches contract`);
  const materials = root.listMaterials().map((material) => ({
    name: material.getName() || '(unnamed)',
    baseColor: !!material.getBaseColorTexture(),
    normal: !!material.getNormalTexture(),
    orm: !!material.getMetallicRoughnessTexture(),
    ao: !!material.getOcclusionTexture(),
    roughnessFactor: round(material.getRoughnessFactor()),
    metallicFactor: round(material.getMetallicFactor()),
  }));
  sourceAudit.push({
    moduleId,
    path: relativeSlash(sourcePath),
    bytes,
    sha256,
    triangles,
    meshes: root.listMeshes().length,
    primitives: primitives.length,
    nodes: nodes.length,
    textures: root.listTextures().length,
    materials,
    semanticNodes: [...nodeNames].filter((name) => /^(?:HOOK_|SOCKET_|MOUNT_)/.test(name)).sort(),
    baselineBounds: { min: moduleSpec.baseline.boundsMin, max: moduleSpec.baseline.boundsMax },
  });
}

const report = {
  schema: 'spaceface.goldenReusableModules.recipeAudit.v1',
  packetStatus: 'recipe_prepared_unrendered',
  recipeId: spec.recipeId,
  recipe: {
    path: relativeSlash(RECIPE),
    bytes: statSync(RECIPE).size,
    sha256: sha256File(RECIPE),
    syntax: 'pass',
  },
  spec: {
    path: relativeSlash(SPEC_PATH),
    bytes: statSync(SPEC_PATH).size,
    sha256: sha256File(SPEC_PATH),
  },
  safety: {
    productionGlbsMutated: false,
    productionBlendFilesMutated: false,
    manifestsMutated: false,
    releaseOutputsMutated: false,
    blenderLaunchedByPacket: false,
    browserOrGpuCaptureLaunchedByPacket: false,
    outputGuard: 'Recipe rejects assets/ships/parts and release output trees.',
    inputContract: 'Recipe requires immutable scratch copies whose size and SHA-256 match this spec.',
  },
  sourceAudit,
  candidateContract: Object.fromEntries(Object.entries(spec.modules).map(([moduleId, moduleSpec]) => [moduleId, {
    macroObjects: moduleSpec.details.filter((detail) => detail.tier === 'macro').map((detail) => detail.name),
    mesoObjects: moduleSpec.details.filter((detail) => detail.tier === 'meso').map((detail) => detail.name),
    microObjects: moduleSpec.details.filter((detail) => detail.tier === 'micro').map((detail) => detail.name),
    materialRoles: moduleSpec.requiredMaterials,
    expectedCandidateBand: moduleSpec.expectedCandidateBand,
    preservedHooks: moduleSpec.baseline.hooks,
    preservedSockets: moduleSpec.baseline.sockets,
    preservedBounds: { min: moduleSpec.baseline.boundsMin, max: moduleSpec.baseline.boundsMax },
  }])),
  opticalMaterialTruth: Object.fromEntries(['canopy_glass', 'sensor_lens'].map((role) => [role, {
    metallicRange: spec.materialProfiles[role].metallicRange,
    ior: spec.materialProfiles[role].ior,
    transmissionWeight: spec.materialProfiles[role].transmissionWeight,
    thicknessM: spec.materialProfiles[role].thicknessM,
    attenuationColorRgb: spec.materialProfiles[role].attenuationColorRgb,
    attenuationDistanceM: spec.materialProfiles[role].attenuationDistanceM,
    runtimeSinglePassTransmission: spec.materialProfiles[role].runtimeSinglePassTransmission,
    wholeMaterialEmission: role === 'canopy_glass' ? false : 'confined sensor element only',
  }])),
  cliBoundaryProof: {
    catches: 'BaseException',
    tracebackTo: 'stderr',
    forcedFailureExitCode: failureBoundary.exitCode,
    failureTraceObserved: /RuntimeError: boundary-probe/.test(failureBoundary.stderr),
    successExitCode: successBoundary.exitCode,
    successReceiptObserved: /"ok"\s*:\s*true/.test(successBoundary.stdout),
    completionOrder: ['candidate artifact hash verification', 'atomic final report write', 'final report and artifact re-verification', 'success receipt print'],
  },
  integrationCommands: {
    snapshot: [
      "New-Item -ItemType Directory -Force '.devshots/graphics/golden-reusable-input-v1/cockpits','.devshots/graphics/golden-reusable-input-v1/engines','.devshots/graphics/golden-reusable-input-v1/weapons' | Out-Null",
      "Copy-Item -LiteralPath 'assets/ships/parts/cockpits/cockpit_slab.glb' -Destination '.devshots/graphics/golden-reusable-input-v1/cockpits/cockpit_slab.glb'",
      "Copy-Item -LiteralPath 'assets/ships/parts/engines/engine_industrial.glb' -Destination '.devshots/graphics/golden-reusable-input-v1/engines/engine_industrial.glb'",
      "Copy-Item -LiteralPath 'assets/ships/parts/weapons/weapon_railgun.glb' -Destination '.devshots/graphics/golden-reusable-input-v1/weapons/weapon_railgun.glb'",
    ],
    recipeCheck: 'node scripts/check-golden-reusable-modules-v1.mjs',
    blenderBuild: '& "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup --python assets/ships/parts/scripts/golden_reusable_modules_v1.py -- --module all --input-root .devshots/graphics/golden-reusable-input-v1 --output-dir .devshots/graphics/golden-reusable-modules-v1 --texture-size 256 --lods 0,1,2',
    postBuildStructureAudit: 'node scripts/audit-asset-structure.mjs --root .devshots/graphics/golden-reusable-modules-v1 --out .devshots/graphics/golden-reusable-modules-v1/asset-structure.json',
    productionValidationAfterReviewedPromotion: [
      'node scripts/check-parts-manifest.mjs',
      'npm run check:asset-status',
      'npm run check:asset-reachability',
      'npm run check:assets:live',
      'npm run check:visual-stability',
    ],
  },
  requiredBeforeIntegration: [
    'Run the recipe against copied immutable inputs and inspect blender-run-report.json.',
    'Run Khronos glTF Validator on every LOD candidate and verify zero errors/warnings or document each exception.',
    'Inspect wireframe, base-color, normal, ORM, neutral lookdev, and matched game-camera captures.',
    'Reject detail that shimmers, reads as pasted-on greeble, or disappears without useful aggregate response.',
    'Verify generated PNG texture color spaces and KTX2 conversion before release promotion.',
    'Verify separate-file modular LOD runtime selection before wiring LOD1/LOD2.',
    'Only then adapt candidates to the live parts pipeline and run player-route proof.',
  ],
  knownDefects: [
    'No Blender execution or render was allowed while the release build owned the asset pipeline.',
    'No GLB candidate, image capture, turntable, or gameplay proof exists yet.',
    'KHR_materials_transmission, IOR, and volume-thickness extension output is authored but remains unconfirmed until Blender exports and the candidate GLBs are inspected.',
    'Expected triangle bands are planning estimates and are not measured candidate results.',
    'Generated role textures are PNG source candidates; final KTX2 quality and mip stability are unresolved.',
    'The recipe does not claim current modular-part runtime LOD selection is enabled.',
  ],
  visualAcceptance: 'not_assessed',
  productionReady: false,
};

const serialized = JSON.stringify(report, null, 2) + '\n';
if (args.has('--write')) {
  writeFileSync(REPORT_PATH, serialized);
  console.log(`[golden-reusable-modules] wrote ${relativeSlash(REPORT_PATH)}`);
} else {
  assert.ok(existsSync(REPORT_PATH), 'checked-in machine-readable audit exists; run with --write to create it');
  assert.equal(readFileSync(REPORT_PATH, 'utf8'), serialized, 'machine-readable audit is current and deterministic');
}

console.log(`[golden-reusable-modules] PASS: ${sourceAudit.length} source snapshots, ${Object.keys(spec.materialProfiles).length} distinct PBR roles, ${Object.values(spec.modules).reduce((total, moduleSpec) => total + moduleSpec.details.length, 0)} deterministic detail groups`);
console.log('[golden-reusable-modules] visual acceptance: NOT ASSESSED; Blender/runtime proof still required');

function compilePython(path) {
  const code = "import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text(encoding='utf-8'), str(p), 'exec')";
  for (const command of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const commandArgs = command === 'py' ? ['-3', '-c', code, path] : ['-c', code, path];
    const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
    if (!result.error || result.error.code !== 'ENOENT') {
      return { exitCode: result.status ?? 1, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
    }
  }
  return { exitCode: 1, output: 'no Python interpreter found for syntax-only compile' };
}

function runBoundaryProbe(path, shouldFail) {
  const code = [
    'import ast, pathlib, sys',
    'path = pathlib.Path(sys.argv[1])',
    "tree = ast.parse(path.read_text(encoding='utf-8'))",
    "boundary = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'cli_entrypoint')",
    "imports = ast.parse('import json\\nimport os\\nimport sys\\nimport traceback').body",
    shouldFail
      ? "main = ast.parse(\"def main():\\n    raise RuntimeError('boundary-probe')\").body[0]"
      : "main = ast.parse(\"def main():\\n    return {'ok': True, 'probe': 'success'}\").body[0]",
    "call = ast.parse('cli_entrypoint()').body[0]",
    "module = ast.fix_missing_locations(ast.Module(body=imports + [main, boundary, call], type_ignores=[]))",
    "exec(compile(module, '<boundary-probe>', 'exec'))",
  ].join('\n');
  for (const command of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const commandArgs = command === 'py' ? ['-3', '-c', code, path] : ['-c', code, path];
    const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
    if (!result.error || result.error.code !== 'ENOENT') {
      return {
        exitCode: result.status ?? 1,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
      };
    }
  }
  return { exitCode: 1, stdout: '', stderr: '', output: 'no Python interpreter found for boundary probe' };
}

function assertOrdered(source, tokens, message) {
  let previous = -1;
  for (const token of tokens) {
    const index = source.indexOf(token);
    assert.ok(index > previous, `${message}: missing or out-of-order token ${token}`);
    previous = index;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function primitiveTriangles(primitive) {
  const mode = primitive.getMode();
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  const count = indices ? indices.getCount() : position?.getCount() || 0;
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  if (mode === 4 || mode == null) return Math.floor(count / 3);
  return 0;
}

function relativeSlash(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}
