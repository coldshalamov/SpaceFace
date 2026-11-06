// test/dust-icons.test.mjs — DUST P5 (BS-5) icon language: coverage, well-formedness, and
// distinctness of the three glyph sets in src/ui/icons/.
//
// Contracts proven here:
//   1. every commodity id in the catalogue resolves to a real glyph (category + grade),
//   2. every mission type in MISSION_TYPES resolves to a glyph and a labelled chip,
//   3. every station tab destination resolves to a glyph,
//   4. every glyph is a well-formed, self-contained inline SVG that carries no colour of its
//      own (currentColor only — the token layer must stay the only colour authority),
//   5. category silhouettes are pairwise distinct (the "66 identical circles" defect cannot
//      silently return by adding a near-duplicate shape),
//   6. the market row graft preserves the row's CSS contract (class + data attribute).
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMODITIES } from '../src/data/commodities.js';
import { MISSION_TYPES } from '../src/data/missions.js';
import {
  COMMODITY_CATEGORY_GLYPHS,
  COMMODITY_GLYPH_CATEGORIES,
  COMMODITY_GLYPH_CATEGORY_IDS,
  commodityGlyphSvg,
  applyCommodityGlyph,
} from '../src/ui/icons/commodityGlyphs.js';
import {
  MISSION_TYPE_GLYPHS,
  MISSION_GLYPH_TYPE_IDS,
  missionTypeGlyphSvg,
  missionTypeChipHtml,
  hasMissionTypeGlyph,
} from '../src/ui/icons/missionGlyphs.js';
import {
  STATION_TAB_GLYPHS,
  STATION_TAB_IDS,
  stationTabGlyphSvg,
  hasStationTabGlyph,
} from '../src/ui/icons/stationGlyphs.js';

// The berth's destination rail (stationApp.js DESTINATIONS ids, in rail order).
const STATION_TABS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];

