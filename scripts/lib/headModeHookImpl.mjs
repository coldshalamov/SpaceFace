// The load hook behind scripts/lib/headModeHook.mjs. Not loaded directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO = (process.env.SPACEFACE_HEAD_REPO || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const MIRROR = (process.env.SPACEFACE_HEAD_MIRROR || '').replace(/\\/g, '/').replace(/\/+$/, '');
const cache = new Map(); // repo-relative path -> committed source, or null when the file is not modified

function committedSource(url) {
  if (!REPO || !MIRROR || !url.startsWith('file:')) return null;
  let abs;
  try { abs = fileURLToPath(url); } catch { return null; }
  const norm = abs.replace(/\\/g, '/').toLowerCase();
  if (!norm.startsWith(`${REPO}/`)) return null;
  const rel = norm.slice(REPO.length + 1);
  if (!cache.has(rel)) {
    let source = null;
    try { source = readFileSync(join(MIRROR, rel), 'utf8'); } catch { source = null; }
    cache.set(rel, source);
  }
  return cache.get(rel);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.format !== 'module') return result;
  const source = committedSource(url);
  return source == null ? result : { ...result, source };
}
