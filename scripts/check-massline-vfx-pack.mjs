/**
 * Structural + unit verification for Top-50 rank-2 massline VFX pack.
 * Drives real shipped symbols from src/render/vfx.js and energyMaterials.js
 * (no re-implementation of ribbon math).
 *
 * Usage: node scripts/check-massline-vfx-pack.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMasslineRibbonMaterial, updateEnergyMaterial } from '../src/render/energy/energyMaterials.js';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX_PATH = resolve(ROOT, 'src/render/vfx.js');
const OUT_DIR = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(ROOT, '.devshots/slice-A/massline_vfx_verify.json');

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// --- Verify cycle evidence (10 cycles against shipped source) ---
const src = readFileSync(VFX_PATH, 'utf8');

// Drive the real break handler through the same retained cable identities used by the renderer.
// These probes deliberately cover both ordinary and remote cables: a player-centered implementation
// can look correct in the common case while burying remote sparks deep inside large source geometry.
const EPSILON = 1e-9;
const almostEqual = (a, b) => Math.abs(a - b) <= EPSILON;
const samePoint = (a, b) => !!(a && b)
  && almostEqual(a.x, b.x) && almostEqual(a.z, b.z);

function visualRadius(entity) {
  const data = entity && entity.data || {};
  if (entity && entity.type === 'station') {
    const explicit = Number(data.masslineRadius);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(24, explicit);
    for (const value of [data.visualRadius, data.stationRadius, data.placeRadius, data.dockRadius, entity.radius]) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return Math.max(24, n * 0.62);
    }
    return 24;
  }
  for (const value of [
    data.masslineRadius, data.visualRadius, data.dockRadius, data.stationRadius,
    data.placeRadius, entity && entity.radius,
  ]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(3.5, n);
  }
  return 4;
}

function expectedCableEndpoints(source, target, remote) {
  let ax;
  let az;
  if (remote) {
    const sourceDx = target.pos.x - source.pos.x;
    const sourceDz = target.pos.z - source.pos.z;
    const sourceDistance = Math.hypot(sourceDx, sourceDz);
    if (!(sourceDistance > EPSILON)) return null;
    ax = source.pos.x + (sourceDx / sourceDistance) * visualRadius(source) * 0.88;
    az = source.pos.z + (sourceDz / sourceDistance) * visualRadius(source) * 0.88;
  } else {
    ax = source.pos.x + Math.cos(source.rot || 0) * (source.radius || 6);
    az = source.pos.z + Math.sin(source.rot || 0) * (source.radius || 6);
  }
  const targetDx = target.pos.x - ax;
  const targetDz = target.pos.z - az;
  const targetDistance = Math.hypot(targetDx, targetDz);
  if (!(targetDistance > EPSILON)) return null;
  const bx = target.pos.x - (targetDx / targetDistance) * visualRadius(target) * 0.88;
  const bz = target.pos.z - (targetDz / targetDistance) * visualRadius(target) * 0.88;
  if (!(Math.hypot(bx - ax, bz - az) > EPSILON)) return null;
  return { source: { x: ax, z: az }, target: { x: bx, z: bz } };
}

function runBreakProbe({
  player,
  source = player,
  target,
  remote = false,
  burst = 1,
  attachmentId = 'attachment-live',
  receipt = {},
  extraEntities = [],
}) {
  const entities = new Map([player, source, target, ...extraEntities].map((entity) => [entity.id, entity]));
  const harness = Object.create(vfx);
  harness._scene = {};
  harness.state = { playerId: player.id };
  harness.helpers = { player: () => player };
  harness._tetherCable = {
    fade: 1,
    snapAge: 999,
    latchAge: 1,
    fadeRate: 0,
    wasActive: true,
    lastSourceId: source.id,
    lastTargetId: target.id,
    lastAttachmentId: attachmentId,
    lastRemote: remote,
    endpointScratch: {},
  };
  harness._burst = burst;
  harness._c0 = new THREE.Color();
  harness._c1 = new THREE.Color();
  const calls = { juice: [], particles: [], sprites: [], lights: [] };
  harness._emitJuiceCue = (...args) => calls.juice.push(args);
  harness._ent = (id) => entities.get(id) || null;
  harness._spawnParticle = (...args) => calls.particles.push({ x: args[0], z: args[1], args });
  harness._spawnSprite = (...args) => calls.sprites.push({ x: args[1], y: args[2], z: args[3], args });
  harness._flashLight = (...args) => calls.lights.push({ x: args[0].x, z: args[0].z, args });
  const retainedBefore = {
    sourceId: harness._tetherCable.lastSourceId,
    targetId: harness._tetherCable.lastTargetId,
    attachmentId: harness._tetherCable.lastAttachmentId,
    remote: harness._tetherCable.lastRemote,
    fade: harness._tetherCable.fade,
    wasActive: harness._tetherCable.wasActive,
  };
  const handled = harness._onTetherSnap({ targetId: target.id, attachmentId, ...receipt });
  return { harness, calls, handled, retainedBefore };
}

function countAtEndpoint(points, endpoint) {
  return points.filter((point) => samePoint(point, endpoint)).length;
}

function pointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const px = point.x - start.x;
  const pz = point.z - start.z;
  const cross = px * dz - pz * dx;
  const dot = px * dx + pz * dz;
  const lengthSquared = dx * dx + dz * dz;
  return Math.abs(cross) <= EPSILON && dot >= -EPSILON && dot <= lengthSquared + EPSILON;
}

const player = { id: 'player', type: 'ship', pos: { x: 0, z: 0 }, rot: 0, radius: 9 };
const largeTarget = {
  id: 'large-target', type: 'station', pos: { x: 220, z: 0 }, rot: Math.PI,
  radius: 18, data: { visualRadius: 80 },
};
const ordinaryEndpoints = expectedCableEndpoints(player, largeTarget, false);
const qualityCases = [
  { name: 'low', burst: 0.55, expected: 14 },
  { name: 'medium', burst: 0.8, expected: 18 },
  { name: 'high', burst: 1, expected: 22 },
].map((quality) => {
  const probe = runBreakProbe({ player, target: largeTarget, burst: quality.burst });
  const counts = [
    countAtEndpoint(probe.calls.particles, ordinaryEndpoints.source),
    countAtEndpoint(probe.calls.particles, ordinaryEndpoints.target),
  ];
  const aligned = probe.calls.particles.every((particle) => (
    samePoint(particle, ordinaryEndpoints.source) || samePoint(particle, ordinaryEndpoints.target)
  ));
  const ok = probe.handled === true && aligned && counts.every((count) => count === quality.expected);
  assert(ok, `${quality.name} break budget must emit ${quality.expected} aligned particles per end, got ${counts}`);
  return { ...quality, counts, aligned, ok };
});

const remotePlayer = { id: 'remote-controller', type: 'ship', pos: { x: -500, z: 80 }, rot: 0, radius: 7 };
const remoteSource = {
  id: 'remote-source', type: 'station', pos: { x: 0, z: 0 }, radius: 20,
  data: { masslineRadius: 70 },
};
const remoteTarget = {
  id: 'remote-target', type: 'station', pos: { x: 320, z: 0 }, radius: 22,
  data: { masslineRadius: 90 },
};
const remoteEndpoints = expectedCableEndpoints(remoteSource, remoteTarget, true);
const remoteProbe = runBreakProbe({
  player: remotePlayer, source: remoteSource, target: remoteTarget, remote: true, burst: 1,
});
const remoteParticleCounts = [
  countAtEndpoint(remoteProbe.calls.particles, remoteEndpoints.source),
  countAtEndpoint(remoteProbe.calls.particles, remoteEndpoints.target),
];
const remoteParticlesAligned = remoteProbe.calls.particles.every((particle) => (
  samePoint(particle, remoteEndpoints.source) || samePoint(particle, remoteEndpoints.target)
));
const endpointSprites = remoteProbe.calls.sprites.filter((sprite) => !almostEqual(sprite.y, 1.5));
const recoilSprites = remoteProbe.calls.sprites.filter((sprite) => almostEqual(sprite.y, 1.5));
const remoteEffectsAligned = remoteParticlesAligned
  && endpointSprites.length === 4
  && endpointSprites.every((sprite) => (
    samePoint(sprite, remoteEndpoints.source) || samePoint(sprite, remoteEndpoints.target)
  ))
  && remoteProbe.calls.lights.length === 2
  && remoteProbe.calls.lights.every((light) => (
    samePoint(light, remoteEndpoints.source) || samePoint(light, remoteEndpoints.target)
  ))
  && recoilSprites.length > 0
  && recoilSprites.every((sprite) => pointOnSegment(sprite, remoteEndpoints.source, remoteEndpoints.target));
assert(remoteProbe.handled === true && remoteParticleCounts.every((count) => count === 22)
  && remoteEffectsAligned,
  'remote break must align recoil, sparks, sprites, and lights to large source/target surfaces');

const unrelatedTarget = { id: 'unrelated-target', type: 'ship', pos: { x: 80, z: 40 }, radius: 6 };
const unrelatedAttachmentProbe = runBreakProbe({
  player,
  target: largeTarget,
  receipt: { targetId: largeTarget.id, attachmentId: 'attachment-unrelated' },
});
const unrelatedTargetProbe = runBreakProbe({
  player,
  target: largeTarget,
  extraEntities: [unrelatedTarget],
  receipt: { targetId: unrelatedTarget.id, attachmentId: 'attachment-live' },
});
const ignoredWithoutMutation = (probe) => {
  const retainedAfter = {
    sourceId: probe.harness._tetherCable.lastSourceId,
    targetId: probe.harness._tetherCable.lastTargetId,
    attachmentId: probe.harness._tetherCable.lastAttachmentId,
    remote: probe.harness._tetherCable.lastRemote,
    fade: probe.harness._tetherCable.fade,
    wasActive: probe.harness._tetherCable.wasActive,
  };
  return probe.handled === false
    && JSON.stringify(retainedAfter) === JSON.stringify(probe.retainedBefore)
    && Object.values(probe.calls).every((entries) => entries.length === 0);
};
const unrelatedIgnored = ignoredWithoutMutation(unrelatedAttachmentProbe)
  && ignoredWithoutMutation(unrelatedTargetProbe);
assert(unrelatedIgnored, 'unrelated break must preserve the retained cable and emit no presentation');

const coincidentTarget = { id: 'coincident-target', type: 'ship', pos: { x: 9, z: 0 }, radius: 5 };
const coincidentProbe = runBreakProbe({ player, target: coincidentTarget });
const coincidentSafe = coincidentProbe.handled === true
  && coincidentProbe.calls.juice.length === 1
  && coincidentProbe.calls.particles.length === 0
  && coincidentProbe.calls.sprites.length === 0
  && coincidentProbe.calls.lights.length === 0;
assert(coincidentSafe, 'coincident visible endpoints must not double-emit the same break burst');

const breakDualEndBounded = qualityCases.every((quality) => quality.ok)
  && remoteParticleCounts.every((count) => count >= 14 && count <= 22)
  && remoteEffectsAligned && unrelatedIgnored && coincidentSafe;

const cycles = [
  { id: 1, name: 'subscribes tether:attached', re: /tether:attached.*_onTetherLatch/s },
  { id: 2, name: 'subscribes tether:broken', re: /tether:broken.*_onTetherSnap/s },
  { id: 3, name: 'init cable ribbon materials', re: /createMasslineRibbonMaterial/ },
  { id: 4, name: 'update cable strain/load color', re: /_updateTetherCable/ },
  { id: 5, name: 'whip wave after latch', re: /whipAmp|whipEnv|whipT/ },
  { id: 6, name: 'latch dual-end flash', re: /_onTetherLatch[\s\S]{0,800}noseR/ },
  { id: 7, name: 'break identities, endpoint alignment, and bounded dual-end sparks', ok: breakDualEndBounded },
  { id: 8, name: 'arc preview path', re: /_arcPreview|_updateArcPreview/ },
  { id: 9, name: 'reel glow presentation', re: /reelGlow/ },
  { id: 10, name: 'setTetherCableVisible used', re: /setTetherCableVisible/ },
];

const cycleResults = cycles.map((c) => {
  const ok = c.ok ?? c.re.test(src);
  assert(ok, `verify cycle ${c.id} failed: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

// --- Drive real massline material API ---
const mat = createMasslineRibbonMaterial({
  name: 'sf-test-massline',
  color: 0x39d0ff,
  intensity: 5.0,
  opacity: 0.7,
  pulseSpeed: 3.0,
});
assert(!!mat, 'createMasslineRibbonMaterial returned falsy');
assert(typeof mat === 'object', 'material is object');
// updateEnergyMaterial must accept ribbon frame used by vfx._updateTetherCable
try {
  updateEnergyMaterial(mat, {
    time: 1.25,
    color: { r: 0.22, g: 0.81, b: 1.0 },
    tension: 0.6,
    overload: false,
    reel: 0.2,
    pulseSpeed: 3.2,
    intensity: 6.0,
    opacity: 0.65,
  });
} catch (e) {
  assert(false, `updateEnergyMaterial threw: ${e.message}`);
}

// Stronger whip constants present (Top-50 rank-2 pass)
assert(/whipT \/ 0\.55/.test(src) || /0\.55/.test(src) && /whipEnv/.test(src), 'whip duration ~0.55 present');
assert(/chord \* 0\.28/.test(src) || /0\.28/.test(src), 'stronger whip amplitude constant present');

// Latch remains punchy; break is dual-ended but bounded so it cannot starve the recoil presentation.
assert(/Math\.max\(12, Math\.round\(20/.test(src), 'latch particle count elevated');
assert(breakDualEndBounded,
  'break presentation must preserve retained identity and align bounded effects to both visible endpoints');

mkdirSync(OUT_DIR, { recursive: true });
const report = {
  schema: 'spaceface.masslineVfxVerify.v1',
  pack: 'massline_vfx',
  rank: 2,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  materialApiOk: failures.length === 0 || !failures.some((f) => f.includes('material') || f.includes('updateEnergy')),
  breakEndpoints: {
    ordinary: {
      expected: ordinaryEndpoints,
      qualityCases,
    },
    remote: {
      expected: remoteEndpoints,
      counts: remoteParticleCounts,
      aligned: remoteEffectsAligned,
    },
    unrelatedIgnored,
    coincidentSafe,
  },
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));

// Marker stills (structural proof files for slice-A gate inventory)
const marker = resolve(OUT_DIR, 'massline-latch-note.txt');
writeFileSync(marker, [
  'Massline VFX pack (rank 2) — structural verify',
  `cycles: ${report.cyclesPassed}/10`,
  `ok: ${report.ok}`,
  'States covered in code: attach/latch, taut/load color, reel glow, whip, break/snap, arc preview',
  'In-game pixels require flight session; this check gates shipped source paths.',
].join('\n'));

if (!report.ok) {
  console.error('check-massline-vfx-pack FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
