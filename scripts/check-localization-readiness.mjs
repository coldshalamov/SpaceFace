#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLocalizationInventory, renderGeneratedCatalog } from './lib/localizationInventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const surfaces = JSON.parse(await readFile(path.join(ROOT, 'scripts/localization-surfaces.json'), 'utf8'));
const exemptions = JSON.parse(await readFile(path.join(ROOT, 'scripts/localization-exemptions.json'), 'utf8'));
const inventory = await buildLocalizationInventory({ rootDir: ROOT, surfaces, exemptions });
const catalogPath = path.join(ROOT, 'src/localization/catalogs/en-US.generated.js');
let catalog = null;
try { catalog = await readFile(catalogPath, 'utf8'); } catch { /* reported below */ }

const adoption = await runtimeAdoption(ROOT, surfaces);
const expectedCatalog = renderGeneratedCatalog(inventory);
const catalogCurrent = catalog === expectedCatalog;
const candidateCount = inventory.stats.candidates;
const covered = inventory.stats.extracted + inventory.stats.exempted;
const extractionPercent = candidateCount > 0 ? round(covered / candidateCount * 100) : 100;
const adoptionPercent = adoption.documentBridgeInstalled
  ? 100
  : candidateCount > 0 ? round(Math.min(candidateCount, adoption.callSites) / candidateCount * 100) : 0;
const ok = catalogCurrent && inventory.conflicts.length === 0
  && inventory.exemptionErrors.length === 0 && inventory.stats.unresolved === 0;

const report = {
  schema: 'spaceface.localizationReadiness.v1',
  ok,
  sourceLocale: 'en-US',
  extractionCoverage: {
    filesScanned: inventory.stats.filesScanned,
    candidateSurfaces: candidateCount,
    extracted: inventory.stats.extracted,
    exempted: inventory.stats.exempted,
    unresolved: inventory.stats.unresolved,
    percent: extractionPercent,
    digest: inventory.digest,
    catalogCurrent,
  },
  runtimeAdoption: {
    callSites: adoption.callSites,
    filesWithRuntimeImports: adoption.filesWithRuntimeImports,
    documentBridgeInstalled: adoption.documentBridgeInstalled,
    estimatedSurfacePercent: adoptionPercent,
    status: adoption.documentBridgeInstalled ? 'document_bridge' : adoption.callSites > 0 ? 'partial' : 'not_adopted',
  },
  translationStatus: {
    sourceCatalogs: catalogCurrent ? 1 : 0,
    translatedLocales: 0,
    productionTranslationClaim: false,
    statement: 'Source copy is inventoried and the public pseudo-locale route is bridged at the document boundary; production translations are not claimed until translated catalogs ship.',
  },
};

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);

async function runtimeAdoption(rootDir, surfaceConfig) {
  const gameLocalizationPath = path.join(rootDir, 'src/localization/gameLocalization.js');
  let gameLocalizationSource = '';
  try { gameLocalizationSource = await readFile(gameLocalizationPath, 'utf8'); } catch { /* reported as not installed */ }
  const documentBridgeInstalled = /installLocalizedDocumentBridge/.test(gameLocalizationSource)
    && /startupLocale\s*!==\s*DEFAULT_LOCALE/.test(gameLocalizationSource);
  const files = [];
  for (const row of surfaceConfig.roots || []) {
    const rel = typeof row === 'string' ? row : row.path;
    const absolute = path.join(rootDir, rel);
    if (path.extname(rel)) files.push(absolute);
    else await walk(absolute, files);
  }
  let callSites = 0;
  let filesWithRuntimeImports = 0;
  for (const file of files.sort()) {
    if (!/\.(?:js|mjs|html)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    if (/localization\/(?:runtime|gameLocalization)\.js/.test(source)) filesWithRuntimeImports++;
    callSites += (source.match(/\b(?:i18n|localization|locale)\.t\s*\(/g) || []).length;
    callSites += (source.match(/\blocalizeText\s*\(/g) || []).length;
  }
  return { callSites, filesWithRuntimeImports, documentBridgeInstalled };
}

async function walk(dir, out) {
  const rows = await readdir(dir, { withFileTypes: true });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const row of rows) {
    const absolute = path.join(dir, row.name);
    if (row.isDirectory()) await walk(absolute, out);
    else if (row.isFile()) out.push(absolute);
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}
