import fs from 'node:fs';
const dir = process.argv[2], phase = process.argv[3] || 'baseline', mode = process.argv[4] || 'dummy';
const rows = [];
for (const f of fs.readdirSync(dir)) if (f.startsWith(phase + '.') && f.endsWith('.jsonl'))
  for (const l of fs.readFileSync(dir + '/' + f, 'utf8').split('\n')) if (l.trim()) { try { rows.push(JSON.parse(l)); } catch {} }
const R = rows.map((r) => r.result || r).filter((r) => r.mode === mode);
const W = [...new Set(R.map((r) => r.weapon))], E = [...new Set(R.map((r) => r.enemy))];
const agg = (rs, k) => rs.length ? rs.reduce((a, r) => a + (r[k] ?? NaN), 0) / rs.length : NaN;
const short = (s) => s.replace(/^wpn_/, '').replace(/_(pirate|swarmer|brawler|raider|sniper|dart|trader|lawman|escort|controller|zealot|ghost|cutter|jackal|raider)$/, '');
console.log('TTK s (' + mode + ', killed fraction in [] if <1)  rows=weapon cols=enemy');
console.log(''.padEnd(20) + E.map((e) => short(e).slice(0, 9).padStart(10)).join(''));
for (const w of W) {
  let line = short(w).padEnd(20);
  for (const e of E) {
    const rs = R.filter((r) => r.weapon === w && r.enemy === e);
    const k = rs.filter((r) => r.killed).length / (rs.length || 1);
    const t = agg(rs.filter((r) => r.killed), 'ttkS');
    line += (rs.length ? (k < 1 ? (k ? t.toFixed(1) : '--') + '[' + k.toFixed(1) + ']' : t.toFixed(1)) : '').padStart(10);
  }
  console.log(line);
}
console.log('\nper weapon (all enemies): duty, rps, vents/kill, dmg/hit vs reaver, dps vs reaver/wasp/bruiser');
for (const w of W) {
  const rs = R.filter((r) => r.weapon === w);
  const rv = rs.filter((r) => r.enemy === 'reaver_pirate'), wa = rs.filter((r) => r.enemy === 'wasp_swarmer'), br = rs.filter((r) => r.enemy === 'bruiser_brawler');
  console.log(short(w).padEnd(20), 'duty', agg(rs, 'duty').toFixed(2), 'rps', agg(rs, 'roundsPerS').toFixed(2), 'vents', agg(rs, 'vents').toFixed(1),
    'dmg/hit', agg(rv, 'dmgPerHit').toFixed(2), 'dps r/w/b', agg(rv, 'dps').toFixed(1), agg(wa, 'dps').toFixed(1), agg(br, 'dps').toFixed(1));
}
