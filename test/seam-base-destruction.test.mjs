// SEAM-BASE: combat:baseDestroyed — destructible base entities.
//
// The economy already consumed `combat:baseDestroyed` (economy.onBaseDestroyed:
// piracy events tied to the dead base's station end, a contraband shortage lands) but
// nothing in the world could produce it. This suite covers the closed seam:
//
//   1. encounter 358 materializes a dockless station-typed base carrying
//      `data.baseKind: 'pirate_base'` — indexed as a damageable station, never a dock
//      target, with a held captive, a raider garrison, and physical take pods;
//   2. killing the base resolves the encounter and frees the captive;
//   3. a broken garrison releases the still-standing camp as a persistent world body;
//   4. the real combat kill path emits `entity:killed` (with baseKind) then
//      `combat:baseDestroyed` carrying the fields economy consumes;
//   5. economy's existing listener ends piracy for the named station and injects the
//      narcotics shortage; a field camp with no station berth is accepted quietly;
//   6. sectorSim books a base kill as `base_destroyed` (pocket loses danger), not
//      `infrastructure_loss`;
//   7. ordinary stations remain dockable — the dockless flag only exempts camps.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: 9200, z: 9200 });
const SHAPE_ID = 'press_camp_raid';

function makeHarness() {
  const sim = createSimulation({
    seed: 47,
    systems: [spawnBudget, encounterDirector, combat],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: ANCHOR.x + 600, z: ANCHOR.z + 600 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  const killed = [];
  const baseDown = [];
  bus.on('entity:killed', (p) => killed.push(structuredClone(p)));
  bus.on('combat:baseDestroyed', (p) => baseDown.push(structuredClone(p)));
  return { sim, state, bus, player, events, killed, baseDown };
}

function fireCamp(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE_ID,
    encounterId: 'test_press_camp_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'ambush_lane',
    zoneRadius: 500,
    force: true,
  });
}

function liveOf(state) {
  return Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE_ID);
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function podsOf(state, live) {
  const ids = new Set(live.data.pods || []);
  return (state.entityList || []).filter((e) => e && ids.has(e.id));
}

