// PIC-29, VERB-20, VERB-25 — the swing fade, the bridle split, and the seed latch word.
// Seed 4242. Presentation of numbers the sim already computes. No new widgets.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { rateRelease, tetherGameplay, bridleEndpointShares } from '../src/systems/tetherGameplay.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import {
  SWING_TRACE_GRADE_COLOR,
  swingTraceGradeColor,
  clearSwingTraceReleasePaint,
  swingTracePaint,
  createMasslineSwingTrace,
  pushMasslineSwingSample,
  createMasslineSwingTraceGeometry,
  writeMasslineSwingTraceGeometry,
} from '../src/render/masslineSwingTrace.js';
import {
  massSeed,
  massSeedLatchPreview,
  publishMassSeedLatchPreview,
  isMassSeedTetherEligible,
} from '../src/systems/massSeed.js';
import {
  masslineHud,
  masslineSeedPreviewText,
  resolveTetherShareHud,
} from '../src/ui/masslineHud.js';

const SEED = 4242;

function ship(id, x, z, vx, vz, mass) {
  return {
    id, type: 'ship', alive: true, mass, radius: 12,
    pos: { x, z }, vel: { x: vx, z: vz },
    physicsBody: { mass },
  };
}

function releaseState(enemyVz) {
  const player = ship(1, 0, 0, 0, 40, 40);
  const enemy = ship(2, 120, 0, 0, enemyVz, 16);
  return {
    seed: SEED,
    tick: 10,
    simTime: 10 / 60,
    playerId: 1,
    rng: mulberry32(SEED),
    entities: new Map([[1, player], [2, enemy]]),
    player: {
      tether: {
        active: true, targetId: 2, phase: 'loaded',
        restLength: 120, strain: 0.2, load: 0.4,
      },
    },
  };
}

function ribbonColor(classification) {
  clearSwingTraceReleasePaint();
  const trace = createMasslineSwingTrace();
  pushMasslineSwingSample(trace, 0, 0, 0);
  pushMasslineSwingSample(trace, 6, 0, 0);
  const bus = createBus();
  const host = Object.create(masslineThrow);
  host.init({ state: releaseState(120), bus, helpers: {}, registry: null });
  bus.emit('tether:releaseRated', { classification, targetId: 2, sourceId: 1 });
  const out = createMasslineSwingTraceGeometry();
  writeMasslineSwingTraceGeometry(out, trace, { nowS: 0, fade: 1, brightness: 1, lifeS: 10 });
  host.destroy();
  return [out.colors[3], out.colors[4], out.colors[5]];
}

function assertRgb(actual, expected) {
  assert.ok(Math.abs(actual[0] - expected.r) < 1e-5, `r ${actual[0]} vs ${expected.r}`);
  assert.ok(Math.abs(actual[1] - expected.g) < 1e-5, `g ${actual[1]} vs ${expected.g}`);
  assert.ok(Math.abs(actual[2] - expected.b) < 1e-5, `b ${actual[2]} vs ${expected.b}`);
}

function el() {
  const node = {
    style: {},
    textContent: '',
    attrs: {},
    classList: { toggle() {} },
    setAttribute(name, value) { node.attrs[name] = value; },
    getAttribute(name) { return node.attrs[name]; },
  };
  return node;
}

function seedEntity(phase, eligible) {
  return {
    id: 9,
    type: 'massSeed',
    alive: true,
    radius: 7,
    pos: { x: 40, z: 10 },
    vel: { x: 0, z: 0 },
    data: {
      massSeed: true,
      kind: 'mass_seed',
      massSeedState: { phase, tetherEligible: eligible },
    },
  };
}

test('PIC-29 razor and rough releases colour the swing fade from tether:releaseRated', () => {
  const razor = rateRelease(releaseState(120), 2);
  const rough = rateRelease(releaseState(50), 2);
  assert.equal(razor.classification, 'razor');
  assert.equal(rough.classification, 'messy', 'the cadence law still names a rough release messy');
  assert.equal(releaseState(120).seed, SEED);

  assert.deepEqual(swingTraceGradeColor('razor'), SWING_TRACE_GRADE_COLOR.razor);
  assert.deepEqual(swingTraceGradeColor('clean'), SWING_TRACE_GRADE_COLOR.clean);
  assert.deepEqual(swingTraceGradeColor('good'), SWING_TRACE_GRADE_COLOR.good);
  assert.deepEqual(swingTraceGradeColor('messy'), SWING_TRACE_GRADE_COLOR.rough);
  assert.deepEqual(swingTraceGradeColor('rough'), SWING_TRACE_GRADE_COLOR.rough);
  assert.notDeepEqual(SWING_TRACE_GRADE_COLOR.razor, SWING_TRACE_GRADE_COLOR.rough);
  assert.notDeepEqual(SWING_TRACE_GRADE_COLOR.clean, SWING_TRACE_GRADE_COLOR.good);

  const razorRgb = ribbonColor(razor.classification);
  const roughRgb = ribbonColor('rough');
  const messyRgb = ribbonColor(rough.classification);
  assertRgb(razorRgb, SWING_TRACE_GRADE_COLOR.razor);
  assertRgb(roughRgb, SWING_TRACE_GRADE_COLOR.rough);
  assertRgb(messyRgb, SWING_TRACE_GRADE_COLOR.rough);
  assert.ok(Math.abs(razorRgb[0] - roughRgb[0]) > 0.2);

  const bus = createBus();
  const host = Object.create(masslineThrow);
  host.init({ state: releaseState(120), bus, helpers: {}, registry: null });
  bus.emit('tether:releaseRated', razor);
  assert.deepEqual(swingTracePaint(), SWING_TRACE_GRADE_COLOR.razor);
  bus.emit('tether:latched', {});
  assert.equal(swingTracePaint(), null);
  host.destroy();
  clearSwingTraceReleasePaint();
});

