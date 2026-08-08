// Massline render acceptance check.
//
// This retains the existing telemetry arc-preview proof and adds the ordinary-release handoff:
// a captured world annulus, paired cable-end recoil, and a real-velocity structural streak. The
// check uses real THREE pools and the real tetherGameplay cut ordering; diagnostics are supporting
// evidence only and never substitute for resident pool assertions.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { vfx } from '../src/render/vfx.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

assertVisibleAndAimedWhenViable();
assertLengthScalesWithPeakSpeed();
assertHiddenWhenNotViable();
assertHiddenWhenNoPreviewOrNoTether();
assertCosmeticOnly();
assertRealOrdinaryCutOrderAndResidentPoolTruth();
assertReleasePairingAndDestinationLifecycle();
assertCapturedReleaseAnnulusAndStaticReducedMotion();

console.log('Massline arc-preview render checks OK');

function createHarness({
  tether, arcPreview, throwState, motionReduce = false, flashReduce = false,
} = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, radius: 6, mass: 40,
    data: {},
  };
  const target = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 96, z: 24 }, vel: { x: 72, z: 36 }, rot: 0, radius: 8, mass: 45,
    data: {},
  };
  const destination = {
    id: 3, type: 'station', alive: true,
    pos: { x: 220, z: -90 }, vel: { x: 0, z: 0 }, rot: 0, radius: 18, mass: 900,
    data: {},
  };
  const listeners = new Map();
  const bus = {
    on(name, fn) {
      let list = listeners.get(name);
      if (!list) { list = []; listeners.set(name, list); }
      list.push(fn);
      return () => {
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
  const state = {
    mode: 'flight',
    tick: 60,
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target], [destination.id, destination]]),
    entityList: [player, target, destination],
    simTime: 1,
    settings: {
      video: { particleQuality: 'high', motionReduce, flashReduce },
      accessibility: { flashReduce },
    },
    render: { scene },
    massline2: throwState ? { throw: throwState } : {},
    runtime: { features: { massline2: { enabled: true } } },
    input: {
      aimWorld: { x: target.pos.x, z: target.pos.z },
      aimIntentActive: false,
      actions: {
        tetherFire: false,
        tetherCut: false,
        reelDelta: 0,
        massline: { cut: false, lineControl: false, lineLength: 0 },
      },
    },
    player: {
      tether: tether !== undefined ? tether
        : { active: true, targetId: 2, strain: 0.3, load: 0.75, restLength: 90, phase: 'loaded' },
      masslineTelemetry: {
        active: true,
        tangentialSpeed: 60,
        arcPreview: arcPreview !== undefined ? arcPreview
          : { peakSpeed: 90, exitAngle: 0, exitSpeed: 60, timeToWhip: 0, viable: true },
      },
    },
  };
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  return { system, state, player, target, destination, bus };
}

function frames(h, n) {
  for (let i = 0; i < n; i += 1) h.system.update(DT);
}

// Far tip of the last dash along +x (exitAngle 0): the ribbon's reach.
function tipX(h) {
  const posArr = h.system._arcPreview.mesh.geometry.attributes.position.array;
  const last = (h.system._arcPreview.DASHES - 1) * 12;
  return posArr[last + 6]; // x of the dash-end vertex
}

// 1. Tethered + viable: the arc mesh exists, becomes visible, aims along the exit vector, and is
//    genuinely dashed (a gap between consecutive dashes).
function assertVisibleAndAimedWhenViable() {
  const h = createHarness();
  frames(h, 10);
  const arc = h.system._arcPreview;
  assert.ok(arc && arc.mesh, 'arc-preview object must exist after init');
  assert.equal(arc.mesh.visible, true, 'viable swing must show the arc preview');
  assert.ok(arc.mesh.material.opacity > 0.05, `visible arc must have real opacity; got ${arc.mesh.material.opacity}`);

  const posArr = arc.mesh.geometry.attributes.position.array;
  // exitAngle 0 -> ribbon extends +x from just off the hull (radius 6 + 2), on the vfx plane.
  assert.ok(Math.abs(posArr[0] - 8) < 1.5, `first dash must start off the hull; x=${posArr[0]}`);
  assert.ok(Math.abs(posArr[2]) < 1.5, `+x ray keeps z near 0; z=${posArr[2]}`);
  assert.ok(tipX(h) > 40, `ribbon must reach forward; tip=${tipX(h)}`);
  // Dashed: dash 1 starts beyond dash 0's end (a real gap).
  const dash0End = posArr[6];
  const dash1Start = posArr[12];
  assert.ok(dash1Start > dash0End + 0.5, `dashes must have gaps; d0end=${dash0End} d1start=${dash1Start}`);
}

