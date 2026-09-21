// PQ-207.00 — the single intentional delta: presence vs the newest-24 window.
import { buildShipLedger as newBuild, shipLedgerHasFactOutside } from './src/systems/shipLedger.js';
import { buildShipLedger as oldBuild } from './src/systems/scratch-old-shipLedger.mjs';
import { defaultLivingHull, livingHullWithScar } from './src/core/livingHull.js';
import { leftoverMechanicCard } from './src/story/mechanicVoice.js';

const HULL_TYPES = new Set(['scar', 'patch']);
const PAGE = { page: 0, pageSize: 24 };

let hull = defaultLivingHull(0);
for (let i = 0; i < 30; i += 1) {
  hull = livingHullWithScar(hull, { cause: 'weapon', surface: 'weapon', band: 'graze', facing: 'bow', atT: 1000 + i * 10, tick: 1000 + i * 10, id: `s${i}` }, 1000 + i * 10);
}

const state = {
  meta: { seed: 4242 },
  player: {
    credits: 500,
    heat: 0,
    activeShipIndex: 0,
    ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }],
    tradeLedger: [{ side: 'buy', commodityId: 'iron_ore', stationId: 'station_helios', qty: 4, total: 900, seenAt: 60 }],
  },
  ui: { marketNews: { log: [], lastCard: null } },
};

const oldPage = oldBuild(state, PAGE);
const newPage = newBuild(state, PAGE);
console.log('page identical      :', JSON.stringify(oldPage) === JSON.stringify(newPage));
console.log('old page rows       :', oldPage.entries.length, 'types:', [...new Set(oldPage.entries.map((e) => e.type))].join(','));
console.log('old window has fact :', oldPage.entries.some((e) => !HULL_TYPES.has(e.type)));
console.log('new probe has fact  :', shipLedgerHasFactOutside(state, HULL_TYPES));
console.log('new card body       :', leftoverMechanicCard(state).body);
