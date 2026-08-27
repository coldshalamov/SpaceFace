#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACETS = [
  {
    key: 'contract-regression',
    label: 'lock one live behavior contract',
    objective: 'Add or strengthen one focused behavior-level deterministic regression around this subject. Exercise public behavior or an ownership seam, not source formatting. Before trusting a new gate, prove it can go red under a deliberate mutation or adversarial fixture.'
  },
  {
    key: 'bounded-bug-hunt',
    label: 'run a bounded bug hunt and surgical repair',
    objective: 'Inspect this subject for one concrete player-visible or architectural defect. Reproduce it first. Repair only a demonstrated defect, and return NO_CHANGE rather than inventing work when the live path is already correct.'
  },
  {
    key: 'lifecycle-reentry',
    label: 'stress lifecycle, teardown, and re-entry',
    objective: 'Exercise init/use/leave/dispose/re-enter or equivalent repeated lifecycle boundaries. Detect duplicate subscriptions, stale handles, retained state/resources, double publication, or non-idempotent teardown and fix the smallest demonstrated failure.'
  },
  {
    key: 'failure-edge-state',
    label: 'harden one failure or edge state',
    objective: 'Force a plausible malformed, missing, stale, duplicated, out-of-order, boundary, interrupted, or old-save state through this subject. Make the live route fail closed, recover, or preserve state correctly instead of warning-and-continuing into broken behavior.'
  },
  {
    key: 'improvement-slice',
    label: 'ship one bounded improvement slice',
    objective: 'Find one small improvement that unambiguously strengthens the player experience, readability, determinism, maintainability, performance, or systemic depth through this existing owner. Do not introduce a parallel framework or cosmetic churn. If no high-confidence improvement exists, return NO_CHANGE.'
  }
];

const ROOTS = [
  'src/core', 'src/ai', 'src/combat', 'src/systems', 'src/save',
  'scripts', 'test',
  'src/ui', 'src/render', 'src/audio', 'src/presentation', 'src/data'
];
const EXT = new Set(['.js', '.mjs']);
const BANNED = [
  '/legacy/', '/vendor/', '/node_modules/',
  'src/systems/flight.js', 'src/systems/ai.js',
  'src/core/flightDynamics.js'
];
function posix(p){ return p.split(path.sep).join('/'); }
function walk(rel, out){
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    const p = posix(rel);
    if (EXT.has(path.extname(p)) && !BANNED.some(x => p.includes(x))) out.push(p);
    return;
  }
  for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    walk(path.join(rel, ent.name), out);
  }
}

const discovered = [];
for (const root of ROOTS) walk(root, discovered);
const seen = new Set();
const files = discovered.filter(p => !seen.has(p) && seen.add(p)).slice(0, 200);

