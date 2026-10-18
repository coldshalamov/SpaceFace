import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mulberry32 } from '../src/core/rng.js';
import { ActionVfx } from '../src/render/actionVfx.js';

const DT = 1 / 60;

for (const release of ['removed', 'replaced']) {
  test(`a ${release} charge owner releases its warning on the next VFX update`, () => {
    const ship = id => ({
      id, type: 'ship', alive: true, team: 1, radius: 12, rot: 0,
      pos: { x: id * 40, z: 0 }, vel: { x: 0, z: 0 }, data: { ai: {} },
    });
    const owner = ship(2), other = ship(3);
    const state = {
      simTime: 10, tick: 600, playerId: 1, rng: mulberry32(4242),
      entities: new Map([[owner.id, owner], [other.id, other]]), settings: { video: {} },
    };
    const vfx = new ActionVfx(new THREE.Scene());
    const chargeOwners = () => vfx.inspect().instances
      .filter(row => row.event === 'ai:telegraph' && row.kind === 'weapon_charge')
      .map(row => row.id);
    try {
      for (const entity of [owner, other]) assert.equal(vfx.emit('ai:telegraph', {
        entityId: entity.id, kind: 'weapon_charge', durationTicks: 90,
      }, state), true);
      state.simTime += DT;
      vfx.update(state);
      assert.deepEqual(chargeOwners(), [owner.id, other.id], 'living owners keep their warnings');

      // Core lifetime sweeping removes dead NPCs before the following VFX update.
      // Reusing an id must not transfer an old warning to the replacement body.
      state.entities.delete(owner.id);
      if (release === 'replaced') state.entities.set(owner.id, ship(owner.id));
      state.simTime += DT;
      vfx.update(state);
      assert.deepEqual(chargeOwners(), [other.id], `${release} owner must leave no charge warning`);
    } finally {
      vfx.dispose();
    }
  });
}
