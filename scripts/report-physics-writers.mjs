import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { scanPhysicsWriterCandidates } from './lib/physicsWriterAudit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');
const paths = await collectJavaScript(srcRoot);
const files = await Promise.all(paths.map(async (absolutePath) => ({
  path: path.relative(root, absolutePath).replaceAll('\\', '/'),
  source: await readFile(absolutePath, 'utf8'),
})));
const report = scanPhysicsWriterCandidates(files);

if (process.argv.includes('--summary')) {
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    limitation: report.limitation,
    summary: report.summary,
  }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(target));
    else if (entry.isFile() && /\.(?:c|m)?js$/.test(entry.name)) files.push(target);
  }
  return files;
}
