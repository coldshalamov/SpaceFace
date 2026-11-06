// House decals: the canon houses wear their own marks (docs/worldbuilding/orgs/factions-CANONICAL.md
// graffiti rows), not borrowed ones. NPC hulls inherit these through PAINT_PROFILES →
// visualFactory resolvePalette → installShipStencils, so the assignment IS the world's paint job.
// No DOM, no wall clock: the marks themselves are judged by the fleet-look stills.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PAINT_PROFILES } from '../src/data/palettes.js';
import { SHIP_DECALS } from '../src/core/shipAppearance.js';
import { STENCIL_STYLE_IDS } from '../src/render/illustratedStencils.js';
import { SHIP_DECAL_STOCK } from '../src/data/shipPaints.js';

test('every canon house personality wears its own mark, and every mark ships', () => {
  const canon = {
    corporate: 'probate',                   // Meridian — "Every man pays twice. First in flesh. Then in coin."
    xenophobic: 'addendum',                 // Vael — "voluntary — standard terms"; READ PAGE 9
    pitborn_patchwork: 'heavy_is_honest',   // Pitborn — "Heavy is honest." and the tally nobody paints over
    clinical_automaton: 'dead_schedule',    // Fulfillment — "on schedule", set by a company that is a filing
    nacre_precursor: 'gate_law',            // Verge — "PRESENT. WITNESS. APPEAL." in measured frames
  };
  for (const [personality, decal] of Object.entries(canon)) {
    assert.equal(PAINT_PROFILES[personality]?.decal, decal, `${personality} wears ${decal}`);
    assert.ok(SHIP_DECALS.includes(decal), `${decal} is a shipped SHIP_DECALS id`);
    assert.ok(STENCIL_STYLE_IDS.includes(decal), `${decal} has a sheet in the stencil registry`);
    assert.ok(SHIP_DECAL_STOCK.some((row) => row.decalId === decal), `${decal} is stocked in the rack`);
  }
});

test('the borrowed identities stay deliberate', () => {
  // The old crowd's tag stays the Free Frontier and Reach mark — the stencil of hulls the aces
  // could not keep (historyWear forces it on aces too).
  assert.equal(PAINT_PROFILES.independent.decal, 'borrowed_time');
  assert.equal(PAINT_PROFILES.pirate.decal, 'borrowed_time');
  // Helix flies other houses' transponders and hulls: mimicry IS its identity, so its decks stay bare.
  assert.equal(PAINT_PROFILES.paper.decal, null);
  // The Choir and the Archive keep their own surfaces; "do not apply every mark to every hull".
  assert.equal(PAINT_PROFILES.zealot.decal, null);
  assert.equal(PAINT_PROFILES.archivist.decal, null);
});
