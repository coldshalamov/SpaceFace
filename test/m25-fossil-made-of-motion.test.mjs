import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { MOTION_FOSSIL_SIGNAL, tickMotionFossil } from '../src/world/motionFossil.js';
import { siteRuntime } from './helpers/mj4-site-runtime.mjs';

const site = ALIEN_SITES.warm_freighter;
function fixture(options) {
  const f = siteRuntime(site.sectorId, options);
  f.playerAt({ x: site.center.x, z: site.center.z + 430 });
  f.step(0.1, { ecology: true });
  return f;
}
function record(f) {
  if (!f.state.sites.motionFossil.emitterOnline) f.action(site.siteId, 'restore');
  assert.equal(f.action(site.siteId, 'compare').ok, true);
  assert.equal(f.action(site.siteId, 'stimulate', { signalId: MOTION_FOSSIL_SIGNAL }).ok, true);
  f.seconds(4.2, { ecology: true });
  assert.equal(f.state.sites.motionFossil.status, 'recorded');
  return f.state.sites.motionFossil;
}
function follow(f) {
  assert.equal(f.action(site.siteId, 'follow').ok, true);
  const rec = f.state.sites.motionFossil;
  for (const point of rec.path) { f.playerAt(point); f.step(0.1, { ecology: true }); }
  return rec;
}

test('M25 controlled stimulation records a readable path; following reaches a real dock and settles once', () => {
  const f = fixture(), rec = record(f);
  assert.equal(rec.samples.length, 2);
  assert.notEqual(rec.samples[0].strainId, rec.samples[1].strainId);
  assert.ok(rec.samples.every(sample => sample.reaction === 'repeated-fragment'));
  assert.deepEqual(rec.path, site.routeEcho.waypoints.map(p => ({ x: site.center.x + p.x, z: site.center.z + p.z })));
  assert.ok(f.events.some(e => e.name === 'comms:log' && e.payload.text.includes('-3400, 1300')));
  f.step(0.1, { ecology: true });
  const dock = f.state.entityList.find(e => e.alive !== false && e.data?.motionFossilDestination);
  assert.equal(dock.type, 'wreck'); assert.equal(dock.collides, true);
  assert.deepEqual(dock.data.salvagePool, { cmdty_alloys: 2 });
  assert.equal(rec.outcome, null);
  follow(f);
  assert.equal(rec.status, 'filed');
  assert.deepEqual(dock.pos, f.world._toGlobal(rec.outcome.place));
  assert.match(rec.outcome.finding, /Origin unknown/);
  assert.ok(f.state.world.alienEcology.evidence.P06, 'the native evidence owner files the bounded research unlock');
  f.seconds(1, { ecology: true });
  assert.equal(f.action(site.siteId, 'follow').ok, false, 'a stale out-of-range action cannot start a second settlement');
  assert.equal(f.events.filter(e => e.name === 'ecology:fossilSettled').length, 1);
});

test('M25 wrong recording, same host twice and offline relay refuse without fabricated path', () => {
  const f = fixture();
  assert.match(f.action(site.siteId, 'stimulate').reason, /Compare/);
  const host = f.state.entityList.find(e => e.data?.ecology?.faunaKey?.includes(':motion_fossil:'));
  assert.match(f.action(site.siteId, 'compare', { hostIds: [host.id, host.id] }).reason, /same host twice/);
  f.action(site.siteId, 'compare');
  assert.match(f.action(site.siteId, 'stimulate', { signalId: 'unrelated-recording' }).reason, /Wrong recording/);
  f.state.sites.motionFossil.emitterOnline = false;
  assert.match(f.action(site.siteId, 'stimulate').reason, /Relay off/);
  assert.deepEqual(f.state.sites.motionFossil.path, []);
  f.action(site.siteId, 'restore'); record(f);
});

test('M25 weapons interrupt observation, pause does not accrue it, and a calm replay recovers', () => {
  const f = fixture(); f.action(site.siteId, 'restore'); f.action(site.siteId, 'compare'); f.action(site.siteId, 'stimulate');
  f.state.timeScale = 0; f.seconds(6, { ecology: true });
  assert.equal(f.state.sites.motionFossil.observedFor, 0);
  f.state.timeScale = 1;
  f.bus.emit('combat:fire', { ownerId: f.state.playerId }); f.seconds(4.2, { ecology: true });
  assert.equal(f.state.sites.motionFossil.status, 'interrupted');
  assert.deepEqual(f.state.sites.motionFossil.path, []);
  record(f);
});

