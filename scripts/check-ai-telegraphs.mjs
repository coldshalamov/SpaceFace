#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ai as aiSystem } from '../src/systems/ai.js';

const DT = 0.1;

const first = runSuite();
const second = runSuite();
assert.deepEqual(second, first, 'AI readability harness must replay deterministically');

process.stdout.write(JSON.stringify({
  schema: 'spaceface.ai.readability.v1',
  deterministic: true,
  ...first,
}, null, 2) + '\n');

function runSuite() {
  return {
    attackRun: checkAttackTelegraph({ dps: 32, expectedKind: 'attackRun', minDelay: 0.5 }),
    alphaStrike: checkAttackTelegraph({ dps: 72, expectedKind: 'alphaStrike', minDelay: 0.8 }),
    visibleFlee: checkVisibleFlee(),
    formationBreak: checkFormationScatterRecovery(),
    barkCooldown: checkBarkCooldown(),
  };
}

function checkAttackTelegraph({ dps, expectedKind, minDelay }) {
  const h = makeHarness();
  const player = addShip(h, {
    id: 1,
    team: 0,
    x: 0,
    z: 0,
    name: 'Kestrel',
  });
  const npc = addShip(h, {
    id: 2,
    team: 1,
    x: -280,
    z: 0,
    rot: 0,
    name: expectedKind === 'alphaStrike' ? 'Corsair Heavy' : 'Reaver Scout',
    ai: { archetype: 'pirate', fsm: 'patrol', forcePlayerTarget: true },
    combat: { targetId: player.id },
    weapons: [{ defId: `fixture_${expectedKind}`, dps, dmg: dps, rof: 1, projSpeed: 420 }],
  });
  h.state.playerId = player.id;

  let firstFireAt = null;
  const fireSamples = [];
  for (let i = 0; i < 20; i++) {
    step(h);
    const firing = !!(npc.data.intent && npc.data.intent.fire);
    fireSamples.push({ t: h.lastUpdateAt, firing });
    if (firing && firstFireAt == null) firstFireAt = h.lastUpdateAt;
  }

  const telegraphs = eventsOf(h, 'ai:telegraph');
  assert.equal(telegraphs.length, 1, `${expectedKind} should emit one telegraph`);
  assert.equal(telegraphs[0].payload.entityId, npc.id);
  assert.equal(telegraphs[0].payload.kind, expectedKind);
  assert.notEqual(firstFireAt, null, `${expectedKind} should eventually fire`);
  assert(firstFireAt - telegraphs[0].at >= minDelay - 1e-9,
    `${expectedKind} telegraph must precede first fire by ${minDelay}s`);
  assert.equal(fireSamples.some((sample) => sample.t - telegraphs[0].at < minDelay - 1e-9 && sample.firing), false,
    `${expectedKind} must hold fire during telegraph`);

  return {
    kind: expectedKind,
    telegraphAt: round3(telegraphs[0].at),
    firstFireAt: round3(firstFireAt),
    delay: round3(firstFireAt - telegraphs[0].at),
  };
}

function checkVisibleFlee() {
  const h = makeHarness({ rngValues: [0.1, 0.05, 0.8, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.25, 0.35, 0.45, 0.55] });
  const player = addShip(h, { id: 1, team: 0, x: 0, z: 0, name: 'Kestrel' });
  const pirate = addShip(h, {
    id: 30,
    team: 1,
    x: -180,
    z: 0,
    rot: 0,
    name: 'Panic Reaver',
    hull: 12,
    hullMax: 100,
    ai: { archetype: 'pirate', fsm: 'patrol', forcePlayerTarget: true },
    combat: { targetId: player.id },
    loot: {
      drops: [
        { id: 'cmdty_stolen_goods', chance: 1, qtyRange: [1, 2] },
        { id: 'wpn_pulse_laser_s', chance: 1, qtyRange: [1, 1] },
      ],
    },
  });
  h.state.playerId = player.id;

  step(h);
  const flees = eventsOf(h, 'ai:flee');
  const barks = eventsOf(h, 'comms:popup');
  assert.equal(flees.length, 1, 'flee entry should emit ai:flee once');
  assert.equal(flees[0].payload.entityId, pirate.id);
  assert.equal(barks.length, 1, 'flee should emit one cooldown-gated comms bark');
  assert.equal(barks[0].payload.category, 'ambient');
  const pickups = h.spawned.filter((entity) => entity.type === 'pickup');
  assert(pickups.length >= 1 && pickups.length <= 2, 'flee panic should jettison 1-2 cargo pickups when chance rolls in');
  assert.equal(pickups.every((entity) => entity.data && entity.data.kind === 'cargo' && entity.data.commodityId.startsWith('cmdty_')), true,
    'flee panic pickups should be cargo commodity pickups');

  return {
    fleeEvents: flees.length,
    cargoPickups: pickups.length,
    barkCategory: barks[0].payload.category,
  };
}