function laneFor(file){
  if (file.startsWith('test/') || file.startsWith('scripts/')) return 'tooling-test';
  if (file.startsWith('src/ui/')) return 'ui-ux-accessibility';
  if (file.startsWith('src/render/') || file.startsWith('src/audio/') || file.startsWith('src/presentation/')) return 'render-assets-vfx-audio';
  if (file.startsWith('src/ai/') || file.includes('/flight') || file.startsWith('src/combat/')) return 'ai-combat-flight';
  if (file.startsWith('src/data/')) return 'world-data-content';
  if (file.startsWith('src/save/')) return 'determinism-save';
  return 'systems-core';
}
function humanize(file){
  return file.replace(/^src\//,'').replace(/^scripts\//,'script ').replace(/^test\//,'test ')
    .replace(/\.(m?js)$/,'').replace(/[\/_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function riskFor(file){
  if (/physics|save|econom|mission|world|weapon|combat|registry|input|renderer|partsLibrary|assetLoader/i.test(file)) return 'medium';
  return 'low';
}
function checksFor(file){
  if (file.startsWith('src/render/')) return ['npm run check:baseline', 'npm run check:asset-reachability'];
  if (file.startsWith('src/ui/')) return ['npm run check:baseline'];
  if (/massline|attachment|tether/i.test(file)) return ['npm run check:massline', 'npm run check:baseline'];
  if (/mining|asteroid/i.test(file)) return ['npm run check:mining:2', 'npm run check:baseline'];
  if (/flight/i.test(file)) return ['npm run check:sim:v3', 'npm run check:baseline'];
  if (/save/i.test(file)) return ['npm run check:baseline'];
  return ['npm run check:baseline'];
}

const subjects = files.map((file, i) => ({
  index: i + 1,
  file,
  title: humanize(file),
  lane: laneFor(file),
  collision: `jules-${String(i+1).padStart(3,'0')}-${path.basename(file).replace(/\W+/g,'-').toLowerCase()}`,
  risk: riskFor(file),
  checks: checksFor(file)
}));
const tasks = [];
for (const s of subjects) {
  for (let fi=0; fi<FACETS.length; fi++) {
    const num=(s.index-1)*5+fi+1;
    const facet=FACETS[fi];
    tasks.push({
      id:`JULES-${String(num).padStart(4,'0')}`,
      num,
      model:num<=700?'flash':'pro',
      lane:s.lane,
      priority:num<=250?1:2,
      risk:s.risk,
      collision:s.collision,
      file:s.file,
      title:`${s.title} — ${facet.label}`,
      facet:facet.key,
      objective:facet.objective,
      checks:s.checks
    });
  }
}

const args=process.argv.slice(2);
const has=f=>args.includes(f);
const val=f=>{const i=args.indexOf(f);return i>=0?args[i+1]:null;};
const intVal=(f,d)=>{const n=Number(val(f));return Number.isFinite(n)&&n>0?Math.floor(n):d;};
function fail(msg){ console.error(`JULES BANK ERROR: ${msg}`); process.exit(1); }
function validate(){
  if (discovered.length < 200) fail(`expected at least 200 eligible repository subjects; found ${discovered.length}`);
  if (subjects.length !== 200) fail(`expected 200 subjects; got ${subjects.length}`);
  if (tasks.length !== 1000) fail(`expected 1000 tasks; got ${tasks.length}`);
  if (new Set(tasks.map(t=>t.id)).size !== 1000) fail('duplicate task IDs');
  if (new Set(tasks.map(t=>t.collision)).size !== 200) fail('expected 200 collision domains');
  const flash=tasks.filter(t=>t.model==='flash').length;
  const pro=tasks.filter(t=>t.model==='pro').length;
  if (flash!==700 || pro!==300) fail(`expected 700 Flash / 300 Pro; got ${flash}/${pro}`);
  for (let i=0;i<tasks.length;i++) if (tasks[i].num!==i+1) fail(`non-contiguous task ID at ${i+1}`);
  console.log(`PASS: 1,000 tasks; 200 live-file subjects; 700 Flash / 300 Pro; JULES-0001..JULES-1000`);
}
function prompt(t){
  return `SPACEFACE JULES TASK ${t.id}\nMODEL: ${t.model==='flash'?'Gemini 3.6 Flash':'Gemini 3.1 Pro'}\nLANE: ${t.lane}\nCOLLISION KEY: ${t.collision}\nRISK: ${t.risk}\n\nTITLE\n${t.title}\n\nPRIMARY SUBJECT\n${t.file}\n\nDIRECTED OBJECTIVE\n${t.objective}\n\nEXECUTION CONTRACT\n1. Start from current master and report its SHA. Read CANONICAL_BUILD_MAP.md, root AGENTS.md, docs/MODULE_MAP.md, the nearest nested AGENTS.md, and the subject file. Verify this file still participates in the live route before editing.\n2. Characterize or reproduce current behavior before changing production. If the objective is already satisfied, return NO_CHANGE with exact evidence; do not manufacture a PR.\n3. Implement the smallest coherent change for this one task. Preserve deterministic simulation, state.rng/state.simTime, single writers, save/Continue, Browser/Electron parity, accessibility, authored visual quality, and the existing game path.\n4. NEVER edit CANONICAL_BUILD_MAP.md, design/program/roadmap/program-queue.json, design/program/NOW.md, design/program/jules/**, or test/*.expected.json from a Jules task. Do not add a parallel engine/AI/gameplay authority. Do not lower default quality or content density for performance.\n5. Run the narrowest direct proof, then the nearest existing check once. Suggested: ${t.checks.join(' ; ')}. A new check must be shown capable of failing. Never rerun an unchanged failure fingerprint.\n6. Open at most one coherent PR. Keep unrelated findings out of the diff.\n\nDONE WHEN\n- The objective is demonstrated through the live owner, or the task returns evidence-backed NO_CHANGE.\n- The diff is bounded and contains no unrelated cleanup.\n- The focused proof would catch regression of the repaired/covered invariant.\n- Final report: RESULT PR_READY|NO_CHANGE|BLOCKED; BASE_SHA; COMMIT/PR; FILES; PROOF; PLAYER_OR_ENGINE_RESULT; RESIDUAL_RISK; LOCAL_REVIEW_FOCUS.\n\nLOCAL MERGE GATE\nA stronger local integrator must inspect the complete diff, rebase or port onto current master, independently verify the claim, and may reject the PR even when Jules reports green.`;
}
function selectPool(){
  let pool=[...tasks];
  const model=val('--model'); const lane=val('--lane'); const risk=val('--risk');
  if (model) pool=pool.filter(t=>t.model===model.toLowerCase());
  if (lane) pool=pool.filter(t=>t.lane===lane);
  if (risk) pool=pool.filter(t=>t.risk===risk);
  const seed=Number(val('--seed')||1)>>>0;
  pool.sort((a,b)=>(((a.num*2654435761)>>>0)^seed)-((((b.num*2654435761)>>>0)^seed)));
  const count=intVal('--count',1); const used=new Set(); const picked=[];
  for (const t of pool){ if(used.has(t.collision)) continue; used.add(t.collision); picked.push(t); if(picked.length>=count) break; }
  return picked;
}

if (has('--validate')) { validate(); process.exit(0); }
if (has('--stats')) {
  validate();
  const lanes={}; for(const t of tasks) lanes[t.lane]=(lanes[t.lane]||0)+1;
  console.log(JSON.stringify({tasks:1000,subjects:200,models:{flash:700,pro:300},lanes},null,2));
  process.exit(0);
}
if (has('--list')) { validate(); console.log(tasks.map(t=>`${t.id}\t${t.model}\t${t.collision}\t${t.file}\t${t.title}`).join('\n')); process.exit(0); }
const id=val('--id');
if (id) {
  const t=tasks.find(x=>x.id===id.toUpperCase()); if(!t) fail(`unknown task ${id}`);
  console.log(val('--format')==='json'?JSON.stringify(t,null,2):prompt(t)); process.exit(0);
}
if (has('--next')) {
  const picked=selectPool(); const fmt=val('--format')||'ids';
  if(fmt==='json') console.log(JSON.stringify(picked,null,2));
  else if(fmt==='prompt') console.log(picked.map(prompt).join('\n\n---\n\n'));
  else console.log(picked.map(t=>t.id).join('\n'));
  process.exit(0);
}
console.log('Usage: node scripts/jules-dispatch.mjs --validate | --stats | --list | --id JULES-0001 [--format prompt|json] | --next [--model flash|pro] [--lane <lane>] [--risk low|medium] [--count N] [--seed N] [--format ids|prompt|json]');