test('M25 site save retains the path and followed legs, and a restored result never pays twice', () => {
  const f = fixture(), rec = record(f);
  f.action(site.siteId, 'follow');
  f.playerAt(rec.path[0]); f.step(0.1, { ecology: true });
  const saved = JSON.parse(JSON.stringify(f.system.serialize()));
  const g = fixture({ offset: { x: 42000, z: -9000 } });
  g.system.deserialize(saved);
  assert.deepEqual(g.state.sites.motionFossil.path, rec.path);
  assert.equal(g.state.sites.motionFossil.leg, 1);
  for (const point of rec.path.slice(1)) { g.playerAt(point); g.step(0.1, { ecology: true }); }
  assert.equal(g.state.sites.motionFossil.status, 'filed');
  g.system.deserialize(JSON.parse(JSON.stringify(g.system.serialize())));
  g.step(0.1, { ecology: true });
  assert.equal(g.events.filter(e => e.name === 'ecology:fossilSettled').length, 1);
  assert.equal(g.state.entityList.filter(e => e.alive !== false && e.data?.motionFossilDestination).length, 1);
});

test('M25 reaching the last marker early cannot settle; a destroyed register cannot become evidence', () => {
  const f = fixture(), rec = record(f);
  f.action(site.siteId, 'follow');
  f.playerAt(rec.path.at(-1)); f.step(0.1, { ecology: true });
  assert.equal(rec.leg, 0); assert.equal(rec.outcome, null);
  const dock = f.state.entityList.find(e => e.data?.motionFossilDestination);
  dock.hull = 0; dock.alive = false;
  for (const point of rec.path) { f.playerAt(point); f.step(0.1, { ecology: true }); }
  assert.equal(rec.status, 'register-lost'); assert.equal(rec.outcome, null);
  assert.equal(f.events.filter(e => e.name === 'ecology:fossilSettled').length, 0);
});

test('M25 load mid-observation requires a fresh controlled trial and keeps depletion across saves', () => {
  const f = fixture(); f.action(site.siteId, 'restore'); f.action(site.siteId, 'compare'); f.action(site.siteId, 'stimulate');
  f.seconds(1, { ecology: true });
  const g = fixture({ offset: { x: 10000, z: 20000 } });
  g.system.deserialize(JSON.parse(JSON.stringify(f.system.serialize())));
  assert.equal(g.state.sites.motionFossil.status, 'interrupted');
  assert.deepEqual(g.state.sites.motionFossil.path, []);
  g.seconds(4.2, { ecology: true });
  assert.deepEqual(g.state.sites.motionFossil.path, []);
  record(g); g.step(0.1, { ecology: true });
  const dock = g.state.entityList.find(e => e.data?.motionFossilDestination);
  dock.data.salvagePool = {};
  const depleted = JSON.parse(JSON.stringify(g.system.serialize()));
  assert.deepEqual(depleted.motionFossil.destination.salvage, {});
  const h = fixture(); h.system.deserialize(depleted); h.step(0.1, { ecology: true });
  assert.deepEqual(h.state.entityList.find(e => e.data?.motionFossilDestination).data.salvagePool, {});
  const register = h.state.entityList.find(e => e.data?.motionFossilDestination);
  register.hull = 0; register.alive = false;
  assert.equal(h.system.serialize().motionFossil.destination.destroyed, true, 'same-tick save records destruction before materialization can run');
});

test('M25 portable recorder works with the relay off; motionless controls produce a valid no-response finding', () => {
  const f = fixture();
  f.state.entities.get(f.state.playerId).data.fittings = ['mod_echo_recorder_s'];
  f.playerAt({ x: site.center.x, z: site.center.z + 900 });
  f.action(site.siteId, 'compare');
  assert.equal(f.action(site.siteId, 'stimulate').ok, true);
  assert.equal(f.state.sites.motionFossil.emitterOnline, false);
  f.seconds(4.2, { ecology: true });
  assert.equal(f.state.sites.motionFossil.status, 'recorded');
  const g = fixture(); g.action(site.siteId, 'restore'); g.action(site.siteId, 'compare'); g.action(site.siteId, 'stimulate');
  for (let i = 0; i < 42; i++) tickMotionFossil(g.world, 0.1);
  assert.equal(g.state.sites.motionFossil.status, 'no-response');
  assert.deepEqual(g.state.sites.motionFossil.path, []);
  assert.equal(g.state.sites.motionFossil.outcome, null);
});
