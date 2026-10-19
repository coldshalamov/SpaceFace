import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from '../src/systems/world.js';
import { sectorExplorationProgress } from '../src/world/explorationJournal.js';
import { CHART_FILING, chartFilingBounty, normalizeChartFiling } from '../src/data/surveyCharts.js';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';

// Chart filing — the sell side of sector survey. When a sector's authored-site census closes,
// the world files the finished chart once: durable stamp on the discovery record, credits
// through the canonical writer, Concord standing, toast + news. These tests pin the filing
// edge, the once-only guarantee, and the payoff math.

function harness(sectorId) {
  const events = [];
  const state = {
    simTime: 20,
    entities: new Map(),
    playerId: 1,
    world: {
      currentSectorId: sectorId,
      sectors: {},
      discovery: {},
      activeSector: { id: sectorId, pois: [] },
    },
  };
  world.state = state;
  world.bus = { emit: (name, payload) => events.push({ name, payload }) };
  return { state, events };
}

const grants = (events) => events.filter((e) => e.name === 'economy:grantCredits');
const filings = (events) => events.filter((e) => e.name === 'discovery:chartFiled');

test('chartFilingBounty is a legible curve: fee + per-site + tier risk', () => {
  assert.equal(chartFilingBounty({ tier: 4 }, 3), 4360);   // Ashfall-class deep chart
  assert.equal(chartFilingBounty({ tier: 0 }, 14), 3380);  // Helios-class long chart
  assert.equal(chartFilingBounty({ tier: 4 }, 1), 3920);   // Phoebe-class single deep site
  assert.equal(chartFilingBounty({ tier: 1 }, 5), 2250);   // Vesta-class short chart
  assert.equal(chartFilingBounty({ tier: 4 }, 0), 0, 'no sites, no filing');
  assert.equal(chartFilingBounty(null, 3), 960, 'missing sector falls back to base + per-site');
});

test('normalizeChartFiling keeps a well-formed stamp and rejects junk', () => {
  assert.deepEqual(normalizeChartFiling({ at: 40, sites: 3, paid: 4360 }), { at: 40, sites: 3, paid: 4360 });
  assert.equal(normalizeChartFiling(true), null);
  assert.equal(normalizeChartFiling({ at: -1, sites: 3, paid: 100 }), null);
  assert.equal(normalizeChartFiling({ at: 0, sites: 0, paid: 100 }), null);
  assert.equal(normalizeChartFiling(null), null);
});

test('the last authored site investigated files the sector chart once — paid, logged, published', () => {
  const t = harness('sector_phoebe_echo');
  t.state.simTime = 140;

  assert.equal(world._onSignalInvestigated({
    sectorId: 'sector_phoebe_echo',
    sourceKind: 'salvage',
    sourceId: 'poi_phoebe_vault',
    completedAt: 140,
  }), true);

  const progress = sectorExplorationProgress(t.state, 'sector_phoebe_echo');
  assert.equal(progress.found, 1);
  assert.equal(progress.total, 1);

  const stamp = t.state.world.discovery.sector_phoebe_echo.chartFiled;
  assert.deepEqual(stamp, { at: 140, sites: 1, paid: 3920 });

  assert.equal(filings(t.events).length, 1);
  assert.deepEqual(filings(t.events)[0].payload, {
    sectorId: 'sector_phoebe_echo', found: 1, total: 1, bounty: 3920, at: 140,
  });

  const grant = grants(t.events);
  assert.equal(grant.length, 1);
  assert.equal(grant[0].payload.amount, 3920);
  assert.equal(grant[0].payload.reason, CHART_FILING.reasonId);
  assert.equal(grant[0].payload.sectorId, 'sector_phoebe_echo');

  const rep = t.events.find((e) => e.name === 'faction:repDelta');
  assert.deepEqual(rep && rep.payload, {
    factionId: 'faction_scn', delta: 2, reason: 'chart_filing:sector_phoebe_echo',
  });

  const toast = t.events.find((e) => e.name === 'toast' && /chart filed/i.test(e.payload.text || ''));
  assert.ok(toast, 'the player hears the chart filed');
  assert.match(toast.payload.text, /3,920 cr/);

  const news = t.events.find((e) => e.name === 'news:publish');
  assert.equal(news && news.payload.id, 'chart-filed:sector_phoebe_echo');
  assert.match(news.payload.text, /completed chart/);
});

