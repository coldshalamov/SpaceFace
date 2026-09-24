// src/story/factionRegisters.js — PQ-178.02 reader and validator.
//
// A writer opens one house sheet (docs/worldbuilding/sheets/factions/*.md) or the
// REGISTERS.md index and writes one bark. A reader assigns that bark to its house
// without guessing. This module reads the writing-rule keys, cites barks.js /
// narrative.js bytes, and never rewrites them.
//
// Matching is sheet-driven: every tell phrase on the sheet scores, every forbidden
// term disqualifies. The reader matches the rule, not one hardcoded phrase.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BARKS } from '../data/barks.js';
import { COMMS } from '../data/narrative.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');
export const FACTION_SHEET_DIR = join(REPO_ROOT, 'docs', 'worldbuilding', 'sheets', 'factions');
export const REGISTERS_REL = 'docs/worldbuilding/REGISTERS.md';
export const FREE_FRONTIER_REL = 'docs/worldbuilding/sheets/factions/free-frontier.md';

// Fixed seed for the headless blind-reader proof (test/pq-178-02-registers.test.mjs).
export const BLIND_PROOF_SEED = 17802;

export const REGISTER_KEYS = Object.freeze([
  'register_rule',
  'register_tell',
  'register_forbidden',
  'register_example',
  'register_example_cite',
  'voice_direction',
]);

// The eight canon houses from orgs/factions-CANONICAL.md. Not Free Frontier.
export const REGISTER_HOUSE_IDS = Object.freeze([
  'faction_scn',
  'faction_choir',
  'faction_helix',
  'faction_vael',
  'faction_quiet',
  'faction_dmc',
  'faction_reach',
  'faction_mts',
]);

export const FREE_FRONTIER_ID = 'faction_free';

export const REGISTER_SHEET_FILES = Object.freeze({
  faction_scn: 'concord.md',
  faction_choir: 'choir.md',
  faction_helix: 'helix.md',
  faction_vael: 'vael.md',
  faction_quiet: 'quiet.md',
  faction_dmc: 'drift.md',
  faction_reach: 'reach.md',
  faction_mts: 'mts.md',
});

const BARK_CITE = /^src\/data\/barks\.js#([a-z_]+)\.([A-Za-z0-9-]+)\[(\d+)\]$/;
const COMMS_CITE = /^src\/data\/narrative\.js#COMMS\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/;

function issue(code, message, path = '') {
  return { code, message, path };
}

function trimRule(value) {
  return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
}

