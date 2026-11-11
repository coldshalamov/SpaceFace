// inf-lane-chatter-chart — WF-14: the chart reads what the station boards say about a lane.
//
// pirateRumor folds real pirate encounters and civilian traffic deaths into per-zone records and
// puts the hottest lane on the news wire and the dock card ("Pirate rumor: Belt-Shadow Ambush is
// hot after 4 recent losses."). The chart drew the same zone as a bare type + threat index, so
// what the pilot heard never reached the place it was about, the route shift the owner applies
// (bolder ambushes after ignored raids, thinner after a leader falls) was invisible, and the
// suspected raider base (`poi:candidate`) had no reader at all.
//
// These pins hold the read: the boards' flag reaches the zone record, the canvas label, the search
// and the "you are here" row; a cooled warning reads as cooled and draws nothing; a lane the boards
// never flagged reads nothing at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { laneChatterForZone } from '../src/ui/laneChatterMapLayer.js';
import { buildSystemModel, getSearchTargets } from '../src/ui/galaxyMap.js';
import { rumorKey } from '../src/systems/pirateRumor.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALAXY_MAP = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'galaxyMap.js'), 'utf8');

const SECTOR = 'sector_ceres_belt';
const LANE = 'zone_ceres_ambush';
const QUIET = 'zone_ceres_belt';

function rumorRecord(overrides = {}) {
  return {
    sectorId: SECTOR,
    zoneId: LANE,
    zoneName: 'Belt-Shadow Ambush',
    zoneType: 'ambush_lane',
    heat: 2.4,
    eventCount: 4,
    lossCount: 4,
    lastEventAt: 100,
    lastHeadlineAt: 100,
    lastHeadline: 'Pirate rumor: Belt-Shadow Ambush is hot after 4 recent losses.',
    headlineCount: 1,
    routeDanger: 0,
    routeConvoy: 0,
    routeFeedbackUntil: 0,
    pirateBaseCandidate: null,
    ...overrides,
  };
}

function stateWith(rec, extra = {}) {
  const zones = {};
  if (rec) zones[rumorKey(rec.sectorId, rec.zoneId)] = rec;
  return {
    simTime: 160,
    meta: { seed: 7 },
    playerId: 'player',
    player: { id: 'player', marketMemory: {} },
    world: { currentSectorId: SECTOR, sectors: {}, discovery: {} },
    entities: new Map(),
    pirateRumor: { zones },
    ...extra,
  };
}

test('a lane the boards never flagged reads nothing', () => {
  assert.equal(laneChatterForZone(stateWith(null), SECTOR, LANE), null, 'no record, no read');
  assert.equal(laneChatterForZone({}, SECTOR, LANE), null, 'no rumor slice at all is quiet, not a throw');
  const unheard = rumorRecord({ lastHeadlineAt: null, lastHeadline: null, headlineCount: 0, heat: 1.2, eventCount: 2, lossCount: 2 });
  assert.equal(laneChatterForZone(stateWith(unheard), SECTOR, LANE), null,
    'heat below the news bar was never on the wire — the chart does not invent the warning');
});

test('a live flag reads the boards count with the right plural and tags the canvas', () => {
  const live = laneChatterForZone(stateWith(rumorRecord()), SECTOR, LANE);
  assert.ok(live && live.live && live.flagged);
  assert.equal(live.lines[0], 'Station boards flag this lane: 4 hulls lost here.');
  assert.equal(live.mapTag, '4 LOST');

  const one = laneChatterForZone(stateWith(rumorRecord({ eventCount: 1, lossCount: 1 })), SECTOR, LANE);
  assert.equal(one.lines[0], 'Station boards flag this lane: 1 hull lost here.', 'one loss is one hull');
  assert.equal(one.mapTag, '1 LOST');
});

test('a cooled warning reads as cooled and draws nothing on the canvas', () => {
  const cooled = laneChatterForZone(stateWith(rumorRecord({ heat: 0 })), SECTOR, LANE);
  assert.ok(cooled && cooled.flagged && !cooled.live);
  assert.equal(cooled.lines[0], 'The boards flagged this lane after 4 losses. The talk has cooled since.');
  assert.equal(cooled.mapTag, '', 'a cooled lane wears no danger tag');
  const cooledOne = laneChatterForZone(stateWith(rumorRecord({ heat: 0, eventCount: 1, lossCount: 1 })), SECTOR, LANE);
  assert.equal(cooledOne.lines[0], 'The boards flagged this lane after 1 loss. The talk has cooled since.');
});

