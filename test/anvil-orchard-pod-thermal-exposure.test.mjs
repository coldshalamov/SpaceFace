import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { combat } from '../src/systems/combat.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { ANVIL_ORCHARD } from '../src/data/anvilOrchard.js';

async function thermalWorld({ release = true } = {}) {
  const h = await setup();
  assert.equal(h.accept(), 4);
  h.pod = h.sim.state.entityList.find(e => e.data?.orchardKind === 'pod');
  if (release) {
    assert.equal(h.owner.requestOrchardFiniteRelease(h.frame, 1, h.sim.state), true);
    for (let tick = 1; tick <= ANVIL_ORCHARD.openingSteps; tick++) {
      h.sim.state.tick = tick;
      h.owner.step(1 / 60, tick);
      h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(), () => h.owner.drainContactImpacts());
    }
    const handoff = h.owner.prepareOrchardPodHandoff(h.frame, h.pod, 1, h.sim.state);
    assert.ok(handoff);
    assert.equal(handoff.commit(), true);
    assert.ok(h.facade.readOrchardPodReady(h.pod));
  }
  const registry = h.sim.registry;
  const resolve = registry.get.bind(registry);
  h.combat = { ...combat };
  registry.get = name => name === 'combat' ? h.combat : resolve(name);
  h.combat.init(registry.ctx);
  h.planet = { ...planetRuntime };
  h.planet.init({ ...registry.ctx, helpers: { ...h.sim.helpers,
    queryRadius(center, radius, out) {
      out.push(...h.sim.state.entityList.filter(e => e.pos && Math.hypot(e.pos.x - center.x, e.pos.z - center.z) <= radius));
    },
  } });
  h.rt = h.sim.state.planet;
  h.rt.siteId = PLANET_SITE.id;
  h.rt.sectorId = PLANET_SITE.sectorId;
  h.rt.active = true;
  // The custody fixture is deliberately translated from the authored world. Keep the
  // actual native pod still and translate only the test planet's origin for each band.
  h.band = radius => { h.rt.center = { x: h.pod.pos.x - radius, z: h.pod.pos.z }; };
  h.tick = (count = 1) => {
    for (let n = 0; n < count; n++) {
      h.sim.state.tick++;
      h.sim.state.simTime = h.sim.state.tick / 60;
      h.planet._tickShips(1 / 60, h.sim.state, h.rt, PLANET_SITE);
    }
  };
  const close = h.close;
  h.close = () => { h.planet.destroy(); close(); };
  return h;
}

test('genuine released pod uses the existing planet heat and cooling without changing custody data', async () => {
  const h = await thermalWorld();
  try {
    const data = h.pod.data, before = structuredClone(data), body = h.pod.physicsBody;
    h.band(840);
    h.tick(60);
    const rec = h.rt.ships[h.pod.id];
    assert.ok(rec, 'a native-ready released payload is admitted to planet exposure');
    assert.equal(rec.region, 'danger');
    assert.ok(Math.abs(rec.heat - PLANET_SITE.heat.dangerRate) < 1e-10);
    assert.equal(h.pod.hull, 100);
    h.band(1200);
    h.tick(30);
    assert.ok(Math.abs(rec.heat - (PLANET_SITE.heat.dangerRate - PLANET_SITE.heat.coolRate / 2)) < 1e-10);
    assert.equal(h.rt.ships[h.pod.id], rec, 'same life keeps the same thermal record across band changes');
    assert.equal(h.pod.data, data);
    assert.deepEqual(h.pod.data, before);
    assert.equal(h.pod.physicsBody, body);
    assert.ok(h.facade.readOrchardPodReady(h.pod), 'ordinary exposure preserves exact native-ready custody');
  } finally { h.close(); }
});

test('stowed and copied released payload identities cannot acquire planet exposure', async () => {
  const h = await thermalWorld({ release: false });
  try {
    h.band(840);
    h.tick();
    assert.equal(h.rt.ships[h.pod.id], undefined);
    const fake = h.sim.spawn({ type: 'payload', hull: 100, pos: { ...h.pod.pos },
      radius: h.pod.radius, physicsBody: { ...h.pod.physicsBody, dynamic: true },
      data: { ...h.pod.data, masslineTetherable: true } });
    h.tick(60);
    assert.equal(h.rt.ships[fake.id], undefined);
    assert.equal(fake.hull, 100);
  } finally { h.close(); }
});

