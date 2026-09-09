import { existsSync, realpathSync, statSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';

export function resolvePartOutputPath(partRoot, entryFile) {
  if (typeof entryFile !== 'string' || !entryFile.trim()) {
    throw new Error('manifest entry.file must be a nonempty relative file path');
  }
  if (entryFile !== entryFile.trim() || /[\u0000-\u001f\u007f]/.test(entryFile)) {
    throw new Error('manifest entry.file contains invalid whitespace or control characters');
  }
  if (isAbsolute(entryFile) || posix.isAbsolute(entryFile) || win32.isAbsolute(entryFile)) {
    throw new Error(`manifest entry.file must not be absolute: ${entryFile}`);
  }
  if (entryFile.includes(':')) {
    throw new Error(`manifest entry.file must not contain a colon, drive-relative path, or ADS suffix: ${entryFile}`);
  }

  const realRoot = realpathSync(resolve(partRoot));
  const portableEntry = entryFile.replaceAll('\\', '/');
  if (portableEntry === '.') {
    throw new Error('manifest entry.file must name a file, not the part root itself');
  }
  const segments = portableEntry.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`manifest entry.file must not contain traversal segments: ${entryFile}`);
  }
  const destination = resolve(realRoot, ...segments);
  assertContained(realRoot, destination, 'manifest destination escapes the real part root');
  if (destination === realRoot) {
    throw new Error('manifest entry.file must name a file, not the part root itself');
  }
  if (existsSync(destination) && statSync(destination).isDirectory()) {
    throw new Error(`manifest entry.file resolves to a directory target: ${entryFile}`);
  }

  const realParent = resolveExistingParent(dirname(destination));
  assertContained(realRoot, realParent,
    `manifest destination resolved parent junction/symlink escapes the real part root: ${entryFile}`);
  if (existsSync(destination)) {
    const realDestination = realpathSync(destination);
    assertContained(realRoot, realDestination,
      `manifest destination symlink escapes the real part root: ${entryFile}`);
  }
  return destination;
}

function resolveExistingParent(target) {
  const tail = [];
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`cannot resolve an existing parent for manifest destination: ${target}`);
    tail.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...tail);
}

function assertContained(realRoot, candidate, message) {
  const rel = relative(realRoot, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(message);
  }
}
