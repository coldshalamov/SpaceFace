// INFERENCE WF-15 — the arena hazard the physics turns into a weapon.
// The survival rooms' crusher computed a `crushed` verdict every tick (surge jaws + anvil
// reach + crumple-speed closing) and survivalArena threw it away: the bark promised "clear
// the jaws" and nothing ever happened. The bite is now the terrain-crumple law's own reading,
// routed through the combat kernel, credited to whoever set the body moving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { terrainCrumpleDamage, TERRAIN_CRUMPLE_LAW, recordImpulseProvenance } from '../src/combat/impulseKernel.js';

const TOY = { id: 'crusher_a1', kind: 'crusher', pos: { x: 0, z: 0 }, anvil: { x: 0, z: -40 },
  radius: 72, strength: 1, dir: { x: 0, z: -1 } };

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.run = state.run && typeof state.run === 'object' ? state.run : {};
  state.run.arenaId = 'arena_test';
  state.combat = state.combat && typeof state.combat === 'object' ? state.combat : { entities: {} };
  const bus = createBus();
  const player = { id: 'pilot', type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: -20 }, vel: { x: 0, z: -60 }, hull: 200, hullMax: 200,
    data: {}, mass: 20, radius: 8 };
  state.entities.set('pilot', player);
  state.playerId = 'pilot';
  const ctx = { state, bus, helpers: {} };
  const room = Object.create(survivalArena);
  room.ctx = ctx;
  room.bus = bus;
  return { state, bus, player, room };
}

const crushAt = (speed) => ({ crushed: true, speed, phase: 'surge', dist: 10,
  pos: { x: 0, z: -30 }, vel: { x: 0, z: -speed } });

test('the crumple law reading: capped at the reference mass, zero under the scrape floor', () => {
  assert.equal(terrainCrumpleDamage(20, 16), 0, 'under the threshold it is a scrape, not a crumple');
  assert.equal(terrainCrumpleDamage(60, 16), TERRAIN_CRUMPLE_LAW.maxDamage,
    'a reference-mass hull at 60 WU/s hits the law cap');
  const light = terrainCrumpleDamage(45, 60);
  assert.ok(light > 0 && light < TERRAIN_CRUMPLE_LAW.maxDamage,
    'a heavier hull takes the inverse-mass fraction, not the cap');
});

test('the jaws bite: damage lands through the combat kernel and the receipt is spoken', () => {
  const { state, bus, room } = boot();
  const victim = { id: 51, type: 'ship', alive: true, team: 3,
    pos: { x: 0, z: -30 }, vel: { x: 0, z: -60 }, hull: 300, hullMax: 300,
    mass: 40, radius: 10, data: {} };
  state.entities.set(51, victim);
  const receipts = [];
  bus.on('combat:crushed', (p) => receipts.push(p));

  room._crushBody(victim, TOY, crushAt(60), state);

  assert.ok(receipts.length === 1, 'one crush receipt');
  assert.ok(receipts[0].damage > 0, 'the receipt carries the law reading');
  assert.ok(victim.hull < 300, 'the hull actually lost points through the kernel');
  assert.equal(receipts[0].attackerId, 'arena_test', 'no shover: the room itself is the actor');

  const hullAfterFirst = victim.hull;
  room._crushBody(victim, TOY, crushAt(60), state);
  assert.ok(receipts.length === 1, 'the half-second grind cooldown holds');
  assert.equal(victim.hull, hullAfterFirst, 'no double receipt inside the cooldown');
});

test('a hull the pilot threw into the jaws is the pilot kill', () => {
  const { state, bus, room, player } = boot();
  const victim = { id: 52, type: 'ship', alive: true, team: 3,
    pos: { x: 0, z: -30 }, vel: { x: 0, z: -60 }, hull: 60, hullMax: 60,
    mass: 16, radius: 10, data: {} };
  state.entities.set(52, victim);
  // The same provenance the collision law reads: the pilot set this hull moving.
  recordImpulseProvenance(victim, { actorId: player.id, weaponId: 'massline',
    tag: 'massline_throw', appliedTick: state.tick - 10, magnitude: 900 });

  const kills = [];
  bus.on('entity:killed', (p) => kills.push(p));
  room._crushBody(victim, TOY, crushAt(60), state);

  assert.ok(kills.length >= 1, 'the crumpled hull dies');
  const kill = kills.find((k) => k.id === 52);
  assert.ok(kill, 'the kill receipt names the victim');
  assert.equal(kill.killerId, 'pilot', 'the shover keeps the kill');
  assert.equal(victim.alive, false);
});

test('the room never crumples the pilot', () => {
  const { state, bus, room, player } = boot();
  const receipts = [];
  bus.on('combat:crushed', (p) => receipts.push(p));
  room._crushBody(player, TOY, crushAt(60), state);
  assert.equal(receipts.length, 0, 'no crush receipt for the player');
  assert.equal(player.hull, 200, 'the jaws shove the pilot, they never bite them');
});
