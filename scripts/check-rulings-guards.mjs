#!/usr/bin/env node
// PQ-186.01 — Rulings as guards.
//
// The owner's rulings of 2026-09-03 (design/program/FUN_CONVERGENCE_LOOP.md §7, FEEL_CONTRACT.md
// §D) are the reasons the game felt bad: drag, clamps on given momentum, hidden gyros, HP-scaled
// hits, dialogue trees, and randomness nobody can test. Each was added by an agent for a locally
// sane reason. This check is the part of the fortress that reads the source, so the next agent's
// locally sane reason fails a check instead of shipping.
//
// Two kinds of guard:
//   ban      — the pattern must not appear anywhere in the guarded roots. Zero on master today.
//   ratchet  — the pattern appears on master in named places (a drone hover, wall-clock offline
//              progress, a handful of legacy velocity writes). Those are baselined per file in
//              test/rulings-guard-baseline.json and may only go DOWN. A new file, or a file whose
//              count grows, is a violation. `--write-baseline` re-records the counts after a
//              deliberate, receipted reduction; it is never run to make the check pass.
//
// Runtime guards (the player knock budget and the NPC no-gyro bar) already exist as suites and are
// run by `check:rulings` as child processes, so their exit codes count (the §7 trap: a check that
// imports a node:test file cannot fail).
//
// Usage:
//   node scripts/check-rulings-guards.mjs                # scan the tree, compare to the baseline
//   node scripts/check-rulings-guards.mjs --write-baseline
//   node scripts/check-rulings-guards.mjs --json
//   node scripts/check-rulings-guards.mjs --files a.js b.js   # scan only these (fixtures)

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const BASELINE_PATH = 'test/rulings-guard-baseline.json';

/** The physics authority and its backends: the one place velocity, damping and contact are written. */
const PHYSICS_OWNER = Object.freeze([
  'src/core/sg02DynamicBodyOwner.js',
  'src/core/physics.js',
  'src/core/rapierCollisionWorld.js',
  'src/core/physicsAuthority.js',
]);

const SIM_ROOTS = Object.freeze(['src/systems', 'src/core', 'src/combat', 'src/ai']);
const NON_OWNER_ROOTS = Object.freeze(['src/systems', 'src/combat', 'src/ai']);

/**
 * Every guard quotes the ruling it serves. `pattern` is tested per line with comments and string
 * literals blanked, so a comment that says "never Math.random" is not a finding.
 */
