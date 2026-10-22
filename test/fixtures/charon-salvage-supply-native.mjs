import { physics } from '../../src/core/physics.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { charonSupplyFacts, charonSupplyNativeDiagnostic } from '../../src/world/charonSalvageSupply.js';
import assert from 'node:assert/strict';
import { ACTIVITY_POCKETS, ACTIVITY_POCKETS_BY_SECTOR, ACTIVITY_POCKET_SECTOR_IDS, LIVED_FRONTIER_SECTOR_IDS, LIVED_FRONTIER_SETS, activityActorSlotById, activityPocketById, activityPocketsForSector, activityRouteTopologyForSector, distanceFromPocketAnchor, routeTopologyClass } from '../../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
import { SECTORS } from '../../src/data/sectors.js';
import { createSimulation } from '../../src/core/sim.js';
import { spawnBudget } from '../../src/systems/spawnBudget.js';
import { TRAFFIC_ROLES, traffic } from '../../src/systems/traffic.js';
import { cargo } from '../../src/systems/cargo.js';
import { economy } from '../../src/systems/economy.js';
import { factions } from '../../src/systems/factions.js';
import { heat } from '../../src/systems/heat.js';
import { encounterDirector } from '../../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../../src/systems/npcJobsRuntime.js';
const SEED = 4242;
export async function charonSupplyFixture() {
  const sectorId = 'sector_charon_expanse';
  const sectorDef = SECTORS.find(s => s.id === sectorId);
  assert.ok(sectorDef, `${sectorId} exists`);
  const systems = [spawnBudget, cargo, traffic, economy, factions, heat, encounterDirector, npcJobsRuntime, flightV3, physics];
  const sim = createSimulation({
    seed: SEED,
    systems
  });
  const {
    state,
    bus
  } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.world.streaming = {
    enabled: false
  };
  state.world.currentSectorId = sectorId;
  for (const station of SECTOR_ANCHORS[sectorId].stations) {
    sim.spawn({
      type: 'station',
      team: 2,
      pos: sectorLocalToGlobalForSector(station.pos, sectorId),
      radius: 42,
      mass: 1e6,
      data: {
        stationId: station.id,
        name: station.id
      }
    });
  }
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: sectorLocalToGlobalForSector({
      x: -820,
      z: 1220
    }, sectorId),
    vel: {
      x: 0,
      z: 0
    },
    hull: 200,
    hullMax: 200,
    radius: 6
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = {
    active: false,
    finished: true
  };
  bus.emit('sector:enter', {
    sectorId,
    sector: sectorDef
  });
  const firstSupply = charonSupplyFacts(state);
  assert.equal(firstSupply.phase, 'awaiting_round');
  assert.equal(firstSupply.loose, 6);
  for (const id of [firstSupply.haulerId, firstSupply.salvorId]) {
    const e = state.entities.get(id);
    assert.equal(e.data.jobId, undefined);
    assert.equal(e.data.itinerary?.kind, 'charon_colony_supply');
  }
  assert.equal(state.traffic.charonSalvageSupply.haulerReady, true);
  assert.equal(state.traffic.charonSalvageSupply.salvorReady, true);
  const phys = sim.registry.get('physics');
  assert.equal(await phys.prepareBackend(state), true);
  sim.runTicks(3);
  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = entity.data && entity.data.activityActorSlotId || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, {
      rec,
      entity
    });
  }
  return {
    physics: phys,
    state,
    bySlot,
    sim,
    owner: sim.registry.get('traffic'),
    jobs: sim.registry.get('npcJobs') || sim.registry.get('npcJobsRuntime')
  };
}
if (process.env.CHARON_NATIVE_PROOF === '1') {
  const f = await charonSupplyFixture();
  try {
    const h = f.bySlot.get('charon_colony_hauler').entity,
      r = f.bySlot.get('charon_colony_salvor').entity;
    const originalSource = f.state.entityList.find(e => e.alive && e.data?.charonSupplyPod);
    let sawAboard = false,
      sawHeld = false,
      pickupReceipt = null;
    const writeManifest = f.owner._setTrafficManifest;
    f.owner._setTrafficManifest = function (e, rec, m) {
      if (e === r && m.totalQty === 6) {
        assert.ok(Math.hypot(h.vel.x - r.vel.x, h.vel.z - r.vel.z) <= 2);
        const a = f.physics._sg02.records.get(h.id),
          b = f.physics._sg02.records.get(r.id);
        assert.ok(a.colliders.some(x => b.colliders.some(y => {
          const c = x.contactCollider(y, 4);
          return c && c.distance >= -0.5 && c.distance <= 4;
        })));
      }
      return writeManifest.call(this, e, rec, m);
    };
    f.sim.bus.on('pickup:collected', event => {
      if (event.pickupId === originalSource.id && event.collectorId === h.id) {
        pickupReceipt = event;
        assert.ok(charonSupplyNativeDiagnostic(f.owner, h, originalSource).contacts.some(d => d >= -0.5 && d <= 0));
        assert.ok(Math.hypot(h.vel.x - originalSource.vel.x, h.vel.z - originalSource.vel.z) <= 2);
        assert.equal(event.richLotSource, originalSource.data.richLotSource);
      }
    });
    for (let i = 0; i < 60 * 300; i++) {
      f.sim.step();
      const facts = charonSupplyFacts(f.state);
      assert.equal(['loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'].reduce((n, k) => n + facts[k], 0), 6);
      if (facts.aboard === 6) sawAboard = true;
      if (facts.delivered === 6) {
        sawHeld = true;
        assert.equal(r.data.cargoManifest.totalQty, 6);
      }
      if (i % 600 === 0) console.log('CHARON_NATIVE', JSON.stringify({
        tick: i,
        facts
      }));
      if (facts.phase === 'working') break;
    }
    const facts = charonSupplyFacts(f.state);
    assert.equal(facts.phase, 'working');
    assert.equal(facts.consumed, 6);
    assert.equal(facts.delivered, 0);
    assert.ok(sawAboard);
    assert.ok(sawHeld);
    assert.equal(pickupReceipt?.acceptedAmount, 6);
    assert.equal(f.state.entities.get(h.id), h);
    assert.equal(f.state.entities.get(r.id), r);
    assert.equal(originalSource.alive, false);
    assert.equal(h.data.cargoManifest.totalQty, 0);
    assert.equal(r.data.cargoManifest.totalQty, 0);
    assert.equal(f.sim.helpers.npcJobs.get(r.data.jobId)?.kind, 'salvor');
    console.log('CHARON_NATIVE_ASSERTED', JSON.stringify({
      time: f.state.simTime,
      facts,
      haulerId: h.id,
      salvorId: r.id,
      nextRoundJobId: r.data.jobId
    }));
  } finally {
    f.sim.dispose();
  }
}
