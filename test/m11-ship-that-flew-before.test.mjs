import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { cargo } from '../src/systems/cargo.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';
import { normalizeRecordsBag, serializeRecordsBag } from '../src/world/worldRecords.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';

const SEED = 4242;
const SITE = ALIEN_SITES.preserved_cockpit;
const LOSS_SECTOR = 'sector_ceres_belt';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [cargo, world] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = LOSS_SECTOR;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 14, mass: 12, rot: 0.4,
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel', shipName: 'Second Sunrise',
      sectorId: 'sector_helios_prime' } });
  state.playerId = player.id;
  const owner = sim.registry.get('world');
  const messages = [];
  bus.on('comms:log', p => messages.push(p.text));
  return { sim, state, bus, player, owner, messages };
}

function lose(h, name = 'Second Sunrise', defId = 'ship_kestrel', sectorId = LOSS_SECTOR) {
  h.player.data.shipName = name;
  h.player.data.defId = defId;
  h.state.world.currentSectorId = sectorId;
  h.state.simTime += 123;
  h.player.alive = false;
  h.bus.emit('player:death', { recoverable: true });
  h.player.alive = true;
  return h.state.world.records.hullLosses.at(-1);
}

function visit(h) {
  h.state.world.currentSectorId = SITE.sectorId;
  const active = { dressing: [], pois: [{ poiId: SITE.poiId, name: SITE.name,
    pos: h.owner._toGlobal(SITE.center, SITE.sectorId) }] };
  h.state.world.activeSector = active;
  materializeAlienEcology(h.owner, { id: SITE.sectorId }, active, [SITE]);
  return h.state.entityList.find(e => e.type === 'wreck' && e.data?.hullEchoLossId);
}

function tick(h) { tickAlienEcology(h.owner, 1 / 60); }
function bearing(h) {
  return h.state.world.activeSector.pois.find(p => p.poiId.startsWith('hull_echo_'));
}

test('seed 4242: a real player death creates a recognizable hull hook, not a stranger’s loss', () => {
  const h = boot();
  try {
    h.bus.emit('entity:killed', { id: 98765 });
    assert.equal(h.state.world.records.hullLosses.length, 0);
    const loss = lose(h);
    h.bus.emit('player:death', { recoverable: true }); // duplicate death delivery
    assert.equal(h.state.world.records.hullLosses.length, 1);
    assert.equal(loss.name, 'Second Sunrise');
    assert.equal(loss.shipClass, 'Hitch');
    assert.equal(loss.sectorId, LOSS_SECTOR, 'active sector wins over stale hull stamp');
    const wreck = visit(h);
    assert.ok(wreck, 'the existing cockpit site contains a physical wreck');
    assert.equal(wreck.data.hullEchoLossId, loss.lossId);
    assert.equal(wreck.data.defId, 'ship_kestrel');
    assert.match(wreck.data.scanDescription, /Second Sunrise.*Hitch.*Ceres/i);
    assert.match(wreck.data.scanDescription, /Observe.*follow.*align.*scoop/);
    assert.equal(bearing(h).hidden, true, 'a scan must expose the recorded bearings');
  } finally { h.sim.dispose(); }
});

test('seed 4242: different loss histories give different readouts; a bound site keeps its hull', () => {
  const a = boot(), b = boot();
  try {
    const first = lose(a);
    lose(b, 'Last Lantern', 'ship_wasp', 'sector_pallas_drift');
    const readoutA = visit(a).data.scanDescription;
    const readoutB = visit(b).data.scanDescription;
    assert.notEqual(readoutA, readoutB);
    assert.match(readoutB, /Last Lantern.*Wasp.*Pallas/i);
    lose(a, 'Later Hull', 'ship_mule');
    assert.equal(a.state.world.records.hullLosses.length, 2);
    visit(a);
    assert.equal(bearing(a).poiId, `hull_echo_${first.lossId}`);
  } finally { a.sim.dispose(); b.sim.dispose(); }
});

