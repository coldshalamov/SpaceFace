import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import { createGameplayWorldEvents } from '../scripts/lib/vfxGameplayWorldEvents.mjs';

for (const scenario of ['world-bank-stone', 'world-ricochet-mirror']) {
  test(`${scenario} reaches native bank geometry at the receipted contact`, () => {
    const scene = new THREE.Scene();
    const ship = { id: 1, type: 'ship', alive: true, pos: { x: -24, z: 0 },
      vel: { x: 0, z: 0 }, rot: 0, radius: 7, mass: 15, data: {} };
    const target = { id: 2, type: 'asteroid', alive: true, pos: { x: 23, z: -3 },
      vel: { x: 0, z: 0 }, rot: 0, radius: 11, mass: 40, data: {} };
    const state = { simTime: 0, tick: 0, playerId: 1, player: {}, mode: 'flight',
      entities: new Map([[1, ship], [2, target]]), entityList: [ship, target],
      settings: { video: {}, accessibility: {} }, world: {}, render: { scene } };
    const bus = createBus(), system = Object.create(vfx);
    system.init({ state, bus, helpers: { player: () => ship } });
    const requests = [];
    const spawn = system._spawnArcadeStructuralBurst;
    system._spawnArcadeStructuralBurst = function(request) {
      requests.push({ ...request });
      return spawn.call(this, request);
    };
    const fixture = createGameplayWorldEvents({ state, owner: { fireEvent: (name, payload) => bus.emit(name, payload) } });
    try {
      fixture.reset(scenario); state.simTime = .2; fixture.update();
      const payload = fixture.inspect().events[0].payload;
      assert.equal(requests.length, 1, 'one native bank structure per continuation');
      assert.equal(requests[0].cause, 'bank');
      assert.equal(requests[0].x, payload.receipt.point.x);
      assert.equal(requests[0].z, payload.receipt.point.z);
      assert.notEqual(requests[0].x, target.pos.x, 'contact does not collapse to body center');
      assert.equal(requests[0].dirX, payload.outgoing.x);
      assert.equal(requests[0].dirZ, payload.outgoing.z);
      const counts = system._arcadeStructural.stats();
      assert.ok(counts.blades.spawned + counts.arcs.spawned + counts.shards.spawned > 0,
        'native pooled geometry is populated, not only a presentation cue');
    } finally { fixture.reset(); system.destroy(); }
  });
}
