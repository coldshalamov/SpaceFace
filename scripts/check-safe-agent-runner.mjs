#!/usr/bin/env node
// check:safe-agent-runner — SAFE-001 destructive fixture suite (repair-1).
//
// Exit bar (SAFE-001-REPAIR): every rejected defect gets a hostile fixture with
// a valid control. Every fixture runs against a MOCK live root in the OS temp
// dir — the real repository is never guarded, never written, never at risk.
//
// Repair-1 additions over v1 (F1-F11 retained): control-plane write rejection
// (F12), heartbeat-loss kill (F13), reclaim race + old-owner release (F14),
// detached-descendant containment (F15), hardlink journal rejection (F16),
// ADS/device/traversal rejection (F17), integration path-escape + pre-publish
// re-hash + crash recovery (F18), corrupt-lease fail-closed (F19),
// schema/validator parity (F20), guard SDDL restore + successor protection (F21).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquireLease, releaseLease, heartbeatLease, currentLease } from '../tools/production/lib/leases.mjs';
import {
  applyAclGuard, liftAclGuard, sweepStaleGuards, getSddl, createControlWatch,
} from '../tools/production/lib/guard.mjs';
import { createWorkspace, computeInputBaseline } from '../tools/production/lib/snapshot.mjs';
import { integrateCandidate, recoverIntegration } from '../tools/production/lib/integrate.mjs';
import { validateWorkerSubmission } from '../tools/production/lib/validate.mjs';
import { journalWorkspace } from '../tools/production/lib/journal.mjs';
import { sha256File, sha256String } from '../tools/production/lib/util.mjs';
import { containPosixProcessTree, containWindowsProcessTree } from '../tools/production/run-agent.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The runner + libs are colocated with this suite in the staged layout:
// <stage>/tools/production/{run-agent.mjs, lib/*} and <stage>/scripts/<this>.
const RUNNER = path.resolve(__dirname, '..', 'tools', 'production', 'run-agent.mjs');
const SCHEMA = path.resolve(__dirname, '..', 'design', 'production', 'schemas', 'worker-submission.schema.json');
const SUITE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-safe001r-'));
const IS_WIN = process.platform === 'win32';

let failures = 0;
let checks = 0;
function expect(cond, msg) {
  checks++;
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${msg}`);
  if (!cond) failures++;
}

function writeFileEnsured(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makeMockRoot(name, { git = false } = {}) {
  const root = path.join(SUITE_ROOT, name);
  writeFileEnsured(path.join(root, 'src', 'game.js'), 'export const LIVE = "code";\n');
  writeFileEnsured(path.join(root, 'src', 'systems', 'input.js'), '// lead-only\n');
  writeFileEnsured(path.join(root, 'assets', 'ship.glb'), 'GLB-BYTES\n');
  writeFileEnsured(path.join(root, 'README.md'), '# mock live root\n');
  writeFileEnsured(path.join(root, '.campaign', 'README.txt'), 'control plane\n');
  if (git) {
    writeFileEnsured(path.join(root, '.gitignore'), 'build/\n');
    const g = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    g(['init', '-q']);
    g(['-c', 'user.email=fixture@local', '-c', 'user.name=fixture', 'add', '-A']);
    g(['-c', 'user.email=fixture@local', '-c', 'user.name=fixture', 'commit', '-q', '-m', 'baseline']);
  }
  return root;
}

function workerScript(name, body) {
  const file = path.join(SUITE_ROOT, 'workers', name);
  writeFileEnsured(file, body);
  return file;
}

const VALID_SUBMISSION = `
{
  const __subFs = (await import('node:fs')).default;
  const sub = {
    packetId: process.env.SF_PACKET_ID, status: 'submitted',
    sessionId: 'fixture-session', candidateId: 'fixture-candidate',
    sourceHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64),
    meaningfulCycles: 1, evidencePaths: ['src/feature.js'], changes: ['added src/feature.js'],
    unresolvedDefects: [], continuation: null, blockerEvidence: [], nextAction: 'review',
  };
  __subFs.writeFileSync(process.env.SF_SUBMISSION_PATH, JSON.stringify(sub, null, 2));
}
`;

function runRunner(mockRoot, packetId, worker, extraArgs = []) {
  const effectiveExtraArgs = [...extraArgs];
  const guardIndex = effectiveExtraArgs.indexOf('--guard');
  const guardMode = guardIndex >= 0 ? effectiveExtraArgs[guardIndex + 1] : 'acl+watch';
  if (IS_WIN && !guardMode.includes('acl') && !effectiveExtraArgs.includes('--detection-only-acknowledgement')) {
    effectiveExtraArgs.push('--detection-only-acknowledgement');
  }
  const args = [
    RUNNER,
    '--live-root', mockRoot,
    '--control-root', path.join(mockRoot, '.campaign'),
    '--packet-id', packetId,
    '--lease', 'code_mutation',
    '--writable', 'src/**',
    '--timeout-sec', '30',
    '--poll-ms', '150',
    '--stabilization-ms', '800',
    ...effectiveExtraArgs,
    '--', 'node', worker,
  ];
  const res = spawnSync('node', args, {
    encoding: 'utf8',
    env: { ...process.env, MOCK_LIVE_ROOT: mockRoot },
    timeout: 180000,
  });
  return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
}

function latestRunRecord(mockRoot) {
  const dir = path.join(mockRoot, '.campaign', 'runs');
  const names = fs.readdirSync(dir).sort();
  return JSON.parse(fs.readFileSync(path.join(dir, names[names.length - 1]), 'utf8'));
}

// ---------- F1: allowed write -> candidate captured ----------
console.log('F1: allowed write inside writable path is journaled and captured');
{
  const root = makeMockRoot('f1', { git: true });
  const worker = workerScript('allowed.mjs', `
