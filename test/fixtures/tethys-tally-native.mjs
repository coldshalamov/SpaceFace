import assert from 'node:assert/strict';
import { tickFarActors } from '../../src/world/farActorTable.js';
import { createSimulation } from '../../src/core/sim.js';
import { applyFrameOrigin, snapFrameOrigin } from '../../src/core/coordinates.js';
import { physics } from '../../src/core/physics.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../../src/runtime/authoritativeSystemManifest.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { TETHYS_TALLY as C } from '../../src/data/tethysTallyPassage.js';
import { world } from '../../src/systems/world.js';
import { traffic } from '../../src/systems/traffic.js';
import { npcJobsRuntime } from '../../src/systems/npcJobsRuntime.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { aiPorts } from '../../src/systems/aiPorts.js';
import { combat } from '../../src/systems/combat.js';
import { createTacticalAISystem } from '../../src/systems/tacticalAI.js';
import { ships, makeShipEntitySpec } from '../../src/systems/ships.js';
import { mining } from '../../src/systems/mining.js';
import { cargo } from '../../src/systems/cargo.js';
import { fieldDepletion } from '../../src/systems/fieldDepletion.js';
import { tetherGameplay } from '../../src/systems/tetherGameplay.js';
import { save } from '../../src/save/saveSystem.js';

// Production owners, ordinary traffic producer and original authored keg. Unrelated world encounters
// are not ticked. This is a focused native route, not a full world/player-camera acceptance claim.
export async function tethysTallyNativeFixture({
  native = true, residency = false, seed = 4242
} = {}) {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const selected = new Map([['aiSlot', createTacticalAISystem()], ['flightSlot', flightV3], ['physics', physics], ['aiPorts', aiPorts], ['combat', combat], ['world', world], ['npcJobsRuntime', npcJobsRuntime], ['ships', ships], ['traffic', traffic], ['save', save], ['tetherGameplay', tetherGameplay], ['mining', mining], ['cargo', cargo], ['fieldDepletion', fieldDepletion]]);
  const sim = createSimulation({
    seed,
    runtimeConfig: {
      profileId: 'production',
      features: PRODUCTION_FEATURES
    },
    systems: PRODUCTION_INIT_ORDER.map(id => selected.get(id)).filter(Boolean),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => id !== 'world').map(id => selected.get(id)).filter(Boolean)
  });
  const state = sim.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = native ? 'rapier-dynamic' : 'custom';
  const w = sim.registry.get('world');
  w.enterSector(C.sectorId);
  const owner = sim.registry.get('traffic');
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    player: state.player,
    team: 0,
    pos: {
      x: state.entityList.find(e => e.data?.stationId === 'station_tethys').pos.x + 300,
      z: state.entityList.find(e => e.data?.stationId === 'station_tethys').pos.z + 300
    }
  }));
  state.playerId = player.id;
  applyFrameOrigin(state, snapFrameOrigin(player.pos, {}));
  const phys = sim.registry.get('physics');
  if (native) assert.equal(await phys.prepareBackend(state), true);
  return {
    sim,
    state,
    owner,
    player,
    physics: phys,
    step(n = 1) {
      for (let i = 0; i < n; i++) { sim.step(1 / 60); if (residency) tickFarActors(state, w.helpers, sim.bus); }
    },
    close() {
      phys._disableSg02DynamicAuthority();
      sim.dispose();
      restoreFeatureMaps(flags);
    }
  };
}
