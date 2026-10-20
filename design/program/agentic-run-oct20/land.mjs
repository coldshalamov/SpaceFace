#!/usr/bin/env node
// Controller landing: node land.mjs <row> --msg="..." --task="..." --claim="..." [--board=delete|keep] [--extra=path,path]
// Commits the row's files.txt paths (+ build_map.md when the board row was edited), files the
// LANDED_REVIEW row in a second commit, then fetch/merge/push origin master.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(RUN, '../../..');
const row = String(process.argv[2] || '').replace(/^R/i, '');
const opt = (k, d = '') => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();
const TRAILER = ['-m', 'Generated with [Devin](https://devin.ai)', '-m', 'Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>'];

const files = readFileSync(join(RUN, 'out', `R${row}`, 'files.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean);
const extra = opt('extra').split(',').map((s) => s.trim()).filter(Boolean);
const board = opt('board', 'delete');
if (board === 'delete') {
  const bm = join(REPO, 'build_map.md');
  const lines = readFileSync(bm, 'utf8').split('\n');
  const kept = lines.filter((l) => !l.startsWith(`| ${row} | `));
  if (kept.length !== lines.length) writeFileSync(bm, kept.join('\n'));
}
const paths = [...files, ...extra, 'build_map.md'];
git('add', '-N', '--', ...files.filter((f) => { try { git('ls-files', '--error-unmatch', '--', f); return false; } catch { return true; } }));
git('add', '--', ...paths);
execFileSync('git', ['commit', '-q', '-m', opt('msg'), ...TRAILER, '--', ...paths], { cwd: REPO, stdio: 'inherit' });
const sha = git('rev-parse', 'HEAD');
const stat = git('show', '--stat', '--format=', 'HEAD');
console.log(stat);

const lr = join(REPO, 'design/program/LANDED_REVIEW.md');
const lrLines = readFileSync(lr, 'utf8').split('\n');
let at = -1; lrLines.forEach((l, i) => { if (l.startsWith('| R-')) at = i; });
const clean = (s) => s.replace(/\|/g, '/');
lrLines.splice(at + 1, 0, `| R-${sha.slice(0, 7)} | ${sha.slice(0, 11)} | Row ${row}: ${clean(opt('task'))} | ${clean(opt('claim'))} | OPEN |`);
writeFileSync(lr, lrLines.join('\n'));
execFileSync('git', ['commit', '-q', '-m', `File R-${sha.slice(0, 7)}: second look on row ${row}`, ...TRAILER, '--', 'design/program/LANDED_REVIEW.md'], { cwd: REPO, stdio: 'inherit' });

git('fetch', '-q', '--prune', 'origin');
const [, behind] = git('rev-list', '--left-right', '--count', 'master...origin/master').split(/\s+/).map(Number);
if (behind > 0) execFileSync('git', ['merge', '--no-edit', 'origin/master'], { cwd: REPO, stdio: 'inherit' });
execFileSync('git', ['push', '-q', 'origin', 'master'], { cwd: REPO, stdio: 'inherit' });
console.log(`LANDED R${row} ${sha}`);
