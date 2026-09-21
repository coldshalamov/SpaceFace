// PQ-207.00 session measurement: per-refresh cost of the berth mechanic rap line.
// Scratch diagnostic — console output only, deleted after the receipt is written.
import { defaultLivingHull, livingHullWithScar } from './src/core/livingHull.js';
import { buildDockArrival } from './src/ui/dockArrival.js';
import { leftoverMechanicCard } from './src/story/mechanicVoice.js';
import { buildShipLedger } from './src/systems/shipLedger.js';

const STATION = { id: 'station_helios', name: 'Helios Station', services: [], typeLabel: 'Orbital', factionName: 'Concord' };

function scar(band, facing, tick) {
  return { cause: 'weapon', surface: 'weapon', band, facing, atT: tick, tick, id: `weapon:${tick}:${facing}` };
}

function tradeRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      side: i % 2 ? 'sell' : 'buy',
      commodityId: 'iron_ore',
      stationId: 'station_helios',
      qty: 4 + (i % 7),
      total: 1200 + i * 13,
      seenAt: 600 + i * 30,
    });
  }
  return rows;
}

function lossRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      lossId: `loss:ship_wasp:${i}`,
      source: 'combat',
      assetId: 'ship_wasp',
      shipDefId: 'ship_wasp',
      sectorId: 'sector_helios_prime',
      cargoHint: 'ore',
      t: 100 + i * 40,
      killedByPlayer: i % 3 === 0,
    });
  }
  return rows;
}

function titleRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push({ id: `title-${i}`, title: `Passing Title ${i}`, seenAt: i * 10 });
  return rows;
}

function state({ scars = 1, trades = 240, losses = 40, titles = 0, heat = 0 } = {}) {
  let hull = defaultLivingHull(0);
  for (let i = 0; i < scars; i += 1) hull = livingHullWithScar(hull, scar('hard', 'bow', 12 + i), 12 + i);
  return {
    meta: { seed: 4242 },
    player: {
      credits: 5000,
      heat,
      activeShipIndex: 0,
      tradeLedger: tradeRows(trades),
      ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }],
    },
    lossLedger: { entries: lossRows(losses) },
    story: { titlesSeen: titleRows(titles) },
    ui: { marketNews: { log: [], lastCard: null } },
  };
}

function time(label, fn, iterations = 3000) {
  for (let i = 0; i < 200; i += 1) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn();
  const t1 = process.hrtime.bigint();
  const perCall = Number(t1 - t0) / iterations / 1000;
  console.log(`${label.padEnd(52)} ${perCall.toFixed(2)} us/call  (${(perCall / 1000).toFixed(3)} ms)`);
  return perCall;
}

function bytesPerCall(label, fn, iterations = 4000) {
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i += 1) fn();
  const after = process.memoryUsage().heapUsed;
  global.gc();
  const per = (after - before) / iterations;
  console.log(`${label.padEnd(52)} ${(per / 1024).toFixed(2)} KB/round (pre-GC heap delta)`);
}

const scarred = state({ scars: 1 });
const clean = state({ scars: 0 });
const wanted = state({ scars: 1, heat: 0.4 });
const scarredNoFacts = state({ scars: 1, trades: 0, losses: 0 });

console.log('--- berth card (what the 18-frame refresh calls) ---');
time('leftoverMechanicCard  scarred hull, 240 trades + 40 losses', () => leftoverMechanicCard(scarred));
time('leftoverMechanicCard  clean hull (no scars)', () => leftoverMechanicCard(clean));
time('leftoverMechanicCard  wanted hull', () => leftoverMechanicCard(wanted));
time('leftoverMechanicCard  scarred hull, no ledger facts', () => leftoverMechanicCard(scarredNoFacts));
time('buildDockArrival     scarred hull', () => buildDockArrival(scarred, STATION));
time('buildDockArrival     clean hull', () => buildDockArrival(clean, STATION));

console.log('--- the ledger build the rap line triggers ---');
time('buildShipLedger pageSize 24 (scarred state)', () => buildShipLedger(scarred, { page: 0, pageSize: 24 }));

console.log('--- allocation profile ---');
bytesPerCall('leftoverMechanicCard  scarred hull', () => leftoverMechanicCard(scarred), 20000);
bytesPerCall('leftoverMechanicCard  clean hull', () => leftoverMechanicCard(clean), 20000);

console.log('--- card output (must stay identical after the fix) ---');
console.log('scarred:', JSON.stringify(leftoverMechanicCard(scarred)));
console.log('clean  :', JSON.stringify(leftoverMechanicCard(clean)));
console.log('wanted :', JSON.stringify(leftoverMechanicCard(wanted)));
console.log('noFacts:', JSON.stringify(leftoverMechanicCard(scarredNoFacts)));
