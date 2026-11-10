#!/usr/bin/env node
// Before/after verdict table for a gameplay PR.
//
//   node scripts/player-truth/compare.mjs <baseline run dir|verdict.json> <branch run dir|verdict.json> [more pairs…] [--out=file.md]
//   npm run player-truth -- --mode=swarm --gate --baseline=origin/master   (runs the same CLI on <ref>, then compares)
//
// One markdown table per run pair: check, baseline status/value, branch status/value, change.
import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, rmSync, lstatSync, readdirSync, statfsSync } from 'node:fs';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overall, regradeSoftwareFrameTime, regradeLodChurn } from './checks.mjs';
import { renderVerdict } from './verdict.mjs';

const RANK = { PASS: 0, 'N/A': 0, UNKNOWN: 1, INCOMPLETE: 1, FAIL: 2 };
const load = (p) => JSON.parse(readFileSync(p.endsWith('.json') ? p : path.join(p, 'verdict.json'), 'utf8'));
const cell = (r) => (r ? `${r.status}${r.value != null ? ` · ${String(r.value).replace(/\|/g, '/')}` : ''}` : '—');

export function compareVerdicts(base, head) {
  const ids = [...new Set([...base.results.map((r) => r.id), ...head.results.map((r) => r.id)])];
  const rows = ids.map((id) => {
    const a = base.results.find((r) => r.id === id); const b = head.results.find((r) => r.id === id);
    const sa = a && a.status; const sb = b && b.status;
    let change;
    // An environment abort is the harness, not a gameplay regression.
    // A load-noise frame_time advisory is not a PASS→FAIL regression either.
    if (sa === 'ENVIRONMENT' || sb === 'ENVIRONMENT') change = sa === sb ? 'same' : sb === 'ENVIRONMENT' ? 'environment' : 'cleared';
    else if (sa === 'ADVISORY' || sb === 'ADVISORY') change = sa === sb ? 'same' : 'advisory';
    else {
      const ra = a ? RANK[a.status] ?? 1 : null; const rb = b ? RANK[b.status] ?? 1 : null;
      change = ra == null || rb == null ? 'new/removed' : rb < ra ? 'improved' : rb > ra ? 'REGRESSED' : 'same';
    }
    return { id, title: (b || a).title, base: a, head: b, change };
  });
  return {
    rows,
    regressed: rows.filter((r) => r.change === 'REGRESSED').length,
    improved: rows.filter((r) => r.change === 'improved').length,
    advisory: rows.filter((r) => r.change === 'advisory').length,
  };
}

/** Grade the head's software-GL frame_time against the baseline verdict. Mutates `head`. */
export function applyBaselineToHead(head, base, { baselineMissing = false, commit = null } = {}) {
  const rev = commit || (base && base.meta && base.meta.commit) || null;
  const frameResult = base && base.results && base.results.find((r) => r.id === 'frame_time');
  const baseFrame = frameResult && frameResult.frame && frameResult.frame.p99 != null && frameResult.frame.longTasks != null ? frameResult.frame : null;
  const missing = baselineMissing || !baseFrame;
  const changed = regradeSoftwareFrameTime(head.results, baseFrame, {
    commit: rev, baselineMissing: missing,
    headLoad: head.meta && head.meta.loadavg,
    baseLoad: base && base.meta && base.meta.loadavg,
  });
  // lod_churn's total rate is graded against the baseline's churn over the same first sim seconds.
  const churnChanged = regradeLodChurn(head.results, base && base.results);
  if (changed || churnChanged) {
    head.overall = overall(head.results);
    if (head.meta) head.meta.overall = head.overall;
  }
  return changed || churnChanged;
}

function writeRegraded(outDir, head, root) {
  const paths = {
    verdict: path.relative(root, path.join(outDir, 'verdict.md')),
    contactSheet: path.relative(root, path.join(outDir, 'contact-sheet.jpg')),
    json: path.relative(root, path.join(outDir, 'verdict.json')),
    trace: path.relative(root, path.join(outDir, 'trace.json.gz')),
    frames: path.relative(root, path.join(outDir, 'frames')),
  };
  writeFileSync(path.join(outDir, 'verdict.json'), JSON.stringify(head, null, 1));
  writeFileSync(path.join(outDir, 'verdict.md'), renderVerdict({ meta: head.meta, results: head.results, overall: head.overall, paths }));
  const label = head.meta && head.meta.label;
  if (!label) return;
  const evDir = path.join(root, 'design/program/player-truth', label);
  if (!existsSync(path.join(evDir, 'verdict.json'))) return;
  const evPaths = {
    verdict: path.relative(root, path.join(evDir, 'verdict.md')),
    contactSheet: path.relative(root, path.join(evDir, 'contact-sheet.jpg')),
    json: path.relative(root, path.join(evDir, 'verdict.json')),
  };
  writeFileSync(path.join(evDir, 'verdict.json'), JSON.stringify(head, null, 1));
  writeFileSync(path.join(evDir, 'verdict.md'), renderVerdict({ meta: head.meta, results: head.results, overall: head.overall, paths: evPaths }));
}