test('the owner route shift reads by its own reason while it lasts', () => {
  const bolder = laneChatterForZone(stateWith(rumorRecord({
    routeDanger: 0.2, routeFeedbackUntil: 900, lastRouteFeedbackReason: 'ignored',
  })), SECTOR, LANE);
  assert.equal(bolder.feedback.tone, 'bolder');
  assert.match(bolder.lines[1], /ambushes run bolder and convoys thinner/);

  const cleared = laneChatterForZone(stateWith(rumorRecord({
    routeDanger: -0.35, routeConvoy: 0.35, routeFeedbackUntil: 900, lastRouteFeedbackReason: 'leaderCleared',
  })), SECTOR, LANE);
  assert.equal(cleared.feedback.tone, 'cleared');
  assert.match(cleared.lines[1], /A raider leader fell here/);

  const intel = laneChatterForZone(stateWith(rumorRecord({
    routeDanger: -0.2, routeConvoy: 0.2, routeFeedbackUntil: 900, lastRouteFeedbackReason: 'counter_intelligence',
  })), SECTOR, LANE);
  assert.equal(intel.feedback.tone, 'intel');

  const expired = laneChatterForZone(stateWith(rumorRecord({
    routeDanger: 0.2, routeFeedbackUntil: 150, lastRouteFeedbackReason: 'ignored',
  })), SECTOR, LANE);
  assert.equal(expired.feedback, null, 'a lapsed shift (until <= simTime) says nothing');
  assert.equal(expired.lines.length, 1);
});

test('the suspected raider base finally has a reader: evidence count, payoff, NEST? tag', () => {
  const candidate = {
    candidateId: `pirateBase:${SECTOR}:${LANE}`,
    provenance: { source: 'actual_ambush_events', eventCount: 6 },
    payoff: { salvage: true, bounty: true },
  };
  const nest = laneChatterForZone(stateWith(rumorRecord({ pirateBaseCandidate: candidate })), SECTOR, LANE);
  assert.equal(nest.nest.raids, 6);
  assert.equal(nest.lines.at(-1),
    'Logged raids: 6 ambushes from the same vectors. A raider nest likely sits near this lane: salvage and a bounty if you find it.');
  assert.equal(nest.mapTag, '4 LOST · NEST?');

  const coldNest = laneChatterForZone(stateWith(rumorRecord({
    heat: 0, pirateBaseCandidate: { ...candidate, payoff: { salvage: true } },
  })), SECTOR, LANE);
  assert.equal(coldNest.mapTag, 'NEST?', 'a cooled lane with a suspected base still marks the base');
  assert.match(coldNest.lines.at(-1), /salvage if you find it\.$/);
});

test('the system model carries the read on the flagged zone only', () => {
  const model = buildSystemModel(stateWith(rumorRecord()), SECTOR);
  const lane = model.zones.find((z) => z.id === LANE);
  const quiet = model.zones.find((z) => z.id === QUIET);
  assert.ok(lane && lane.chatter && lane.chatter.live, 'the ambush lane carries the live read');
  assert.equal(lane.chatter.mapTag, '4 LOST');
  assert.equal(quiet.chatter, null, 'an unflagged zone carries nothing');
});

test('chart search finds the lane the headline named, and only once it was named', () => {
  const flagged = getSearchTargets(stateWith(rumorRecord()), 'system', SECTOR)
    .filter((t) => t.kind === 'zone' && t.id === LANE);
  assert.equal(flagged.length, 1, 'the flagged named lane is searchable');
  assert.match(flagged[0].detail, /4 LOST$/);
  const unflagged = getSearchTargets(stateWith(null), 'system', SECTOR)
    .filter((t) => t.kind === 'zone' && t.id === LANE);
  assert.equal(unflagged.length, 0, 'an ordinary ambush lane is not indexed until the boards flag it');
});

test('the inspector, the you-are-here row and the canvas read the same owner', () => {
  assert.match(GALAXY_MAP, /laneChatterForZone\(state, t\.sectorId \|\| currentSectorId\(state\), t\.id\)/,
    'the zone record reads the lane chatter for the selected zone');
  assert.match(GALAXY_MAP, /data-lane-chatter="\$\{chatter\.live \? 'live' : 'cooled'\}"[\s\S]{0,200}Lane chatter/,
    'the zone record carries a Lane chatter section');
  assert.match(GALAXY_MAP, /hereChatter && hereChatter\.live && hereChatter\.lines\.length/,
    'the overview zone row speaks only for a live flag');
  assert.match(GALAXY_MAP, /this\._layers\.events && z\.chatter && z\.chatter\.mapTag/,
    'the canvas mark rides the TROUBLE · Events layer');
  assert.match(GALAXY_MAP, /if \(chatterTag && z\.chatter\.live\) \{[\s\S]{0,260}CHART_INK\.danger/,
    'only a live flag draws the danger ring');
  assert.doesNotMatch(GALAXY_MAP.slice(GALAXY_MAP.indexOf('const chatterTag'), GALAXY_MAP.indexOf('const chatterSuffix')),
    /simTime|animT|performance\.now/, 'the ring is static ink — nothing animates');
});
