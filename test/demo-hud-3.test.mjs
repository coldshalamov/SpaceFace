// DEMO-HUD-3 — flight HUD words a stranger was misreading.
// Kind arrows name the hull (Tendril, not The). The tracker key matches Help's F / RMB.
// The contact list stays off while the opening rail is the only voice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ENEMY_TYPES, enemyKindWord } from '../src/data/enemies.js';
import { haloKindWord } from '../src/ui/threatHalo.js';
import { contactDisplayName } from '../src/ui/map/flightMinimap.js';
import { setPromptDevice } from '../src/ui/bindings.js';
import { verbChip, verbChipKey } from '../src/ui/controlPrompts.js';
import { taughtLatchKey } from '../src/onboarding/verbSpeech.js';
import {
  contactRosterVisible,
  resolveTrackerActionKey,
  tellBearingMark,
  worldTagCenterCovered,
} from '../src/ui/hud.js';

const BAD_KIND = new Set([
  'The', 'Iron', 'Quiet', 'Customs', 'Forge', 'Point-Defense', 'Corsair', 'Fleeing',
  'Tether', 'Screen', 'Nest', 'Jack', 'Moth',
]);

test('every enemy kind is a short word, never the leading article or adjective', () => {
  assert.ok(ENEMY_TYPES.length > 20);
  for (const row of ENEMY_TYPES) {
    const kind = enemyKindWord(row);
    assert.ok(kind, `${row.id} has a kind word`);
    assert.equal(BAD_KIND.has(kind), false, `${row.id} (${row.name}) must not read as ${kind}`);
    assert.notEqual(kind, 'The');
  }
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'brood_tendril')), 'Tendril');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'yardmaster')), 'Yardmaster');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'enemy_iron_kraken')), 'Kraken');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'quiet_ghost')), 'Ghost');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'customs_cutter')), 'Cutter');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'corsair_raider')), 'Raider');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'wasp_swarmer')), 'Wasp');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'lancer_sniper')), 'Lancer');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'last_argument')), 'Argument');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'pd_screen_escort')), 'Escort');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'tether_control_raider')), 'Wrangler');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'nest_carrier')), 'Carrier');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'pallet_jack')), 'Pallet');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'mothlight')), 'Mothlight');
  assert.equal(enemyKindWord(ENEMY_TYPES.find((row) => row.id === 'forge_regent')), 'Regent');
  assert.equal(enemyKindWord({ name: 'The Last Argument' }), 'Argument',
    'a row with no authored kind still uses the last word, never The');
});

test('the edge arrow prints the kind; the radar keeps an authored name that fits', () => {
  const cases = [
    ['brood_tendril', 'The Tendril', 'Tendril'],
    ['yardmaster', 'The Yardmaster', 'Yardmaster'],
    ['enemy_iron_kraken', 'Iron Kraken', 'Kraken'],
    ['quiet_ghost', 'Quiet Ghost', 'Ghost'],
    ['customs_cutter', 'Customs Cutter', 'Cutter'],
    ['corsair_raider', 'Corsair Raider', 'Raider'],
  ];
  for (const [id, name, want] of cases) {
    const entity = { data: { enemyTypeId: id, name } };
    assert.equal(haloKindWord(entity, 'hostile'), want, `arrow ${name}`);
    assert.equal(contactDisplayName(entity, 'reach'), name, `radar keeps ${name}`);
  }
  assert.equal(haloKindWord({ data: {} }, 'the unknown'), 'Hostile');
  assert.equal(haloKindWord({ data: {} }, 'sniper'), 'Sniper');
  assert.equal(
    contactDisplayName({ data: { enemyTypeId: 'reaver_pirate', callsign: 'Gray Havoc' } }, 'reach'),
    'Gray Havoc',
    'an ace callsign that fits is still the radar name',
  );
  assert.equal(
    contactDisplayName({ data: { enemyTypeId: 'corsair_raider', name: 'RAIDER VEE-TWO' } }, 'reach'),
    'RAIDER VEE-TWO',
  );
  assert.equal(
    contactDisplayName({ data: { enemyTypeId: 'brood_tendril' } }, 'reach'),
    'Tendril',
    'a nameless hull falls back to the kind word',
  );
  assert.equal(
    contactDisplayName({
      data: { enemyTypeId: 'mule_trader', name: 'Relief-Freighter Choir-Tender' },
    }, 'reach'),
    'Trader',
    'a name that will not fit whole becomes the kind word, never an ellipsis',
  );
});

test('the tracker latch key is the taught F / RMB form, not a HUD rewrite to RMB', (t) => {
  t.after(() => setPromptDevice('kbm'));
  const state = { settings: { controls: { bindings: { tether: ['KeyF'] } } } };
  setPromptDevice('kbm');
  const chip = verbChip(state, 'tether', 'LATCH');
  const taught = taughtLatchKey(state);
  const keyed = resolveTrackerActionKey(state, 'Latch the loose rock. (F / RMB)');
  assert.equal(chip, 'RMB · LATCH', 'the aim chip still names the mouse on the rock');
  assert.equal(taught, 'F / RMB');
  assert.equal(keyed.key, taught);
  assert.equal(keyed.key, 'F / RMB');
  assert.equal(keyed.text, 'Latch the loose rock');
  assert.equal(
    resolveTrackerActionKey(state, 'Latch the loose rock. (F)').key,
    'F / RMB',
    'a leftover keyboard-only suffix expands to the taught form',
  );
  assert.equal(resolveTrackerActionKey(state, 'Dock (E)').key, 'E',
    'a line that is not the latch keeps its own key');
  assert.equal(
    resolveTrackerActionKey(state, 'Latch the raider (F / RMB) or fly away'),
    null,
    'a raid line that names both choices is not rewritten into a trailing key cap',
  );
  assert.equal(verbChipKey(state, 'tether'), 'RMB');
});

test('a GUNS tag whose hull centre sits on an instrument drops its words', () => {
  const schematic = { x: 40, y: 520, w: 280, h: 160 };
  assert.equal(worldTagCenterCovered(120, 600, [schematic]), true);
  assert.equal(worldTagCenterCovered(500, 200, [schematic]), false);
  assert.equal(worldTagCenterCovered(40, 520, [schematic]), true, 'the rect edge still covers the centre');
});

test('an edge-anchored warning chip drops the dropdown caret', () => {
  assert.equal(tellBearingMark({ onScreen: false, edgeAnchored: true, directionDeg: 90 }), null);
  assert.equal(tellBearingMark({ onScreen: true, edgeAnchored: false, directionDeg: 40 }), null);
  assert.equal(tellBearingMark({ onScreen: false, edgeAnchored: false, directionDeg: -30 }), -30);
});

test('the opening rail hides the contact census', () => {
  assert.equal(contactRosterVisible({
    locked: true, pinned: true, eligibleContactCount: 40, fight: false, opening: true,
  }), false, 'unscanned wrecks and collar prompts stay off while the rail speaks');
  assert.equal(contactRosterVisible({
    locked: true, eligibleContactCount: 2, opening: false,
  }), true);
});

test('the tracker second line wraps to two lines instead of a one-line ellipsis', () => {
  const css = readFileSync(new URL('../src/ui/orrery/visorHudSkin.js', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.sf-mt-compact-readings'), css.indexOf('.sf-mt-compact-readings') + 420);
  assert.match(rule, /line-clamp:\s*2/);
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /white-space:\s*nowrap/);
  assert.doesNotMatch(rule, /text-overflow:\s*ellipsis/);
});
