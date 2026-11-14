import test from 'node:test';
import assert from 'node:assert/strict';
import {contactHailAvailability,createContactHailOffer,createContactHailResponse} from '../src/data/contactHail.js';
import {furnaceObserver,furnaceObserverReply} from '../src/data/furnaceShiftContact.js';

function fixture() {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, team: 0, pos: { x: 0, z: 0 }, data: {} };
  const jorah = { id: 2, type: 'ship', alive: true, team: 2, occupantGeneration: 8,
    pos: { x: 100, z: 0 },
    data: { ai: { passive: true }, trafficRole: 'hauler',
      namedLaneContactId: 'lane_jorah_seam_haul', activityActorSlotId: 'ceres_refinery_hauler',
      worldRecordId: 'jorah', jobId: 'job:jorah' } };
  const m = { id: 'detail', status: 'active', storyTag: 'campaign47a:b1:infested',
    destSectorId: 'sector_ceres_belt',
    params: { furnaceFeedsNeeded: 3, furnaceWorksiteVersion: 1,
      furnaceLots: Array.from({ length: 3 }, (_, slot) => ({ slot, pos: { x: 0, z: 0 }, hull: 220 })) } };
  const s = { mode: 'flight', simTime: 1, playerId: 1,
    player: { targetId: 2 }, ui: {},
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[1, player], [2, jorah]]), entityList: [player, jorah],
    missions: { active: [m] },
    traffic: { freighters: [{ id: 2, role: 'hauler' }] },
    npcJobs: { byId: { 'job:jorah': { entityId: 2, worldRecordId: 'jorah',
      job: { id: 'job:jorah', kind: 'hauler', materialized: true } } } } };
  return { s, e: jorah, m };
}

const offer = s => createContactHailOffer(s, contactHailAvailability(s), 'conversation', s.simTime + 20);
const reply = (s, o) => createContactHailResponse(s, o, 'old_refinery');
const wordCount = line => line.replace(/[·—]/g, ' ').trim().split(/\s+/).filter(Boolean).length;

test('the selected authored hauler offers an optional closed-refinery read beside his route', () => {
  const { s, m } = fixture();
  const before = structuredClone(s);
  const o = offer(s);
  assert.ok(o.actions.some(a => a.id === 'old_refinery'));
  assert.equal(o.furnaceObserver.worldRecordId, 'jorah');
  const lines = reply(s, o).lines;
  assert.ok(lines.length <= 2);
  for (const line of lines) assert.ok(wordCount(line) <= 8, line);
  assert.match(lines[0], /not my ship/);
  assert.match(lines[1], /0\/3 IN · 0 LOST · 3 OUT/);
  assert.deepEqual(s, before); // the read mutates nothing — no cargo, credits, or ledger
  m.params.furnaceLots[0].received = true;
  m.params.furnaceLots[1].lost = true;
  assert.match(reply(s, offer(s)).lines[1], /1\/3 IN · 1 LOST · 1 OUT/);
});

test('settled aftermath reads the filed slip — losses honest, account closed', () => {
  const { s, m } = fixture();
  m.params.furnaceLots.forEach(l => { l.lost = true; });
  s.missions = { active: [],
    furnaceWorksiteAftermath: { version: 1, missionId: m.id, lots: structuredClone(m.params.furnaceLots) } };
  const before = structuredClone(s);
  const lines = reply(s, offer(s)).lines;
  assert.match(lines[1], /0\/3 IN · 3 LOST — losses aren't deliveries/);
  assert.deepEqual(s, before);
  s.missions.furnaceWorksiteAftermath.lots.forEach(l => { l.lost = false; l.received = true; });
  assert.match(reply(s, offer(s)).lines[1], /3\/3 IN — account closed/);
});

test('a missing or malformed ledger reads as no-slip, never as zero progress', () => {
  const { s, m } = fixture();
  delete m.params.furnaceLots;
  assert.match(reply(s, offer(s)).lines[1], /No valid slip under your name/);
  assert.equal(m.params.furnaceLots, undefined); // the read never mints a ledger
  s.missions.active = [];
  assert.match(reply(s, offer(s)).lines[1], /No valid slip under your name/);
});

test('forged actor, missing owner record, changed life, sector, range, target or expiry all refuse', () => {
  const changes = [
    f => { f.e.data.namedLaneContactId = 'other'; },
    f => { f.s.npcJobs.byId['job:jorah'].entityId = 99; },
    f => { f.e.occupantGeneration += 1; },
    f => { f.s.world.currentSectorId = 'other'; },
    f => { f.e.pos.x = 10000; },
    f => { f.e.alive = false; },
    f => { f.s.player.targetId = null; },
    f => { f.s.simTime = 21; },
  ];
  for (const change of changes) {
    const f = fixture();
    const o = offer(f.s);
    change(f);
    assert.equal(reply(f.s, o), null);
  }
});

test('an unstamped hull cannot offer or answer an observer identity', () => {
  const f = fixture();
  delete f.e.occupantGeneration;
  const o = offer(f.s);
  assert.equal(o.actions.some(a => a.id === 'old_refinery'), false);
  assert.equal(furnaceObserverReply(f.s, f.e, { expiresAt: 50, furnaceObserver: { worldRecordId: 'jorah', generation: 8 } }), null);
});

test('furnaceObserver refuses a hauler under control or tow work', () => {
  const f = fixture();
  f.s.npcJobs.byId['job:jorah'].control = { kind: 'heave_to' };
  assert.equal(furnaceObserver(f.s, f.e), null);
  const g = fixture();
  g.s.npcJobs.byId['job:jorah'].towAssist = { bodyId: 5 };
  assert.equal(furnaceObserver(g.s, g.e), null);
});
