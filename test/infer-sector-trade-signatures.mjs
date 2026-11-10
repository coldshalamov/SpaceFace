// Station trade personalities — authored marketEquilibriumFactors signatures.
//
// The galaxy used to carry exactly ONE authored price quirk (Helios Prime's standing iron
// shortage). This packet authors two more complete trade routes, each a glut station and a
// shortage station in adjacent sectors:
//
//   • cmdty_fuel_cells — Ceres Refinery's crackers over-run the belt (glut 2.4,
//     sector_ceres_belt) while the Cut Claim Outpost's drills burn their ration by mid-shift
//     (shortage 0.1, sector_hyperion_cut — one bridge gate west). Refinery produces the cells;
//     mining burns them.
//   • cmdty_food — Drift Market's fringe ration intake keeps overshooting (glut 2.4,
//     sector_pallas_drift) while Belt Outpost's rock crews eat same-shift (shortage 0.1,
//     sector_ceres_belt — one gate up-lane). The trade hub grows the food; mining eats it.
//
// The quirk is data-only: economyEquilibriumForListing (exported, pure) folds the authored
// factor into a listing's resting stock target and the shared price curve does the rest.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  economyEquilibriumForListing,
  economyBaseEqForSize,
} from '../src/systems/economy.js';
import bandPack from '../src/data/flavor/040-band.js';
import { HEADLINE_TEMPLATES, fillTemplate } from '../src/data/newsTemplates.js';
import { AUTHORED_DOCK_RUMORS } from '../src/data/frontierRumors.js';

// economy.js keeps this table private; the test re-derives the same pure rule
// (produce wins ties) so the signatures are checked against the real roles.
function roleFor(commodityDef, stationType) {
  if ((commodityDef.producedBy || []).includes(stationType)) return 'produce';
  if ((commodityDef.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_BY_ID.set(station.id, { station, sector });
  }
}

// The authored signatures this packet adds, as one flight-ready route each.
const SIGNATURE_ROUTES = [
  {
    commodityId: 'cmdty_fuel_cells',
    glutStationId: 'station_ceres',
    shortageStationId: 'station_hyperion_claim',
    glutFactor: 2.4,
    shortageFactor: 0.1,
  },
  {
    commodityId: 'cmdty_food',
    glutStationId: 'station_drift',
    shortageStationId: 'station_beltout',
    glutFactor: 2.4,
    shortageFactor: 0.1,
  },
];

// Band lines this packet adds (one per station story; channels own the voices).
const NEW_BAND_LINES = [
  { channelId: 'the_margin', lineId: 'margin_13' },
  { channelId: 'concord_bulletin', lineId: 'concord_09' },
];

// The additive news variant this packet adds (glut-side ticker copy).
const NEW_NEWS_VARIANT = 'Dock cranes stack {noun} to the ceiling at {station} — buyers wanted';
const NEWS_TOKENS = new Set(['name', 'station', 'noun']);

test('every authored market factor is finite, positive, within clamp, and names a real commodity', () => {
  const quirked = [];
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      const factors = station.marketEquilibriumFactors;
      if (!factors) continue;
      for (const [commodityId, factor] of Object.entries(factors)) {
        quirked.push(`${station.id}:${commodityId}`);
        assert.equal(typeof factor, 'number', `${station.id} factor for ${commodityId} must be a number`);
        assert.ok(Number.isFinite(factor), `${station.id} factor for ${commodityId} must be finite`);
        assert.ok(factor > 0, `${station.id} factor for ${commodityId} must be > 0`);
        assert.ok(factor >= 0.01 && factor <= 4,
          `${station.id} factor ${factor} for ${commodityId} outside the 0.01-4 clamp`);
        assert.ok(COMMODITY_BY_ID.has(commodityId),
          `${station.id} quirks unknown commodity ${commodityId}`);
      }
    }
  }
  // The Helios iron anchor plus the four new signatures: the whole authored book stays visible.
  assert.ok(quirked.includes('station_helios:cmdty_ore_iron'), 'Helios iron anchor must remain');
  for (const route of SIGNATURE_ROUTES) {
    assert.ok(quirked.includes(`${route.glutStationId}:${route.commodityId}`),
      `${route.glutStationId} must carry the ${route.commodityId} glut`);
    assert.ok(quirked.includes(`${route.shortageStationId}:${route.commodityId}`),
      `${route.shortageStationId} must carry the ${route.commodityId} shortage`);
  }
});

test('the authored glut rests the market rich in stock and the shortage starves it below a fifth of base', () => {
  for (const route of SIGNATURE_ROUTES) {
    const def = COMMODITY_BY_ID.get(route.commodityId);
    assert.ok(def, `route commodity ${route.commodityId} exists`);
    for (const [stationId, factor, kind] of [
      [route.glutStationId, route.glutFactor, 'glut'],
      [route.shortageStationId, route.shortageFactor, 'shortage'],
    ]) {
      const found = STATION_BY_ID.get(stationId);
      assert.ok(found, `${stationId} exists in SECTORS`);
      const { station } = found;
      assert.equal(station.marketEquilibriumFactors[route.commodityId], factor,
        `${stationId} authored ${route.commodityId} factor matches the route design`);
      const role = roleFor(def, station.type);
      const baseEq = economyBaseEqForSize(station.size || 'M');
      const equilibrium = economyEquilibriumForListing(station, route.commodityId, role, baseEq);
      if (kind === 'glut') {
        assert.ok(equilibrium > baseEq,
          `${stationId} (${station.type}) ${route.commodityId} equilibrium ${equilibrium}`
          + ` must exceed baseEq ${baseEq} (role ${role}) — the quirk must move the market`);
      } else {
        assert.ok(equilibrium < baseEq * 0.2,
          `${stationId} (${station.type}) ${route.commodityId} equilibrium ${equilibrium}`
          + ` must sit below baseEq*0.2 (${baseEq * 0.2}) (role ${role})`);
      }
    }
  }
});

