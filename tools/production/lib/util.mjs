// SAFE-001 shared utilities. Zero runtime dependencies (repo policy).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function sha256String(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Atomic write: temp sibling + rename. Rename is atomic per-file on NTFS/ext4.
export function atomicWriteJson(filePath, value, { tmpPath = null } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPath || path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const relativeTmp = path.relative(path.resolve(dir), path.resolve(tmp));
  if (relativeTmp.startsWith('..' + path.sep) || relativeTmp === '..' || path.isAbsolute(relativeTmp)) {
    throw new Error(`atomic JSON temp must be a sibling of destination: ${tmp}`);
  }
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

// Recursively list files under root (relative, forward-slash), honoring an
// exclusion predicate on relative paths. Symlinks/junctions are NOT followed
// (a linked node_modules must not be walked or hashed).
export function walkFiles(root, isExcluded = () => false) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(root, rel) : root;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcluded(childRel)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  out.sort();
  return out;
}

// Convert a small glob subset (** and *) to a RegExp over forward-slash
// relative paths. Enough for writable-path allowlists; no brace/negation.
export function globToRegExp(glob) {
  const norm = String(glob).replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (ch === '*') {
      if (norm[i + 1] === '*') {
        re += '.*';
        i++;
        if (norm[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(relPath, regexps) {
  const norm = relPath.replace(/\\/g, '/');
  return regexps.some((re) => re.test(norm));
}

export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}
