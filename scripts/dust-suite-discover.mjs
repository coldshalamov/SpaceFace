#!/usr/bin/env node
// DUST P7 (BS-9a) — latent-test-suite discovery runner. REPORT-ONLY.
//
// WHY THIS EXISTS. The 2026-10-31 engineering audit found 4,957 test/*.test.mjs files but only
// ~671 wired into any npm script; `scripts.check` is a first-failure `&&` chain (see the header
// of scripts/check-all.mjs for the 2026-08-23 incident where that masked 25 failures). Nothing
// anywhere runs the whole suite, so the unwired ("latent") majority is invisible: no one knows
// how many of those files even load. This tool makes the latent set VISIBLE without gating
// anything — it never edits package.json, never touches the check chain, and classifies every
// child outcome (pass / fail / timeout / error) instead of stopping at the first one.
//
// ROUTED (wired) MATCHING RULES — deliberately conservative, i.e. biased toward counting a
// file as routed:
//   R1 exact path — the file's repo-relative posix path (e.g. `test/foo.test.mjs`) appears as a
//      substring of ANY string in package.json `scripts` (any script, not just the check chain).
//   R2 shell glob — a script contains a `test/...*....test.mjs` glob token (e.g. the one in
//      `check:player-truth`); every test file the glob can expand to is routed. `*` is treated
//      as `[^/]*` (shell semantics for these unquoted tokens).
//   R3 directory form — a script runs the test runner against the whole `test` dir (`--test test`
//      / `--test test/`); if present, ALL enumerated files count as routed. (None exist today;
//      the rule is here so the tool cannot silently overcount the latent set later.)
// Indirect routing (a script calls a helper script that enumerates test/ itself) is NOT counted
// — only package.json script strings, per the audit's definition of "wired".
//
// TEST-FILE ENUMERATION: `test/**/*.test.mjs` (recursive, skipping node_modules/__pycache__).
// Observed but NOT counted/run: one `test/*.test.js` and one `test/*.spec.mjs` exist; noted in
// the summary so the population claim stays honest.
//
// RUNNER: `node --test <file>` via process.execPath, shell:false (same shape as
// scripts/bughunt-sweep.mjs and test/AGENTS.md's "run the narrow test file first"). Env is
// inherited. Files that need a browser, display, or long runs will surface as fail/timeout —
// that is an acceptable classification, not something this tool fixes.
//
// USAGE
//   node scripts/dust-suite-discover.mjs                        # summary only (default)
//   node scripts/dust-suite-discover.mjs --run [--limit 25] [--shard i/k] [--timeout 60000]
//                                          [--budget ms] [--out[=design/program/dust/SUITE_DISCOVERY_REPORT.md]]
//   --limit N     run at most N unrouted files (default 25 when --run is given)
//   --shard i/k   restrict to files with index % k === i (deterministic, alphabetical) — lets
//                 several agents split the latent set without overlap
//   --timeout ms  per-file timeout (default 60000)
//   --budget ms   wall-clock budget for the whole run; when exceeded, remaining files are
//                 reported as not-run instead of launched (default: none)
//   --out[=file]  write a markdown report; the path MUST live under design/program/dust/
//                 (default design/program/dust/SUITE_DISCOVERY_REPORT.md) — this tool writes
//                 nowhere else
//
// Exit code: 0 for every completed discovery run (even with failing tests — this is a census,
// not a gate); 2 only for misuse of the tool itself. The script never throws on a child crash.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const DUST_DIR = path.join(ROOT, 'design', 'program', 'dust');
const DEFAULT_REPORT = path.join(DUST_DIR, 'SUITE_DISCOVERY_REPORT.md');
const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.git']);
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RUN_LIMIT = 25;
const LINE_BUCKETS = [
  ['<100 lines', 0, 100],
  ['100-499', 100, 500],
  ['500-1999', 500, 2000],
  ['>=2000', 2000, Infinity],
];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const bare = eq === -1 ? a : a.slice(0, eq);
    const inlineVal = eq === -1 ? null : a.slice(eq + 1);
    const nextVal = () => inlineVal ?? argv[++i];
    if (bare === '--run') out.run = true;
    else if (bare === '--limit') out.limit = Number(nextVal());
    else if (bare === '--timeout') out.timeout = Number(nextVal());
    else if (bare === '--budget') out.budget = Number(nextVal());
    else if (bare === '--shard') {
      const m = String(nextVal()).match(/^(\d+)\/(\d+)$/);
      if (!m) throw new Error('--shard expects i/k, e.g. --shard 0/4');
      out.shardIndex = Number(m[1]);
      out.shardCount = Number(m[2]);
    } else if (bare === '--out') {
      // Both forms: `--out=path` and `--out path`. A following value is only consumed when it
      // does not look like another flag, so a bare `--out` still gets the default report path.
      if (inlineVal !== null) out.out = inlineVal;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) out.out = argv[++i];
      else out.out = DEFAULT_REPORT;
    } else if (bare === '--help' || bare === '-h') out.help = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  console.log(`dust-suite-discover — REPORT-ONLY latent-test census (DUST P7 / BS-9a)

  node scripts/dust-suite-discover.mjs                 # summary only
  node scripts/dust-suite-discover.mjs --run [--limit N] [--shard i/k]
                                         [--timeout ms] [--budget ms] [--out[=file]]

Never gates, never edits anything outside design/program/dust/. Exit 0 unless misused.`);
}

