// Bounded original encounter-source fixture. Movement proof keeps native physics and the
// machine running; source setup uses encounter 355 rather than minting a replacement batch.
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../../src/data/featureFlags.js';
import { VESTA_ORE_WINNOW } from '../../src/data/environmentalMachinery.js';
export async function vestaWinnowRecoveryFixture() {
  const flags = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state, owner = runtime.getSystem('traffic'), save = runtime.getSystem('save');
  state.mode = 'flight'; state.ui.screenStack = [];
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 } }));
  state.playerId = player.id;
  runtime.getSystem('world').enterSector('sector_vesta_forge');
  const tann = state.entityList.find(e => e.alive && e.data?.namedLaneContactId === 'lane_tann_slag_carrier');
  assert.ok(tann, 'existing original named Tann exists');
  const record = state.traffic.freighters.find(r => r.id === tann.id);
  assert.ok(record);
  const director=runtime.getSystem('encounterDirector');
  const requested=director.requestAuthoredEncounter({shapeId:'winnow_throw',encounterId:'winnow-original-fixture',sectorId:'sector_vesta_forge',anchor:{...VESTA_ORE_WINNOW.globalPos},force:true});
  assert.equal(requested.ok,true);
  const live=state.encounterDirector.live[requested.encounterId];
  const cast=live.ids.map(id=>({e:state.entities.get(id),role:live.roles[id]}));
  const pods = live.data.pods.map(id => state.entities.get(id));
  const batchId = live.data.winnowRecoveryBatchId;
  return { runtime, state, owner, save, tann, record, pods, batchId, cast, live,
    step(n = 1) { for (let i = 0; i < n; i++) runtime.step(1 / 60); },
    close() { runtime.dispose(); restoreFeatureMaps(flags); } };
}
