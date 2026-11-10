import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

// VISION: the shift runs without an accepted mission or a pilot steering the workers.
test('production seed 8008: a cutter and ore barge finish repeated physical work and deliveries',
  { timeout: 240_000 }, async () => {
    os.setPriority(os.constants.priority.PRIORITY_LOW);
    const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 8008 });
    try {
      const { state, bus } = runtime;
      state.mode = 'flight';
      state.settings.gameplay.tutorialHints = false;
      runtime.getSystem('ships').newGame();
      state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
        team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
        fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
        pos: { x: 0, z: 0 }, rot: 0,
      })).id;
      runtime.getSystem('world').newGame();
      runtime.getSystem('economy').newGame();
      runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
      bus.emit('game:started', {});
      await runtime.getSystem('physics').prepareBackend(state, { reset: true });
      const collected = new Map(), delivered = [], rocks = new Set();
      const completedShifts = () => {
        const miner = state.entityList.find((e) => e.data?.activityActorSlotId === 'helios_starter_cutter');
        return state.npcJobs.byId[miner?.data.jobId]?.job.loopCount || 0;
      };
      bus.on('traffic:oreCollected', (p) => collected.set(p.manifestId, { ...p }));
      bus.on('freight:arrival', (p) => {
        if (collected.has(p.manifestId)) delivered.push({ t: state.simTime, ...p });
      });
      for (let second = 0; second < 180; second++) {
        runtime.runTicks(60, 1 / 60);
        for (const row of state.traffic.freighters) {
          const rockId = state.entities.get(row.id)?.data?.minerShiftRockId;
          if (rockId != null) rocks.add(rockId);
        }
        if (delivered.length >= 2 && completedShifts() >= 2) break;
      }
      const workers = state.traffic.freighters.filter((r) => ['miner', 'ore_carrier'].includes(r.role))
        .map((r) => {
          const e = state.entities.get(r.id);
          return { role: r.role, pos: e?.pos, beam: e?.data?.minerShiftBeamS,
            phase: state.npcJobs.byId[e?.data?.jobId]?.job?.phase, cargo: r.manifest?.totalQty };
        });
      assert.ok(delivered.length >= 2,
        `the real flight route must deliver repeatedly; got ${delivered.length}: ${JSON.stringify(workers)}`);
      // This seed's first face has398oreHP; three6s MK1 shifts remove only324HP
      // before seam modifiers. Exhaustion/retargeting has a real-owner boundary test.
      assert.ok(completedShifts() >= 2, 'the cutter must physically finish repeated work and return cycles');
      assert.equal(new Set(delivered.map((p) => p.manifestId)).size, delivered.length);
      for (const arrival of delivered) {
        const pickup = collected.get(arrival.manifestId);
        assert.equal(arrival.totalQty, pickup.qty, 'the delivery is the physical collected load');
        assert.equal(arrival.stationId, 'station_helios');
        assert.equal(arrival.trades[0].commodityId, pickup.commodityId);
      }
      console.log(`LIVING_SHIFT seed=8008 deliveries=${delivered.length} first=${delivered[0].t.toFixed(2)}s faces=${rocks.size}`);
    } finally {
      runtime.dispose();
    }
  });
