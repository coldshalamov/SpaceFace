// check-codex-narrative.mjs — validates the data contract between the codex/journal screen
// (src/ui/screens/codex.js), the story objective tracker (src/systems/onboarding.js + missionLog.js),
// and the narrative/story data tables (src/data/narrative.js + src/data/missions.js).
//
// The codex reads SHIP, COLD_START, REFS, FIGURES, COMMS (category-keyed arrays), BEAT_CONTENT,
// ENDGAME_CHOICES, GRAFFITI, and PERSISTENT_CARGO. The story tracker reads STORY_BEATS[beat].objective
// + BEAT_CONTENT[beat].hint for all 8 beats (0..7). A future refactor that renames a field or
// restructures COMMS would silently break these screens (empty/garbled sections, no error). This
// check pins the shapes so that drift fails the gate loudly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIP, COLD_START, REFS, FIGURES, COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, PERSISTENT_CARGO } from '../src/data/narrative.js';
import { STORY_BEATS } from '../src/data/missions.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const codexSource = readFileSync(join(ROOT, 'src/ui/screens/codex.js'), 'utf8');

// SHIP — the Tessera's sealed history (Ship tab).
for (const k of ['name', 'registration', 'incident', 'incidentRef', 'previousOperator', 'crewStatus', 'impoundMonths', 'friend']) {
  assert.ok(k in SHIP, `SHIP missing field "${k}" (read by codex Ship tab)`);
}
assert.ok(SHIP.friend && 'callsign' in SHIP.friend && 'debt' in SHIP.friend, 'SHIP.friend missing callsign/debt');

// COLD_START — the 3 opening comms (Comms tab, always-visible section).
assert.ok(Array.isArray(COLD_START) && COLD_START.length >= 1, 'COLD_START must be a non-empty array');
COLD_START.forEach((c, i) => {
  for (const k of ['id', 'sender', 'text', 'category']) {
    assert.ok(k in c, `COLD_START[${i}] missing "${k}"`);
  }
});

// REFS — the recurring reference codes (Ship tab).
assert.ok(REFS.CONTRACT_47A && REFS.REF_44C, 'REFS missing CONTRACT_47A / REF_44C');

// FIGURES — named figures (Figures tab). The codex reads these keys for always-visible + gated rows.
const FIGURE_KEYS = ['protagonist', 'kessler', 'hale', 'slate', 'quinn', 'voss', 'elroy', 'mira', 'rook', 'vale', 'kurtz'];
for (const k of FIGURE_KEYS) {
  assert.ok(k in FIGURES, `FIGURES missing "${k}" (codex Figures tab references it)`);
  assert.ok(FIGURES[k] && FIGURES[k].name, `FIGURES.${k} missing .name`);
}

// COMMS — category-keyed arrays (Comms tab iterates each). NOT a flat object of entries.
assert.ok(COMMS && typeof COMMS === 'object', 'COMMS must be an object');
const COMMS_CATS = ['ambient', 'traps', 'personal', 'late', 'story'];
for (const cat of COMMS_CATS) {
  assert.ok(Array.isArray(COMMS[cat]), `COMMS.${cat} must be an array (codex Comms tab iterates it)`);
  COMMS[cat].forEach((c, i) => {
    for (const k of ['id', 'sender', 'text']) {
      assert.ok(k in c, `COMMS.${cat}[${i}] missing "${k}"`);
    }
  });
}

// BEAT_CONTENT — 8 beats (Story tab indexes 0..7).
assert.ok(Array.isArray(BEAT_CONTENT) && BEAT_CONTENT.length === 8, `BEAT_CONTENT must have 8 entries (got ${(BEAT_CONTENT || []).length})`);
BEAT_CONTENT.forEach((b, i) => {
  for (const k of ['beat', 'phase', 'hint']) {
    assert.ok(k in b, `BEAT_CONTENT[${i}] missing "${k}"`);
  }
});

// ENDGAME_CHOICES — 5 choices (Story tab endgame section).
assert.ok(Array.isArray(ENDGAME_CHOICES) && ENDGAME_CHOICES.length === 5, `ENDGAME_CHOICES must have 5 (got ${(ENDGAME_CHOICES || []).length})`);
ENDGAME_CHOICES.forEach((c, i) => {
  for (const k of ['id', 'title', 'summary', 'kind']) {
    assert.ok(k in c, `ENDGAME_CHOICES[${i}] missing "${k}"`);
  }
});

