#!/usr/bin/env node
// Fleet run 2026-10-20 — one build-map row through plan (Claude Opus 5.5) → implement
// (OpenCode DeepSeek v4.1 Flash) → review (Codex gpt-6.1-sol) → fix loop. Never commits.
// Usage: node design/program/agentic-run-oct20/lane.mjs <row> [--from=impl|review] [--rounds=3]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(RUN, '../../..');
const REL_RUN = 'design/program/agentic-run-oct20';
const row = String(process.argv[2] || '').replace(/^R/i, '');
if (!/^\d+$/.test(row)) { console.error('usage: lane.mjs <row>'); process.exit(2); }
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const FROM = arg('from', 'plan');
const ROUNDS = Number(arg('rounds', '3'));
const OUT = join(RUN, 'out', `R${row}`);
const REL_OUT = `${REL_RUN}/out/R${row}`;
mkdirSync(OUT, { recursive: true });

const CLAUDE_MODEL = process.env.FLEET_CLAUDE_MODEL || 'claude-opus-5-5';
const OPENCODE_MODEL = process.env.FLEET_OPENCODE_MODEL || 'opencode/deepseek-v4.1-flash-free';
const CODEX_MODEL = process.env.FLEET_CODEX_MODEL || 'gpt-6.1-sol';
const CODEX_JS = join(execFileSync('npm', ['root', '-g'], { shell: true, encoding: 'utf8' }).trim(), '@openai/codex/bin/codex.js');

const log = (m) => { const l = `[${new Date().toISOString()}] R${row} ${m}`; console.log(l); appendFileSync(join(OUT, 'lane.log'), l + '\n'); };

function run(cmd, args, { input, logFile, timeoutMin }) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd: REPO, shell: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    let out = '';
    const sink = (d) => { out += d; if (logFile) appendFileSync(logFile, d); };
    child.stdout.on('data', sink); child.stderr.on('data', sink);
    const t = setTimeout(() => { log(`timeout after ${timeoutMin} min: ${cmd}`); try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); } catch { child.kill('SIGKILL'); } }, timeoutMin * 60_000);
    child.on('close', (code) => { clearTimeout(t); res({ code, out }); });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}

function protectedPaths(ownFiles) {
  const own = new Set(ownFiles);
  const lines = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
  const paths = lines.map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop()).filter((p) => !p.startsWith(REL_RUN) && !own.has(p));
  const byDir = new Map();
  for (const p of paths) { const d = p.split('/').slice(0, -1).join('/'); byDir.set(d, [...(byDir.get(d) || []), p]); }
  const outL = [];
  for (const [d, ps] of byDir) outL.push(...(ps.length > 4 ? [`${d}/** (${ps.length} files)`] : ps));
  return outL;
}

