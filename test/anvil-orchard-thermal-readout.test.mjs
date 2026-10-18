import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';
import { resolveSimLaneFlags } from '../src/core/simLaneMain.js';

async function exposedPod() {
  const h = await setup();
  assert.equal(h.accept(), 4);
  assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.sim.state), true);
  for (let tick = 1; tick <= 30; tick++) {
    h.sim.state.tick = tick;
    h.owner.step(1 / 60, tick);
    h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(), () => h.owner.drainContactImpacts());
  }
  h.pod = h.sim.state.entityList.find(e => e.data?.orchardKind === 'pod');
  assert.equal(h.owner.prepareOrchardPodHandoff(h.frame, h.pod, 1, h.sim.state).commit(), true);
  h.planet = { ...planetRuntime };
  h.planet.init({ ...h.sim.registry.ctx, helpers: { ...h.sim.helpers,
    queryRadius(center, radius, out) { out.push(h.pod); },
  } });
  const rt = h.sim.state.planet;
  Object.assign(rt, { active: true, siteId: PLANET_SITE.id, sectorId: PLANET_SITE.sectorId,
    center: { x: h.pod.pos.x - 840, z: h.pod.pos.z } });
  h.sim.state.simTime = 1;
  h.planet._tickShips(1, h.sim.state, rt, PLANET_SITE);
  assert.ok(h.facade.readOrchardPodReady(h.pod));
  const close = h.close;
  h.close = () => { h.planet.destroy(); close(); };
  return h;
}

function shipProjection(differ, state) {
  return differ.diff(state, state.tick).updates.find(update => update.segs.join('.') === 'planet.ships');
}

test('genuine planet exposure crosses the bounded leaf transport and existing target facts row', async () => {
  const h = await exposedPod();
  try {
    configureDomainMirroring({});
    assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
    const differ = createDomainDiffer();
    const update = shipProjection(differ, h.sim.state);
    assert.ok(update, 'the default read model publishes pod exposure');
    const roots = new Map(), touched = new Set();
    applyDomainPathUpdate(roots, structuredClone(update), touched);
    const ships = roots.get('planet.ships');
    assert.ok(ships?.[h.pod.id]);
    assert.deepEqual(Object.keys(ships[h.pod.id]).sort(),
      ['heat', 'lastThermalAt', 'lotId', 'occupantGeneration', 'region', 'stage'].sort());
    const frontendPod = { ...h.pod, occupantGeneration: h.pod.occupantGeneration, data: structuredClone(h.pod.data) };
    delete frontendPod.physicsBody;
    delete frontendPod.orchardThermalExposure;
    const frontend = { entities: new Map([[frontendPod.id, frontendPod]]), player: {},
      playerId: h.sim.state.playerId, world: { currentSectorId: PLANET_SITE.sectorId }, planet: { ships } };
    const line = objectInfoLine(frontendPod, frontend, {}, 50);
    assert.match(line, /POD HEAT 34%/);
    assert.match(line, /HEATING/);
    assert.match(line, /HULL 100%/);
    assert.match(line, /Hydrogen.*4/);
    assert.equal(shipProjection(differ, h.sim.state), undefined, 'unchanged exposure does not reship');
    const row = ships[h.pod.id];
    h.sim.state.planet.ships[h.pod.id].heat = 0.5;
    h.sim.state.tick++;
    touched.clear();
    applyDomainPathUpdate(roots, structuredClone(shipProjection(differ, h.sim.state)), touched);
    assert.equal(roots.get('planet.ships'), ships);
    assert.equal(ships[h.pod.id], row, 'ordinary heat updates preserve mirrored row identity');
    assert.match(objectInfoLine(frontendPod, frontend, {}, 50), /POD HEAT 50%/);
    frontendPod.occupantGeneration++;
    assert.doesNotMatch(objectInfoLine(frontendPod, frontend, {}, 50), /POD HEAT|HULL/);
    frontendPod.occupantGeneration--;
    h.pod.alive = false;
    h.sim.state.tick++;
    touched.clear();
    applyDomainPathUpdate(roots, structuredClone(shipProjection(differ, h.sim.state)), touched);
    assert.equal(ships[h.pod.id], undefined, 'dead source exposure is removed');
    assert.doesNotMatch(objectInfoLine(frontendPod, frontend, {}, 50), /POD HEAT|HULL/);
  } finally { h.close(); }
});