function makeSeam() {
  const sim = createSimulation({ seed: 47, systems: [economy, combat, sectorSim] });
  const { state, registry, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  registry.get('economy').newGame();
  const killed = [];
  const baseDown = [];
  bus.on('entity:killed', (p) => killed.push(structuredClone(p)));
  bus.on('combat:baseDestroyed', (p) => baseDown.push(structuredClone(p)));
  return { sim, state, registry, bus, killed, baseDown };
}

function spawnCamp(sim, extra = {}) {
  return sim.spawn({
    type: 'station', team: 1, factionId: 'faction_reach',
    pos: { x: 900, z: 900 }, vel: { x: 0, z: 0 },
    radius: 42, mass: 1e6, hull: 1400, hullMax: 1400, collides: true,
    flags: { persistent: true },
    data: {
      baseKind: 'pirate_base', dockless: true, stationTypeId: 'pirate_camp',
      factionId: 'faction_reach', name: 'Reach Press Camp', bountyCr: 520,
      encounter: true, ...extra,
    },
  });
}

test('press_camp_raid is a registered authored shape for lawless pockets', () => {
  const enc = ENCOUNTERS[SHAPE_ID];
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.ok(enc.zoneTypes.includes('ambush_lane') && enc.zoneTypes.includes('outlaw_zone'));
  assert.ok(enc.gates.maxSecurity <= 0.75, 'forward camps stand off the law');
});

test('fire materializes a dockless destructible base plus held cast', () => {
  const { sim, state } = makeHarness();
  const res = fireCamp(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = liveOf(state);
  assert.ok(live);
  sim.runTicks(2); // rebuild the index after materialization

  const base = state.entities.get(live.data.baseId);
  assert.ok(base, 'base entity exists');
  assert.equal(base.type, 'station');
  assert.equal(base.team, 1, 'the camp reads hostile to the player — its kill is lawful');
  assert.equal(base.data.baseKind, 'pirate_base');
  assert.equal(base.data.dockless, true);
  assert.equal(base.data.encounter, true);
  assert.equal(base.hull, 1400);
  assert.equal(base.hullMax, 1400);
  assert.equal(base.flags.persistent, true);
  assert.equal(live.roles[base.id], 'base');

  const idx = state.entityIndex;
  assert.ok(idx.damageables.includes(base), 'base is damageable');
  assert.ok(idx.stations.includes(base), 'base renders through the station path');
  assert.ok(!idx.dockStations.includes(base), 'dockless base is not a dock target');

  const captive = state.entities.get(live.data.captiveId);
  assert.ok(captive, 'the pressed captive is held on the hardstand');
  assert.equal(captive.data.ai.encounterRole, 'hauler');
  assert.equal(captive.data.ai.roe, 'hold_fire');
  assert.equal(captive.data.ai.moraleImmune, true,
    'the prisoner cannot rout while the guns still point');

  assert.ok(castOf(state, live, 'raider').length >= 2, 'garrison spawned');
  for (const g of castOf(state, live, 'raider')) {
    assert.equal(g.data.ai.activity?.kind, 'loiter', 'garrison holds the site');
  }
  assert.ok(podsOf(state, live).length >= 2, 'the take is parked in real pods');
});

test('combat.kill on the live camp closes the whole seam in one sim', () => {
  const { sim, state, killed, baseDown } = makeHarness();
  fireCamp(sim);
  const live = liveOf(state);
  const base = state.entities.get(live.data.baseId);
  const captive = state.entities.get(live.data.captiveId);

  sim.registry.get('combat').kill(base, state.playerId);
  const kill = killed.find((p) => p.id === base.id);
  assert.ok(kill, 'entity:killed emitted for the encounter base');
  assert.equal(kill.baseKind, 'pirate_base');
  assert.equal(kill.targetHostileToPlayer, true, 'a team-1 camp is a lawful hostile target');
  assert.equal(baseDown.length, 1, 'combat:baseDestroyed emitted');
  assert.equal(baseDown[0].type, 'pirate_base');
  assert.equal(baseDown[0].sectorId, SECTOR);

  sim.runTicks(90);
  assert.equal(live.phase, 'done');
  assert.equal(live.outcome, 'base_destroyed');
  assert.equal(live.ids.length, 0, 'cast released, not despawn-stamped');
  assert.equal(captive.data.ai.forceFlee, true, 'captive scatters when the guns die');
  assert.equal(captive.data.ai.moraleImmune, false);
});

test('garrison broken releases the standing camp as a persistent world body', () => {
  const { sim, state } = makeHarness();
  fireCamp(sim);
  const live = liveOf(state);
  for (const g of castOf(state, live, 'raider')) g.alive = false;
  sim.runTicks(90);

  assert.equal(live.phase, 'done');
  assert.equal(live.outcome, 'garrison_broken');
  const base = state.entities.get(live.data.baseId);
  assert.ok(base, 'released camp persists as a world body');
  assert.notEqual(base.alive, false);
  assert.equal(base.flags.persistent, true);
  assert.ok(!base.data.despawnAt, 'released, not stamped');
});

test('abort after materialization stands down the cast, not the world body', () => {
  const { sim, state } = makeHarness();
  fireCamp(sim);
  const live = liveOf(state);
  const base = state.entities.get(live.data.baseId);
  const guards = castOf(state, live, 'raider');
  sim.registry.get('encounterDirector').abort(live, 'test_abort');

  assert.equal(live.phase, 'done');
  assert.match(live.outcome, /^aborted:/);
  for (const g of guards) {
    assert.ok(g.data && g.data.despawnAt != null, 'movable cast takes the despawn stamp');
  }
  // Stations never enter the movables lane — a despawnAt stamp could never retire the
  // camp, and it should not: once the world has a camp it is a physical fixture.
  assert.ok(state.entities.get(base.id), 'the standing camp survives the abort');
  assert.notEqual(base.alive, false);
});

test('combat kill path emits entity:killed then combat:baseDestroyed', () => {
  const { sim, state, registry, killed, baseDown } = makeSeam();
  const base = spawnCamp(sim);
  registry.get('combat').kill(base, state.playerId);

  assert.equal(base.alive, false);
  const kill = killed.find((p) => p.id === base.id);
  assert.ok(kill, 'entity:killed emitted');
  assert.equal(kill.type, 'station');
  assert.equal(kill.baseKind, 'pirate_base', 'baseKind rides the killed payload');
  assert.equal(kill.factionId, 'faction_reach');

  assert.equal(baseDown.length, 1, 'exactly one base destruction event');
  const p = baseDown[0];
  assert.equal(p.type, 'pirate_base');
  assert.equal(p.stationType, 'pirate_camp');
  assert.equal(p.stationId, null, 'field camp owns no station berth');
  assert.equal(p.factionId, 'faction_reach');
  assert.equal(p.sectorId, SECTOR);
  assert.equal(p.killerId, state.playerId);
  assert.equal(p.pos.x, 900);
  assert.equal(p.pos.z, 900);
});

test('economy consumes baseDestroyed: piracy ends, contraband shortage lands', () => {
  const { sim, state, registry, bus } = makeSeam();
  const econ = registry.get('economy');
  econ.injectEvent({ type: 'piracy', stationId: 'st_qi_drill', duration: 120 });
  assert.equal(state.economy.econEvents.filter((e) => e.type === 'piracy').length, 1);

  // A field camp with no station berth is accepted but touches no market.
  const field = spawnCamp(sim);
  registry.get('combat').kill(field, state.playerId);
  assert.equal(state.economy.econEvents.filter((e) => e.type === 'piracy').length, 1,
    'field camp death leaves station piracy alone');
  assert.ok(!state.economy.econEvents.some((e) => e.type === 'shortage'),
    'no shortage without a stationId');

  // A named station base ends its own piracy and drops a narcotics shortage.
  bus.emit('combat:baseDestroyed', {
    type: 'pirate_base', stationId: 'st_qi_drill', stationType: 'blackmarket',
    factionId: 'faction_reach', sectorId: SECTOR, killerId: state.playerId,
    pos: { x: 0, z: 0 },
  });
  const piracy = state.economy.econEvents.find((e) => e.type === 'piracy');
  assert.equal(piracy.duration, 0, 'piracy event ended');
  const shortage = state.economy.econEvents.find((e) => e.type === 'shortage');
  assert.ok(shortage, 'contraband shortage injected');
  assert.equal(shortage.commodityId, 'cmdty_narcotics');
  assert.equal(shortage.stationId, 'st_qi_drill');
});

test('sectorSim books base_destroyed not infrastructure_loss', () => {
  const { sim, state, registry } = makeSeam();
  const ss = state.sectorSim;
  const base = spawnCamp(sim);
  registry.get('combat').kill(base, state.playerId);
  const baseImpulse = ss.impulses.find((i) => i.kind === 'base_destroyed');
  assert.ok(baseImpulse, 'pirate base kill books base_destroyed');
  assert.equal(baseImpulse.sectorId, SECTOR);
  assert.ok(baseImpulse.danger < 0, 'pocket loses danger when the camp burns');
  assert.equal(baseImpulse.influence.faction_reach, -0.16);
  assert.ok(!ss.impulses.some((i) => i.kind === 'infrastructure_loss'));

  const ord = sim.spawn({
    type: 'station', factionId: 'faction_dmc', pos: { x: 500, z: 500 },
    radius: 30, hull: 50, hullMax: 50,
    data: { stationTypeId: 'trade_hub' },
  });
  registry.get('combat').kill(ord, state.playerId);
  const infra = ss.impulses.find((i) => i.kind === 'infrastructure_loss');
  assert.ok(infra, 'ordinary station kill still books infrastructure_loss');
  assert.ok(infra.danger > 0);
});

test('dockless flag only exempts camps — ordinary stations stay dockable', () => {
  const sim = createSimulation({ seed: 47, systems: [] });
  const { state } = sim;
  const camp = sim.spawn({
    type: 'station', pos: { x: 0, z: 0 }, radius: 40, hull: 100, hullMax: 100,
    data: { baseKind: 'pirate_base', dockless: true },
  });
  const hub = sim.spawn({
    type: 'station', pos: { x: 100, z: 0 }, radius: 40, hull: 100, hullMax: 100,
    data: { stationTypeId: 'trade_hub' },
  });
  sim.runTicks(2);
  const idx = state.entityIndex;
  assert.ok(!idx.dockStations.includes(camp));
  assert.ok(idx.dockStations.includes(hub));
  assert.ok(idx.damageables.includes(camp) && idx.damageables.includes(hub));
});