// GRAFFITI — the ever-present bulkhead line (Graffiti tab).
assert.ok(GRAFFITI.GANG_DIDNT_MAKE_IT, 'GRAFFITI.GANG_DIDNT_MAKE_IT must exist (codex Graffiti tab shows it always)');

// Codex browsing: the screen promises a searchable journal. Search must filter already-rendered
// entries only, so locked future story content stays hidden and the player gets a clear empty state.
assert.match(codexSource, /el\('input', 'sf-codex-search'\)/, 'Codex must render a search input');
assert.match(codexSource, /placeholder = 'Search Codex'/, 'Codex search must have a stable player-facing placeholder');
assert.match(codexSource, /setAttribute\('aria-label', 'Search Codex'\)/,
  'Codex search must expose an accessible name');
assert.match(codexSource, /function normalizeSearch\(value\)/, 'Codex search must normalize case and whitespace');
assert.match(codexSource, /_applySearchFilter\(\)/, 'Codex must apply search filtering after each tab render');
assert.match(codexSource, /querySelectorAll\('\.sf-codex-entry'\)/,
  'Codex search must filter rendered entries rather than raw narrative data');
assert.match(codexSource, /No matching unlocked entries\./,
  'Codex search must show an empty state for no unlocked matches');

// PERSISTENT_CARGO — unsellable personal effects (Ship tab).
assert.ok(Array.isArray(PERSISTENT_CARGO) && PERSISTENT_CARGO.length >= 1, 'PERSISTENT_CARGO must be a non-empty array');
PERSISTENT_CARGO.forEach((p, i) => {
  for (const k of ['id', 'name', 'mass', 'note']) {
    assert.ok(k in p, `PERSISTENT_CARGO[${i}] missing "${k}"`);
  }
});

// STORY_BEATS — the 8-beat spine (read by the story objective tracker, P2-14). The tracker indexes
// STORY_BEATS[beat].objective for beat = state.story.beatIndex (0..7); every beat MUST have a
// non-empty objective or the tracker shows an empty "what now" (defeating its entire purpose).
assert.ok(Array.isArray(STORY_BEATS) && STORY_BEATS.length === 8, `STORY_BEATS must have 8 entries (got ${(STORY_BEATS || []).length})`);
STORY_BEATS.forEach((sb, i) => {
  assert.ok(sb.beat === i, `STORY_BEATS[${i}].beat must equal ${i} (got ${sb.beat}) — tracker indexes by position`);
  assert.ok(typeof sb.objective === 'string' && sb.objective.length > 0, `STORY_BEATS[${i}].objective must be a non-empty string (tracker shows it as the "what now")`);
  assert.ok(typeof sb.id === 'string', `STORY_BEATS[${i}].id must be a string`);
});
assert.equal(STORY_BEATS[0].id, 'cold_start', 'first story beat should be the cold-start objective');
assert.ok(!STORY_BEATS[0].objective.includes('Mine 10u Silicate'), 'story tracker must not keep mining-first cold-start copy');
assert.ok(STORY_BEATS[0].objective.includes('47-A mass signal'), 'story tracker should carry 47-A cold-open intent');
assert.ok(STORY_BEATS[0].objective.includes('Helios'), 'story tracker should still point the player back to Helios');
// Cross-contract: every beat index the tracker can show (0..7) must have a matching BEAT_CONTENT
// entry with a hint (the flavor line). A missing BEAT_CONTENT[beat] would make the tracker show the
// objective with no flavor — not fatal, but the contract is 8-for-8.
assert.equal(BEAT_CONTENT.length, 8, 'BEAT_CONTENT must have 8 entries to match STORY_BEATS (tracker cross-reads both)');
BEAT_CONTENT.forEach((b, i) => {
  assert.ok(typeof b.hint === 'string' && b.hint.length > 0, `BEAT_CONTENT[${i}].hint must be a non-empty string (tracker flavor line)`);
});

console.log('Codex/narrative data contract OK — SHIP, COLD_START(' + COLD_START.length + '), COMMS(' +
  COMMS_CATS.reduce((n, c) => n + COMMS[c].length, 0) + ' across ' + COMMS_CATS.length + ' cats), BEAT_CONTENT(' +
  BEAT_CONTENT.length + '), ENDGAME_CHOICES(' + ENDGAME_CHOICES.length + '), FIGURES(' + FIGURE_KEYS.length +
  '), PERSISTENT_CARGO(' + PERSISTENT_CARGO.length + '), STORY_BEATS(' + STORY_BEATS.length + ')');
