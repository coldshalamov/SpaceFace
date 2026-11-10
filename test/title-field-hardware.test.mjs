// The title screen's standard. Written against the Field Hardware kit; rewritten 2026-09-22 when
// owner direction made Deckplate the one design system (design/frontend/THE_BAR.md).
//
// The INTENT these tests have always guarded is unchanged and still the point: the title is not a
// word list on black, it stands on a lit scene, and its verbs are hardware rather than text. What
// changed is which system supplies the hardware. The old assertions named `k-t-name`,
// `of-title-line fh-legend` and `of-title-rail fh-rail` — and that last one pinned a 64x787
// decorative plate the bench measured as painted and empty, so the test was holding a defect in
// place. Precedent for the swap: test/map-hud-kit.test.mjs already accepts `dp-key--primary`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { DECKPLATE_SCREENS_CSS } from '../src/ui/deckplate/screens.js';
import { DECKPLATE_LAYOUT_CSS } from '../src/ui/deckplate/layout.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const frames = readFileSync(join(ROOT, 'src/ui/views/menuFrames.js'), 'utf8');
const menu = readFileSync(join(ROOT, 'src/ui/screens/mainMenu.js'), 'utf8');

test('title stands on the uiStage, not a word list on black', () => {
  // stage is a spec FUNCTION of ctx (screenManager resolves it per stack sync): the
  // still is the default picture; the idle attract swaps the request to title-attract.
  const spec = mainMenuScreen.stage({});
  assert.equal(spec.scene, 'title-field');
  assert.equal(spec.hullDefId, NEW_GAME.shipId);
  // The lit scene's own backdrop contract, and the plate that holds the frame while it assembles.
  assert.match(frames, /k-world k-world--plate/);
});

test('title frame is a Deckplate assembly: frame, drawn logotype, live eyebrow', () => {
  assert.match(frames, /dp-frame--screen/);
  // The name is the drawn logotype mark (the h1 keeps its text for the accessibility tree).
  assert.match(frames, /dp-logotype/);
  assert.match(frames, /dp-title__eyebrow/);
  assert.match(frames, /dp-title__rule/);
  // The contract line moved INTO the eyebrow rather than floating loose near the bottom edge.
  assert.match(frames, /Contract 47-A remains open/);
  assert.match(frames, /data-fh-register|dataset\.dp/);
});

test('title verbs are words of light on the ORRERY dial, and the empty decorative rail is gone', () => {
  // The poster weight: words of light (no plates) over the world.
  assert.match(menu, /system: 'light'/);
  assert.doesNotMatch(menu, /of-title-rail/, 'the painted-and-empty 64x787 rail must not come back');
  assert.doesNotMatch(menu, /fh-menu-item/);
  // ORRERY (design/frontend/ORRERY.md §6 Title): the same buttons ride the rim of the emblem's dial
  // and the Hand swings to the awake verb. The rail only positions the list; it builds no menu.
  assert.match(menu, /createArcRail\(\{ host: stage, list, frame: rootEl/);
  // the dial's face is drawn in the rail's own line language, not a raster emblem
  assert.match(DECKPLATE_LAYOUT_CSS, /\.dp-menu__item\[aria-disabled="true"\]/);
});

test('the title keeps its own size and is not restyled into etched words', () => {
  assert.doesNotMatch(DECKPLATE_SCREENS_CSS, /--fht-menu-size:clamp\(15px/);
  assert.doesNotMatch(DECKPLATE_SCREENS_CSS, /#screens \.of-title \.k-word \{/);
  const screensSrc = readFileSync(join(ROOT, 'src/ui/deckplate/screens.js'), 'utf8');
  assert.match(screensSrc, /:not\(\.of-title\)/);
});

test('the title screen owns no stylesheet of its own', () => {
  // The whole point of one design system: a screen assembles it and never grows CSS beside it.
  assert.doesNotMatch(menu, /<style|styleSheet|\.css['"]/);
  assert.doesNotMatch(frames, /<style|styleSheet|\.css['"]/);
});