export const GUARDS = Object.freeze([
  {
    id: 'no-ambient-randomness',
    kind: 'ratchet',
    ruling: 'Random or procedural content is neither wanted nor banned. What is banned is anything agents cannot test: every bench uses fixed seeds. Sim uses state.rng.',
    roots: SIM_ROOTS,
    pattern: /\bMath\.random\s*\(/,
  },
  {
    id: 'no-wall-clock-in-sim',
    kind: 'ratchet',
    ruling: 'Sim uses state.simTime rather than ambient randomness or wall time (ARCHITECTURE.md); a result without a seed is an anecdote.',
    roots: SIM_ROOTS,
    pattern: /\b(?:Date\.now|performance\.now)\s*\(/,
  },
  {
    id: 'no-linear-damping',
    kind: 'ratchet',
    ruling: 'Never add drag. Never clamp given momentum. Only the brake spends earned momentum.',
    roots: SIM_ROOTS,
    exclude: PHYSICS_OWNER,
    // setLinearDamping / linearDamping = ..., or velocity scaled by a fraction of itself each tick.
    pattern: /\bsetLinearDamping\s*\(|\.linearDamping\s*=[^=]|\.vel\.(?:x|z)\s*\*=\s*(?:Math\.max\(\s*0\s*,\s*)?\(?\s*(?:1\s*-|0?\.\d)/,
  },
  {
    id: 'no-velocity-writes-outside-owner',
    kind: 'ratchet',
    ruling: 'Single writers: the physics owner owns velocity. Other systems emit intents, impulses and events; a transform or velocity write from a system is a hidden gyro or a hidden brake.',
    roots: NON_OWNER_ROOTS,
    exclude: PHYSICS_OWNER,
    pattern: /\.vel\.(?:x|z)\s*(?:[+\-*/])?=(?!=)/,
  },
  {
    id: 'no-hp-scaled-knockback',
    kind: 'ban',
    ruling: 'Enemies do not become damage sponges and hits do not scale with levels; mass and momentum decide. Do not scale knockback with victim HP % (FEEL_CONTRACT §C, adopted refusal).',
    roots: ['src/systems', 'src/combat', 'src/ai'],
    pattern: /\b(?:impulse|knockback|knock|shove|push|throw|fling)\w*\s*(?:\*=|=\s*[^;\n]*\*)\s*[^;\n]*\b(?:hp|hull|health)(?:Fraction|Frac|Ratio|Pct|Percent|Missing|Lost)?\b/i,
  },
  {
    id: 'no-dialogue-trees',
    kind: 'ratchet',
    ruling: 'No dialogue trees. One linear story that builds. Branching and replay value are not goals. The endings that already exist stay; no new branch work.',
    roots: ['src/data'],
    pattern: /\bchoices\s*:\s*\[|\b(?:dialogueTree|nextNodeId|gotoNode|branchTo)\b/,
  },
]);

/** Blank comments and string literals so wording inside them is never a finding. */
export function blankCommentsAndStrings(source) {
  return source.replace(
    /(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match) => match.replace(/[^\n]/g, ' '),
  );
}

function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(file);
    return /\.(?:m?js|cjs)$/.test(entry.name) ? [file] : [];
  });
}

function toRepoPath(file) {
  return relative(ROOT, resolve(file)).replace(/\\/g, '/');
}

/**
 * Scan the given files with one guard. Pure over file contents.
 * @returns {Array<{file:string, line:number, text:string}>}
 */
export function scanGuard(guard, files, readFile = (f) => readFileSync(f, 'utf8')) {
  const findings = [];
  const excluded = new Set((guard.exclude || []).map((p) => p.replace(/\\/g, '/')));
  for (const file of files) {
    const rel = toRepoPath(file);
    if (excluded.has(rel)) continue;
    const lines = blankCommentsAndStrings(readFile(file)).split('\n');
    lines.forEach((text, i) => {
      if (guard.pattern.test(text)) findings.push({ file: rel, line: i + 1, text: text.trim().slice(0, 120) });
    });
  }
  return findings;
}

/** Findings per guard over the guarded roots (or an explicit file list). */
export function scanTree({ files = null, root = ROOT } = {}) {
  const out = {};
  for (const guard of GUARDS) {
    const targets = files
      ? files
      : guard.roots.flatMap((r) => listSourceFiles(join(root, r)));
    out[guard.id] = scanGuard(guard, targets);
  }
  return out;
}

export function countsByFile(findings) {
  const counts = {};
  for (const f of findings) counts[f.file] = (counts[f.file] || 0) + 1;
  return counts;
}

/**
 * Compare a scan against the baseline. A ban must have zero findings. A ratchet may not have a
 * file above its baselined count, nor a file the baseline does not name.
 */
export function judge(scan, baseline) {
  const violations = [];
  const improvements = [];
  for (const guard of GUARDS) {
    const counts = countsByFile(scan[guard.id] || []);
    if (guard.kind === 'ban') {
      for (const f of scan[guard.id] || []) violations.push({ guard: guard.id, ...f, why: 'banned' });
      continue;
    }
    const allowed = (baseline && baseline.guards && baseline.guards[guard.id]) || {};
    for (const [file, n] of Object.entries(counts)) {
      const max = allowed[file] || 0;
      if (n > max) {
        for (const f of (scan[guard.id] || []).filter((x) => x.file === file)) {
          violations.push({ guard: guard.id, ...f, why: max ? `ratchet: ${n} > baselined ${max}` : 'ratchet: new file' });
        }
      } else if (n < max) {
        improvements.push({ guard: guard.id, file, was: max, now: n });
      }
    }
    for (const [file, max] of Object.entries(allowed)) {
      if (!(file in counts) && max > 0) improvements.push({ guard: guard.id, file, was: max, now: 0 });
    }
  }
  return { violations, improvements };
}

export function readBaseline(path = join(ROOT, BASELINE_PATH)) {
  if (!existsSync(path)) return { schema: 'spaceface.rulingsGuardBaseline.v1', guards: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildBaseline(scan) {
  const guards = {};
  for (const guard of GUARDS) {
    if (guard.kind !== 'ratchet') continue;
    const counts = countsByFile(scan[guard.id] || []);
    guards[guard.id] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  }
  return {
    schema: 'spaceface.rulingsGuardBaseline.v1',
    note: 'Per-file counts of ratcheted patterns on master. Counts may only go down. Re-record with --write-baseline after a receipted reduction, never to pass.',
    guards,
  };
}

function main(argv) {
  const json = argv.includes('--json');
  const write = argv.includes('--write-baseline');
  const filesIdx = argv.indexOf('--files');
  const files = filesIdx >= 0 ? argv.slice(filesIdx + 1).map((f) => resolve(f)) : null;
  const scan = scanTree({ files });
  if (write) {
    const baseline = buildBaseline(scan);
    writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`rulings-guards: baseline written to ${BASELINE_PATH}`);
    return 0;
  }
  const baseline = files ? { guards: {} } : readBaseline();
  const { violations, improvements } = judge(scan, baseline);
  if (json) {
    console.log(JSON.stringify({ scan, violations, improvements }, null, 2));
  } else {
    for (const v of violations) {
      const guard = GUARDS.find((g) => g.id === v.guard);
      console.error(`${v.file}:${v.line}: [${v.guard}] ${v.why} — ${guard.ruling}\n    ${v.text}`);
    }
    for (const imp of improvements) {
      console.log(`rulings-guards: ${imp.guard} ${imp.file} ${imp.was} -> ${imp.now} (below baseline; re-record when receipted)`);
    }
    const total = Object.values(scan).reduce((n, list) => n + list.length, 0);
    console.log(`rulings-guards: ${violations.length ? 'FAIL' : 'PASS'} (${violations.length} violations, ${total} baselined occurrences, ${GUARDS.length} guards)`);
  }
  return violations.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
