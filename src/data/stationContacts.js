// Pure station-contact memory helpers. The stationContacts system owns mutation; UI and checks use
// these functions as read-only presenters so contact continuity survives without a second writer.

export const STATION_CONTACT_MEMORY_VERSION = 1;

const STANDING_LABELS = Object.freeze(['New', 'Recognized', 'Established', 'Trusted']);

function boundedInt(value, min, max) {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : min;
  return Math.max(min, Math.min(max, n));
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
  return {
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

