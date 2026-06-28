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
import { cargo, isPersistentCargo, removeCargo } from '../src/systems/cargo.js';
import { codexProgressSummary, commUnlocked } from '../src/ui/screens/codex.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const readSource = (path) => readFileSync(join(ROOT, path), 'utf8');
const codexSource = readSource('src/ui/screens/codex.js');
const bindingSource = readSource('src/ui/bindings.js');
const uiInputSource = readSource('src/ui/input.js');
const cargoSource = readSource('src/systems/cargo.js');
const hudSource = readSource('src/ui/hud.js');

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
assert.match(codexSource, /export function codexProgressSummary/,
  'Codex must expose a pure unlock-summary helper for progression trust checks');
assert.match(codexSource, /Codex Unlock Status/,
  'Codex must render a visible unlock-status strip');
assert.match(codexSource, /Locked counts mean future entries are intentionally hidden/,
  'Codex status copy must explain that hidden entries are intentionally gated');
assert.match(codexSource, /this\._renderStatus\(ctx\);[\s\S]*switch \(this\._activeTab\)/,
  'Codex status should render before the active tab entries');
assert.match(codexSource, /querySelectorAll\('\.sf-codex-entry'\)/,
  'Codex search should continue filtering only entries, not the status strip');
assert.match(codexSource, /export function commUnlocked/,
  'Codex must expose a pure comm unlock helper for trap-gating checks');
assert.match(codexSource, /seen\['trap_' \+ entry\.id\]/,
  'Codex must recognize persisted trap_<id> seen flags from the story system');
assert.match(codexSource, /if \(categoryKey === 'traps'\) return false;/,
  'Unseen conditional trap comms must stay hidden from the Codex');
assert.match(codexSource, /commUnlocked\(c, s, beat, key\)/,
  'Rendered comms must use the same unlock helper as the status summary');
assert.match(codexSource, /Dossier sealed until story beat B/,
  'Locked figure dossiers must explain the story-beat unlock state without revealing the dossier');
assert.match(bindingSource, /codex:\s*\{\s*key:\s*'k',\s*code:\s*'KeyK',\s*label:\s*'K'\s*\}/,
  'BINDINGS must expose K as the fixed Codex key');
assert.match(uiInputSource, /case BINDINGS\.codex\.key:[\s\S]*case 'K':[\s\S]*screenManager\.pushScreen\('codex'\)/,
  'Keyboard K must open Codex from flight');
assert.match(uiInputSource, /matchesBinding\(ev, BINDINGS\.codex\)[\s\S]*screenManager\.pushScreen\('codex'\)/,
  'Keyboard K must open Codex from the station hub without undocking');

// Codex progression trust: conditional trap comms use the story system's persisted `trap_<id>` key.
// They must not become visible merely because the player reached a later beat; that leaks unseen
// ambush/warning copy and makes the Codex feel like a spoiler list rather than a save-backed journal.
{
  const commsTotal = COLD_START.length + COMMS_CATS.reduce((sum, key) => sum + COMMS[key].length, 0);
  const valueFor = (summary, key) => {
    const item = summary.items.find((entry) => entry.key === key);
    return item && item.value;
  };
  const countUnlockedComms = (story, beat) => COLD_START.length + COMMS_CATS.reduce((sum, key) =>
    sum + COMMS[key].filter((entry) => commUnlocked(entry, story, beat, key)).length, 0);
  const firstTrap = COMMS.traps[0];
  const lateEntry = COMMS.late.find((entry) => entry.beat > 0) || COMMS.story.find((entry) => entry.beat > 0);
  assert.ok(firstTrap, 'COMMS.traps must contain at least one conditional signal for gating coverage');
  assert.equal(commUnlocked(firstTrap, { beatIndex: 7, seenComms: {} }, 7, 'traps'), false,
    'unseen trap comms must stay hidden even after late story progression');
  assert.equal(commUnlocked(firstTrap, { beatIndex: 0, seenComms: { ['trap_' + firstTrap.id]: true } }, 0, 'traps'), true,
    'trap comms must unlock when the persisted story seenComms key exists');
  assert.equal(commUnlocked(COMMS.ambient[0], { beatIndex: 0, seenComms: {} }, 0, 'ambient'), true,
    'beat-0 ambient comms must remain readable on a fresh Codex');

  let storyState = { beatIndex: 0, seenComms: {}, graffitiShown: {} };
  let summary = codexProgressSummary(storyState);
  assert.equal(valueFor(summary, 'Story'), '1/8 beats',
    'new games should show only the current story beat as unlocked');
  assert.equal(valueFor(summary, 'Comms'), countUnlockedComms(storyState, 0) + '/' + commsTotal + ' unlocked',
    'Codex status should count beat-reached comms without exposing future or unseen conditional lines');
  assert.equal(valueFor(summary, 'Figures'), '6/11 known',
    'Codex status should count only always-visible figures at beat 0');
  assert.equal(valueFor(summary, 'Graffiti'), '1/' + Object.keys(GRAFFITI).length + ' encountered',
    'Codex status should count the always-present ship graffiti mark');
  assert.equal(valueFor(summary, 'Endgame'), '0/5 revealed',
    'Codex status should not reveal endgame choices before beat 7');
  assert.equal(valueFor(summary, 'Phase'), 'Phase 1',
    'Codex status should show the current narrative phase');

  storyState = {
    beatIndex: 4,
    seenComms: lateEntry ? { [lateEntry.id]: true, ['trap_' + firstTrap.id]: true } : { ['trap_' + firstTrap.id]: true },
    graffitiShown: { ['airlock:' + GRAFFITI.REDISTRIBUTED]: true },
  };
  summary = codexProgressSummary(storyState);
  assert.equal(valueFor(summary, 'Story'), '5/8 beats',
    'Codex status should advance story counts with beat progress');
  assert.equal(valueFor(summary, 'Figures'), '10/11 known',
    'Codex status should count beat-gated figures through beat 4');
  assert.equal(valueFor(summary, 'Graffiti'), '2/' + Object.keys(GRAFFITI).length + ' encountered',
    'Codex status should include encountered graffiti flags without leaking unseen lines');
  assert.equal(valueFor(summary, 'Comms'), countUnlockedComms(storyState, 4) + '/' + commsTotal + ' unlocked',
    'Codex status should count explicit seen flags, including persisted conditional trap signals');

  summary = codexProgressSummary({ beatIndex: 7, seenComms: {}, graffitiShown: {} });
  assert.equal(valueFor(summary, 'Endgame'), '5/5 revealed',
    'Codex status should reveal endgame counts only at the final beat');
}

