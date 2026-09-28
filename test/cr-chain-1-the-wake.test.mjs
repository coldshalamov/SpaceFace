import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: 5000, z: 5000 });

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed || 77,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: ANCHOR.x, z: ANCHOR.z },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  state.combat = state.combat || {};
  state.combat.attachments = state.combat.attachments || { byId: {} };
  const events = [];
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireWake(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'wake_hitch',
    encounterId: 'test_wake_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'trade_lane',
    zoneRadius: 500,
    force: true,
  });
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function hitch(state, playerId, muleId) {
  state.combat.attachments.byId.test_hitch = {
    id: 'test_hitch', ownerId: playerId, targetId: muleId, state: 'active',
  };
}

test('wake_hitch is a registered authored encounter shape', () => {
  const enc = ENCOUNTERS.wake_hitch;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.tier, 'minor');
  assert.deepEqual(enc.shape.situation, 'convoy');
});

test('the braid materializes: a loaded mule mid-leg, a drop pocket at the end, shadows holding off the line', () => {
  const { sim, state } = makeHarness();
  const res = fireWake(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);

  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'wake_hitch');
  assert.ok(live && live.phase === 'conflict');

  const mule = castOf(state, live, 'hauler')[0];
  const shadows = castOf(state, live, 'raider');
  assert.ok(mule, 'the working mule must spawn');
  assert.equal(shadows.length, 2, 'a shadow pair paces the wake');

  // The mule is honestly working: loaded, moving down its leg at haul speed.
  const speed = Math.hypot(mule.vel.x, mule.vel.z);
  assert.ok(speed > 30 && speed < 50, `mule hauls at working speed (${speed.toFixed(0)})`);
  assert.ok((mule.data.cargo || {}).cmdty_ore_goldium > 0, 'the hold is loaded');
  assert.equal(mule.data.ai.moraleImmune, true);

  // The drop pocket is a real marker at the leg's far end — hitching is how you learn it.
  const wake = live.data.wake;
  const muleToDrop = Math.hypot(wake.drop.x - mule.pos.x, wake.drop.z - mule.pos.z);
  assert.ok(muleToDrop > 1800 && muleToDrop < 2600, `the leg is long (${muleToDrop.toFixed(0)} WU)`);
  // The mule's velocity points along its leg toward the drop.
  const legDir = { x: (wake.drop.x - mule.pos.x) / muleToDrop, z: (wake.drop.z - mule.pos.z) / muleToDrop };
  const along = (mule.vel.x * legDir.x + mule.vel.z * legDir.z) / speed;
  assert.ok(along > 0.95, 'the mule is headed down its own leg');

  // The shadows are holding: passive, off the line, not yet committed.
  for (const s of shadows) {
    assert.equal(s.data.ai.passive, true, 'shadow holds passive until the spring');
    assert.ok(!s.data.combat?.targetId, 'no commitment before the spring');
    const dMule = Math.hypot(s.pos.x - mule.pos.x, s.pos.z - mule.pos.z);
    assert.ok(dMule > 400, 'the shadow holds off the line');
  }
});

test('the hitch is the braid: latching the working hull springs the tail', () => {
  const { sim, state } = makeHarness();
  fireWake(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'wake_hitch');
  const mule = castOf(state, live, 'hauler')[0];
  const shadows = castOf(state, live, 'raider');

  sim.runTicks(90); // one director pass — shadows still hold without a hitch
  assert.equal(live.data.wake.sprung, false, 'no hitch, no spring');
  assert.equal(shadows[0].data.ai.passive, true);

  // The player latches the working hull — an ordinary active attachment edge.
  hitch(state, state.playerId, mule.id);
  sim.runTicks(90);

  assert.equal(live.data.wake.sprung, true, 'the hitch springs the tail');
  for (const s of shadows) {
    assert.equal(s.data.ai.passive, false, 'shadow drops the cover');
    assert.ok(s.data.combat?.targetId != null, 'shadow is committed');
    assert.ok(Math.hypot(s.vel.x, s.vel.z) > 40, 'shadow launches an intercept');
  }
});

test('a quiet leg stays quiet: no hitch means the shadows peel off unfought', () => {
  const { sim, state } = makeHarness();
  fireWake(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'wake_hitch');
  const shadows = castOf(state, live, 'raider');

  // Run the deadline out without a hitch — the tail never shows.
  sim.runTicks(60 * 140);
  assert.equal(live.outcome, 'quiet_leg', 'unsprung leg resolves quiet');
  assert.equal(live.data.wake.sprung, false);
  for (const s of shadows) {
    assert.equal(s.data.ai.passive !== false, true, 'shadows never committed');
  }
});

test('wake_cleared: sprung shadows dead pays rep and clears the line', () => {
  const { sim, state, bus, events } = makeHarness();
  fireWake(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'wake_hitch');
  const mule = castOf(state, live, 'hauler')[0];
  const shadows = castOf(state, live, 'raider');

  hitch(state, state.playerId, mule.id);
  sim.runTicks(90);
  assert.equal(live.data.wake.sprung, true);

  for (const s of shadows) {
    bus.emit('entity:killed', { id: s.id, killerId: state.playerId, pos: s.pos });
    s.alive = false;
  }
  sim.runTicks(120);

  assert.equal(live.outcome, 'wake_cleared');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts'));
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'wake:shadows_cleared'));
});
