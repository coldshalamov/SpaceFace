#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const MASTER = 'refs/remotes/origin/master';
const OUT_DIR = 'design/program/branch-consolidation';

const DONORS = Object.freeze([
  ['map-pr98', 'da3288c35fa48bf84c80a20e4db90786377c415b'],
  ['boot-pr97', 'e3d52826ad6db3a03b75b3dd169a903e4ed2d490'],
  ['remove-overheating', '6ee1fb083d01f98ef8d39d537d12668b088f9b0b'],
  ['perf-exact-opening-residency', '6ab735b912f0c0a1a7c33670e4d7ab7ff490a364'],
  ['ac03-kill-rp', '8090de11862aed1d62f1bb985ec0f62e4aa7d0c7'],
  ['ac04-readable-tumble', 'a72ae911672e02d27c8210dd1d5cd205bd64f55a'],
  ['ac05-juice-discipline', '1deee482f3318692918d1ff2f8de41b50dc514d0'],
  ['ac08-kill-causes', '93fb72de7d1709235603a0013cabd5a4ccc2dfdd'],
  ['ac09-death-signatures', '2a3ec8d45764102fa4d708027b2c060d36fafaf0'],
  ['ac11-starter-envkill', '1ceae3824ed5b3a0a3b61f6b23359e56e235a10c'],
  ['ac12-vacuum-inhale', '801f276215e0c247b678321017849274433a2822'],
  ['ac13-planets-reroute', '6cf62360d0a3f3acb4659f994c7c02117713c243'],
  ['ac14-living-chain-protected', '0f82fbe53052ae8a33b9a6496df936567f9ea304'],
  ['ac15-wing-cargo', 'cb35a04dbd5b2886ecee360d9802569645a5baa0'],
  ['ac16-mote-pack', 'f9cc03f5632c779452c73c3b4bb0444d3408486d'],
  ['ac17-force-legibility', '123c8543a7b92a5031edeca53f1c9d9c7241b233'],
  ['ac18-damage-dressing', 'cad43061b997f5cc724deee9ae5f6a6482ce83d7'],
  ['pr95-named-ace', '72b298c3a23b5cae89373c5368ab1702974648d5'],
  ['pr95-swarmer-tells', '75b1c4015afc916ddac9fc2ed9d88cbba9718c5f'],
  ['pr95-validation', '03449b42a4a802384e4d4058f6580f9cf59d4184'],
  ['fable-aquarium-repairs', 'cfd84595afc579c4fce16e740787c33cdfbce94c'],
  ['fable-presence-repairs', 'a6e237720aecf3da6c39af603217da6155bd8514'],
  ['fable-salvor', 'dbbfec0e8d9adac44a668da3befa18dfe634521f'],
  ['fable-seam-depletion', '204e16e9ef24f3c5a80f3d72f5a2d1ce0819ef59'],
  ['fable-raider', '7246a59d90a73fb114d169985017099ec5ad377c'],
  ['fable-field-anchor', '905a18837691e09e3199379609b4fb40e3cbb83d'],
  ['fable-dense-camera', 'd4a7b718c4f5834356bb5693402c59fb13b792c2'],
  ['fable-wreck-dressing-protected', 'fd71977574607d0f21b0e0a0027b0e732fec6310'],
  ['fable-causal-chain-protected', 'b76832e4df589bb006af13e74120b809eb766572'],
  ['fable-receipts-coverage', 'dd48027642f238e1136da470b10da27f58cc3fd7'],
  ['fable-material-keys', 'ae9f5a279ac0cec7399746f1172bbe62f7a3f6ee'],
  ['fable-trails', '0c7a1e7b401032d9b59d55eb980d9e102dddad98'],
  ['fable-u11-tuning', '1e14e6dbabecee1b0a4319fd3d07b5efec757758'],
  ['fable-massline-fix', 'dab1e510c0f8f0c198f32141e53e882c97e78d21'],
  ['fable-target-motion-audit', '5caa0fc63cca1b2eae346dd7c7aeba5ccbfa8672'],
]);

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return result;
}

