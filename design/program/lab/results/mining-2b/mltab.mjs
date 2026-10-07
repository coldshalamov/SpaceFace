import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('pickups')).sort()) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`)).runs;
  for (const k of [...new Set(r.map((x) => x.key))]) {
    const a = r.filter((x) => x.key === k); const cpm = a.map((x) => x.creditsPerMin);
    const mean = cpm.reduce((s, x) => s + x, 0) / a.length; const sd = Math.sqrt(cpm.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length);
    const ord = a.reduce((s, x) => s + x.ordinaryCreditsPerMin, 0) / a.length;
    const share = a.reduce((s, x) => s + x.richCreditShare, 0) / a.length;
    console.log(`${f.replace('.json', '').padEnd(10)} ${k.padEnd(14)} cr/min ${mean.toFixed(0).padStart(6)} ±${sd.toFixed(0).padStart(5)} (cv ${(sd / mean).toFixed(2)})  ordinary ${ord.toFixed(0).padStart(5)}  richShare ${share.toFixed(2)}  units/min ${(a.reduce((s, x) => s + x.unitsPerMin, 0) / a.length).toFixed(1)}  cores ${a.reduce((s, x) => s + x.coresDone, 0)}/${a.reduce((s, x) => s + x.cores, 0)}  maxGap ${Math.max(...a.map((x) => x.maxGapS))}`);
  }
}
