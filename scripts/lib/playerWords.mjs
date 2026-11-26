// Words a player must never read (design/overhaul/08_INTERFACE.md §5, ruling R18).
//
// Each entry is a pattern over the text a screen actually shows (document.body.innerText in the
// UI bench), so ids, class names and file names never trip it — only words on the glass do.
// Add a word here when a reviewer finds one on screen; say where it was seen.

export const BANNED_PLAYER_WORDS = Object.freeze([
  { word: 'Crucible', re: /\bcrucible\b/i, why: "Swarm's old name" },
  { word: 'AFTERMATH', re: /\bAFTERMATH\b/, why: 'campaign card label leaking into play' },
  { word: 'FIELD RESPONSE', re: /\bFIELD RESPONSE\b/, why: 'internal system name' },
  { word: 'IGNITION / FLARE / NOVA', re: /\b(?:IGNITION|FLARE|NOVA)\b/, why: 'style-meter tier names; say the multiplier' },
  { word: 'MIXED / TERRAIN / DIRECT +n', re: /\b(?:MIXED|TERRAIN|DIRECT)\s*\+\s*\d/, why: 'scoring jargon' },
  { word: 'Converged on', re: /\bconverged on\b/i, why: 'ledger prose' },
  { word: 'Unknown weapon', re: /\bunknown weapon\b|\bunidentified weapon\b/i, why: 'the damage owner must always know its source' },
  { word: '? unknown', re: /\?\s*unknown\b/i, why: 'unnamed killer' },
  { word: 'STALE', re: /\bSTALE\b/, why: 'developer state word' },
  { word: 'TOO HEAVY', re: /\btoo heavy\b/i, why: 'the rope never refuses (R12)' },
  { word: 'pressure %', re: /\bpressure\s*\d*\s*%/i, why: 'tuning number' },
  { word: 'cr/min', re: /\bcr\s*\/\s*min\b/i, why: 'spreadsheet rate' },
  { word: 'headroom', re: /\bheadroom\b/i, why: 'engineering jargon' },
  { word: 'cap load', re: /\bcap load\b/i, why: 'engineering jargon' },
  { word: 'RESEARCH POINTS', re: /\bresearch points\b/i, why: 'retired currency' },
  { word: 'Bay screen', re: /\bbay screen\b/i, why: 'retired news crawl' },
  { word: 'Station wire', re: /\bstation wire\b/i, why: 'retired news crawl' },
  { word: 'banked into the hangar', re: /\bbanked into the hangar\b/i, why: 'retired Swarm hangar prose' },
  { word: 'Ship fix', re: /\bship fix\b/i, why: 'map jargon' },
  { word: 'Hdg', re: /\bHdg\b/, why: 'map jargon' },
  { word: 'unbound', re: /\bunbound\b/i, why: 'empty power socket' },
  { word: 'map coordinates', re: /\(\s*[-−]?\d+(?:\.\d+)?\s*,\s*[-−]?\d+(?:\.\d+)?\s*\)\s*(?:m|k|km|u)?\b/, why: 'coordinates instead of places' },
]);

/** Every banned word found in `text`, with a short excerpt of where it sits. */
export function findBannedPlayerWords(text) {
  const source = String(text || '');
  const hits = [];
  for (const entry of BANNED_PLAYER_WORDS) {
    const match = entry.re.exec(source);
    if (!match) continue;
    const at = match.index;
    const excerpt = source.slice(Math.max(0, at - 30), Math.min(source.length, at + match[0].length + 30))
      .replace(/\s+/g, ' ').trim();
    hits.push({ word: entry.word, why: entry.why, excerpt });
  }
  return hits;
}
