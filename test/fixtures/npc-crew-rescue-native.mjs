import assert from 'node:assert/strict';
import { createSimulation } from '../../src/core/sim.js';
import { applyFrameOrigin, snapFrameOrigin } from '../../src/core/coordinates.js';
import { physics } from '../../src/core/physics.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../../src/runtime/authoritativeSystemManifest.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { createCombatCatalog, ensureCombatant } from '../../src/combat/runtime.js';
import { scheduleSubsystemTransition } from '../../src/combat/subsystems.js';
import { world } from '../../src/systems/world.js';
import { actions } from '../../src/systems/actions.js';
import { factionPresence } from '../../src/systems/factionPresence.js';
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
import { save } from '../../src/save/saveSystem.js';

// Production owners, actual authored actor producer and original poses. Unrelated world encounters
// are not ticked. This is a focused native route, not a full world/player-camera acceptance claim.
export async function crewRescueNativeFixture({
  native = true, worldTicks = false
} = {}) {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const selected = new Map([['aiSlot', createTacticalAISystem()], ['flightSlot', flightV3], ['physics', physics], ['aiPorts', aiPorts], ['combat', combat], ['actions', actions], ['world', world], ['npcJobsRuntime', npcJobsRuntime], ['ships', ships], ['traffic', traffic], ['factionPresence', factionPresence], ['save', save], ['mining', mining], ['cargo', cargo], ['fieldDepletion', fieldDepletion]]);
  const sim = createSimulation({
    seed: 4242,
    runtimeConfig: {
      profileId: 'production',
      features: PRODUCTION_FEATURES
    },
    systems: PRODUCTION_INIT_ORDER.map(id => selected.get(id)).filter(Boolean),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => worldTicks || id !== 'world').map(id => selected.get(id)).filter(Boolean)
  });
  const state = sim.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = native ? 'rapier-dynamic' : 'custom';
  const w = sim.registry.get('world');
  w.enterSector('sector_ceres_belt');
  const owner = sim.registry.get('traffic');
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    player: state.player,
    team: 0,
    pos: {
      x: state.entityList.find(e => e.data?.stationId === 'station_ceres').pos.x + 500,
      z: state.entityList.find(e => e.data?.stationId === 'station_ceres').pos.z
    }
  }));
  state.playerId = player.id;
  applyFrameOrigin(state, snapFrameOrigin(player.pos, {}));
  const phys = sim.registry.get('physics');
  if (native) assert.equal(await phys.prepareBackend(state), true);
  sim.step(1 / 60);
  return {
    sim,
    state,
    owner,
    player,
    physics: phys,
    disable(entity) {
      const runtime = ensureCombatant(state, entity, createCombatCatalog());
      const drive = runtime.subsystems.subsystem_drive;
      drive.health = 0;
      scheduleSubsystemTransition(drive, state.tick + 1, true, 'crew_rescue_test_damage', null, runtime);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) sim.step(1 / 60);
    },
    close() {
      phys._disableSg02DynamicAuthority();
      sim.dispose();
      restoreFeatureMaps(flags);
    }
  };
}
