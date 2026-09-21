import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { DECKPLATE_SCREENS_CSS } from '../src/ui/deckplate/screens.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('title stands on the Field Hardware uiStage, not a word list on black', () => {
  assert.equal(mainMenuScreen.stage.scene, 'title-field');
  assert.equal(mainMenuScreen.stage.hullDefId, NEW_GAME.shipId);
});

test('title frame pins kit hardware: plate, logotype, legend strip', () => {
  const src = readFileSync(join(ROOT, 'src/ui/views/menuFrames.js'), 'utf8');
  assert.match(src, /k-world--plate/);
  assert.match(src, /k-t-name/);
  assert.match(src, /of-title-line fh-legend/);
  assert.match(src, /Contract 47-A remains open/);
  assert.match(src, /data-fh-register['"], ['"]poster/);
});

test('deckplate does not shrink the title into 15px etched words', () => {
  assert.doesNotMatch(DECKPLATE_SCREENS_CSS, /--fht-menu-size:clamp\(15px/);
  assert.doesNotMatch(DECKPLATE_SCREENS_CSS, /#screens \.of-title \.k-word \{/);
  const screensSrc = readFileSync(join(ROOT, 'src/ui/deckplate/screens.js'), 'utf8');
  assert.match(screensSrc, /:not\(\.of-title\)/);
});

test('title words use produced kit plates, not CSS-drawn boxes', () => {
  const kit = readFileSync(join(ROOT, 'styles/kit.css'), 'utf8');
  assert.match(kit, /plate\.row\.selected\.png/);
  assert.match(kit, /spaceface-logotype\.svg/);
  assert.match(kit, /plate\.legend\.strip\.png/);
  const menu = readFileSync(join(ROOT, 'src/ui/screens/mainMenu.js'), 'utf8');
  assert.match(menu, /of-title-rail fh-rail/);
  assert.match(menu, /fh-menu-item/);
});
