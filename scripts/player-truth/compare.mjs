#!/usr/bin/env node
// Before/after verdict table for a gameplay PR.
//
//   node scripts/player-truth/compare.mjs <baseline run dir|verdict.json> <branch run dir|verdict.json> [more pairs…] [--out=file.md]
//   npm run player-truth -- --mode=swarm --baseline=<git ref> --baseline-verdict=<saved run dir>
//
// One markdown table per run pair: check, baseline status/value, branch status/value, change.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overall, regradeSoftwareFrameTime, regradeLodChurn } from './checks.mjs';

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

/** Preflight saved captures before the candidate opens a browser. */
export function loadCapturedBaseline({ ref, verdict, root }) {
  const commit = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  }).trim();
  const source = realpathSync(path.resolve(root, verdict));
  const single = statSync(source).isFile() || existsSync(path.join(source, 'verdict.json'));
  const captures = single ? [source] : readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(source, entry.name))
    .filter((dir) => existsSync(path.join(dir, 'verdict.json')));
  if (!captures.length) throw new Error(`No saved baseline verdicts found in ${source}`);
  const byLabel = new Map();
  for (const capture of captures) {
    const base = load(capture);
    const meta = base?.meta;
    if (!Array.isArray(base?.results) || !meta?.label) {
      throw new Error(`Invalid saved baseline verdict: ${capture}`);
    }
    if (!/^[0-9a-f]{7,64}$/i.test(meta.commit || '') || !commit.startsWith(meta.commit.toLowerCase())
      || meta.dirty !== false || meta.endDirty === true || meta.sourceOverlay
      || (meta.endCommit && !commit.startsWith(String(meta.endCommit).toLowerCase()))) {
      throw new Error(`Saved baseline verdict ${capture} must come from an unmodified capture of ${ref} (${commit})`);
    }
    if (byLabel.has(meta.label)) throw new Error(`Duplicate saved baseline verdict for ${meta.label}`);
    byLabel.set(meta.label, base);
  }
  return { ref, byLabel, single, paths: captures.map((capture) => realpathSync(capture)) };
}

const REQUIRED_CAPTURE_FIELDS = ['mode', 'seed', 'resolution', 'softwareGl'];
const ROUTE_FIELDS = ['arena', 'hullPicked', 'gate', 'fortify', 'requireRounds', 'idleSeconds', 'script', 'startRound'];

export function assertCapturedBaselineOutput(baseline, outDir) {
  const output = existsSync(outDir) ? realpathSync(outDir) : outDir;
  if (baseline.paths.some((file) => {
    const relative = path.relative(output, file);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  })) {
    throw new Error(`Candidate output would overwrite a saved baseline verdict: ${outDir}`);
  }
}

export function compareCapturedBaseline({ baseline, outcomes, root }) {
  if (baseline.single && outcomes.length > 1) {
    throw new Error('--baseline-verdict needs a directory containing one saved verdict per matrix cell');
  }
  const tables = outcomes.map(({ label, outDir }) => {
    const base = baseline.single ? baseline.byLabel.values().next().value : baseline.byLabel.get(label);
    if (!base) throw new Error(`No saved baseline verdict for ${label}`);
    if (!existsSync(path.join(outDir, 'verdict.json'))) return `### ${label}: branch run produced no verdict\n`;
    const head = load(outDir);
    const mismatch = [...REQUIRED_CAPTURE_FIELDS, ...ROUTE_FIELDS].find((key) => {
      const baseValue = base.meta[key];
      const headValue = head.meta?.[key];
      return (REQUIRED_CAPTURE_FIELDS.includes(key) && baseValue == null)
        || (baseValue ?? null) !== (headValue ?? null);
    });
    if (mismatch) throw new Error(`Saved baseline verdict for ${label} does not match the candidate's ${mismatch}`);
    return renderComparison(base, head);
  });
  const output = path.join(root, 'scratch/player-truth');
  mkdirSync(output, { recursive: true });
  const file = path.join(output, `compare-${baseline.ref.replace(/[^a-z0-9]+/gi, '-')}.md`);
  const report = ['Saved verdict comparison. Each run keeps its original grades.', '', ...tables].join('\n');
  writeFileSync(file, report);
  console.log(`\n${report}\ncomparison table: ${path.relative(root, file)}`);
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
