// PULSE-SIGNS (build_map row 433) — done-when:
//   Station billboards, bay screens and news crawls draw from the ad board, the news and
//   faction propaganda. A wanted poster shows the player's own hull and callsign while heat
//   is high. Feat headlines name the player. Nothing repeats within one docking session.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGN_BAY,
  SIGN_BILLBOARD,
  SIGN_CRAWL,
  SIGN_PROPAGANDA,
  WANTED_POSTER_LINES,
  fillSignSlots,
  signsForSurface,
} from '../src/data/stationSigns.js';
import {
  dockingSessionKey,
  selectStationSign,
} from '../src/ui/station/adBoard.js';
import { recordDeed } from '../src/systems/deedRecord.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';

// ── helpers ────────────────────────────────────────────────────────────────────────────

function stationEntity(stationId, factionId, stationTypeId) {
  return {
    id: stationId,
    type: 'station',
    alive: true,
    pos: { x: 0, z: 0 },
    data: { stationId, factionId, stationTypeId },
  };
}

function dockedState({
  seed = 7,
  stationId = 'station_helios',
  factionId = 'faction_scn',
  stationTypeId = 'trade_hub',
  simTime = 1200,
  dockT = 1190,
  heat = 0,
  callsign = 'Tessera',
  shipId = 'ship_kestrel',
} = {}) {
  return {
    meta: { seed },
    simTime,
    tick: Math.floor(simTime * 60),
    mode: 'flight',
    ui: { docked: true, dockedStationId: stationId },
    factionPresence: { lastDock: { stationId, t: dockT } },
    entityIndex: { stations: [stationEntity(stationId, factionId, stationTypeId)] },
    entities: new Map([[stationId, stationEntity(stationId, factionId, stationTypeId)]]),
    player: {
      heat,
      ownedShips: [{ shipId, name: callsign, def: { name: 'Hitch' } }],
      activeShipIndex: 0,
    },
    story: { flags: {}, record: null },
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

// ── corpus shape ───────────────────────────────────────────────────────────────────────

test('sign bank covers all three surfaces plus faction propaganda and the wanted template', () => {
  assert.ok(SIGN_BAY.length >= 20, 'bay screens need a real corpus');
  assert.ok(SIGN_BILLBOARD.length >= 20, 'billboard needs a real corpus');
  assert.ok(SIGN_CRAWL.length >= 15, 'news crawl needs a real corpus');
  assert.ok(SIGN_PROPAGANDA.length >= 14, 'every faction needs a registered voice');
  const factions = new Set(SIGN_PROPAGANDA.map((e) => e.factionId));
  assert.equal(factions.size, 14, 'one propaganda voice per faction');
  assert.ok(WANTED_POSTER_LINES.length >= 3, 'several warrant posters so the wall varies');
  for (const entry of [...SIGN_BAY, ...SIGN_BILLBOARD, ...SIGN_CRAWL, ...SIGN_PROPAGANDA]) {
    assert.ok(entry.id && /^(sign|bay)_/.test(entry.id), `sign id prefix: ${entry.id}`);
    assert.ok(entry.text && entry.text.length > 10, `sign text authored: ${entry.id}`);
    assert.ok(entry.sponsor, `sign sponsor present: ${entry.id}`);
  }
  const ids = [...SIGN_BAY, ...SIGN_BILLBOARD, ...SIGN_CRAWL, ...SIGN_PROPAGANDA].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'sign ids unique');
});

// ── sources: ad board, news, propaganda ────────────────────────────────────────────────

test('the billboard deck includes the authored ad_board corpus', () => {
  const packEntries = FLAVOR_PACKS.ad_board.entries.filter((e) => e.reactsTo !== 'conflict_flip');
  const state = dockedState();
  const seen = new Set();
  // Walk a full deck worth of cycles; the corpus rows must appear among them.
  for (let cycle = 0; cycle < 80; cycle++) {
    const s = dockedState({ simTime: 1200 + cycle * 90 + 1 });
    const notice = selectStationSign(s, 'billboard');
    if (notice) seen.add(notice.id);
  }
  const corpusHits = packEntries.filter((e) => seen.has(e.id)).length;
  assert.ok(corpusHits >= packEntries.length * 0.5,
    `billboard rotation should carry the ad board corpus (saw ${corpusHits}/${packEntries.length})`);
});

test('bay and crawl pools answer the surface filters', () => {
  const scnBay = signsForSurface('bay', { factionId: 'faction_scn', stationTypeId: 'military' });
  assert.ok(scnBay.some((e) => e.id === 'bay_mil_01'), 'military berth sees the watch lines');
  const miningBay = signsForSurface('bay', { factionId: 'faction_dmc', stationTypeId: 'mining' });
  assert.ok(miningBay.some((e) => e.id === 'bay_mine_01'), 'mining berth sees claim-office copy');
  assert.ok(!miningBay.some((e) => e.id === 'bay_mil_01'), 'mining berth does not see watch lines');
  const reachCrawl = signsForSurface('crawl', { factionId: 'faction_reach' });
  assert.ok(reachCrawl.some((e) => e.factionId === 'faction_reach'),
    'the crawl carries the berth faction\'s propaganda as official notices');
  const scnCrawl = signsForSurface('crawl', { factionId: 'faction_scn' });
  assert.ok(!scnCrawl.some((e) => e.factionId === 'faction_reach'),
    'foreign propaganda never rides a Concord berth crawl');
});

// ── wanted poster ──────────────────────────────────────────────────────────────────────

test('a wanted poster names the player hull and callsign while heat is high', () => {
  const state = dockedState({ heat: 0.6, callsign: 'Nine Finch', shipId: 'ship_wasp' });
  state.player.ownedShips[0].def = { name: 'Wasp' };
  const notice = selectStationSign(state, 'billboard');
  assert.ok(notice, 'billboard should show something');
  assert.equal(notice.dynamic, 'wanted', 'the arrival panel is the warrant poster while hot');
  assert.match(notice.text, /Nine Finch/, 'poster prints the callsign');
  assert.match(notice.text, /Wasp/, 'poster prints the hull name');
});

test('no warrant means no wanted poster', () => {
  const state = dockedState({ heat: 0.02 });
  for (let cycle = 0; cycle < 12; cycle++) {
    const s = dockedState({ heat: 0.02, simTime: 1200 + cycle * 90 + 1 });
    const notice = selectStationSign(s, 'billboard');
    if (notice) assert.notEqual(notice.dynamic, 'wanted', `cycle ${cycle} must not show a warrant`);
  }
});

// ── feat headlines ─────────────────────────────────────────────────────────────────────

test('feat headlines on the crawl name the pilot', () => {
  const state = dockedState({ callsign: 'Tessera' });
  recordDeed(state, { kind: 'base_destroyed', sectorId: 'sector_sker_haven', subject: 'raider base', weight: 4 });
  const notice = selectStationSign(state, 'crawl');
  assert.ok(notice, 'crawl should have a headline');
  assert.equal(notice.dynamic, 'feat', 'the arrival wire item is the pilot\'s feat');
  assert.match(notice.text, /Tessera/, 'feat headline names the pilot');
  assert.match(notice.text, /raider base|Sker/i, 'feat headline carries the deed body');
});

// ── no repeats inside one docking session ───────────────────────────────────────────────

test('nothing repeats within one docking session', () => {
  const adCorpus = FLAVOR_PACKS.ad_board.entries.filter((e) => e.reactsTo !== 'conflict_flip');
  // One session per surface: the shared shown-set also dedupes propaganda that legally runs on
  // two surfaces — cross-surface exhaustion is part of the contract, so isolate the decks.
  const surfaces = [['billboard', 60_000], ['bay', 70_000], ['crawl', 80_000]];
  for (const [surface, dockT] of surfaces) {
    const poolSize = signsForSurface(surface, {
      factionId: 'faction_scn', stationTypeId: 'trade_hub',
    }).length + (surface === 'billboard' ? adCorpus.length : 0);
    const ids = [];
    let exhaustedAt = null;
    for (let cycle = 0; cycle < poolSize + 6; cycle++) {
      const state = dockedState({ simTime: dockT + cycle * 90 + 1, dockT });
      const notice = selectStationSign(state, surface);
      if (notice) ids.push(notice.id);
      else if (exhaustedAt == null) exhaustedAt = cycle;
    }
    assert.equal(new Set(ids).size, ids.length,
      `${surface} repeated inside one session: ${ids.join(',')}`);
    assert.equal(ids.length, poolSize,
      `${surface} should show exactly its eligible pool then go dark (got ${ids.length}/${poolSize})`);
    assert.ok(exhaustedAt == null || exhaustedAt >= poolSize - 1,
      `${surface} darkened early at cycle ${exhaustedAt}`);
  }
});

test('the deck is deterministic for the same session and pins a slot per cycle', () => {
  const run = (dockT) => {
    const ids = [];
    for (let cycle = 0; cycle < 8; cycle++) {
      const state = dockedState({ simTime: dockT + 10 + cycle * 90, dockT });
      const notice = selectStationSign(state, 'bay');
      ids.push(notice ? notice.id : null);
    }
    return ids;
  };
  const a = run(40_000);
  run(41_000);                 // a different dock resets the session record…
  const a2 = run(40_000);      // …and the original session reproduces its exact rotation
  assert.deepEqual(a, a2, 'same session key must produce the same rotation');
  // Within one cycle, repeated renders re-show the pinned panel — no flicker, no deck burn.
  const state = dockedState({ simTime: 42_000, dockT: 41_900 });
  const first = selectStationSign(state, 'bay');
  const again = selectStationSign(state, 'bay');
  assert.equal(first && first.id, again && again.id, 'same cycle pins the same panel');
});

// ── slot interpolation ──────────────────────────────────────────────────────────────────

test('fillSignSlots interpolates callsign and hull into the warrant copy', () => {
  const text = fillSignSlots(WANTED_POSTER_LINES[0].text,
    { callsign: 'Tessera', hull: 'Hitch', tier: 'bounty' });
  assert.match(text, /Tessera/);
  assert.match(text, /Hitch/);
  assert.doesNotMatch(text, /\{callsign\}|\{hull\}|\{tier\}/, 'no raw slots reach the wall');
});
