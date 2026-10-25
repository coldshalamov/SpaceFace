import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/** Audit a directory tree against an expected set of forward-slash relative paths.
 *  opts.prune deletes stray files (directories are recursed, never removed).
 *  opts.extensions (a RegExp) limits flagging to matching filenames so OS debris
 *  (Thumbs.db, .gitkeep) isn't counted as corpus drift.
 *  Returns the flagged relative paths — pruned files are still reported. */
export function auditExpectedTree(dir, expectedRels, opts = {}) {
  const flagged = [];
  if (!existsSync(dir)) return flagged;
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(path.join(d, e.name), rel); continue; }
      if (opts.extensions && !opts.extensions.test(e.name)) continue;
      if (expectedRels.has(rel)) continue;
      if (opts.prune) unlinkSync(path.join(d, e.name));
      flagged.push(rel);
    }
  };
  walk(dir, '');
  return flagged.sort(); // deterministic ordering — stray lists shouldn't vary by filesystem
}
