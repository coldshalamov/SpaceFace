// scripts/lib/report/lint.mjs — the owner report's language gate.
//
// The report is read by someone who does not read code. Every word in JARGON_WORDS is a word that
// would make him stop and ask what it means, so the renderer must not produce one.
//
// The matching used to be a plain substring test, and a substring test does not know the difference
// between a term and a syllable: "rapidly" tripped on API, "sticks" tripped on tick. A lint that
// cries wolf gets switched off, so the terms that are ordinary words are matched at word
// boundaries, and the ones that are fragments of a path or a file extension ('src/', '.js') stay
// substring matches — those cannot appear innocently in a sentence for the owner.

import { JARGON_WORDS } from './constants.mjs';

/** A term made only of letters and digits is a WORD; anything with punctuation is a fragment. */
function matcherFor(word) {
  const w = String(word);
  if (/^[A-Za-z0-9]+$/.test(w)) {
    return new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  }
  return { test: (line) => line.toLowerCase().indexOf(w.toLowerCase()) !== -1 };
}

const MATCHERS = JARGON_WORDS.map((word) => ({ word, matcher: matcherFor(word) }));

function visibleLines(markdown) {
  let text = String(markdown ?? '');
  const trimmedEnd = text.replace(/\s+$/, '');
  if (trimmedEnd.endsWith('-->')) {
    const start = trimmedEnd.lastIndexOf('<!--');
    if (start !== -1) text = trimmedEnd.slice(0, start);
  }
  const lines = text.split(/\r?\n/);
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && lines[i].startsWith('# ')) continue;
    kept.push({ number: i + 1, text: lines[i] });
  }
  return kept;
}

export function lintJargon(markdown) {
  const violations = [];
  const seen = new Set();
  for (const line of visibleLines(markdown)) {
    for (const { word, matcher } of MATCHERS) {
      if (matcher.test(line.text)) {
        const key = `${line.number}:${word}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({ word, line: line.number, lineText: line.text.trim() });
        }
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