function git(args, options = {}) {
  const result = run('git', args, options);
  return { ...result, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

function lines(value) {
  return String(value || '').split(/\r?\n/).filter(Boolean);
}

function reset() {
  git(['cherry-pick', '--abort'], { allowFailure: true });
  git(['reset', '--hard', MASTER]);
  git(['clean', '-fd']);
}

function syntaxCheck(files) {
  const rows = [];
  for (const file of files.filter((path) => /\.(?:m?js|cjs)$/.test(path) && !path.startsWith('vendor/'))) {
    const result = run('node', ['--check', file], { allowFailure: true });
    if (result.status !== 0) rows.push({ file, error: result.stderr || result.stdout });
  }
  return rows;
}

const master = git(['rev-parse', MASTER]).stdout;
const results = [];
for (const [id, commit] of DONORS) {
  reset();
  const object = git(['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true });
  if (object.status !== 0) {
    results.push({
      id,
      commit,
      missingCommit: true,
      subject: '',
      committedAt: '',
      cleanApply: false,
      emptyAfterApply: false,
      conflictFiles: [],
      changedFileCount: 0,
      changedFiles: [],
      shortStat: '',
      whitespaceClean: false,
      whitespaceErrors: '',
      syntaxClean: false,
      syntaxErrors: [],
      stderr: object.stderr.slice(0, 8000),
    });
    continue;
  }
  const subject = git(['show', '-s', '--format=%s', commit]).stdout;
  const committedAt = git(['show', '-s', '--format=%cI', commit]).stdout;
  const apply = git(['cherry-pick', '--no-commit', commit], { allowFailure: true });
  const conflicts = lines(git(['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }).stdout);
  const changed = lines(git(['diff', '--name-only', 'HEAD'], { allowFailure: true }).stdout);
  const stat = git(['diff', '--shortstat', 'HEAD'], { allowFailure: true }).stdout;
  const whitespace = git(['diff', '--check', 'HEAD'], { allowFailure: true });
  const syntaxErrors = apply.status === 0 ? syntaxCheck(changed) : [];
  const treeChanged = changed.length > 0;
  results.push({
    id,
    commit,
    missingCommit: false,
    subject,
    committedAt,
    cleanApply: apply.status === 0,
    emptyAfterApply: apply.status === 0 && !treeChanged,
    conflictFiles: conflicts,
    changedFileCount: changed.length,
    changedFiles: changed,
    shortStat: stat,
    whitespaceClean: whitespace.status === 0,
    whitespaceErrors: whitespace.status === 0 ? '' : (whitespace.stdout || whitespace.stderr),
    syntaxClean: syntaxErrors.length === 0,
    syntaxErrors,
    stderr: apply.status === 0 ? '' : apply.stderr.slice(0, 8000),
  });
}
reset();

mkdirSync(OUT_DIR, { recursive: true });
const summary = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  master,
  donorCount: results.length,
  cleanApplyCount: results.filter((row) => row.cleanApply).length,
  conflictCount: results.filter((row) => !row.cleanApply && !row.missingCommit).length,
  emptyCount: results.filter((row) => row.emptyAfterApply).length,
  missingCommitCount: results.filter((row) => row.missingCommit).length,
  results,
};
writeFileSync(`${OUT_DIR}/portability.json`, `${JSON.stringify(summary, null, 2)}\n`);

const esc = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const md = [
  '# Current-master donor portability',
  '',
  `Current master: \`${master}\``,
  '',
  '| Donor | Apply | Files | Conflicts | Syntax | Subject |',
  '|---|---|---:|---|---|---|',
];
for (const row of results) {
  const state = row.missingCommit ? 'MISSING' : row.cleanApply ? (row.emptyAfterApply ? 'EMPTY' : 'CLEAN') : 'CONFLICT';
  md.push(`| \`${row.id}\` | ${state} | ${row.changedFileCount} | ${row.conflictFiles.map((path) => `\`${esc(path)}\``).join(', ')} | ${row.syntaxClean ? 'OK' : 'FAIL'} | ${esc(row.subject).slice(0, 130)} |`);
}
md.push('', 'The probe resets to current master after every donor. A clean apply is only a portability fact, not an approval.');
writeFileSync(`${OUT_DIR}/PORTABILITY.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  master,
  donors: results.length,
  clean: summary.cleanApplyCount,
  conflicts: summary.conflictCount,
  empty: summary.emptyCount,
  missing: summary.missingCommitCount,
}, null, 2));
