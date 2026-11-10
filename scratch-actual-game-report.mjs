#!/usr/bin/env node
// scratch-actual-game-report.mjs — rolls the six 10-hour ledgers into the program-compass table.
// Prints the numbers the report cites; the judgment (ranked defects) is written by hand on top.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = '.devshots/actual-game';
const files = readdirSync(DIR).filter((f) => f.endsWith('10h.json'));
const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

for (const f of files.sort()) {
  const l = JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));
  const hours = l.hours_detail.length;
  const t = l.totals;
  const v = l.verbs || {};
  console.log(`\n===== ${f} (wall ${l.runMetadata.wallSeconds}s, resurrects ${l.runMetadata.resurrects}) =====`);
  console.log(`sim hours: ${l.hours} | deaths: ${l.deaths.length} | sectors: ${JSON.stringify(t.sectorVisits)}`);
  console.log(`verbs: distinct=${v.distinctVerbs} [${(v.verbsList || []).join(',')}] activeShare=${v.activeTickShare}`);
  console.log(`kills by player: ${t.killsByPlayer} | shots: ${t.shots} | dmg dealt/taken: ${t.damageDealt}/${t.damageTaken}`);
  console.log(`tether: attach=${t.tetherAttach} cut=${t.tetherCut} broken=${t.tetherBroken}`);
  console.log(`dock episodes: ${t.docks}/${t.undocks} | missions acc/done/fail: ${t.missionsAccepted}/${t.missionsCompleted}/${t.missionsFailed}`);
  console.log(`sold: ${t.commoditySoldU}u for ${t.commoditySoldCr}cr | mined rocks: ${t.asteroidsMined} | salvage: ${t.salvagePickups}`);
  console.log(`decisions: ${t.decisions} (${round(t.decisions / l.hours, 1)}/h) | event types: ${t.distinctEventTypes}`);
  console.log(`chains: ${JSON.stringify(t.chainsByKind)}`);
  console.log(`firsts (sim-hour): ${JSON.stringify(l.firstsBySimHour)}`);
  // hourly roll-up
  console.log('hour | credits | soldCr | verbs# | kills | attach | docks | dec | quietMaxS | sectors entered');
  for (const h of l.hours_detail) {
    const creditsEnd = h.endSnapshot ? h.endSnapshot.credits : '?';
    const verbCount = (v.perHour && v.perHour[h.hour] || []).length;
    console.log(`${String(h.hour).padStart(4)} | ${String(creditsEnd).padStart(8)} | ${String(Math.round(h.commoditySoldCr)).padStart(7)} | ${String(verbCount).padStart(5)} | ${String(h.killsByPlayer).padStart(5)} | ${String(h.tetherAttach).padStart(6)} | ${String(h.docks).padStart(5)} | ${String(h.decisionsThisHour).padStart(3)} | ${String(h.quietLongestGapS).padStart(9)} | ${h.sectorEnters.join(',') || '-'}`);
  }
  // hour-to-hour verb-set repetition (Jaccard between consecutive hours)
  if (v.perHour) {
    const hs = Object.keys(v.perHour).map(Number).sort((a, b) => a - b);
    const sims = [];
    for (let i = 1; i < hs.length; i++) {
      const A = new Set(v.perHour[hs[i - 1]]), B = new Set(v.perHour[hs[i]]);
      const inter = [...A].filter((x) => B.has(x)).length;
      const uni = new Set([...A, ...B]).size;
      sims.push(round(uni ? inter / uni : 1));
    }
    console.log(`consecutive-hour verb Jaccard: ${sims.join(' ')}`);
  }
  // deaths detail
  if (l.deaths.length) console.log(`deaths: ${JSON.stringify(l.deaths.map((d) => d.data))}`);
}