export function renderComparison(base, head) {
  const { rows, regressed, improved, advisory } = compareVerdicts(base, head);
  const m = head.meta || {}; const bm = base.meta || {};
  const lines = [
    `### player-truth: ${m.label || '?'} — ${bm.commit || '?'} → ${m.commit || '?'}`,
    '',
    `${m.mode || ''}${m.arena ? ` · ${m.arena}` : ''} · seed ${m.seed ?? '?'} · ${m.resolution || '?'}${m.hullPicked ? ` · hull ${m.hullPicked}` : ''}${m.gate ? ` · gate ${m.gate}` : ''} · ${m.softwareGl ? 'software GL' : 'GPU'}`,
    '',
    `**Overall: ${base.overall} → ${head.overall}** · ${improved} improved · ${regressed} regressed · ${advisory} advisory`,
    '',
    '| Check | Baseline | Branch | Change |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.title} | ${cell(r.base)} | ${cell(r.head)} | ${r.change} |`),
    '',
  ];
  const notes = rows.filter((r) => r.change === 'advisory');
  if (notes.length) {
    lines.push('Advisory (not a regression; the measured numbers stay visible):');
    for (const r of notes) {
      const value = r.head && r.head.value != null ? String(r.head.value) : (r.base && r.base.value != null ? String(r.base.value) : '');
      const detail = r.head && r.head.detail ? String(r.head.detail) : '';
      lines.push(`- ${r.title}: ${value}${detail ? ` — ${detail}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Where a sparse baseline worktree should get `assets/`. Fleet checkouts exclude that tree. */
export const ASSET_PROBE = 'assets/ships/release/render-packages/kestrel/render-package.json';

/**
 * `present` — the worktree already has the probe file.
 * `link` — shared checkout's asset tree matches `ref` and the worktree slot is empty.
 * `extract` — shared tree differs, or the slot is a partial real directory. Do not link a stale tree.
 */
export function baselineAssetPlan({ manifestPresent, sharedMatches, canLink }) {
  if (manifestPresent) return 'present';
  if (sharedMatches && canLink) return 'link';
  return 'extract';
}

function slotState(dir) {
  if (!existsSync(dir)) return 'missing';
  let st;
  try { st = lstatSync(dir); } catch { return 'missing'; }
  if (st.isSymbolicLink()) return 'link';
  if (!st.isDirectory()) return 'other';
  try { return readdirSync(dir).length === 0 ? 'empty' : 'dir'; } catch { return 'other'; }
}

/** `git archive` of `assets/` is about 3.9 GB. Leave headroom; do not start below this much free. */
export const BASELINE_EXTRACT_MIN_FREE_BYTES = 8 * 1024 * 1024 * 1024;

/** Commit match is not enough for `assets/`: `diff-tree` ignores a dirty worktree. */
export function sharedAssetsLinkable({ treeMatches, assetsStatus }) {
  if (!treeMatches) return false;
  return String(assetsStatus ?? '').trim() === '';
}

export function baselineExtractAllowed(freeBytes, minBytes = BASELINE_EXTRACT_MIN_FREE_BYTES) {
  return Number.isFinite(freeBytes) && freeBytes >= minBytes;
}

export function freeBytesAt(dir) {
  const st = statfsSync(dir);
  return Number(st.bavail) * Number(st.bsize);
}

function formatGb(bytes) {
  return `${(Number(bytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function baselineDiskMessage(freeBytes, { minBytes = BASELINE_EXTRACT_MIN_FREE_BYTES, where = 'the baseline worktree' } = {}) {
  const have = Number.isFinite(freeBytes) ? `${formatGb(freeBytes)} free` : 'free space unreadable';
  return [
    '# Player-truth verdict: ENVIRONMENT — harness',
    '',
    'HARNESS ENVIRONMENT: not enough disk to extract baseline assets',
    '',
    'This is not a gameplay FAIL. Extracting assets/ writes about 3.9 GB.',
    `${where} has ${have}; need ${formatGb(minBytes)} free. The extract was not started.`,
    '',
  ].join('\n');
}

export function baselineDiskError(freeBytes, where) {
  const err = new Error(baselineDiskMessage(freeBytes, { where }));
  err.environment = true;
  return err;
}

/**
 * True when `shared`'s commit tree for `subdir` matches `ref`.
 * For `assets`, also requires `git status --porcelain -- assets` to be empty.
 * `diff-tree` compares commits only, so a dirty `_assets-master` would still be linked without that check.
 * Design dirt is ignored here; verdict overlays live under `design/` and are not served.
 */
export function sharedTreeMatches(shared, ref, subdir) {
  let treeMatches = false;
  try {
    execFileSync('git', ['diff-tree', '--quiet', ref, 'HEAD', '--', subdir], { cwd: shared, stdio: 'ignore' });
    treeMatches = true;
  } catch {
    return false;
  }
  if (subdir !== 'assets') return treeMatches;
  let assetsStatus = null;
  try {
    assetsStatus = execFileSync('git', ['status', '--porcelain', '--', 'assets'], { cwd: shared, encoding: 'utf8' });
  } catch {
    return false;
  }
  return sharedAssetsLinkable({ treeMatches, assetsStatus });
}

function replaceSlot(dir) {
  const state = slotState(dir);
  if (state === 'missing') return true;
  if (state === 'empty' || state === 'link') {
    rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function linkSharedDir(shared, wt, name) {
  const from = path.join(shared, name);
  const to = path.join(wt, name);
  if (!existsSync(from)) return false;
  if (!replaceSlot(to)) return false;
  symlinkSync(from, to, 'dir');
  return true;
}

function extractAssets(root, ref, wt) {
  replaceSlot(path.join(wt, 'assets'));
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['archive', '--format=tar', ref, 'assets'], { cwd: root });
    const tar = spawn('tar', ['-x', '-C', wt]);
    const err = [];
    git.stderr.on('data', (d) => err.push(d));
    tar.stderr.on('data', (d) => err.push(d));
    git.stdout.pipe(tar.stdin);
    let gitCode = null;
    let tarCode = null;
    const finish = () => {
      if (gitCode == null || tarCode == null) return;
      if (gitCode !== 0 || tarCode !== 0) {
        reject(new Error(`baseline asset extract failed git=${gitCode} tar=${tarCode} ${Buffer.concat(err).toString('utf8').slice(0, 500)}`));
      } else resolve();
    };
    git.on('error', reject);
    tar.on('error', reject);
    git.on('close', (code) => { gitCode = code ?? 1; finish(); });
    tar.on('close', (code) => { tarCode = code ?? 1; finish(); });
  });
}

/**
 * A fleet worktree is sparse (`!/assets/`), and `git worktree add` copies that pattern, so the
 * baseline checkout serves zero asset blobs. Link the shared checkout when its asset tree matches
 * `ref`. Otherwise extract `assets/` from `ref` so a stale share cannot pass the environment check.
 */
export async function attachBaselineAssets(wt, ref, { shared = process.env.SHARED_ASSETS || '/workspace/spaceface-scratch/_assets-master', root = wt } = {}) {
  const manifestPresent = existsSync(path.join(wt, ASSET_PROBE));
  const assetsState = slotState(path.join(wt, 'assets'));
  const canLink = assetsState === 'missing' || assetsState === 'empty' || assetsState === 'link';
  const sharedMatches = !manifestPresent && existsSync(path.join(shared, ASSET_PROBE)) && sharedTreeMatches(shared, ref, 'assets');
  const plan = baselineAssetPlan({ manifestPresent, sharedMatches, canLink });
  if (plan === 'present') {
    console.log('baseline assets: already present');
    return plan;
  }
  if (plan === 'link') {
    if (!linkSharedDir(shared, wt, 'assets')) throw new Error(`baseline assets: could not link ${shared}/assets`);
    if (sharedTreeMatches(shared, ref, 'design')) linkSharedDir(shared, wt, 'design');
    console.log(`baseline assets: linked ${shared} (asset tree matches ${ref})`);
    return plan;
  }
  const free = (() => { try { return freeBytesAt(wt); } catch { return null; } })();
  if (!baselineExtractAllowed(free)) throw baselineDiskError(free, wt);
  console.log(`baseline assets: extracting ${ref} (${formatGb(free)} free; shared checkout asset tree differs, is dirty, or the worktree slot is partial)`);
  await extractAssets(root, ref, wt);
  if (!existsSync(path.join(wt, ASSET_PROBE))) throw new Error(`baseline assets: ${ASSET_PROBE} still missing after extract of ${ref}`);
  return plan;
}

/** Run the same CLI on <ref> in a throwaway .worktrees/ checkout (removed before returning), then compare. */
export async function runBaseline({ ref, argv, outcomes, root }) {
  const wt = path.join(root, '.worktrees', 'player-truth-baseline');
  const outRoot = path.join(root, 'scratch/player-truth/baseline');
  rmSync(wt, { recursive: true, force: true });
  try { execFileSync('git', ['worktree', 'prune'], { cwd: root }); } catch { /* none */ }
  execFileSync('git', ['worktree', 'add', '--detach', wt, ref], { cwd: root, stdio: 'inherit' });
  try {
    await attachBaselineAssets(wt, ref, { root });
    if (!existsSync(path.join(wt, 'node_modules'))) symlinkSync(path.join(root, 'node_modules'), path.join(wt, 'node_modules'), 'dir');
    // The baseline runs the branch's harness against the ref's game, so the two tables grade the same way.
    execFileSync('rm', ['-rf', path.join(wt, 'scripts/player-truth'), path.join(wt, 'src/testing/playerTruth')]);
    execFileSync('cp', ['-r', path.join(root, 'scripts/player-truth'), path.join(wt, 'scripts/player-truth')]);
    mkdirSync(path.join(wt, 'src/testing'), { recursive: true });
    execFileSync('cp', ['-r', path.join(root, 'src/testing/playerTruth'), path.join(wt, 'src/testing/playerTruth')]);
    const args = argv.filter((x) => !x.startsWith('--baseline') && !x.startsWith('--evidence') && !x.startsWith('--out'));
    const r = spawnSync(process.execPath, ['scripts/player-truth/run.mjs', ...args], { cwd: wt, stdio: 'inherit', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' } });
    if (r.error) throw r.error;
    mkdirSync(outRoot, { recursive: true });
    const tables = [];
    for (const o of outcomes) {
      const headPath = path.join(o.outDir, 'verdict.json');
      if (!existsSync(headPath)) { tables.push(`### ${o.label}: branch run produced no verdict\n`); continue; }
      const head = load(o.outDir);
      const before = head.overall;
      const baseDir = path.join(wt, 'scratch/player-truth', o.label);
      const baseReady = existsSync(path.join(baseDir, 'verdict.json'));
      if (baseReady) execFileSync('cp', ['-r', baseDir, path.join(outRoot, o.label)]);
      const base = baseReady ? load(path.join(outRoot, o.label)) : null;
      if (applyBaselineToHead(head, base, { baselineMissing: !base, commit: (base && base.meta && base.meta.commit) || ref })) {
        writeRegraded(o.outDir, head, root);
        o.verdict = head.overall;
        if (before !== head.overall) console.log(`regraded ${o.label} frame_time: overall ${before} → ${head.overall}`);
      }
      if (!base) { tables.push(`### ${o.label}: baseline run produced no verdict\n`); continue; }
      tables.push(renderComparison(base, head));
    }
    const file = path.join(root, 'scratch/player-truth', `compare-${ref.replace(/[^a-z0-9]+/gi, '-')}.md`);
    writeFileSync(file, tables.join('\n'));
    console.log(`\n${tables.join('\n')}\ncomparison table: ${path.relative(root, file)}`);
  } finally {
    rmSync(wt, { recursive: true, force: true });
    try { execFileSync('git', ['worktree', 'prune'], { cwd: root }); } catch { /* none */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2); const out = (argv.find((x) => x.startsWith('--out=')) || '').slice(6);
  const dirs = argv.filter((x) => !x.startsWith('--'));
  if (dirs.length < 2 || dirs.length % 2) { console.error('usage: compare.mjs <baseline> <branch> [<baseline> <branch> …] [--out=file.md]'); process.exit(3); }
  const tables = [];
  for (let i = 0; i < dirs.length; i += 2) tables.push(renderComparison(load(dirs[i]), load(dirs[i + 1])));
  const md = tables.join('\n');
  if (out) writeFileSync(out, md);
  console.log(md);
}