test('each signature route is flyable: the two ends are real, market-capable, neighboring sectors', () => {
  for (const route of SIGNATURE_ROUTES) {
    const glut = STATION_BY_ID.get(route.glutStationId);
    const shortage = STATION_BY_ID.get(route.shortageStationId);
    assert.ok(glut && shortage, `both ends of the ${route.commodityId} route exist`);
    assert.notEqual(glut.sector.id, shortage.sector.id,
      `${route.commodityId} route endpoints must sit in different sectors`);
    const glutSector = SECTOR_BY_ID.get(glut.sector.id);
    assert.ok(glutSector.neighbors.includes(shortage.sector.id)
      && shortage.sector.neighbors.includes(glut.sector.id),
      `${glut.sector.id} and ${shortage.sector.id} must be mutual neighbors`
      + ` (${route.commodityId} route must be flyable)`);
    for (const end of [glut, shortage]) {
      const services = end.station.services || [];
      assert.ok(services.includes('trade') || services.includes('black_market'),
        `${end.station.id} needs a reachable market (trade or black_market service)`);
    }
  }
});

test('the signature commodity stories hold against the produced/consumed role tables', () => {
  for (const route of SIGNATURE_ROUTES) {
    const def = COMMODITY_BY_ID.get(route.commodityId);
    const glutType = STATION_BY_ID.get(route.glutStationId).station.type;
    const shortageType = STATION_BY_ID.get(route.shortageStationId).station.type;
    assert.ok((def.producedBy || []).includes(glutType),
      `${glutType} station plausibly over-produces ${route.commodityId}`);
    assert.ok((def.consumedBy || []).includes(shortageType),
      `${shortageType} station plausibly burns ${route.commodityId}`);
  }
});

test('the new band lines exist on their channels with unique ids and non-empty text', () => {
  const channelById = new Map(bandPack.entries.map((entry) => [entry.id, entry]));
  const seenLineIds = new Set();
  for (const entry of bandPack.entries) {
    for (const line of entry.lines || []) {
      assert.ok(!seenLineIds.has(line.id), `band line id ${line.id} must be unique across the pack`);
      seenLineIds.add(line.id);
    }
  }
  for (const { channelId, lineId } of NEW_BAND_LINES) {
    const channel = channelById.get(channelId);
    assert.ok(channel, `band channel ${channelId} exists`);
    const matches = (channel.lines || []).filter((line) => line.id === lineId);
    assert.equal(matches.length, 1, `${channelId} carries ${lineId} exactly once`);
    assert.equal(typeof matches[0].text, 'string');
    assert.ok(matches[0].text.trim().length > 0, `${lineId} text is non-empty`);
  }
});

test('the new news variant renders through fillTemplate without unresolved placeholders', () => {
  for (const [kind, variants] of Object.entries(HEADLINE_TEMPLATES)) {
    const hits = variants.filter((tpl) => tpl === NEW_NEWS_VARIANT).length;
    assert.equal(hits, kind === 'boom' ? 1 : 0,
      `the additive variant appears exactly once, under boom only (found ${hits} in ${kind})`);
  }
  assert.ok(HEADLINE_TEMPLATES.boom.includes(NEW_NEWS_VARIANT));
  for (const token of NEW_NEWS_VARIANT.match(/\{(\w+)\}/g) || []) {
    assert.ok(NEWS_TOKENS.has(token.slice(1, -1)),
      `variant token ${token} is a documented news token`);
  }
  const rendered = fillTemplate(NEW_NEWS_VARIANT, {
    station: 'Ceres Refinery', name: 'Fuel Cells', noun: 'fuel cells',
  });
  assert.ok(!/\{\w+\}/.test(rendered), `rendered headline leaves no placeholder: ${rendered}`);
  assert.ok(rendered.includes('Ceres Refinery') && rendered.includes('fuel cells'),
    `rendered headline carries the tokens: ${rendered}`);
});

test('the authored dock rumor points at a real route between real stations', () => {
  const route = SIGNATURE_ROUTES[0];
  const rumorStationId = route.shortageStationId;
  const text = AUTHORED_DOCK_RUMORS[rumorStationId];
  assert.equal(typeof text, 'string', `${rumorStationId} carries an authored dock rumor`);
  assert.ok(text.trim().length > 0, 'rumor text is non-empty');
  // The row key and every station the text names must be real places in SECTORS.
  assert.ok(STATION_BY_ID.has(rumorStationId));
  const glutStation = STATION_BY_ID.get(route.glutStationId);
  assert.ok(text.includes(glutStation.station.name),
    `rumor names the glut end by chart name (${glutStation.station.name})`);
  assert.ok(STATION_BY_ID.has(route.glutStationId),
    'the named glut station resolves to a real SECTORS station id');
  // The tip describes the same commodity the route quirks: the cell run.
  assert.ok(/cell/i.test(text), 'the cell-run rumor talks about cells');
});