// 2. Length is scaled to peakSpeed: a hotter swing draws a longer throw.
function assertLengthScalesWithPeakSpeed() {
  const slow = createHarness({ arcPreview: { peakSpeed: 40, exitAngle: 0, exitSpeed: 40, timeToWhip: 0, viable: true } });
  frames(slow, 10);
  const fast = createHarness({ arcPreview: { peakSpeed: 130, exitAngle: 0, exitSpeed: 90, timeToWhip: 0, viable: true } });
  frames(fast, 10);
  assert.ok(tipX(fast) > tipX(slow) + 30,
    `arc length must scale with peakSpeed; fast=${tipX(fast)} slow=${tipX(slow)}`);
}

// 3. Same swing but not viable: the arc must hide (after the short fade envelope).
function assertHiddenWhenNotViable() {
  const h = createHarness();
  frames(h, 10);
  assert.equal(h.system._arcPreview.mesh.visible, true, 'precondition: visible while viable');
  h.state.player.masslineTelemetry.arcPreview.viable = false;
  frames(h, 30); // fade-out envelope (~1/6 s) + margin
  assert.equal(h.system._arcPreview.mesh.visible, false, 'non-viable preview must hide the arc');
}

// 4. No preview data (cleared by telemetry) or no tether: hidden.
function assertHiddenWhenNoPreviewOrNoTether() {
  const noPreview = createHarness({ arcPreview: null });
  frames(noPreview, 10);
  assert.equal(noPreview.system._arcPreview.mesh.visible, false, 'null arcPreview must render nothing');

  const noTether = createHarness({ tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' } });
  frames(noTether, 10);
  assert.equal(noTether.system._arcPreview.mesh.visible, false, 'inactive tether must render nothing');
}

// 5. Cosmetic-only: the render pass must not write the sim-owned subtrees it reads.
function assertCosmeticOnly() {
  const h = createHarness();
  const tetherBefore = JSON.stringify(h.state.player.tether);
  const telemetryBefore = JSON.stringify(h.state.player.masslineTelemetry);
  const velBefore = JSON.stringify(h.player.vel);
  frames(h, 20);
  assert.equal(JSON.stringify(h.state.player.tether), tetherBefore, 'render must not write tether');
  assert.equal(JSON.stringify(h.state.player.masslineTelemetry), telemetryBefore, 'render must not write telemetry');
  assert.equal(JSON.stringify(h.player.vel), velBefore, 'render must not steer the player');
}

// 6. Drive the production attachment cut through the production tetherGameplay update. The
//    low-level `tether:broken(tether_cut)` arrives synchronously before released/rated, so the VFX
//    consumer must ignore its violent snap grammar and admit exactly two recoil residents followed
//    by a retained-velocity streak. A saturated streak pool must evict ambient work for that cue.
function assertRealOrdinaryCutOrderAndResidentPoolTruth() {
  const h = createHarness({ throwState: capturedThrowState() });
  const catalog = createCombatCatalog();
  ensureCombatState(h.state);
  const physics = {
    createAttachment() { return { id: 'joint-release-order' }; },
    cutAttachment() { return true; },
    setAttachmentReel(spec) { return { restLength: spec.restLength }; },
    getAttachmentTelemetry() {
      return {
        restLength: 99, distance: 99, stretch: 0, relativeSpeed: 0,
        tension: 0, impulse: 0, yank: 0,
      };
    },
  };
  // The attachment authority publishes only the physical break receipt on this proxy. Gameplay
  // owns the semantic released/rated pair on the shared presentation bus below.
  const attachmentBus = {
    emit(name, payload) {
      if (name === 'tether:broken') h.bus.emit(name, payload);
    },
  };
  const attachments = createAttachmentService({
    state: h.state, catalog, helpers: { combatPhysics: physics }, bus: attachmentBus,
  });
  const kernel = { attachments, catalog };
  const gameplay = Object.create(tetherGameplay);
  gameplay.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: {
      get(name) { return name === 'actions' || name === 'combat' ? { kernel } : null; },
    },
  });
  const presentation = attachPresentationPipeline(h);
  const created = attachments.create({
    defId: 'tether_standard', ownerId: h.player.id, targetId: h.target.id,
  });
  assert.equal(created.ok, true, `precondition: real attachment create (${created.reason || 'ok'})`);

  gameplay.update(DT, h.state); // adopt and mirror the real attachment before the cut tick
  frames(h, 1);                 // cache its exact rendered endpoints/identity
  const baselineSprites = h.system._liveSpriteCount;
  const baselineParticles = h.system._liveCount;
  const baselineLights = h.system._activeLightCount;
  const baselineStreaks = h.system._liveTrailStreakCount;
  const baselineSnapAge = h.system._tetherCable.snapAge;
  const firstReleaseSerial = h.system._admissionSerial;
  const observed = [];
  for (const name of ['tether:broken', 'tether:cut', 'tether:released', 'tether:releaseRated']) {
    h.bus.on(name, (payload) => observed.push({
      name,
      reason: payload && payload.reason,
      sprites: h.system._liveSpriteCount,
      particles: h.system._liveCount,
      lights: h.system._activeLightCount,
      streaks: h.system._liveTrailStreakCount,
      snapAge: h.system._tetherCable.snapAge,
      stage: h.system._lastMasslineReleaseVfx.stage,
    }));
  }

  h.state.tick += 1;
  h.state.simTime = h.state.tick * DT;
  h.state.player.masslineTelemetry = {
    active: true,
    targetId: h.target.id,
    strain: 0.65,
    tangentialSpeed: 75,
    radialSpeed: 25,
    angularSpeed: 0.5,
    distance: 99,
    restLength: 99,
    playerSpeed: 60,
    maxStrainSinceLatch: 0.65,
    maxTangentialSpeedSinceLatch: 75,
    maxAngularSpeedSinceLatch: 0.5,
  };
  h.state.input.actions.massline.cut = true;
  gameplay.update(DT, h.state);

  assert.deepEqual(observed.map((event) => event.name), [
    'tether:broken', 'tether:cut', 'tether:released', 'tether:releaseRated',
  ], 'the real ordinary-cut route keeps physical break before semantic release and rating');
  const broken = observed[0];
  assert.equal(broken.reason, 'tether_cut');
  assert.equal(broken.sprites, baselineSprites,
    'the low-level ordinary-cut receipt must not emit the violent snap pool');
  assert.equal(broken.snapAge, baselineSnapAge,
    'ordinary release never starts the break-only cable whip');

  const recoil = h.system._spr.filter((slot) => slot.alive
    && slot.admissionSerial >= firstReleaseSerial
    && Math.abs(slot.admissionPriority - 0.88) < 1e-9);
  assert.equal(recoil.length, 2, 'ordinary release owns exactly two admitted endpoint sprites');
  assert.ok(recoil.every((slot) => slot.kind === 0 && slot.aspect > 3),
    'both residents are anisotropic structural flashes, not generic circular cards');
  const endpoints = h.system._tetherCable.endpointScratch;
  const ux = (endpoints.bx - endpoints.ax) / endpoints.chord;
  const uz = (endpoints.bz - endpoints.az) / endpoints.chord;
  const along = recoil.map((slot) => slot.vx * ux + slot.vz * uz).sort((a, b) => a - b);
  assert.ok(Math.abs(along[0] + 18) < 1e-6 && Math.abs(along[1] - 18) < 1e-6,
    `recoil residents separate along opposed cable directions (${along.join(', ')})`);
  assert.equal(h.system._lastMasslineReleaseVfx.stage, 'rated');
  assert.equal(h.system._lastMasslineReleaseVfx.classification, 'clean');
  assert.equal(h.system._lastMasslineReleaseVfx.cameraTargetRequested, false);
  const rated = observed.at(-1);
  assert.equal(rated.particles, baselineParticles,
    'the normalized clean-release cue must not add a generic particle burst');
  assert.equal(rated.lights, baselineLights,
    'the normalized clean-release cue must not add a generic event light');
  assert.equal(rated.sprites, baselineSprites + 2,
    'only the paired direct endpoint residents enter the sprite pool');
  assert.equal(rated.streaks, baselineStreaks + 1,
    'only the actual-velocity handoff enters the structural streak pool');
  assert.equal(countBy(presentation.cues, 'id', 'tether.release.clean'), 1,
    'camera/audio/UI/accessibility retain the normalized clean-release cue');
  assert.equal(countBy(presentation.vfx, 'id', 'tether.release.clean'), 1,
    'the adapter may publish its routed receipt; the VFX owner suppresses generic fan-out');
  assert.equal(presentation.cues.some((cue) => cue && cue.id === 'tether.break'), false,
    'ordinary release must not enter the semantic break recipe');
  assert.equal(presentation.vfx.some((cue) => cue && cue.id === 'tether.break'), false);
  assert.equal(presentation.camera.some((cue) => cue && cue.id === 'tether.break'), false);
  assert.equal(presentation.audio.some((cue) => cue && cue.cueId === 'tether.break'), false);
  assert.equal(presentation.ui.some((cue) => cue && cue.cueId === 'tether.break'), false);
  assert.equal(presentation.captions.some((cue) => cue && cue.id === 'tether.break'), false);
  presentation.dispose();

  const saturated = createHarness({ throwState: capturedThrowState() });
  frames(saturated, 2);
  while (saturated.system._freeTrailStreakCount > 0) {
    saturated.system._spawnProjectileTrailStreak(
      0, 0.1, 0, 2, 0.08, 1.2, 0.2, '#405060', 0, 0, 1, 0, 0.1,
    );
  }
  assert.equal(saturated.system._freeTrailStreakCount, 0, 'precondition: streak pool is saturated');
  saturated.bus.emit('tether:released', { targetId: saturated.target.id });
  const ratedSerial = saturated.system._admissionSerial;
  saturated.bus.emit('tether:releaseRated', releaseRating(saturated));
  const hero = saturated.system._ts.find((slot) => slot.alive
    && slot.admissionSerial >= ratedSerial
    && slot.admissionPriority > 0.9);
  assert.ok(hero, 'player release streak must evict saturated ambient residents');
  const speed = Math.hypot(saturated.target.vel.x, saturated.target.vel.z);
  assert.ok(Math.abs(hero.ax - saturated.target.vel.x / speed) < 1e-9);
  assert.ok(Math.abs(hero.az - saturated.target.vel.z / speed) < 1e-9);
  assert.equal(saturated.system._liveTrailStreakCount, saturated.system._ts.length,
    'priority admission preserves the fixed pool bound');

  const failed = createHarness({ throwState: capturedThrowState() });
  frames(failed, 2);
  const failedPresentation = attachPresentationPipeline(failed);
  failed.bus.emit('tether:broken', {
    actorId: failed.player.id,
    targetId: failed.target.id,
    reason: 'physics_break',
    tension: 12,
    impulse: 9,
  });
  assert.equal(countBy(failedPresentation.cues, 'id', 'tether.break'), 1,
    'a real physical failure retains exactly one semantic break recipe');
  assert.equal(countBy(failedPresentation.vfx, 'id', 'tether.break'), 1);
  assert.equal(countBy(failedPresentation.camera, 'id', 'tether.break'), 1);
  assert.equal(countBy(failedPresentation.audio, 'cueId', 'tether.break'), 1);
  assert.equal(countBy(failedPresentation.ui, 'cueId', 'tether.break'), 1);
  assert.equal(countBy(failedPresentation.captions, 'id', 'tether.break'), 1);
  failedPresentation.dispose();
}

