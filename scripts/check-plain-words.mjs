#!/usr/bin/env node
// check-plain-words.mjs — Ruling R18 (design/overhaul/00_RULINGS.md): plain words and human units.
//
// No player-facing English string may carry an internal codename. The gate reads the generated
// runtime catalogue (src/localization/catalogs/en-US.generated.json): its `messages` values are
// the strings a player can be shown, collected from the same extraction surfaces
// `extract-localization.mjs` uses. Keys are internal ids and are never scanned; values that are
// single code-shaped tokens (camelCase ids, dotted paths) are not player copy and are skipped.
//
// Two layers, matching scripts/capture-opening.mjs's BANNED_WORDS and 08_INTERFACE.md §5:
//
//  1. Jargon — codenames that are never plain English. Word-boundary, case-insensitive, anywhere
//     in the string: Crucible, Massline, Mass Seed, Gyre, Repulsor, Converged on, Unknown weapon,
//     ? unknown, research points, bay screen, station wire, banked into the hangar, ship fix, hdg,
//     headroom, cap load, cr/min, a verb every hour, dev sandbox banner.
//
//  2. R18 power names — Well / Repulsor / Cone / Rig / Seed / Field are banned as NAMES, not as
//     ordinary words ("a gravity well", "the mining rig" are plain English). They fail when the
//     whole value of a name/label/title field IS the banned name, or when an all-caps HUD chip
//     casing from §5 appears (STALE, TOO HEAVY, AFTERMATH, FIELD RESPONSE, MIXED +N, TERRAIN +N,
//     DIRECT +N, IGNITION/FLARE/NOVA, RESEARCH POINTS). Lowercase prose stays free.
//
// Tokens that mean the localization template broke (`undefined`, `NaN`, `unbound`, `${`) fail as
// whole words — they are defects, not vocabulary.
//
// Exit 1 on any hit. `node scripts/check-plain-words.mjs` — wired as `npm run check:plain-words`.
// Add words as reviewers find them; add a layer only with a false-positive story for it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CATALOG_URL = new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url);

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const word = (w, flags = 'i') => new RegExp(`\\b${esc(w)}\\b`, flags);
const stem = (w) => new RegExp(`\\b${esc(w)}[a-z]*\\b`, 'i'); // also catches inflections: Masslined, masslines

// Layer 1 — jargon, never plain English.
const BANNED = [
  ['crucible', word('crucible')],
  ['massline', stem('massline')],
  ['mass seed', word('mass seed')],
  ['gyre', stem('gyre')],
  ['repulsor', stem('repulsor')],
  ['converged on', word('converged on')],
  ['unknown weapon', word('unknown weapon')],
  ['? unknown', /\?\s*unknown/i],
  ['pressure %', /pressure\s*%/i],
  ['cr/min', /cr\s*\/\s*min/i],
  ['headroom', word('headroom')],
  ['cap load', word('cap load')],
  ['research points', word('research points')],
  ['RP', /\bRP\b/], // case-sensitive: the abbreviation, never "rp" inside prose
  ['bay screen', word('bay screen')],
  ['station wire', word('station wire')],
  ['banked into the hangar', word('banked into the hangar')],
  ['ship fix', word('ship fix')],
  ['hdg', /\bhdg\b/i],
  ['a verb every hour', word('a verb every hour')],
  ['dev — sandbox', /dev\s*—\s*sandbox/i],
  ['dev - sandbox', /dev\s*-\s*sandbox/i],
];

// §5 all-caps chips and tier names — case-sensitive: lowercase forms are ordinary English.
const CHIPS = [
  ['AFTERMATH', /\bAFTERMATH\b/],
  ['FIELD RESPONSE', /\bFIELD RESPONSE\b/],
  ['STALE', /\bSTALE\b/],
  ['TOO HEAVY', /\b(?:TOO HEAVY|Too heavy)\b/],
  ['RESEARCH POINTS', /\bRESEARCH POINTS\b/],
  ['IGNITION', /\bIGNITION\b/],
  ['FLARE', /\bFLARE\b/],
  ['NOVA', /\bNOVA\b/],
  ['MIXED +N', /\bMIXED\s*\+\s*\d+/],
  ['TERRAIN +N', /\bTERRAIN\s*\+\s*\d+/],
  ['DIRECT +N', /\bDIRECT\s*\+\s*\d+/],
];

