// Pure station-contact memory helpers. The stationContacts system owns mutation; UI and checks use
// these functions as read-only presenters so contact continuity survives without a second writer.

import { normalizeVonnFreightLoss } from './vonnFreightLoss.js';

export const STATION_CONTACT_MEMORY_VERSION = 1;
export const STATION_CONTACT_COUNTER_VERSION = 1;

const counter = (contactId, min, max, label) => Object.freeze({ contactId, min, max, initial: 0, label });

// Persistent seams for the depth-program cast. Mission chains own the events that change these;
// stationContacts is the sole writer. Registering them now keeps future story work from inventing
// ad-hoc booleans in unrelated systems.
export const CONTACT_COUNTER_DEFS = Object.freeze({
  'yune.trust': counter('contact_yune', 0, 3, 'Yune trust'),
  'coldburn.grudge': counter('contact_coldburn_rey', 0, 3, 'Coldburn grudge'),
  'suhl.clauses': counter('contact_iren_suhl', 0, 9, 'Decoded clauses'),
  'orrin.case': counter('contact_orrin', 0, 5, 'Orrin evidence case'),
  'vane.favor': counter('contact_sker_vane', -3, 3, 'Sker Vane favor'),
  'senna.names': counter('contact_dustwife_senna', 0, 8, 'Names restored'),
  'latch.child': counter('contact_latch_child', 0, 999, 'Latch inventory memory'),
  'question.answers': counter('contact_question', 0, 3, 'Answers carried'),
  'dorin.trust': counter('contact_filecleaver_dorin', -1, 1, 'Dorin trust'),
  'vonn.interviews': counter('contact_lira_vonn', 0, 999, 'Margin interviews'),
  'zell.work': counter('contact_tinker_zell', 0, 20, 'Illegal installs'),
  'mara.debt': counter('contact_mara_children', -3, 3, 'Mara moral debt'),
  'kell.cover': counter('contact_wraith_kell', 0, 6, 'Kell cover integrity'),
  'doss.sources': counter('contact_halev_doss', 0, 20, 'Primary sources archived'),
  'vols.business': counter('contact_maera_vols', 0, 3, 'Vols unfinished business'),
});

const STANDING_LABELS = Object.freeze(['New', 'Recognized', 'Established', 'Trusted']);

function boundedInt(value, min, max) {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : min;
  return Math.max(min, Math.min(max, n));
}

export function createInitialStationContactCounters() {
  return Object.fromEntries(Object.entries(CONTACT_COUNTER_DEFS).map(([id, def]) => [id, def.initial]));
}

export function normalizeStationContactCounters(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(Object.entries(CONTACT_COUNTER_DEFS).map(([id, def]) => [
    id,
    boundedInt(Object.hasOwn(source, id) ? source[id] : def.initial, def.min, def.max),
  ]));
}

export function stationContactCounterValue(state, id) {
  const def = CONTACT_COUNTER_DEFS[id];
  if (!def) return 0;
  const source = state && state.player && state.player.stationContactCounters;
  return boundedInt(source && Object.hasOwn(source, id) ? source[id] : def.initial, def.min, def.max);
}

function safeToken(value, fallback = '') {
  return String(value == null ? fallback : value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function normalizeStationContactRecord(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const flags = {};
  if (source.flags && typeof source.flags === 'object' && !Array.isArray(source.flags)) {
    for (const [key, value] of Object.entries(source.flags)) {
      const clean = safeToken(key);
      if (clean && value === true) flags[clean] = true;
    }
  }
  const talkCount = boundedInt(source.talkCount, 0, 9999);
  const vonnFreightLoss = normalizeVonnFreightLoss(source.vonnFreightLoss);
  const record = {
    schemaVersion: STATION_CONTACT_MEMORY_VERSION,
    met: source.met === true || talkCount > 0,
    talkCount,
    standing: boundedInt(source.standing, 0, 3),
    stationId: safeToken(source.stationId) || null,
    canonicalKey: safeToken(source.canonicalKey) || null,
    name: String(source.name || '').replace(/\s+/g, ' ').trim().slice(0, 64),
    lastChoice: safeToken(source.lastChoice) || null,
    lastTalkSimTime: Number.isFinite(source.lastTalkSimTime)
      ? Math.max(0, Math.round(source.lastTalkSimTime * 1000) / 1000)
      : 0,
    lastDockSimTime: Number.isFinite(source.lastDockSimTime)
      ? Math.max(0, Math.round(source.lastDockSimTime * 1000) / 1000)
      : 0,
    flags,
  };
  // This is intentionally a single named subrecord rather than another general-purpose flag bag.
  // It is valid only for the exact independent freight/aftermath identity accepted by its reader.
  if (vonnFreightLoss) record.vonnFreightLoss = vonnFreightLoss;
  return record;
}

export function stationContactMemoryFor(state, contactId) {
  const bag = state && state.player && state.player.stationContacts;
  const id = String(contactId || '');
  if (!id || !bag || typeof bag !== 'object' || !bag[id]) return null;
  return normalizeStationContactRecord(bag[id]);
}

export function stationContactStanding(record) {
  const normalized = normalizeStationContactRecord(record);
  return STANDING_LABELS[normalized.standing];
}

export function stationContactMemoryLine(record, fallbackLine = '') {
  const normalized = normalizeStationContactRecord(record);
  if (!normalized.met) return String(fallbackLine || 'No prior contact.');
  const count = normalized.talkCount;
  const subject = normalized.lastChoice
    ? normalized.lastChoice.replace(/_/g, ' ')
    : 'local work';
  return `${count === 1 ? 'Met once' : `Met ${count} times`} · last discussed ${subject}.`;
}
