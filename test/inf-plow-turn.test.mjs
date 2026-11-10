// inf-plow-turn — the fence law's other half. The wake-corridor counterplay names "displace
// the fence with a field" as a physical solution, and the Massline throw already honors the
// player's custody (playerThrown: the mine trips on anyone, the player's credit). A mine the
// PILOT'S OWN FIELD is moving now turns the same way: the fields owner vouches for whose
// accepted force moved the body, mines turns it (stamped, armed on the spot, one band line),
// and the trigger law + kill credit follow the custody.
//
// Harness mirrors inf-current-rider: real fields + mines owners, no renderer, no native
// physics requirement.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { fields } from '../src/systems/fields.js';
import { mines, MINE_THROW_GRACE_S } from '../src/systems/mines.js';

function fixture(t) {
  const prior = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 1, systems: [fields, mines] });
  t.after(() => { sim.dispose(); FIELD_FLAGS.enabled = prior; });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  state.playerId = player.id;
  const jackal = sim.spawn({ type: 'ship', team: 1, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  const events = [];
  bus.on('mines:turned', (p) => events.push({ event: 'mines:turned', p }));
  bus.on('mines:armed', (p) => events.push({ event: 'mines:armed', p }));
  bus.on('voice:say', (p) => events.push({ event: 'voice:say', p }));
  bus.on('combat:routeDamage', (p) => events.push({ event: 'combat:routeDamage', p }));
  bus.on('combat:damage', (p) => events.push({ event: 'combat:damage', p }));
  bus.on('mines:triggered', (p) => events.push({ event: 'mines:triggered', p }));
  const mineOwner = sim.registry.get('mines');
  const fieldOwner = sim.registry.get('fields');
  return { sim, state, bus, events, player, jackal, mineOwner, fieldOwner };
}

function place(h, { pos, ownerId, team, armDelayS = 0 }) {
  return h.mineOwner.placeMine({ ownerId, team, pos, armDelayS, telegraph: false });
}

test('a fence mine the pilot\'s plow is moving turns, arms and says so', t => {
  const h = fixture(t);
  // The jackal's fence, sitting off-axis inside the player's repulsor wedge (dead center of a
  // radial field is the degenerate zero-force point).
  const mine = place(h, { pos: { x: 200, z: 0 }, ownerId: h.jackal.id, team: 1 });
  assert.ok(mine && mine.data.armed, 'the fence mine is live and armed');
  h.fieldOwner.registerExternal({ id: 'plow', kind: 'repulsor', center: { x: 140, z: 0 },
    radius: 160, strength: 300, damping: 0, falloff: 1, ownerId: h.player.id });

  const x0 = mine.pos.x;
  h.sim.step(SIM_DT);
  h.sim.step(SIM_DT);
  assert.ok(mine.data.playerPushed === true, 'the player\'s accepted field force turned the mine');
  assert.ok(mine.data.pushedBy === h.player.id);
  assert.ok(h.events.some((e) => e.event === 'mines:turned' && e.p.mineId === mine.id), 'the turn receipt is on the wire');
  const voices = h.events.filter((e) => e.event === 'voice:say' && e.p.id === 'mine-turned');
  assert.equal(voices.length, 1, 'one band line per mine, not one per tick');
  h.sim.step(SIM_DT);
  h.sim.step(SIM_DT);
  assert.equal(h.events.filter((e) => e.event === 'voice:say' && e.p.id === 'mine-turned').length, 1,
    'the band line stays told once');
  const pushedOwners = h.fieldOwner.readAcceptedFieldOwnerIds(mine);
  assert.ok(pushedOwners === null || pushedOwners.some((o) => String(o) === String(h.player.id)),
    'the fields owner vouches the moving force is the pilot\'s');
  assert.ok(!mine.data.triggered);
});

test('a turned mine trips on the pack that laid it, and pays the pilot\'s credit', t => {
  const h = fixture(t);
  const mine = place(h, { pos: { x: 200, z: 0 }, ownerId: h.jackal.id, team: 1 });
  // The pack: a same-team hull inside the trigger disc. Loyal IFF would never fire here; the
  // turned mine takes the nearest hull in radius the tick after custody lands.
  const packmate = h.sim.spawn({ type: 'ship', team: 1, pos: { x: 230, z: 0 }, vel: { x: 0, z: 0 },
    hull: 60, hullMax: 60, radius: 9, mass: 24, collides: true, data: {} });
  h.fieldOwner.registerExternal({ id: 'plow', kind: 'repulsor', center: { x: 140, z: 0 },
    radius: 160, strength: 300, damping: 0, falloff: 1, ownerId: h.player.id });

  h.sim.step(SIM_DT);
  h.sim.step(SIM_DT);
  assert.ok(mine.data.playerPushed === true, 'the plow turned the mine');
  assert.ok(mine.data.triggered, 'the turned mine trips on the pack that laid it');
  const hit = h.events.find((e) => e.event === 'combat:damage' && e.p.targetId === packmate.id);
  assert.ok(hit, 'the blast routes through the damage owner');
  assert.equal(String(hit.p.attackerId), String(h.player.id), 'the kill pays the pilot\'s credit');
  assert.ok(hit.p.applied > 0, 'the packmate took the real packet');
  assert.ok(h.events.some((e) => e.event === 'mines:triggered' && e.p.targetId === packmate.id));
});

test('a loyal mine the player never touched keeps its IFF; an NPC field never turns one', t => {
  const h = fixture(t);
  const loyal = place(h, { pos: { x: 200, z: 0 }, ownerId: h.jackal.id, team: 1 });
  const packmate = h.sim.spawn({ type: 'ship', team: 1, pos: { x: 230, z: 0 }, vel: { x: 0, z: 0 },
    hull: 60, hullMax: 60, radius: 9, mass: 24, collides: true, data: {} });
  // An NPC-owned field moves the fence — the field's force is real, but it is not the pilot's.
  h.fieldOwner.registerExternal({ id: 'npcplow', kind: 'repulsor', center: { x: 140, z: 0 },
    radius: 160, strength: 300, damping: 0, falloff: 1, ownerId: h.jackal.id });
  for (let i = 0; i < 3; i++) h.sim.step(SIM_DT);
  assert.ok(loyal.data.playerPushed !== true, 'an NPC field cannot turn an NPC mine');
  assert.ok(loyal.alive !== false, 'the loyal mine still ignores its teammate');

  // And a mine with no field on it at all stays quiet.
  const quiet = place(h, { pos: { x: 600, z: 0 }, ownerId: h.jackal.id, team: 1 });
  h.sim.step(SIM_DT);
  assert.ok(quiet.data.playerPushed !== true, 'no field, no turn');
  assert.ok(quiet.alive !== false);
});

test('a fence mine the plow shoves onto the pilot honors the short grace, then trips', t => {
  const h = fixture(t);
  // The pilot sits inside the trigger disc (40 wu < 55): without custody this mine hunts them.
  const mine = place(h, { pos: { x: 40, z: 0 }, ownerId: h.jackal.id, team: 1, armDelayS: 0 });
  h.fieldOwner.registerExternal({ id: 'plow', kind: 'repulsor', center: { x: 20, z: 0 },
    radius: 120, strength: 300, damping: 0, falloff: 1, ownerId: h.player.id });
  h.sim.step(SIM_DT);
  h.sim.step(SIM_DT);
  assert.ok(mine.data.playerPushed === true, 'turned');
  const pushedAt = Number(mine.data.pushedAt) || 0;
  h.mineOwner.update(1 / 60, h.state);
  assert.ok(!mine.data.triggered, 'inside the grace the turned mine will not cook the pilot');
  assert.ok((h.state.simTime || 0) - pushedAt < MINE_THROW_GRACE_S, 'the grace window is live');
  h.state.simTime = pushedAt + MINE_THROW_GRACE_S + 1 / 60;
  h.mineOwner.update(1 / 60, h.state);
  assert.ok(mine.data.triggered, 'after the grace the turned mine trips on the nearest hull');
  const hit = h.events.find((e) => e.event === 'combat:damage' && e.p.targetId === h.player.id);
  assert.ok(hit && String(hit.p.attackerId) === String(h.player.id),
    'the shove-onto-self blast still pays the pilot\'s line');
});

test('an unarmed fence mine the plow shoves arms on the spot', t => {
  const h = fixture(t);
  const mine = place(h, { pos: { x: 200, z: 0 }, ownerId: h.jackal.id, team: 1, armDelayS: 30 });
  assert.ok(!mine.data.armed, 'the fuse is still burning');
  h.fieldOwner.registerExternal({ id: 'plow', kind: 'repulsor', center: { x: 140, z: 0 },
    radius: 160, strength: 300, damping: 0, falloff: 1, ownerId: h.player.id });
  h.sim.step(SIM_DT);
  assert.ok(mine.data.playerPushed === true, 'the push takes custody');
  assert.ok(mine.data.armed === true, 'a turned mine arms immediately, like a thrown one');
  assert.ok(h.events.some((e) => e.event === 'mines:armed' && e.p.pushed === true),
    'the arming receipt names the push');
});

test('the pilot\'s own mines never turn — the field force is already theirs', t => {
  const h = fixture(t);
  const mine = place(h, { pos: { x: 200, z: 0 }, ownerId: h.player.id, team: 0 });
  h.fieldOwner.registerExternal({ id: 'plow', kind: 'repulsor', center: { x: 140, z: 0 },
    radius: 160, strength: 300, damping: 0, falloff: 1, ownerId: h.player.id });
  h.sim.step(SIM_DT);
  assert.ok(mine.data.playerPushed !== true, 'no custody stamp on an owned mine');
  assert.ok(!h.events.some((e) => e.event === 'mines:turned'), 'no turn receipt for an owned mine');
});
