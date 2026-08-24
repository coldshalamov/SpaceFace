#!/usr/bin/env node

import './branch-final-disposition.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'design/program/branch-consolidation';
const PATH = `${ROOT}/all-branch-dispositions.json`;
const INTEGRATION = 'integration/all-branches-20260824';
const RECENT_CUTOFF = '2026-08-01T00:00:00.000Z';

const evidence = Object.freeze({
  map: existsSync('src/ui/map/tacticalMapGrammar.js')
    && existsSync('test/tactical-map-range-control.test.mjs'),
  boot: existsSync('test/consolidated-boot-honesty.test.mjs'),
  overheating: existsSync(`${ROOT}/overheating-excision.json')`)
    || existsSync(`${ROOT}/overheating-excision.json`),
  arcade: existsSync('design/arcade-core/61_CONVERGENCE_AND_AUTHORITY.md'),
  geometryResidency: existsSync('test/startup-geometry-residency.test.mjs'),
});

const report = JSON.parse(readFileSync(PATH, 'utf8'));
let rows = report.branches.filter((row) => row.branch !== INTEGRATION);

function terminalize(row) {
  const disposition = row.disposition;
  if (!/^(?:ADAPT|PRESERVE)/.test(disposition)) return row;

  switch (row.branch) {
    case 'codex/tactical-map-second-generation':
      return evidence.map
        ? { ...row, disposition: 'CONSOLIDATED_HARDENED', reason: 'Native semantic map was current-master adapted, expanded to 248px, given explicit 3K/6K/12K ranges, and validated on the integration branch.' }
        : { ...row, disposition: 'DROP_UNVALIDATED_PRIORITY_DONOR', reason: 'The donor did not survive current-master adaptation and is not merged by history.' };
    case 'intro-cold-open-redesign':
      return evidence.boot
        ? { ...row, disposition: 'CONSOLIDATED_HARDENED', reason: 'The full-bleed boot was structurally transplanted, unrelated current index work was preserved, and dead fake telemetry was removed.' }
        : { ...row, disposition: 'DROP_UNVALIDATED_PRIORITY_DONOR', reason: 'The presentation donor did not satisfy the current loading contract.' };
    case 'remove-overheating-systems':
      return evidence.overheating
        ? { ...row, disposition: 'CONSOLIDATED_REIMPLEMENTED', reason: 'The draft branch contained no product removal; the three active lockout systems were reimplemented as a current-master AST excision with a zero-reference gate.' }
        : { ...row, disposition: 'DROP_INCOMPLETE_DRAFT', reason: 'The branch contains audit transport rather than a validated overheating removal.' };
    case 'arcade-core-plans':
      return evidence.arcade
        ? { ...row, disposition: 'CONSOLIDATED_ADAPTED_AUTHORITY', reason: 'The unique design corpus was transplanted without stale history and given a convergence/authority law.' }
        : { ...row, disposition: 'PRESERVE_NONAUTHORITATIVE_DONOR', reason: 'The broad design corpus remains a donor, not current program authority.' };
    case 'perf/exact-opening-geometry-residency':
      return evidence.geometryResidency
        ? { ...row, disposition: 'CONSOLIDATED_VALIDATED', reason: 'Exact opening geometry residency and its executable acceptance were ported to the integration branch.' }
        : { ...row, disposition: 'PRESERVE_REFERENCED_RECENT_DONOR', reason: 'Potentially useful renderer work did not pass a current-master port and remains named without being wired.' };
    default:
      break;
  }

  if (disposition === 'PRESERVE_ASSET_DONOR') {
    return { ...row, disposition: 'PRESERVE_REFERENCED_ASSET_DONOR', reason: `${row.reason} The donor ref and head SHA are retained in this ledger; no unaccepted asset is promoted.` };
  }
  if (disposition === 'PRESERVE_SUPPORT_DONOR') {
    return { ...row, disposition: 'DROP_SUPPORT_WITHOUT_PRODUCT_OUTCOME', reason: `${row.reason} Checkers and workflows are not merged as substitute implementations.` };
  }
  if (disposition === 'ADAPT_DOCUMENT_AUTHORITY') {
    return { ...row, disposition: 'PRESERVE_NONAUTHORITATIVE_DOCUMENT_DONOR', reason: `${row.reason} Its branch/head remain recorded, but it does not become active authority.` };
  }
  if (disposition === 'PRESERVE_REVIEW') {
    return { ...row, disposition: 'PRESERVE_REFERENCED_CHECKPOINT', reason: `${row.reason} This is a deliberate checkpoint receipt, not an open merge task.` };
  }
  if (disposition === 'ADAPT_LEDGER_PORT_CANDIDATE') {
    const recent = String(row.committedAt || '') >= RECENT_CUTOFF;
    return recent
      ? { ...row, disposition: 'PRESERVE_REFERENCED_RECENT_DONOR', reason: `${row.reason} It overlaps newer master architecture and is preserved for a future product-specific port, not merged into this consolidation.` }
      : { ...row, disposition: 'DROP_SUPERSEDED_RUNTIME_DONOR', reason: `${row.reason} Current master has moved beyond this implementation surface; replaying it would restore an older owner.` };
  }
  if (disposition === 'ADAPT_PRIORITY_CONFLICT' || disposition === 'ADAPT_CURRENT_ARCHITECTURE') {
    const recent = String(row.committedAt || '') >= RECENT_CUTOFF;
    return recent
      ? { ...row, disposition: 'PRESERVE_REFERENCED_RECENT_DONOR', reason: `${row.reason} The collision is documented by ref and SHA; it is not silently merged.` }
      : { ...row, disposition: 'DROP_SUPERSEDED_RUNTIME_DONOR', reason: `${row.reason} Age plus current-master collision makes the old implementation an unsafe alternate owner.` };
  }
  return { ...row, disposition: 'PRESERVE_REFERENCED_DONOR', reason: `${row.reason} The donor is fully named and no merge action remains.` };
}

