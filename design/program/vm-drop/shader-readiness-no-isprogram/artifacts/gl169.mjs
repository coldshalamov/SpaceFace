// Per-run GL-wait census: isProgram / getProgramParameter totals and largest single blocks, split
// at the Launch click (from report.md) into New-Game+loading vs flight.
import fs from 'fs';
const [dir] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(dir + '/profile.cpuprofile'));
const rep = fs.readFileSync(dir + '/report.md', 'utf8');
const ngs = +(/New Game screen \(to Launch click\) \| ([\d.]+)/.exec(rep) || [0, 0])[1];
const l2f = +(/Launch click to flight: ([\d.]+) s/.exec(rep) || [0, 0])[1];
const flightAt = ngs + l2f;
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const name = (id) => byId.get(id).callFrame.functionName;
const lanes = { isProgram: /^isProgram$/, getProgramParameter: /^getProgramParameter$/ };
const out = { launchToFlight: l2f };
for (const [lane, re] of Object.entries(lanes)) {
  let t = p.startTime; const blocks = []; let cur = null;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i]; const dt = (p.timeDeltas[i + 1] || p.timeDeltas[i]) / 1000; const rel = (t - p.startTime) / 1e6;
    if (re.test(name(p.samples[i]))) { if (cur && (t - cur.end) / 1000 <= 3) { cur.ms += dt; cur.end = t; } else { cur = { at: rel, end: t, ms: dt }; blocks.push(cur); } }
  }
  const pre = blocks.filter((b) => b.at < flightAt), fl = blocks.filter((b) => b.at >= flightAt);
  const sum = (a) => +a.reduce((s, b) => s + b.ms, 0).toFixed(0); const mx = (a) => +Math.max(0, ...a.map((b) => b.ms)).toFixed(0);
  Object.assign(out, { [lane + 'Pre']: sum(pre), [lane + 'PreMax']: mx(pre), [lane + 'Flight']: sum(fl), [lane + 'FlightMax']: mx(fl), [lane + 'FlightN>50']: fl.filter((b) => b.ms > 50).length });
}
console.log(JSON.stringify(out));
