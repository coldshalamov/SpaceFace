// Packet 02: the attention hierarchy. A telegraph being read is never deleted by a lesser answer
// (an explosion, a pull receipt, a nuisance tell); an imminent lethal tell may take the
// lowest-ranked plain answer instead of being refused; ranks follow consequence then time-to-contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ActionVfx } from '../src/render/actionVfx.js';
import {
  TELEGRAPH_CONSEQUENCE, chooseActionSlotVictim, slotRank, telegraphAdmissionPriority, telegraphConsequence,
} from '../src/presentation/telegraphPriority.js';
import { deriveVfxAdmissionMetadata } from '../src/presentation/vfxAdmissionPriority.js';

function world(n) {
  const entities = new Map();
  entities.set(1, { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 7, rot: 0 });
  for (let i = 0; i < n; i += 1) {
    entities.set(100 + i, { id: 100 + i, alive: true, pos: { x: 30 + i * 6, z: 20 + (i % 5) * 9 }, vel: { x: 0, z: 0 }, radius: 6, rot: 0, data: {} });
  }
  return { simTime: 1, playerId: 1, entities, settings: { video: {} }, fields: { active: [] } };
}

test('consequence orders the kinds: a lit fuse outranks a scan sweep; unknown reads as ordinary', () => {
  assert.ok(telegraphConsequence('detonator_fuse') > telegraphConsequence('attackRun'));
  assert.ok(telegraphConsequence('attackRun') > telegraphConsequence('engine_flare'));
  assert.ok(telegraphConsequence('engine_flare') > telegraphConsequence('scan_sweep'));
  assert.equal(telegraphConsequence('not-a-kind'), 0.6);
  for (const v of Object.values(TELEGRAPH_CONSEQUENCE)) assert.ok(v > 0 && v <= 1);
});

test('admission priority rises with time-to-contact and with being aimed at the player', () => {
  const early = telegraphAdmissionPriority({ kind: 'attackRun', elapsedTicks: 0, durationTicks: 90, onPlayer: true });
  const late = telegraphAdmissionPriority({ kind: 'attackRun', elapsedTicks: 80, durationTicks: 90, onPlayer: true });
  const elsewhere = telegraphAdmissionPriority({ kind: 'attackRun', elapsedTicks: 0, durationTicks: 90, onPlayer: false });
  const nuisance = telegraphAdmissionPriority({ kind: 'scan_sweep', elapsedTicks: 0, durationTicks: 90, onPlayer: true });
  assert.ok(late > early);
  assert.ok(early > elsewhere);
  assert.ok(early > nuisance);
  for (const p of [early, late, elsewhere, nuisance]) assert.ok(p >= 0.7 && p <= 1);
});

test('a doctrine telegraph cue outlives the player\'s own ordinary explosion in the shared pools', () => {
  const state = { playerId: 1, player: { targetId: null }, entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]) };
  const explosion = deriveVfxAdmissionMetadata({ sourceId: 1, targetId: 9, severity: 'high', position: { x: 10, z: 0 } }, state);
  const telegraph = deriveVfxAdmissionMetadata({
    sourceId: 9, targetId: 1, position: { x: 10, z: 0 },
    payload: { admissionPriority: telegraphAdmissionPriority({ kind: 'detonator_fuse', elapsedTicks: 40, durationTicks: 90, onPlayer: true }) },
  }, state);
  assert.ok(telegraph.admissionPriority > explosion.admissionPriority,
    `telegraph ${telegraph.admissionPriority} vs player explosion ${explosion.admissionPriority}`);
  // without the explicit priority the same tell would LOSE to that explosion — the defect
  const plain = deriveVfxAdmissionMetadata({ sourceId: 9, targetId: 1, position: { x: 10, z: 0 }, magnitude: 90 }, state);
  assert.ok(plain.admissionPriority < explosion.admissionPriority);
});

test('slot ranks: every telegraph outranks every plain answer; urgency lifts a telegraph', () => {
  const plain = { alive: true, event: 'well:capture', kind: null, born: 0, recipe: { life: 0.7, continuous: false } };
  const tool = { alive: true, event: 'beam:repaired', kind: null, born: 0, recipe: { life: 0.5, continuous: true } };
  const fresh = { alive: true, event: 'ai:telegraph', kind: 'scan_sweep', born: 1, recipe: { life: 1.6 } };
  assert.ok(slotRank(plain.event, null, plain, 1) < slotRank(fresh.event, fresh.kind, fresh, 1));
  assert.ok(slotRank(tool.event, null, tool, 1) < slotRank(plain.event, null, plain, 1));
  const aging = { ...fresh, born: 0 };
  assert.ok(slotRank('ai:telegraph', 'scan_sweep', aging, 1.5) > slotRank('ai:telegraph', 'scan_sweep', fresh, 1));
});

