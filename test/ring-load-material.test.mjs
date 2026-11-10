// Focused production-owner fixture. Direct beam intervals and dock commit below
// stage interactions; they are not an ordinary flight or visual-acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { actionForWreck } from '../src/data/salvageActions.js';
import { crackerRunWorkLoadRead } from '../src/ui/crackerRunGuidance.js';

const ID = 'oneoff_cracker_loose_ore_tub', ORE = 'cmdty_ore_iron', SID = 'sector_helios_prime';
const load = state => [...state.entities.values()].find(e => e.alive && e.data?.oneOffId === ID);
const liveOre = (state, recordId) => [...state.entities.values()].filter(e => e.alive
  && e.type === 'pickup' && e.data?.worldLoadSource?.recordId === recordId);

async function coldContinue(envelope, recordId) {
  const hostUrl = new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url).href;
  const realmUrl = new URL('../scripts/lib/simRealm.mjs', import.meta.url).href;
  return new Promise((done, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(`
      import { parentPort, workerData } from 'node:worker_threads';
      import { readFileSync } from 'node:fs';
      import { resolve } from 'node:path';
      import { createSimHost } from ${JSON.stringify(hostUrl)};
      import { installRealmFs } from ${JSON.stringify(realmUrl)};
      installRealmFs({ readFileSync, resolve });
      const lane = createSimHost();
      try {
        await lane.init({ profile:'production', seed:4242 });
        await lane.tick({ steps:0, commands:[{t:'rpc',seq:1,p:{id:'boot',op:'newGameBoot',payload:{opts:{seed:4242}}}}] });
        const ok = await lane.host.registry.get('save').loadEnvelope(workerData.envelope, 'ring-material-memory');
        await lane.tick({ steps:1, commands:[] });
        const s = lane.host.state, entities = [...s.entities.values()];
        parentPort.postMessage({ ok,
          tubs: entities.filter(e => e.alive && e.data?.oneOffId === ${JSON.stringify(ID)}).length,
          ore: entities.filter(e => e.alive && e.type === 'pickup'
            && e.data?.worldLoadSource?.recordId === workerData.recordId).map(e => ({ amount:e.data.amount, despawnAt:e.data.despawnAt })),
          record: s.world.records.byId[workerData.recordId],
        });
      } finally { lane.shutdown(); parentPort.close(); }
    `)}`), { type: 'module', workerData: { envelope, recordId } });
    let result;
    worker.once('message', value => { result = value; });
    worker.once('error', reject);
    worker.once('exit', code => code === 0 ? done(result) : reject(new Error(`cold worker exit ${code}`)));
  });
}

test('original loaded tub yields one real ore batch, retires durably, and sells through normal owners', async () => {
  installRealmFs({ readFileSync, resolve });
  const lane = createSimHost();
  try {
    await lane.init({ profile: 'production', seed: 4242 });
    await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1,
      p: { id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } } } }] });
    const state = lane.host.state, body = load(state), recordId = body.data.worldRecordId;
    const mining = lane.host.registry.get('mining'), world = lane.host.registry.get('world');
    const player = state.entities.get(state.playerId), life = body.occupantGeneration;
    assert.deepEqual(body.data.salvagePool, { [ORE]: 25 });
    assert.equal(actionForWreck(body).label, 'Recover Ore');
    assert.match(crackerRunWorkLoadRead(state, body).note, /tow.*salvage beam.*Iron Ore.*dismantles the tub/);
    const beforeMass = body.mass, beforePos = { ...body.pos };
    assert.equal(mining._drainWreck(player, body, 18, 3), 0);
    assert.equal(body.alive, true); assert.equal(body.mass, 24);
    assert.equal(liveOre(state, recordId).length, 0, 'unfinished work releases no invisible partial ore');
    assert.deepEqual(body.data.salvagePool, { [ORE]: 25 });

    const spawn = mining.helpers.spawnEntity;
    // Explicit admission-refusal fixture at the existing spawn boundary.
    mining.helpers.spawnEntity = spec => spec.data?.worldLoadSource ? null : spawn(spec);
    assert.equal(mining._drainWreck(player, body, 18, 3), 0);
    assert.equal(body.alive, true); assert.equal(body.mass, beforeMass);
    assert.deepEqual({ ...body.pos }, beforePos);
    assert.deepEqual(body.data.salvagePool, { [ORE]: 25 });
    assert.notEqual(state.world.records.byId[recordId]?.alive, false);

    // If a spawn callback replaces the source life, admission cannot pay it.
    const replacement = { ...body, occupantGeneration: life + 1, data: { name: body.data.name } };
    mining.helpers.spawnEntity = spec => {
      const result = spawn(spec);
      if (spec.data?.worldLoadSource) state.entities.set(body.id, replacement);
      return result;
    };
    assert.equal(mining._drainWreck(player, body, 18, 1 / 60), 0);
    assert.equal(liveOre(state, recordId).length, 0);
    state.entities.set(body.id, body); // restore only this explicit replacement fixture
    assert.deepEqual(body.data.salvagePool, { [ORE]: 25 });

    let admissions = 0, completed;
    const off = lane.host.bus.on('salvage:completed', p => {
      if (p.worldRecordId === recordId) completed = p;
    });
    mining.helpers.spawnEntity = spec => {
      const result = spawn(spec);
      if (spec.data?.worldLoadSource) {
        admissions++;
        assert.equal(mining._drainWreck(player, body, 18, 1 / 60), 0,
          'reentrant work during actual pickup admission cannot duplicate the batch');
      }
      return result;
    };
    assert.equal(mining._drainWreck(player, body, 18, 1 / 60), 25);
    mining.helpers.spawnEntity = spawn;
    assert.equal(admissions, 1);
    const [pickup] = liveOre(state, recordId);
    assert.equal(pickup.data.commodityId, ORE); assert.equal(pickup.data.amount, 25);
    assert.deepEqual(pickup.data.worldLoadSource, { recordId, sourceId: body.id, sourceGeneration: life });
    assert.equal(pickup.data.despawnAt, state.simTime + 90, 'this is normal unclaimed loose ore, not a new permanent cargo claim');
    assert.equal(body.alive, false);
    assert.equal(state.world.records.byId[recordId].alive, false);
    assert.equal(state.world.records.byId[recordId].outcome, 'destroyed');
    assert.equal(state.world.records.byId[recordId].retentionClass, 'permanent');
    assert.equal(mining._drainWreck(player, body, 18, 6), 0);
    const tombstone = JSON.stringify(state.world.records.byId[recordId]);
    lane.host.bus.emit('salvage:completed', { ...completed, sourceGeneration: life + 1 });
    lane.host.bus.emit('salvage:completed', completed);
    assert.equal(JSON.stringify(state.world.records.byId[recordId]), tombstone);
    assert.equal(liveOre(state, recordId).length, 1);
    off();

    // Save BEFORE collection, through the production facade, then JSON/cold realm.
    const envelope = JSON.parse(JSON.stringify(lane.host.registry.get('save').serialize('ring-material-memory')));
    const cold = await coldContinue(envelope, recordId);
    assert.equal(cold.ok, true); assert.equal(cold.tubs, 0);
    assert.equal(cold.record.alive, false); assert.equal(cold.record.retentionClass, 'permanent');
    assert.equal(cold.ore.length, 0, 'ordinary unclaimed pickups are not restored as permanent possessions');
    console.log('RING_MATERIAL_COLD', JSON.stringify({ tubs: cold.tubs, unclaimedOrePickups: cold.ore.length,
      permanentOriginalOutcome: cold.record.outcome }));

    const cargoBefore = state.player.cargo.items[ORE] || 0;
    const cargoMassBefore = state.player.cargo.usedMass;
    const acceptance = mining._collectPickupViaEvent(pickup, player);
    assert.equal(acceptance.accepted, 25);
    assert.equal(state.player.cargo.items[ORE] - cargoBefore, 25);
    assert.equal(state.player.cargo.usedMass - cargoMassBefore, 20);
    const economy = lane.host.registry.get('economy'), creditsBefore = state.player.credits;
    assert.equal(commitDockedUiState(state, { stationId: 'station_helios', shipId: player.id,
      shipGeneration: player.occupantGeneration }, lane.host.bus), true);
    const sold = economy.handleTrade(ORE, 'sell', 25);
    assert.equal(sold.ok, true);
    assert.equal(state.player.cargo.items[ORE] || 0, cargoBefore);
    assert.ok(state.player.credits > creditsBefore, 'the existing market owner pays the sale');

    await lane.tick({ steps: 1, commands: [] });
    world.enterSector(SID);
    assert.equal(load(state), undefined, 'ordinary world re-entry cannot remint the consumed original');
    // Ordinary unrelated wreck behavior remains the existing four-scrap drip.
    const generic = spawn({ type: 'wreck', pos: { x: player.pos.x + 200, z: player.pos.z },
      radius: 8, mass: 12, hull: 30, hullMax: 30, data: {} });
    lane.host.bus.flush();
    assert.deepEqual(generic.data.salvagePool, { cmdty_scrap_metal: 4 });
    mining._drainWreck(player, generic, 18, 3);
    assert.equal(generic.alive, true);
    assert.equal(generic.data.salvagePool.cmdty_scrap_metal, 2);
  } finally { lane.shutdown(); }
});
