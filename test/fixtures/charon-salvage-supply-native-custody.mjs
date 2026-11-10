// Opt-in bounded native custody controls. Collector bodies are spawned at contact
// as explicit setup; this is not an ordinary route or player flight proof.
import assert from 'node:assert/strict';
import { charonSupplyFixture } from './charon-salvage-supply-native.mjs';
import { charonSupplyFacts, charonSupplyPickupReceipt } from '../../src/world/charonSalvageSupply.js';
if (process.env.CHARON_NATIVE_CUSTODY === '1') {
  for (const claimed of [false, true]) {
    const f = await charonSupplyFixture();
    try {
      const p = f.state.entityList.find(e => e.alive && e.data?.charonSupplyPod),
        life = p.data.richLotSource.charonLife;
      const foreign = f.sim.spawn({
        type: 'ship',
        team: 2,
        pos: {
          ...p.pos
        },
        vel: {
          x: 0,
          z: 0
        },
        radius: 3,
        hull: 200,
        hullMax: 200,
        data: {
          name: 'Foreign custody control'
        }
      });
      if (claimed) {
        p.ownerId = f.state.playerId;
        p.data.ownerId = f.state.playerId;
      }
      f.sim.runTicks(1);
      let receipt = null;
      f.sim.bus.on('pickup:collected', event => {
        if (event.pickupId === p.id) receipt = event;
      });
      const result = f.physics._tryCollectPickup(p, foreign);
      if (claimed) {
        assert.equal(result, false);
        assert.equal(p.alive, true);
        assert.equal(charonSupplyFacts(f.state).other, 0);
      } else {
        assert.equal(result, true);
        assert.equal(receipt.richLotSource.charonLife, life);
        assert.equal(p.alive, false);
        assert.equal(charonSupplyFacts(f.state).other, 6);
        assert.equal(charonSupplyFacts(f.state).loose, 0);
        assert.equal(charonSupplyPickupReceipt(f.owner, receipt), false);
        assert.equal(charonSupplyFacts(f.state).other, 6);
      }
    } finally {
      f.sim.dispose();
    }
  }
  console.log('CHARON_NATIVE_CUSTODY_ASSERTED');
}
