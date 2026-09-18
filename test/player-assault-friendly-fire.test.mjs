// Player assault must pass the NPC IFF team gate: neutral team-0 stations, civilians,
// and ambient ships share the player's default team, so gating the player on team silently
// blocks the designed assault-to-dispatch loop (law opens player_assault off combat:damage,
// which routeDamage never emits for a rejected packet). The gate still protects NPC IFF
// and the player's own deployables/devices.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { combat } from '../src/systems/combat.js';

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function makePlayer() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    pos: vec(0, 0),
    prevPos: vec(0, 0),
    vel: vec(0, 0),
    rot: 0,
    flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 140,
    hullMax: 140,
    armorHp: 0,
    armorMax: 0,
    shield: 0,
    shieldMax: 0,
    cap: 80,
    capMax: 80,
  };
}

function makeState(extras = []) {
  const player = makePlayer();
  const entities = new Map([[1, player]]);
  const entityList = [player];
  for (const e of extras) {
    entities.set(e.id, e);
    entityList.push(e);
  }
  return {
    tick: 300,
    simTime: 5,
    playerId: 1,
    meta: { seed: 47 },
    settings: { gameplay: { difficulty: 'standard' } },
    content: {},
    input: {},
    player: { credits: 5000 },
    entities,
    entityList,
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
  };
}

function route(state, events, attackerId, targetId, damage = 40) {
  const target = state.entities.get(targetId);
  combat.init({ state, bus: { on() { return () => {}; }, emit(event, payload) { events.push({ event, payload }); } }, helpers: {}, registry: { get() { return null; } } });
  return combat.ensureKernel().routeDamage({
    attackerId,
    targetId,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic', pos: { ...(target.pos || { x: 0, z: 0 }) } }),
    origin: { kind: 'test', id: 'player-assault-gate' },
  });
}

function makeStation() {
  return {
    id: 2,
    type: 'station',
    alive: true,
    team: 0,
    factionId: 'faction_scn',
    pos: vec(280, -140),
    prevPos: vec(280, -140),
    vel: vec(0, 0),
    rot: 0,
    radius: 42,
    mass: 1e6,
    flags: {},
    data: { stationId: 'station_helios' },
    hull: 1e6,
    hullMax: 1e6,
    armorHp: 0,
    armorMax: 0,
    shield: 0,
    shieldMax: 0,
  };
}

test('player fire on a neutral same-team station is routed, not friendly-fire rejected', () => {
  const state = makeState([makeStation()]);
  const events = [];
  const before = state.entities.get(2).hull;
  const result = route(state, events, 1, 2);
  assert.equal(result.ok, true, `expected routed damage, got ${result.reason}`);
  assert.ok(state.entities.get(2).hull < before, 'station hull must take the hit');
  assert.ok(events.some((entry) => entry.event === 'combat:damage'
    && entry.payload.attackerId === 1 && entry.payload.targetId === 2),
  'law must see combat:damage for the assault so player_assault can open');
});

test('NPC same-team fire on the station stays friendly-fire rejected', () => {
  const npc = {
    id: 9, type: 'ship', alive: true, team: 0, factionId: 'faction_free',
    pos: vec(0, 80), prevPos: vec(0, 80), vel: vec(0, 0), rot: 0, flags: {}, data: {},
    hull: 100, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
  const state = makeState([npc, makeStation()]);
  const events = [];
  const result = route(state, events, 9, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'friendly_fire');
});

test('player fire on their own owner-marked mine stays friendly-fire rejected', () => {
  const mine = {
    id: 11, type: 'mine', alive: true, team: 0, ownerId: 1, factionId: 'faction_free',
    pos: vec(10, 0), prevPos: vec(10, 0), vel: vec(0, 0), rot: 0, flags: {}, data: { kind: 'vector_mine', ownerId: 1 },
    hull: 28, hullMax: 28, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
  const state = makeState([mine]);
  const events = [];
  const result = route(state, events, 1, 11);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'friendly_fire');
});

test('player fire on their own faction drone stays friendly-fire rejected', () => {
  const drone = {
    id: 12, type: 'drone', alive: true, team: 0, factionId: 'faction_player',
    pos: vec(10, 0), prevPos: vec(10, 0), vel: vec(0, 0), rot: 0, flags: {}, data: { kind: 'mining_drone' },
    hull: 40, hullMax: 40, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
  const state = makeState([drone]);
  const events = [];
  const result = route(state, events, 1, 12);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'friendly_fire');
});

test('player fire on a hostile ship still routes (unchanged path)', () => {
  const hostile = {
    id: 13, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: vec(0, 80), prevPos: vec(0, 80), vel: vec(0, 0), rot: 0, flags: {}, data: {},
    hull: 100, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
  const state = makeState([hostile]);
  const events = [];
  const result = route(state, events, 1, 13);
  assert.equal(result.ok, true, `expected routed damage, got ${result.reason}`);
});
