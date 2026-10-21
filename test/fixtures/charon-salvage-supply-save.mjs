// Bounded Charon Save/Continue fixture; uses the production save/world owners,
// enters only Charon and never runs the unrelated full-game or receiver route.
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../../src/data/featureFlags.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
export function charonSupplySaveFixture() {
  const flags = snapshotFeatureMaps(),
    runtime = createAuthoritativeRuntime({
      profileId: 'production',
      nodeSafeOnly: true,
      seed: 4242
    });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state;
  state.mode = 'flight';
  state.ui.screenStack = [];
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    player: state.player,
    team: 0,
    pos: sectorLocalToGlobalForSector({
      x: -820,
      z: 1220
    }, 'sector_charon_expanse')
  }));
  state.playerId = player.id;
  runtime.getSystem('world').enterSector('sector_charon_expanse');
  const owner = runtime.getSystem('traffic'),
    save = runtime.getSystem('save');
  assert.ok(state.traffic.charonSalvageSupply, 'original Charon source admitted');
  return {
    state,
    runtime,
    owner,
    save,
    source: () => state.entityList.find(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod'),
    close() {
      runtime.dispose();
      restoreFeatureMaps(flags);
    }
  };
}
