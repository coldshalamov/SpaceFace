import fs from 'node:fs';
import path from 'node:path';
import { packFileText } from './export.mjs';
import { stableStringify } from './stableJson.mjs';

export function writeExportTree(dir, exported) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenario.json'), stableStringify(exported.scenario));
  fs.writeFileSync(path.join(dir, 'export-manifest.json'), stableStringify(exported.manifest));
  if (!exported.pack) return;
  const modDir = path.join(dir, 'mod', exported.pack.modId);
  const files = packFileText(exported.pack.files);
  for (const [rel, text] of Object.entries(files)) {
    if (rel.includes('..') || path.isAbsolute(rel)) {
      throw new Error(`refusing pack path ${rel}`);
    }
    const file = path.join(modDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