// PERSISTENT_CARGO — unsellable personal effects (Ship tab).
assert.ok(Array.isArray(PERSISTENT_CARGO) && PERSISTENT_CARGO.length >= 1, 'PERSISTENT_CARGO must be a non-empty array');
PERSISTENT_CARGO.forEach((p, i) => {
  for (const k of ['id', 'name', 'mass', 'note']) {
    assert.ok(k in p, `PERSISTENT_CARGO[${i}] missing "${k}"`);
  }
});
assert.match(cargoSource, /export function isPersistentCargo/,
  'cargo system must expose an explicit persistent-cargo guard');
assert.match(hudSource, /PERSISTENT_CARGO_BY_ID/,
  'HUD cargo panel should resolve personal-effects names from narrative data');
assert.match(hudSource, /Personal effects cannot be jettisoned/,
  'HUD cargo panel must not show personal effects as disposable cargo');
assert.match(hudSource, /function cargoVolumeForRow/,
  'HUD cargo panel must render the authored zero-volume footprint for personal effects');
{
  const lockedState = {
    story: { persistentCargo: ['cmdty_ore_iron'] },
    player: { cargo: { items: { cmdty_ore_iron: 2 }, usedVolume: 2, usedMass: 2, capVolume: 40, capMass: 40 } },
  };
  assert.equal(isPersistentCargo(lockedState, 'cmdty_ore_iron'), true,
    'persistent cargo ids should be recognized from story.persistentCargo');
  assert.equal(removeCargo(lockedState, 'cmdty_ore_iron', 1), 0,
    'persistent cargo should not be removable through the cargo helper');
  assert.equal(lockedState.player.cargo.items.cmdty_ore_iron, 2,
    'failed persistent-cargo removal should leave the cargo quantity unchanged');

  const normalState = {
    story: { persistentCargo: [] },
    player: { cargo: { items: { cmdty_ore_iron: 2 }, usedVolume: 2, usedMass: 2, capVolume: 40, capMass: 40 } },
  };
  assert.equal(removeCargo(normalState, 'cmdty_ore_iron', 1), 1,
    'normal cargo should still be removable');
  assert.equal(normalState.player.cargo.items.cmdty_ore_iron, 1,
    'normal cargo removal should decrement the item quantity');

  const personal = PERSISTENT_CARGO.find((p) => p.id === 'cmdty_personal_ledger') || PERSISTENT_CARGO[0];
  const storyState = {
    story: { persistentCargo: [personal.id] },
    player: { cargo: { items: { [personal.id]: 2 }, usedVolume: 99, usedMass: 0, capVolume: 1, capMass: 40 } },
  };
  const events = [];
  const bus = {
    on() {},
    emit(event, payload) { events.push({ event, payload }); },
  };
  cargo.init({ state: storyState, bus, helpers: {}, registry: { get: () => null } });
  assert.equal(storyState.player.cargo.usedVolume, 0,
    'personal effects should not consume cargo volume');
  assert.equal(storyState.player.cargo.usedMass, personal.mass * 2,
    'personal effects should still contribute authored cargo mass');
  assert.ok(events.some((e) => e.event === 'cargo:changed' && e.payload.massT === personal.mass * 2),
    'personal-effect mass recompute should notify cargo UI listeners');
}

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