function checkFormationScatterRecovery() {
  const h = makeHarness();
  const player = addShip(h, { id: 1, team: 0, x: 5000, z: 0, name: 'Distant Player' });
  const leader = addShip(h, {
    id: 10,
    team: 1,
    x: 0,
    z: 0,
    rot: 0,
    name: 'Wing Lead',
    ai: { archetype: 'pirate', squadId: 'patrol_wedge', preferredRole: 'leader' },
  });
  const left = addShip(h, {
    id: 11,
    team: 1,
    x: -120,
    z: 90,
    rot: 0,
    name: 'Left Wing',
    ai: { archetype: 'pirate', squadId: 'patrol_wedge', preferredRole: 'screen' },
  });
  const right = addShip(h, {
    id: 12,
    team: 1,
    x: 120,
    z: -90,
    rot: 0,
    name: 'Right Wing',
    ai: { archetype: 'pirate', squadId: 'patrol_wedge', preferredRole: 'support' },
  });
  h.state.playerId = player.id;

  step(h);
  const slot = left.data.ai.formationSlot;
  assert.equal(left.data.ai.formationRole, 'wingman', 'left wing should become a formation wingman');
  assert(slot, 'wingman should receive a wedge slot');
  assert(Math.abs(distance(slot, leader.pos) - 60) < 1e-6, 'wedge slot should be 60 wu behind the leader');

  leader.alive = false;
  step(h);
  assert.equal(eventsOf(h, 'ai:formationBroken').length, 1, 'leader death should emit one formationBroken');
  assert.equal(left.data.morale, 'scattered', 'left wing should scatter');
  assert.equal(right.data.morale, 'scattered', 'right wing should scatter');
  assert.equal(left.data.intent.fire, false, 'scattered wingmen must hold fire');
  assert.equal(left.data.intent.boost, true, 'scattered wingmen should flee-style boost');

  for (let i = 0; i < 90; i++) step(h);
  assert.notEqual(left.data.morale, 'scattered', 'left wing should recover after scatter window');
  assert.notEqual(right.data.morale, 'scattered', 'right wing should recover after scatter window');
  assert.equal(left.data.ai.formationRole, undefined, 'recovered wingmen should resume solo behavior');
  assert.equal(eventsOf(h, 'ai:formationBroken').length, 1, 'formationBroken must not spam while broken');

  return {
    groupId: eventsOf(h, 'ai:formationBroken')[0].payload.groupId,
    scatterRecovered: left.data.morale !== 'scattered' && right.data.morale !== 'scattered',
    brokenEvents: eventsOf(h, 'ai:formationBroken').length,
  };
}

