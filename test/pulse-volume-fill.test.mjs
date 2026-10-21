import test from 'node:test';
import assert from 'node:assert/strict';

import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { FRONTIER_SECTORS } from '../src/data/frontierRegions/index.js';
import {
  HEADLINE_TEMPLATES,
  REGIME_TEMPLATES,
  COMMODITY_FLAVOR,
} from '../src/data/newsTemplates.js';

const rumors = FLAVOR_PACKS.wreck_rumors;
const landmarkLore = FLAVOR_PACKS.landmark_lore;
const rimPoiLore = FLAVOR_PACKS.rim_poi_lore;

const ALLOWED_TOKENS = new Set(['station', 'name', 'noun']);
const tokensOf = (tpl) => new Set([...String(tpl).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

// ── PULSE-03: wreck rumors point somewhere real ─────────────────────────────
test('PULSE-03: ≥80 rumor lines and every subjectId resolves', () => {
  const wreckIds = new Set(UNIQUE_WRECKS.map((w) => w.id));
  const offIds = new Set(WORLD_ONE_OFFS.map((o) => o.id));
  const lmIds = new Set(landmarkLore.entries.map((e) => e.id));

  let n = 0;
  for (const entry of rumors.entries) {
    for (const src of entry.sources || []) {
      for (const line of src.lines || []) {
        n++;
        assert.ok(line.id && line.text, `rumor line missing id/text in ${entry.id}/${src.id}`);
        assert.ok(
          wreckIds.has(line.subjectId) || offIds.has(line.subjectId) || lmIds.has(line.subjectId),
          `rumor line ${line.id} names unknown subjectId ${line.subjectId}`,
        );
      }
    }
  }
  assert.ok(n >= 80, `expected ≥80 rumor lines, got ${n}`);
});

test('PULSE-03: every rumor entry wreckId is a real authored wreck', () => {
  const wreckIds = new Set(UNIQUE_WRECKS.map((w) => w.id));
  for (const entry of rumors.entries) {
    assert.ok(wreckIds.has(entry.wreckId), `entry ${entry.id} bad wreckId ${entry.wreckId}`);
  }
});

// ── PULSE-05: headline + regime template depth ──────────────────────────────
test('PULSE-05: every headline kind ≥15, every regime ≥6, tokens stay in {station,name,noun}', () => {
  for (const [kind, tpls] of Object.entries(HEADLINE_TEMPLATES)) {
    assert.ok(tpls.length >= 15, `headline kind ${kind} has ${tpls.length} (<15)`);
    for (const tpl of tpls) {
      for (const tok of tokensOf(tpl)) {
        assert.ok(ALLOWED_TOKENS.has(tok), `headline ${kind} introduces new placeholder {${tok}}`);
      }
      assert.ok(tokensOf(tpl).size > 0, `headline ${kind} template has no tokens: ${tpl}`);
    }
  }
  for (const [kind, tpls] of Object.entries(REGIME_TEMPLATES)) {
    assert.ok(tpls.length >= 6, `regime ${kind} has ${tpls.length} (<6)`);
    for (const tpl of tpls) {
      for (const tok of tokensOf(tpl)) {
        assert.ok(ALLOWED_TOKENS.has(tok), `regime ${kind} introduces new placeholder {${tok}}`);
      }
    }
  }
});

// ── PULSE-06: every commodity has a news voice ──────────────────────────────
test('PULSE-06: every live commodity id has a COMMODITY_FLAVOR entry with a noun', () => {
  assert.equal(COMMODITIES.length, 66);
  for (const c of COMMODITIES) {
    const f = COMMODITY_FLAVOR[c.id];
    assert.ok(f, `COMMODITY_FLAVOR missing ${c.id}`);
    assert.equal(typeof f.noun, 'string', `${c.id} flavor missing noun`);
    assert.ok(f.noun.length > 0, `${c.id} noun empty`);
    assert.ok(
      !/(\$|₡|credit|price|\bcr\b|\bkcr\b|\d+\s*(cr|credits|marks))/i.test(f.noun),
      `${c.id} noun leaks an economy figure: ${f.noun}`,
    );
  }
  assert.equal(Object.keys(COMMODITY_FLAVOR).length, COMMODITIES.length);
});

// ── PULSE-07: landmarks + rim POIs carry ≥3 lore lines ──────────────────────
test('PULSE-07: every landmark lore entry has ≥3 lines', () => {
  assert.equal(landmarkLore.entries.length, 19);
  for (const e of landmarkLore.entries) {
    assert.ok((e.lines || []).length >= 3, `landmark ${e.id} has ${(e.lines || []).length} lines (<3)`);
  }
});

test('PULSE-07: every authored rim POI id has a lore entry with ≥3 lines', () => {
  const byPoi = new Map(rimPoiLore.entries.map((e) => [e.location?.poiId, e]));

  // Every frontier-region POI is authored rim content and must carry lore.
  const frontierPoiIds = new Set();
  for (const s of FRONTIER_SECTORS) {
    for (const p of s.pois || []) {
      frontierPoiIds.add(p.id);
      const e = byPoi.get(p.id);
      assert.ok(e, `rim POI ${p.id} (${s.id}) has no lore entry`);
      assert.ok((e.lines || []).length >= 3, `rim POI ${p.id} lore <3 lines`);
    }
  }

  // Every entry's poiId resolves against a real sector POI (frontier or core/junction).
  const realPoiIds = new Set(frontierPoiIds);
  for (const s of SECTORS) for (const p of s.pois || []) realPoiIds.add(p.id);
  for (const e of rimPoiLore.entries) {
    assert.ok(realPoiIds.has(e.location?.poiId), `lore entry ${e.id} names unknown poiId ${e.location?.poiId}`);
    assert.ok((e.lines || []).length >= 3, `lore entry ${e.id} <3 lines`);
  }
});
