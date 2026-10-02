// NXB-045 clue memory and NXB-010 overlapping-field law.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { buildShipScanReveal } from '../src/data/scanReveal.js';
import {
  applyClueObservation,
  emptyClueBook,
  normalizeClueBook,
  CLUE_SUBJECT_CAP,
} from '../src/data/scanClues.js';
import {
  createFieldKernel,
  fieldRawAcceleration,
  normalizeField,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { FIELD_KINDS } from '../src/data/fields.js';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { noteFieldAnchorRing, clearFieldAnchorRings } from '../src/render/forceLanguage/fieldForcePresentation.js';

const SECRET = 'cmdty_narcotics';

function boot(seed = 214162) {
  const sim = createSimulation({ seed, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_signals';
  state.world.activeSector = { id: 'sector_test_signals', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  scanReveal.init({ state, bus });
  const courses = [];
  bus.on('ui:setCourse', (payload) => courses.push(payload));
  return { sim, state, bus, player, courses };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

test('an old shipment fix goes stale without being called a lie, and only that route moves', () => {
  const book = emptyClueBook();
  const first = applyClueObservation(book, {
    subjectId: 'shipment:lane',
    kind: 'shipment',
    claim: 'shipment on the industrial lane',
    pos: { x: 400, z: 0 },
    at: 10,
    hiddenCargo: SECRET,
    truth: 'the hold is empty',
  });
  assert.equal(first.rejected, undefined);
  assert.equal(first.hypothesis.observedAt, 10);
  const again = applyClueObservation(book, {
    subjectId: 'shipment:lane',
    kind: 'shipment',
    claim: 'shipment on the industrial lane',
    pos: { x: 410, z: 0 },
    at: 90,
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.hypothesis.observedAt, 10, 'reopening or a tiny rescan does not refresh the original time');
  assert.equal(again.hypothesis.history.length, 0);

  const moved = applyClueObservation(book, {
    subjectId: 'shipment:lane',
    kind: 'shipment',
    claim: 'shipment on the industrial lane',
    pos: { x: 800, z: 40 },
    at: 120,
  });
  assert.equal(moved.revised, true);
  assert.equal(moved.relation, 'stale');
  assert.equal(moved.hypothesis.history[0].status, 'stale');
  assert.equal(moved.hypothesis.history[0].at, 10);
  assert.deepEqual(moved.hypothesis.history[0].pos, { x: 400, z: 0 });
  assert.equal(moved.hypothesis.route.action, 'intercept');
  assert.deepEqual(moved.hypothesis.route.pos, { x: 800, z: 40 });
  assert.match(moved.playerLine, /stale/i);
  assert.doesNotMatch(`${moved.playerLine} ${moved.hypothesis.history[0].status}`, /fabricat/i);

  const other = applyClueObservation(book, {
    subjectId: 'access:berth',
    kind: 'access',
    claim: 'berth open',
    pos: { x: 10, z: 10 },
    at: 130,
  });
  const laneBefore = book.subjects['shipment:lane'].route.reason;
  applyClueObservation(book, {
    subjectId: 'access:berth',
    kind: 'access',
    claim: 'berth shut',
    relation: 'contradicted',
    pos: { x: 10, z: 10 },
    at: 140,
  });
  assert.equal(book.subjects['shipment:lane'].route.reason, laneBefore, 'the other clue keeps its route');
  assert.equal(book.subjects['access:berth'].route.action, 'hold');
  assert.equal(book.subjects['access:berth'].history[0].claim, 'berth open');
  assert.equal(other.hypothesis.route.action, 'approach');
  assert.doesNotMatch(JSON.stringify(book), new RegExp(SECRET));
  assert.doesNotMatch(JSON.stringify(book), /hold is empty/);
});

test('a contradictory later reading keeps the earlier clue and refuses hidden truth', () => {
  const book = emptyClueBook();
  applyClueObservation(book, {
    subjectId: 'manifest:7',
    claim: 'declared civilian cargo',
    reading: 'declared',
    pos: { x: 200, z: 0 },
    at: 5,
  });
  const next = applyClueObservation(book, {
    subjectId: 'manifest:7',
    claim: 'manifest mismatch',
    reading: 'conflict',
    relation: 'contradicted',
    pos: { x: 200, z: 0 },
    at: 15,
    hiddenCargo: { id: SECRET, qty: 12 },
  });
  assert.equal(next.revised, true);
  assert.equal(next.relation, 'contradicted');
  assert.equal(next.hypothesis.history.length, 1);
  assert.equal(next.hypothesis.history[0].claim, 'declared civilian cargo');
  assert.equal(next.hypothesis.history[0].status, 'contradicted');
  assert.equal(next.hypothesis.route.action, 'inspect');
  assert.notEqual(next.hypothesis.route.reason, 'Intercept the shipment on this bearing');
  for (let i = 0; i < 6; i++) {
    applyClueObservation(book, {
      subjectId: 'manifest:7',
      claim: 'manifest mismatch',
      reading: 'conflict',
      pos: { x: 200, z: 0 },
      at: 40 + i,
    });
  }
  assert.equal(book.subjects['manifest:7'].history.length, 1, 'duplicate scans do not mint more entries');
  assert.equal(book.subjects['manifest:7'].observedAt, 15);

  const leaked = applyClueObservation(book, {
    subjectId: 'manifest:secret',
    claim: SECRET,
    pos: { x: 0, z: 0 },
    at: 1,
    hiddenCargo: SECRET,
  });
  assert.equal(leaked.rejected, true);
  assert.equal(book.subjects['manifest:secret'], undefined);

  const poisoned = normalizeClueBook({
    subjects: {
      bad: {
        subjectId: 'bad', claim: 'seen once', observedAt: 1, pos: { x: 0, z: 0 },
        history: [{ claim: 'seen once', status: 'fabricated', at: 0, pos: { x: 0, z: 0 }, confidence: 0.4 }],
      },
    },
  });
  assert.equal(poisoned.subjects.bad.history[0].status, 'contradicted');
  assert.doesNotMatch(JSON.stringify(poisoned), /fabricat/i);

  const crowd = emptyClueBook();
  for (let i = 0; i < CLUE_SUBJECT_CAP + 8; i++) {
    applyClueObservation(crowd, {
      subjectId: `s${String(i).padStart(2, '0')}`,
      claim: `note ${i}`,
      pos: { x: i, z: 0 },
      at: i,
    });
  }
  assert.equal(Object.keys(crowd.subjects).length, CLUE_SUBJECT_CAP);
});

test('scanner convoy: a moved shipment retargets the course and leaves the old fix explainable', () => {
  const t = boot();
  t.state.livingPoiBehaviors = {
    activeByZone: {
      z1: {
        behaviorId: 'convoy-1',
        familyId: 'convoy_industrial_route',
        sectorId: 'sector_test_signals',
        status: 'available',
        zoneCenter: { x: 400, z: 0 },
        mapLabel: 'Industrial convoy',
        hiddenCargo: SECRET,
        contract: { objective: `${SECRET} aboard` },
      },
    },
  };
  pulse(t);
  const signalId = 'signal:living:convoy-1';
  const record = t.state.signalInvestigation.records[signalId];
  assert.ok(record, 'the industrial lane is a normal scanner return');
  t.bus.emit('signal:track', { signalId });
  assert.equal(t.courses.length, 1);
  assert.equal(t.courses[0].reason, 'Investigate ship signature');
  assert.deepEqual(t.courses[0].pos, { x: 400, z: 0 });

  t.state.livingPoiBehaviors.activeByZone.z1.zoneCenter = { x: 410, z: 0 };
  clearCooldown(t);
  pulse(t);
  assert.equal(t.courses.length, 1, 'a wobble inside the stale threshold does not retarget');
  assert.equal(t.state.signalInvestigation.clues.subjects['shipment:convoy-1'].observedAt < 8, true);

  t.state.livingPoiBehaviors.activeByZone.z1.zoneCenter = { x: 800, z: 40 };
  clearCooldown(t);
  pulse(t);
  const clue = t.state.signalInvestigation.clues.subjects['shipment:convoy-1'];
  assert.equal(clue.history.length, 1);
  assert.equal(clue.history[0].status, 'stale');
  assert.deepEqual(clue.history[0].pos, { x: 400, z: 0 });
  assert.equal(clue.history[0].claim, 'shipment on the industrial lane');
  assert.doesNotMatch(JSON.stringify(t.state.signalInvestigation.clues), new RegExp(SECRET));
  assert.match(t.state.signalInvestigation.records[signalId].detail, /stale/i);
  assert.doesNotMatch(t.state.signalInvestigation.records[signalId].detail, /fabricat/i);
  assert.equal(t.courses.length, 2);
  assert.deepEqual(t.courses[1].pos, { x: 800, z: 40 });
  assert.match(t.courses[1].reason, /stale/i);
  assert.match(t.courses[1].reason, /intercept/i);

  const saved = t.sim.registry.get('scanner').serialize();
  const restored = boot(99);
  restored.sim.registry.get('scanner').deserialize(saved);
  const kept = restored.state.signalInvestigation.clues.subjects['shipment:convoy-1'];
  assert.equal(kept.history[0].status, 'stale');
  assert.equal(kept.history[0].at, clue.history[0].at);
  assert.doesNotMatch(JSON.stringify(kept), new RegExp(SECRET));
});

test('scanner manifest: the later conflict changes the haul into an inspection and hides the real hold', () => {
  const t = boot(45);
  const smuggler = t.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_quiet',
    pos: { x: 200, z: 0 },
    radius: 8,
    hull: 40,
    hullMax: 40,
    alive: true,
    data: {
      trafficRole: 'smuggler',
      cargoHint: SECRET,
      hiddenCargo: { id: SECRET, qty: 12 },
    },
  });
  const reveal = buildShipScanReveal(smuggler, t.state, { origin: { x: 0, z: 0 }, now: 1 });
  assert.equal(reveal.cargoHint, 'declared civilian cargo');
  assert.equal(reveal.manifestTrust, 'false');
  assert.equal(reveal.hiddenCargo, undefined);

  pulse(t);
  const signalId = `signal:entity:${smuggler.id}`;
  const first = t.state.signalInvestigation.records[signalId];
  assert.ok(first);
  assert.equal(smuggler.data.scanRevealed.cargoHint, 'declared civilian cargo');
  t.bus.emit('signal:track', { signalId });
  assert.match(t.courses[0].reason, /^Investigate /);

  const berth = applyClueObservation(t.state.signalInvestigation.clues, {
    subjectId: 'access:berth',
    kind: 'access',
    claim: 'berth open',
    pos: { x: 12, z: 4 },
    at: 3,
  });
  clearCooldown(t);
  pulse(t);
  assert.equal(smuggler.data.scanRevealed.manifestTrust, 'suspect');
  assert.equal(smuggler.data.scanRevealed.cargoHint, 'manifest mismatch');
  assert.doesNotMatch(smuggler.data.scanRevealed.cargoHint, new RegExp(SECRET));
  const clue = t.state.signalInvestigation.clues.subjects[`manifest:${smuggler.id}`];
  assert.equal(clue.history.length, 1);
  assert.equal(clue.history[0].claim, 'declared civilian cargo');
  assert.equal(clue.history[0].status, 'contradicted');
  assert.equal(clue.claim, 'manifest mismatch');
  assert.equal(clue.route.action, 'inspect');
  assert.match(t.courses.at(-1).reason, /contradicted/i);
  assert.match(t.courses.at(-1).reason, /inspect/i);
  assert.equal(t.state.signalInvestigation.clues.subjects['access:berth'].route.reason, berth.hypothesis.route.reason);
  assert.doesNotMatch(JSON.stringify(t.state.signalInvestigation), new RegExp(SECRET));

  const stamped = clue.observedAt;
  clearCooldown(t);
  pulse(t);
  assert.equal(t.state.signalInvestigation.clues.subjects[`manifest:${smuggler.id}`].history.length, 1);
  assert.equal(t.state.signalInvestigation.clues.subjects[`manifest:${smuggler.id}`].observedAt, stamped);
});

function fieldAt(id, kind, extra = {}) {
  return normalizeField({
    id,
    kind,
    center: { x: 0, z: 0 },
    radius: 120,
    strength: extra.strength != null ? extra.strength : 40,
    damping: extra.damping != null ? extra.damping : 0,
    falloff: 1,
    frame: extra.frame || null,
    ...extra,
  });
}

test('overlapping pull, push, and viscosity sum in id order without stealing momentum', () => {
  const pos = { x: 36, z: -12 };
  const vel = { x: 22, z: 9 };
  const well = fieldAt('well', FIELD_KINDS.WELL, { strength: 17.3, center: { x: 0, z: 0 } });
  const push = fieldAt('push', FIELD_KINDS.REPULSOR, { strength: 11.7, center: { x: 10, z: 4 } });
  const goo = fieldAt('goo', FIELD_KINDS.WELL, {
    strength: 8.1, damping: 1.4, center: { x: -6, z: 3 }, frame: { x: 4, z: -2 },
  });
  const forward = sampleFieldAcceleration(pos, vel, [well, push, goo], 0, { mass: 12, type: 'ship' });
  const reversed = sampleFieldAcceleration(pos, vel, [goo, push, well], 0, { mass: 12, type: 'ship' });
  assert.deepEqual(forward, reversed, 'enumeration order does not change the net acceleration');
  assert.deepEqual(vel, { x: 22, z: 9 }, 'sampling does not rewrite body velocity');

  const opposedWell = fieldAt('a-well', FIELD_KINDS.WELL, { strength: 30, damping: 0, radius: 200 });
  const opposedPush = fieldAt('b-push', FIELD_KINDS.REPULSOR, { strength: 30, damping: 0, radius: 200 });
  const body = { x: 40, z: 0 };
  const moving = { x: 30, z: -8 };
  const cancelled = sampleFieldAcceleration(body, moving, [opposedPush, opposedWell], 1, { mass: 12, type: 'ship' });
  assert.ok(Math.hypot(cancelled.ax, cancelled.az) < 1e-6, 'equal opposing fields cancel');
  const dt = 1 / 60;
  const steer = 25;
  const vx = moving.x + (cancelled.ax + steer) * dt;
  assert.ok(vx > moving.x, 'player steering still adds speed while the fields cancel');
  assert.ok(Math.abs(vx - (moving.x + steer * dt)) < 1e-9);

  const rest = { x: 0, z: 0 };
  const still = fieldAt('snare', FIELD_KINDS.WELL, { strength: 50, damping: 3, radius: 80 });
  const parked = sampleFieldAcceleration({ x: 0, z: 0 }, rest, [still], 0, { mass: 12, type: 'ship' });
  assert.deepEqual(parked, { ax: 0, az: 0 }, 'a stationary body gains nothing from viscosity');
  const coast = { x: 10, z: 0 };
  const dragged = sampleFieldAcceleration({ x: 0, z: 0 }, coast, [still], 0, { mass: 12, type: 'ship' });
  assert.ok(dragged.ax * coast.x + dragged.az * coast.z < 0, 'stationary-frame viscosity only removes energy');

  const medium = fieldAt('stream', FIELD_KINDS.WELL, {
    strength: 20, damping: 2, frame: { x: 15, z: 0 },
  });
  const entrained = sampleFieldAcceleration({ x: 0, z: 0 }, { x: 0, z: 0 }, [medium], 0, { mass: 12, type: 'ship' });
  assert.ok(entrained.ax > 0, 'a moving medium may entrain a slower body');
  const relPower = (entrained.ax) * (0 - 15);
  assert.ok(relPower < 0, 'drag still dissipates relative to the moving field');

  const negative = normalizeField({
    id: 'bad-damp', kind: FIELD_KINDS.WELL, center: { x: 0, z: 0 }, radius: 40,
    strength: 10, damping: -8, falloff: 1,
  });
  assert.equal(negative.damping, 0);
  const noBoost = fieldRawAcceleration(negative, 0, 0, { ax: 0, az: 0 }, { x: 12, z: 0 });
  assert.deepEqual(noBoost, { ax: 0, az: 0 });

  const center = fieldRawAcceleration(opposedPush, 0, 0, { ax: 0, az: 0 }, { x: 5, z: -3 });
  assert.ok(Number.isFinite(center.ax) && Number.isFinite(center.az));
  assert.deepEqual(center, { ax: 0, az: 0 }, 'exact center has no invented radial direction');

  const kinematic = fieldBodyProfile({
    id: 4, type: 'ship', mass: 8, pos: { x: 0, z: 0 },
    physicsBody: { dynamic: false, mass: 8, radius: 4 },
  }, {});
  assert.equal(kinematic.dynamic, false);
  const skipped = sampleFieldAcceleration(body, moving, [opposedWell], 0, kinematic);
  assert.deepEqual(skipped, { ax: 0, az: 0 });
  const heavy = fieldBodyProfile({
    id: 5, type: 'ship', mass: 400, pos: { x: 0, z: 0 },
    physicsBody: { dynamic: true, mass: 400, radius: 8 },
  }, {});
  const heavyAccel = sampleFieldAcceleration(body, null, [opposedWell], 0, heavy);
  const lightAccel = sampleFieldAcceleration(body, null, [opposedWell], 0, { mass: 12, type: 'ship' });
  assert.ok(Math.hypot(heavyAccel.ax, heavyAccel.az) > 0, 'a heavy dynamic hull is not immune');
  assert.ok(Math.hypot(heavyAccel.ax, heavyAccel.az) < Math.hypot(lightAccel.ax, lightAccel.az));

  const kernelA = createFieldKernel();
  kernelA.register(well);
  kernelA.register(push);
  const kernelB = createFieldKernel();
  kernelB.register(push);
  kernelB.register(well);
  assert.deepEqual(
    sampleFieldAcceleration(pos, vel, kernelA.list(), 0, { mass: 12, type: 'ship' }),
    sampleFieldAcceleration(pos, vel, kernelB.list(), 0, { mass: 12, type: 'ship' }),
  );

  const rings = new Map();
  noteFieldAnchorRing(rings, { fieldId: 'well', kind: 'well', radius: 30, pos: { x: 1, z: 2 } });
  noteFieldAnchorRing(rings, { fieldId: 'goo', kind: 'repulsor', radius: 12, pos: { x: 3, z: 4 } });
  assert.equal(rings.get('well').kind, 'well');
  assert.equal(rings.get('well').ax, undefined, 'the picture stores the contributor, not a second force');
  clearFieldAnchorRings(rings, { fieldId: 'goo' });
  assert.equal(rings.size, 1);
  assert.equal(rings.has('well'), true);

  const presentation = readFileSync(new URL('../src/render/forceLanguage/fieldForcePresentation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(presentation, /sampleFieldAcceleration/);
  const fieldsSource = readFileSync(new URL('../src/systems/fields.js', import.meta.url), 'utf8');
  assert.match(fieldsSource, /queuePhysicsImpulse\(/);
  assert.match(fieldsSource, /sampleFieldAcceleration\(/);
  assert.doesNotMatch(fieldsSource, /\.vel\s*=/);
});
