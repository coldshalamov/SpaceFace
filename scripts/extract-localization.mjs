#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLocalizationInventory, renderGeneratedCatalog } from './lib/localizationInventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SURFACES_PATH = path.join(ROOT, 'scripts/localization-surfaces.json');
const EXEMPTIONS_PATH = path.join(ROOT, 'scripts/localization-exemptions.json');
const CATALOG_PATH = path.join(ROOT, 'src/localization/catalogs/en-US.generated.js');
const writeMode = process.argv.includes('--write');
const checkMode = process.argv.includes('--check');

if (writeMode === checkMode) fail('choose exactly one mode: --write or --check');

const surfaces = await readJson(SURFACES_PATH, 'surface configuration');
const exemptions = await readJson(EXEMPTIONS_PATH, 'exemption configuration');
const first = await buildLocalizationInventory({ rootDir: ROOT, surfaces, exemptions });
const second = await buildLocalizationInventory({ rootDir: ROOT, surfaces, exemptions });
const rendered = renderGeneratedCatalog(first);
const renderedAgain = renderGeneratedCatalog(second);

if (first.digest !== second.digest || rendered !== renderedAgain) fail('nondeterministic extraction result');
if (first.conflicts.length) fail(`key conflicts: ${JSON.stringify(first.conflicts)}`);
if (first.exemptionErrors.length) fail(`unexplained exemptions: ${first.exemptionErrors.join('; ')}`);
if (first.stats.unresolved !== 0) fail(`unresolved extraction surfaces: ${first.stats.unresolved}`);

if (writeMode) {
  await mkdir(path.dirname(CATALOG_PATH), { recursive: true });
  await writeFile(CATALOG_PATH, rendered, 'utf8');
} else {
  try {
    await access(CATALOG_PATH, fsConstants.R_OK);
  } catch {
    fail('generated en-US catalog is missing; run --write');
  }
  const existing = await readFile(CATALOG_PATH, 'utf8');
  if (existing !== rendered) fail('generated en-US catalog is stale; run --write');
}

console.log(JSON.stringify({
  ok: true,
  mode: writeMode ? 'write' : 'check',
  catalog: 'src/localization/catalogs/en-US.generated.js',
  digest: first.digest,
  ...first.stats,
}, null, 2));

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`${label} missing or invalid: ${error && error.message || error}`);
  }
}

function fail(message) {
  console.error(`[extract-localization] FAIL ${message}`);
  process.exit(1);
}
