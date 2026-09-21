import { defaultLivingHull, livingHullWithScar } from './src/core/livingHull.js';
import { buildShipLedger } from './src/systems/shipLedger.js';

function scar(band, facing, tick) {
  return { cause: 'weapon', surface: 'weapon', band, facing, atT: tick, tick, id: `weapon:${tick}:${facing}` };
}
const rows = [];
for (let i = 0; i < 240; i += 1) {
  rows.push({ side: i % 2 ? 'sell' : 'buy', commodityId: 'iron_ore', stationId: 'station_helios', qty: 4 + (i % 7), total: 1200 + i * 13, seenAt: 600 + i * 30 });
}
const losses = [];
for (let i = 0; i < 40; i += 1) {
  losses.push({ lossId: `loss:ship_wasp:${i}`, source: 'combat', assetId: 'ship_wasp', shipDefId: 'ship_wasp', sectorId: 'sector_helios_prime', cargoHint: 'ore', t: 100 + i * 40, killedByPlayer: i % 3 === 0 });
}
const state = {
  meta: { seed: 4242 },
  player: {
    credits: 5000, heat: 0, activeShipIndex: 0, tradeLedger: rows,
    ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: livingHullWithScar(defaultLivingHull(0), scar('hard', 'bow', 12), 12) }],
  },
  lossLedger: { entries: losses },
  ui: { marketNews: { log: [], lastCard: null } },
};
for (let i = 0; i < 60; i += 1) buildShipLedger(state, { page: 0, pageSize: 24 });
const t0 = process.hrtime.bigint();
for (let i = 0; i < 400; i += 1) buildShipLedger(state, { page: 0, pageSize: 24 });
const t1 = process.hrtime.bigint();
console.log('buildShipLedger', (Number(t1 - t0) / 400 / 1000).toFixed(1), 'us/call');
