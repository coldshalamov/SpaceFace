#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localeReadinessForMessages, SHIPPED_LOCALES } from '../src/localization/pipeline.js';

import {
  buildLocalizationInventory,
  renderGeneratedCatalog,
  renderGeneratedCatalogJson,
} from './lib/localizationInventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SURFACES_PATH = path.join(ROOT, 'scripts/localization-surfaces.json');
const EXEMPTIONS_PATH = path.join(ROOT, 'scripts/localization-exemptions.json');
const CATALOG_PATH = path.join(ROOT, 'src/localization/catalogs/en-US.generated.js');
const RUNTIME_CATALOG_PATH = path.join(ROOT, 'src/localization/catalogs/en-US.generated.json');
const READINESS_PATH = path.join(ROOT, 'src/localization/catalogs/readiness.generated.js');
const writeMode = process.argv.includes('--write');
const checkMode = process.argv.includes('--check');

if (writeMode === checkMode) fail('choose exactly one mode: --write or --check');

function renderReadiness(payload) {
  const metadata = {
    schema: 'spaceface.localizationReadiness.v1', inventoryDigest: payload.inventoryDigest,
    locales: Object.fromEntries(SHIPPED_LOCALES.map(locale => [locale,
      localeReadinessForMessages(locale, payload.messages)])),
  };
  return '// Generated from the canonical inventory and reviewed translation tables. Do not hand-edit.\n'
    + `export const READINESS = Object.freeze(${JSON.stringify(metadata)});\n`;
}

async function publishReadiness(payload) {
  const rendered = renderReadiness(payload);
  if (writeMode) await writeFile(READINESS_PATH, rendered, 'utf8');
  else if (normalizeEol(await readFile(READINESS_PATH, 'utf8')) !== rendered) {
    fail('generated localization readiness is stale; run --write --readiness-only');
  }
}

// Refresh derived picker metadata against the existing shipped inventory without re-extracting
// or silently changing source keys/anchors during an unrelated loader change.
if (process.argv.includes('--readiness-only')) {
  await publishReadiness(await readJson(RUNTIME_CATALOG_PATH, 'runtime catalog'));
  console.log('[localization-readiness] current');
  process.exit(0);
}

const surfaces = await readJson(SURFACES_PATH, 'surface configuration');
const exemptions = await readJson(EXEMPTIONS_PATH, 'exemption configuration');
const first = await buildLocalizationInventory({ rootDir: ROOT, surfaces, exemptions });
const second = await buildLocalizationInventory({ rootDir: ROOT, surfaces, exemptions });
const rendered = renderGeneratedCatalog(first);
const renderedAgain = renderGeneratedCatalog(second);
const runtimeRendered = renderGeneratedCatalogJson(first);
const runtimeRenderedAgain = renderGeneratedCatalogJson(second);

if (first.digest !== second.digest || rendered !== renderedAgain || runtimeRendered !== runtimeRenderedAgain) {
  fail('nondeterministic extraction result');
}
if (first.conflicts.length) fail(`key conflicts: ${JSON.stringify(first.conflicts)}`);
if (first.exemptionErrors.length) fail(`unexplained exemptions: ${first.exemptionErrors.join('; ')}`);
if (first.stats.unresolved !== 0) fail(`unresolved extraction surfaces: ${first.stats.unresolved}`);
await publishReadiness(JSON.parse(runtimeRendered));

if (writeMode) {
  await mkdir(path.dirname(CATALOG_PATH), { recursive: true });
  await writeFile(CATALOG_PATH, rendered, 'utf8');
  await writeFile(RUNTIME_CATALOG_PATH, runtimeRendered, 'utf8');
} else {
  try {
    await access(CATALOG_PATH, fsConstants.R_OK);
  } catch {
    fail('generated en-US catalog is missing; run --write');
  }
  // Third instance of the line-ending defect that broke scripts/build-encounter-index.mjs and
  // scripts/build-flavor-index.mjs (see their matching comments and `.gitattributes`). The catalog
  // is always written with LF; a Windows checkout with `core.autocrlf=true` hands this check a CRLF
  // copy and byte-identical content fails as stale. Measured on master 2026-07-27: the worktree
  // copy carried 8620 CRLF pairs against 0 in the rendered text. `.gitattributes` pins
  // `*.generated.js` to `eol=lf` so the checkout matches what this script writes on every platform;
  // normalising here as well keeps the comparison correct on a tree that predates that pin.
  // Only line endings are normalised — real catalog drift (a changed key, message, or source
  // anchor) still fails, which is exactly what it is doing on master today.
  const existing = await readFile(CATALOG_PATH, 'utf8');
  if (normalizeEol(existing) !== normalizeEol(rendered)) fail('generated en-US catalog is stale; run --write');
  try {
    await access(RUNTIME_CATALOG_PATH, fsConstants.R_OK);
  } catch {
    fail('generated en-US runtime JSON is missing; run --write');
  }
  const runtimeExisting = await readFile(RUNTIME_CATALOG_PATH, 'utf8');
  if (normalizeEol(runtimeExisting) !== normalizeEol(runtimeRendered)) {
    fail('generated en-US runtime JSON is stale; run --write');
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: writeMode ? 'write' : 'check',
  catalog: 'src/localization/catalogs/en-US.generated.js',
  runtimeCatalog: 'src/localization/catalogs/en-US.generated.json',
  digest: first.digest,
  ...first.stats,
}, null, 2));

function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

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
