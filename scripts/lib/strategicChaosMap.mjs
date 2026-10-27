import { lstatSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
export const START = '<!-- strategic-chaos-foundations:start -->';
export const END = '<!-- strategic-chaos-foundations:end -->';
export const MAP_SECTION = `${START}
The owner-directed [Strategic Chaos program](design/program/strategic-chaos/README.md)
connects strategic command, readable physics, multi-party operations and lasting consequences.
Its [thirteen implementation commissions](design/program/strategic-chaos/PROGRAM.md) extend
existing rows; SC labels are document labels, not new queue IDs or completion claims.
Use \`node scripts/strategic-chaos.mjs brief SC-01\` for a complete agent assignment, and the
[foundation checks and proof adapter](design/program/strategic-chaos/FOUNDATIONS.md) for evidence.
Current claims, ordinary-route acceptance, INFERENCE and the existing single-writer owners remain authoritative.
${END}`;

export function integrateBuildMap(source) {
  if (typeof source !== 'string') throw new TypeError('Build map must be text.');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const block = MAP_SECTION.replaceAll('\n', eol);
  const starts = source.split(START).length - 1, ends = source.split(END).length - 1;
  if (starts || ends) {
    if (starts === 1 && ends === 1 && source.includes(block)) return { changed: false, text: source };
    throw new Error('Existing strategic-chaos section differs or is malformed; reconcile it instead of overwriting.');
  }
  const match = source.match(/^(?:\uFEFF)?<!-- LIFETIME: STABLE -->\r?\n# SpaceFace Build Map\r?\n/);
  if (!match) throw new Error('Unknown build-map opening; refusing an unanchored edit.');
  const offset = match[0].length;
  return { changed: true, text: source.slice(0, offset) + eol + block + eol + source.slice(offset) };
}

/** Dry-run by default. This writes only the additive map link, never stages/commits/pushes. */
export function installBuildMap(root, { apply = false } = {}) {
  const path = join(root, 'build_map.md');
  if (lstatSync(path).isSymbolicLink()) throw new Error('Refusing a symlinked build map.');
  const before = readFileSync(path, 'utf8');
  const proposal = integrateBuildMap(before);
  if (!apply || !proposal.changed) return { changed: proposal.changed, applied: false, section: MAP_SECTION };
  if (!existsSync(join(root, 'design/program/strategic-chaos/README.md'))) throw new Error('Install the package before linking it.');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git('status', '--porcelain', '--', 'build_map.md')) throw new Error('Build map has uncommitted changes; preserve/reconcile them first.');
  const head = git('rev-parse', 'HEAD');
  const lock = path + '.strategic-chaos.lock';
  const temp = path + `.strategic-chaos-${process.pid}.tmp`;
  let fd, ownsTemp = false;
  try {
    fd = openSync(lock, 'wx');
    if (existsSync(join(root, '.git/index.lock'))) throw new Error('Git index is busy.');
    if (readFileSync(path, 'utf8') !== before || git('rev-parse', 'HEAD') !== head) throw new Error('Source changed before write; retry after reconciliation.');
    writeFileSync(temp, proposal.text, { encoding: 'utf8', flag: 'wx' });
    ownsTemp = true;
    chmodSync(temp, lstatSync(path).mode & 0o777);
    if (readFileSync(path, 'utf8') !== before || git('rev-parse', 'HEAD') !== head) throw new Error('Source changed during preparation; refusing replacement.');
    renameSync(temp, path);
    return { changed: true, applied: true, section: MAP_SECTION };
  } finally {
    if (fd !== undefined) {
      if (ownsTemp && existsSync(temp)) unlinkSync(temp);
      closeSync(fd); unlinkSync(lock);
    }
  }
}