test('target readout never substitutes persisted heat for absent or stale live exposure', async () => {
  const h = await exposedPod();
  try {
    const state = h.sim.state;
    assert.match(objectInfoLine(h.pod, state, {}, 50), /POD HEAT 34%/);
    state.world.currentSectorId = 'elsewhere';
    assert.doesNotMatch(objectInfoLine(h.pod, state, {}, 50), /POD HEAT|HULL/);
    state.world.currentSectorId = PLANET_SITE.sectorId;
    const rec = state.planet.ships[h.pod.id];
    rec.occupantGeneration++;
    assert.doesNotMatch(objectInfoLine(h.pod, state, {}, 50), /POD HEAT|HULL/);
    delete state.planet.ships[h.pod.id];
    assert.ok(h.pod.orchardThermalExposure.heat > 0);
    assert.doesNotMatch(objectInfoLine(h.pod, state, {}, 50), /POD HEAT|HULL/);
  } finally { h.close(); }
});

test('production whole-sim host reply reaches frontend target facts through spawn and domain transport', async () => {
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
  } finally { lane.shutdown(); }
});

for (const refusal of ['wrong-sector', 'wrong-site', 'dead', 'fixed', 'generation', 'bad-heat', 'bad-stage', 'future-time']) {
  test(`exposure projector refuses ${refusal} and carries no native or saved authority`, async () => {
    const h = await exposedPod();
    try {
      const state = h.sim.state, rec = state.planet.ships[h.pod.id];
      const data = h.pod.data, before = structuredClone(data);
      if (refusal === 'wrong-sector') state.world.currentSectorId = 'sector_elsewhere';
      if (refusal === 'wrong-site') state.planet.siteId = 'planet_elsewhere';
      if (refusal === 'dead') h.pod.alive = false;
      if (refusal === 'fixed') h.pod.physicsBody.dynamic = false;
      if (refusal === 'generation') rec.occupantGeneration++;
      if (refusal === 'bad-heat') rec.heat = NaN;
      if (refusal === 'bad-stage') rec.stage = 'forged';
      if (refusal === 'future-time') rec.lastThermalAt = state.simTime + 1;
      h.facade.readOrchardPodReady = () => { throw new Error('presentation must not perform native reads'); };
      const update = shipProjection(createDomainDiffer(), state);
      assert.deepEqual(update.v, {});
      assert.equal(h.pod.data, data);
      assert.deepEqual(h.pod.data, before);
    } finally { h.close(); }
  });
}

test('projection carries at most the three actual exposed sockets and excludes label-only payloads and ship heat', async () => {
  const h = await exposedPod();
  try {
    const state = h.sim.state;
    for (const socket of [0, 2]) {
      assert.equal(h.accept(4, socket), 4);
      assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, socket, state), true);
    }
    for (let tick = 31; tick <= 60; tick++) {
      state.tick = tick;
      h.owner.step(1 / 60, tick);
      h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(), () => h.owner.drainContactImpacts());
    }
    const pods = state.entityList.filter(e => e.data?.orchardKind === 'pod');
    for (const socket of [0, 2]) {
      const pod = pods.find(e => e.data.worldRecordId === state.sites.anvilOrchard.sockets[socket].lotId);
      assert.equal(h.owner.prepareOrchardPodHandoff(h.frame, pod, socket, state).commit(), true);
    }
    h.planet.helpers.queryRadius = (center, radius, out) => out.push(...pods);
    state.simTime = 2;
    h.planet._tickShips(1, state, state.planet, PLANET_SITE);
    const rec = state.planet.ships[h.pod.id];
    for (let i = 0; i < 20; i++) {
      const fake = h.sim.spawn({ type: 'payload', pos: { ...h.pod.pos }, hull: 100,
        data: { orchardId: 'anvil_storm_orchard', orchardKind: 'pod', masslineTetherable: true } });
      state.planet.ships[fake.id] = { ...rec, occupantGeneration: fake.occupantGeneration };
    }
    state.planet.ships[h.worker.id] = { ...rec, occupantGeneration: h.worker.occupantGeneration };
    const update = shipProjection(createDomainDiffer(), state);
    assert.equal(Object.keys(update.v).length, 3);
    assert.deepEqual(Object.keys(update.v).sort(), pods.map(p => String(p.id)).sort());
    assert.ok(JSON.stringify(update.v).length < 1024, 'three records stay below the every-pass mirror size threshold');
    assert.ok(!JSON.stringify(update.v).includes('burnNextAt'));
  } finally { h.close(); }
});
