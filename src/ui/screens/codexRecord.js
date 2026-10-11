// The Record, as the Codex reads it (THE WORLD REMEMBERS, U-F). Pure and read-only: the deed ledger
// under state.story.record shaped into one standing strip and the newest deeds, ready for the Figures
// tab to draw as hairline rows. Reads through peek/deedsFor only, so a game with no deeds never gains
// the `record` key.

import { deedsFor, standingWith } from '../../systems/deedRecord.js';
import { deedLine, deedKindLabel, deedFactionName } from '../../data/deedPhrases.js';

export const RECORD_ROWS = 12;
export const RECORD_STRIP_FACTIONS = 4;
export const RECORD_EMPTY_LINE = 'No deeds the world would repeat yet.';

/** A faction's standing as a word in the game's register. */
export function standingWord(standing) {
  const s = Number(standing) || 0;
  if (s <= -4) return 'hostile';
  if (s <= -1) return 'wary';
  if (s >= 4) return 'admired';
  if (s >= 1) return 'approving';
  return 'even';
}

/** Sim seconds since a deed, as 'Nm' / 'Nh' ('<1m' inside the first minute). */
export function deedAgo(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return '<1m';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  return Math.floor(s / 3600) + 'h';
}

/**
 * { empty, emptyLine, total, standing: [{ factionId, name, word, text }], rows: [{ id, ago, label, line, told }] }
 * Never throws and never writes: a bare or malformed state is the empty model.
 */
export function recordSectionModel(state) {
  const model = { empty: true, emptyLine: RECORD_EMPTY_LINE, total: 0, standing: [], rows: [] };
  let deeds = [];
  try { deeds = deedsFor(state, {}); } catch (_) { deeds = []; }
  if (!deeds.length) return model;
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  model.empty = false;
  model.total = deeds.length;
  const seen = new Set();
  for (const deed of deeds) {
    if (!deed.factionId || seen.has(deed.factionId) || seen.size >= RECORD_STRIP_FACTIONS) continue;
    seen.add(deed.factionId);
    const name = deedFactionName(deed);
    const word = standingWord(standingWith(state, deed.factionId, now));
    model.standing.push({ factionId: deed.factionId, name, word, text: name + ': ' + word });
  }
  for (const deed of deeds.slice(0, RECORD_ROWS)) {
    model.rows.push({
      id: deed.id,
      ago: deedAgo(now - (Number(deed.t) || 0)),
      label: deedKindLabel(deed.kind),
      line: deedLine(deed, { voice: 'neutral' }) || '',
      told: deed.told > 0,
    });
  }
  return model;
}