test('seed 4242: a named Wasp keeps its packaged hull across reload with a different entity id', () => {
  const a = boot(), b = boot();
  try {
    const loss = lose(a, 'Last Lantern', 'ship_wasp');
    const wreck = visit(a);
    const file = wreckPackagedFile(wreck);
    assert.equal(file, 'wholeships/wasp_production_v1.glb', 'use the renderer\'s named-hull selector');
    assert.equal(wreck.data.hulkOfDefId, loss.shipDefId);
    const disk = JSON.parse(JSON.stringify(serializeRecordsBag(a.state.world.records)));
    b.state.world.records = normalizeRecordsBag(disk);
    b.sim.spawn({ type: 'wreck', pos: { x: 0, z: 0 } }); // change the materialized entity ids
    const reloaded = visit(b);
    assert.notEqual(reloaded.id, wreck.id);
    assert.equal(reloaded.data.name, 'Last Lantern');
    assert.equal(reloaded.data.hullEchoLossId, loss.lossId);
    assert.equal(reloaded.data.hulkOfDefId, loss.shipDefId);
    assert.equal(wreckPackagedFile(reloaded), file, 'the saved loss, not the entity id, selects its hull');
  } finally { a.sim.dispose(); b.sim.dispose(); }
});

test('seed 4242: the final marker follows a displaced wreck and releases the recorder there', () => {
  const h = boot();
  try {
    const loss = lose(h);
    const wreck = visit(h);
    const siteCenter = h.owner._toGlobal(SITE.center, SITE.sectorId);
    h.player.pos.copy(siteCenter);
    h.bus.emit('scan:pulse', { pos: { ...h.player.pos }, radius: 1200 });
    h.player.pos.copy(bearing(h).pos);
    tick(h);
    wreck.pos.x += 500;
    h.player.pos.copy(bearing(h).pos);
    tick(h);
    assert.equal(loss.echo.leg, 2);
    assert.equal(bearing(h).pos.x, wreck.pos.x, 'the final bearing starts at the displaced hull');
    assert.equal(bearing(h).pos.z, wreck.pos.z);
    wreck.pos.z += 500;
    h.player.pos.copy(siteCenter);
    h.player.rot = loss.rot;
    tick(h);
    assert.equal(bearing(h).pos.x, wreck.pos.x, 'the final marker keeps following the live hull');
    assert.equal(bearing(h).pos.z, wreck.pos.z);
    assert.equal(loss.echo.aligned, false, 'alignment at the authored center cannot release the recorder');
    assert.equal(h.state.entityList.some(e => e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`), false);
    h.player.pos.copy(bearing(h).pos);
    tick(h);
    assert.equal(loss.echo.aligned, true, 'alignment at the displayed wreck marker releases the recorder');
    const pod = h.state.entityList.find(e => e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`);
    assert.ok(pod, 'the aligned wreck releases a physical recorder');
    assert.ok(Math.hypot(pod.pos.x - wreck.pos.x, pod.pos.z - wreck.pos.z) < 120);
  } finally { h.sim.dispose(); }
});

test('seed 4242: save payload and reload preserve history, binding and partial route progress', () => {
  const a = boot(), b = boot();
  try {
    lose(a);
    visit(a);
    a.player.pos.copy(a.owner._toGlobal(SITE.center, SITE.sectorId));
    a.bus.emit('scan:pulse', { pos: { ...a.player.pos }, radius: 1200 });
    a.player.pos.copy(bearing(a).pos);
    tick(a);
    assert.equal(a.state.world.records.hullLosses[0].echo.leg, 1);
    const saver = Object.assign(Object.create(save), {
      state: a.state, bus: a.bus, helpers: a.sim.helpers, registry: a.sim.registry,
    });
    const disk = JSON.parse(JSON.stringify(saver.serializeData()));
    assert.equal(CURRENT_VERSION, 17);
    b.owner.deserialize(disk.world);
    assert.deepEqual(b.state.world.records.hullLosses, disk.world.records.hullLosses);
    const wreck = visit(b);
    assert.match(wreck.data.scanDescription, /Second Sunrise.*Ceres/i);
    assert.equal(b.state.world.records.hullLosses[0].echo.leg, 1);
    disk.world.records.hullLosses[0].name = 'changed disk copy';
    assert.equal(a.state.world.records.hullLosses[0].name, 'Second Sunrise');
    assert.equal(b.state.world.records.hullLosses[0].name, 'Second Sunrise');
  } finally { a.sim.dispose(); b.sim.dispose(); }
});

test('seed 4242: no-loss profiles and migrated old saves never invent the personal hook', () => {
  const h = boot();
  try {
    assert.equal(visit(h), undefined);
    h.player.pos.copy(h.owner._toGlobal(SITE.center, SITE.sectorId));
    h.bus.emit('scan:pulse', { pos: { ...h.player.pos }, radius: 1200 });
    tick(h);
    assert.equal(bearing(h), undefined);
    assert.equal(h.messages.some(text => /Your hull, lost/.test(text)), false);
    const old = { player: { credits: 9087 }, world: { records: {
      schemaId: 'spaceface.worldRecords.v1', schemaVersion: 2, byId: { prior: { name: 'keep me' } },
    }, discovery: { remembered: true } } };
    const migration = MIGRATIONS.find(step => step.from === 16);
    migration.fn(old);
    const once = JSON.stringify(old);
    migration.fn(old);
    assert.equal(JSON.stringify(old), once);
    assert.deepEqual(old.world.records.hullLosses, []);
    assert.equal(old.player.credits, 9087);
    assert.equal(old.world.discovery.remembered, true);
    assert.deepEqual(old.world.records.byId, { prior: { name: 'keep me' } });
    const recorded = lose(h);
    const current = { world: { records: serializeRecordsBag(h.state.world.records) } };
    migration.fn(current);
    assert.equal(normalizeRecordsBag(current.world.records).hullLosses[0].lossId, recorded.lossId);
  } finally { h.sim.dispose(); }
});

test('seed 4242: destroying the remembered hull leaves its bearings and recorder recoverable', () => {
  const h = boot();
  try {
    const loss = lose(h);
    const wreck = visit(h);
    h.player.pos.copy(wreck.pos);
    h.bus.emit('scan:pulse', { pos: { ...h.player.pos }, radius: 1200 });
    wreck.pos.x += 200;
    wreck.alive = false;
    h.bus.emit('entity:killed', { id: wreck.id, type: 'wreck', pos: { ...wreck.pos } });
    assert.equal(loss.echo.wreckDestroyed, true);
    for (let i = 0; i < 2; i++) { h.player.pos.copy(bearing(h).pos); tick(h); }
    h.player.pos.copy(wreck.pos);
    h.player.rot = loss.rot;
    tick(h);
    assert.equal(loss.echo.aligned, true);
    assert.ok(h.state.entityList.some(e => e.alive && e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`));
    const disk = serializeRecordsBag(h.state.world.records);
    assert.equal(normalizeRecordsBag(disk).hullLosses[0].echo.wreckDestroyed, true);
  } finally { h.sim.dispose(); }
});

test('seed 4242: observe, follow both bearings, align and physically recover once; full hold can retry', () => {
  const h = boot();
  try {
    const loss = lose(h);
    const wreck = visit(h);
    h.player.pos.copy(wreck.pos);
    tick(h);
    assert.equal(loss.echo.aligned, false, 'shortcut alone cannot release the recorder');
    h.bus.emit('scan:pulse', { pos: { ...h.player.pos }, radius: 1200 });
    assert.equal(loss.echo.observed, true);
    for (let i = 0; i < 2; i++) { h.player.pos.copy(bearing(h).pos); tick(h); }
    h.player.pos.copy(wreck.pos);
    h.player.rot = loss.rot + Math.PI;
    tick(h);
    assert.equal(loss.echo.aligned, false, 'backward approach cannot align');
    h.player.rot = loss.rot;
    tick(h);
    assert.equal(loss.echo.aligned, true);
    const pod = h.state.entityList.find(e => e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`);
    assert.ok(pod, 'alignment releases a physical recorder');
    h.player.pos.copy(pod.pos);
    h.state.player.cargo.capVolume = 0;
    const physicsOwner = Object.create(physics);
    physicsOwner.init({ state: h.state, bus: h.bus, helpers: h.sim.helpers });
    physicsOwner.collectPickups(h.state);
    assert.equal(loss.echo.recovered, false);
    assert.equal(pod.alive, true, 'refused cargo remains scoopable');
    h.state.player.cargo.capVolume = 40;
    h.state.simTime += 1;
    physicsOwner.collectPickups(h.state);
    assert.equal(loss.echo.recovered, true);
    assert.equal(h.state.player.cargo.items.cmdty_dmc_black_box, 1);
    tick(h);
    assert.equal(h.state.entityList.filter(e => e.alive !== false && e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`).length, 0);
    assert.equal(h.messages.filter(text => /Flight recorder recovered/.test(text)).length, 1);
  } finally { h.sim.dispose(); }
});
