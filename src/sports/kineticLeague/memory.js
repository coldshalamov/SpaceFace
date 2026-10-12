// League memory. Scrip is a local record, not the economy credit writer.
// Resetting a round cannot mint a second purse.

export const LEAGUE_VERSION = 1;

export const TIERS = Object.freeze(['qualification', 'bronze', 'silver', 'champion']);

export function freshLeagueMemory() {
  return {
    version: LEAGUE_VERSION,
    discovered: false,
    discoveredAt: 0,
    via: null,
    scrip: 0,
    solved: {},
    paid: {},
    records: {},
  };
}

function finiteCount(n, hi = 1e6) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(0, Math.floor(n))) : 0;
}

export function normalizeLeagueMemory(raw) {
  const m = freshLeagueMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== LEAGUE_VERSION) return m;
  m.discovered = raw.discovered === true;
  m.discoveredAt = Number.isFinite(raw.discoveredAt) ? Math.max(0, raw.discoveredAt) : 0;
  m.via = typeof raw.via === 'string' ? raw.via.slice(0, 40) : null;
  m.scrip = finiteCount(raw.scrip, 1e7);
  if (raw.solved && typeof raw.solved === 'object') {
    for (const k of Object.keys(raw.solved)) if (raw.solved[k] === true) m.solved[k] = true;
  }
  if (raw.paid && typeof raw.paid === 'object') {
    for (const k of Object.keys(raw.paid)) if (raw.paid[k] === true) m.paid[k] = true;
  }
  if (raw.records && typeof raw.records === 'object') {
    for (const k of Object.keys(raw.records)) {
      const row = raw.records[k];
      if (!row || typeof row !== 'object') continue;
      m.records[k] = {
        attempts: finiteCount(row.attempts),
        best: Number.isFinite(row.best) ? row.best : 0,
        clean: row.clean === true,
        trick: row.trick === true,
        assisted: row.assisted === true,
        solved: row.solved === true,
      };
    }
  }
  return m;
}

export function tierIndex(tier) {
  return TIERS.indexOf(tier);
}

/** Previous tier must have at least one solved event. Qualification opens on discovery. */
export function tierUnlocked(memory, tier, events) {
  const m = memory || freshLeagueMemory();
  if (!m.discovered) return false;
  const idx = tierIndex(tier);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prev = TIERS[idx - 1];
  return events.some((event) => event.tier === prev && m.solved[event.id] === true);
}

export function blankRecord() {
  return { attempts: 0, best: 0, clean: false, trick: false, assisted: false, solved: false };
}

export function noteAttempt(memory, eventId) {
  const row = memory.records[eventId] || blankRecord();
  row.attempts += 1;
  memory.records[eventId] = row;
  return row;
}

export function noteResult(memory, eventId, result) {
  const row = memory.records[eventId] || blankRecord();
  if (result.won) {
    row.solved = true;
    memory.solved[eventId] = true;
    if (result.clean) row.clean = true;
    if (result.trick) row.trick = true;
    if (result.assisted) row.assisted = true;
    if (Number.isFinite(result.best) && result.best > row.best) row.best = result.best;
  }
  memory.records[eventId] = row;
  return row;
}

/** Pays the event purse once. A second claim, a practice run, or a retry returns 0. */
export function claimPurse(memory, event) {
  if (!memory || !event) return 0;
  if (memory.solved[event.id] !== true) return 0;
  if (memory.paid[event.id] === true) return 0;
  const amount = Number.isFinite(event.purse) ? Math.max(0, Math.floor(event.purse)) : 0;
  memory.paid[event.id] = true;
  memory.scrip += amount;
  return amount;
}
