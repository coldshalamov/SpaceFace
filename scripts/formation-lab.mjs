#!/usr/bin/env node
// Closed-loop formation lab (Controlled Chaos packet 03).
//
//   node scripts/formation-lab.mjs                      # every scenario, one digest each
//   node scripts/formation-lab.mjs --scenario=moving_leader --json=out.json
//   node scripts/formation-lab.mjs --series=2 --scenario=stationary_arrival   # per-second trace of member id 2
//   node scripts/formation-lab.mjs --exact           # pin hulls to the S0 tier (engaged/aggroed NPCs); default is S1_NEAR
//
// Reads the sustained window of each scenario (see src/testing/formationScenarios.js). It is a
// MEASUREMENT instrument: it never changes a gain and never writes a pose.
import fs from 'node:fs';
import { FORMATION_SCENARIOS, digestSummary, runFormationScenario } from '../src/testing/formationScenarios.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const only = flag('scenario');
const jsonPath = flag('json');
const seriesId = flag('series');
const exact = flag('exact') === true || flag('exact') === 'true';
const ids = only ? String(only).split(',') : Object.keys(FORMATION_SCENARIOS);
const out = {};
for (const id of ids) {
  const t0 = Date.now();
  const { summary, rig } = await runFormationScenario(id, exact ? { config: { exact: true } } : {});
  out[id] = summary;
  console.log(`\n== ${id}  (${Date.now() - t0} ms)  ${FORMATION_SCENARIOS[id].summary}`);
  console.log(digestSummary(summary));
  if (seriesId) {
    const series = rig.recorder.series(Number(seriesId));
    for (let i = 0; i < series.length; i += 60) {
      const s = series[i];
      const pe = s.slot ? Math.hypot(s.pos.x - s.slot.x, s.pos.z - s.slot.z) : NaN;
      const ve = s.slotVel ? Math.hypot(s.vel.x - s.slotVel.x, s.vel.z - s.slotVel.z) : NaN;
      const r = s.request || {};
      console.log(`  t=${String(s.tick).padStart(5)} pe=${pe.toFixed(1).padStart(6)} ve=${ve.toFixed(1).padStart(5)} spd=${s.speed.toFixed(1).padStart(5)}`
        + ` w=${s.angVel.toFixed(2).padStart(6)} fwd=${(r.forward ?? 0).toFixed(2)} rt=${(r.right ?? 0).toFixed(2)} tq=${(r.torqueYaw ?? 0).toFixed(2)} ${r.kind} ${r.reason}`);
    }
  }
  rig.dispose();
}
if (jsonPath) {
  fs.writeFileSync(String(jsonPath), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${jsonPath}`);
}
