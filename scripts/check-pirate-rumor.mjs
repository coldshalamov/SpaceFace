#!/usr/bin/env node
// BP-13/B12 Station Pirate-Rumor Heat contract.
//
// Rumors come only from real events: encounterDirector spawned pirate encounters, or civilian
// traffic deaths in a named zone. The hottest lane surfaces one station-news headline, and heat
// decays so rumors do not become permanent scares.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/pirateRumor.js', import.meta.url)),
  'src/systems/pirateRumor.js exists');

const sysMod = await import('../src/systems/pirateRumor.js');
const {
  PIRATE_RUMOR_THRESHOLD,
  pirateRumor,
  rumorKey,
  rumorReadoutForZone,
} = sysMod;

const REQUIRED_RUMOR_EVENTS = 3;
assert.equal(PIRATE_RUMOR_THRESHOLD, REQUIRED_RUMOR_EVENTS, 'B12 rumor threshold stays at three real events');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate rumor path'); };
  Date.now = () => { throw new Error('Date.now in pirate rumor path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testAmbushesSurfaceZoneHeadline);
guarded(testCivilianLaneDeathsCount);
guarded(testQuietZonesAndDecay);

console.log(`[check-pirate-rumor] PASS - ${sections} sections green`);

function boot(seed = 1212, sectorId = 'sector_pallas_drift') {
  const sim = createSimulation({ seed, systems: [pirateRumor] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const log = { news: [], cards: [], rumor: [] };
  bus.on('news:headline', (p) => log.news.push(p));
  bus.on('pirateRumor:card', (p) => log.cards.push(p));
  bus.on('pirateRumor:headline', (p) => log.rumor.push(p));
  return { sim, state, bus, log };
}

function emitAmbush(t, n = REQUIRED_RUMOR_EVENTS) {
  for (let i = 0; i < n; i++) {
    t.state.simTime = i * 12;
    t.bus.emit('encounter:spawned', {
      encounterId: `amb_${i}`,
      kind: 'ambush_snare',
      sectorId: 'sector_pallas_drift',
      zoneId: 'zone_pallas_ambush',
      count: 3,
    });
  }
}

function testAmbushesSurfaceZoneHeadline() {
  const t = boot();
  emitAmbush(t);
  assert.equal(t.log.news.length, 1, 'threshold ambushes emit one news headline');
  assert.equal(t.log.rumor.length, 1, 'threshold ambushes emit one pirateRumor headline event');
  assert.equal(t.log.cards.length, 1, 'threshold ambushes create one dock-card payload');
  assert.match(t.log.news[0].headline, /Sker-Run Ambush/, 'headline names the actual zone');
  assert.equal(t.log.news[0].kind, 'piracy', 'headline uses market-news piracy kind');
  const key = rumorKey('sector_pallas_drift', 'zone_pallas_ambush');
  assert.ok(t.state.pirateRumor.zones[key].heat >= PIRATE_RUMOR_THRESHOLD, 'zone heat reaches threshold');
  assert.match(rumorReadoutForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush').headline, /Sker-Run Ambush/,
    'readout exposes the same zone-named rumor');

  emitAmbush(t, 1);
  assert.equal(t.log.news.length, 1, 'same hot zone does not spam headlines inside cooldown');
  ok('real spawned ambushes surface one zone-named station-news rumor');
}

function testCivilianLaneDeathsCount() {
  const t = boot(1313, 'sector_tethys_junction');
  const lanePos = { x: 500, z: 1500 };
  for (let i = 0; i < REQUIRED_RUMOR_EVENTS; i++) {
    const hauler = t.sim.spawn({
      type: 'ship',
      team: 2,
      factionId: 'faction_mts',
      pos: { x: lanePos.x + i, z: lanePos.z },
      hull: 80,
      hullMax: 80,
      data: { trafficRole: 'hauler', ai: { passive: true, archetype: 'fleeing_trader' } },
    });
    t.state.simTime = i * 10;
    t.bus.emit('entity:killed', { id: hauler.id, killerId: 900 + i, type: 'ship', pos: hauler.pos });
  }
  assert.equal(t.log.news.length, 1, 'civilian traffic losses emit one headline at threshold');
  assert.match(t.log.news[0].headline, /Junction Trade Lane/, 'civilian-loss headline names the lane zone');
  ok('civilian lane deaths feed the same rumor heat without a fake ambush event');
}

function testQuietZonesAndDecay() {
  const t = boot(1414);
  t.bus.emit('encounter:spawned', {
    encounterId: 'quiet_patrol',
    kind: 'patrol_beat',
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_drift',
    count: 2,
  });
  t.bus.emit('entity:killed', {
    id: 9999,
    killerId: 1,
    type: 'ship',
    pos: { x: -1080, z: 540 },
  });
  assert.equal(t.log.news.length, 0, 'quiet/non-provenance events emit no rumor');

  emitAmbush(t);
  const key = rumorKey('sector_pallas_drift', 'zone_pallas_ambush');
  const before = t.state.pirateRumor.zones[key].heat;
  t.sim.registry.get('pirateRumor').update(1200, t.state);
  const after = t.state.pirateRumor.zones[key].heat;
  assert.ok(before >= PIRATE_RUMOR_THRESHOLD, 'test precondition: zone is hot before decay');
  assert.ok(after < 0.25, 'rumor heat decays almost to zero');
  ok('quiet zones stay silent and hot rumors decay away');
}
