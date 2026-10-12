// SFQ-M M34 The harvest somebody else owns: your claimed survey core drawn toward a Sorter's
// intake. Haul it out, or log it and present custody so the machine sets it aside. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 4242;
const SECTOR = 'sector_vesta_forge';
const ANCHOR = Object.freeze({ x: -3000, z: -3000 });
const SHAPE = 'harvest_owned';

function makeHarness(extra = {}) {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector], ...extra });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x + 300, z: ANCHOR.z - 300 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6, mass: 35,
  });
  state.playerId = player.id;
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'rep', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_m34', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'derelict_field', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const hOf = (live) => live.data.harvest;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => [e.payload.factionId, e.payload.delta]);
const pickups = (h) => h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'pickup');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let seq = 0;
const scanAt = (h, pos) => h.bus.emit('scan:pulse', { pos: { ...pos }, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: ++seq });

test('harvest_owned is a registered derelict-field salvage minor gated off the Helios corridor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual({ zones: [...enc.zoneTypes], script: enc.script, situation: enc.shape.situation },
    { zones: ['derelict_field'], script: 'selfRegistered', situation: 'salvage' });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire puts a latchable resting core well outside the intake, with warning distance', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = hOf(live);
  const core = ent(h, m.coreId);
  assert.equal(isAttachable(core, h.state.playerId, h.state), true);
  assert.equal(isAttachable(ent(h, m.sorterId), h.state.playerId, h.state), false);
  assert.ok(Math.abs(dist(core.pos, ent(h, m.sorterId).pos) - 720) < 1);
});

test('hauling the core out of the draw recovers it under claim: full value', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = hOf(live);
  const core = ent(h, m.coreId);
  const s = ent(h, m.sorterId).pos;
  const r = dist(core.pos, s);
  core.pos.x = s.x + (core.pos.x - s.x) * 1200 / r; core.pos.z = s.z + (core.pos.z - s.z) * 1200 / r;
  h.sim.runTicks(70);
  assert.deepEqual(resolved(h), ['recovered']);
  assert.deepEqual(grants(h), [380]);
  assert.deepEqual(reps(h), [['faction_free', 2]]);
});

test('presenting before logging does nothing; log the core then present it and the Sorter preserves it', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = hOf(live);
  scanAt(h, ent(h, m.sorterId).pos);
  assert.equal(m.preserved, false, 'the Sorter has no reading to recognize yet');
  scanAt(h, ent(h, m.coreId).pos);
  assert.equal(m.tagged, true);
  scanAt(h, ent(h, m.sorterId).pos);
  assert.deepEqual(resolved(h), ['preserved']);
  assert.deepEqual(grants(h), [380]);
  assert.deepEqual(reps(h), [['faction_archive', 3]]);
  assert.equal(ent(h, m.coreId).data.scanLabel, 'PRESERVED — THE SORTER SET IT ASIDE');
});

test('on the real Rapier path the draw brings an untouched core into the intake; it comes out as a lesser lot', async () => {
  const h = makeHarness({
    systems: [spawnBudget, encounterDirector, physics], updateOrder: [spawnBudget, encounterDirector, physics],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    const live = fire(h);
    const m = hOf(live);
    const core = ent(h, m.coreId);
    const start = dist(core.pos, ent(h, m.sorterId).pos);
    for (let i = 0; i < 60 * 20; i++) h.sim.step(SIM_DT);
    const after20 = dist(core.pos, ent(h, m.sorterId).pos);
    assert.ok(after20 < start - 40 && after20 > 200, `drawn but not yet taken at 20 s (${after20.toFixed(0)} WU)`);
    for (let i = 0; i < 60 * 80 && !m.settled; i++) h.sim.step(SIM_DT);
    assert.deepEqual(resolved(h), ['processed']);
    assert.deepEqual(grants(h), []);
    const lots = pickups(h).map((p) => [p.data.commodityId, p.data.amount]).sort();
    assert.deepEqual(lots, [['cmdty_alloys', 1], ['cmdty_scrap_metal', 4]]);
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('shooting the core apart is final and pays nothing', () => {
  const h = makeHarness();
  const live = fire(h);
  ent(h, hOf(live).coreId).alive = false;
  h.sim.runTicks(70);
  assert.deepEqual(resolved(h), ['destroyed']);
  assert.deepEqual(grants(h), []);
});
