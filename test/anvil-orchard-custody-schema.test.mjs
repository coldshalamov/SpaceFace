import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrchardRecord, normalizeOrchardRecord, orchardLotId, orchardPhase } from '../src/data/anvilOrchard.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { createSimulation } from '../src/core/sim.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { save } from '../src/save/saveSystem.js';

const clone = x => JSON.parse(JSON.stringify(x));
function held(progress = 0) {
  const r = createOrchardRecord(71), s = r.sockets[1];
  s.cycle = 1; s.lotId = orchardLotId(1, 1); s.status = progress ? 'releasing' : 'stowed';
  s.progress = progress; s.acceptedTick = progress ? 72 : null; s.completedTick = progress ? 72 + progress : null;
  s.openedTick = progress === 30 ? 102 : null; s.operation = progress === 30 ? 'open' : progress ? 'opening' : 'closed';
  r.lots.push({ id: s.lotId, socket: 1, cycle: 1, units: 4, outcome: 'retained' });
  r.sourceRemaining -= 4;
  return r;
}
function boot() {
  const sim = createSimulation({ seed: 424213, systems: [asteroidSites, save] });
  const player = sim.spawn({ type: 'ship', pos: { x: 10, z: 20 }, mass: 100, radius: 6,
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel', fittings: [] } });
  sim.state.playerId = player.id; sim.state.mode = 'flight'; sim.state.tick = 200;
  return { sim, state: sim.state, sites: sim.registry.get('asteroidSites'), save: sim.registry.get('save') };
}

test('Orchard absent/new state cannot manufacture allocated stock or completed work', () => {
  const r = createOrchardRecord(91);
  assert.equal(r.sourceRemaining, 48); assert.deepEqual(r.lots, []);
  assert.deepEqual(normalizeOrchardRecord(r), r);
  assert.ok(r.sockets.every(s => s.progress === 0 && s.completedTick === null && s.lotId === null));
});

test('finite row projection is detached and rejects source inflation, duplicate lots and skipped cycles', () => {
  const r = held(15), n = normalizeOrchardRecord(r);
  assert.deepEqual(n, r); assert.notEqual(n.sockets[1], r.sockets[1]);
  for (const mutate of [r => r.sourceRemaining++, r => r.lots.push(clone(r.lots[0])),
    r => r.sockets[1].cycle = 2, r => r.lots[0].units = 0,
    r => r.sockets[1].progress = 15.1, r => r.sockets[1].completedTick = Infinity]) {
    const bad = clone(r); mutate(bad); assert.equal(normalizeOrchardRecord(bad), null);
  }
});

test('dynamic handoff needs full actual opening or completed independent mount-lost work', () => {
  for (const handoff of ['requested', 'ready']) {
    const r = held(15), s = r.sockets[1]; s.handoff = handoff; s.targetRevision = 2;
    s.status = handoff === 'ready' ? 'drifting' : 'releasing';
    assert.equal(normalizeOrchardRecord(r), null);
    r.frameStatus = 'destroyed'; s.mountLostWork = 29; assert.equal(normalizeOrchardRecord(r), null);
    s.mountLostWork = 30; s.mountLostTick = 117; s.readyTick = handoff === 'ready' ? 118 : null;
    assert.equal(normalizeOrchardRecord(r)?.sockets[1].progress, 15);
  }
});

test('forecast remainder derives from saved phase anchor without resetting warning', () => {
  const r = createOrchardRecord(10);
  assert.deepEqual(orchardPhase(r, 10 + 719), { phase: 'forecast', remainingTicks: 1 });
  assert.deepEqual(orchardPhase(clone(r), 10 + 720), { phase: 'gust', remainingTicks: 300 });
});

test('v14 migration is a pure candidate projection and does not create an Orchard', () => {
  const migrate = MIGRATIONS.find(m => m.from === 14 && m.to === 15).fn;
  const d = { sites: { byId: {} } }; migrate(d); assert.equal(d.sites.anvilOrchard, null);
  const first = clone(d); migrate(d); assert.deepEqual(d, first);
  const current = { sites: { anvilOrchard: held(14) } }; migrate(current);
  assert.equal(current.sites.anvilOrchard.sockets[1].progress, 14);
});

test('real sites/save serialize → JSON → load preserves finite stock and partial opening', () => {
  const h = boot(); h.state.sites.anvilOrchard = held(14);
  const envelope = clone(h.save.serialize('orchard-schema'));
  assert.equal(envelope.version, CURRENT_VERSION);
  assert.deepEqual(envelope.data.sites.anvilOrchard, h.state.sites.anvilOrchard);
  h.state.sites.anvilOrchard = createOrchardRecord(100);
  assert.equal(h.save.loadEnvelope(envelope), true);
  assert.deepEqual(h.state.sites.anvilOrchard, held(14));
  assert.deepEqual(h.sites.serialize().anvilOrchard, held(14));
  h.sim.dispose();
});

test('malformed current save refuses before restore, preserving live state and custody references', () => {
  const h = boot(); h.state.sites.anvilOrchard = held(14);
  const beforeSites = h.state.sites, beforeRecord = beforeSites.anvilOrchard;
  const beforeEntities = h.state.entities, beforePlayer = h.state.entities.get(h.state.playerId);
  const envelope = clone(h.save.serialize('orchard-invalid'));
  envelope.data.sites.anvilOrchard.sourceRemaining = 48; delete envelope.checksum;
  let restoring = 0; h.sim.bus.on('save:restoring', () => restoring++);
  assert.equal(h.save.loadEnvelope(envelope), false); assert.equal(restoring, 0);
  assert.equal(h.state.sites, beforeSites); assert.equal(h.state.sites.anvilOrchard, beforeRecord);
  assert.equal(h.state.entities, beforeEntities); assert.equal(h.state.entities.get(h.state.playerId), beforePlayer);
  h.sim.dispose();
});


test('historical ticks reject impossible work, forged ready status and delivered-before-handoff', () => {
  for (const mutate of [r => r.sockets[1].acceptedTick = 100, r => r.sockets[1].completedTick = 80,
    r => r.sockets[1].readyTick = 99, r => { r.sockets[1].status = 'delivered'; r.lots[0].outcome = 'delivered'; },
    r => { r.frameStatus = 'destroyed'; r.sockets[1].mountLostWork = 30; }]) {
    const r = held(14); mutate(r); assert.equal(normalizeOrchardRecord(r), null);
  }
  const r = held(30), s = r.sockets[1];
  s.status = 'drifting'; s.handoff = 'ready'; s.targetRevision = 2; s.readyTick = 103;
  s.operation = 'closing'; s.progress = 14; s.completedTick = 118;
  assert.equal(normalizeOrchardRecord(r)?.sockets[1].progress, 14, 'closing preserves earlier physical release history');
  s.completedTick = 110; assert.equal(normalizeOrchardRecord(r), null, 'closing cannot claim sixteen steps in eight ticks');
});


test('future Orchard history refuses before restore for every saved tick field', () => {
  for (const key of ['phaseAnchorTick', 'acceptedTick', 'completedTick', 'openedTick', 'readyTick', 'mountLostTick']) {
    const h = boot(), r = held(30), s = r.sockets[1];
    if (key === 'phaseAnchorTick') { r.phaseAnchorTick = 201; s.acceptedTick = 202; s.completedTick = s.openedTick = 232; }
    if (key === 'acceptedTick') { s.acceptedTick = 201; s.completedTick = s.openedTick = 231; }
    if (key === 'completedTick') s.completedTick = 201;
    if (key === 'openedTick') s.completedTick = s.openedTick = 201;
    if (key === 'readyTick') { s.status = 'drifting'; s.handoff = 'ready'; s.targetRevision = 2; s.readyTick = 201; }
    if (key === 'mountLostTick') { r.frameStatus = 'destroyed'; s.mountLostWork = 30; s.mountLostTick = 201; }
    assert.ok(normalizeOrchardRecord(r), key + ' fixture is internally coherent');
    const envelope = clone(h.save.serialize('future-' + key)); envelope.data.sites.anvilOrchard = r; delete envelope.checksum;
    const before = h.state.entities; let restoring = 0; h.sim.bus.on('save:restoring', () => restoring++);
    assert.equal(h.save.loadEnvelope(envelope), false, key); assert.equal(restoring, 0); assert.equal(h.state.entities, before);
    h.sim.dispose();
  }
});