// 7. Ratings are single-use children of one exact successful release. Orphans, mismatches, breaks,
//    missing captured destinations, and lifecycle boundaries cannot resurrect a stale annulus.
function assertReleasePairingAndDestinationLifecycle() {
  const paired = createHarness({ throwState: capturedThrowState() });
  frames(paired, 2);
  paired.bus.emit('tether:released', null);
  paired.bus.emit('tether:released', {});
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'idle');
  assert.equal(paired.system._masslineReleaseToken.active, false,
    'missing or identity-free release payloads cannot arm a cached-cable transaction');
  paired.bus.emit('tether:releaseRated', releaseRating(paired));
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'idle',
    'an orphan rating cannot manufacture a release');

  paired.bus.emit('tether:released', { targetId: paired.target.id });
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'release');
  paired.bus.emit('tether:releaseRated', { ...releaseRating(paired), sourceId: 'wrong-source' });
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'release');
  assert.equal(paired.system._masslineReleaseToken.active, false,
    'an identity mismatch consumes the token rather than leaving a replay window');
  paired.bus.emit('tether:releaseRated', releaseRating(paired));
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'release',
    'the consumed transaction cannot later accept a corrected orphan');

  paired.bus.emit('tether:released', { targetId: paired.target.id });
  paired.state.tick += 1;
  paired.state.simTime = paired.state.tick * DT;
  paired.bus.emit('tether:releaseRated', releaseRating(paired));
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'release');
  assert.equal(paired.system._masslineReleaseToken.active, false,
    'a delayed same-identity rating cannot consume a later tick as the original release');

  paired.bus.emit('tether:released', { targetId: paired.target.id });
  paired.bus.emit('tether:releaseRated', releaseRating(paired));
  assert.equal(paired.system._lastMasslineReleaseVfx.stage, 'rated');
  assert.ok(paired.system._masslineReleaseArc.ratingLife > 0,
    'one exact pair may retain the captured destination echo');

  paired.bus.emit('tether:broken', {
    actorId: paired.player.id,
    targetId: paired.target.id,
    reason: 'physics_break',
  });
  assert.equal(paired.system._masslineReleaseToken.active, false);
  assert.equal(paired.system._masslineReleaseArc.ratingLife, 0);
  assert.equal(Number.isFinite(paired.system._masslineReleaseArc.postTarget.pos.x), false);
  paired.bus.emit('tether:releaseRated', releaseRating(paired));
  assert.equal(paired.system._masslineReleaseArc.ratingLife, 0,
    'a later break rating cannot reuse the previous captured destination');

  const noDestination = createHarness();
  frames(noDestination, 2);
  noDestination.bus.emit('tether:released', { targetId: noDestination.target.id });
  const streakSerial = noDestination.system._admissionSerial;
  noDestination.bus.emit('tether:releaseRated', releaseRating(noDestination));
  assert.equal(noDestination.system._lastMasslineReleaseVfx.stage, 'rated',
    'actual retained velocity still owns the handoff without a destination');
  assert.ok(noDestination.system._ts.some((slot) => slot.alive
    && slot.admissionSerial >= streakSerial), 'the real-velocity marker still enters its pool');
  assert.equal(noDestination.system._masslineReleaseArc.ratingLife, 0,
    'no captured destination means no invented body-centered annulus');
  assert.equal(Number.isFinite(noDestination.system._masslineReleaseArc.postTarget.pos.x), false);

  const boundary = createHarness({ throwState: capturedThrowState() });
  frames(boundary, 2);
  boundary.bus.emit('tether:released', { targetId: boundary.target.id });
  boundary.bus.emit('tether:releaseRated', releaseRating(boundary));
  boundary.state.player.tether.active = false;
  frames(boundary, 1);
  assert.equal(boundary.system._masslineReleaseArc.mesh.visible, true,
    'precondition: a valid paired release owns a visible echo');
  boundary.bus.emit('save:loaded', {});
  assert.equal(boundary.system._masslineReleaseArc.mesh.visible, false);
  assert.equal(boundary.system._masslineReleaseArc.mesh.geometry.drawRange.count, 0);
  assert.equal(boundary.system._masslineReleaseToken.active, false,
    'save boundaries drain both geometry and transaction identity');
}

