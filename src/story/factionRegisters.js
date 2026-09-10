// Leftover PQ-178.02 reader. Not a leftover campaign owner.
// Reads leftover faction writing-rule keys. Cites leftover barks.js /
// leftover narrative.js bytes. Does not rewrite them.

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

export const REGISTER_KEYS = Object.freeze([
  'register_rule',
  'register_tell',
  'register_forbidden',
  'register_example',
  'register_example_cite',
  'voice_direction',
]);

// Leftover eight houses from leftover factions-CANONICAL.md. Not leftover Free Frontier.
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

export function leftoverFreeFrontierVoiceRegister(sheet) {
  return trimRule(sheet && sheet.voice_register);
}

export function validateFactionRegister(sheet) {
  const issues = [];
  const id = sheet && sheet.id;
  if (id === FREE_FRONTIER_ID) {
    if (!leftoverFreeFrontierVoiceRegister(sheet)) {
      issues.push(issue('free_frontier_uncited', 'leftover Free Frontier must keep leftover voice_register', 'voice_register'));
    }
    for (const key of REGISTER_KEYS) {
      if (trimRule(sheet[key])) {
        issues.push(issue('invented_house', 'leftover Free Frontier is leftover cite-only; do not invent a ninth leftover house', key));
      }
    }
    return issues;
  }
  if (!REGISTER_HOUSE_IDS.includes(id)) {
    issues.push(issue('invented_house', `leftover invented house ${id || '(missing id)'}`, 'id'));
    return issues;
  }

  const present = REGISTER_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(sheet, key) && String(sheet[key] ?? '').length > 0);
  if (present.length === 0) {
    issues.push(issue('lore_only', 'leftover lore-only leftover sheet; leftover writing-rule keys are missing', 'register_rule'));
    return issues;
  }

  for (const key of REGISTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(sheet, key)) {
      issues.push(issue('missing_key', `leftover missing leftover ${key}`, key));
    }
  }

  if (Object.prototype.hasOwnProperty.call(sheet, 'register_rule') && !trimRule(sheet.register_rule)) {
    issues.push(issue('empty_rule', 'leftover empty leftover register_rule', 'register_rule'));
  }

  const example = trimRule(sheet.register_example);
  const cite = trimRule(sheet.register_example_cite);
  const leftoverBytes = resolveExampleCite(cite);
  if (!leftoverBytes) {
    issues.push(issue('invented_example', 'leftover example cite does not resolve leftover source bytes', 'register_example_cite'));
  } else if (example !== leftoverBytes) {
    issues.push(issue('invented_example', 'leftover example text does not match leftover cited leftover source bytes', 'register_example'));
  }

  return issues;
}

export function assignRegister(line) {
  const bark = trimRule(line);
  if (!bark) return null;
  const sheets = loadRegisterHouses();
  const exact = sheets.filter((sheet) => trimRule(sheet.register_example) === bark);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const hits = sheets.filter((sheet) => {
    const tell = trimRule(sheet.register_tell);
    return tell && bark.includes(tell);
  });
  if (hits.length === 1) return hits[0].id;
  return null;
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
      issues: [issue('missing_key', `leftover house ${id} has no leftover sheet`, 'id')],
    });
  }
  return reports;
}