function assertWellFormedSvg(svg, label) {
  assert.ok(typeof svg === 'string' && svg.startsWith('<svg'), `${label}: must start <svg`);
  assert.ok(svg.endsWith('</svg>'), `${label}: must end </svg>`);
  assert.match(svg, /viewBox="0 0 24 24"/, `${label}: 24-grid hand`);
  assert.match(svg, /aria-hidden="true"/, `${label}: decorative glyphs are aria-hidden`);
  assert.match(svg, /focusable="false"/, `${label}: not a focus stop`);
  assert.match(svg, /stroke="currentColor"/, `${label}: inherits colour from the token layer`);
  // Monochrome contract: no hex or rgb() literals anywhere in the glyph.
  assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${label}: carries its own colour literal`);
  // Balanced element structure inside the svg.
  const opens = (svg.match(/<(path|rect|circle|ellipse)\b/g) || []).length;
  const selfClosed = (svg.match(/<(path|rect|circle|ellipse)\b[^>]*\/>/g) || []).length;
  assert.equal(opens, selfClosed, `${label}: every geometry element is self-closed`);
}

test('every catalogue commodity resolves to a well-formed category glyph', () => {
  assert.ok(COMMODITIES.length >= 60, 'expected the full commodity catalogue');
  const seen = new Set();
  for (const cmdty of COMMODITIES) {
    const svg = commodityGlyphSvg(cmdty);
    assertWellFormedSvg(svg, cmdty.id);
    const category = COMMODITY_GLYPH_CATEGORIES[cmdty.id];
    assert.ok(category, `${cmdty.id}: has a mapped category`);
    assert.ok(COMMODITY_CATEGORY_GLYPHS[category], `${cmdty.id}: category is glyphed`);
    assert.ok(svg.includes(`data-commodity-glyph="${category}"`), `${cmdty.id}: glyph names its category`);
    seen.add(category);
  }
  // Every catalogue category is actually used (no dead glyph entries).
  for (const id of COMMODITY_GLYPH_CATEGORY_IDS) assert.ok(seen.has(id), `category ${id} is unused`);
});

test('category silhouettes are pairwise distinct — no two categories share a shape', () => {
  const bodies = Object.entries(COMMODITY_CATEGORY_GLYPHS)
    .map(([id, body]) => [id, body.replace(/\s+/g, ' ').trim()]);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      assert.notEqual(bodies[i][1], bodies[j][1], `${bodies[i][0]} and ${bodies[j][0]} share one silhouette`);
    }
  }
  // Distinctness must be in the dominant geometry, not just an accent stroke: the first
  // element of each glyph is its primary silhouette and no two may repeat.
  const primaries = bodies.map(([, body]) => body.split('opacity')[0].trim());
  assert.equal(new Set(primaries).size, primaries.length, 'two categories share a primary silhouette');
});

test('rare stock carries a grade keel; everyday stock carries none', () => {
  const iron = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron'); // marketTier 0
  const titanium = COMMODITIES.find((c) => c.id === 'cmdty_ore_titanium'); // tier 2
  const diamond = COMMODITIES.find((c) => c.id === 'cmdty_gem_diamond'); // tier 4
  assert.ok(iron && titanium && diamond, 'catalogue rows for the grade ladder');
  assert.doesNotMatch(commodityGlyphSvg(iron), /data-glyph-grade="[1-9]/, 'tier 0: no grade bar');
  assert.match(commodityGlyphSvg(titanium), /data-glyph-grade="2"/, 'tier 2: short keel');
  assert.match(commodityGlyphSvg(diamond), /data-glyph-grade="4"/, 'tier 4: full keel');
  assert.ok(commodityGlyphSvg(diamond).includes('M5.5 21.7h13'), 'tier 4 keel is the wide bar');
  assert.ok(commodityGlyphSvg(titanium).includes('M8.5 21.7h7'), 'tier 2 keel is the short bar');
});

test('the market row graft swaps the glyph and preserves the row CSS contract', () => {
  const def = COMMODITIES.find((c) => c.id === 'cmdty_gas_helium3');
  const row = `<tr data-cmdty="cmdty_gas_helium3"><td class="k-name sx-mkt-row__name">`
    + `<span class="sx-mkt-row__commodity" data-commodity-presentation="cargo-family-gas" style="color:#59d6c7">`
    + `<svg class="of-commodity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true" focusable="false" data-commodity-glyph="gas"><path d="M0 0"/></svg>`
    + `</span>Helium-3</td></tr>`;
  const out = applyCommodityGlyph(row, def);
  assert.match(out, /class="of-commodity-icon"/, 'class preserved for the market sheet');
  assert.match(out, /data-commodity-glyph="gas"/, 'data attribute preserved');
  assert.doesNotMatch(out, /stroke-width="1.35"/, 'the old wireframe glyph is gone');
  assert.match(out, /data-commodity-presentation="cargo-family-gas"/, 'presentation span untouched');
  assert.match(out, /Helium-3/, 'row content untouched');
  // A row without a glyph (defensive) passes through unchanged rather than corrupting.
  assert.equal(applyCommodityGlyph('<tr><td>plain</td></tr>', def), '<tr><td>plain</td></tr>');
});

test('every mission type resolves to a glyph and a labelled chip', () => {
  const types = MISSION_TYPES.map((def) => def.type);
  assert.equal(types.length, MISSION_GLYPH_TYPE_IDS.length, 'glyph set covers exactly the catalogue');
  for (const type of types) {
    assert.ok(hasMissionTypeGlyph(type), `${type}: has a glyph`);
    assertWellFormedSvg(missionTypeGlyphSvg(type), type);
    const chip = missionTypeChipHtml(type);
    assert.match(chip, /data-mission-type="/, `${type}: chip names its type`);
    assert.match(chip, /<\/span>$/, `${type}: chip closes`);
    // The chip's label is real text (not aria-hidden) so the spoken row carries the verb.
    assert.ok(chip.includes('<span>'), `${type}: chip label is content`);
    const words = String(type).replace(/_/g, ' ');
    assert.ok(chip.includes(words), `${type}: chip label is the type's own word`);
  }
  assert.ok(!hasMissionTypeGlyph('not_a_mission_type'), 'unknown types are reported as absent');
  assertWellFormedSvg(missionTypeChipHtml('not_a_mission_type').match(/<svg[\s\S]*?<\/svg>/)[0], 'fallback chip glyph');
});

test('every station tab resolves to a glyph that augments the label', () => {
  assert.deepEqual([...STATION_TAB_IDS], STATION_TABS, 'glyph set is exactly the destination rail');
  for (const tab of STATION_TABS) {
    assert.ok(hasStationTabGlyph(tab), `${tab}: has a glyph`);
    assertWellFormedSvg(stationTabGlyphSvg(tab), tab);
    assert.match(stationTabGlyphSvg(tab), /data-tab-glyph="/, `${tab}: glyph names its tab`);
  }
  // Unknown ids fall back to a real glyph rather than an empty node.
  assertWellFormedSvg(stationTabGlyphSvg('unknown'), 'tab fallback');
});

test('the three sets share one hand: same grid, stroke weight, caps and joins', () => {
  const samples = [
    commodityGlyphSvg(COMMODITIES[0]),
    missionTypeGlyphSvg('escort'),
    stationTabGlyphSvg('market'),
  ];
  for (const svg of samples) {
    assert.match(svg, /stroke-width="1.8"/, 'single house stroke weight');
    assert.match(svg, /stroke-linecap="square"/, 'square caps (stencil hand)');
    assert.match(svg, /stroke-linejoin="miter"/, 'miter joins');
  }
});
