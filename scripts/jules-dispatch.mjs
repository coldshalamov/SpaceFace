#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = path.join(ROOT, 'design/program/jules');
const facetMap = {
  "test-hardening": [
    ["contract-path","Lock the ordinary contract","Add or strengthen one focused deterministic regression for the ordinary live-path contract. Exercise public behavior or an ownership seam, not source formatting."],
    ["boundary-matrix","Cover the boundary matrix","Add a small table-driven boundary test for the load-bearing zero/minimum/maximum/missing/disabled transitions. Avoid decorative permutations."],
    ["repeat-lifecycle","Prove repeated lifecycle safety","Initialize, use, tear down, and reinitialize the owner. Detect duplicate subscriptions, retained state, stale resources, or double publication."],
    ["malformed-stale","Exercise malformed and stale state","Construct one physically plausible stale, missing, duplicated, or out-of-order state from an old save or interrupted route and prove fail-closed behavior."],
    ["seeded-invariant","Sweep a seeded invariant","Run a bounded deterministic seed/order matrix around one invariant and report the first counterexample with enough state to reproduce it."]
  ],
  "bug-hunt": [
    ["ordinary-repro","Reproduce and fix an ordinary-route defect","Review the live owner for a concrete player-visible or architectural defect, write the smallest reproduction, and fix only if the defect is demonstrated."],
    ["stale-null","Hunt stale/null/missing-state failures","Trace missing, stale, null, and partially initialized state through the live path; add a regression and smallest repair for any proven failure."],
    ["duplicate-lifecycle","Hunt duplicate and lifecycle failures","Exercise repeated enter/leave/init/dispose cycles and look for duplicate events, leaked resources, stale entities, or non-idempotent teardown."],
    ["ordering-seam","Hunt cross-owner ordering failures","Trace the nearest event/API seam and look for order dependence, stale reads, double writers, or publication before authoritative state is ready."],
    ["failure-path","Harden the failure path","Force the most plausible local failure and ensure the route fails visibly and recoverably instead of warning-and-continuing into broken state."]
  ],
  "determinism-save": [
    ["roundtrip","Prove save/load round-trip","Round-trip the relevant state through the real serializer/normalizer and prove semantic equality for owned fields and intentionally transient exclusions."],
    ["migration","Harden old/missing-field migration","Build one old-save or partial-save fixture around this owner and prove normalization is deterministic, bounded, and does not invent cross-owner state."],
    ["repeat-seed","Prove same-seed repeatability","Run the relevant behavior twice from the same seed/input and compare authoritative state/event outputs; fix any ambient randomness or unstable ordering."],
    ["transition","Stress New Game / Continue transition","Exercise the owner across New Game, Continue/load, superseded transition, and re-entry boundaries; detect stale callbacks or publication from obsolete generations."],
    ["snapshot","Audit serialization ownership","Inspect what this owner contributes to canonical state/snapshots and close one mismatch: omitted durable state, serialized transient state, unstable ordering, or duplicate authority."]
  ],
  "performance-lifecycle": [
    ["hot-path","Measure hot-path cost","Measure the live path for avoidable per-frame scans, allocations, repeated conversions, or work scaling with registered rather than active entities. Change code only if evidence names a pole."],
    ["dispose","Prove lifecycle/resource disposal","Cycle creation and disposal repeatedly and check CPU/GPU/listener/pool ownership reaches a stable plateau without deleting player-visible quality."],
    ["cadence","Remove redundant cadence work","Measure whether this owner runs when hidden, off-table, unchanged, or inactive; use deterministic cadence/dirty-state reuse only where the measurement justifies it."],
    ["first-use","Harden first-use/admission cost","Trace first construction, decode, compile, upload, or admission for this owner; eliminate a demonstrated synchronous brick without moving it to another display callback."],
    ["matched-ab","Run a no-quality-loss matched A/B","Build a representative matched before/after measurement and keep an optimization only if p95/p99 or hitch ownership improves with identical gameplay and visible quality."]
  ],
  "ui-ux-accessibility": [
    ["default-read","Polish the default information read","Inspect the normal player route at shipping scale and fix one proven clarity, hierarchy, discoverability, or interaction defect without inventing new state."],
    ["input-reach","Prove input reachability","Exercise keyboard plus the relevant alternate input/rebind path, focus order, escape/back behavior, and conflict handling; repair any unreachable or trapped interaction."],
    ["data-states","Complete data states","Exercise populated, empty, loading, error, and denied states where applicable; every visible state must explain what fills it and preserve a useful player verb."],
    ["responsive-a11y","Stress responsive and accessibility modes","Check pseudo-localization/text expansion, 1280x720 and ultrawide layout, reduced motion, forced colors/contrast, and text floor; fix one concrete regression."],
    ["memory-lifecycle","Preserve screen state and lifecycle","Open/close/reopen the surface, verify intended state memory and cleanup, and remove stale DOM/listeners/timers or unwanted reset-to-default behavior."]
  ],
  "ai-combat-flight": [
    ["scenario","Build a deterministic combat/flight scenario","Create or extend one seconds-scale deterministic scenario that exposes this behavior through the live V3/tactical/physics path and records meaningful outcome metrics."],
    ["intent","Improve intentionality and telegraphy","Find one case where motion, attack, retreat, formation, or ability use looks accidental; repair decision/desired-state logic or cues so cause and intent are legible."],
    ["counterplay","Probe counterplay boundaries","Exercise one strong player tactic and one failure/counterplay case. Fix invulnerability, degenerate loops, snap-back, or non-interactive behavior without HP inflation."],
    ["physics-coupling","Strengthen physical/systemic coupling","Make one proven behavior use canonical force/torque/impulse, terrain, Massline, cargo, fields, or collision meaningfully instead of scripting a decorative imitation."],
    ["tuning-ab","Tune with matched evidence","Compare a bounded tuning change on the same scenario/seed. Keep it only if responsiveness/readability improves without destroying hull identity, momentum honesty, determinism, or performance."]
  ],
  "world-economy-missions-mining": [
    ["living-loop","Close one living-world loop","Trace the actor/resource/job chain through existing owners and make one missing handoff or visible consequence real so the world does work the player can interrupt."],
    ["failure-mutation","Turn failure into a new situation","Find one mission/activity failure that dead-ends or reloads cheaply and implement a bounded aftermath, salvage, pursuit, restitution, escape, or changed objective using existing systems."],
    ["economy-ownership","Audit economic/ownership causality","Trace prices, cargo, credits, faction, claims, or logistics across single-writer seams and fix one duplicate write, stale value, non-causal reward, or disconnected consequence."],
    ["persistence","Prove world-state persistence","Round-trip the relevant world/activity state through save/Continue and sector transitions; fix lost, duplicated, reset, or non-deterministically reconstructed state."],
    ["content-variant","Add one systemic content variant","Author one bounded mission/encounter/job/site/mining variant using existing grammar that creates a new decision or physical opportunity, not just copy or a data row."]
  ],
  "render-assets-vfx-audio": [
    ["reachability","Audit authored asset reachability","Trace one runtime identity from manifest/catalog to live loader and normal spawn. Fix missing, rejected, misrouted, or silent-fallback assets without weakening the authored-asset gate."],
    ["continuity","Fix normal-camera visual continuity","Review shipping-camera behavior for pop, flicker, blank surfaces, origin-rebase jumps, wrong LOD, scale, silhouette, or attachment drift and repair one proven defect."],
    ["dispose","Prove render/audio lifecycle disposal","Create/replace/remove the relevant object repeatedly and prove roots, geometries, materials, textures, voices, cues, and subscriptions stay bounded and ownership-correct."],
    ["cue","Strengthen one causal VFX/audio cue","Route one existing gameplay receipt to a readable bounded visual/audio consequence through the canonical presentation path; respect priority, saturation, reduced-motion, and no-soft-billboard rules."],
    ["picture-perf","Protect picture while reducing cost","Measure one render/asset/audio cost and implement only a same-picture structural win: batching, culling, residency, pooling, compression, cadence, or admission. No default quality cuts."]
  ],
  "tooling-data-docs": [
    ["negative-test","Make one check prove it can fail","Choose a gate near this subject, mutate or fixture the protected invariant so it must go red, then harden the check if it passes its own negative test."],
    ["drift","Reconcile code/document drift","Verify a live descriptive claim against current code/tests and correct one stale route, owner, count, or status statement without turning documentation into a live status board."],
    ["manifest","Audit data/manifest parity","Cross-check canonical registries, manifests, generated maps, and runtime consumers; fix one orphan, duplicate, stale hash/count, unreachable record, or unsafely hand-maintained projection."],
    ["diagnostic","Improve a diagnostic at the failure boundary","Make one error/probe/check report the exact owner, identity, reason, and recovery-relevant state needed to debug a real failure without rerunning broad probes."],
    ["simplify","Simplify without behavior drift","Remove one duplicate helper, dead compatibility branch, repeated parser, or redundant mapping only after proving current reachability and preserving public behavior with focused tests."]
  ],
  "creative-expansion": [
    ["mission","Design and implement one compact mission","Create one replayable mission/contract using existing systems with a clear physical choice, failure mutation, and ordinary-route reachability. Prefer reuse over new frameworks."],
    ["encounter","Design and implement one encounter shape","Create one bounded encounter with readable roles, spatial intent, at least two player approaches, and a systemic consequence. Avoid HP inflation and bespoke parallel AI."],
    ["place","Add one authored world event or place behavior","Create one small world/site event using existing assets and owners so the location has a job and the player can interrupt, exploit, help, or worsen it."],
    ["npc-job","Add one NPC occupation/behavior variant","Create one job or behavior variant that moves real cargo/resources/attention through existing traffic/economy/AI seams and visibly reacts to interference."],
    ["aftermath","Add one aftermath chain","Create one bounded persistent aftermath from combat, theft, rescue, mining, law, or cargo loss that changes later traffic, opportunity, reputation, salvage, or mission state."]
  ]
};
const subjects = [1,2,3,4,5,6,7,8].flatMap(n => fs.readFileSync(path.join(BANK, `subjects/${String(n).padStart(2,'0')}.jsonl`), 'utf8').trim().split(/\n+/).filter(Boolean).map(line => JSON.parse(line)));
const tasks = [];
for (let si=0; si<subjects.length; si++) {
  const s=subjects[si];
  const facets=facetMap[s.lane];
  for (let fi=0; fi<5; fi++) {
    const [facet,label,instruction]=facets[fi];
    const num=si*5+fi+1;
    tasks.push({id:`JULES-${String(num).padStart(4,'0')}`,num,model:s.models[fi],lane:s.lane,priority:s.priority,risk:s.risk,collision:s.collision,title:`${s.title} — ${label}`,subject:s,facet,instruction});
  }
}
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => { const i=args.indexOf(f); return i>=0 ? args[i+1] : null; };
const intVal = (f,d) => { const v=Number(val(f)); return Number.isFinite(v)&&v>0?Math.floor(v):d; };
function fail(m){ console.error(`JULES BANK ERROR: ${m}`); process.exit(1); }
function validate(){
  if(subjects.length!==200) fail(`expected 200 subjects, got ${subjects.length}`);
  if(tasks.length!==1000) fail(`expected 1000 tasks, got ${tasks.length}`);
  if(new Set(tasks.map(t=>t.id)).size!==1000) fail('duplicate task ids');
  if(new Set(subjects.map(s=>s.collision)).size!==200) fail('collision keys are not unique');
  const flash=tasks.filter(t=>t.model==='flash').length, pro=tasks.filter(t=>t.model==='pro').length;
  if(flash!==700||pro!==300) fail(`expected 700 flash / 300 pro, got ${flash}/${pro}`);
  for(const [lane,facets] of Object.entries(facetMap)) if(facets.length!==5) fail(`${lane} does not have five facets`);
  for(let i=0;i<tasks.length;i++) if(tasks[i].num!==i+1) fail(`non-contiguous id at ${i}`);
  console.log('PASS: 1,000 tasks; 200 collision keys; 700 Flash / 300 Pro; contiguous JULES-0001..JULES-1000');
}
function stats(){ validate(); const lanes={}; for(const t of tasks) lanes[t.lane]=(lanes[t.lane]||0)+1; console.log(JSON.stringify({tasks:1000,subjects:200,models:{flash:700,pro:300},lanes},null,2)); }
function prompt(t){ const s=t.subject; return `SPACEFACE JULES TASK ${t.id}\nMODEL: ${t.model==='flash'?'Gemini 3.6 Flash':'Gemini 3.1 Pro'}\nLANE: ${t.lane}\nCOLLISION KEY: ${t.collision}\nRISK: ${t.risk}\n\nTITLE\n${t.title}\n\nPRIMARY SCOPE\n${s.paths.join('\n')}\n\nCONTEXT\n${s.context}\n\nDIRECTED OBJECTIVE\n${t.instruction}\n\nEXECUTION\n1. Start from current master and report its SHA. Read root AGENTS.md, the nearest nested AGENTS.md, docs/MODULE_MAP.md, and the scoped files. Verify the named path is still the live owner before editing.\n2. Characterize/reproduce current behavior before changing production. If the task is already satisfied, return NO_CHANGE with exact evidence; do not manufacture a PR.\n3. Implement the smallest coherent change inside this subject. Preserve deterministic sim, state.rng/state.simTime, single writers, save/Continue, Browser/Electron parity, accessibility, and authored visual quality.\n4. Do NOT edit CANONICAL_BUILD_MAP.md, design/program/roadmap/program-queue.json, design/program/NOW.md, design/program/jules/**, or test/*.expected.json. Do not add a parallel engine/AI/gameplay authority. Do not lower default quality or content density for performance.\n5. Run the narrowest direct proof, then one relevant existing check once. Suggested: ${s.checks.join(' ; ')||'nearest focused check'}. Never loop an unchanged failure fingerprint.\n6. Open at most one coherent PR. Keep unrelated findings out of the diff.\n\nDONE WHEN\n- The directed objective is demonstrated on the live owner or the task returns an evidence-backed NO_CHANGE.\n- The diff is bounded to the task and contains no unrelated cleanup.\n- The focused proof would fail if the repaired/covered invariant regressed.\n- The final report states RESULT: PR_READY|NO_CHANGE|BLOCKED, BASE SHA, FILES, PROOF, PLAYER/ARCHITECTURE RESULT, RESIDUAL RISK, and PR URL if created.\n\nLOCAL MERGE GATE\nA stronger local integrator must inspect the full diff, rebase/port onto current master, independently verify the claim, and may reject the PR even when Jules reports green.`; }
if(has('--validate')) { validate(); process.exit(0); }
if(has('--stats')) { stats(); process.exit(0); }
const id=val('--id');
if(id){ const t=tasks.find(x=>x.id===id.toUpperCase()); if(!t) fail(`unknown id ${id}`); console.log(has('--format')&&val('--format')==='json'?JSON.stringify(t,null,2):prompt(t)); process.exit(0); }
if(has('--next')){
  let pool=[...tasks]; const model=val('--model'); const lane=val('--lane'); const risk=val('--risk');
  if(model) pool=pool.filter(t=>t.model===model.toLowerCase().replace('gemini-3.6-flash','flash').replace('gemini-3.1-pro','pro'));
  if(lane) pool=pool.filter(t=>t.lane===lane); if(risk) pool=pool.filter(t=>t.risk===risk);
  const count=intVal('--count',1), seed=intVal('--seed',1);
  pool.sort((a,b)=>((a.num*1103515245+seed)>>>0)-((b.num*1103515245+seed)>>>0));
  const used=new Set(), picked=[];
  for(const t of pool){ if(used.has(t.collision)) continue; picked.push(t); used.add(t.collision); if(picked.length>=count) break; }
  const fmt=val('--format')||'ids';
  if(fmt==='prompt') console.log(picked.map(prompt).join('\n\n---\n\n')); else if(fmt==='json') console.log(JSON.stringify(picked,null,2)); else console.log(picked.map(t=>t.id).join('\n'));
  process.exit(0);
}
console.log('Usage: node scripts/jules-dispatch.mjs --validate | --stats | --id JULES-0001 [--format prompt|json] | --next [--model flash|pro] [--lane <lane>] [--count N] [--seed N] [--format ids|prompt|json]');
