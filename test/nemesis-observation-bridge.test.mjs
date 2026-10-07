// The nemesis:observation channel shipped with its full trust gate (witnessing, per-style
// window dedupe, per-episode budget) but no production emitter — Orra could only learn from
// kills. These pin the technique bridge in systems/nemesis.js: the player's visible tool use
// during a live encounter classifies to a style and enters through the designed bus event.
import assert from 'node:assert/strict';
import test from 'node:test';

import { boot } from '../scripts/nemesis/harness.mjs';

function active(t) { return t.state.nemesis.active; }

test('player weapon fire during a live encounter lands as witnessed technique', () => {
  const t = boot({ sensors: true }); t.start();
  const a = active(t);
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  assert.equal(a.episode.counts.gunnery, 2);
  assert.equal(a.episode.sources.direct, 1);
  // Same 5s window: a second trigger pull does not stack another sample.
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  assert.equal(a.episode.counts.gunnery, 2);
  t.destroy();
});

test('ordnance, tether and field uses classify to their own styles', () => {
  const t = boot({ sensors: true }); t.start();
  const a = active(t);
  t.bus.emit('bombs:dropped', { ownerId: t.state.playerId });
  t.bus.emit('tether:attached', { actorId: t.state.playerId });
  const emitter = { id: 501, type: 'field_emitter', ownerId: t.state.playerId, alive: true,
    data: { fieldEmitter: true, ownerId: t.state.playerId } };
  t.state.entities.set(emitter.id, emitter);
  t.bus.emit('fields:deployed', { fieldId: 'f1', kind: 'well', sourceId: emitter.id });
  // A homing hardpoint is ordnance even though it arrives through combat:fire — but only in a
  // fresh window: one style admits at most one observation per 5 seconds by design.
  t.state.simTime += 6;
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_missile_rack_m' });
  assert.equal(a.episode.counts.ordnance, 4);
  assert.equal(a.episode.counts.tether, 2);
  assert.equal(a.episode.counts.field, 2);
  t.destroy();
});

test('the gyre throw and detonator credit count as player technique', () => {
  const t = boot({ sensors: true }); t.start();
  const a = active(t);
  t.bus.emit('gyre:thrown', { tick: t.state.tick });
  t.bus.emit('detonator:detonated', { killerId: t.state.playerId });
  assert.equal(a.episode.counts.tether, 2);
  assert.equal(a.episode.counts.ordnance, 2);
  t.destroy();
});

test('someone else\'s tool use is not the player\'s evidence', () => {
  const t = boot({ sensors: true }); t.start();
  const a = active(t);
  const npc = { id: 909, type: 'ship', hull: 50, hullMax: 50, alive: true, pos: { x: 5, z: 5 }, data: {} };
  t.state.entities.set(npc.id, npc);
  t.bus.emit('combat:fire', { ownerId: npc.id, weaponId: 'wpn_pulse_laser_m' });
  t.bus.emit('bombs:dropped', { ownerId: npc.id });
  t.bus.emit('tether:attached', { actorId: npc.id });
  t.bus.emit('mines:placed', { ownerId: npc.id });
  assert.equal(a.episode.total, 0);
  t.destroy();
});

test('nobody witnessing means nothing learned — the bridge never invents sight', () => {
  const t = boot({ sensors: false }); t.start();
  const a = active(t);
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  t.bus.emit('bombs:dropped', { ownerId: t.state.playerId });
  assert.equal(a.episode.total, 0);
  t.destroy();
});

test('a crew member who sees what the boss cannot still files the report', () => {
  const t = boot({ sensors: false }); t.start();
  const a = active(t);
  const crewId = a.crewIds.find((id) => id !== a.bossId);
  assert.ok(crewId != null, 'fixture encounter should field at least one escort');
  // The boss's frame loses the player; the named escort keeps them.
  t.helpers.aiSensors = { frameFor(id) {
    return { contacts: [{ id: t.state.playerId, visible: id !== a.bossId, valid: true, confidence: 1 }] };
  } };
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  assert.equal(a.episode.counts.gunnery, 1);
  assert.equal(a.episode.sources.report, 1);
  assert.equal(a.episode.sources.direct, 0);
  t.destroy();
});

test('evidence stops when the encounter ends or the player is not flying', () => {
  const t = boot({ sensors: true }); t.start();
  const a = active(t);
  t.state.mode = 'dock';
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  assert.equal(a.episode.total, 0);
  t.state.mode = 'flight';
  t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });
  assert.equal(a.episode.counts.gunnery, 2);
  t.destroy();
});