// 8. The new world annulus consumes the captured releaseTarget rather than the mutable gun target,
//    reuses one geometry allocation, and freezes (rather than vanishing) under reduced motion.
function assertCapturedReleaseAnnulusAndStaticReducedMotion() {
  const h = createHarness({ throwState: capturedThrowState() });
  const positions = h.system._masslineReleaseArc.scratch.geometry.positions;
  frames(h, 4);
  const arc = h.system._masslineReleaseArc;
  assert.equal(arc.mesh.visible, true);
  assert.equal(arc.scratch.plan.stage, 'approaching');
  assert.equal(arc.scratch.plan.targetId, h.destination.id);
  assert.equal(arc.scratch.plan.centerX, h.destination.pos.x);
  assert.equal(arc.scratch.plan.centerZ, h.destination.pos.z);
  assert.ok(arc.mesh.geometry.drawRange.count > 0);

  h.state.settings.video.motionReduce = true;
  frames(h, 2);
  assert.equal(arc.scratch.geometry.positions, positions, 'the annulus must reuse its position pool');
  assert.equal(arc.scratch.plan.reducedMotion, true);
  assert.equal(arc.scratch.plan.cadenceHz, 0, 'reduced motion keeps a static spatial marker');

  h.state.settings.video.motionReduce = false;
  h.state.settings.video.flashReduce = true;
  frames(h, 2);
  assert.equal(arc.scratch.plan.reducedMotion, false);
  assert.equal(arc.scratch.plan.reducedFlash, true);
  assert.equal(arc.scratch.plan.cadenceHz, 0,
    'reduced flash freezes the annulus instead of leaving a low-opacity strobe');

  h.bus.emit('tether:released', { targetId: h.target.id });
  h.bus.emit('tether:releaseRated', {
    targetId: h.target.id,
    sourceId: h.player.id,
    classification: 'razor',
    releaseScore: 0.9,
  });
  h.state.player.tether.active = false;
  frames(h, 2);
  assert.equal(arc.scratch.plan.stage, 'released');
  assert.equal(arc.scratch.plan.quality, 'razor');
  assert.equal(arc.scratch.plan.targetId, h.destination.id,
    'the rated echo stays at the captured consequence target while velocity handoff follows the body');
}

