import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldHud } from '../src/ui/fieldHud.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

test('an enemy clearing cone cannot claim the player is projecting a cone', () => {
  const npc = { kind: 'cone', tag: 'npc', ownerId: 8, engaged: true };
  assert.equal(fieldHud._resolve({ active: [npc] }, 2, null).text, '');
  const own = { kind: 'repulsor', ownerId: 1, expireAt: 8, engaged: true };
  assert.equal(fieldHud._resolve({ active: [npc, own] }, 2, null).text, 'REPULSOR — ENGAGED 6s');
});

test('breaking an enemy shield celebrates at that hull without claiming the player lost shields', () => {
  const applied = [];
  const adapter = Object.assign({}, presentationAdapters, {
    state: { playerId: 1, tick: 1, simTime: 1 }, _applied: 0,
    bus: { emit: (_event, payload) => applied.push(payload) },
    _applyCamera: () => 'camera', _applyVfx: () => 'vfx', _applyAudio: () => 'audio',
    _applyUi: () => 'ui', _applyAccessibility: () => 'caption',
  });
  adapter._applyCue({ id: 'shield.collapse', targetId: 2, sourceId: 1, playerRelevance: 0.88 });
  assert.deepEqual(applied[0].outputs, { vfx: 'vfx', audio: 'audio' });
  adapter._applyCue({ id: 'shield.collapse', targetId: 1, sourceId: 2, playerRelevance: 1 });
  assert.equal(applied[1].outputs.ui, 'ui');
  assert.equal(applied[1].outputs.accessibility, 'caption');
  assert.equal(applied[1].outputs.camera, 'camera');
});
