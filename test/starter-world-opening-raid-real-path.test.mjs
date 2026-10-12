// Production boot, no injected readiness: the opening raid adopts the working Helios ore barge.
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { heliosFreightTallies } from '../src/systems/traffic.js';

const LIMIT_S = 240;

function hullId(entity) {
  const data = entity && entity.data || {};
  return data.defId || data.shipId || entity && (entity.defId || entity.shipId) || null;
}

async function raidOnProductionSeed(seed) {
  os.setPriority?.(os.constants.priority.PRIORITY_LOW);
  const origin = sectorGlobalOrigin('sector_helios_prime');
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  try {
    const { state, bus } = runtime;
    state.mode = 'flight';
    state.settings.gameplay.tutorialHints = false;
    runtime.getSystem('ships').newGame();
    state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
      pos: { x: origin.x, z: origin.z }, rot: 0,
    })).id;
    runtime.getSystem('world').newGame();
    runtime.getSystem('economy').newGame();
    runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
    bus.emit('game:started', {});
    await runtime.getSystem('physics').prepareBackend(state, { reset: true });

    const tallied = [];
    bus.on('traffic:freightTallied', (payload) => tallied.push({ t: state.simTime, ...payload }));
    let raid = null;
    for (let second = 0; second < LIMIT_S && !raid; second++) {
      runtime.runTicks(60, 1 / 60);
      for (const live of Object.values(state.encounterDirector.live || {})) {
        if (live && live.shapeId === 'opening_hauler_raid' && live.phase !== 'telegraph') {
          raid = live;
          break;
        }
      }
    }
    assert.ok(raid, `seed ${seed}: opening raid must leave telegraph within ${LIMIT_S}s`);
    const adopted = raid.data && raid.data.adoptedCarrier;
    assert.ok(adopted, `seed ${seed}: the raid adopts the working barge instead of spawning the mule`);
    assert.equal(adopted.slotId, 'helios_starter_ore_carrier');
    const hauler = state.entities.get(adopted.entityId);
    assert.ok(hauler, `seed ${seed}: adopted hull is still in the world`);
    assert.equal(hullId(hauler), 'ship_ironback');
    assert.equal(hauler.data.activityActorSlotId, 'helios_starter_ore_carrier');
    assert.equal(raid.causality.adoptedWorkingBarge, true);
    assert.equal(raid.causality.manifestId, adopted.manifestId);
    assert.equal(raid.data.freightManifest.manifestId, adopted.manifestId);
    assert.equal(raid.causality.carrierWorldRecordId, hauler.data.worldRecordId);
    assert.equal(typeof raid.causality.commodityId, 'string');
    assert.ok(raid.causality.totalQty > 0);
    assert.match(raid.causality.evidence, new RegExp(adopted.manifestId));
    assert.equal(hauler.data.encounterFingerprint, raid.causality.fingerprint);
    const ledger = heliosFreightTallies(state);
    console.log([
      `REAL_PATH seed=${seed}`,
      `t=${state.simTime.toFixed(1)}`,
      `manifest=${adopted.manifestId}`,
      `qty=${raid.causality.totalQty}`,
      `commodity=${raid.causality.commodityId}`,
      `tallies=${ledger.length}`,
      `tallyEvents=${tallied.length}`,
    ].join(' '));
    return { seed, raid, tallied, ledger };
  } finally {
    runtime.dispose();
  }
}

test('production seed 4242: the opening raid hits the Helios ore barge and names its hold', { timeout: 240_000 }, async () => {
  const first = await raidOnProductionSeed(4242);
  assert.equal(first.raid.causality.adoptedWorkingBarge, true);
  assert.equal(first.raid.causality.commodityId, 'cmdty_silicate');
  assert.equal(first.tallied.length, 0, '4242 is intercepted before the tally post counts the hold');
});
