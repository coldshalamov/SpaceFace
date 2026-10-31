import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DECKPLATE_CSS } from '../../src/ui/deckplate/css.js';
import { HUD_CSS } from '../../src/ui/views/hudStyles.js';

const OUTPUTS = Object.freeze([
  Object.freeze({ path: 'styles/deckplate.generated.css', content: DECKPLATE_CSS }),
  Object.freeze({ path: 'styles/hud-flight.generated.css', content: HUD_CSS }),
]);

/** Generate or verify the tracked CSS used by source and retail index pages. */
export async function buildUiCssSidecars({ root, check = false } = {}) {
  if (!root) throw new TypeError('buildUiCssSidecars requires the repository root');
  const results = [];
  for (const output of OUTPUTS) {
    const target = join(root, output.path);
    let current = null;
    try { current = await readFile(target, 'utf8'); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (current !== output.content) {
      if (check) throw new Error(`[ui-css] ${output.path} is stale; regenerate with node scripts/lib/buildUiCssSidecars.mjs`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, output.content, 'utf8');
    }
    results.push({ path: output.path, bytes: Buffer.byteLength(output.content), changed: current !== output.content });
  }
  return results;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const check = process.argv.slice(2).includes('--check');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length) throw new Error(`[ui-css] unknown option: ${unknown[0]}`);
  const results = await buildUiCssSidecars({ root, check });
  for (const result of results) {
    console.log(`[ui-css] ${check ? 'current' : result.changed ? 'wrote' : 'current'} ${result.path} (${result.bytes} bytes)`);
  }
}
