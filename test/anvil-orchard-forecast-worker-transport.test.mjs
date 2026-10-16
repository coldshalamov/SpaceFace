import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';
import { resolveSimLaneFlags } from '../src/core/simLaneMain.js';

test('production host forecast transport preserves phase, force, clock and life guards', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createReadModel, applySpawnInfos, applyEntityVitals } = await import('../scripts/lib/simReadModel.mjs');
  const { ANVIL_ORCHARD, createOrchardRecord } = await import('../src/data/anvilOrchard.js');
  const { ORCHARD_GEOMETRY: G, orchardFrameBodySpec } = await import('../src/data/anvilOrchardBody.js');
  const { createOrchardMotorState } = await import('../src/core/anvilOrchardNative.js');
  const { applyFrameOrigin, snapFrameOrigin } = await import('../src/core/coordinates.js');
  const { readFileSync } = await import('node:fs');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, sim, registry } = lane.host;
    state.mode = 'flight';
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    state.sites.anvilOrchard = createOrchardRecord(0);
    const worker = sim.spawn({ type: 'ship', isPlayer: true, pos: { x: 14000, z: 9000 }, radius: 6, hull: 100,
      data: { defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true,
        itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' } } });
    state.playerId = worker.id;
    const frame = sim.spawn({ type: 'wreck', pos: { x: 13200, z: 8300 }, rot: 0.713, radius: G.radius,
      hull: 300, flags: { persistent: true }, physicsBody: orchardFrameBodySpec(),
      data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
        placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
        masslineTetherable: false, orchardCollars: createOrchardMotorState() } });
    applyFrameOrigin(state, snapFrameOrigin(worker.pos, {}));
    const physics = registry.get('physics');
    assert.equal(await physics.prepareBackend(state), true);
    const owner = physics._sg02;
    const machine = registry.get('environmentalMachinery');
    assert.equal(machine.acceptOrchardNewPod(worker, { frame, socket: 1, qty: 4, commodityId: ANVIL_ORCHARD.commodityId }), 4);
    assert.equal(owner.requestOrchardFiniteRelease(frame, 1, state), true);
    for (let tick = 1; tick <= 30; tick++) {
      state.tick = tick;
      owner.step(1 / 60, tick);
      owner.publishCompletedOrchardContacts(owner.completedOrchardTail(), () => owner.drainContactImpacts());
    }
    const pod = state.entityList.find(e => e.data?.orchardKind === 'pod');
    assert.equal(owner.prepareOrchardPodHandoff(frame, pod, 1, state).commit(), true);
    const planet = registry.get('planetRuntime');
    Object.assign(state.planet, { active: true, siteId: PLANET_SITE.id, sectorId: PLANET_SITE.sectorId,
      center: { x: pod.pos.x - 840, z: pod.pos.z } });
    // Keep the focused spatial fixture complete without changing the production transport.
    planet.helpers = { ...planet.helpers, queryRadius(center, radius, out) { out.push(pod); } };
    state.simTime = 1;
    planet._tickShips(1, state, state.planet, PLANET_SITE);
    assert.ok(physics.readOrchardPodReady(pod));
    state.tick = 650;
    Object.assign(worker.pos, { x: frame.pos.x + 200, z: frame.pos.z });
    const { fieldHud } = await import('../src/ui/fieldHud.js');
    const nativeForecast = fieldHud._resolveOrchardEnvironmental.call({}, state);
    assert.equal(nativeForecast?.phase, 'forecast');
    const reply = structuredClone(await lane.tick({ tick: 1, steps: 0, ackEnd: init.journalSequence }));
    assert.ok(reply.spawnInfos.some(info => info.entityId === pod.id), 'worker publishes the actual pod spawn');
    const main = createReadModel();
    applySpawnInfos(main, reply.spawnInfos);
    applyEntityVitals(main, reply.entityVitals);
    const touched = new Set();
    for (const update of reply.domainUpdates) applyDomainPathUpdate(main.domains, update, touched);
    const frontendPod = main.entities.get(pod.id);
    assert.equal(frontendPod.occupantGeneration, pod.occupantGeneration);
    assert.equal(frontendPod.physicsBody, undefined, 'no native body crosses into the frontend');
    assert.equal(frontendPod.orchardThermalExposure, undefined, 'no saved history crosses into the frontend');
    const frontend = { entities: main.entities, player: {}, playerId: worker.id,
      world: { currentSectorId: main.domains.get('world.currentSectorId') },
      planet: { ships: main.domains.get('planet.ships') } };
    assert.match(objectInfoLine(frontendPod, frontend, {}, 50), /POD HEAT 34%.*HEATING.*HULL 100%/);
    Object.assign(frontend, { mode: state.mode, tick: state.tick, simTime: state.simTime, sites: main.domains.get('sites') });
    frontend.planet.orchardForecast = main.domains.get('planet.orchardForecast');
    const displayed = fieldHud._resolveOrchardEnvironmental.call({}, frontend);
    console.log(JSON.stringify({nativeForecast, frontendForecast: displayed, mirroredSite: main.domains.get('sites.anvilOrchard') ?? null, frontendFrameBody: main.entities.get(frame.id)?.physicsBody ?? null, domainPaths: reply.domainUpdates.map(x=>x.segs.join('.')).filter(x=>/planet|sites/.test(x))}));
    assert.equal(displayed?.phase, 'forecast');
    assert.equal(displayed?.remainingTicks, 70);
    assert.equal(displayed.localStrength, nativeForecast.localStrength);
    assert.deepEqual(displayed.dir, nativeForecast.dir);
    assert.ok(JSON.stringify(frontend.planet.orchardForecast).length < 1024);
    async function syncForecast(tick) {
      state.tick = tick;
      const wire = structuredClone(await lane.tick({ tick, steps: 0, ackEnd: init.journalSequence }));
      const touched = new Set();
      applySpawnInfos(main, wire.spawnInfos);
      applyEntityVitals(main, wire.entityVitals);
      for (const update of wire.domainUpdates) applyDomainPathUpdate(main.domains, update, touched);
      frontend.tick = main.domains.get('tick');
      frontend.planet.orchardForecast = main.domains.get('planet.orchardForecast');
      return fieldHud._resolveOrchardEnvironmental.call({}, frontend);
    }
    const next = await syncForecast(651);
    assert.equal(next.remainingTicks, 69);
    frontend.tick++;
    assert.equal(fieldHud._resolveOrchardEnvironmental.call({}, frontend), null, 'stale observation is unavailable');
    frontend.tick--;
    const frontendFrame = frontend.entities.get(frame.id);
    const generation = frontendFrame.occupantGeneration;
    frontendFrame.occupantGeneration++;
    assert.equal(fieldHud._resolveOrchardEnvironmental.call({}, frontend), null, 'recycled frame rejects old facts');
    frontendFrame.occupantGeneration = generation;
    const { normalizeField } = await import('../src/core/fields/fieldKernel.js');
    const { ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry } = await import('../src/data/environmentalMachinery.js');
    const geometry = anvilOrchardGustGeometry(frame);
    Object.assign(worker.pos, geometry.center);
    state.fields.snapshot = [normalizeField({ ...ANVIL_ORCHARD_GUST_PROFILE, center: geometry.center, dir: geometry.dir, createdAt: 0 })];
    const gust = await syncForecast(720);
    assert.equal(gust.phase, 'gust');
    assert.equal(gust.remainingTicks, 300);
    assert.deepEqual(gust, fieldHud._resolveOrchardEnvironmental.call({}, state), 'same force/profile math on host and main lane');
    assert.ok(gust.localStrength > 0);
    assert.equal((await syncForecast(1020)).phase, 'calm');
    state.world.currentSectorId = 'elsewhere';
    assert.equal(await syncForecast(1021), null, 'away clears prior facts');
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    assert.equal((await syncForecast(1670)).remainingTicks, 70);
    const save = registry.get('save');
    const envelope = JSON.parse(JSON.stringify(save.serialize('orchard-forecast')));
    delete envelope.checksum;
    assert.equal(save.loadEnvelope(envelope), true);
    physics._finishNativeRestore();
    assert.equal(await physics.prepareBackend(state), true);
    assert.equal(await syncForecast(1670), null, 'loading has no live forecast');
    // The focused transport fixture resumes flight after the real save owner/native restore;
    // full loading/player orchestration is covered by the existing Continue route tests.
    state.mode = 'flight';
    const continued = await syncForecast(1670);
    assert.equal(continued?.remainingTicks, 70, 'real save-owner Continue retains remaining lead on flight resumption');
    const retainedRecord = state.sites.anvilOrchard;
    state.sites.anvilOrchard = null;
    assert.equal(await syncForecast(1671), null, 'disappeared source record clears facts');
    state.sites.anvilOrchard = retainedRecord;
    assert.equal((await syncForecast(1672)).remainingTicks, 68);
    const validMirror = structuredClone(frontend.planet.orchardForecast);
    for (const patch of [{ observedTick: 1671 }, { sectorId: 'elsewhere' }, { remainingTicks: 121 },
      { phase: 'forged' }, { frameGeneration: 99999 }, { playerGeneration: 99999 },
      { localStrength: NaN }, { dir: { x: Infinity, z: 0 } }]) {
      frontend.planet.orchardForecast = { ...validMirror, ...patch };
      assert.equal(fieldHud._resolveOrchardEnvironmental.call({}, frontend), null);
    }
    frontend.planet.orchardForecast = validMirror;
    const restoredFrame = [...state.entities.values()].find(e => e.data?.orchardKind === 'frame');
    restoredFrame.alive = false;
    assert.equal(await syncForecast(1673), null, 'disappeared source clears prior facts');

  } finally { lane.shutdown(); }
});
