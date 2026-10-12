#!/usr/bin/env node
// Before/after verdict table for a gameplay PR.
//
//   node scripts/player-truth/compare.mjs <baseline run dir|verdict.json> <branch run dir|verdict.json> [more pairs…] [--out=file.md]
//   npm run player-truth -- --mode=swarm --gate --baseline=origin/master   (runs the same CLI on <ref>, then compares)
//
// One markdown table per run pair: check, baseline status/value, branch status/value, change.
import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RANK = { PASS: 0, 'N/A': 0, UNKNOWN: 1, INCOMPLETE: 1, FAIL: 2 };
const load = (p) => JSON.parse(readFileSync(p.endsWith('.json') ? p : path.join(p, 'verdict.json'), 'utf8'));
const cell = (r) => (r ? `${r.status}${r.value != null ? ` · ${String(r.value).replace(/\|/g, '/')}` : ''}` : '—');

export function compareVerdicts(base, head) {
  const ids = [...new Set([...base.results.map((r) => r.id), ...head.results.map((r) => r.id)])];
  const rows = ids.map((id) => {
    const a = base.results.find((r) => r.id === id); const b = head.results.find((r) => r.id === id);
    const ra = a ? RANK[a.status] ?? 1 : null; const rb = b ? RANK[b.status] ?? 1 : null;
    const change = ra == null || rb == null ? 'new/removed' : rb < ra ? 'improved' : rb > ra ? 'REGRESSED' : 'same';
    return { id, title: (b || a).title, base: a, head: b, change };
  });
  return { rows, regressed: rows.filter((r) => r.change === 'REGRESSED').length, improved: rows.filter((r) => r.change === 'improved').length };
}

export function renderComparison(base, head) {
  const { rows, regressed, improved } = compareVerdicts(base, head);
  const m = head.meta || {}; const bm = base.meta || {};
  const lines = [
    `### player-truth: ${m.label || '?'} — ${bm.commit || '?'} → ${m.commit || '?'}`,
    '',
    `${m.mode || ''}${m.arena ? ` · ${m.arena}` : ''} · seed ${m.seed ?? '?'} · ${m.resolution || '?'}${m.hullPicked ? ` · hull ${m.hullPicked}` : ''}${m.gate ? ` · gate ${m.gate}` : ''} · ${m.softwareGl ? 'software GL' : 'GPU'}`,
    '',
    `**Overall: ${base.overall} → ${head.overall}** · ${improved} improved · ${regressed} regressed`,
    '',
    '| Check | Baseline | Branch | Change |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.title} | ${cell(r.base)} | ${cell(r.head)} | ${r.change} |`),
    '',
  ];
  return lines.join('\n');
}

/** Run the same CLI on <ref> in a throwaway .worktrees/ checkout (removed before returning), then compare. */
export async function runBaseline({ ref, argv, outcomes, root }) {
  const wt = path.join(root, '.worktrees', 'player-truth-baseline');
  const outRoot = path.join(root, 'scratch/player-truth/baseline');
  rmSync(wt, { recursive: true, force: true });
  try { execFileSync('git', ['worktree', 'prune'], { cwd: root }); } catch { /* none */ }
  execFileSync('git', ['worktree', 'add', '--detach', wt, ref], { cwd: root, stdio: 'inherit' });
  try {
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
      const baseDir = path.join(wt, 'scratch/player-truth', o.label);
      if (!existsSync(path.join(baseDir, 'verdict.json'))) { tables.push(`### ${o.label}: baseline run produced no verdict\n`); continue; }
      execFileSync('cp', ['-r', baseDir, path.join(outRoot, o.label)]);
      tables.push(renderComparison(load(path.join(outRoot, o.label)), load(o.outDir)));
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
