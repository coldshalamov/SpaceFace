#!/usr/bin/env node
// PQ-186.02: a narrow text guard for retired assertion wording, not a behavior proof.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readBannedAssertionPhrases(contract) {
  const section = contract.match(/<!-- assertion-guard:start -->([\s\S]*?)<!-- assertion-guard:end -->/);
  if (!section) throw new Error('Missing assertion-guard phrase list in FEEL_CONTRACT.md');
  const phrases = [...section[1].matchAll(/^- `([^`]+)`/gm)].map(m => m[1].toLowerCase());
  if (!phrases.length) throw new Error('The assertion-guard phrase list is empty');
  return phrases;
}

export function findRetiredAssertions(source, phrases) {
  const withoutComments = source.replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    match => match.startsWith('/') ? match.replace(/[^\n]/g, ' ') : match);
  const findings = [];
  // Grep-level coverage intentionally matches historical wording, not arbitrary semantics.
  for (const phrase of phrases) {
    let from = 0;
    const lower = withoutComments.toLowerCase();
    while ((from = lower.indexOf(phrase, from)) !== -1) {
      findings.push({ phrase, line: withoutComments.slice(0, from).split('\n').length });
      from += phrase.length;
    }
  }
  return findings;
}

function testFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === 'fixtures' ? [] : testFiles(file);
    return /\.(?:m?js|cjs)$/.test(entry.name) ? [file] : [];
  });
}

export function checkVisionAssertions(files, contractPath = 'design/FEEL_CONTRACT.md') {
  const phrases = readBannedAssertionPhrases(readFileSync(contractPath, 'utf8'));
  return files.flatMap(file => findRetiredAssertions(readFileSync(file, 'utf8'), phrases).map(f => ({ file, ...f })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = process.argv.slice(2);
    const findings = checkVisionAssertions(files.length ? files : testFiles('test'));
    for (const finding of findings) console.error(`${finding.file}:${finding.line}: retired assertion "${finding.phrase}" — Only the brake spends earned momentum.`);
    console.log(`vision-assertions: ${findings.length ? 'FAIL' : 'PASS'} (${findings.length} retired assertions)`);
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
