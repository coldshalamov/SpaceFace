import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stationScreen } from '../src/ui/station/stationScreen.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('docked station stands on the Field Hardware berth stage, not a word list on black', () => {
  assert.equal(stationScreen.stage.scene, 'berth');
});

test('berth frame pins kit hardware: stencil name, legend tape, vitals plate, smoked window, launch key', () => {
  const html = stationFrameHtml();
  assert.match(html, /sxb-berth__ident fh-legend/);
  assert.match(html, /sxb-berth__name fh-hero/);
  assert.match(html, /class="sxb-tape"/);
  assert.match(html, /sxb-berth__news/);
  assert.doesNotMatch(html, /so-bulletin/);
  assert.doesNotMatch(html, /<details[\s\S]*sxb-berth__news/);
  assert.match(html, /sxb-crown fh-plate fh-plate--edge/);
  assert.match(html, /sx-screen__body fh-window/);
  assert.match(html, /sxb-ops[\s\S]*of-facility-rail[\s\S]*sxb-launch/);
  assert.match(html, /sxb-launch fh-key fh-key--primary/);
  assert.match(html, /sxb-launch__light/);
  assert.match(html, /k-world--plate sxb-berth__plate/);
  assert.match(html, /k-world sxb-berth__world/);
});

test('station controller loads kit last and stamps docked Field Hardware temperature', () => {
  const src = read('src/ui/station/stationApp.js');
  const tokens = src.indexOf('/assets/ui/kit/tokens/tokens.css');
  const fh = src.indexOf('/assets/ui/kit/kit/fh.css');
  const orbital = src.indexOf('/styles/station-orbital.css');
  const station = src.indexOf('/styles/station.css');
  assert.ok(tokens >= 0 && fh > tokens && orbital > fh && station > orbital,
    'stylesheet order must be tokens, fh.css, station-orbital, station.css last');
  assert.match(src, /setAttribute\('data-fh-temp', 'docked'\)/);
  assert.match(src, /setAttribute\('data-fh-register', 'bench'\)/);
  assert.match(src, /arriving && !arrivedOnce \? 'poster' : 'bench'/);
});

test('station chrome uses produced kit plates and keys, not CSS boxes', () => {
  const css = read('styles/station.css');
  assert.match(css, /plate\.legend\.strip-lit\.png/);
  assert.match(css, /plate\.legend\.strip\.png/);
  assert.match(css, /plate\.backdrop\.berth-bay\.png/);
  assert.match(css, /plate\.bench\.sunk\.png/);
  assert.match(css, /key\.legend\.rest\.png/);
  assert.match(css, /key\.primary\.rest\.png/);
  assert.match(css, /light\.dot\.legend\.on\.png/);
  assert.match(css, /light\.dot\.good\.on\.png/);
  assert.match(css, /#screens \.sx-berth \.sxb-berth__world \{ opacity: 1/);
  assert.doesNotMatch(css, /:not\(\.sx-observatory\)/);
});

test('orbital overlay does not dim the live berth or flatten the kit grid', () => {
  const orbital = read('styles/orbital.css');
  const skin = read('styles/station-orbital.css');
  assert.match(orbital, /\[data-screen='station'\]:not\(\.sx-observatory\) \.sxb-berth__world/);
  assert.doesNotMatch(orbital, /#screens \.sxb-berth__world \{[^}]*opacity:\s*\.16/);
  assert.match(skin, /\.sx-app \{\s*display: contents;/);
  assert.doesNotMatch(skin, /\.k-screen \{[^}]*display:\s*block/);
  assert.doesNotMatch(skin, /sxb-launch__light \{ display: none/);
  assert.doesNotMatch(skin, /--fh-size-hero:\s*40px/);
  assert.doesNotMatch(skin, /assets\/ui\/deckplate\/hw\/keycap\.svg/);
  assert.doesNotMatch(skin, /\.fh-key[^;]*border-image:\s*none/);
});
