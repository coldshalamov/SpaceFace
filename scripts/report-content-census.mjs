import { buildContentCensus } from './lib/contentCensus.mjs';

const census = buildContentCensus();
const summaryOnly = process.argv.includes('--summary');
const check = process.argv.includes('--check');

if (summaryOnly) {
  console.log(JSON.stringify({
    schema: census.schema,
    schemaVersion: census.schemaVersion,
    source: census.source,
    summary: census.summary,
    categories: Object.fromEntries(Object.entries(census.categories).map(([id, category]) => [id, {
      count: category.count,
      identity: category.identity,
      evidence: Object.fromEntries(Object.entries(category.evidence).map(([level, value]) => [
        level,
        value.status,
      ])),
    }])),
    diagnostics: {
      ok: census.diagnostics.ok,
      duplicateIds: census.diagnostics.duplicateIds.length,
      missingIds: census.diagnostics.missingIds.length,
      identityMismatches: census.diagnostics.identityMismatches.length,
      danglingReferences: census.diagnostics.danglingReferences.length,
    },
  }, null, 2));
} else {
  console.log(JSON.stringify(census, null, 2));
}

if (check && !census.diagnostics.ok) process.exitCode = 1;