function capturedThrowState() {
  return {
    armed: true,
    payloadId: 2,
    releaseTarget: {
      kind: 'entity', source: 'selection', targetId: 3, pos: null, radius: 0,
    },
    solution: {
      valid: true, onSolution: false, errorRad: 0.07, tolRad: 0.02,
      timeToSolution: 0.24, predicted: { x: 221, z: -90 },
    },
  };
}

function releaseRating(h, overrides = {}) {
  return {
    targetId: h.target.id,
    sourceId: h.player.id,
    classification: 'clean',
    releaseScore: 0.75,
    radialSpeed: 12,
    tangentialSpeed: 72,
    ...overrides,
  };
}

function attachPresentationPipeline(h) {
  const orchestrator = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  orchestrator.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  const record = { cues: [], vfx: [], camera: [], audio: [], ui: [], captions: [] };
  const unsubs = [
    h.bus.on('presentation:cue', (payload) => record.cues.push(payload)),
    h.bus.on('presentation:vfxCue', (payload) => record.vfx.push(payload)),
    h.bus.on('camera:shake', (payload) => record.camera.push(payload)),
    h.bus.on('audio:cue', (payload) => record.audio.push(payload)),
    h.bus.on('presentation:uiCue', (payload) => record.ui.push(payload)),
    h.bus.on('presentation:caption', (payload) => record.captions.push(payload)),
  ];
  record.dispose = () => {
    for (const unsubscribe of unsubs) unsubscribe();
    adapters.dispose();
    orchestrator.dispose();
  };
  return record;
}

function countBy(records, key, value) {
  return records.filter((record) => record && record[key] === value).length;
}
