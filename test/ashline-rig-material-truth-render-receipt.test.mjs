import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const RECEIPT = resolve(
  FAMILY,
  'evidence/material_truth_v2/eligible_artifacts_rig.json',
);
const SOURCE = resolve(FAMILY, 'source/wholeships/ashline_v2_rig.glb');
const RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_rig_material_truth.py');
const BASE_RENDERER = resolve(ROOT, 'tools/blender/render_m4_ashline_material_truth.py');
const EVIDENCE_PREFIX = 'assets/ships/m4_ashline_v2/evidence/material_truth_v2/rig/';
const SEMANTIC_SCHEMA = 'spaceface.m4-ashline-v2.rig-semantic-bounds.v1';
const SEMANTIC_BASIS = 'rig-root-local-aabb';
const SEMANTIC_IMPORT_CONVERSION = 'runtime-x-y-up-z-starboard_to_blender-x-neg-z-y';
const RIG_ROOT_NAME = 'SF_M4_ASHLINE_V2_RIG_ROOT';

const EXPECTED = new Map([
  ['neutral_front34.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['neutral_rear34.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['capture_boom_close.png', { dimensions: [1280, 720], group: 'capture_boom' }],
  ['jaw_clevis_close.png', { dimensions: [1280, 720], group: 'jaw_clevis' }],
  ['tether_winch_close.png', { dimensions: [1280, 720], group: 'tether_winch' }],
  ['paired_drive_mount_close.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['hard_grazing.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['top_ortho.png', { dimensions: [1280, 720], group: 'full_rig' }],
  ['emission_off.png', { dimensions: [1280, 720], group: 'paired_drive' }],
  ['game_120px.png', { dimensions: [120, 120], group: 'full_rig' }],
  ['game_45px.png', { dimensions: [45, 45], group: 'full_rig' }],
]);

const LUMA_LIMITS = new Map([
  ['neutral_front34.png', {
    minimumMean: 16, maximumBelowEight: 0.78,
    maximumAbove247Fraction: 0.06, minimumP5P95Spread: 24,
  }],
  ['neutral_rear34.png', {
    minimumMean: 16, maximumBelowEight: 0.78,
    maximumAbove247Fraction: 0.06, minimumP5P95Spread: 24,
  }],
  ['capture_boom_close.png', {
    minimumMean: 15, maximumBelowEight: 0.80,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['jaw_clevis_close.png', {
    minimumMean: 15, maximumBelowEight: 0.80,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['tether_winch_close.png', {
    minimumMean: 15, maximumBelowEight: 0.80,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['paired_drive_mount_close.png', {
    minimumMean: 15, maximumBelowEight: 0.80,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['hard_grazing.png', {
    minimumMean: 12, maximumBelowEight: 0.86,
    maximumAbove247Fraction: 0.10, minimumP5P95Spread: 24,
  }],
  ['top_ortho.png', {
    minimumMean: 15, maximumBelowEight: 0.80,
    maximumAbove247Fraction: 0.06, minimumP5P95Spread: 20,
  }],
  ['emission_off.png', {
    minimumMean: 14, maximumBelowEight: 0.82,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['game_120px.png', {
    minimumMean: 16, maximumBelowEight: 0.78,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 20,
  }],
  ['game_45px.png', {
    minimumMean: 16, maximumBelowEight: 0.78,
    maximumAbove247Fraction: 0.08, minimumP5P95Spread: 16,
  }],
]);
const LUMA_UPPER_CLIP_THRESHOLD = 247;
const EMISSION_DELTA_LIMITS = {
  pixelChannelThreshold: 2,
  minimumChangedPixels: 16,
  minimumAggregateRgbDelta: 512,
  minimumPeakChannelDelta: 4,
  maximumChangedPixelFraction: 0.02,
  maximumBoundingBoxFraction: 0.25,
};
const EXPECTED_RENDER_PROVENANCE = {
  blender: {
    version: '5.1.2',
    versionTuple: [5, 1, 2],
  },
  settings: {
    engine: 'BLENDER_EEVEE',
    device: {
      class: 'GPU_RASTER',
      backend: 'OPENGL',
    },
    samples: {
      viewportTaa: 64,
      renderTaa: 64,
      taaReprojection: false,
    },
    png: {
      format: 'PNG',
      colorMode: 'RGBA',
      colorDepth: '8',
      compression: 15,
      useFileExtension: true,
    },
    colorManagement: {
      viewTransform: 'AgX',
      look: 'AgX - Medium High Contrast',
      exposure: 1,
      gamma: 1,
      curveMapping: false,
      ditherIntensity: 0,
    },
    filmTransparent: false,
    resolutionPercentage: 100,
  },
};

const SEMANTIC_REQUIREMENTS = new Map([
  ['capture_boom', [
    ['Hook_BoomRootDoubler_', 2],
    ['Hook_BoomRootGusset_', 2],
    ['Hook_BoomChord_', 4],
    ['Hook_BoomWeb_', 6],
    ['Hook_BoomWebFrame_', 2],
    ['Hook_ClevisEar_', 4],
    ['Hook_ClevisPin_', 2],
    ['Hook_ClevisCollar_', 2],
  ]],
  ['jaw_clevis', [
    ['Hook_ClevisEar_', 4],
    ['Hook_ClevisPin_', 2],
    ['Hook_ClevisCollar_', 2],
    ['Hook_ClevisRetainer_', 2],
    ['Hook_JawArm_', 2],
    ['Hook_JawForging_', 2],
    ['Hook_JawKeeper_', 2],
    ['Hook_JawPad_', 6],
    ['Hook_JawPin_', 4],
    ['Hook_JawActuatorEnd_', 2],
    ['Hook_JawHydraulicCase_', 2],
    ['Hook_JawHydraulicRod_', 2],
    ['Hook_JawHydraulicClevis_', 2],
    ['Hook_JawHydraulicHose_', 2],
  ]],
  ['tether_winch', [
    ['Hook_TetherDrum_Grooved', 1],
    ['Hook_TetherDrum_KeyedShaft', 1],
    ['Hook_TetherDrum_CableWrap', 1],
    ['Hook_TetherDrum_Bearing_', 2],
    ['Hook_TetherBearingCap_', 2],
    ['Hook_TetherDrum_BrakeBand', 1],
    ['Hook_TetherBrake_ServiceCover', 1],
    ['Hook_TetherDrum_ClutchLever', 1],
    ['Hook_TetherGuard_', 2],
    ['Hook_TetherFairlead_Sheave', 1],
    ['Hook_TetherFairlead_Guide', 1],
    ['Hook_TetherFairlead_DrumRun', 1],
    ['Hook_TetherFairlead_BraidedRun', 1],
    ['Hook_TetherFairlead_Terminal_', 2],
  ]],
  ['paired_drive', [
    ['Hook_DrivePressureCase_', 2],
    ['Hook_DriveHotSection_', 2],
    ['Hook_DriveBell_', 2],
    ['Hook_DriveRefractoryThroat_', 2],
    ['Hook_DriveInternalCue_', 2],
    ['Hook_DriveClamp_', 4],
    ['Hook_DriveTrussNodeLower_', 8],
    ['Hook_DriveTrussNodeUpper_', 8],
    ['Hook_DriveTrussWeb_', 4],
    ['Hook_DriveThrustSaddle_', 2],
    ['Hook_DriveSaddleWeb_', 2],
    ['Hook_DriveRootDoubler_', 2],
    ['Hook_DriveEngineGusset_', 2],
    ['Hook_DriveRootGusset_', 2],
  ]],
]);

const authoredRigRequirements = [];
const authoredRigPrefixes = new Set();
for (const sourceGroup of ['capture_boom', 'jaw_clevis', 'tether_winch', 'paired_drive']) {
  for (const rule of SEMANTIC_REQUIREMENTS.get(sourceGroup)) {
    if (!authoredRigPrefixes.has(rule[0])) {
      authoredRigRequirements.push(rule);
      authoredRigPrefixes.add(rule[0]);
    }
  }
}
SEMANTIC_REQUIREMENTS.set('authored_rig', authoredRigRequirements);
SEMANTIC_REQUIREMENTS.set('full_rig', authoredRigRequirements);

const SEMANTIC_CONTRACT_GROUPS = new Map([
  ['authored_rig', 'authoredRig'],
  ['full_rig', 'fullRig'],
  ['capture_boom', 'capture'],
  ['jaw_clevis', 'jaw'],
  ['tether_winch', 'winch'],
  ['paired_drive', 'drives'],
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalJsonSha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').toUpperCase();
}

function glbEvidenceSource(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'source must be a GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'source must use glTF 2');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, 'GLB chunk extends past source bytes');
    if (type === 0x4E4F534A) {
      const json = JSON.parse(bytes.toString('utf8', start, end).replace(/\u0000+$/u, ''));
      const root = (json.nodes ?? []).find((node) => node.name === RIG_ROOT_NAME);
      assert.ok(root, `source must contain exact root ${RIG_ROOT_NAME}`);
      return {
        semanticBounds: root.extras?.spaceface?.materialTruth?.semanticBounds,
      };
    }
    offset = end;
  }
  assert.fail('source GLB has no JSON chunk');
}

function roundedGroup(group) {
  const rounded = {
    components: [...group.components],
    ...Object.fromEntries(
      ['min', 'max', 'center', 'size'].map((field) => [
        field,
        Object.fromEntries(
          ['x', 'y', 'z'].map((axis) => [axis, Number(group[field][axis].toFixed(6))]),
        ),
      ]),
    ),
  };
  if (group.visualNodes) {
    rounded.visualNodes = group.visualNodes.map((entry) => ({
      name: entry.name,
      materials: [...entry.materials],
    }));
  }
  return rounded;
}

function assertRootSemanticContract(contract) {
  assert.ok(contract && typeof contract === 'object', 'source semanticBounds contract');
  assert.equal(contract.schema, SEMANTIC_SCHEMA);
  assert.equal(contract.basis, SEMANTIC_BASIS);
  assert.deepEqual(
    Object.keys(contract.groups).sort(),
    ['authoredRig', 'capture', 'drives', 'fullRig', 'jaw', 'winch'],
  );
  for (const [name, group] of Object.entries(contract.groups)) {
    assert.ok(Array.isArray(group.components), `${name} components`);
    assert.deepEqual(
      group.components,
      [...new Set(group.components)].sort(),
      `${name} components must be sorted and unique`,
    );
    for (const field of ['min', 'max', 'center', 'size']) {
      assertFiniteVector(
        ['x', 'y', 'z'].map((axis) => group[field]?.[axis]),
        `${name}.${field}`,
      );
    }
    for (const axis of ['x', 'y', 'z']) {
      const expectedSize = group.max[axis] - group.min[axis];
      const expectedCenter = (group.max[axis] + group.min[axis]) * 0.5;
      assert.ok(expectedSize > 0, `${name}.${axis} bounds must be non-degenerate`);
      assert.ok(
        Math.abs(group.size[axis] - expectedSize) <= 1e-5,
        `${name}.${axis} size must match min/max`,
      );
      assert.ok(
        Math.abs(group.center[axis] - expectedCenter) <= 1e-5,
        `${name}.${axis} center must match min/max`,
      );
    }
  }

  const closeGroups = ['capture', 'jaw', 'winch', 'drives'].map(
    (name) => contract.groups[name],
  );
  const componentUnion = [...new Set(closeGroups.flatMap((group) => group.components))].sort();
  assert.deepEqual(contract.groups.authoredRig.components, componentUnion);
  assert.deepEqual(contract.groups.fullRig.components, contract.groups.authoredRig.components);
  assert.ok(contract.groups.fullRig.visualNodes.length > 0, 'fullRig visual nodes');
  assert.deepEqual(
    contract.groups.fullRig.visualNodes,
    [...contract.groups.fullRig.visualNodes].sort(
      (left, right) => left.name.localeCompare(right.name),
    ),
    'fullRig visual nodes must be sorted',
  );
  for (const node of contract.groups.fullRig.visualNodes) {
    assert.ok(node.name.startsWith('LOD0_'), `fullRig visual node ${node.name}`);
    assert.deepEqual(node.materials, [...new Set(node.materials)].sort());
  }
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(
      contract.groups.authoredRig.min[axis],
      Math.min(...closeGroups.map((group) => group.min[axis])),
      `authoredRig ${axis} minimum`,
    );
    assert.equal(
      contract.groups.authoredRig.max[axis],
      Math.max(...closeGroups.map((group) => group.max[axis])),
      `authoredRig ${axis} maximum`,
    );
    assert.ok(
      contract.groups.fullRig.min[axis] <= contract.groups.authoredRig.min[axis]
      && contract.groups.fullRig.max[axis] >= contract.groups.authoredRig.max[axis],
      `fullRig must contain authoredRig on ${axis}`,
    );
  }
}

function assertFiniteVector(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.equal(value.length, 3, `${label} must contain three coordinates`);
  assert.ok(value.every(Number.isFinite), `${label} must contain finite coordinates`);
}

function vectorDot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function vectorLength(value) {
  return Math.hypot(...value);
}

function assertFullRigCornersInsideCamera(artifact) {
  const { camera, semantic } = artifact;
  for (const field of ['location', 'target', 'direction', 'right', 'up']) {
    assertFiniteVector(camera[field], `${artifact.path} camera.${field}`);
  }
  assert.ok(Math.abs(vectorLength(camera.direction) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorLength(camera.right) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorLength(camera.up) - 1) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.direction, camera.right)) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.direction, camera.up)) <= 2e-5);
  assert.ok(Math.abs(vectorDot(camera.right, camera.up)) <= 2e-5);
  assert.equal(camera.fitSafetyFactor, 1.00005);
  assert.ok(Math.abs(camera.projectedCornerLimit - 1 / camera.margin) <= 2e-6);

  const forward = camera.direction.map((value) => -value);
  const corners = [];
  for (const x of [semantic.bounds.min[0], semantic.bounds.max[0]]) {
    for (const y of [semantic.bounds.min[1], semantic.bounds.max[1]]) {
      for (const z of [semantic.bounds.min[2], semantic.bounds.max[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  let maximumX = 0;
  let maximumY = 0;
  for (const corner of corners) {
    const relative = corner.map((value, axis) => value - camera.location[axis]);
    let projectedX;
    let projectedY;
    if (camera.projection === 'perspective') {
      const depth = vectorDot(relative, forward);
      assert.ok(depth > 0, `${artifact.path} fullRig corner is behind camera`);
      const tanHorizontal = camera.sensorWidthMm / (2 * camera.lensMm);
      const tanVertical = tanHorizontal / camera.aspect;
      projectedX = Math.abs(vectorDot(relative, camera.right)) / (depth * tanHorizontal);
      projectedY = Math.abs(vectorDot(relative, camera.up)) / (depth * tanVertical);
    } else {
      assert.equal(camera.projection, 'orthographic');
      projectedX = 2 * Math.abs(vectorDot(relative, camera.right))
        / (camera.orthoScale * camera.aspect);
      projectedY = 2 * Math.abs(vectorDot(relative, camera.up)) / camera.orthoScale;
    }
    maximumX = Math.max(maximumX, projectedX);
    maximumY = Math.max(maximumY, projectedY);
    assert.ok(
      projectedX <= camera.projectedCornerLimit,
      `${artifact.path} fullRig corner exceeds horizontal margin: ${projectedX}`,
    );
    assert.ok(
      projectedY <= camera.projectedCornerLimit,
      `${artifact.path} fullRig corner exceeds vertical margin: ${projectedY}`,
    );
  }
  assert.ok(
    Math.abs(camera.projectedCornerMaximum[0] - maximumX) <= 0.000002,
    `${artifact.path} horizontal camera-containment audit`,
  );
  assert.ok(
    Math.abs(camera.projectedCornerMaximum[1] - maximumY) <= 0.000002,
    `${artifact.path} vertical camera-containment audit`,
  );
}

function assertSemanticEvidence(artifact, sourceEvidence) {
  const { semantic } = artifact;
  assert.ok(semantic && typeof semantic === 'object', `${artifact.path} semantic metadata`);
  assert.equal(
    semantic.components.length,
    new Set(semantic.components).size,
    `${artifact.path} duplicate components`,
  );
  assertFiniteVector(semantic.bounds.min, `${artifact.path} bounds.min`);
  assertFiniteVector(semantic.bounds.max, `${artifact.path} bounds.max`);
  assertFiniteVector(semantic.bounds.center, `${artifact.path} bounds.center`);
  assertFiniteVector(semantic.bounds.size, `${artifact.path} bounds.size`);
  assert.ok(semantic.bounds.size.every((value) => value > 0), `${artifact.path} degenerate bounds`);
  assert.deepEqual(
    artifact.camera.target,
    semantic.bounds.center,
    `${artifact.path} target must be its computed semantic-bounds center`,
  );

  assert.equal(
    semantic.boundsSource,
    semantic.group === 'full_rig'
      ? 'root-semantic-full-rig-bounds'
      : 'root-semantic-component-bounds',
  );
  const expectedRules = SEMANTIC_REQUIREMENTS.get(semantic.group);
  assert.ok(expectedRules, `${artifact.path} unknown semantic group ${semantic.group}`);
  const contractGroup = SEMANTIC_CONTRACT_GROUPS.get(semantic.group);
  assert.equal(semantic.contract.root, RIG_ROOT_NAME);
  assert.equal(semantic.contract.schema, SEMANTIC_SCHEMA);
  assert.equal(semantic.contract.basis, SEMANTIC_BASIS);
  assert.equal(semantic.contract.importConversion, SEMANTIC_IMPORT_CONVERSION);
  assert.equal(semantic.contract.group, contractGroup);
  const sourceGroup = sourceEvidence.semanticBounds.groups[contractGroup];
  assert.deepEqual(semantic.components, sourceGroup.components);
  assert.deepEqual(semantic.rootLocalBounds, roundedGroup(sourceGroup));
  if (semantic.group === 'full_rig') {
    assert.ok(
      artifact.camera.margin >= 1.08 && artifact.camera.margin <= 1.12,
      `${artifact.path} fullRig margin must remain tight without cropping`,
    );
    assert.equal(semantic.materialFocusProvenance.contractGroup, 'authoredRig');
    assert.deepEqual(
      semantic.materialFocusProvenance.components,
      sourceEvidence.semanticBounds.groups.authoredRig.components,
    );
    assert.deepEqual(
      semantic.materialFocusProvenance.rootLocalBounds,
      roundedGroup(sourceEvidence.semanticBounds.groups.authoredRig),
    );
  }
  assert.equal(semantic.requirements.length, expectedRules.length);
  for (const [namePrefix, minimumCount] of expectedRules) {
    const matches = semantic.components.filter((name) => name.startsWith(namePrefix));
    assert.ok(
      matches.length >= minimumCount,
      `${artifact.path} ${namePrefix} matched ${matches.length}, expected ${minimumCount}`,
    );
    const audit = semantic.requirements.find((item) => item.namePrefix === namePrefix);
    assert.deepEqual(audit, {
      namePrefix,
      minimumCount,
      matchedCount: matches.length,
    });
  }
}

function lumaMetricsFromRaw(data, info) {
  assert.equal(info.channels, 3, 'luma guard expects RGB');
  let sum = 0;
  let belowEight = 0;
  let above247 = 0;
  const histogram = Array(256).fill(0);
  const pixels = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += 3) {
    const luma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    sum += luma;
    if (luma < 8) belowEight += 1;
    if (luma >= LUMA_UPPER_CLIP_THRESHOLD) above247 += 1;
    histogram[Math.max(0, Math.min(255, Math.floor(luma)))] += 1;
  }
  const percentile = (fraction) => {
    const target = Math.max(1, Math.ceil(pixels * fraction));
    let cumulative = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      cumulative += histogram[value];
      if (cumulative >= target) return value;
    }
    assert.fail('luma histogram does not contain every decoded pixel');
  };
  const p5 = percentile(0.05);
  const p95 = percentile(0.95);
  return {
    mean: sum / pixels,
    belowEightFraction: belowEight / pixels,
    above247Fraction: above247 / pixels,
    p5,
    p95,
    p5P95Spread: p95 - p5,
  };
}

async function lumaMetrics(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return lumaMetricsFromRaw(data, info);
}

function lumaEligibilityFailures(metrics, limits) {
  const failures = [];
  if (metrics.mean < limits.minimumMean) failures.push('mean');
  if (metrics.belowEightFraction > limits.maximumBelowEight) {
    failures.push('belowEightFraction');
  }
  if (metrics.above247Fraction > limits.maximumAbove247Fraction) {
    failures.push('above247Fraction');
  }
  if (metrics.p5P95Spread < limits.minimumP5P95Spread) {
    failures.push('p5P95Spread');
  }
  return failures;
}

async function emissionDeltaMetrics(firstPath, secondPath) {
  const [first, second] = await Promise.all([
    sharp(firstPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(secondPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert.deepEqual(first.info, second.info, 'matched emission frames must have identical layout');
  let changedPixels = 0;
  let aggregateRgbDelta = 0;
  let meaningfulRgbDelta = 0;
  let peakChannelDelta = 0;
  let minX = first.info.width;
  let minY = first.info.height;
  let maxX = -1;
  let maxY = -1;
  for (
    let offset = 0, pixelIndex = 0;
    offset < first.data.length;
    offset += first.info.channels, pixelIndex += 1
  ) {
    const deltas = Array.from(
      { length: first.info.channels },
      (_, channel) => Math.abs(first.data[offset + channel] - second.data[offset + channel]),
    );
    aggregateRgbDelta += deltas.reduce((sum, value) => sum + value, 0);
    const pixelPeak = Math.max(...deltas);
    peakChannelDelta = Math.max(peakChannelDelta, pixelPeak);
    if (pixelPeak >= EMISSION_DELTA_LIMITS.pixelChannelThreshold) {
      changedPixels += 1;
      meaningfulRgbDelta += deltas.reduce((sum, value) => sum + value, 0);
      const x = pixelIndex % first.info.width;
      const y = Math.floor(pixelIndex / first.info.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const pixelCount = first.info.width * first.info.height;
  const boundingArea = changedPixels
    ? (maxX - minX + 1) * (maxY - minY + 1)
    : 0;
  return {
    changedPixels,
    aggregateRgbDelta,
    meaningfulRgbDelta,
    peakChannelDelta,
    changedPixelFraction: changedPixels / pixelCount,
    boundingBoxFraction: boundingArea / pixelCount,
    boundingBox: changedPixels
      ? { min: [minX, minY], max: [maxX, maxY] }
      : null,
  };
}

test('Rig Sharp luma metrics reject flat white and flat gray content fixtures', async () => {
  const width = 16;
  const height = 16;
  const fixtureMetrics = async (pixelForX) => {
    const input = Buffer.alloc(width * height * 3);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const [red, green, blue] = pixelForX(pixel % width);
      input[pixel * 3] = red;
      input[pixel * 3 + 1] = green;
      input[pixel * 3 + 2] = blue;
    }
    const encoded = await sharp(input, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const decoded = await sharp(encoded)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return lumaMetricsFromRaw(decoded.data, decoded.info);
  };
  const rich = await fixtureMetrics(
    (x) => (x < 2 ? [20, 20, 20] : x >= 12 ? [180, 180, 180] : [90, 90, 90]),
  );
  const flatWhite = await fixtureMetrics(() => [255, 255, 255]);
  const flatGray = await fixtureMetrics(() => [96, 96, 96]);
  const limits = LUMA_LIMITS.get('neutral_front34.png');

  assert.deepEqual(lumaEligibilityFailures(rich, limits), []);
  assert.ok(
    lumaEligibilityFailures(flatWhite, limits).includes('above247Fraction'),
    'flat white must fail the upper-clipping guard',
  );
  assert.ok(
    lumaEligibilityFailures(flatWhite, limits).includes('p5P95Spread'),
    'flat white must fail the contrast guard',
  );
  assert.deepEqual(
    lumaEligibilityFailures(flatGray, limits),
    ['p5P95Spread'],
    'flat gray must fail even when its mean and clipping metrics look acceptable',
  );
});

test('Rig exact source exposes complete pre-merge semantic bounds on its root', () => {
  const sourceEvidence = glbEvidenceSource(SOURCE);
  assertRootSemanticContract(sourceEvidence.semanticBounds);
  for (const [semanticGroup, contractGroup] of SEMANTIC_CONTRACT_GROUPS) {
    const components = sourceEvidence.semanticBounds.groups[contractGroup].components;
    for (const [namePrefix, minimumCount] of SEMANTIC_REQUIREMENTS.get(semanticGroup)) {
      const matches = components.filter((name) => name.startsWith(namePrefix));
      assert.ok(
        matches.length >= minimumCount,
        `${contractGroup} ${namePrefix} matched ${matches.length}, expected ${minimumCount}`,
      );
    }
  }
});

test('Rig renderer stages, validates, and promotes the receipt last', () => {
  const rendererSource = readFileSync(RENDERER, 'utf8');
  assert.equal(
    rendererSource.includes('--receipt-only'),
    false,
    'a receipt must only be written by a complete exact-source rerender',
  );
  assert.match(
    rendererSource,
    /staged = render_rig\(source, stage_dir\)/u,
    'renderer must generate every eligible artifact in isolated staging before promotion',
  );
  assert.match(
    rendererSource,
    /promote_evidence_bundle\([\s\S]*validate_before_receipt=validate_inputs_unchanged/u,
    'renderer must validate stable inputs inside recoverable promotion before receipt replacement',
  );
  assert.ok(
    rendererSource.indexOf('staged_receipt.replace(receipt_path)')
      > rendererSource.indexOf('staged_path.replace(target)'),
    'receipt replacement must be the final promotion phase after every image',
  );
  assert.equal(
    /receipt_path\.write_text\(/u.test(rendererSource),
    false,
    'renderer must never overwrite the canonical receipt in place',
  );
  assert.match(
    rendererSource,
    /def transaction_fixture_self_test\(\)/u,
    'renderer must retain an isolated late-failure rollback fixture',
  );
  assert.match(
    rendererSource,
    /lock_path\.open\("x", encoding="utf-8", newline="\\n"\)/u,
    'canonical promotion ownership must use atomic exclusive creation',
  );
  assert.match(
    rendererSource,
    /assert_promotion_lock_owner\(lock_path, lock_text\)/u,
    'canonical mutation and rollback must repeatedly validate the owner token',
  );
  assert.ok(
    rendererSource.indexOf('canonical_precondition = canonical_bundle_precondition(')
      < rendererSource.indexOf('staged = render_rig(source, stage_dir)'),
    'renderer must snapshot canonical targets before the long render begins',
  );
  assert.match(
    rendererSource,
    /changed since rendering began; promotion refused/u,
    'stale completed renders must fail their canonical precondition under lock',
  );
  assert.match(
    rendererSource,
    /promoted target no longer belongs to this transaction/u,
    'rollback must refuse to touch a foreign replacement output',
  );
  assert.match(
    rendererSource,
    /def png_decoder_fixture_self_test\(\)/u,
    'renderer must retain isolated CRC and terminal-IEND decoder fixtures',
  );
  assert.match(
    rendererSource,
    /imported_semantic_contract\(\)/u,
    'close cameras must consume the imported root semantic-bounds contract',
  );
  assert.equal(
    rendererSource.includes('named-component-nodes'),
    false,
    'material-merged source nodes must not masquerade as semantic close-frame bounds',
  );
  assert.equal(
    rendererSource.includes('visible-lod0-meshes'),
    false,
    'full-subject eligibility must not accept an untracked visible-mesh union',
  );
});

test('Rig material-truth receipt is exact-source, semantic, and byte-complete', async () => {
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const sourceSha256 = sha256(SOURCE);
  const rendererSha256 = sha256(RENDERER);
  const baseRendererSha256 = sha256(BASE_RENDERER);
  const sourceEvidence = glbEvidenceSource(SOURCE);
  assertRootSemanticContract(sourceEvidence.semanticBounds);

  assert.equal(receipt.schema, 'spaceface.ashlineMaterialTruthArtifacts.v1');
  assert.match(receipt.transactionId, /^[0-9a-f]{32}$/u);
  assert.equal(receipt.shipKey, 'rig');
  assert.equal(
    receipt.source,
    'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_rig.glb',
  );
  assert.equal(receipt.sourceSha256, sourceSha256);
  assert.deepEqual(receipt.producer, {
    path: 'tools/blender/render_m4_ashline_rig_material_truth.py',
    sha256: rendererSha256,
  });
  assert.deepEqual(receipt.producerDependencies, [{
    path: 'tools/blender/render_m4_ashline_material_truth.py',
    sha256: baseRendererSha256,
  }]);
  assert.deepEqual(receipt.renderProvenance, EXPECTED_RENDER_PROVENANCE);
  assert.equal(
    receipt.renderProvenanceSha256,
    canonicalJsonSha256(receipt.renderProvenance),
    'receipt must hash the exact pinned Blender/render settings',
  );
  assert.equal(receipt.artifacts.length, EXPECTED.size);

  const names = receipt.artifacts.map((artifact) => artifact.path.split('/').at(-1));
  assert.equal(new Set(names).size, EXPECTED.size, 'eligible artifact names must be unique');
  assert.deepEqual([...names].sort(), [...EXPECTED.keys()].sort());

  const artifactsByName = new Map();
  for (const artifact of receipt.artifacts) {
    const fileName = artifact.path.split('/').at(-1);
    const expected = EXPECTED.get(fileName);
    assert.ok(expected, `unexpected artifact ${artifact.path}`);
    assert.equal(artifact.path, `${EVIDENCE_PREFIX}${fileName}`);
    assert.deepEqual(artifact.inputBindings, [{
      shipKey: 'rig',
      sourceSha256,
    }]);
    assert.deepEqual(artifact.producer, receipt.producer);
    assert.deepEqual(artifact.producerDependencies, receipt.producerDependencies);
    assert.equal(
      artifact.renderProvenanceSha256,
      receipt.renderProvenanceSha256,
      `${fileName} pinned render provenance binding`,
    );

    const absolutePath = resolve(ROOT, artifact.path);
    const actualSha256 = sha256(absolutePath);
    const actualBytes = statSync(absolutePath).size;
    const image = await sharp(absolutePath).metadata();
    assert.equal(artifact.sha256, actualSha256, `${fileName} sha256`);
    assert.equal(artifact.bytes, actualBytes, `${fileName} bytes`);
    assert.equal(artifact.width, image.width, `${fileName} width`);
    assert.equal(artifact.height, image.height, `${fileName} height`);
    assert.equal(image.format, 'png', `${fileName} encoding`);
    assert.equal(image.depth, 'uchar', `${fileName} must be 8-bit`);
    assert.ok(
      image.channels === 3 || image.channels === 4,
      `${fileName} must be RGB or RGBA`,
    );
    assert.deepEqual(artifact.dimensions, [image.width, image.height], `${fileName} dimensions`);
    assert.deepEqual(artifact.dimensions, expected.dimensions, `${fileName} expected dimensions`);
    assert.equal(artifact.semantic.group, expected.group, `${fileName} semantic group`);
    assertSemanticEvidence(artifact, sourceEvidence);
    if (artifact.semantic.group === 'full_rig') {
      assertFullRigCornersInsideCamera(artifact);
    }
    assert.deepEqual(artifact.camera.resolution, expected.dimensions);
    assert.ok(artifact.emission.materials.length > 0, `${fileName} emission material binding`);
    assert.ok(
      artifact.emission.bindings.some(
        (binding) => binding.authoredStrength > 0 || binding.incomingLinks > 0,
      ),
      `${fileName} must bind a real authored emission-strength signal`,
    );
    assert.ok(artifact.lighting.exposure >= 0.8, `${fileName} evidence exposure`);
    assert.ok(artifact.lighting.worldStrength >= 0.3, `${fileName} evidence world fill`);
    assert.deepEqual(
      Object.keys(artifact.lighting.lights).sort(),
      ['ASHLINE_DETAIL', 'ASHLINE_FILL', 'ASHLINE_KEY', 'ASHLINE_RIM'],
      `${fileName} bound light set`,
    );
    artifactsByName.set(fileName, artifact);
  }

  const paired = artifactsByName.get('paired_drive_mount_close.png');
  const emissionOff = artifactsByName.get('emission_off.png');
  assert.equal(paired.emission.state, 'authored-on');
  assert.equal(emissionOff.emission.state, 'off');
  assert.deepEqual(emissionOff.semantic, paired.semantic, 'emission pair semantic frame');
  assert.deepEqual(emissionOff.camera, paired.camera, 'emission pair camera');
  assert.deepEqual(emissionOff.lighting, paired.lighting, 'emission pair lighting');
  assert.deepEqual(emissionOff.emission.materials, paired.emission.materials);
  assert.deepEqual(emissionOff.emission.bindings, paired.emission.bindings);
  assert.notEqual(emissionOff.sha256, paired.sha256, 'authored emission pair must visibly differ');
  const emissionDelta = await emissionDeltaMetrics(
    resolve(ROOT, paired.path),
    resolve(ROOT, emissionOff.path),
  );
  assert.deepEqual(paired.emission.delta.limits, EMISSION_DELTA_LIMITS);
  assert.deepEqual(emissionOff.emission.delta, paired.emission.delta);
  for (const field of [
    'changedPixels',
    'aggregateRgbDelta',
    'meaningfulRgbDelta',
    'peakChannelDelta',
    'boundingBox',
  ]) {
    assert.deepEqual(paired.emission.delta[field], emissionDelta[field], `emission ${field}`);
  }
  for (const field of ['changedPixelFraction', 'boundingBoxFraction']) {
    assert.ok(
      Math.abs(paired.emission.delta[field] - emissionDelta[field]) <= 0.000000001,
      `emission ${field}`,
    );
  }
  assert.ok(emissionDelta.changedPixels >= EMISSION_DELTA_LIMITS.minimumChangedPixels);
  assert.ok(emissionDelta.aggregateRgbDelta >= emissionDelta.meaningfulRgbDelta);
  assert.ok(
    emissionDelta.meaningfulRgbDelta >= EMISSION_DELTA_LIMITS.minimumAggregateRgbDelta,
  );
  assert.ok(emissionDelta.peakChannelDelta >= EMISSION_DELTA_LIMITS.minimumPeakChannelDelta);
  assert.ok(
    emissionDelta.changedPixelFraction <= EMISSION_DELTA_LIMITS.maximumChangedPixelFraction,
  );
  assert.ok(
    emissionDelta.boundingBoxFraction <= EMISSION_DELTA_LIMITS.maximumBoundingBoxFraction,
  );
  assert.equal(artifactsByName.get('hard_grazing.png').lighting.profile, 'hard-grazing');
  assert.equal(artifactsByName.get('hard_grazing.png').emission.state, 'authored-on');

  const game120 = artifactsByName.get('game_120px.png');
  const game45 = artifactsByName.get('game_45px.png');
  assert.deepEqual(game45.semantic, game120.semantic, 'gamescale frames must use fullRig bounds');
  assert.deepEqual(
    { ...game45.camera, resolution: undefined },
    { ...game120.camera, resolution: undefined },
    'gamescale frames must preserve one tight full-band composition',
  );

  assert.deepEqual(
    [...LUMA_LIMITS.keys()].sort(),
    [...EXPECTED.keys()].sort(),
    'every eligible artifact must have an explicit luma intent',
  );
  for (const [fileName, limits] of LUMA_LIMITS) {
    const artifact = artifactsByName.get(fileName);
    const metrics = await lumaMetrics(resolve(ROOT, artifact.path));
    assert.deepEqual(artifact.luma.limits, limits, `${fileName} bound luma intent`);
    assert.ok(
      Math.abs(artifact.luma.mean - metrics.mean) <= 0.001,
      `${fileName} receipt mean luma must match rendered bytes`,
    );
    assert.ok(
      Math.abs(artifact.luma.belowEightFraction - metrics.belowEightFraction) <= 0.000001,
      `${fileName} receipt dark-pixel fraction must match rendered bytes`,
    );
    assert.ok(
      Math.abs(artifact.luma.above247Fraction - metrics.above247Fraction) <= 0.000001,
      `${fileName} receipt upper-clipping fraction must match rendered bytes`,
    );
    assert.equal(artifact.luma.p5, metrics.p5, `${fileName} p5 luma`);
    assert.equal(artifact.luma.p95, metrics.p95, `${fileName} p95 luma`);
    assert.equal(
      artifact.luma.p5P95Spread,
      metrics.p5P95Spread,
      `${fileName} p5/p95 contrast spread`,
    );
    assert.ok(
      metrics.mean >= limits.minimumMean,
      `${fileName} mean luma ${metrics.mean.toFixed(2)} is below `
        + `${limits.minimumMean} for its evidence intent`,
    );
    assert.ok(
      metrics.belowEightFraction <= limits.maximumBelowEight,
      `${fileName} has ${(metrics.belowEightFraction * 100).toFixed(1)}% pixels below luma 8; `
        + `maximum is ${(limits.maximumBelowEight * 100).toFixed(1)}%`,
    );
    assert.ok(
      metrics.above247Fraction <= limits.maximumAbove247Fraction,
      `${fileName} has ${(metrics.above247Fraction * 100).toFixed(1)}% clipped highlights; `
        + `maximum is ${(limits.maximumAbove247Fraction * 100).toFixed(1)}%`,
    );
    assert.ok(
      metrics.p5P95Spread >= limits.minimumP5P95Spread,
      `${fileName} p5/p95 spread ${metrics.p5P95Spread} is below `
        + `${limits.minimumP5P95Spread}`,
    );
    assert.deepEqual(
      lumaEligibilityFailures(metrics, limits),
      [],
      `${fileName} independent content eligibility`,
    );
  }
});