// Layer 2 — R18 names, banned only when they ARE the whole name/label/title, not a word inside
// prose. Keys end `.field.<role>.<hash>` (see scripts/lib/localizationInventory.mjs).
const NAME_ROLES = new Set(['name', 'label', 'title', 'displayname', 'shortname']);
const BANNED_NAMES = new Set(['well', 'repulsor', 'cone', 'rig', 'seed', 'field', 'gyre', 'massline', 'mass seed', 'crucible']);

// Defect tokens (capture-opening BAD_TOKENS): jargon that leaks when a binding fails. `${` is NOT
// scanned here — the catalogue stores source template literals (`${cond ? a : b}`) whose
// expressions are code, not copy; the rendered-text guard in capture-opening owns that token.
const BAD_TOKENS = [
  ['undefined', word('undefined')],
  ['NaN', word('NaN')],
  ['unbound', word('unbound')],
];

// A single-token camelCase / dotted id is a leaked identifier, not player copy (the extractor
// keeps system `name:` fields like `masslineHud` for completeness — they are not display text).
const CODE_TOKEN = /^[a-zA-Z_$][\w$./-]*$/;
const looksLikeCode = (s) => !/\s/.test(s) && CODE_TOKEN.test(s);

// Strip {placeholders} and ${template expressions}: they are binding syntax, not words a player
// reads. A `${` consumes until its matching `}` (nesting and string literals honoured); a bare
// `{name}` consumes to the next `}`.
function playerText(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '$' && value[i + 1] === '{') {
      let depth = 1; i += 2;
      let quote = null;
      while (i < value.length && depth > 0) {
        const c = value[i];
        if (quote) {
          if (c === '\\') i += 1;
          else if (c === quote) quote = null;
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        i += 1;
      }
      i -= 1;
      out += ' ';
      continue;
    }
    if (ch === '{') {
      const end = value.indexOf('}', i + 1);
      if (end !== -1) { i = end; out += ' '; continue; }
    }
    out += ch;
  }
  return out;
}

function nameRoleOf(key) {
  const m = /\.field\.([a-z_]+)\.[0-9a-f]+$/i.exec(key);
  return m ? m[1].toLowerCase() : null;
}

export function auditMessages(messages) {
  const findings = [];
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    // A name/label/title field whose WHOLE value is a codename fails even as a single token —
    // names are exactly the strings R18 covers.
    const role = nameRoleOf(key);
    if (role && NAME_ROLES.has(role) && BANNED_NAMES.has(value.trim().toLowerCase())) {
      findings.push({ key, word: `name '${value.trim()}'`, value });
    }
    if (looksLikeCode(value)) continue;
    const text = playerText(value);
    for (const [wordName, re] of [...BANNED, ...CHIPS, ...BAD_TOKENS]) {
      if (re.test(text)) findings.push({ key, word: wordName, value });
    }
  }
  return findings;
}

const IS_DIRECT = process.argv[1] && process.argv[1].endsWith('check-plain-words.mjs');
if (IS_DIRECT) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(fileURLToPath(CATALOG_URL), 'utf8'));
  } catch (err) {
    console.error(`[check-plain-words] FAIL cannot read catalog: ${err.message} — run node scripts/extract-localization.mjs --write`);
    process.exit(1);
  }
  const messages = catalog && typeof catalog === 'object' ? catalog.messages || catalog : {};
  const findings = auditMessages(messages);
  console.log(`plain-words: ${Object.keys(messages).length} player-facing strings scanned`);
  if (findings.length) {
    console.error(`\nFAIL — ${findings.length} player-facing string(s) carry banned internal words (R18).`);
    console.error('A player must never read a codename: rename it in the source string, then');
    console.error('regenerate the catalogue: node scripts/extract-localization.mjs --write\n');
    for (const f of findings.slice(0, 60)) {
      console.error(`  ${f.key}\n    ${f.word}  in  ${JSON.stringify(f.value.length > 140 ? f.value.slice(0, 140) + '…' : f.value)}`);
    }
    if (findings.length > 60) console.error(`  ... and ${findings.length - 60} more`);
    process.exit(1);
  }
  console.log('Plain words OK — no player-facing string names an internal codename.');
}
