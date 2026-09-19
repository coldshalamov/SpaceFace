#!/usr/bin/env node
/** Render a dependency-free static report from the actual recorded fixture data. */
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const input = path.resolve(process.argv[2] || path.join(root, 'evidence/ten-hour'));
const output = path.resolve(process.argv[3] || path.join(root, 'evidence/session-shape.html'));
const suite = JSON.parse(await fs.readFile(path.join(input, 'summary.json'), 'utf8'));
const durationHours = suite.secondsPerScenario / 3600;
const scenarioCount = suite.comparisons.length;
const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = { quiet: '#4e6176', opportunity: '#63aa9b', build: '#be9a57', peak: '#c96c61', aftermath: '#628bab', recovery: '#886ba9' };
function plot(run) {
  const W = 1100, H = 260, left = 50, right = 20, top = 22, bottom = 46, end = Math.min(1800, run.seconds);
  const w = W - left - right, h = H - top - bottom;
  const x = (t) => left + t / end * w, y = (v) => top + (1 - v) * h;
  const rows = run.timeline.filter((r) => r.t <= end);
  let svg = `<svg role="img" aria-label="${escape(run.archetype)} seed ${run.seed}: requested and observed pressure for the first thirty simulation minutes" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#111c29"/>`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], next = rows[i+1]?.t ?? end;
    if (next <= r.t) continue;
    svg += `<rect x="${x(r.t)}" y="${top}" width="${Math.max(0,x(next)-x(r.t))}" height="${h}" fill="${colors[r.phase] || '#45505c'}" opacity=".18"/>`;
  }
  for (const v of [0, .25, .5, .75, 1]) {
    svg += `<path d="M${left},${y(v)}H${W-right}" stroke="#344153" stroke-width=".7"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end" fill="#aab8c7" font-size="11">${v.toFixed(2)}</text>`;
  }
  for (let t = 0; t <= end; t += 300) svg += `<text x="${x(t)}" y="${H-19}" text-anchor="middle" fill="#aab8c7" font-size="12">${t/60} min</text>`;
  // Null requested values (suspended policy) create an honest break instead of a false line to zero.
  for (const [key, color, dash] of [['requested','#f0bf70','7 4'],['observed','#9ee0d2','']]) {
    let points = '', open = false;
    for (const r of rows) {
      if (r[key] === null) { open = false; continue; }
      points += `${open?'L':'M'}${x(r.t).toFixed(2)},${y(r[key]).toFixed(2)} `; open = true;
    }
    svg += `<path d="${points}" fill="none" stroke="${color}" stroke-width="2.2" stroke-dasharray="${dash}"/>`;
  }
  return svg + '</svg>';
}
let body = '';
for (const row of suite.comparisons) {
  const run = JSON.parse(await fs.readFile(path.join(input, `${row.archetype}-${row.seed}-directed.json`), 'utf8'));
  body += `<section><div class="section-head"><h2>${escape(row.archetype)} <span>/ seed ${row.seed}</span></h2><div class="badge">${row.repeatAndCheckpointVerified ? 'Exact repeat + checkpoint' : 'Repeat not requested'}</div></div>`;
  body += `<p class="small">First 30 minutes · dashed amber: requested pressure · solid mint: observed-pressure heuristic · shading: controller phase.</p>${plot(run)}`;
  body += `<div class="metrics"><p><b>${run.summary.phaseTransitions}</b>phase changes / ${durationHours}h</p><p><b>${row.directedCombatSpawns} / ${row.legacyCombatSpawns}</b>directed / legacy combat spawns</p><p><b>${row.starvationNotices}</b>starvation diagnoses</p><p><b>${(row.maxSnapshotBytes/1024).toFixed(1)} KiB</b>largest sampled owner snapshot</p></div>`;
  body += '<div class="table"><table><thead><tr><th>Hour</th><th>Combat starts</th><th>Civilian starts</th><th>Quiet + aftermath</th><th>Recovery</th><th>Damage taken*</th></tr></thead><tbody>';
  for (const hour of run.hours) body += `<tr><td>${hour.hour}</td><td>${hour.combatSpawns}</td><td>${hour.civilianSpawns}</td><td>${(((hour.phases.quiet||0)+(hour.phases.aftermath||0))/60).toFixed(1)} min</td><td>${((hour.phases.recovery||0)/60).toFixed(1)} min</td><td>${hour.damageTaken}</td></tr>`;
  body += `</tbody></table></div><p class="hash">Policy / world trace SHA-256: ${escape(run.policyHash)}</p></section>`;
}
const legends = Object.entries(colors).map(([phase,color]) => `<span><i style="background:${color}"></i>${phase}</span>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpaceFace — Tension Director Evidence</title><style>
*{box-sizing:border-box}body{margin:0;background:#09111b;color:#e5edf5;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1200px;margin:auto;padding:52px 30px}header{padding:10px 0 32px;border-bottom:1px solid #324155}.eyebrow{text-transform:uppercase;letter-spacing:.17em;font-size:12px;color:#9ee0d2}h1{font-size:clamp(32px,5vw,58px);line-height:1.12;letter-spacing:-.035em;margin:15px 0}h2{font-size:25px;margin:0;text-transform:capitalize}h2 span{font-size:17px;color:#aab8c7;font-weight:400}p{max-width:980px}.callout{border-left:3px solid #f0bf70;padding:10px 18px;background:#162232;margin:24px 0}.legend{display:flex;flex-wrap:wrap;gap:12px 20px;color:#aab8c7;font-size:13px}.legend i{display:inline-block;width:10px;height:10px;margin-right:7px;border-radius:2px}section{margin:40px 0;padding-bottom:38px;border-bottom:1px solid #324155}.section-head{display:flex;gap:20px;align-items:center;justify-content:space-between}.badge{font-size:12px;color:#9ee0d2;border:1px solid #426560;border-radius:5px;padding:5px 9px}.small,.hash{font-size:12px;color:#aab8c7}.hash{overflow-wrap:anywhere}svg{width:100%;height:auto;display:block;border-radius:7px;margin:15px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.metrics p{font-size:12px;color:#aab8c7}.metrics b{display:block;font-size:24px;color:#e5edf5;font-weight:600}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;text-align:right}th,td{padding:8px 12px;border-bottom:1px solid #233144}th:first-child,td:first-child{text-align:left}th{font-weight:500;color:#aab8c7}.footer{color:#aab8c7;font-size:13px}@media(max-width:650px){main{padding:28px 16px}.metrics{grid-template-columns:repeat(2,1fr)}.section-head{display:block}.badge{display:inline-block;margin-top:10px}th,td{padding:6px}}
</style></head><body><main><header><div class="eyebrow">SpaceFace / Session systems / Reproducible evidence</div><h1>Intention is not evidence.</h1><p>${scenarioCount} seeded ${durationHours}-hour directed sessions, ${scenarioCount} legacy arms${suite.repeatWithCheckpoint ? `, and ${scenarioCount} repeated directed sessions with a midpoint owner-state restore` : ""}. The controller and the campaign gate/selection/accrual functions are real. The surrounding world is a deliberately small test double.</p><div class="callout"><strong>Evidence boundary.</strong> These are controlled fixtures, not human playtests or full production simulations. Lower spawn counts are not automatically better. Observed pressure is a bounded heuristic, not a measurement of human tension. *Damage, repairs, supply blackouts and encounters are synthetic fixture inputs.</div><div class="legend">${legends}</div></header>${body}<p class="footer">Source: evidence/ten-hour/*.json. Raw CSV timelines are included. Rebuild using <code>node tools/render-report.mjs</code>. The controller does not create additional content, count meaningful choices, alter weapon damage, or erase an existing fight to manufacture a release.</p></main></body></html>`;
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, html);
console.log(`Rendered ${output}`);
