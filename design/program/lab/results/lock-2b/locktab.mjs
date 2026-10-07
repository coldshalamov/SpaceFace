import fs from 'node:fs';
const dir = process.argv[2]; const phases = (process.argv[3] || 'baseline,probe').split(',');
const rows = [];
for (const f of fs.readdirSync(dir)) for (const ph of phases) if (f.startsWith(ph + '.w')) for (const l of fs.readFileSync(dir + '/' + f, 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l));
const cfgs = [...new Set(rows.map((r) => r.cfg))];
const fams = ['pick-4', 'pick-6', 'pick-6j', 'chain-4', 'chain-6', 'chain-6j', 'chain-6d15', 'chain-6d', 'chain-6d40', 'threat', 'nopointer-4', 'live-4'];
console.log('cfg'.padEnd(52) + fams.map((f) => f.padStart(16)).join(''));
for (const c of cfgs) {
  let line = c.replace('{"lockLab":', '').slice(0, 50).padEnd(52);
  for (const f of fams) {
    const rs = rows.filter((r) => r.cfg === c && r.scenario === f && !r.error);
    if (!rs.length) { line += ''.padStart(16); continue; }
    if (f === 'live-4') { const sw = rs.reduce((a, r) => a + r.switches, 0); line += `sw/min ${(sw / (rs.length * 20 / 60)).toFixed(2)}`.padStart(16); continue; }
    const picks = rs.reduce((a, r) => a + r.picks, 0), ok = rs.reduce((a, r) => a + r.ok, 0), near = rs.reduce((a, r) => a + r.nearestPicks, 0);
    const nn = rs.reduce((a, r) => a + r.notNearest, 0), oknn = rs.reduce((a, r) => a + r.okWhenNotNearest, 0);
    line += `${(100 * ok / picks).toFixed(0)}%/${nn ? (100 * oknn / nn).toFixed(0) : '-'}%/n${(100 * near / picks).toFixed(0)}`.padStart(16);
  }
  console.log(line);
}
console.log('cell = intended-pick % / intended % when intended is NOT the nearest / share of picks that were the nearest. errors:', rows.filter((r) => r.error).length);
const lat = rows.filter((r) => r.repickS != null); if (lat.length) console.log('re-pick latency after kill (s): mean', (lat.reduce((a, r) => a + r.repickS, 0) / lat.length).toFixed(3), ' time-to-first-lock max', Math.max(...rows.map((r) => r.timeToLockS ?? 0)));
for (const c of cfgs) { const rs = rows.filter((r) => r.cfg === c && r.gapPerKillS != null); if (rs.length) console.log('gap/kill s', c.replace('{"lockLab":', '').slice(0, 60).padEnd(62), (rs.reduce((a, r) => a + r.gapPerKillS, 0) / rs.length).toFixed(3)); }