test('released exposure is not crowded out by the ship budget and refuses a replaced occupant', async () => {
  const h = await thermalWorld();
  try {
    h.band(840);
    for (let n = 0; n < 12; n++) h.sim.spawn({ type: 'ship', hull: 100, pos: { ...h.pod.pos }, radius: 5 });
    // Put the genuine pod after every ordinary ship in the spatial result.
    h.sim.state.entityList.splice(h.sim.state.entityList.indexOf(h.pod), 1);
    h.sim.state.entityList.push(h.pod);
    h.tick();
    assert.ok(h.rt.ships[h.pod.id]?.heat > 0, 'the finite pod budget is independent of nearest-ship budget');
    const fake = { ...h.pod, occupantGeneration: h.pod.occupantGeneration + 1, data: { ...h.pod.data } };
    h.sim.state.entities.set(h.pod.id, fake);
    h.sim.state.entityList[h.sim.state.entityList.indexOf(h.pod)] = fake;
    h.tick();
    assert.equal(h.rt.ships[fake.id], undefined, 'a reused id cannot inherit an old life thermal record');
  } finally { h.close(); }
});

test('ordinary planet plasma burns destroy a released pod and settle exactly one finite loss without reward', async () => {
  const h = await thermalWorld();
  try {
    h.band(700);
    const data = h.pod.data, before = structuredClone(data);
    const cargo = structuredClone(h.sim.state.player.cargo);
    const core = h.sim.registry.systems[0];
    let destroyed = 0;
    h.sim.bus.on('entity:destroyed', event => { if (event.entity === h.pod) destroyed++; });
    h.tick(120);
    assert.ok(h.pod.hull < 100 && h.pod.hull > 0, `real combat router accepts nonlethal plasma damage ${JSON.stringify({hull:h.pod.hull,shield:h.pod.shield,rec:h.rt.ships[h.pod.id],tel:h.rt.telemetry})}`);
    assert.ok(h.facade.readOrchardPodReady(h.pod), 'nonlethal burns retain custody');
    for (let n = 0; n < 1200 && h.pod.alive !== false; n++) h.tick();
    assert.equal(h.pod.alive, false, 'real combat kill ends the hull lifetime');
    assert.ok(h.rt.telemetry.burnsRouted > 0);
    core.lifetimeSweep(0, h.sim.state);
    core.lifetimeSweep(0, h.sim.state);
    assert.equal(destroyed, 1);
    const row = h.sim.state.sites.anvilOrchard;
    assert.equal(row.sockets[1].status, 'lost');
    assert.equal(row.lots[0].outcome, 'lost');
    assert.equal(row.sourceRemaining, 44);
    assert.equal(row.sourceRemaining + row.lots.reduce((sum, lot) => sum + lot.units, 0), 48);
    assert.deepEqual(h.sim.state.player.cargo, cargo);
    assert.equal(h.pod.data, data);
    assert.deepEqual(h.pod.data, before);
    assert.equal(h.sim.state.entityList.filter(e => e.alive !== false && e.data?.commodityId === ANVIL_ORCHARD.commodityId).length, 0);
  } finally { h.close(); }
});

for (const refusal of ['away-sector', 'dead', 'not-ready']) test(`released thermal admission refuses ${refusal}`, async () => {
  const h = await thermalWorld();
  try {
    h.band(840);
    if (refusal === 'away-sector') h.sim.state.world.currentSectorId = 'sector_elsewhere';
    if (refusal === 'dead') h.pod.alive = false;
    if (refusal === 'not-ready') h.facade.readOrchardPodReady = () => null;
    h.tick(60);
    assert.equal(h.rt.ships[h.pod.id], undefined);
    assert.equal(h.pod.hull, 100);
  } finally { h.close(); }
});

test('ready-read dropout and repeated admission cannot erase or double-advance pod heat', async () => {
  const h = await thermalWorld();
  try {
    h.band(840);
    h.tick(60);
    const heat = h.rt.ships[h.pod.id].heat;
    const read = h.facade.readOrchardPodReady;
    h.facade.readOrchardPodReady = () => null;
    h.tick();
    assert.equal(h.rt.ships[h.pod.id], undefined);
    assert.equal(h.pod.orchardThermalExposure.heat, heat);
    h.facade.readOrchardPodReady = read;
    h.tick();
    assert.ok(Math.abs(h.rt.ships[h.pod.id].heat - heat - PLANET_SITE.heat.dangerRate / 60) < 1e-10);
    const once = structuredClone(h.pod.orchardThermalExposure);
    h.planet._tickShips(1 / 60, h.sim.state, h.rt, PLANET_SITE);
    assert.deepEqual(h.pod.orchardThermalExposure, once);
    delete h.rt.ships[h.pod.id];
    h.planet._tickShips(1 / 60, h.sim.state, h.rt, PLANET_SITE);
    assert.deepEqual(h.pod.orchardThermalExposure, once, 'rehydration in the same sim instant does not heat twice');
  } finally { h.close(); }
});

