import assert from 'node:assert/strict';
import { createSimulation } from '../../src/core/sim.js';
import { createBus } from '../../src/core/eventBus.js';
import { applyFrameOrigin, snapFrameOrigin } from '../../src/core/coordinates.js';
import { physics } from '../../src/core/physics.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../../src/runtime/authoritativeSystemManifest.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { SECTORS } from '../../src/data/sectors.js';
import { world } from '../../src/systems/world.js';
import { traffic } from '../../src/systems/traffic.js';
import { npcJobsRuntime } from '../../src/systems/npcJobsRuntime.js';
import { economy } from '../../src/systems/economy.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { aiPorts } from '../../src/systems/aiPorts.js';
import { combat } from '../../src/systems/combat.js';
import { createTacticalAISystem } from '../../src/systems/tacticalAI.js';
import { ships, makeShipEntitySpec } from '../../src/systems/ships.js';
import { save } from '../../src/save/saveSystem.js';

export const SALVOR_DT = 1 / 60;
export const FORGE_ID = 'station_forge';
export const SALVOR_POOL = Object.freeze({ cmdty_scrap_metal: 5, cmdty_salvage_electronics: 2 });

// Focused actual-owner composition, not a full production-manifest claim. The real station
// producer, public cutter spec, native dynamics, flight, combat/tractor, job and market owners
// are unchanged.
// The world is registered for its station producer but not ticked: unrelated sector contents
// and encounters are outside this bounded haul. No worker phase, position or speed is forced.
export async function salvorNativeFixture({ drifting = false, withSave = false, adoptedScavenger = false,
  salvagePool = SALVOR_POOL } = {}) {
  const priorFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const bus = createBus();
  let observedState = null;
  const intakeBefore = new WeakMap();
  const stockSnapshot = () => Object.fromEntries(Object.keys(SALVOR_POOL).map(id =>
    [id, observedState?.economy?.markets?.[FORGE_ID]?.[id]?.stock]));
  // Register before the economy owner. This observer sees the live market immediately before
  // intake, not its initial stock: ordinary production/recovery continues throughout the haul.
  bus.on('salvage:npcUnload', payload => intakeBefore.set(payload, stockSnapshot()));
  const selected = new Map([
    ['aiSlot', createTacticalAISystem()], ['flightSlot', flightV3], ['physics', physics],
    ['aiPorts', aiPorts], ['combat', combat], ['economy', economy], ['world', world],
    ['npcJobsRuntime', npcJobsRuntime], ['ships', ships], ['traffic', traffic],
  ]);
  if (withSave) selected.set('save', save);
  const sim = createSimulation({
    seed: 424219,
    bus,
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
    systems: PRODUCTION_INIT_ORDER.map(id => selected.get(id)).filter(Boolean),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => id !== 'world')
      .map(id => selected.get(id)).filter(Boolean),
  });
  try {
    const { state } = sim;
    observedState = state;
    const sector = SECTORS.find(row => row.id === 'sector_vesta_forge');
    state.mode = 'flight';
    state.world.currentSectorId = sector.id;
    state.world.currentSector = sector;
    state.world.sectors = Object.fromEntries(SECTORS.map(row => [row.id, row]));
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const worldOwner = sim.registry.get('world');
    const active = worldOwner._emptySectorBag();
    worldOwner._spawnStations(sector, active, state.rng);
    state.world.activeSector = active;
    const yard = state.entityList.find(entity => entity.data?.stationId === FORGE_ID);
    assert.ok(yard, 'the real world producer materializes Forge Foundry');
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, team: 0,
      pos: { x: yard.pos.x + 250, z: yard.pos.z - 350 },
    }));
    state.playerId = player.id;
    applyFrameOrigin(state, snapFrameOrigin(player.pos, {}));
    const wreck = sim.spawn({
      type: 'wreck', pos: { x: yard.pos.x + 550, z: yard.pos.z + 50 },
      vel: { x: drifting ? 2 : 0, z: 0 },
      radius: 4, mass: 160, hull: 100, hullMax: 100, collides: true,
      flags: { persistent: true },
      data: {
        salvagePool: { ...salvagePool }, salvageTimeLeft: 8, parentType: 'ship',
        sectorId: sector.id, homeSectorId: sector.id,
      },
    });
    const scavenger = adoptedScavenger ? sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: wreck.pos.x - 90, z: wreck.pos.z },
      radius: 8, mass: 14, hull: 48, hullMax: 48, collides: true,
      data: {
        defId: 'ship_wasp', shipClass: 'fighter', role: 'scavenger',
        cargo: { items: {} },
        scavengerWork: { state: 'approach', holdQty: 0, nextWorkAt: 0, announcedWreckId: null, approachSince: null },
        wreckFieldId: `salvage:${sector.id}:native-fixture`,
        wreckEcologyRole: 'scavenger',
        wreckEcology: { fieldId: `salvage:${sector.id}:native-fixture`, role: 'scavenger', sectorId: sector.id },
        sectorId: sector.id, homeSectorId: sector.id,
        ai: { doctrine: 'scavenger', archetype: 'reaver', passive: true },
      },
    }) : null;
    if (scavenger) wreck.data.salvorNoticeAt = 1e9;
    const econ = sim.registry.get('economy');
    econ.ensureMarket(FORGE_ID);
    const physicsOwner = sim.registry.get('physics');
    assert.equal(await physicsOwner.prepareBackend(state), true);
    if (scavenger) {
      sim.bus.emit('salvage:placed', { sectorId: sector.id });
      sim.bus.flush();
    }
    const sourceStart = { ...wreck.pos };
    const events = { extraction: [], unload: [], work: [], load: [] };
    for (const [key, name] of [
      ['extraction', 'salvage:npcExtraction'], ['unload', 'salvage:npcUnload'],
      ['work', 'npcjobs:work'], ['load', 'npcjobs:load'],
    ]) {
      sim.bus.on(name, payload => {
        const cutter = state.entities.get(payload.salvorId)
          || state.entityList.find(entity => entity.data?.jobId === payload.jobId);
        if (payload.kind && payload.kind !== 'salvor') return;
        events[key].push({
          ...structuredClone(payload), at: state.simTime,
          cutterPos: cutter && { ...cutter.pos }, cutterVel: cutter && { ...cutter.vel },
          sourcePos: { ...wreck.pos }, sourceVel: { ...wreck.vel },
          ...(key === 'unload' ? { stockBefore: intakeBefore.get(payload), stockAfter: stockSnapshot() } : {}),
        });
      });
    }
    return {
      sim, state, yard, wreck, player, econ, physics: physicsOwner, events, sourceStart,
      scavenger() {
        const recordId = scavenger?.data?.worldRecordId;
        return recordId == null ? scavenger
          : state.entityList.find(entity => entity.alive !== false
            && entity.data?.worldRecordId === recordId) || null;
      },
      cutter() {
        return state.entityList.find(entity => entity.alive !== false
          && entity.data?.generalSalvor && entity.data?.trafficRole === 'salvor');
      },
      step(ticks = 1) {
        for (let i = 0; i < ticks; i++) sim.step(SALVOR_DT);
      },
      close() {
        physicsOwner._disableSg02DynamicAuthority();
        sim.dispose();
        restoreFeatureMaps(priorFlags);
      },
    };
  } catch (error) {
    sim.registry.get('physics')._disableSg02DynamicAuthority();
    sim.dispose();
    restoreFeatureMaps(priorFlags);
    throw error;
  }
}
