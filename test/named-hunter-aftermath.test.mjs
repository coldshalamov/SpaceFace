// INFERENCE U2 (WF-09) — killing a named hunter leaves a thread, not just a toast:
// a named hulk where they fell (worth stripping), a durable death record, and a
// rumor. Bounty money stays combat's job; memory is this unit's. Fixed seeds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SHAPE = 'named_hunter';
const SECTOR = 'sector_io_reach';

function boot(seed = 90210) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector'), player };
}

function record(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function force(t, suffix) {
  const encounterId = `hunter-test:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId, sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const rowsOf = (rows, name) => rows.filter((r) => r.name === name).map((r) => r.payload);
function step(t, n = 3) {
  for (let s = 0; s < n; s++) t.sim.step(1);
}

function bossOf(t, id) {
  const live = liveOf(t, id);
  const bossId = Object.keys(live.roles).find((key) => live.roles[key] === 'boss');
  return t.state.entities.get(Number(bossId));
}

test('a player kill leaves hulk, death record, rumor, and receipt', () => {
  const t = boot();
  const rows = record(t, ['encounter:resolved', 'encounter:receipt', 'comms:log']);
  const id = force(t, 'kill');
  const boss = bossOf(t, id);
  assert.ok(boss, 'the captain spawns');
  const name = liveOf(t, id).vars.name;
  const deathPos = { x: boss.pos.x, z: boss.pos.z };
  boss.alive = false; // combat sets this before emitting; mirror that order
  t.bus.emit('entity:killed', { id: boss.id, killerId: t.player.id, type: 'ship', pos: { ...deathPos } });
  step(t, 1);

  const resolved = rowsOf(rows, 'encounter:resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].outcome, 'killed');

  const rec = t.state.encounterDirector.named[liveOf(t, id) ? liveOf(t, id).data.captainId : null]
    || Object.values(t.state.encounterDirector.named).find((r) => r.alive === false);
  assert.equal(rec.alive, false);
  assert.equal(rec.killedBy, 'player');
  assert.equal(rec.deathSector, SECTOR);
  assert.ok(Number.isInteger(rec.deathTick));

  const hulks = [...t.state.entities.values()].filter((e) => e.data && e.data.scanLabel === `${name}'s Hulk`);
  assert.equal(hulks.length, 1, 'exactly one named hulk');
  assert.deepEqual(hulks[0].data.salvagePool, { cmdty_salvage_electronics: 2, cmdty_scrap_metal: 3 });
  assert.ok(Math.hypot(hulks[0].pos.x - deathPos.x, hulks[0].pos.z - deathPos.z) < 1, 'the hulk marks where they fell');

  const rumors = rowsOf(rows, 'comms:log').filter((l) => l.from === 'RUMOR');
  assert.equal(rumors.length, 1);
  assert.match(rumors[0].text, new RegExp(`^${name} is dead`));
  assert.match(rumors[0].text, /lanes noticed/);

  const receipts = rowsOf(rows, 'encounter:receipt');
  assert.equal(receipts.length, 1);
  assert.match(receipts[0].text, /HUNTER DOWN/);
});

test('a world kill still marks the spot but tells it shorter', () => {
  const t = boot(777);
  const rows = record(t, ['comms:log']);
  const id = force(t, 'world-kill');
  const boss = bossOf(t, id);
  const name = liveOf(t, id).vars.name;
  boss.alive = false;
  t.bus.emit('entity:killed', { id: boss.id, killerId: 999999, type: 'ship', pos: { ...boss.pos } });
  step(t, 1);
  const rec = Object.values(t.state.encounterDirector.named).find((r) => r.alive === false);
  assert.equal(rec.killedBy, 'world');
  const hulks = [...t.state.entities.values()].filter((e) => e.data && e.data.scanLabel === `${name}'s Hulk`);
  assert.equal(hulks.length, 1);
  const rumors = rowsOf(rows, 'comms:log').filter((l) => l.from === 'RUMOR');
  assert.equal(rumors.length, 1);
  assert.equal(rumors[0].text, `${name} is dead.`);
});

test('same seed hunts the same captain', () => {
  const a = boot();
  const b = boot();
  const ida = force(a, 'det');
  const idb = force(b, 'det');
  assert.equal(liveOf(a, ida).vars.name, liveOf(b, idb).vars.name);
});

test('catalog carries the kill-cache pool', () => {
  assert.deepEqual(ENCOUNTERS[SHAPE].killCachePool, { cmdty_salvage_electronics: 2, cmdty_scrap_metal: 3 });
});