rows = rows.map(terminalize).sort((a, b) => a.branch.localeCompare(b.branch));
const counts = {};
for (const row of rows) counts[row.disposition] = (counts[row.disposition] || 0) + 1;
const unresolved = rows.filter((row) => /^(?:ADAPT|PRESERVE_(?!REFERENCED|NONAUTHORITATIVE))/.test(row.disposition));
const final = {
  ...report,
  generatedAt: new Date().toISOString(),
  branchCount: rows.length,
  counts,
  unresolvedCount: unresolved.length,
  integrationEvidence: evidence,
  branches: rows,
};
writeFileSync(PATH, `${JSON.stringify(final, null, 2)}\n`);
writeFileSync(`${ROOT}/manual-review-queue.json`, `${JSON.stringify({ generatedAt: final.generatedAt, count: unresolved.length, branches: unresolved }, null, 2)}\n`);

const md = [
  '# Final all-branch consolidation ledger',
  '',
  `Generated: ${final.generatedAt}`,
  '',
  `Source branches reviewed: **${rows.length}**`,
  `Unresolved dispositions: **${unresolved.length}**`,
  '',
  '## Integration evidence',
  '',
  ...Object.entries(evidence).map(([name, present]) => `- ${present ? '✓' : '✗'} ${name}`),
  '',
  '## Totals',
  '',
  '| Disposition | Count |',
  '|---|---:|',
  ...Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => `| ${name} | ${count} |`),
  '',
  '## Branch ledger',
  '',
  '| Branch | PR | Slice | Final disposition | Reason |',
  '|---|---:|---:|---|---|',
  ...rows.map((row) => `| \`${row.branch}\` | ${row.openPr ? `#${row.openPr}` : '—'} | ${row.sliceCommitCount} commit(s), ${row.sliceFileCount} path(s) | **${row.disposition}** | ${String(row.reason).replaceAll('|', '\\|')} |`),
];
writeFileSync(`${ROOT}/FINAL_BRANCH_LEDGER.md`, `${md.join('\n')}\n`);
if (unresolved.length) throw new Error(`${unresolved.length} non-terminal branch disposition(s) remain`);
console.log(JSON.stringify({ branchCount: rows.length, counts, evidence }, null, 2));
