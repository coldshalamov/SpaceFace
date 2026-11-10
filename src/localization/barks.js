// Bark corpus translations. Agent register pass — not a machine dump.
// Registers (from src/data/barks.js): Concord bureaucratic / Meridian mercantile / Drift tired
// / Reach salvage-math / Quiet terse / Choir liturgy / Frontier plain / Vael clause-language.
// Arrays are index-aligned with the English corpus. Placeholders {ship} {class} stay intact.
// Translation rows live in the sibling JSON asset as [es, fr, de, pt]; browser callers wait for
// the localization readiness barrier, while file-backed Node imports install the sidecar inline.

import {
  BARKS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  HULL_RECOGNITION,
} from '../data/barks.js';

const BARK_TRANSLATION_SCHEMA = 'spaceface.localizedBarkCatalog.v1';
const BARK_TRANSLATION_LOCALES = Object.freeze(['es', 'fr', 'de', 'pt']);
let T = null;
let HULL = null;

const locKey = (locale) => (
  locale === 'es-ES' ? 'es' : locale === 'fr-FR' ? 'fr' : locale === 'de-DE' ? 'de' : locale === 'pt-BR' ? 'pt' : null
);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function translationPayloadErrors(payload) {
  const errors = [];
  if (!payload || payload.schema !== BARK_TRANSLATION_SCHEMA
    || !hasExactKeys(payload, ['schema', 'tables', 'hull'])) {
    return ['invalid schema or top-level shape'];
  }
  if (!hasExactKeys(payload.tables, BARK_FACTIONS)) errors.push('faction table keys do not match BARK_FACTIONS');
  for (const faction of BARK_FACTIONS) {
    const table = payload.tables && payload.tables[faction];
    if (!hasExactKeys(table, BARK_SITUATIONS)) {
      errors.push(`${faction} situation keys do not match BARK_SITUATIONS`);
      continue;
    }
    for (const situation of BARK_SITUATIONS) {
      const english = BARKS[faction] && BARKS[faction][situation] || [];
      const rows = table[situation];
      if (!Array.isArray(rows) || rows.length !== english.length) {
        errors.push(`${faction}.${situation} expected ${english.length} rows`);
        continue;
      }
      rows.forEach((row, index) => {
        if (!Array.isArray(row) || row.length !== BARK_TRANSLATION_LOCALES.length
          || row.some((translation) => typeof translation !== 'string')) {
          errors.push(`${faction}.${situation}.${index} has an invalid locale row`);
        }
      });
    }
  }
  if (!hasExactKeys(payload.hull, Object.keys(HULL_RECOGNITION))) {
    errors.push('hull faction keys do not match HULL_RECOGNITION');
  }
  for (const faction of Object.keys(HULL_RECOGNITION)) {
    const english = HULL_RECOGNITION[faction] || [];
    const rows = payload.hull && payload.hull[faction];
    if (!Array.isArray(rows) || rows.length !== english.length) {
      errors.push(`hull.${faction} expected ${english.length} rows`);
      continue;
    }
    rows.forEach((row, index) => {
      if (!Array.isArray(row) || row.length !== BARK_TRANSLATION_LOCALES.length
        || row.some((translation) => typeof translation !== 'string')) {
        errors.push(`hull.${faction}.${index} has an invalid locale row`);
      }
    });
  }
  return errors;
}

export function installBarkTranslations(payload) {
  const errors = translationPayloadErrors(payload);
  if (errors.length) throw new Error(`Bark translation catalog is invalid: ${errors.slice(0, 8).join('; ')}`);
  T = deepFreeze(payload.tables);
  HULL = deepFreeze(payload.hull);
  textMaps.clear();
  return true;
}

export function isBarkTranslationsReady() {
  return T !== null && HULL !== null;
}

function requireBarkTranslations(locale) {
  if (locKey(locale) && !isBarkTranslationsReady()) {
    throw new Error('Bark translations are not ready; await ensureLocalizationReady()');
  }
}

const textMaps = new Map();

function loadNodeBarkTranslations() {
  const nodeProcess = typeof process !== 'undefined' ? process : null;
  if (!nodeProcess?.versions?.node || !import.meta.url.startsWith('file:')
    || typeof nodeProcess.getBuiltinModule !== 'function') return;
  const fs = nodeProcess.getBuiltinModule('node:fs');
  const { fileURLToPath } = nodeProcess.getBuiltinModule('node:url');
  const assetPath = fileURLToPath(new URL('./barks.generated.json', import.meta.url));
  installBarkTranslations(JSON.parse(fs.readFileSync(assetPath, 'utf8')));
}

function pick(row, locale) {
  const k = locKey(locale);
  if (!k || !row) return null;
  return row[BARK_TRANSLATION_LOCALES.indexOf(k)];
}

export function barkMessagesFor(locale) {
  requireBarkTranslations(locale);
  const out = {};
  for (const faction of BARK_FACTIONS) {
    for (const situation of BARK_SITUATIONS) {
      const english = (BARKS[faction] && BARKS[faction][situation]) || [];
      const rows = (T && T[faction] && T[faction][situation]) || [];
      english.forEach((line, index) => {
        const key = `loc.bark.${faction}.${situation}.${index}`;
        out[key] = locale === 'en-US' ? line : (pick(rows[index], locale) || line);
      });
    }
  }
  for (const faction of Object.keys(HULL_RECOGNITION)) {
    const english = HULL_RECOGNITION[faction] || [];
    const rows = (HULL && HULL[faction]) || [];
    english.forEach((line, index) => {
      const key = `loc.bark.hull.${faction}.${index}`;
      out[key] = locale === 'en-US' ? line : (pick(rows[index], locale) || line);
    });
  }
  return Object.freeze(out);
}

export function barkTextMap(locale) {
  requireBarkTranslations(locale);
  if (textMaps.has(locale)) return textMaps.get(locale);
  const map = new Map();
  const translated = barkMessagesFor(locale);
  const english = barkMessagesFor('en-US');
  for (const [key, en] of Object.entries(english)) {
    map.set(en, translated[key]);
  }
  textMaps.set(locale, map);
  return map;
}

export function barkParityErrors() {
  if (!isBarkTranslationsReady()) throw new Error('Bark translations are not ready; await ensureLocalizationReady()');
  const errors = [];
  for (const faction of BARK_FACTIONS) {
    for (const situation of BARK_SITUATIONS) {
      const english = (BARKS[faction] && BARKS[faction][situation]) || [];
      const rows = (T[faction] && T[faction][situation]) || [];
      if (rows.length !== english.length) {
        errors.push(`${faction}.${situation} expected ${english.length} got ${rows.length}`);
      }
    }
  }
  for (const faction of Object.keys(HULL_RECOGNITION)) {
    const english = HULL_RECOGNITION[faction] || [];
    const rows = HULL[faction] || [];
    if (rows.length !== english.length) {
      errors.push(`hull.${faction} expected ${english.length} got ${rows.length}`);
    }
  }
  return errors;
}

export default {
  barkMessagesFor,
  barkTextMap,
  barkParityErrors,
};

loadNodeBarkTranslations();
