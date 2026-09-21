import { hash32 } from './src/core/rng.js';

const N = 240;
const L = 40;
const rows = [];
for (let i = 0; i < N; i += 1) {
  rows.push({ side: i % 2 ? 'sell' : 'buy', commodityId: 'iron_ore', stationId: 'station_helios', qty: 4 + (i % 7), total: 1200 + i * 13, seenAt: 600 + i * 30 });
}
const losses = [];
for (let i = 0; i < L; i += 1) {
  losses.push({ lossId: `loss:ship_wasp:${i}`, source: 'combat', assetId: 'ship_wasp', t: 100 + i * 40 });
}
const seed = 4242;

function lightWalk() {
  const out = [];
  const seen = new Set();
  const add = (type, sourceId, at) => {
    const id = `ledger_${hash32(seed, type, sourceId).toString(36)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, type, at, cycle: Math.floor(at / 600) });
  };
  for (const entry of losses) {
    if (!entry) continue;
    add('loss', entry.lossId || `${entry.source || 'loss'}:${entry.assetId || ''}:${entry.t || 0}`, entry.t);
  }
  const counts = new Map();
  const occ = new Map();
  for (let i = rows.length - 1; i >= 0; i--) {
    const entry = rows[i];
    if (!entry) continue;
    const side = entry.side === 'sell' ? 'sell' : 'buy';
    const base = `trade:${entry.seenAt || 0}:${entry.stationId || ''}:${entry.commodityId || ''}:${side}:${entry.qty || 0}:${entry.total || 0}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    occ.set(i, n);
  }
  for (const [index, entry] of rows.entries()) {
    if (!entry) continue;
    const side = entry.side === 'sell' ? 'sell' : 'buy';
    const base = `trade:${entry.seenAt || 0}:${entry.stationId || ''}:${entry.commodityId || ''}:${side}:${entry.qty || 0}:${entry.total || 0}`;
    const receiptIdentity = `${base}:occurrence-${occ.get(index) || 1}`;
    add('trade', receiptIdentity, entry.seenAt);
  }
  out.sort((a, b) => b.at - a.at || b.cycle - a.cycle || a.id.localeCompare(b.id));
  return out;
}

function time(label, fn, it = 3000) {
  for (let i = 0; i < 200; i += 1) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < it; i += 1) fn();
  const t1 = process.hrtime.bigint();
  const us = Number(t1 - t0) / it / 1000;
  console.log(`${label.padEnd(46)} ${us.toFixed(1)} us/call`);
  return us;
}

time('light walk + sort (280 rows)', lightWalk);
console.log('rows out', lightWalk().length, 'top type', lightWalk().slice(0, 3).map((r) => r.type).join(','));
