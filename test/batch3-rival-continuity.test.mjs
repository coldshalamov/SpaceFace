import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../scripts/nemesis/harness.mjs';

const fire = (t) => t.bus.emit('combat:fire', { ownerId: t.state.playerId, weaponId: 'wpn_pulse_laser_m' });

test('unseen tool use leaves the same five-second window available for a real sighting', () => {
  const t = boot({ sensors: false }); const a = t.start();
  fire(t);
  assert.equal(a.episode.total, 0);
  t.helpers.aiSensors = { frameFor(id) { return { contacts: [{ id: t.state.playerId,
    visible: id === a.bossId, valid: true, confidence: 1 }] }; } };
  fire(t); fire(t);
  assert.equal(a.episode.counts.gunnery, 2);
  assert.equal(a.episode.sources.direct, 1);
  t.destroy();
});

test('a replaced escort cannot consume the report window before a valid escort sees the act', () => {
  const t = boot({ sensors: false, budgetCap: 4 }); const a = t.start();
  const crew = a.crewIds.filter((id) => id !== a.bossId);
  assert.ok(crew.length);
  const first = t.state.entities.get(crew[0]);
  first.data.nemesis.encounterId = 'unrelated';
  t.helpers.aiSensors = { frameFor(id) { return { contacts: [{ id: t.state.playerId,
    visible: id === crew[0], valid: true, confidence: 1 }] }; } };
  fire(t); assert.equal(a.episode.total, 0);
  first.data.nemesis.encounterId = a.id;
  fire(t); fire(t);
  assert.equal(a.episode.counts.gunnery, 1);
  assert.equal(a.episode.sources.report, 1);
  t.destroy();
});

test('a replacement captain sensor cannot spend Orra\'s direct observation window', () => {
  const t = boot(); const a = t.start();
  const boss = t.state.entities.get(a.bossId);
  t.helpers.aiSensors = { frameFor(id) { return { contacts: [{ id: t.state.playerId,
    visible: id === a.bossId, valid: true, confidence: 1 }] }; } };
  boss.data.nemesis.encounterId = 'unrelated';
  fire(t);
  assert.equal(a.episode.total, 0);
  boss.data.nemesis.encounterId = a.id;
  fire(t);
  assert.equal(a.episode.counts.gunnery, 2);
  t.destroy();
});

test('late spare, escape and kill callbacks cannot settle an unrelated replacement captain', () => {
  const t = boot(); const a = t.start();
  const boss = t.state.entities.get(a.bossId);
  a.surrenderedAt = t.state.simTime;
  a.retreatAt = t.state.simTime - 7;
  boss.pos = { x: 1900, z: 0 };
  boss.data.nemesis.encounterId = 'unrelated';
  t.bus.emit('nemesis:spare', { encounterId: a.id });
  t.bus.emit('nemesis:escaped', { encounterId: a.id, bossId: a.bossId });
  t.bus.emit('entity:killed', { id: a.bossId, killerId: t.state.playerId });
  assert.equal(t.state.nemesis.active, a);
  assert.equal(t.state.nemesis.completed, 0);
  assert.equal(a.episode.total, 0);
  boss.data.nemesis.encounterId = a.id;
  t.bus.emit('nemesis:spare', { encounterId: a.id });
  assert.equal(t.state.nemesis.ending, 'spared');
  assert.equal(t.state.nemesis.completed, 1);
  t.destroy();
});

test('a valid removed-captain kill receipt still resolves the current encounter', () => {
  const t = boot(); const a = t.start();
  t.state.entities.delete(a.bossId);
  t.bus.emit('entity:killed', { id: a.bossId, killerId: t.state.playerId });
  assert.equal(t.state.nemesis.ending, 'destroyed');
  assert.equal(t.state.nemesis.completed, 1);
  t.destroy();
});

test('Continue cannot retain a discarded future observation window over the restored episode', () => {
  const t = boot({ sensors: true }); t.start();
  const saved = t.engine.serialize();
  fire(t);
  assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2);
  t.engine.deserialize(saved);
  t.bus.emit('save:loaded', {});
  assert.equal(t.state.nemesis.active.episode.total, 0);
  fire(t); fire(t);
  assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2,
    'the restored current captain admits one real sighting instead of inheriting future private dedupe');
  const observedSave = t.engine.serialize();
  t.engine.deserialize(observedSave);
  t.bus.emit('save:loaded', {});
  fire(t);
  assert.equal(t.state.nemesis.active.episode.counts.gunnery, 2,
    'an observation contained in the loaded save remains once-only');
  t.destroy();
});
