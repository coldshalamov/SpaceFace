// PQ-033.00 — leftover legal/credits proof. Headless. Title can
// push credits; leftover notices name three.js and Rapier. No headed
// capture. Does not invent a SpaceFace LICENSE or SPDX.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CREDITS } from '../src/data/credits.js';
import { creditsScreen } from '../src/ui/screens/credits.js';
import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function leftoverNotice(pattern) {
  return (CREDITS.notices || []).find((notice) => (
    pattern.test(notice.name || '') || pattern.test(notice.text || '')
  ));
}

test('title Credits action pushes the leftover credits screen', () => {
  const pushed = [];
  const ctx = {
    bus: { emit() {} },
    screenManager: {
      hasScreen(id) { return id === 'credits'; },
      pushScreen(id) { pushed.push(id); },
    },
  };

  assert.equal(creditsScreen.id, 'credits');
  assert.equal(typeof mainMenuScreen._pick, 'function');

  mainMenuScreen._pick(ctx, 'credits');
  assert.deepEqual(pushed, ['credits']);

  const menuSrc = readFileSync(join(REPO, 'src', 'ui', 'screens', 'mainMenu.js'), 'utf8');
  assert.match(menuSrc, /dataset\.action = 'credits'/);
  assert.match(menuSrc, /case 'credits':\s*pushWhenReady\(ctx, 'credits', 'Credits'\)/);

  console.log('PQ-033.00 title: Credits -> credits');
});

test('leftover notices name three.js and Rapier', () => {
  const three = leftoverNotice(/three/i);
  const rapier = leftoverNotice(/rapier/i);
  assert.ok(three, 'leftover credits notices must name three.js');
  assert.ok(rapier, 'leftover credits notices must name Rapier');
  assert.match(String(three.license), /MIT/i);
  assert.match(String(rapier.license), /Apache-2\.0/i);

  const libraries = JSON.stringify(CREDITS.libraries || []);
  assert.match(libraries, /"name":"three"/);
  assert.match(libraries, /rapier/i);

  console.log('PQ-033.00 notice: three.js ' + three.license);
  console.log('PQ-033.00 notice: Rapier ' + rapier.license);
});

test('NOTICE is leftover third-party text; LICENSE is not invented', () => {
  assert.equal(existsSync(join(REPO, 'LICENSE')), false, 'do not invent a root LICENSE');

  const noticePath = join(REPO, 'NOTICE');
  assert.equal(existsSync(noticePath), true, 'NOTICE must be leftover-extracted');
  const notice = readFileSync(noticePath, 'utf8');
  assert.match(notice, /not a SpaceFace game license/i);
  assert.match(notice, /three\.js/i);
  assert.match(notice, /Rapier/i);

  for (const leftover of CREDITS.notices || []) {
    assert.ok(
      leftover.text && notice.includes(leftover.text),
      'NOTICE must carry leftover notice text for ' + leftover.name,
    );
  }

  const settingsSrc = readFileSync(join(REPO, 'src', 'ui', 'screens', 'settings.js'), 'utf8');
  assert.match(settingsSrc, /'Access'/);
  assert.doesNotMatch(settingsSrc, /privacy statement|Privacy policy/i);

  console.log('PQ-033.00 LICENSE: missing, not invented');
  console.log('PQ-033.00 NOTICE: leftover-extracted');
});
