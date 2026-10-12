import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { automation } from '../src/systems/automation.js';
import { wingmen } from '../src/systems/wingmen.js';

function boot(count = 1) {
  const sim = createSimulation({ seed: 4242, systems: [automation, wingmen] });
  const { state, bus } = sim; state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const rows = Array.from({ length: count }, (_, i) => ({ id: `wing-${i}`, shipDefId: 'ship_wasp',
    name: `Pilot ${i}`, order: 'escort', hullPct: 1, hp: 1 }));
  state.automation.fleet = rows.slice();
  const lost = [], down = [];
  bus.on('automation:assetLost', p => lost.push(p));
  bus.on('toast', p => { if (p.text?.startsWith('Wingman down')) down.push(p); });
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const bodies = rows.map(row => state.entities.get(row._liveId));
  return { sim, state, bus, rows, bodies, lost, down, sys: sim.registry.get('wingmen') };
}

test('a live wingman death reaches the real fleet owner and cannot buy a free resurrection on the next jump', () => {
  const r = boot();
  try {
    r.bodies[0].alive = false; r.bodies[0].hull = 0;
    r.sys.update(1 / 60, r.state);
    assert.equal(r.state.automation.fleet.length, 0, 'real automation consumes damage, not an unrecognized dmg field');
    assert.equal(r.lost.length, 1); assert.equal(r.lost[0].id, 'wing-0');
    assert.equal(r.state.automation.meta.lostAssetsLog.length, 1);
    assert.equal(r.rows[0]._liveId, null); assert.equal(r.down.length, 1);
    r.bus.emit('sector:exit', {}); r.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
    r.sys.update(1 / 60, r.state);
    assert.equal(r.state.entityList.filter(e => e.data?.isWingman && e.alive !== false).length, 0);
    assert.equal(r.lost.length, 1); assert.equal(r.down.length, 1);
  } finally { r.sim.dispose(); }
});

test('a hard jump immediately after two deaths settles both and preserves the surviving damaged wing', () => {
  const r = boot(3);
  try {
    for (const body of r.bodies.slice(0, 2)) { body.hull = 0; body.alive = false; }
    r.bodies[2].hull = r.bodies[2].hullMax * 0.4;
    // No wingmen update between combat and the transition. Settlement splices the live ledger.
    r.bus.emit('sector:exit', { continuous: false });
    assert.deepEqual(r.state.automation.fleet.map(row => row.id), ['wing-2']);
    assert.equal(r.lost.length, 2); assert.equal(r.down.length, 2);
    assert.equal(r.rows[2]._liveId, null);
    r.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
    const survivor = r.state.entities.get(r.rows[2]._liveId);
    assert.ok(survivor.alive); assert.equal(survivor.hull / survivor.hullMax, 0.4);
    assert.equal(r.state.entityList.filter(e => e.data?.isWingman && e.alive !== false).length, 1);
    r.bus.emit('sector:exit', {}); assert.equal(r.lost.length, 2);
  } finally { r.sim.dispose(); }
});

test('an already swept dead wing is still settled before a hard sector boundary', () => {
  const r = boot();
  try {
    r.sim.helpers.removeEntity(r.bodies[0].id, { immediate: true });
    r.bus.emit('sector:exit', {});
    assert.equal(r.state.automation.fleet.length, 0); assert.equal(r.lost.length, 1);
  } finally { r.sim.dispose(); }
});

test('continuous membership handoff preserves a living fleet without invented losses', () => {
  const r = boot();
  try {
    const id = r.rows[0]._liveId; r.bus.emit('sector:exit', { continuous: true });
    r.bus.emit('sector:enter', { continuous: true, sectorId: 'sector_ceres_belt' });
    assert.equal(r.rows[0]._liveId, id); assert.equal(r.bodies[0].alive, true); assert.equal(r.lost.length, 0);
  } finally { r.sim.dispose(); }
});
