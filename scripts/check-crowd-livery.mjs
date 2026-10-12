// scripts/check-crowd-livery.mjs — C12 crowd-livery contract (ID-V).
// Proves every ship-flying faction with a palette has an authored texture set, every
// livery is a valid texture-set row (hex colors, finish enum, sane wear), picks are
// deterministic, and the palette funnel actually applies a livery to a crowd hull while
// an explicit data.appearance still wins.

import assert from 'node:assert/strict';
import { FACTION_PALETTES } from '../src/data/palettes.js';
import {
  CROWD_LIVERY_FACTIONS,
  CROWD_LIVERY_SETS,
  crowdLiveryFor,
  crowdLiveryForEntity,
} from '../src/data/crowdLiveries.js';
import { paletteWithShipAppearance, SHIP_FINISHES } from '../src/core/shipAppearance.js';

const HEX_RE = /^#[0-9a-f]{6}$/i;

// Coverage: every faction palette has a livery set (the crowd livery is a palette
// extension — a faction with no set renders its base palette unchanged, which is fine
// for player-only factions; here all 14 are ship-flying).
for (const factionId of Object.keys(FACTION_PALETTES)) {
  assert.ok(
    CROWD_LIVERY_SETS[factionId] && CROWD_LIVERY_SETS[factionId].length >= 2,
    `${factionId} needs >=2 livery variants, got ${CROWD_LIVERY_SETS[factionId] ? CROWD_LIVERY_SETS[factionId].length : 0}`,
  );
}
assert.equal(CROWD_LIVERY_FACTIONS.length, Object.keys(FACTION_PALETTES).length, 'livery faction coverage must match palettes');

// Row validity + unique ids.
const seen = new Set();
for (const [factionId, set] of Object.entries(CROWD_LIVERY_SETS)) {
  for (const livery of set) {
    assert.ok(livery.id && !seen.has(livery.id), `duplicate/missing livery id in ${factionId}`);
    seen.add(livery.id);
    assert.ok(HEX_RE.test(livery.hullColor), `${livery.id} hullColor must be #rrggbb`);
    assert.ok(HEX_RE.test(livery.accentColor), `${livery.id} accentColor must be #rrggbb`);
    assert.ok(SHIP_FINISHES.includes(livery.finish), `${livery.id} finish ${livery.finish} not in SHIP_FINISHES`);
    assert.ok(Number.isFinite(livery.wear) && livery.wear >= 0 && livery.wear <= 1, `${livery.id} wear out of [0,1]`);
  }
  // A set must actually vary — identical clones defeat the point.
  const distinct = new Set(set.map((l) => `${l.hullColor}|${l.accentColor}|${l.finish}|${l.wear}`));
  assert.ok(distinct.size === set.length, `${factionId} has duplicate livery rows`);
}

// Deterministic pick.
assert.deepEqual(crowdLiveryFor('faction_scn', 7), crowdLiveryFor('faction_scn', 7));
assert.equal(crowdLiveryFor('faction_scn', 0), CROWD_LIVERY_SETS.faction_scn[0]);
assert.equal(crowdLiveryFor('faction_scn', CROWD_LIVERY_SETS.faction_scn.length), CROWD_LIVERY_SETS.faction_scn[0]);
assert.equal(crowdLiveryFor('faction_nonexistent', 3), null);

// Entity resolution: factioned NPC ships/drones get a livery; player-team, stations,
// and unfactioned entities do not.
const npc = { id: 'npc-1', type: 'ship', factionId: 'faction_dmc', team: 2, data: {} };
assert.ok(crowdLiveryForEntity(npc), 'factioned NPC hull must resolve a livery');
assert.deepEqual(crowdLiveryForEntity(npc), crowdLiveryForEntity({ ...npc }), 'livery pick must be deterministic per entity id');
assert.equal(crowdLiveryForEntity({ ...npc, team: 0 }), null, 'player team excluded');
assert.equal(crowdLiveryForEntity({ ...npc, type: 'station' }), null, 'stations excluded');
assert.equal(crowdLiveryForEntity({ ...npc, factionId: null }), null, 'unfactioned excluded');
assert.equal(crowdLiveryForEntity({ ...npc, factionId: 'faction_none' }), null, 'set-less factions excluded');

// Palette funnel: the livery reaches the material palette and is marked for consumers.
const base = { hull: '#101010', accent: '#202020', thruster: '#303030', dark: '#000000' };
const painted = paletteWithShipAppearance(npc, { ...base });
assert.ok(painted.crowdLiveryId, 'palette must carry crowdLiveryId');
assert.equal(painted.hull, crowdLiveryForEntity(npc).hullColor, 'livery hull must reach palette');
assert.equal(painted.accent, crowdLiveryForEntity(npc).accentColor, 'livery accent must reach palette');
assert.equal(painted.finish, crowdLiveryForEntity(npc).finish, 'livery finish must reach palette');

// Explicit appearance always wins over the livery.
const custom = {
  ...npc,
  data: { appearance: { hullColor: '#123456', accentColor: '#654321', finish: 'polished', wear: 0.9 } },
};
const explicit = paletteWithShipAppearance(custom, { ...base });
assert.equal(explicit.hull, '#123456', 'explicit appearance hull must win');
assert.equal(explicit.accent, '#654321', 'explicit appearance accent must win');
assert.equal(explicit.crowdLiveryId, undefined, 'crowdLiveryId must not be set when appearance overrides');

console.log(`check:crowd-livery OK — ${seen.size} livery rows across ${CROWD_LIVERY_FACTIONS.length} factions, deterministic picks, palette funnel verified`);
