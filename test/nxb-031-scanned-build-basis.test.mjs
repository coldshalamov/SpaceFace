// NXB-031: a scanned ship's build badge reasons only over the fittings the
// scan actually disclosed, and the synergy line names its true prerequisite.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIdentity, classifyBuildIdentity } from '../src/systems/buildIdentity.js';
import { compactSynergy, synergiesForFittings } from '../src/data/synergies.js';
import { MODULES } from '../src/data/modules.js';

const MODULE_BY_ID = new Map(MODULES.map((mod) => [mod.id, mod]));

function rammerHauler() {
  return {
    id: 9001,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    data: {
      defId: 'ship_mule',
      role: 'freighter',
      fittings: ['mod_ram_plate', 'mod_cargo_pod_m'],
    },
  };
}

test('a class-band scan names the hull role without exposing the loadout', () => {
  const reveal = { entityId: 9001, quality: 'class', shipId: 'ship_mule' };
  const identity = classifyBuildIdentity(rammerHauler(), { reveal });
  assert.deepEqual(identity.basis.modules, [], 'no module basis leaked');
  assert.equal(identity.synergies.length, 0, 'no synergy claimed from unseen fittings');
  assert.equal(identity.confidence, 'role_fallback', 'falls back to the disclosed role');
});

test('a full scan discloses fittings and the matched synergy', () => {
  const reveal = { entityId: 9001, quality: 'full', shipId: 'ship_mule' };
  const identity = classifyBuildIdentity(rammerHauler(), { reveal });
  assert.equal(identity.id, 'rammer_truck');
  assert.equal(identity.synergies.length, 1);
  const synergy = identity.synergies[0];
  assert.equal(synergy.id, 'rammer_truck');
  // NXI-123: the line names its actual prerequisite parts, not raw ids.
  for (const id of synergy.modules) {
    const name = MODULE_BY_ID.get(id).name;
    assert.ok(synergy.requires.includes(name), `requires names ${name}`);
  }
  assert.ok(synergy.drawback.length > 0, 'drawback still stated');
});

test('duplicated fitting ids cannot inflate a synergy match (NXI-121)', () => {
  const dup = synergiesForFittings(['mod_ram_plate', 'mod_ram_plate', 'mod_cargo_pod_m']);
  const once = synergiesForFittings(['mod_ram_plate', 'mod_cargo_pod_m']);
  assert.deepEqual(dup.map((row) => row.id), once.map((row) => row.id));
  assert.equal(dup.length, 1, 'one rammer_truck row, no stacking');
  const identity = classifyBuildIdentity({
    data: { defId: 'ship_mule', role: 'freighter', fittings: ['mod_ram_plate', 'mod_ram_plate', 'mod_cargo_pod_m'] },
  });
  assert.equal(identity.synergies.length, 1);
});

test('a refit invalidates the stale badge on the next stamp (NXI-124)', () => {
  const entity = rammerHauler();
  const entities = new Map([[entity.id, entity]]);
  const state = { entities };
  const system = Object.create(buildIdentity);
  system.state = state;
  system.bus = { emit() {}, on() {}, off() {} };

  const full = { entityId: entity.id, quality: 'full', shipId: 'ship_mule' };
  const first = system._stampReveal(full, { emit: false });
  assert.equal(first.id, 'rammer_truck');

  // The plate is torn off; the stored reveal re-stamps on the next pulse and
  // must not keep advertising the dead synergy.
  entity.data.fittings = ['mod_cargo_pod_m'];
  const second = system._stampReveal(entity.data.scanRevealed || { entityId: entity.id, quality: 'full' }, { emit: false });
  assert.notEqual(second.id, 'rammer_truck');
  assert.equal(second.synergies.length, 0, 'combined-effect readout invalidated');
});

test('the synergy row itself carries the authored prerequisite', () => {
  const row = synergiesForFittings(['mod_ram_plate', 'mod_cargo_pod_m'])[0];
  const compact = compactSynergy(row);
  assert.ok(compact.requires.startsWith('fitted together:'));
  assert.ok(compact.requires.includes('Ram Plate'));
  assert.ok(compact.requires.includes('Cargo Pod M'));
});