test('victim choice: only a telegraph displaces; it takes the lowest, oldest plain answer; never an equal-or-higher tell', () => {
  const mk = (event, kind, born, continuous = false) => ({ alive: true, event, kind, born, recipe: { life: 1.6, continuous } });
  const slots = [
    mk('ai:telegraph', 'attackRun', 0.9),
    mk('well:capture', null, 0.2),
    mk('beam:repaired', null, 0.5, true),
    mk('well:fling', null, 0.1),
  ];
  assert.equal(chooseActionSlotVictim(slots, { event: 'well:capture', kind: null }, 1), -1, 'a plain receipt never evicts anything');
  assert.equal(chooseActionSlotVictim(slots, { event: 'ai:telegraph', kind: 'detonator_fuse' }, 1), 2, 'the continuous tool beam is cheapest');
  slots[2].alive = false;
  assert.equal(chooseActionSlotVictim(slots, { event: 'ai:telegraph', kind: 'detonator_fuse' }, 1), 3, 'then the oldest plain answer');
  const allTells = [mk('ai:telegraph', 'attackRun', 0.9), mk('ai:telegraph', 'detonator_fuse', 0.9)];
  assert.equal(chooseActionSlotVictim(allTells, { event: 'ai:telegraph', kind: 'scan_sweep' }, 1), -1, 'a nuisance tell cannot displace lethal ones');
  assert.equal(chooseActionSlotVictim(allTells, { event: 'ai:telegraph', kind: 'attackRun' }, 1), -1, 'an equal tell does not displace its peer');
  const mixed = [mk('ai:telegraph', 'scan_sweep', 0.9), mk('ai:telegraph', 'detonator_fuse', 0.9)];
  assert.equal(chooseActionSlotVictim(mixed, { event: 'ai:telegraph', kind: 'detonator_fuse' }, 1), 0, 'a lethal tell may take a nuisance tell\'s slot');
});

test('ActionVfx: a full pool refuses lesser answers but admits a telegraph by displacing a plain answer', () => {
  const s = world(40);
  const out = new ActionVfx(new THREE.Scene());
  try {
    // fill all 32 slots with plain receipts on distinct bodies
    let accepted = 0;
    for (let i = 0; i < 40; i += 1) {
      s.simTime += 0.15;
      if (out.emit('well:capture', { targetId: 100 + i, victimId: 100 + i, sourceId: 1, pos: { x: 30 + i, z: 20 } }, s)) accepted += 1;
    }
    assert.equal(out.inspect().active, 32);
    assert.equal(accepted, 32, 'the 33rd+ plain receipt is refused, as before');
    // an explosion-class plain answer cannot take a slot either
    assert.equal(out.emit('well:fling', { targetId: 139, victimId: 139, sourceId: 1, pos: { x: 90, z: 20 } }, s), false);
    // a telegraph from a live hull is admitted by displacing the lowest-ranked plain answer
    s.entities.get(101).rot = 0;
    const ok = out.emit('ai:telegraph', { entityId: 101, targetId: 1, kind: 'attackRun', durationTicks: 90 }, s);
    assert.equal(ok, true, 'a lethal tell is not refused for want of a slot');
    const tells = out.inspect().instances.filter((x) => x.event === 'ai:telegraph');
    assert.equal(tells.length, 1);
    assert.equal(out.inspect().active, 32, 'the pool is still at capacity (one plain answer was displaced)');
    // fill the rest with tells, then verify none are evicted by plain answers or lesser tells
    for (let i = 0; i < 40; i += 1) {
      s.simTime += 0.01;
      out.emit('ai:telegraph', { entityId: 100 + i, targetId: 1, kind: 'detonator_fuse', durationTicks: 90 }, s);
    }
    const lethal = out.inspect().instances.filter((x) => x.event === 'ai:telegraph');
    assert.equal(lethal.length, 32, 'the pool fills with tells, plain answers displaced first');
    assert.equal(out.emit('ai:telegraph', { entityId: 105, targetId: 1, kind: 'scan_sweep', durationTicks: 90 }, s), false);
    assert.equal(out.emit('well:capture', { targetId: 102, victimId: 102, sourceId: 1, pos: { x: 35, z: 20 } }, s), false);
    assert.equal(out.inspect().instances.filter((x) => x.event === 'ai:telegraph').length, 32, 'no tell was evicted');
  } finally {
    out.dispose();
  }
});