test('chart filing is durable: survives a save round-trip and never double-pays', () => {
  const t = harness('sector_phoebe_echo');
  world._onSignalInvestigated({
    sectorId: 'sector_phoebe_echo',
    sourceKind: 'salvage',
    sourceId: 'poi_phoebe_vault',
    completedAt: 140,
  });
  assert.equal(grants(t.events).length, 1);

  // Serialize/restore the discovery overlay exactly like a save does.
  t.state.world.discovery = JSON.parse(JSON.stringify(t.state.world.discovery));
  assert.deepEqual(
    normalizeChartFiling(t.state.world.discovery.sector_phoebe_echo.chartFiled),
    { at: 20, sites: 1, paid: 3920 },
    'the stamp reads back through the normalizer after a clone',
  );

  // A late duplicate receipt — or a replayed event from an old runtime — cannot re-pay.
  world._onSignalInvestigated({
    sectorId: 'sector_phoebe_echo',
    sourceKind: 'salvage',
    sourceId: 'poi_phoebe_vault',
    completedAt: 200,
  });
  assert.equal(grants(t.events).length, 1, 'no second grant after restore');
  assert.equal(filings(t.events).length, 1, 'no second filing event');
});

test('a partial census files nothing — the office only buys a finished chart', () => {
  const t = harness('sector_ashfall_reach');
  world._onSignalInvestigated({
    sectorId: 'sector_ashfall_reach',
    sourceKind: 'salvage',
    sourceId: 'poi_vault',
    completedAt: 140,
  });
  const progress = sectorExplorationProgress(t.state, 'sector_ashfall_reach');
  assert.equal(progress.found, 1);
  assert.equal(progress.total, 3);
  assert.equal(t.state.world.discovery.sector_ashfall_reach.chartFiled, undefined);
  assert.equal(filings(t.events).length, 0);
  assert.equal(grants(t.events).length, 0);
});

test('a boss kill that closes the census files the chart at the defeat edge', () => {
  const t = harness('sector_ashfall_reach');
  t.state.simTime = 90;
  t.state.world.activeSector = {
    id: 'sector_ashfall_reach',
    pois: [{ id: 100, poiId: 'poi_vault', type: 'cache', hidden: true }],
    hazards: [],
  };
  // Two of three sites already on the record; the Deep-Mother is the last find.
  t.state.world.discovery.sector_ashfall_reach = {
    discovered: true,
    pois: {
      poi_vault: { discovered: true, identified: true, investigated: true },
      poi_claim_cinder_crown: { discovered: true, identified: true },
    },
  };
  t.state.entities.set(99, {
    id: 99, type: 'ship', alive: false, pos: { x: 240, z: 1180 },
    data: { isBoss: true, bossSectorId: 'sector_ashfall_reach', bossPoiId: 'poi_boss' },
  });

  world._onBossKilled({ id: 99, killerId: 1 });

  const progress = sectorExplorationProgress(t.state, 'sector_ashfall_reach');
  assert.equal(progress.found, 3);
  const stamp = t.state.world.discovery.sector_ashfall_reach.chartFiled;
  assert.equal(stamp && stamp.paid, 4360);
  assert.equal(stamp && stamp.sites, 3);
  const grant = grants(t.events).find((e) => e.payload.reason === CHART_FILING.reasonId);
  assert.ok(grant, 'the boss kill edge pays the completed chart');
  assert.equal(grant.payload.amount, 4360);
  assert.equal(filings(t.events).length, 1);
});

test('proximity identifying the last site files the chart through the scan tick', () => {
  const t = harness('sector_phoebe_echo');
  t.state.world.activeSector = {
    id: 'sector_phoebe_echo',
    pois: [{ id: 201, poiId: 'poi_phoebe_vault', type: 'cache' }],
  };
  t.state.entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { derived: { scannerTier: 0 } },
  });
  t.state.entities.set(201, {
    id: 201, type: 'fx', alive: true, pos: { x: 20, z: 0 },
    data: { poi: true, poiId: 'poi_phoebe_vault', name: 'Silent Vault', scanRange: 900 },
  });

  world._tickPOIScan(t.state);

  const rec = t.state.world.discovery.sector_phoebe_echo.pois.poi_phoebe_vault;
  assert.equal(rec.identified, true);
  assert.equal(t.state.world.discovery.sector_phoebe_echo.chartFiled.paid, 3920);
  assert.equal(grants(t.events).length, 1);
  assert.equal(filings(t.events).length, 1);

  // Holding position over the site does not re-file.
  world._tickPOIScan(t.state);
  assert.equal(grants(t.events).length, 1);
  assert.equal(filings(t.events).length, 1);
});

test('the galaxy map sells the completion: fee preview before, filed stamp after', () => {
  const t = harness('sector_phoebe_echo');
  galaxyMapScreen._selectedTarget = { kind: 'sector', id: 'sector_phoebe_echo' };

  const before = galaxyMapScreen._discoveryTabHtml(t.state);
  assert.match(before, /Chart fee/);
  assert.match(before, /3,920 cr on completion/);
  assert.doesNotMatch(before, /Chart filed/);

  world._onSignalInvestigated({
    sectorId: 'sector_phoebe_echo',
    sourceKind: 'salvage',
    sourceId: 'poi_phoebe_vault',
    completedAt: 140,
  });

  const after = galaxyMapScreen._discoveryTabHtml(t.state);
  assert.match(after, /Chart filed/);
  assert.match(after, /3,920 cr/);
  assert.doesNotMatch(after, /Chart fee/);
});