test('real save-owner Continue retains pod heat, stage and pending burn cadence without touching source data', async () => {
  const h = await thermalWorld();
  try {
    h.band(700);
    h.tick(70);
    const before = structuredClone(h.pod.orchardThermalExposure);
    assert.equal(before.stage, 'descent');
    assert.ok(before.burnNextAt > h.sim.state.simTime);
    const hull = h.pod.hull, sourceData = structuredClone(h.pod.data);
    const save = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(save.serialize('orchard-thermal')));
    const savedPod = envelope.data.entities.persistent.find(e => e.data?.orchardKind === 'pod');
    assert.deepEqual(savedPod.orchardThermalExposure, before);
    delete envelope.checksum;
    assert.equal(save.loadEnvelope(envelope), true);
    h.facade._finishNativeRestore();
    assert.equal(await h.facade.prepareBackend(h.sim.state), true);
    h.owner = h.facade._sg02;
    h.pod = h.sim.state.entityList.find(e => e.data?.orchardKind === 'pod');
    h.rt = h.sim.state.planet;
    h.rt.siteId = PLANET_SITE.id;
    h.band(700);
    assert.ok(h.facade.readOrchardPodReady(h.pod));
    assert.deepEqual(h.pod.data, sourceData);
    assert.deepEqual(h.pod.orchardThermalExposure, before);
    h.planet._tickShips(1 / 60, h.sim.state, h.rt, PLANET_SITE);
    assert.deepEqual(h.pod.orchardThermalExposure, before, 'same restored sim instant does not advance');
    assert.equal(h.pod.hull, hull);
    while ((h.sim.state.tick + 1) / 60 < before.burnNextAt) {
      h.tick();
      assert.equal(h.pod.hull, hull, 'no early burn after Continue');
    }
    h.tick();
    assert.ok(h.pod.hull < hull, 'the pending ordinary burn resumes on its saved deadline');
    assert.ok(h.facade.readOrchardPodReady(h.pod));
    assert.deepEqual(h.pod.data, sourceData);
  } finally { h.close(); }
});

for (const corruption of ['lot', 'site', 'heat', 'stage', 'time']) test(`corrupt or mismatched ${corruption} thermal history is not adopted`, async () => {
  const h = await thermalWorld();
  try {
    h.band(840);
    h.tick(60);
    const saved = h.pod.orchardThermalExposure;
    if (corruption === 'lot') saved.lotId = 'anvil_storm_orchard:0:4';
    if (corruption === 'site') saved.siteId = 'other-planet';
    if (corruption === 'heat') saved.heat = NaN;
    if (corruption === 'stage') saved.stage = 'forged';
    if (corruption === 'time') saved.burnNextAt = 1e12;
    delete h.rt.ships[h.pod.id];
    h.tick();
    assert.ok(Math.abs(h.rt.ships[h.pod.id].heat - PLANET_SITE.heat.dangerRate / 60) < 1e-10);
    assert.equal(h.pod.orchardThermalExposure.siteId, PLANET_SITE.id);
    assert.equal(h.pod.orchardThermalExposure.lotId, h.pod.data.worldRecordId);
    assert.ok(h.facade.readOrchardPodReady(h.pod));
  } finally { h.close(); }
});

test('untouched cold pods skip native thermal reads outside the existing hot bands, retained exposure never skips', async () => {
  const h = await thermalWorld();
  try {
    let reads = 0;
    const read = h.facade.readOrchardPodReady;
    h.facade.readOrchardPodReady = function (entity) { reads++; return read.call(this, entity); };
    h.band(1200);
    h.tick(30);
    assert.equal(reads, 0, 'safe untouched cargo needs no full native observation for planetary heat');
    assert.equal(h.rt.ships[h.pod.id], undefined);
    assert.equal(h.pod.orchardThermalExposure, undefined);
    h.band(840);
    h.tick();
    assert.equal(reads, 1, 'danger-band admission still proves current native custody');
    assert.ok(h.rt.ships[h.pod.id].heat > 0);
    h.band(1200);
    h.tick();
    assert.equal(reads, 2, 'retained heat follows authoritative ordinary cooling');
    h.tick(30);
    assert.equal(reads, 32);
    assert.equal(h.rt.ships[h.pod.id].heat, 0);
    h.tick();
    assert.equal(reads, 33, 'a retained zero-heat record is not a new untouched pod');
    delete h.rt.ships[h.pod.id];
    h.tick();
    assert.equal(reads, 34, 'persisted exposure alone still requires authoritative admission');
  } finally { h.close(); }
});
