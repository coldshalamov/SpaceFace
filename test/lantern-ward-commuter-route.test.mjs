import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { traffic } from '../src/systems/traffic.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { LANTERN_WARD_RECORD_IDS as IDS } from '../src/data/lanternWardHardware.js';

const DT = 1 / 60, SECTOR = 'sector_helios_prime';

// Scoped native owner integration. Actual world admission supplies the complete
// Helios geography, not hand-built stand-ins for the White Side, docks or memorial.
// This is not an all-system production boot or a rendered/public-input claim.
test('ordinary Helios geometry admits three commuter round trips with real yielding and berth dwells',
  { timeout: 180000 }, async () => {
  const seed = 7407, state = createGameState(seed);
  state.mode = 'flight';
  const modules = { ships, world, flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget, traffic };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  try {
    sim.registry.get('ships').newGame();
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    const worldOwner = sim.registry.get('world');
    worldOwner.enterSector(SECTOR);
    assert.equal(worldOwner.relocatePlayerInSector({ x: 1820, z: -460, heading: 0 },
      { reason: 'lantern-native-commuter-observer' }), true);
    const physicsOwner = sim.registry.get('physics');
    assert.equal(await physicsOwner.prepareBackend(state), true);
    const actor = role => state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === IDS[role]);
    const rows = state.world.dressing.rows;
    const spine = rows.find(e => e.data?.worldRecordId === 'lantern-ward:scenery:white_rim:v1');
    assert.ok(spine, 'ordinary world pass admits the real White Side spine');
    const docks = rows.filter(e => ['apron_dock', 'white_dock'].includes(e.data?.lanternWardSceneryId));
    assert.equal(docks.length, 2, 'both authored berth structures are present');
    const contacts = [], transitions = [], departures = [];
    let maxWaitS = 0, initialLife = null, commuter = null;
    sim.bus.on('physics:impact', impact => {
      if (!commuter || contacts.length >= 24 || (impact.aId !== commuter.id && impact.bId !== commuter.id)) return;
      const otherId = impact.aId === commuter.id ? impact.bId : impact.aId;
      const other = state.entities.get(otherId) || rows.find(e => e.id === otherId);
      contacts.push({ tick: state.tick, otherId, other: other?.data?.name || other?.data?.worldRecordId || other?.type,
        impulse: impact.impulse });
    });
    for (let i = 0; i < 36000 && departures.length < 6; i++) {
      const before = state.npcJobs?.lanternWard;
      const priorLeg = before?.commuterLeg, priorDwell = before?.commuterDwellS;
      sim.step(DT);
      commuter ||= actor('commuter');
      initialLife ??= commuter?.occupantGeneration;
      const work = state.npcJobs?.lanternWard;
      if (!work || !commuter) continue;
      maxWaitS = Math.max(maxWaitS, work.commuterWaitS);
      if (priorLeg !== work.commuterLeg) {
        const row = { tick: state.tick, time: state.simTime, from: priorLeg, to: work.commuterLeg,
          pos: { x: commuter.pos.x, z: commuter.pos.z }, dwellS: priorDwell };
        transitions.push(row);
        if (priorLeg === 2 || priorLeg === 5) {
          assert.ok(priorDwell >= 18 - DT - 1e-8, 'a berth departure requires the real eighteen-second dwell');
          departures.push(row);
          console.log('LANTERN_COMMUTER_DEPARTURE', JSON.stringify(row));
        }
      }
    }
    const work = state.npcJobs?.lanternWard;
    const nativeSpine = physicsOwner._sg02?.records.get(spine.id);
    const diagnostic = JSON.stringify({ tick: state.tick, time: state.simTime,
      commuter: commuter && { id: commuter.id, pos: commuter.pos, vel: commuter.vel, rot: commuter.rot, hull: commuter.hull },
      leg: work?.commuterLeg, waitS: work?.commuterWaitS, maxWaitS, phase: work?.phase,
      tug: actor('tug')?.pos, cradle: actor('cradle')?.pos, departures, transitions, contacts,
      spine: { id: spine.id, pos: spine.pos, rot: spine.rot, colliders: nativeSpine?.colliders?.length } });
    console.log('LANTERN_COMMUTER_LOOPS', diagnostic);
    assert.ok(nativeSpine?.colliders?.length > 0, 'the actual spine remained in native collision admission');
    assert.equal(departures.length, 6, diagnostic);
    assert.deepEqual(departures.map(row => row.from), [2, 5, 2, 5, 2, 5]);
    assert.ok(maxWaitS >= 8 - DT, 'the operator actually occupied the route long enough to exercise yielding');
    assert.equal(actor('commuter'), commuter);
    assert.equal(commuter.occupantGeneration, initialLife);
    assert.ok(commuter.hull > 0);
    assert.equal(work.history.departures, 6, 'physical arrivals/dwells own the departure history');
  } finally { sim.dispose(); }
});
