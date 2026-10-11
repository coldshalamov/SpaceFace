/**
 * THE WORLD REMEMBERS (U-E GOSSIP) - the world's mouths read the Record.
 *
 * Dock control greets a pilot the Record has made known (cold at standing <= -4, warm at >= +4)
 * and the wire carries one neutral line for a loud deed. Both read state.story.record; a game with
 * no record key hears exactly what it heard before. Seeds 4242 / 8008.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { recordDeed, peekDeedRecord, deedsFor, standingWith, markTold } from '../src/systems/deedRecord.js';
import { deedLine, deedPlaceName } from '../src/data/deedPhrases.js';
import { DOCK_DEED_BARKS, dockDeedBarkFor } from '../src/data/barks.js';

const SEEDS = [4242, 8008];

function boot(seed, { accept = true } = {}) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.mode = 'flight';
  state.simTime = 300;
  state.tick = 18000;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  const bus = createBus();
  const said = [];
  const helpers = { voice: { say(p) { said.push(p); return accept; } } };
  const barkSys = Object.assign({}, barkDirector);
  barkSys.init({ state, bus, helpers, registry: null });
  const news = createMarketNews({ state, bus, helpers: {} });
  return { state, bus, helpers, said, barkSys, news };
}

function dispose(h) { h.barkSys.destroy?.(); h.news.destroy?.(); }

const dockBarks = (h) => h.said.filter((s) => s.kind === 'dockDeed');
const newsLog = (h) => h.state.ui.marketNews.log.filter((r) => r && r.source === 'deedRecord');

function slam(state, over = {}) {
  return recordDeed(state, {
    kind: 'dock_slam', sectorId: 'sector_ceres_belt', stationId: 'station_ceres', factionId: 'faction_dmc',
    weight: 5, detail: { fineCr: 900 }, ...over,
  });
}

for (const seed of SEEDS) {
  test(`dock bark [${seed}]: standing <= -4 plays the cold bank naming the deed's place, once`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const deed = slam(h.state);
    assert.ok(standingWith(h.state, 'faction_dmc') <= -4);

    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    const barks = dockBarks(h);
    assert.equal(barks.length, 1);
    assert.equal(barks[0].channel, 'bark');
    assert.equal(barks[0].register, 'dock_control');
    assert.equal(barks[0].factionId, 'faction_dmc');
    assert.match(barks[0].text, new RegExp(deedPlaceName(deed)));
    assert.ok(barks[0].text.includes(deedLine(deed, { voice: 'grievance' })), barks[0].text);
    assert.ok(DOCK_DEED_BARKS.cold.some((l) => l.split('{deed}')[0].length > 0
      && barks[0].text.startsWith(l.split('{')[0])), 'a cold frame, not a warm one');
    assert.equal(deed.told, 1);
    assert.equal(deed.toldBy, 'dock:station_ceres');

    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    assert.equal(dockBarks(h).length, 1, 'a told deed is not repeated at the next dock');
    assert.equal(deed.told, 1);
  });

  test(`dock bark [${seed}]: standing >= +4 plays the warm bank naming the praise deed`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const a = recordDeed(h.state, { kind: 'pod_rescued', id: 'pod:rescued:a', sectorId: 'sector_helios_prime', factionId: 'faction_scn' });
    recordDeed(h.state, { kind: 'pod_rescued', id: 'pod:rescued:b', sectorId: 'sector_helios_prime', factionId: 'faction_scn' });
    assert.ok(standingWith(h.state, 'faction_scn') >= 4);

    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    const barks = dockBarks(h);
    assert.equal(barks.length, 1);
    assert.ok(DOCK_DEED_BARKS.warm.some((l) => barks[0].text.startsWith(l.split('{')[0])), barks[0].text);
    assert.match(barks[0].text, /Helios Prime|Helios Station/);
    const told = deedsFor(h.state, {}).filter((d) => d.told === 1);
    assert.equal(told.length, 1);
    assert.ok(told[0].id === a.id || told[0].id === 'pod:rescued:b');
  });

  test(`dock bark [${seed}]: neutral standing, a refused line, and a station with no opinion stay quiet`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    slam(h.state, { weight: 2 });
    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    assert.equal(dockBarks(h).length, 0, 'standing -2 is not cold');
    const loud = slam(h.state, { weight: 5 });
    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    h.bus.emit('dock:docked', { stationId: 'station_does_not_exist' });
    h.bus.emit('dock:docked', {});
    // Helios (SCN) reads the other 'reputation travels thinner' quarter: -1.75, not cold.
    assert.equal(dockBarks(h).length, 0);
    assert.equal(loud.told, 0);

    const refused = boot(seed, { accept: false });
    t.after(() => dispose(refused));
    const deed = slam(refused.state);
    refused.bus.emit('dock:docked', { stationId: 'station_ceres' });
    assert.equal(deed.told, 0, 'a bark the voice floor refused is not told');
  });

  test(`news [${seed}]: a weight>=3 deed posts one neutral line; re-dock and arrival add no duplicate`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const quiet = recordDeed(h.state, { kind: 'stunt', sectorId: 'sector_ceres_belt', weight: 2 });
    const loud = recordDeed(h.state, { kind: 'base_destroyed', sectorId: 'sector_ceres_belt', factionId: 'faction_reach', subject: 'pirate_den' });
    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    const log = newsLog(h);
    assert.equal(log.length, 1);
    assert.equal(log[0].text, deedLine(loud, { voice: 'neutral' }));
    assert.equal(log[0].eventId, `deed:news:${loud.id}`);
    assert.equal(log[0].sectorId, 'sector_ceres_belt');
    assert.equal(loud.told, 0, 'news is not a speaker');
    assert.equal(quiet.told, 0);

    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    h.bus.emit('jump:arrive', { sectorId: 'sector_ceres_belt' });
    assert.equal(newsLog(h).length, 1);

    const second = recordDeed(h.state, { kind: 'pod_rescued', id: 'pod:rescued:n', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' });
    h.bus.emit('jump:arrive', { sectorId: 'sector_ceres_belt' });
    assert.equal(newsLog(h).length, 2, 'a new loud deed makes its own line');
    assert.equal(newsLog(h)[0].eventId, `deed:news:${second.id}`);
  });

  test(`no record key [${seed}]: dock, arrival and bar-adjacent readers say nothing and do not throw`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    assert.equal(peekDeedRecord(h.state), null);
    h.bus.emit('dock:docked', { stationId: 'station_ceres' });
    h.bus.emit('jump:arrive', { sectorId: 'sector_ceres_belt' });
    assert.equal(dockBarks(h).length, 0);
    assert.equal(newsLog(h).length, 0);
    assert.equal('record' in h.state.story, false, 'readers never create the record');
  });
}

test('dockDeedBarkFor: hash-picked frames, tokens substituted, nothing for an empty deed', () => {
  const tokens = { deed: 'You flew on.', place: 'Ceres Refinery', faction: 'DMC' };
  for (const tone of ['cold', 'warm']) {
    assert.ok(DOCK_DEED_BARKS[tone].length >= 3 && DOCK_DEED_BARKS[tone].length <= 4);
    for (let i = 0; i < DOCK_DEED_BARKS[tone].length; i++) {
      const line = dockDeedBarkFor(tone, i, tokens);
      assert.match(line, /You flew on\./);
      assert.doesNotMatch(line, /[{}]/);
    }
  }
  assert.equal(dockDeedBarkFor('cold', 0, { deed: '' }), null);
  assert.equal(dockDeedBarkFor('lukewarm', 0, tokens), null);
});

// ── contact hail: a lawful patrol opens with the loudest local grievance ─────────────────────
const { createContactHailOffer } = await import('../src/data/contactHail.js');
const { default: fs } = await import('node:fs');

function patrolAvailability() {
  const entity = {
    id: 'patrol-1', type: 'ship', alive: true, team: 2, factionId: 'faction_dmc',
    pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    data: { trafficRole: 'patrol', callsign: 'CONCORD SEVEN', ai: { passive: true, lawful: true, spawnContext: 'patrol' } },
  };
  return { enabled: true, kind: 'patrol', entity, targetId: entity.id, heaveToAvailable: false };
}

for (const seed of SEEDS) {
  test(`hail [${seed}]: a patrol in a sector with notoriety >= 3 opens with the grievance; offers never tell`, () => {
    const h = boot(seed);
    try {
      const avail = patrolAvailability();
      const before = createContactHailOffer(h.state, avail, 'r0', 400);
      assert.equal(before.deedId, undefined, 'no record: the faction voice, exactly as before');

      recordDeed(h.state, { kind: 'pod_abandoned', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc', weight: 1 });
      const quiet = createContactHailOffer(h.state, avail, 'r1', 400);
      assert.equal(quiet.deedId, undefined, 'notoriety 1 is below the bar');
      assert.deepEqual(quiet.lines, before.lines);

      const loud = recordDeed(h.state, { kind: 'kill_lawful', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc', subject: 'corvette' });
      const offer = createContactHailOffer(h.state, avail, 'r2', 400);
      assert.equal(offer.deedId, loud.id);
      assert.equal(offer.lines[1], deedLine(loud, { voice: 'grievance' }).toUpperCase());
      assert.match(offer.lines[1], /CERES BELT/);
      assert.equal(offer.lines.length, 2);
      assert.equal(createContactHailOffer(h.state, avail, '__probe__', 400).deedId, loud.id);
      assert.equal(loud.told, 0, 'building an offer (or a probe) never tells the deed');

      markTold(h.state, loud.id, { by: 'hail:patrol-1' });
      const after = createContactHailOffer(h.state, avail, 'r3', 400);
      assert.equal(after.deedId, undefined, 'a told deed is not opened with again');

      const elsewhere = boot(seed);
      elsewhere.state.world.currentSectorId = 'sector_helios_prime';
      recordDeed(elsewhere.state, { kind: 'kill_lawful', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' });
      recordDeed(elsewhere.state, { kind: 'base_destroyed', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' });
      assert.equal(createContactHailOffer(elsewhere.state, avail, 'r4', 400).deedId, undefined, 'notoriety is per sector');
      dispose(elsewhere);
    } finally { dispose(h); }
  });
}

test('hail prompt marks the deed told when it renders the offer, once per request', () => {
  const src = fs.readFileSync(new URL('../src/ui/contactHailPrompt.js', import.meta.url), 'utf8');
  assert.match(src, /payload\.deedId && payload\.requestId !== toldRequestId/);
  assert.match(src, /markTold\(state, payload\.deedId/);
});
