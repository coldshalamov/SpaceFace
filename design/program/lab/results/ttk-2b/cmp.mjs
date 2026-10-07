import fs from 'node:fs';
const load = (dir, phase) => { const o = []; for (const f of fs.readdirSync(dir)) if (f.startsWith(phase + '.w')) for (const l of fs.readFileSync(dir + '/' + f, 'utf8').split('\n')) if (l.trim()) o.push(JSON.parse(l)); return o; };
const A = load(process.argv[2], 'baseline'), B = load(process.argv[3], 'verify');
const key = (r) => `${r.scenario}|${r.seed}`;
const bm = new Map(B.map((r) => [key(r), r]));
let same = 0, diff = [];
for (const a of A) { const b = bm.get(key(a)); if (!b) { diff.push(['missing', key(a)]); continue; }
  if (a.killed === b.killed && a.ttkS === b.ttkS && a.leftHp === b.leftHp) same++; else diff.push([key(a), a.killed ? a.ttkS : `alive(${a.leftHp})`, b.killed ? b.ttkS : `alive(${b.leftHp})`]); }
console.log('identical', same, 'of', A.length, 'changed', diff.length);
const byW = {}; for (const d of diff) { const w = d[0].split('|')[0]; byW[w] = (byW[w] || 0) + 1; } console.log(byW);
for (const d of diff.filter((d) => !d[0].startsWith('beam_laser_m'))) console.log('NON-BEAM', d.join('  '));
// Beam kill counts
for (const [lab, R] of [['before', A], ['after', B]]) { const bs = R.filter((r) => r.weapon === 'wpn_beam_laser_m'); for (const mode of ['dummy', 'live']) { const m = bs.filter((r) => r.mode === mode); console.log(lab, mode, 'beam killed', m.filter((r) => r.killed).length, '/', m.length); } }
