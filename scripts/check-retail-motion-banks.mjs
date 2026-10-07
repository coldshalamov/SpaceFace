// Close the runtime dependency graph after packaging, not just against authoring inputs.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkRetailMotionBanks(webRoot) {
  const root = resolve(webRoot), paths = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Runtime package symlink: ${entry.name}`);
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'render-package.json') paths.push(path);
    }
  }
  await walk(join(root, 'assets/ships/release/render-packages'));
  if (!paths.length) throw new Error('No retail render packages found');
  const banks = new Map();
  let references = 0;
  for (const path of paths) {
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    const ref = metadata.runtime?.motionBank;
    if (!ref) continue;
    references++;
    if (!/^(?:\.\/)?assets\/ships\/motions\/[a-zA-Z0-9_-]+\.motion\.json$/.test(ref.uri || ''))
      throw new Error(`Unsafe or non-shipping motion bank URI in ${path}: ${ref.uri}`);
    const uri = ref.uri.replace(/^\.\//, '');
    let entry = banks.get(uri);
    if (!entry) {
      const text = (await readFile(join(root, uri), 'utf8')).replace(/\r\n/g, '\n');
      const bytes = Buffer.from(text);
      entry = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), doc: JSON.parse(text) };
      banks.set(uri, entry);
    }
    if (entry.bytes !== ref.bytes || entry.sha256 !== ref.sha256)
      throw new Error(`Retail motion bank pin mismatch: ${uri}`);
    if (entry.doc.schema !== 'spaceface.rigidMotionBank.v1' || entry.doc.rigId !== ref.rigId)
      throw new Error(`Retail motion bank rig/schema mismatch: ${uri}`);
  }
  return { packages: paths.length, references, banks: banks.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRetailMotionBanks(process.argv[2] || 'build/web').then(result => {
    if (!result.references) throw new Error('Expected the shipping game to contain animated packages');
    console.log('[retail-motion-banks] PASS', JSON.stringify(result));
  }).catch(error => { console.error('[retail-motion-banks] FAIL', error); process.exitCode = 1; });
}