function checkBarkCooldown() {
  const h = makeHarness();
  const player = addShip(h, { id: 1, team: 0, x: 0, z: 0, name: 'Kestrel' });
  h.state.playerId = player.id;
  for (let i = 0; i < 6; i++) {
    addShip(h, {
      id: 20 + i,
      team: 1,
      x: -260 - i * 8,
      z: (i - 2) * 18,
      rot: 0,
      name: `Brawler ${i + 1}`,
      ai: { archetype: 'pirate', fsm: 'patrol', forcePlayerTarget: true },
      combat: { targetId: player.id },
      weapons: [{ defId: `fixture_brawl_${i}`, dps: 32, dmg: 8, rof: 4, projSpeed: 420 }],
    });
  }

  step(h);
  const telegraphs = eventsOf(h, 'ai:telegraph');
  const barks = eventsOf(h, 'comms:popup');
  assert.equal(telegraphs.length, 6, 'six-ship brawl should telegraph all six attack runs');
  assert.equal(barks.length, 1, 'global AI bark cooldown should allow only one bark in the brawl tick');

  return {
    telegraphs: telegraphs.length,
    commsPopups: barks.length,
    lastAiBarkAt: round3(h.state.combat.lastAiBarkAt),
  };
}

function makeHarness(options = {}) {
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      aiShips: [],
      ships: [],
      collidables: [],
    },
    combat: { threatTables: new Map() },
    rng: scriptedRng(options.rngValues),
  };
  const bus = makeBus(state);
  const spawned = [];
  let nextId = 1000;
  const helpers = {
    queryRadius(pos, radius, out = []) {
      out.length = 0;
      for (const entity of state.entityList) out.push(entity);
      return out;
    },
    spawnEntity(spec) {
      const entity = normalizeEntity({ id: spec.id == null ? nextId++ : spec.id, ...spec });
      addEntity(state, entity);
      spawned.push(entity);
      bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
      return entity;
    },
  };
  const system = Object.create(aiSystem);
  system.init({ state, bus, helpers });
  return { state, bus, helpers, spawned, ai: system, lastUpdateAt: 0 };
}

function addShip(h, spec) {
  const entity = normalizeEntity({
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 40,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
    ...spec,
    pos: { x: spec.x, z: spec.z },
    data: {
      ai: spec.ai || null,
      combat: spec.combat || {},
      weapons: spec.weapons || [],
      loot: spec.loot || null,
      name: spec.name,
    },
  });
  addEntity(h.state, entity);
  return entity;
}

function normalizeEntity(spec) {
  return {
    id: spec.id,
    type: spec.type,
    alive: spec.alive !== false,
    collides: !!spec.collides,
    radius: spec.radius == null ? 2 : spec.radius,
    mass: spec.mass == null ? 1 : spec.mass,
    team: spec.team,
    name: spec.name,
    pos: spec.pos || { x: 0, z: 0 },
    vel: spec.vel || { x: 0, z: 0 },
    rot: spec.rot || 0,
    hull: spec.hull == null ? 1 : spec.hull,
    hullMax: spec.hullMax == null ? (spec.hull == null ? 1 : spec.hull) : spec.hullMax,
    cap: spec.cap == null ? 0 : spec.cap,
    capMax: spec.capMax == null ? 0 : spec.capMax,
    flags: spec.flags || {},
    data: spec.data || {},
  };
}

function addEntity(state, entity) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  if (entity.type === 'ship') state.entityIndex.ships.push(entity);
  if (entity.collides) state.entityIndex.collidables.push(entity);
  if (entity.data && entity.data.ai) state.entityIndex.aiShips.push(entity);
}

function step(h, dt = DT) {
  h.lastUpdateAt = h.state.simTime;
  h.ai.update(dt, h.state);
  h.state.simTime = round6(h.state.simTime + dt);
  h.state.tick++;
}

function makeBus(state) {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) { set = new Set(); listeners.set(event, set); }
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      events.push({ name: event, payload, at: state.simTime });
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of [...set]) fn(payload, event);
    },
  };
}

function eventsOf(h, name) {
  return h.bus.events.filter((event) => event.name === name);
}

function scriptedRng(customValues = null) {
  let i = 0;
  const values = customValues || [0.1, 0.7, 0.25, 0.9, 0.4, 0.6, 0.2, 0.8];
  return () => {
    const value = values[i % values.length];
    i++;
    return value;
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}