test('VERB-20 a bridle with two endpoints publishes both load fractions', () => {
  const source = ship(2, 0, 0, 0, 0, 20);
  const target = ship(3, 80, 0, 0, 0, 60);
  const state = {
    seed: SEED,
    tick: 4,
    simTime: 0.2,
    rng: mulberry32(SEED),
    playerId: 1,
    player: {},
    entities: new Map([[source.id, source], [target.id, target]]),
  };
  const emitted = [];
  const system = Object.create(tetherGameplay);
  system.bus = { emit(name, payload) { emitted.push({ name, payload }); } };
  system._bridleShareKey = null;
  const payload = system._publishBridleLoadShare(state, source, target, 'bridle-4242', true);
  const law = bridleEndpointShares(20, 60);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, 'chain:tetherShare');
  assert.deepEqual(payload.shares, [law.source, law.target]);
  assert.ok(Math.abs(payload.sourceShare + payload.targetShare - 1) < 1e-9);
  assert.equal(payload.kind, 'twin_bridle');
  assert.equal(payload.sourceId, source.id);
  assert.equal(payload.targetId, target.id);

  const model = resolveTetherShareHud(state.player.remoteMassline);
  assert.ok(model);
  assert.ok(Math.abs(model.source + model.target - 1) < 1e-9);
  assert.equal(model.text, 'A 0.75 · B 0.25');

  const strainText = el();
  strainText.textContent = 'LINE';
  const dom = {
    btPill: el(), btFill: el(), ckPill: el(), ckFill: el(),
    strainPill: el(), strainFill: el(), strainText,
  };
  masslineHud._updateMeters.call({ _lineLoad: null }, dom, { bulletTime: null, cloak: null }, state);
  assert.equal(strainText.textContent, 'A 0.75 · B 0.25');
  assert.equal(dom.strainPill.style.display, 'flex');
  assert.equal(dom.strainPill.attrs['aria-label'], 'Load split A 0.75 · B 0.25');
});

test('VERB-25 aiming at a seed publishes eligibility and the hold word', () => {
  const locking = seedEntity('locking', false);
  const holding = seedEntity('active', true);
  assert.equal(isMassSeedTetherEligible(locking), false);
  assert.equal(isMassSeedTetherEligible(holding), true);

  const state = {
    seed: SEED,
    tick: 8,
    simTime: 1,
    rng: mulberry32(SEED),
    mode: 'flight',
    playerId: 1,
    player: {},
    entities: new Map([[1, ship(1, 0, 0, 0, 0, 40)], [locking.id, locking]]),
    input: { aimWorld: { x: locking.pos.x, z: locking.pos.z } },
    masslineAcquisition: { selected: null },
  };
  state.massSeed = {
    schemaVersion: 1,
    phase: 'locking',
    seedId: locking.id,
    activeAt: 100,
    latchPreview: null,
  };
  const seedSystem = Object.create(massSeed);
  seedSystem.state = state;
  seedSystem.bus = { emit() {} };
  seedSystem.helpers = {};
  seedSystem._tickSeed(state, state.massSeed);
  const lockingPreview = state.massSeed.latchPreview;
  assert.ok(lockingPreview);
  assert.equal(lockingPreview.isMassSeedTetherEligible, false);
  assert.equal(lockingPreview.word, 'LOCKING');
  assert.equal(masslineSeedPreviewText(lockingPreview), 'ANCHOR · LOCKING');
  assert.equal(state.masslineAcquisition.selected, null);

  const previewEl = el();
  const dom = {
    previewEl, previewMark: el(), previewSourceMark: el(), previewSvg: el(),
  };
  const player = state.entities.get(1);
  const w2s = (q) => ({ x: q.x, y: q.z, onScreen: true });
  masslineHud._updateAcquisitionPreview(dom, state, player, w2s);
  assert.equal(previewEl.textContent, 'ANCHOR · LOCKING');
  assert.equal(previewEl.attrs['data-seed-eligible'], 'false');
  assert.equal(state.masslineAcquisition.selected, null);

  state.entities.set(holding.id, holding);
  state.input.aimWorld = { x: holding.pos.x, z: holding.pos.z };
  state.massSeed.phase = 'active';
  state.massSeed.seedId = holding.id;
  const published = publishMassSeedLatchPreview(state, holding, true);
  assert.equal(published.isMassSeedTetherEligible, true);
  assert.equal(published.word, 'HOLDS');
  assert.equal(masslineSeedPreviewText(published), 'ANCHOR · HOLDS');
  assert.deepEqual(massSeedLatchPreview(holding), published);

  state.masslineAcquisition = {
    selected: { targetId: holding.id, status: 'ready', reason: null, targetType: 'massSeed' },
  };
  masslineHud._updateAcquisitionPreview(dom, state, player, w2s);
  assert.equal(state.masslineAcquisition.selected.isMassSeedTetherEligible, true);
  assert.equal(state.masslineAcquisition.selected.seedStateWord, 'HOLDS');
  assert.equal(previewEl.textContent, 'ANCHOR · HOLDS');
  assert.equal(isMassSeedTetherEligible(holding), true);
});
