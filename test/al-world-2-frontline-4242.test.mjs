import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { factions } from '../src/systems/factions.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { gateControlDirector } from '../src/systems/gateControlDirector.js';

const sectorId = 'sector_helios_prime';
const pairKey = 'faction_reach:faction_scn';
const gatePos = { x: 2200, z: -1200 };

function boot() {
  const state = createGameState(4242), bus = createBus(), events = [];
  state.meta.seed = 4242; state.simTime = 80; state.mode = 'flight';
  for (const sector of SECTORS) state.world.sectors[sector.id] = { ...sector, owner: sector.factionId };
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { ...state.world.sectors[sectorId],
    gates: [{ to: 'sector_ceres_belt', pos: gatePos }] };
  state.entities = new Map(); state.entityList = [];
  let nextId = 100;
  const helpers = { queryRadius: () => [], spawnEntity(spec) {
    const entity = { ...spec, id: nextId++, alive: true, data: { ...spec.data } };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  }, removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; } };
  const owners = { factions: Object.create(factions), factionPresence: Object.create(factionPresence),
    aftermathWrecks: Object.create(aftermathWrecks), gateControlDirector: Object.create(gateControlDirector) };
  const registry = { get: name => owners[name] || null };
  for (const owner of Object.values(owners)) owner.init({ state, bus, helpers, registry });
  for (const event of ['conflict:flip', 'gate:verdict']) bus.on(event, payload => events.push({ event, payload }));
  return { state, bus, events, ...owners };
}

function verdict(rt) {
  rt.bus.emit('jump:chargeStart', { via: 'gate', targetSectorId: 'sector_ceres_belt', chargeNeeded: 4 });
  return rt.events.filter(row => row.event === 'gate:verdict').at(-1)?.payload;
}

test('4242: a real faction flip changes the gate picket, leaves salvageable battle bodies, and changes the executable customs verdict across reload', () => {
  const rt = boot();
  rt.state.world.sectors[sectorId].owner = 'faction_scn';
  const before = verdict(rt);
  assert.equal(before.factionId, 'faction_scn'); assert.equal(before.type, 'scn_scan');
  rt.state.conflicts[pairKey] = { state: 'war', tension: 90, momentum: -101, playerLean: 0 };
  assert.equal(rt.factions._resolveFlip(pairKey, rt.state.conflicts[pairKey]), true);
  assert.equal(rt.state.world.sectors[sectorId].owner, 'faction_reach');
  rt.bus.emit('sector:enter', { sectorId });
  const pickets = rt.state.entityList.filter(e => e.alive !== false
    && e.data?.factionPresence?.routeId === `conflict:${pairKey}:picket`);
  assert.ok(pickets.length > 0);
  assert.ok(pickets.every(e => e.factionId === 'faction_reach'));
  assert.ok(pickets.every(e => Math.hypot(e.pos.x - gatePos.x, e.pos.z - gatePos.z) <= 71));
  const markers = aftermathForSector(rt.state, sectorId).filter(row => row.source === 'territory_battle');
  assert.equal(markers.length, 3);
  assert.equal(rt.state.entityList.filter(e => e.alive !== false && e.type === 'wreck').length, 3);
  assert.ok(markers.every(row => row.victimFactionId === 'faction_scn' && row.salvagePool.cmdty_scrap_metal > 0));
  const after = verdict(rt);
  assert.equal(after.factionId, 'faction_reach'); assert.notEqual(after.type, before.type);

  const saved = JSON.parse(JSON.stringify({ factions: rt.factions.serialize(), presence: rt.factionPresence.serialize(),
    aftermath: rt.aftermathWrecks.serialize(), owners: Object.fromEntries(Object.entries(rt.state.world.sectors).map(([id, row]) => [id, row.owner])) }));
  const restored = boot();
  restored.factions.deserialize(saved.factions); restored.factionPresence.deserialize(saved.presence);
  restored.aftermathWrecks.deserialize(saved.aftermath);
  for (const [id, owner] of Object.entries(saved.owners)) restored.state.world.sectors[id].owner = owner;
  restored.bus.emit('save:loaded', {}); restored.bus.emit('sector:enter', { sectorId });
  assert.equal(verdict(restored).factionId, 'faction_reach');
  assert.equal(aftermathForSector(restored.state, sectorId).filter(row => row.source === 'territory_battle').length, 3);
  assert.equal(restored.state.entityList.filter(e => e.alive !== false && e.type === 'wreck').length, 3);
  assert.ok(restored.state.entityList.some(e => e.alive !== false && e.factionId === 'faction_reach'
    && e.data?.factionPresence?.routeId === `conflict:${pairKey}:picket`));
  const flip = rt.events.find(row => row.event === 'conflict:flip').payload;
  restored.bus.emit('conflict:flip', flip);
  assert.equal(aftermathForSector(restored.state, sectorId).filter(row => row.source === 'territory_battle').length, 3,
    'redelivering the same saved flip cannot replenish the battle wrecks');
});
