import { hash32 } from './src/core/rng.js';

const N = 240;
const L = 40;
const rows = [];
for (let i = 0; i < N; i += 1) rows.push({ side: i % 2 ? 'sell' : 'buy', commodityId: 'iron_ore', stationId: 'station_helios', qty: 4 + (i % 7), total: 1200 + i * 13, seenAt: 600 + i * 30 });
const losses = [];
for (let i = 0; i < L; i += 1) losses.push({ lossId: `loss:ship_wasp:${i}`, source: 'combat', assetId: 'ship_wasp', t: 100 + i * 40 });
const seed = 4242;
const t = (label, fn, it = 3000) => {
  for (let i = 0; i < 200; i += 1) fn();
  const a = process.hrtime.bigint();
  for (let i = 0; i < it; i += 1) fn();
  const b = process.hrtime.bigint();
  console.log(label.padEnd(46), (Number(b - a) / it / 1000).toFixed(1), 'us');
};
t('occurrence pre-pass only (240)', () => {
  const counts = new Map(); const occ = new Map();
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i];
    const side = e.side === 'sell' ? 'sell' : 'buy';
    const base = `trade:${e.seenAt || 0}:${e.stationId || ''}:${e.commodityId || ''}:${side}:${e.qty || 0}:${e.total || 0}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n); occ.set(i, n);
  }
  return occ.size;
});
t('identity pass only (240)', () => {
  const seen = new Set(); const out = [];
  for (const e of rows) {
    const side = e.side === 'sell' ? 'sell' : 'buy';
    const base = `trade:${e.seenAt || 0}:${e.stationId || ''}:${e.commodityId || ''}:${side}:${e.qty || 0}:${e.total || 0}`;
    const id = hash32(seed, 'trade', base);
    if (seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out.length;
});
t('loss identity pass (40)', () => {
  const seen = new Set(); const out = [];
  for (const e of losses) {
    const sid = e.lossId || `${e.source || 'loss'}:${e.assetId || ''}:${e.t || 0}`;
    const id = hash32(seed, 'loss', sid);
    if (seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out.length;
});
const recs = Array.from({ length: 280 }, (_, i) => ({ id: `ledger_${i.toString(36)}xyz`, at: 1000 - i, cycle: 1 }));
t('sort 280 by (at,cycle,id.localeCompare)', () => { const c = recs.slice(); c.sort((a, b) => b.at - a.at || b.cycle - a.cycle || a.id.localeCompare(b.id)); return c.length; });
t('numeric-only at scan (280)', () => { let max = -1; for (const r of rows) if (r.seenAt > max) max = r.seenAt; for (const r of losses) if (r.t > max) max = r.t; return max; });
