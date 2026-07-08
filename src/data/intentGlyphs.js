// BP-03.1 overview intent strip language.
//
// Pure data/read helpers for future contact-strip UI. This file does not read
// systems, draw HUD, mutate AI, or register runtime behavior.

const ROWS = Object.freeze([
  Object.freeze({
    id: 'intercepting',
    verb: 'INTERCEPT',
    label: 'Intercepting',
    glyph: 'intercept',
    priority: 40,
    aliases: Object.freeze(['intercept', 'intercepting', 'pursue', 'pursuing', 'approach', 'approaching', 'attack', 'attacking', 'engage', 'engaging', 'strafe', 'patrol']),
  }),
  Object.freeze({
    id: 'fleeing',
    verb: 'FLEE',
    label: 'Fleeing',
    glyph: 'flee',
    priority: 100,
    aliases: Object.freeze(['flee', 'fleeing', 'retreat', 'retreating', 'withdraw', 'withdrawing', 'break-off', 'forceflee']),
  }),
  Object.freeze({
    id: 'scanning',
    verb: 'SCAN',
    label: 'Scanning',
    glyph: 'scan',
    priority: 50,
    aliases: Object.freeze(['scan', 'scanning', 'inspect', 'inspecting', 'sensor', 'lock', 'locking', 'weapons-lock']),
  }),
  Object.freeze({
    id: 'docking',
    verb: 'DOCK',
    label: 'Docking',
    glyph: 'dock',
    priority: 30,
    aliases: Object.freeze(['dock', 'docking', 'undock', 'undocking', 'land', 'landing', 'station-approach']),
  }),
  Object.freeze({
    id: 'mining',
    verb: 'MINE',
    label: 'Mining',
    glyph: 'mine',
    priority: 30,
    aliases: Object.freeze(['mine', 'mining', 'drill', 'drilling', 'harvest', 'harvesting', 'extract']),
  }),
  Object.freeze({
    id: 'escorting',
    verb: 'ESCORT',
    label: 'Escorting',
    glyph: 'escort',
    priority: 35,
    aliases: Object.freeze(['escort', 'escorting', 'guard', 'guarding', 'screen', 'screening', 'formation', 'ward']),
  }),
  Object.freeze({
    id: 'interdicting',
    verb: 'INTERDICT',
    label: 'Interdicting',
    glyph: 'interdict',
    priority: 80,
    aliases: Object.freeze(['interdict', 'interdicting', 'interdiction', 'demand-cargo', 'demandcargo', 'toll', 'tolling', 'parley', 'pirate-toll']),
  }),
]);

export const INTENT_GLYPH_IDS = Object.freeze(ROWS.map((row) => row.id));
export const INTENT_GLYPHS = Object.freeze(Object.fromEntries(ROWS.map((row) => [row.id, row])));

const ALIASES = Object.freeze(buildAliasMap(ROWS));

export function intentGlyphById(id) {
  return INTENT_GLYPHS[normalizeToken(id)] || null;
}

export function intentGlyphForState(value) {
  return ALIASES[normalizeToken(value)] || intentGlyphById(value);
}

export function intentGlyphForContact(contact) {
  if (!contact || typeof contact !== 'object') return null;
  const data = contact.data || {};
  const ai = data.ai || contact.ai || {};
  const intent = data.intent || contact.intent || {};

  if (ai.forceFlee === true || data.forceFlee === true || contact.forceFlee === true) {
    return INTENT_GLYPHS.fleeing;
  }
  if (ai.demandCargo || data.demandCargo || data.pirateDemand || contact.pirateDemand) {
    return INTENT_GLYPHS.interdicting;
  }
  if (ai.mining || data.mining || contact.mining) return INTENT_GLYPHS.mining;
  if (ai.docking || data.docking || contact.docking) return INTENT_GLYPHS.docking;

  const candidates = [
    ai.intent,
    ai.fsm,
    ai.state,
    ai.mode,
    ai.barkSituation,
    intent.kind,
    intent.verb,
    intent.state,
    contact.intent,
    contact.activity,
    contact.state,
    ai.role,
    ai.preferredRole,
    data.role,
    contact.role,
  ];

  let best = null;
  for (const candidate of candidates) {
    const row = intentGlyphForState(candidate);
    if (!row) continue;
    if (!best || row.priority > best.priority) best = row;
  }
  return best;
}

export function intentStripReadout(contact) {
  const row = intentGlyphForContact(contact);
  return row ? Object.freeze({ id: row.id, verb: row.verb, label: row.label, glyph: row.glyph }) : null;
}

function buildAliasMap(rows) {
  const out = {};
  for (const row of rows) {
    out[normalizeToken(row.id)] = row;
    out[normalizeToken(row.verb)] = row;
    for (const alias of row.aliases || []) out[normalizeToken(alias)] = row;
  }
  return out;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export default {
  INTENT_GLYPH_IDS,
  INTENT_GLYPHS,
  intentGlyphById,
  intentGlyphForState,
  intentGlyphForContact,
  intentStripReadout,
};