// Normalize for MATCHING only. Stored bytes are never rewritten.
export function normalizeLine(value) {
  return String(value == null ? '' : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// A tell/forbidden block is one phrase per line. Single-line blocks still work.
export function parseKeyList(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function extractYamlFence(markdown) {
  const match = String(markdown).match(/```yaml\r?\n([\s\S]*?)\r?\n```/);
  return match ? match[1] : '';
}

function unquoteScalar(raw) {
  const text = String(raw).replace(/\s+#.*$/, '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

export function parseYamlScalars(yaml) {
  const lines = String(yaml).replace(/\r\n/g, '\n').split('\n');
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }
    const key = keyMatch[1];
    const rest = keyMatch[2];
    if (rest === '|' || rest === '|-') {
      const block = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (next === '' || /^\s+/.test(next)) {
          block.push(next.replace(/^ {2}/, ''));
          i += 1;
          continue;
        }
        break;
      }
      while (block.length && block[block.length - 1] === '') block.pop();
      out[key] = block.join('\n');
      continue;
    }
    if (rest === '') {
      i += 1;
      while (i < lines.length && (lines[i] === '' || /^\s+/.test(lines[i]))) i += 1;
      if (out[key] == null) out[key] = '';
      continue;
    }
    out[key] = unquoteScalar(rest);
    i += 1;
  }
  return out;
}

export function loadFactionSheet(absPath) {
  const markdown = readFileSync(absPath, 'utf8');
  const scalars = parseYamlScalars(extractYamlFence(markdown));
  return {
    ...scalars,
    rel: absPath.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'),
    markdown,
  };
}

export function listFactionSheetFiles(dir = FACTION_SHEET_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(dir, name))
    .sort();
}

export function resolveExampleCite(cite) {
  const bark = String(cite || '').match(BARK_CITE);
  if (bark) {
    const [, factionId, situation, index] = bark;
    const lines = BARKS[factionId] && BARKS[factionId][situation];
    if (!Array.isArray(lines)) return null;
    const line = lines[Number(index)];
    return typeof line === 'string' ? line : null;
  }
  const comms = String(cite || '').match(COMMS_CITE);
  if (comms) {
    const [, bucket, id] = comms;
    const rows = COMMS[bucket];
    if (!Array.isArray(rows)) return null;
    const row = rows.find((item) => item && item.id === id);
    return row && typeof row.text === 'string' ? row.text : null;
  }
  return null;
}

// Which house does a cite belong to? Bark cites name their house; narrative cites
// belong to Helix, the one house with no bark table.
export function citeHouseId(cite) {
  const bark = String(cite || '').match(BARK_CITE);
  if (bark) return bark[1];
  if (String(cite || '').match(COMMS_CITE)) return 'faction_helix';
  return null;
}

export function freeFrontierVoiceRegister(sheet) {
  return trimRule(sheet && sheet.voice_register);
}

export function validateFactionRegister(sheet) {
  const issues = [];
  const id = sheet && sheet.id;
  if (id === FREE_FRONTIER_ID) {
    if (!freeFrontierVoiceRegister(sheet)) {
      issues.push(issue('free_frontier_uncited', 'Free Frontier must keep voice_register', 'voice_register'));
    }
    for (const key of REGISTER_KEYS) {
      if (trimRule(sheet[key])) {
        issues.push(issue('invented_house', 'Free Frontier is cite-only; do not invent a ninth house', key));
      }
    }
    return issues;
  }
  if (!REGISTER_HOUSE_IDS.includes(id)) {
    issues.push(issue('invented_house', `invented house ${id || '(missing id)'}`, 'id'));
    return issues;
  }

  const present = REGISTER_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(sheet, key) && String(sheet[key] ?? '').length > 0);
  if (present.length === 0) {
    issues.push(issue('lore_only', 'lore-only sheet; writing-rule keys are missing', 'register_rule'));
    return issues;
  }

  for (const key of REGISTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(sheet, key)) {
      issues.push(issue('missing_key', `missing ${key}`, key));
    } else if (!trimRule(sheet[key])) {
      issues.push(issue(key === 'register_rule' ? 'empty_rule' : 'empty_key', `empty ${key}`, key));
    }
  }

  const example = trimRule(sheet.register_example);
  const cite = trimRule(sheet.register_example_cite);
  const sourceBytes = resolveExampleCite(cite);
  if (!sourceBytes) {
    issues.push(issue('invented_example', 'example cite does not resolve source bytes', 'register_example_cite'));
  } else if (example !== sourceBytes) {
    issues.push(issue('invented_example', 'example text does not match cited source bytes', 'register_example'));
  }

  // The cite must anchor the sheet's own house: Concord's register cannot rest on
  // Meridian bytes. Helix is the one house allowed a narrative cite.
  const citedHouse = citeHouseId(cite);
  if (citedHouse && citedHouse !== id) {
    issues.push(issue('cross_house_cite', `cite belongs to ${citedHouse}, not ${id}`, 'register_example_cite'));
  }

  // The example must demonstrate the rule: it carries at least one tell and none
  // of the house's own forbidden terms.
  if (example && sourceBytes && example === sourceBytes) {
    const normalized = normalizeLine(example);
    const tells = parseKeyList(sheet.register_tell).map(normalizeLine).filter(Boolean);
    if (tells.length > 0 && !tells.some((tell) => normalized.includes(tell))) {
      issues.push(issue('example_misses_tell', 'example carries none of its own tells', 'register_example'));
    }
    const forbidden = parseKeyList(sheet.register_forbidden).map(normalizeLine).filter(Boolean);
    const foul = forbidden.find((term) => normalized.includes(term));
    if (foul) {
      issues.push(issue('forbidden_in_example', `example uses forbidden term "${foul}"`, 'register_example'));
    }
  }

  return issues;
}

