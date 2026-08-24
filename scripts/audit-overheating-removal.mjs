#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'test', 'scripts', 'design', 'docs'];
const TEXT_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|html|css|yml|yaml)$/i;
const ACTIVE = /overheat|overheated|weaponHeat|weapon[_-]?heat|heatPerShot|heat[_-]?(?:capacity|max|limit)|cool(?:ing)?Rate|vent(?:ing|ed|Cooldown)?|thermal[_ -]?sink|mining[^\n]{0,32}heat|drill[^\n]{0,32}heat/ig;
const KEEP_ENVIRONMENTAL = /heatZone|re-?entry|atmospher|thermal damage|heat haze|heatSignature|temperature|planetary heat|environmental heat|exhaust|engine plume/i;
const STRONG_REMOVE = /overheat|overheated|weaponHeat|weapon[_-]?heat|heatPerShot|vent(?:ing|ed|Cooldown)?|thermal[_ -]?sink|mining[^\n]{0,32}heat|drill[^\n]{0,32}heat/i;
const GENERATED_OR_VENDOR = /^(?:node_modules|dist|build|coverage|scratch|assets)\//;

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const path = join(dir, name);
    let stat;
    try { stat = statSync(path); } catch { continue; }
    if (stat.isDirectory()) walk(path, out);
    else if (TEXT_EXT.test(name)) out.push(path.replaceAll('\\', '/'));
  }
  return out;
}

const findings = [];
for (const root of ROOTS) {
  for (const path of walk(root)) {
    if (GENERATED_OR_VENDOR.test(path)) continue;
    let source;
    try { source = readFileSync(path, 'utf8'); } catch { continue; }
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      ACTIVE.lastIndex = 0;
      if (!ACTIVE.test(line)) continue;
      const classification = KEEP_ENVIRONMENTAL.test(line)
        ? 'KEEP_ENVIRONMENTAL'
        : (STRONG_REMOVE.test(line) ? 'REMOVE_CANDIDATE' : 'REVIEW_GENERIC');
      findings.push({
        path,
        line: i + 1,
        classification,
        text: line.trim().slice(0, 500),
      });
    }
  }
}

const byFile = new Map();
for (const finding of findings) {
  const row = byFile.get(finding.path) || {
    path: finding.path,
    removeCandidates: 0,
    keepEnvironmental: 0,
    reviewGeneric: 0,
    findings: [],
  };
  row.findings.push(finding);
  if (finding.classification === 'REMOVE_CANDIDATE') row.removeCandidates += 1;
  else if (finding.classification === 'KEEP_ENVIRONMENTAL') row.keepEnvironmental += 1;
  else row.reviewGeneric += 1;
  byFile.set(finding.path, row);
}

const files = [...byFile.values()].sort((a, b) => (
  b.removeCandidates - a.removeCandidates || a.path.localeCompare(b.path)
));
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  findingCount: findings.length,
  fileCount: files.length,
  removeCandidateCount: findings.filter((row) => row.classification === 'REMOVE_CANDIDATE').length,
  keepEnvironmentalCount: findings.filter((row) => row.classification === 'KEEP_ENVIRONMENTAL').length,
  reviewGenericCount: findings.filter((row) => row.classification === 'REVIEW_GENERIC').length,
  files,
};
const outDir = 'design/program/branch-consolidation';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/overheating-reference-audit.json`, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Overheating removal reference audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Matched references: **${report.findingCount}** across **${report.fileCount}** files.`,
  '',
  `Removal candidates: **${report.removeCandidateCount}**`,
  `Explicit environmental/physical heat to preserve: **${report.keepEnvironmentalCount}**`,
  `Generic references requiring owner review: **${report.reviewGenericCount}**`,
  '',
  '| File | Remove candidates | Preserve environmental | Generic review |',
  '|---|---:|---:|---:|',
  ...files.map((row) => `| \`${row.path}\` | ${row.removeCandidates} | ${row.keepEnvironmental} | ${row.reviewGeneric} |`),
  '',
  '## Removal-candidate excerpts',
  '',
];
for (const file of files.filter((row) => row.removeCandidates > 0)) {
  md.push(`### \`${file.path}\``, '');
  for (const finding of file.findings.filter((row) => row.classification === 'REMOVE_CANDIDATE').slice(0, 20)) {
    md.push(`- L${finding.line}: \`${finding.text.replaceAll('`', '\\`')}\``);
  }
  md.push('');
}
writeFileSync(`${outDir}/OVERHEATING_REFERENCE_AUDIT.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  findingCount: report.findingCount,
  fileCount: report.fileCount,
  removeCandidateCount: report.removeCandidateCount,
  keepEnvironmentalCount: report.keepEnvironmentalCount,
  reviewGenericCount: report.reviewGenericCount,
}, null, 2));
