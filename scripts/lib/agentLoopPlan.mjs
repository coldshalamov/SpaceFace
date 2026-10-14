// Read-only routing advice, not an impact-analysis oracle or an acceptance receipt.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

export function parseOptions(argv, allowed) {
  const options = Object.create(null), positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const at = token.indexOf('=');
    const key = token.slice(2, at < 0 ? undefined : at);
    if (!Object.hasOwn(allowed, key)) throw new Error(`Unknown option --${key}`);
    if (Object.hasOwn(options, key) && allowed[key] !== 'list') throw new Error(`Duplicate option --${key}`);
    if (allowed[key] === 'boolean') {
      if (at >= 0) throw new Error(`--${key} does not take a value`);
      options[key] = true;
    } else {
      const value = at >= 0 ? token.slice(at + 1) : argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value`);
      if (allowed[key] === 'list') (options[key] ||= []).push(value);
      else options[key] = value;
    }
  }
  return { options, positional };
}

export function positiveInteger(value, fallback, max = 600_000) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) throw new Error(`Expected an integer in 1..${max}: ${value}`);
  return n;
}

export function insideRoot(root, file) {
  const base = realpathSync(root), target = realpathSync(resolve(root, file));
  const rel = relative(base, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(target).isFile()) {
    throw new Error(`Expected a file inside the repository: ${file}`);
  }
  return target;
}

export function scenarioPath(root, ref) {
  const name = /[\\/]|\.json$/.test(ref) ? ref : `src/testing/scenarios/${ref}.scenario.json`;
  return insideRoot(root, name);
}

export function planForFiles(paths) {
  const files = [...new Set(paths.map(p => p.replaceAll('\\', '/')))].sort();
  const advice = [], obligations = [], unmapped = [];
  const add = (id, command, reason) => {
    if (!advice.some(a => a.id === id)) advice.push({ id, command, reason });
  };
  for (const file of files) {
    if (/^(docs\/|design\/)|\.(md|txt)$/.test(file)) {
      add('docs', 'git diff --check', 'Check edited links/metadata too; prose alone needs no browser.');
    } else if (/^(src\/ui\/|styles\/|tools\/ui-bench|scripts\/ui-bench)/.test(file)) {
      add('ui', 'node scripts/ui-bench.mjs --list', 'Select the real screen, then batch it with --shot and --viewports; inspect PNGs and walk changed controls.');
      obligations.push('UI fixture interactions do not prove live screen transitions, input routing, or persistence.');
    } else if (/flight|massline|tether|physics|combat|weapons/i.test(file) && file.startsWith('src/')) {
      add('sim', 'node scripts/agent-loop.mjs sim flight-fixed-input', 'Example only: select or author a scenario that exercises the changed owner; this is not universal gameplay coverage.');
      obligations.push('Gameplay changes still need the affected mode’s player-truth --gate at the coherent integration boundary.');
    } else if (/^(src\/runtime\/|src\/core\/|electron\/)|(^|\/)(main|boot|loop)\.[cm]?js$|^assets\//.test(file)) {
      add('wiring', 'Read docs/VALIDATION_WORKFLOW.md', 'Focused owner/import checks first; startup, runtime registration, assets and shell changes also require the affected public route.');
      obligations.push('Batch one affected public-route verification after focused checks; never replace startup/asset proof with a detached fixture.');
    } else if (/^(scripts\/|test\/|tools\/)/.test(file)) {
      add('harness', 'Read scripts/AGENTS.md and test/AGENTS.md', 'Run the exact owner regression; a test filename does not imply it is browser-free.');
    } else unmapped.push(file);
  }
  if (!files.length) obligations.push('No changed paths were supplied or detected; no coverage claim was made.');
  if (unmapped.length) obligations.push('Unmapped paths need an explicit owner test/scenario; they are not silently covered.');
  return { schema: 'spaceface.agentLoopPlan.v1', nonPromoting: true, files, advice,
    unresolved: [...new Set(obligations)], unmapped, gameBoots: 0,
    note: 'Routing suggestions only. No tests ran; no integration or player-acceptance claim.' };
}

// Failure suppression only, NEVER a cache of passing acceptance. Hash bytes, not mtimes.
export function failureKey(root, files, invocation, environment = {}) {
  const hash = createHash('sha256');
  const part = value => { const b = Buffer.from(value); hash.update(String(b.length) + ':'); hash.update(b); };
  part(realpathSync(root)); part(JSON.stringify(invocation));
  part(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, ...environment }));
  for (const file of [...new Set(files)].sort()) {
    part(file);
    try { part(readFileSync(insideRoot(root, file))); }
    catch (error) { if (error.code === 'ENOENT') part('<absent>'); else throw error; }
  }
  return hash.digest('hex');
}

export function aggregateRows(rows, expected) {
  const complete = rows.length === expected;
  const diagnostic = complete && rows.length > 0 && rows.every(r => r.diagnostic === true && r.captureOk === true && r.exitClass === 4);
  const ok = complete && rows.length > 0 && rows.every(r => r.exitClass === 0 && r.ok === true && r.nonPromoting !== true);
  return { ok, nonPromoting: true, status: ok ? 'focused-checks-passed' : diagnostic ? 'diagnostic-complete' : complete ? 'failed-or-incomplete' : 'interrupted',
    exitClass: ok ? 0 : diagnostic ? 4 : complete ? Math.max(1, ...rows.map(r => Number.isInteger(r.exitClass) ? r.exitClass : 3)) : 3,
    completed: rows.length, expected, gameBoots: 0,
    note: 'Orchestration summary, not a new evidence class. Original executor results retain their own scope. Public-route acceptance is separate.' };
}