// Score one bark against one house sheet. Returns -1 when the bark uses the
// house's own forbidden terms (disqualified), else the count of distinct tell
// phrases present. Case-insensitive; matching never rewrites stored bytes.
export function scoreHouse(sheet, line) {
  const normalized = normalizeLine(line);
  if (!normalized) return -1;
  const forbidden = parseKeyList(sheet && sheet.register_forbidden).map(normalizeLine).filter(Boolean);
  if (forbidden.some((term) => normalized.includes(term))) return -1;
  const tells = parseKeyList(sheet && sheet.register_tell).map(normalizeLine).filter(Boolean);
  let hits = 0;
  for (const tell of tells) {
    if (normalized.includes(tell)) hits += 1;
  }
  return hits;
}

export function assignRegister(line, houses = null) {
  const bark = trimRule(line);
  if (!bark) return null;
  const sheets = houses || loadRegisterHouses();
  const exact = sheets.filter((sheet) => trimRule(sheet.register_example) === bark);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  let best = null;
  let bestScore = 0;
  let tied = false;
  for (const sheet of sheets) {
    const score = scoreHouse(sheet, bark);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = sheet.id;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  if (!best || tied) return null;
  return best;
}

export function loadRegisterHouses(dir = FACTION_SHEET_DIR) {
  return REGISTER_HOUSE_IDS.map((id) => loadFactionSheet(join(dir, REGISTER_SHEET_FILES[id])));
}

export function validateFactionRegisterCorpus(dir = FACTION_SHEET_DIR) {
  const reports = [];
  const seen = new Set();
  for (const absPath of listFactionSheetFiles(dir)) {
    const sheet = loadFactionSheet(absPath);
    const issues = validateFactionRegister(sheet);
    reports.push({ rel: sheet.rel, id: sheet.id, issues });
    if (sheet.id) seen.add(sheet.id);
  }
  for (const id of REGISTER_HOUSE_IDS) {
    if (seen.has(id)) continue;
    reports.push({
      rel: `docs/worldbuilding/sheets/factions/${REGISTER_SHEET_FILES[id]}`,
      id,
      issues: [issue('missing_key', `house ${id} has no sheet`, 'id')],
    });
  }
  return reports;
}

// Every live bark line a house speaks, for corpus sweeps. Helix has no bark
// table; its register rests on its cited narrative comm (see its sheet).
export function liveHouseLines(houseId) {
  const table = BARKS[houseId];
  if (!table) return [];
  const out = [];
  for (const [situation, lines] of Object.entries(table)) {
    if (!Array.isArray(lines)) continue;
    lines.forEach((line, index) => {
      if (typeof line === 'string' && line) out.push({ situation, index, line });
    });
  }
  return out;
}

// Forbidden enforcement against the live corpus: a house's own table must not
// speak the terms its sheet forbids. Returns offending rows per house.
export function scanHouseTableForForbidden(sheet) {
  const forbidden = parseKeyList(sheet && sheet.register_forbidden).map(normalizeLine).filter(Boolean);
  if (forbidden.length === 0) return [];
  return liveHouseLines(sheet && sheet.id)
    .map((row) => {
      const normalized = normalizeLine(row.line);
      const foul = forbidden.find((term) => normalized.includes(term));
      return foul ? { ...row, foul } : null;
    })
    .filter(Boolean);
}