// ---------- enumeration ----------

function enumerateTestFiles() {
  const files = [];
  const walk = (relDir) => {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(rel);
      } else if (e.name.endsWith('.test.mjs')) {
        files.push(rel);
      }
    }
  };
  walk('test');
  files.sort();
  return files;
}

function countOtherTestExtensions() {
  const seen = { 'test/**/*.test.js': 0, 'test/**/*.spec.mjs': 0 };
  const walk = (relDir) => {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(rel);
      } else if (e.name.endsWith('.test.js')) seen['test/**/*.test.js'] += 1;
      else if (e.name.endsWith('.spec.mjs')) seen['test/**/*.spec.mjs'] += 1;
    }
  };
  walk('test');
  return seen;
}

// ---------- routed computation ----------

function computeRouted(files, scriptTexts) {
  const all = scriptTexts.join('\n');
  const routed = new Set();
  let routedBy = { exact: 0, glob: 0, dir: 0 };

  // R3 directory form — would route everything.
  if (/(^|[\s"'])--test[\s"']+test\/?([\s"']|$)/.test(all)) {
    for (const f of files) routed.add(f);
    routedBy.dir = files.length;
    return { routed, routedBy };
  }

  // R1 exact path substring.
  for (const f of files) {
    if (all.includes(f)) {
      routed.add(f);
      routedBy.exact += 1;
    }
  }

  // R2 shell glob tokens like test/player-truth-*.test.mjs (unquoted, so the shell expands).
  const globTokens = new Set();
  for (const t of all.match(/test\/[A-Za-z0-9._/-]*\*[A-Za-z0-9._/-]*/g) || []) globTokens.add(t);
  for (const f of files) {
    if (routed.has(f)) continue;
    for (const token of globTokens) {
      const re = new RegExp(`^${token.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
      if (re.test(f)) {
        routed.add(f);
        routedBy.glob += 1;
      }
    }
  }
  return { routed, routedBy };
}

function lineCount(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

// ---------- run mode ----------

function parseSpecCounts(output) {
  const counts = {};
  for (const m of output.matchAll(/[ℹ#] (tests|pass|fail|skipped|todo|cancelled) (\d+)/g)) {
    counts[m[1]] = Number(m[2]);
  }
  return counts;
}

function failureExcerpt(output, stderr) {
  const lines = String(output || '').split('\n');
  const interesting = lines.filter((l) => /not ok|✖|✗|error:|Error:|AssertionError|expected|actual|Cannot find module|ERR_|throw/i.test(l) && l.trim());
  const pool = interesting.length ? interesting : String(stderr || '').split('\n').filter((l) => l.trim());
  return pool.slice(0, 5).map((l) => l.trim().slice(0, 200));
}

function runOne(rel, timeoutMs) {
  const started = Date.now();
  let r;
  try {
    r = spawnSync(process.execPath, ['--test', rel], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
      env: process.env,
    });
  } catch (err) {
    return { file: rel, status: 'error', ms: Date.now() - started, excerpt: [`spawn failed: ${err && err.message}`] };
  }
  const ms = Date.now() - started;
  const output = `${r.stdout || ''}\n${r.stderr || ''}`;
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  if (timedOut) {
    return { file: rel, status: 'timeout', ms, excerpt: [`timed out after ${Math.round(timeoutMs / 1000)}s`] };
  }
  if (r.error) {
    return { file: rel, status: 'error', ms, excerpt: [`child error: ${r.error.message}`] };
  }
  const counts = parseSpecCounts(output);
  if (r.status === 0) {
    const skipped = counts.skipped || 0;
    return { file: rel, status: 'pass', ms, counts, skipped, exitCode: 0, excerpt: [] };
  }
  return {
    file: rel,
    status: 'fail',
    ms,
    counts,
    skipped: counts.skipped || 0,
    exitCode: r.status,
    signal: r.signal || null,
    excerpt: failureExcerpt(output, r.stderr),
  };
}

function categorizeFailure(result) {
  const text = result.excerpt.join(' ');
  if (result.status === 'timeout') return 'timeout';
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError|is not defined|Unexpected (token|identifier)/i.test(text)) return 'load-or-syntax-error';
  if (/playwright|chromium|browser|page\.(goto|click)|electron|navigator|document is not defined|window is not defined|localStorage|DOM|WebSocket|listen EADDR|fetch failed|ECONNREFUSED/i.test(text)) return 'needs-env-browser-or-server';
  if (/AssertionError|expected .*(to |to)|assert|strictEqual|deepStrictEqual|not ok/i.test(text)) return 'assertion';
  return 'other';
}

// ---------- reporting ----------

function sizeDistribution(unrouted, lineCounts) {
  return LINE_BUCKETS.map(([label, lo, hi]) => {
    const n = unrouted.filter((f) => lineCounts[f] >= lo && lineCounts[f] < hi).length;
    return { label, n };
  });
}

function writeReport(reportPath, summary, runResults, lineCounts) {
  const dir = path.dirname(reportPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const lines = [];
  lines.push('# Latent test-suite discovery report (DUST P7 / BS-9a)');
  lines.push('');
  lines.push(`Generated ${summary.generatedISO} by \`node scripts/dust-suite-discover.mjs ${summary.argv.join(' ').trim()}\` (node ${process.version}).`);
  lines.push('');
  lines.push('Report-only census of `test/**/*.test.mjs` files not wired into any package.json script.');
  lines.push('It gates nothing and does not modify the check chain. Matching rules: exact script-string');
  lines.push('path (R1), shell-glob expansion (R2), whole-test-dir reference (R3) — see the header of');
  lines.push('`scripts/dust-suite-discover.mjs`.');
  lines.push('');
  lines.push('## Population');
  lines.push('');
  lines.push('| measure | count |');
  lines.push('|---|---|');
  lines.push(`| total \`test/**/*.test.mjs\` | ${summary.total} |`);
  lines.push(`| routed (referenced by an npm script) | ${summary.routed} |`);
  lines.push(`| unrouted (latent) | ${summary.unrouted} |`);
  lines.push(`| routed via exact path / glob / dir | ${summary.routedBy.exact} / ${summary.routedBy.glob} / ${summary.routedBy.dir} |`);
  const other = Object.entries(summary.otherExtensions).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
  lines.push('');
  lines.push(other ? `Observed but not counted or run: ${other}.` : 'No other test-file extensions observed.');
  lines.push('');
  lines.push('### Unrouted size distribution (lines)');
  lines.push('');
  lines.push('| bucket | files |');
  lines.push('|---|---|');
  for (const b of summary.sizeDist) lines.push(`| ${b.label} | ${b.n} |`);
  lines.push('');
  if (!runResults) {
    lines.push('## Run sample');
    lines.push('');
    lines.push('Not run in this invocation (summary mode). Use `--run` to sample the latent set.');
    lines.push('');
  } else {
    lines.push('## Run sample');
    lines.push('');
    lines.push(`Ran ${runResults.length} unrouted file(s) with \`node --test <file>\`, per-file timeout ${Math.round(summary.timeoutMs / 1000)}s${summary.budgetMs ? `, wall-clock budget ${Math.round(summary.budgetMs / 60000)} min` : ''}.`);
    lines.push('');
    const by = {};
    for (const r of runResults) by[r.status] = (by[r.status] || 0) + 1;
    lines.push('| outcome | files |');
    lines.push('|---|---|');
    for (const k of ['pass', 'fail', 'timeout', 'error', 'not-run']) lines.push(`| ${k} | ${by[k] || 0} |`);
    lines.push('');
    lines.push('| outcome | seconds | file |');
    lines.push('|---|---|---|');
    for (const r of runResults) {
      lines.push(`| ${r.status}${r.status === 'pass' && r.skipped ? ` (${r.skipped} skipped)` : ''} | ${(r.ms / 1000).toFixed(1)} | ${r.file} |`);
    }
    lines.push('');
    const fails = runResults.filter((r) => r.status !== 'pass' && r.status !== 'not-run');
    if (fails.length) {
      lines.push('### Categorized failures');
      lines.push('');
      const groups = {};
      for (const f of fails) (groups[categorizeFailure(f)] ||= []).push(f);
      for (const [cat, list] of Object.entries(groups).sort()) {
        lines.push(`#### ${cat} (${list.length})`);
        lines.push('');
        for (const f of list) {
          lines.push(`- **${f.file}** (${f.status}, exit ${f.exitCode ?? '-'}${f.signal ? ` ${f.signal}` : ''}, ${(f.ms / 1000).toFixed(1)}s, ${lineCounts[f.file] ?? '?'} lines)`);
          for (const l of f.excerpt) lines.push(`  - \`${l.replace(/`/g, "'")}\``);
        }
        lines.push('');
      }
    }
    const done = runResults.filter((r) => r.status !== 'not-run');
    if (done.length) {
      const mean = done.reduce((a, r) => a + r.ms, 0) / done.length;
      lines.push(`Estimated full latent-set serial runtime from this sample: ~${(mean * summary.unrouted / 3600_000).toFixed(1)} h (${mean.toFixed(0)} ms/file mean over ${done.length} files; timeout-capped files skew this low).`);
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
  lines.push('This artifact informs Finish T1 manifest-runner work; it does not replace it and gates nothing.');
  writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

// ---------- main ----------

function main() {
  const argv = process.argv.slice(2);
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`dust-suite-discover: ${err.message}`);
    usage();
    process.exit(2);
  }
  if (args.help || args._.length) {
    usage();
    process.exit(args._.length ? 2 : 0);
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 0)) {
    console.error('dust-suite-discover: --limit must be a non-negative number');
    process.exit(2);
  }
  if (args.timeout !== undefined && (!Number.isFinite(args.timeout) || args.timeout <= 0)) {
    console.error('dust-suite-discover: --timeout must be a positive number of ms');
    process.exit(2);
  }
  if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget <= 0)) {
    console.error('dust-suite-discover: --budget must be a positive number of ms');
    process.exit(2);
  }
  if (args.shardCount !== undefined && (args.shardIndex < 0 || args.shardIndex >= args.shardCount)) {
    console.error('dust-suite-discover: --shard index must satisfy 0 <= i < k');
    process.exit(2);
  }

  // Enumerate + compute routed.
  const files = enumerateTestFiles();
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (err) {
    console.error(`dust-suite-discover: cannot read package.json (${err.message})`);
    process.exit(2);
  }
  const scriptTexts = Object.values(pkg.scripts || {}).filter((v) => typeof v === 'string');
  const { routed, routedBy } = computeRouted(files, scriptTexts);
  const unrouted = files.filter((f) => !routed.has(f));

  const lineCounts = {};
  for (const f of unrouted) lineCounts[f] = lineCount(f);
  const sizeDist = sizeDistribution(unrouted, lineCounts);
  const otherExtensions = countOtherTestExtensions();

  console.log(`dust-suite-discover — latent test census (report-only, gates nothing)`);
  console.log(`  total test/**/*.test.mjs : ${files.length}`);
  console.log(`  routed by npm scripts   : ${routed.size}  (exact ${routedBy.exact}, glob ${routedBy.glob}, dir ${routedBy.dir})`);
  console.log(`  unrouted (latent)       : ${unrouted.length}  (${((unrouted.length / Math.max(1, files.length)) * 100).toFixed(1)}%)`);
  const other = Object.entries(otherExtensions).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
  if (other) console.log(`  noted, not counted      : ${other}`);
  console.log(`  unrouted size (lines)   : ${sizeDist.map((b) => `${b.label}=${b.n}`).join('  ')}`);

  let runResults = null;
  if (args.run) {
    const timeoutMs = args.timeout ?? DEFAULT_TIMEOUT_MS;
    const limit = args.limit ?? DEFAULT_RUN_LIMIT;
    const pool = args.shardCount ? unrouted.filter((_, i) => i % args.shardCount === args.shardIndex) : unrouted;
    const selected = pool.slice(0, limit);
    const startedAt = Date.now();
    console.log(`\nrun: ${selected.length} of ${pool.length} shard files (${unrouted.length} latent total), per-file timeout ${Math.round(timeoutMs / 1000)}s${args.budget ? `, budget ${Math.round(args.budget / 60000)} min` : ''}`);
    runResults = [];
    for (let i = 0; i < selected.length; i += 1) {
      const rel = selected[i];
      if (args.budget && Date.now() - startedAt > args.budget) {
        runResults.push({ file: rel, status: 'not-run', ms: 0, excerpt: ['skipped: wall-clock budget exceeded'] });
        continue;
      }
      const r = runOne(rel, timeoutMs);
      runResults.push(r);
      const extra = r.status === 'pass' && r.skipped ? ` (${r.skipped} skipped)` : '';
      console.log(`${String(i + 1).padStart(3)} ${r.status.toUpperCase().padEnd(7)} ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${rel}${extra}`);
      if (r.excerpt.length) for (const l of r.excerpt.slice(0, 2)) console.log(`      ${l}`);
    }
    const by = {};
    for (const r of runResults) by[r.status] = (by[r.status] || 0) + 1;
    console.log(`\nrun outcome: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
    const done = runResults.filter((r) => r.status !== 'not-run');
    if (done.length) {
      const mean = done.reduce((a, r) => a + r.ms, 0) / done.length;
      console.log(`estimated full latent serial runtime: ~${(mean * unrouted.length / 3600_000).toFixed(1)} h (${mean.toFixed(0)} ms/file mean; timeout-capped files skew low)`);
    }
  } else {
    console.log(`  estimated latent runtime : TBD (no run sample; use --run)`);
  }

  if (args.out !== undefined) {
    let reportPath = path.resolve(ROOT, args.out);
    const dustDir = path.resolve(DUST_DIR);
    const inside = reportPath === dustDir || reportPath.startsWith(dustDir + path.sep);
    if (!inside) {
      console.error(`dust-suite-discover: --out must live under design/program/dust/ — forcing ${path.relative(ROOT, DEFAULT_REPORT)}`);
      reportPath = DEFAULT_REPORT;
    }
    const summary = {
      generatedISO: new Date().toISOString(),
      argv,
      total: files.length,
      routed: routed.size,
      unrouted: unrouted.length,
      routedBy,
      otherExtensions,
      sizeDist,
      timeoutMs: args.timeout ?? DEFAULT_TIMEOUT_MS,
      budgetMs: args.budget ?? null,
    };
    try {
      writeReport(reportPath, summary, runResults, lineCounts);
      console.log(`\nreport written: ${path.relative(ROOT, reportPath)}`);
    } catch (err) {
      console.error(`dust-suite-discover: could not write report (${err.message}) — census above still valid`);
    }
  }
  process.exit(0);
}

try {
  main();
} catch (err) {
  // The census must never crash the caller; a child crash is already classified above.
  console.error(`dust-suite-discover: unexpected internal error: ${err && err.stack ? err.stack : err}`);
  process.exit(0);
}