const manifest = () => existsSync(join(OUT, 'files.txt'))
  ? readFileSync(join(OUT, 'files.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean)
  : [];

function writeDiff(files) {
  let patch = '';
  for (const f of files) {
    if (!existsSync(join(REPO, f))) { patch += `\n### ${f}: (missing on disk)\n`; continue; }
    let tracked = true;
    try { execFileSync('git', ['ls-files', '--error-unmatch', '--', f], { cwd: REPO, stdio: 'ignore' }); } catch { tracked = false; }
    try {
      patch += execFileSync('git', tracked ? ['diff', '--', f] : ['diff', '--no-index', '--', '/dev/null', f], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
    } catch (e) { patch += e.stdout || ''; }
  }
  writeFileSync(join(OUT, 'diff.patch'), patch);
  return patch;
}

const COMMON_LAW = `
LAW (binding; violating any of these fails the row):
- Repo law: root AGENTS.md, ARCHITECTURE.md, and the nearest nested AGENTS.md of every file you touch.
- Sim code: 60 Hz fixed timestep, XZ plane, state.rng / state.simTime only (no Math.random, no Date.now in sim), no Three.js imports in sim code.
- NEVER run mutating git commands (add, commit, stash, checkout, restore, reset, switch, branch, worktree, apply, rm, mv, clean). Read-only git (status, diff, log, show, grep) is fine.
- NEVER edit a file listed under PROTECTED below — it is another agent's in-flight work. If the plan needs one, work around it or stop and say so in the report.
- NEVER edit build_map.md, design/program/NOW.md, design/program/LANDED_REVIEW.md, design/program/DEMO_READINESS_2026-09-20.md, design/program/INFERENCE_IDEAS.md, any *.expected.json, package.json or package-lock.json.
- Never retune existing mass/thrust/weapon/dock/camera-governor numbers; never weaken or edit an existing test to make it pass.
- Stay inside the seam's files named in the plan. New focused test files under test/ are expected.
- Frontend files (src/ui/**, styles/**): minimal edits only, consistent with design/frontend/ORRERY.md; never hand-roll boxes.
- No browser, Electron, or GPU probes (another agent may hold the only GPU token on this host).`;

function planPrompt() {
  return `You are the PLANNER for build-map row ${row} of the SpaceFace repository (cwd). You are read-only: do not edit, create, or delete any file. Research, then output the plan as your final message (markdown). Your final message is saved verbatim as the plan another, less capable coding model will execute, so it must be concrete.

Find the row: in build_map.md the §N table row "| ${row} |", its seam in the §1C seam table (the "Files — one agent" cell is the write boundary), and its design record (search build_map.md for "row ${row})" — §31.3 / §31.5 / §31.6 / §32.4 / §32.7 hold the feeling, owners, done-when on seed 4242, and refuse list). Read the actual owner code before you plan.

The plan must contain, in this order:
1. GOAL — the row's player-visible outcome in two sentences.
2. ALREADY TRUE — what the code already does toward the done-when (cite file:function). Do not re-plan shipped work.
3. SCOPE THIS SITTING — a coherent, shippable slice that a strong engineer could finish in ~2 hours of focused work. Prefer a complete, wired, player-reachable slice of the done-when over a thin pass at all of it. Name what is explicitly deferred.
4. FILES — the exact files to edit or create (repo-relative), each with the specific functions/hunks to change. Every file must be inside the seam's write boundary or be a new test file. Never list a PROTECTED file.
5. STEPS — numbered, concrete edits (function names, data shapes, event names, constants with values), including how it is wired into the live game route (which system registers it, which event or tick drives it, which UI/audio surface the player perceives it through).
6. TEST — one new focused test file test/<name>.test.mjs: the exact cases and assertions on seed 4242 that prove the done-when items in scope, plus the existing focused test files to run that guard the touched owners (find them with grep).
7. RISKS — determinism, save compatibility (new state fields need serialize/deserialize defaults), and foreign-hunk hazards.
${COMMON_LAW}

PROTECTED (another agent's in-flight files — the plan must not touch these):
${protectedPaths([]).map((p) => `- ${p}`).join('\n')}
`;
}

function implPrompt() {
  return `You are the IMPLEMENTER for build-map row ${row} of the SpaceFace repository (cwd: the repo root).

1. Read the plan: ${REL_OUT}/plan.md. Implement SCOPE THIS SITTING completely — every STEP, wired into the live game route, not stubs, not TODOs, not text in place of behaviour.
2. Write the focused test named in the plan's TEST section. Run it with \`node --test <file>\` until it passes. Then run every existing focused test file the plan lists and fix any regression you caused.
3. Keep a manifest: write ${REL_OUT}/files.txt with every repo-relative path you created or modified (one per line, forward slashes). Keep it exact and current.
4. When finished, write ${REL_OUT}/report.md with: what changed (player terms), each done-when item in scope and the test assertion proving it, the exact test commands you ran with pass/fail counts, anything deferred, and one sentence a second reviewer should re-check.
Do not stop until the tests you wrote and the existing focused tests pass, or you have written in report.md exactly what blocks them.
${COMMON_LAW}

PROTECTED (never edit):
${protectedPaths(manifest()).map((p) => `- ${p}`).join('\n')}
`;
}

function fixPrompt(n) {
  return `You are the IMPLEMENTER for build-map row ${row} (SpaceFace repo, cwd = repo root), fixing review round ${n}.
Read the plan ${REL_OUT}/plan.md, your report ${REL_OUT}/report.md, and the review ${REL_OUT}/review-${n}.md. Fix EVERY finding marked BLOCKING or MAJOR, and the MINOR ones when cheap. Re-run the focused tests until they pass. Keep ${REL_OUT}/files.txt exact. Update ${REL_OUT}/report.md (append a "Round ${n} fixes" section naming each finding and how it was fixed, with test results).
${COMMON_LAW}

PROTECTED (never edit):
${protectedPaths(manifest()).map((p) => `- ${p}`).join('\n')}
`;
}

function reviewPrompt(n) {
  return `You are the REVIEWER (round ${n}) for build-map row ${row} of the SpaceFace repository (cwd). Do NOT create, edit, or delete any file — your final message is the review. You may read files and run read-only commands and \`node --test <file>\`.

Inputs: the plan ${REL_OUT}/plan.md; the implementer report ${REL_OUT}/report.md; the diff ${REL_OUT}/diff.patch (exactly the files in ${REL_OUT}/files.txt; new files appear as /dev/null diffs). The row and its done-when are in build_map.md (table row "| ${row} |" and the design record "row ${row})").

Judge:
1. Correctness — real bugs, crashes, wrong event names, unregistered systems, dead code paths the game never reaches, save/load breakage (new state without serialize/deserialize defaults), determinism breaks (Math.random / Date.now / wall time in sim, unordered iteration feeding sim).
2. Completeness against the plan's SCOPE THIS SITTING and the row's done-when items in scope — is it wired into the live player route, or only reachable from the test? Stubs, TODOs, placeholder text count as incomplete.
3. Tests — run the new focused test and at least the existing tests the plan lists. Report exact pass/fail counts. A test that only asserts its own fixture, or that cannot fail, is a finding.
4. Law — files outside the seam, edits to protected/shared files (build_map.md, NOW.md, LANDED_REVIEW.md, *.expected.json, package*.json), edited existing tests, retuned feel numbers, Three.js in sim.

Output format (exact):
VERDICT: PASS   — or —   VERDICT: FINDINGS
Then a numbered list; each item: [BLOCKING|MAJOR|MINOR] file:line — the problem — the concrete fix.
Then "TESTS:" with the commands you ran and their pass/fail counts.
PASS only when there is no BLOCKING or MAJOR item.`;
}

async function plan() {
  log(`plan: claude ${CLAUDE_MODEL}`);
  const r = await run('claude', ['-p', '--model', CLAUDE_MODEL, '--output-format', 'text', '--permission-mode', 'bypassPermissions', '--disallowedTools', 'Edit,Write,NotebookEdit'], { input: planPrompt(), logFile: join(OUT, 'plan.log'), timeoutMin: 40 });
  let text = r.out.trim();
  if (r.code !== 0 && /session limit|usage limit|rate limit/i.test(text)) {
    log(`claude limited — planner fallback: codex ${CODEX_MODEL}`);
    const file = join(OUT, 'plan.codex.md');
    await run('node', [CODEX_JS, 'exec', '-m', CODEX_MODEL, '-c', 'model_reasoning_effort=high', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-o', file, '-'], { input: planPrompt(), logFile: join(OUT, 'plan.codex.log'), timeoutMin: 40 });
    text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    if (text.length >= 400) text = `<!-- planner: codex ${CODEX_MODEL} (claude session-limited) -->\n${text}`;
    else { log(`plan FAILED (fallback) len=${text.length}`); return false; }
  } else if (r.code !== 0 || text.length < 400) { log(`plan FAILED code=${r.code} len=${text.length}`); return false; }
  writeFileSync(join(OUT, 'plan.md'), text + '\n');
  log('plan written');
  return true;
}

async function implement(prompt, tag) {
  writeFileSync(join(OUT, `${tag}.prompt.md`), prompt);
  log(`${tag}: opencode ${OPENCODE_MODEL}`);
  const msg = `"Read the file ${REL_OUT}/${tag}.prompt.md and carry out every instruction in it exactly and completely."`;
  const r = await run('opencode', ['run', '-m', OPENCODE_MODEL, '--auto', msg], { logFile: join(OUT, `${tag}.log`), timeoutMin: 120 });
  log(`${tag} exit=${r.code} files=${manifest().length}`);
  if (/API key has expired|rate limit|429|quota/i.test(r.out.slice(-4000))) log(`${tag} WARNING provider error in tail`);
  return manifest().length > 0;
}

async function review(n) {
  writeDiff(manifest());
  log(`review-${n}: codex ${CODEX_MODEL}`);
  const file = join(OUT, `review-${n}.md`);
  const r = await run('node', [CODEX_JS, 'exec', '-m', CODEX_MODEL, '-c', 'model_reasoning_effort=high', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-o', file, '-'], { input: reviewPrompt(n), logFile: join(OUT, `review-${n}.log`), timeoutMin: 45 });
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const verdict = /VERDICT:\s*PASS/i.test(text) ? 'PASS' : /VERDICT:\s*FINDINGS/i.test(text) ? 'FINDINGS' : 'NONE';
  log(`review-${n} exit=${r.code} verdict=${verdict}`);
  return verdict;
}

const status = (s, extra = {}) => { writeFileSync(join(OUT, 'status.json'), JSON.stringify({ row, status: s, files: manifest(), at: new Date().toISOString(), ...extra }, null, 2)); log(`STATUS ${s}`); };

(async () => {
  if (FROM === 'plan' || !existsSync(join(OUT, 'plan.md'))) { status('PLANNING'); if (!(await plan())) return status('PLAN-FAILED'); }
  if (FROM !== 'review') { status('IMPLEMENTING'); if (!(await implement(implPrompt(), 'impl'))) return status('IMPL-NO-FILES'); }
  for (let n = 1; n <= ROUNDS; n++) {
    status(`REVIEW-${n}`);
    let v = await review(n);
    if (v === 'NONE') v = await review(n);
    if (v === 'PASS') return status('REVIEW-PASS', { round: n });
    if (n === ROUNDS) return status('NEEDS-CONTROLLER', { round: n, verdict: v });
    status(`FIX-${n}`);
    await implement(fixPrompt(n), `fix-${n}`);
  }
})().catch((e) => { log(`CRASH ${e.stack}`); status('CRASH'); });
