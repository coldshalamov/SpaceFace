import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root. This module lives at tools/scene-truth/lib/. */
export const repoRoot = path.resolve(here, '../../..');

export function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}