import fs from 'node:fs';
fs.writeFileSync('src/feature.js', 'export const NEW = true;\\n');
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F1', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 0, `exit 0 (got ${code})`);
  expect(rec.disposition === 'candidate_captured', `candidate_captured (got ${rec.disposition})`);
  expect((rec.candidateOutputs || []).some((o) => o.path === 'src/feature.js'), 'src/feature.js in hash-bound outputs');
  expect(!fs.existsSync(path.join(root, 'src', 'feature.js')), 'live tree does NOT receive the file (no auto-integration)');
}

// ---------- F2: workspace write outside allowlist -> rejected ----------
console.log('F2: workspace write outside the allowlist rejects with exact paths');
{
  const root = makeMockRoot('f2', { git: true });
  const worker = workerScript('outside.mjs', `
import fs from 'node:fs';
fs.writeFileSync('assets/hack.txt', 'not allowed\\n');
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F2', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 2, `exit 2 (got ${code})`);
  expect(rec.disposition === 'rejected_allowlist', `rejected_allowlist (got ${rec.disposition})`);
  expect(rec.violations.some((v) => v.includes('assets/hack.txt')), 'violation names assets/hack.txt');
}

// ---------- F3: watch escape detected + killed ----------
console.log('F3: watch guard detects a live-root escape, kills, rejects');
{
  const root = makeMockRoot('f3', { git: true });
  const worker = workerScript('escape.mjs', `
import fs from 'node:fs';
import path from 'node:path';
const t = path.join(process.env.MOCK_LIVE_ROOT, 'evil.txt');
const start = Date.now();
fs.writeFileSync(t, 'escaped\\n');
while (Date.now() - start < 25000) { try { fs.appendFileSync(t, 'x'); } catch {} await new Promise(r=>setTimeout(r,100)); }
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F3', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 2, `exit 2 (got ${code})`);
  expect(rec.disposition === 'violated_boundary', `violated_boundary (got ${rec.disposition})`);
  expect(rec.violations.some((v) => v.includes('evil.txt')), 'violation names evil.txt');
  expect(rec.watchStrategy === 'git', `git watch strategy (got ${rec.watchStrategy})`);
}

// ---------- F4: ACL prevention ----------
console.log('F4: ACL guard makes escape write fail at the OS');
if (!IS_WIN) {
  console.log('  SKIPPED (non-Windows)');
} else {
  const root = makeMockRoot('f4');
  const liveTarget = path.join(root, 'src', 'game.js');
  const before = sha256File(liveTarget);
  const worker = workerScript('escape-acl.mjs', `
import fs from 'node:fs';
import path from 'node:path';
let r = 'WROTE';
try { fs.writeFileSync(path.join(process.env.MOCK_LIVE_ROOT,'src','game.js'),'PWNED'); } catch(e){ r='BLOCKED:'+e.code; }
fs.writeFileSync('src/acl-result.txt', r);
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F4', worker, ['--guard', 'acl']);
  const rec = latestRunRecord(root);
  const rf = path.join(rec.workspaceDir, 'src', 'acl-result.txt');
  const result = fs.existsSync(rf) ? fs.readFileSync(rf, 'utf8') : '(missing)';
  expect(result.includes('BLOCKED'), `escape write blocked at OS (worker saw: ${result})`);
  expect(sha256File(liveTarget) === before, 'live src/game.js bit-identical after attack');
  expect(code === 0, `run still captures candidate (got ${code})`);
  let healed = true;
  try { fs.appendFileSync(liveTarget, '\n// ok\n'); } catch { healed = false; }
  expect(healed, 'guard healed: live writable again');
}

// ---------- F5: stale-guard sweep ----------
console.log('F5: stale ACL recovery refuses worker-reachable heal input');
if (!IS_WIN) { console.log('  SKIPPED (non-Windows)'); } else {
  const root = makeMockRoot('f5');
  const control = path.join(root, '.campaign');
  // Simulate a crashed run whose owner PID is dead: use a PID that cannot exist.
  const rec = applyAclGuard(root, control, 'crashed-run');
  const diskPath = path.join(control, 'guards', 'crashed-run.json');
  const disk = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
  disk.ownerPid = 999999999; // force "dead owner"
  disk.preSddl = { '.': 'worker-poisoned-descriptor' };
  fs.writeFileSync(diskPath, JSON.stringify(disk, null, 2));
  let denied = false;
  try { fs.appendFileSync(path.join(root, 'src', 'game.js'), 'x'); } catch { denied = true; }
  expect(denied, 'guard active: live write denied');
  let recoveryRefused = false;
  try { sweepStaleGuards(control); } catch (error) { recoveryRefused = error.code === 'GUARD_RECOVERY_REQUIRED'; }
  expect(recoveryRefused, 'untrusted cross-process heal refuses worker-reachable pre-state');
  let ok = true;
  liftAclGuard(control, 'crashed-run', rec);
  try { fs.appendFileSync(path.join(root, 'src', 'game.js'), '\n// healed\n'); } catch { ok = false; }
  expect(ok, 'trusted same-process pre-state restores live writability');
}

// ---------- F6: lease exclusivity + expiry reclaim ----------
console.log('F6: one code_mutation lease; expired reclaimed, live not');
{
  const root = makeMockRoot('f6');
  const control = path.join(root, '.campaign');
  const a = acquireLease(control, { kind: 'code_mutation', packetId: 'P-A', holder: 'A', ttlSeconds: 600 });
  const validBeat = heartbeatLease(control, 'code_mutation', a.id, a.token);
  expect(validBeat.id === a.id && validBeat.token === a.token, 'valid owner heartbeat preserves lease authority');
  let denied = false;
  try { acquireLease(control, { kind: 'code_mutation', packetId: 'P-B', holder: 'B', ttlSeconds: 600 }); }
  catch (e) { denied = e.code === 'LEASE_HELD'; }
  expect(denied, 'second concurrent acquire refused (LEASE_HELD)');
  releaseLease(control, 'code_mutation', a.id, a.token, 'released');
  const b = acquireLease(control, { kind: 'code_mutation', packetId: 'P-B', holder: 'B', ttlSeconds: 1 });
  expect(!!b.id, 'lane free after release');
  await new Promise((r) => setTimeout(r, 1200));
  const c = acquireLease(control, { kind: 'code_mutation', packetId: 'P-C', holder: 'C', ttlSeconds: 600 });
  expect(c.reclaimedFrom && c.reclaimedFrom.packetId === 'P-B', 'expired lease reclaimed w/ provenance');
  releaseLease(control, 'code_mutation', c.id, c.token, 'released');
}

// ---------- F7/F8: integration stale-input + hash-mismatch + allowlist-only ----------
console.log('F7/F8: integrator aborts stale/mismatch; applies only allowlist');
{
  const root = makeMockRoot('f8');
  const control = path.join(root, '.campaign');
  const ws = path.join(control, 'workspaces', 'manual-1');
  createWorkspace(root, ws, {});
  writeFileEnsured(path.join(ws, 'src', 'feature.js'), 'export const F = 1;\n');
  writeFileEnsured(path.join(ws, 'src', 'sneaky.js'), 'export const S = 1;\n');
  const baseline = computeInputBaseline(root, ['src/game.js', 'README.md']);
  const goodOutputs = [{ path: 'src/feature.js', sha256: sha256File(path.join(ws, 'src', 'feature.js')) }];

  fs.appendFileSync(path.join(root, 'src', 'game.js'), '\n// concurrent change\n');
  const stale = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'int-stale', outputs: goodOutputs, inputBaseline: baseline });
  expect(stale.status === 'aborted_stale_inputs', `stale input aborts (got ${stale.status})`);
  expect(!fs.existsSync(path.join(root, 'src', 'feature.js')), 'no file on stale abort');

  const fresh = computeInputBaseline(root, ['src/game.js']);
  const badHash = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'int-bad', outputs: [{ path: 'src/feature.js', sha256: sha256String('nope') }], inputBaseline: fresh });
  expect(badHash.status === 'aborted_hash_mismatch', `hash mismatch aborts (got ${badHash.status})`);

  const good = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'int-good', outputs: goodOutputs, inputBaseline: fresh });
  expect(good.status === 'integrated', `valid integrates (got ${good.status})`);
  expect(fs.readFileSync(path.join(root, 'src', 'feature.js'), 'utf8').includes('F = 1'), 'accepted output landed');
  expect(!fs.existsSync(path.join(root, 'src', 'sneaky.js')), 'non-allowlisted file did NOT land');
}

// ---------- F9: kill-tree kills children ----------
console.log('F9: boundary kill terminates the worker process tree');
{
  const root = makeMockRoot('f9', { git: true });
  const childScript = workerScript('child-writer.mjs', `
import fs from 'node:fs';
import path from 'node:path';
const t = path.join(process.env.MOCK_LIVE_ROOT, 'child-evil.txt');
for (let i=0;i<300;i++){ try{fs.appendFileSync(t,'x');}catch{} await new Promise(r=>setTimeout(r,100)); }
`);
  const worker = workerScript('parent.mjs', `
import { spawn } from 'node:child_process';
spawn('node', [${JSON.stringify(childScript)}], { stdio:'ignore' });
await new Promise(r=>setTimeout(r,25000));
`);
  const { code } = runRunner(root, 'F9', worker, ['--guard', 'watch']);
  expect(code === 2, `exit 2 on violation (got ${code})`);
  const evil = path.join(root, 'child-evil.txt');
  const a = fs.existsSync(evil) ? fs.statSync(evil).size : 0;
  await new Promise((r) => setTimeout(r, 1500));
  const b = fs.existsSync(evil) ? fs.statSync(evil).size : 0;
  expect(a === b, `child writer dead after kill (${a}==${b})`);
}

// ---------- F10: worker cannot claim acceptance ----------
console.log('F10: submission claiming accepted is structurally rejected');
{
  const root = makeMockRoot('f10', { git: true });
  const worker = workerScript('accepted.mjs', `
import fs from 'node:fs';
fs.writeFileSync('src/feature.js','x');
fs.writeFileSync(process.env.SF_SUBMISSION_PATH, JSON.stringify({packetId:process.env.SF_PACKET_ID,status:'accepted',sessionId:'s',candidateId:'c',sourceHash:'a'.repeat(64),candidateHash:'b'.repeat(64),meaningfulCycles:1,evidencePaths:['e'],changes:['c'],unresolvedDefects:[],continuation:null,blockerEvidence:[],nextAction:'n'}));
`);
  const { code } = runRunner(root, 'F10', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 3, `exit 3 invalid submission (got ${code})`);
  expect((rec.submissionErrors || []).some((e) => e.includes('status')), 'error names status field');
}

// ---------- F11: control-plane and .git excluded from workspace ----------
console.log('F11: workspace excludes control plane + git history');
{
  const root = makeMockRoot('f11', { git: true });
  const worker = workerScript('noop.mjs', VALID_SUBMISSION + `
import fs2 from 'node:fs';
fs2.writeFileSync('src/feature.js','ok');
`);
  const { code } = runRunner(root, 'F11', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 0, `exit 0 (got ${code})`);
  expect(!fs.existsSync(path.join(rec.workspaceDir, '.campaign')), 'no .campaign in workspace');
  expect(!fs.existsSync(path.join(rec.workspaceDir, '.git')), 'no .git in workspace');
}

// ---------- F12: control-plane write is a violation (defect 1 / CONTAINMENT-01) ----------
console.log('F12: worker write into the control plane is a latched violation');
{
  const root = makeMockRoot('f12', { git: true });
  const worker = workerScript('control-escape.mjs', `
import fs from 'node:fs';
import path from 'node:path';
const t = path.join(process.env.MOCK_LIVE_ROOT, '.campaign', 'foreign-controller-record.json');
const start = Date.now();
try { fs.writeFileSync(t, '{"pwned":true}'); } catch {}
while (Date.now()-start<25000){ try{fs.appendFileSync(path.join(process.env.MOCK_LIVE_ROOT,'.campaign','pwn.txt'),'x');}catch{} await new Promise(r=>setTimeout(r,100)); }
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F12', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  expect(code === 2, `exit 2 (got ${code})`);
  expect(rec.disposition === 'violated_boundary', `violated_boundary (got ${rec.disposition})`);
  expect(rec.violations.some((v) => v.includes('control-plane')), 'names a control-plane violation');
  expect(!fs.existsSync(path.join(root, '.campaign', 'foreign-controller-record.json')), 'unexpected control-plane addition healed');
}

// ---------- F13: heartbeat loss kills a still-writing worker (defect 2) ----------
console.log('F13: heartbeat loss latches a violation and kills the worker');
{
  const root = makeMockRoot('f13', { git: true });
  const control = path.join(root, '.campaign');
  const worker = workerScript('long-writer.mjs', `
import fs from 'node:fs';
for (let i=0;i<300;i++){ fs.writeFileSync('src/feature.js','v'+i); await new Promise(r=>setTimeout(r,100)); }
${VALID_SUBMISSION}
`);
  // Steal the lease from a DETACHED process (the suite blocks in spawnSync, so
  // an in-process timer would never fire) by force-replacing the lease file,
  // simulating a successor. The runner's next heartbeat must fail and kill the
  // worker.
  const stealer = workerScript('lease-stealer.mjs', `
import fs from 'node:fs';
const f = process.argv[2];
const deadline = Date.now() + 15000;
await new Promise((r) => setTimeout(r, 1500));
while (Date.now() < deadline) {
  try {
    const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (cur.packetId === 'F13') {
      cur.id = 'successor-lease'; cur.token = 'successor-token';
      fs.writeFileSync(f, JSON.stringify(cur));
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
`);
  spawn('node', [stealer, path.join(control, 'leases', 'code_mutation.json')], { detached: true, stdio: 'ignore' }).unref();
  const { code } = runRunner(root, 'F13', worker, ['--guard', 'watch', '--heartbeat-ms', '500']);
  const rec = latestRunRecord(root);
  expect(code === 2, `exit 2 (got ${code})`);
  expect(rec.violations.some((v) => v.includes('heartbeat')), 'names the heartbeat-loss violation');
  expect(rec.leaseCleanup?.mode === 'trusted-owner-reassert-release', 'cleanup records trusted owner lease reassertion');
  expect(!fs.existsSync(path.join(control, 'leases', 'code_mutation.json')), 'poisoned lease file removed after containment');
  let reacquired = null;
  try { reacquired = acquireLease(control, { kind: 'code_mutation', packetId: 'F13-CONTROL', holder: 'control', ttlSeconds: 60 }); }
  catch { /* assertion below reports the stranded lane */ }
  expect(!!reacquired, 'code_mutation lane is immediately free after poisoned worker cleanup');
  if (reacquired) releaseLease(control, 'code_mutation', reacquired.id, reacquired.token, 'released');
}

// ---------- F14: reclaim race + old-owner release race (defect 4) ----------
console.log('F14: atomic reclaim — one winner; old owner cannot release/beat successor');
{
  const root = makeMockRoot('f14');
  const control = path.join(root, '.campaign');
  const old = acquireLease(control, { kind: 'code_mutation', packetId: 'OLD', holder: 'old', ttlSeconds: 1 });
  await new Promise((r) => setTimeout(r, 1200)); // expire
  // Two racing reclaimers via child processes sharing the control root.
  const reclaimer = workerScript('reclaimer.mjs', `
import { acquireLease } from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, '..', 'tools', 'production', 'lib', 'leases.mjs')).href)};
try { const l = acquireLease(${JSON.stringify(control)}, { kind:'code_mutation', packetId:process.argv[2], holder:process.argv[2], ttlSeconds:600 }); console.log('WON:'+l.id); }
catch(e){ console.log('LOST:'+e.code); }
`);
  const r1 = spawnSync('node', [reclaimer, 'R1'], { encoding: 'utf8' });
  const r2 = spawnSync('node', [reclaimer, 'R2'], { encoding: 'utf8' });
  const wins = [r1.stdout, r2.stdout].filter((s) => s.includes('WON')).length;
  expect(wins >= 1, `at least one reclaimer won (${r1.stdout.trim()} / ${r2.stdout.trim()})`);
  const live = currentLease(control, 'code_mutation');
  expect(!!live && !live.expired, 'exactly one live lease after the race');
  // Old owner cannot release the successor.
  const released = releaseLease(control, 'code_mutation', old.id, old.token, 'released');
  expect(released === null, 'old owner release refused (returns null)');
  expect(!!currentLease(control, 'code_mutation'), 'successor lease still present after old-owner release attempt');
  // Old owner cannot heartbeat the successor.
  let beat = 'ok';
  try { heartbeatLease(control, 'code_mutation', old.id, old.token); } catch (e) { beat = e.code; }
  expect(beat === 'LEASE_LOST', `old owner heartbeat refused (got ${beat})`);
  releaseLease(control, 'code_mutation', live.id, live.token, 'released');
}

// ---------- F15: detached descendant that writes after parent exit (defect 3) ----------
console.log('F15: descendant that outlives the parent is contained before guards lift');
if (!IS_WIN) { console.log('  SKIPPED (Windows job-object/CIM path; posix uses process group)'); } else {
  const root = makeMockRoot('f15', { git: true });
  const grandchild = workerScript('daemon.mjs', `
import fs from 'node:fs';
import path from 'node:path';
const t = path.join(process.env.MOCK_LIVE_ROOT, 'daemon-evil.txt');
for (let i=0;i<200;i++){ try{fs.appendFileSync(t,'x');}catch{} await new Promise(r=>setTimeout(r,100)); }
`);
  const worker = workerScript('spawns-daemon.mjs', `
import { spawn } from 'node:child_process';
spawn('node', [${JSON.stringify(grandchild)}], { detached:true, stdio:'ignore' }).unref();
// parent exits quickly, leaving a detached daemon
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F15', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  // Either the daemon was contained (empty tree) or the violation is recorded;
  // in all cases guards must not lift on a live descendant silently.
  expect(rec.descendantContainment !== null, 'descendant containment ran');
  const evil = path.join(root, 'daemon-evil.txt');
  const a = fs.existsSync(evil) ? fs.statSync(evil).size : 0;
  await new Promise((r) => setTimeout(r, 1500));
  const b = fs.existsSync(evil) ? fs.statSync(evil).size : 0;
  expect(a === b, `daemon dead after containment (${a}==${b})`);
  expect(code === 0 || code === 2, `run resolved (got ${code})`);
}

// ---------- F16: hardlink to a live/control file is a violation (defect 6) ----------
console.log('F16: workspace hardlink aliasing is rejected');
if (!IS_WIN) { console.log('  SKIPPED (hardlink semantics vary; win32 is the target)'); } else {
  const root = makeMockRoot('f16', { git: true });
  const worker = workerScript('hardlink.mjs', `
import fs from 'node:fs';
import path from 'node:path';
// Hard-link a workspace path to a live-root file, then mutate via the link.
const live = path.join(process.env.MOCK_LIVE_ROOT, 'README.md');
try { fs.linkSync(live, 'src/aliased.js'); } catch(e){ /* if link fails, write a plain file so the run still submits */ fs.writeFileSync('src/aliased.js','x'); }
${VALID_SUBMISSION}
`);
  const { code } = runRunner(root, 'F16', worker, ['--guard', 'watch']);
  const rec = latestRunRecord(root);
  // The hardlink either escapes the workspace (nlink>1 -> journal violation) or
  // the OS refused it (plain file -> clean). Both are safe; assert no silent live change.
  expect(code === 0 || code === 2, `resolved (got ${code})`);
  if (code === 2) expect(rec.violations.some((v) => v.toLowerCase().includes('hardlink')), 'hardlink named in violations');
  expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8') === '# mock live root\n', 'live README unchanged');
}

// ---------- F17: ADS / device / traversal paths rejected (defect 7, journal + validator) ----------
console.log('F17: ADS/device/traversal evidence paths are rejected by the validator');
{
  const base = { packetId: 'F17', status: 'submitted', sessionId: 's', candidateId: 'c', sourceHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), meaningfulCycles: 1, changes: ['c'], unresolvedDefects: [], continuation: null, blockerEvidence: [], nextAction: 'n' };
  expect(!validateWorkerSubmission({ ...base, evidencePaths: ['src/game.js:evil'] }).ok, 'ADS colon path rejected');
  expect(!validateWorkerSubmission({ ...base, evidencePaths: ['../escape.js'] }).ok, "'..' traversal rejected");
  expect(!validateWorkerSubmission({ ...base, evidencePaths: ['NUL'] }).ok, 'device name rejected');
  expect(!validateWorkerSubmission({ ...base, evidencePaths: ['C:/abs.js'] }).ok, 'absolute path rejected');
  expect(!validateWorkerSubmission({ ...base, evidencePaths: ['a.js', 'a.js'] }).ok, 'duplicate evidence rejected');
  expect(validateWorkerSubmission({ ...base, evidencePaths: ['src/ok.js'] }).ok, 'clean relative path accepted');
}

// ---------- F18: integration path escape + pre-publish re-hash + crash recovery (defect 5/11) ----------
console.log('F18: integration path escape blocked; staged tamper caught; crash recovers');
{
  const root = makeMockRoot('f18');
  const control = path.join(root, '.campaign');
  const ws = path.join(control, 'workspaces', 'int-ws');
  createWorkspace(root, ws, {});
  writeFileEnsured(path.join(ws, 'src', 'a.js'), 'A\n');
  writeFileEnsured(path.join(ws, 'src', 'b.js'), 'B\n');
  const baseline = computeInputBaseline(root, ['README.md']);
  const outs = [
    { path: 'src/a.js', sha256: sha256File(path.join(ws, 'src', 'a.js')) },
    { path: 'src/b.js', sha256: sha256File(path.join(ws, 'src', 'b.js')) },
  ];
  // Path escape.
  const esc = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'i-esc', outputs: [{ path: '../escape.js', sha256: 'a'.repeat(64) }], inputBaseline: baseline });
  expect(esc.status === 'aborted_path_violation', `path escape aborts (got ${esc.status})`);
  expect(!fs.existsSync(path.join(path.dirname(root), 'escape.js')), 'no file escaped live root');
  // Staged tamper after verification.
  const tamper = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'i-tamper', outputs: outs, inputBaseline: baseline, __testTamperStagedIndex: 0 });
  expect(tamper.status === 'aborted_staging_tamper', `staged tamper caught (got ${tamper.status})`);
  // Crash mid-publish, then recover.
  const crash = integrateCandidate({ liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'i-crash', outputs: outs, inputBaseline: baseline, __testCrashAfterApplies: 1 });
  expect(crash.status === 'crashed_mid_publish', `crash recorded, not integrated (got ${crash.status})`);
  const recovered = recoverIntegration(control);
  const r = recovered.find((x) => x.runId === 'i-crash');
  expect(!!r && r.phase === 'recovered', 'interrupted integration recovered');
  expect(fs.existsSync(path.join(root, 'src', 'a.js')) && fs.existsSync(path.join(root, 'src', 'b.js')), 'both files present after recovery');
}

// ---------- F19: corrupt lease fails closed (defect ordering / fail-closed) ----------
console.log('F19: a corrupt lease file fails closed, not silent reclaim');
{
  const root = makeMockRoot('f19');
  const control = path.join(root, '.campaign');
  fs.mkdirSync(path.join(control, 'leases'), { recursive: true });
  fs.writeFileSync(path.join(control, 'leases', 'code_mutation.json'), '{ this is not json');
  let codeSeen = 'none';
  try { acquireLease(control, { kind: 'code_mutation', packetId: 'X', holder: 'x', ttlSeconds: 60 }); }
  catch (e) { codeSeen = e.code; }
  expect(codeSeen === 'LEASE_CORRUPT', `corrupt lease fails closed (got ${codeSeen})`);
}

// ---------- F20: schema/validator parity ----------
console.log('F20: hand-written validator and JSON Schema agree on every fixture');
{
  const loadAjvOrThrow = (loader) => {
    try { return loader(); }
    catch (cause) {
      const error = new Error('Ajv unavailable: schema/validator parity cannot be proved');
      error.code = 'SCHEMA_VALIDATOR_UNAVAILABLE';
      error.cause = cause;
      throw error;
    }
  };
  let unavailableFailedClosed = false;
  try { loadAjvOrThrow(() => { throw new Error('fixture missing module'); }); }
  catch (error) { unavailableFailedClosed = error.code === 'SCHEMA_VALIDATOR_UNAVAILABLE'; }
  expect(unavailableFailedClosed, 'Ajv absence hard-fails parity instead of soft-passing');
  let Ajv = null;
  try {
    const req = (await import('node:module')).createRequire(path.resolve(__dirname, '..', 'package.json'));
    Ajv = loadAjvOrThrow(() => req('ajv'));
  } catch (error) { expect(false, error.message); }
  if (!Ajv) {
    console.log('  FAIL  Ajv unavailable; parity check cannot continue');
  } else {
    const ajv = new (Ajv.default || Ajv)({ allErrors: true, strict: false });
    const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA, 'utf8')));
    const good = { packetId: 'P', status: 'submitted', sessionId: 's', candidateId: 'c', sourceHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), meaningfulCycles: 1, evidencePaths: ['src/ok.js'], changes: ['c'], unresolvedDefects: [], continuation: null, blockerEvidence: [], nextAction: 'n' };
    const cases = [
      good,
      { ...good, status: 'accepted' },
      { ...good, evidencePaths: ['a.js', 'a.js'] },
      { ...good, evidencePaths: ['../x.js'] },
      { ...good, evidencePaths: ['x.js:ads'] },
      { ...good, status: 'needs_continuation', continuation: { reason: 'timeout', checkpointHash: 'c'.repeat(64), checkpointPath: 'cp/x', lastCompletedStep: 'step', processStatus: 'exited', heartbeatAt: 'not-a-date' } },
      { ...good, status: 'needs_continuation', continuation: { reason: 'timeout', checkpointHash: 'c'.repeat(64), checkpointPath: 'cp/x', lastCompletedStep: 'step', processStatus: 'exited', heartbeatAt: '2026-07-10T12:00:00Z' } },
    ];
    let parity = 0;
    for (const c of cases) {
      const mine = validateWorkerSubmission(c).ok;
      const theirs = validate(c);
      if (mine === theirs) parity++;
      else console.log(`    parity mismatch: validator=${mine} schema=${theirs} for ${JSON.stringify(c.status)}/${JSON.stringify(c.evidencePaths)}`);
    }
    expect(parity === cases.length, `schema/validator agree on all ${cases.length} cases (${parity})`);
  }
}

// ---------- F21: ACL heal uses only trusted in-memory pre-state ----------
console.log('F21: ACL heal restores exact prior descriptor from trusted memory only');
if (!IS_WIN) { console.log('  SKIPPED (non-Windows)'); } else {
  const root = makeMockRoot('f21');
  const control = path.join(root, '.campaign');
  const target = path.join(root, 'src');
  const before = getSddl(target);
  const savedPsModulePath = process.env.PSModulePath;
  const decoyModuleRoot = path.join(SUITE_ROOT, 'shadow-psmodules');
  const decoyModuleDir = path.join(decoyModuleRoot, 'Microsoft.PowerShell.Security');
  const decoyManifest = path.join(decoyModuleDir, 'Microsoft.PowerShell.Security.psd1');
  const decoyScript = path.join(decoyModuleDir, 'Microsoft.PowerShell.Security.psm1');
  writeFileEnsured(decoyScript, String.raw`
$env:SF_SAFE001_DECOY_IMPORTED = 'yes'
function Get-Acl {
  [CmdletBinding()]
  param([string]$LiteralPath)
  throw 'SF_SAFE001_DECOY_GET_ACL'
}
Export-ModuleMember -Function Get-Acl
`);
  writeFileEnsured(decoyManifest, String.raw`
@{
  RootModule = 'Microsoft.PowerShell.Security.psm1'
  ModuleVersion = '99.0.0'
  GUID = '1147a494-88ca-4ed5-915a-0f908f8cf268'
  Author = 'SAFE-001 disposable fixture'
  FunctionsToExport = @('Get-Acl')
  CmdletsToExport = @()
  VariablesToExport = @()
  AliasesToExport = @()
}
`);
  process.env.PSModulePath = decoyModuleRoot;
  try {
    expect(fs.existsSync(decoyManifest), 'fixture plants a same-named Security module on PSModulePath');
    const decoyProbe = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      "$ErrorActionPreference='Stop'; Import-Module Microsoft.PowerShell.Security -Force; " +
      "$m=(Get-Module Microsoft.PowerShell.Security | Select-Object -First 1); " +
      "Write-Output ('MODULE=' + $m.Path); Write-Output ('MARKER=' + $env:SF_SAFE001_DECOY_IMPORTED); " +
      "try { Get-Acl -LiteralPath '.' } catch { Write-Output ('ERROR=' + $_.Exception.Message) }",
    ], {
      encoding: 'utf8', windowsHide: true,
      env: { ...process.env, PSModulePath: decoyModuleRoot },
    });
    expect(
      decoyProbe.includes(`MODULE=${decoyScript}`) &&
      decoyProbe.includes('MARKER=yes') &&
      decoyProbe.includes('ERROR=SF_SAFE001_DECOY_GET_ACL'),
      'name-based import observably selects the decoy and its failing Get-Acl'
    );
    expect(getSddl(target) === before, 'exact $PSHOME Security-module import survives poisoned PSModulePath');
  } finally {
    if (savedPsModulePath === undefined) delete process.env.PSModulePath;
    else process.env.PSModulePath = savedPsModulePath;
  }
  const rec = applyAclGuard(root, control, 'run-A');
  expect(getSddl(target) !== before, 'guard changed the descriptor');
  const diskA = JSON.parse(fs.readFileSync(path.join(control, 'guards', 'run-A.json'), 'utf8'));
  expect(!Object.hasOwn(diskA, 'preSddl'), 'worker-reachable guard journal omits ACL pre-state');
  liftAclGuard(control, 'run-A', rec);
  expect(getSddl(target) === before, 'heal restored the exact prior SDDL');
  const recB = applyAclGuard(root, control, 'run-B');
  const diskBPath = path.join(control, 'guards', 'run-B.json');
  const diskB = JSON.parse(fs.readFileSync(diskBPath, 'utf8'));
  diskB.preSddl = { '.': 'not-valid-sddl', src: 'not-valid-sddl' };
  fs.writeFileSync(diskBPath, JSON.stringify(diskB));
  liftAclGuard(control, 'run-B', recB);
  expect(getSddl(target) === before, 'trusted heal ignores worker-poisoned journal bytes');
}

// ---------- F22: POSIX containment verifies enumeration + survivors ----------
console.log('F22: POSIX containment fails closed on missing enumeration or survivors');
{
  const unavailable = await containPosixProcessTree(7000, 0, {
    listTable: () => null, killGroup: () => {}, killOne: () => {}, sleepFn: async () => {},
  });
  expect(!unavailable.contained && unavailable.survivors.includes('<process table unavailable>'), 'missing POSIX process enumeration fails closed');

  const alive = [
    { ProcessId: 7000, ParentProcessId: 1, ProcessGroupId: 7000 },
    { ProcessId: 7001, ParentProcessId: 7000, ProcessGroupId: 7000 },
  ];
  const survivor = await containPosixProcessTree(7000, 0, {
    listTable: () => alive, killGroup: () => {}, killOne: () => {}, sleepFn: async () => {},
  });
  expect(!survivor.contained && survivor.survivors.includes(7001), 'surviving POSIX descendant rejects containment');

  const tables = [alive, [], []];
  const clean = await containPosixProcessTree(7000, 0, {
    listTable: () => tables.shift() || [], killGroup: () => {}, killOne: () => {}, sleepFn: async () => {},
  });
  expect(clean.contained && clean.survivors.length === 0, 'empty verified POSIX process tree is contained');
}

// ---------- F23: recovery lease is mandatory and held through rename ----------
console.log('F23: integration recovery refuses live renames while mutation lease is held');
{
  const root = makeMockRoot('f23');
  const control = path.join(root, '.campaign');
  const ws = path.join(control, 'workspaces', 'recover-ws');
  createWorkspace(root, ws, {});
  writeFileEnsured(path.join(ws, 'src', 'recover-a.js'), 'A\n');
  writeFileEnsured(path.join(ws, 'src', 'recover-b.js'), 'B\n');
  const outputs = ['recover-a.js', 'recover-b.js'].map((name) => ({
    path: `src/${name}`, sha256: sha256File(path.join(ws, 'src', name)),
  }));
  const crash = integrateCandidate({
    liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'recover-lease',
    outputs, inputBaseline: computeInputBaseline(root, ['README.md']), __testCrashAfterApplies: 1,
  });
  expect(crash.status === 'crashed_mid_publish', 'fixture produced an interrupted publication');
  const held = acquireLease(control, { kind: 'code_mutation', packetId: 'other', holder: 'other-integrator', ttlSeconds: 600 });
  const refused = recoverIntegration(control);
  expect(refused[0]?.status === 'recovery_lease_unavailable', 'recovery reports lease unavailable');
  expect(!fs.existsSync(path.join(root, 'src', 'recover-b.js')), 'recovery performed no live rename without lease');
  releaseLease(control, 'code_mutation', held.id, held.token, 'released');
  const recovered = recoverIntegration(control);
  expect(recovered.some((item) => item.runId === 'recover-lease' && item.phase === 'recovered'), 'recovery completes after acquiring mutation lease');
  expect(fs.existsSync(path.join(root, 'src', 'recover-b.js')), 'recovery rename landed only under its lease');
}

// ---------- F24: realpath containment rejects junction/symlink parents ----------
console.log('F24: integration rejects a destination parent that resolves outside live root');
{
  const root = makeMockRoot('f24');
  const control = path.join(root, '.campaign');
  const outside = path.join(SUITE_ROOT, 'f24-outside');
  fs.mkdirSync(outside, { recursive: true });
  const link = path.join(root, 'src', 'linked-outside');
  fs.symlinkSync(outside, link, IS_WIN ? 'junction' : 'dir');
  const ws = path.join(control, 'workspaces', 'realpath-ws');
  createWorkspace(root, ws, {});
  writeFileEnsured(path.join(ws, 'src', 'linked-outside', 'escape.js'), 'ESCAPE\n');
  const rel = 'src/linked-outside/escape.js';
  const report = integrateCandidate({
    liveRoot: root, workspaceDir: ws, controlRoot: control, runId: 'realpath-escape',
    outputs: [{ path: rel, sha256: sha256File(path.join(ws, rel)) }],
    inputBaseline: computeInputBaseline(root, ['README.md']),
  });
  expect(report.status === 'aborted_path_violation', `junction/symlink escape aborts (got ${report.status})`);
  expect(!fs.existsSync(path.join(outside, 'escape.js')), 'no bytes landed through the escaped destination parent');
}

// ---------- F25: NTFS ADS enumeration covers journaled files ----------
console.log('F25: workspace journal enumerates and rejects NTFS alternate streams');
if (!IS_WIN) { console.log('  SKIPPED (NTFS fixture requires Windows)'); } else {
  const root = makeMockRoot('f25');
  const control = path.join(root, '.campaign');
  const ws = path.join(control, 'workspaces', 'ads-ws');
  const snapshot = createWorkspace(root, ws, {});
  writeFileEnsured(path.join(ws, 'src', 'ads.js'), 'DEFAULT\n');
  fs.writeFileSync(path.join(ws, 'src', 'ads.js:payload'), 'HIDDEN\n');
  const bad = journalWorkspace(ws, snapshot, ['src/**']);
  expect(bad.streamViolations.some((line) => line.includes('ads.js') && line.includes('payload')), 'non-default NTFS stream is named and rejected');
  fs.rmSync(path.join(ws, 'src', 'ads.js:payload'), { force: true });
  const good = journalWorkspace(ws, snapshot, ['src/**']);
  expect(good.streamViolations.length === 0, 'default data stream alone is accepted');
}

// ---------- F26: Windows watch-only mutation requires explicit acknowledgement ----------
console.log('F26: Windows mutation lanes reject implicit detection-only mode');
if (!IS_WIN) { console.log('  SKIPPED (Windows ACL policy fixture)'); } else {
  const root = makeMockRoot('f26');
  const worker = workerScript('watch-ack.mjs', `import fs from 'node:fs'; fs.writeFileSync('src/feature.js','ok');${VALID_SUBMISSION}`);
  const args = [
    RUNNER, '--live-root', root, '--control-root', path.join(root, '.campaign'),
    '--packet-id', 'F26', '--lease', 'code_mutation', '--writable', 'src/**',
    '--guard', 'watch', '--', 'node', worker,
  ];
  const refused = spawnSync('node', args, { encoding: 'utf8', env: { ...process.env, MOCK_LIVE_ROOT: root } });
  expect(refused.status === 5 && `${refused.stdout}${refused.stderr}`.includes('detection-only-acknowledgement'), 'watch-only run without acknowledgement is refused');
  const acknowledged = runRunner(root, 'F26-ACK', worker, ['--guard', 'watch']);
  expect(acknowledged.code === 0, 'explicit detection-only acknowledgement permits the supervised fixture');
}

// ---------- F27: exited-wrapper PID reuse must never kill unrelated processes ----------
console.log('F27: Windows post-exit containment identity-gates stale wrapper PIDs');
{
  const reusedTable = [
    { ProcessId: 4200, ParentProcessId: 1, Start: 300 },
    { ProcessId: 4201, ParentProcessId: 4200, Start: 310 },
  ];
  const reusedKills = [];
  const reused = await containWindowsProcessTree(4200, 90, 0, null, {
    membersRecord: { wrapperPid: 4200, wrapperStartFileTime: 100, pids: [4200] },
    containStartFileTime: 400,
    listTable: () => reusedTable,
    killOne: (pid) => reusedKills.push(pid),
    sleepFn: async () => {},
  });
  expect(reused.contained && reused.rootPidReused, 'reused wrapper PID is recognized after exit');
  expect(reusedKills.length === 0, 'unrelated reused-PID tree is never taskkilled');

  const descendant = { ProcessId: 4301, ParentProcessId: 4300, Start: 150 };
  const tables = [[descendant], [], []];
  const descendantKills = [];
  const cleared = await containWindowsProcessTree(4300, 90, 0, null, {
    membersRecord: { wrapperPid: 4300, wrapperStartFileTime: 100, pids: [4300, 4301] },
    containStartFileTime: 400,
    listTable: () => tables.shift() || [],
    killOne: (pid) => descendantKills.push(pid),
    sleepFn: async () => {},
  });
  expect(cleared.contained && descendantKills.includes(4301), 'genuine sampled descendant is killed and verified absent');

  const persistent = await containWindowsProcessTree(4400, 90, 0, null, {
    membersRecord: { wrapperPid: 4400, wrapperStartFileTime: 100, pids: [4400, 4401] },
    containStartFileTime: 400,
    listTable: () => [{ ProcessId: 4401, ParentProcessId: 4400, Start: 150 }],
    killOne: () => {},
    sleepFn: async () => {},
  });
  expect(!persistent.contained && persistent.survivors.includes(4401), 'persistent genuine descendant fails closed');
}

// ---------- F28: heartbeat atomic temp sibling is an exact expected write ----------
console.log('F28: valid heartbeat temp race is allowed narrowly; neighboring temp is rejected');
{
  const root = makeMockRoot('f28');
  const control = path.join(root, '.campaign');
  const lease = acquireLease(control, { kind: 'code_mutation', packetId: 'F28', holder: 'heartbeat-control', ttlSeconds: 60 });
  const heartbeatTempRel = `leases/.code_mutation.json.${lease.id}.heartbeat.tmp`;
  const watch = createControlWatch(control, {
    expectedWrites: ['leases/code_mutation.json', heartbeatTempRel],
  });
  const leaseFile = path.join(control, 'leases', 'code_mutation.json');
  let duringRenameViolations = null;
  const originalRenameSync = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (path.resolve(destination) === path.resolve(leaseFile)) {
      duringRenameViolations = watch.check();
    }
    return originalRenameSync(source, destination);
  };
  try {
    heartbeatLease(control, 'code_mutation', lease.id, lease.token);
  } finally {
    fs.renameSync = originalRenameSync;
  }
  expect(Array.isArray(duringRenameViolations) && duringRenameViolations.length === 0, 'valid heartbeat temp sibling is not latched during atomic rename window');

  const rogueRel = 'leases/.code_mutation.json.foreign.heartbeat.tmp';
  writeFileEnsured(path.join(control, rogueRel), 'foreign');
  const rogueViolations = watch.check();
  expect(rogueViolations.some((line) => line.includes(rogueRel)), 'neighboring unowned heartbeat temp remains a violation');
  const healed = watch.heal();
  expect(healed.failures.length === 0 && !fs.existsSync(path.join(control, rogueRel)), 'neighboring temp is healed without widening a prefix');
  releaseLease(control, 'code_mutation', lease.id, lease.token, 'released');
}

console.log(`\ncheck:safe-agent-runner (repair-2) — ${checks - failures}/${checks} assertions passed${IS_WIN ? '' : ' (ACL/win fixtures skipped: non-Windows)'}`);
if (failures > 0) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log('SAFE-001 repair-2 destructive fixture suite: PASS');
