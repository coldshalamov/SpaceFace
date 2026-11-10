// Path jail. Reads stay under tools/creators-dock. Writes stay under workspace/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCK = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export function dockRoot() {
  return DOCK;
}

export function workspaceRoot() {
  const dir = path.join(DOCK, 'workspace');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function examplesRoot() {
  const dir = path.join(DOCK, 'examples');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function bad(userPath) {
  return typeof userPath !== 'string'
    || userPath.length === 0
    || userPath.includes('\0')
    || userPath.split(/[/\\]/).includes('..');
}

export function resolveInside(root, userPath, label = 'path') {
  if (bad(userPath)) return { ok: false, issues: [`${label}: path traversal`] };
  if (path.isAbsolute(userPath)) return { ok: false, issues: [`${label}: absolute path`] };
  const rootReal = fs.realpathSync(root);
  const full = path.resolve(rootReal, userPath);
  if (full !== rootReal && !full.startsWith(rootReal + path.sep)) {
    return { ok: false, issues: [`${label}: path escapes the dock`] };
  }
  return { ok: true, path: full, issues: [] };
}

export function resolveWorkspace(userPath, label = 'out') {
  return resolveInside(workspaceRoot(), userPath, label);
}

export function resolveDockRead(userPath, label = 'project') {
  if (bad(userPath) && !(typeof userPath === 'string' && path.isAbsolute(userPath) && !userPath.includes('\0'))) {
    return { ok: false, issues: [`${label}: path traversal`] };
  }
  if (typeof userPath !== 'string' || userPath.includes('\0')) {
    return { ok: false, issues: [`${label}: path traversal`] };
  }
  if (!path.isAbsolute(userPath) && userPath.split(/[/\\]/).includes('..')) {
    return { ok: false, issues: [`${label}: path traversal`] };
  }
  const absolute = path.isAbsolute(userPath) ? path.resolve(userPath) : path.resolve(DOCK, userPath);
  if (!fs.existsSync(absolute)) return { ok: false, issues: [`${label}: not found`] };
  const full = fs.realpathSync(absolute);
  const rootReal = fs.realpathSync(DOCK);
  if (full !== rootReal && !full.startsWith(rootReal + path.sep)) {
    return { ok: false, issues: [`${label}: path escapes the dock`] };
  }
  return { ok: true, path: full, issues: [] };
}
