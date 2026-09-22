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

// The berth's hardware. The kit's names became Deckplate's on 2026-09-22 (the eyebrow, the
// nameplate, the vitals plate); the CONTRACT each one guards is unchanged, and two new ones are
// added, because this test is also where the old shape would come back: the berth is the frame's
// own head/body/foot, not a floating panel over a 400px hole in the grid.
test('berth frame pins its hardware: nameplate, legend tape, vitals plate, workspace, launch key', () => {
  const html = stationFrameHtml();
  assert.match(html, /sxb-berth__ident dp-title__eyebrow/);
  assert.match(html, /sxb-berth__name dp-title__name/);
  assert.match(html, /class="sxb-tape"/);
  assert.match(html, /sxb-berth__news/);
  assert.doesNotMatch(html, /so-bulletin/);
  assert.doesNotMatch(html, /<details[\s\S]*sxb-berth__news/);
  assert.match(html, /sxb-crown dp-plate/);
  assert.match(html, /sx-screen__body/);
  assert.match(html, /sxb-ops[\s\S]*of-facility-rail[\s\S]*sxb-launch/);
  assert.match(html, /sxb-launch fh-key fh-key--primary/);
  assert.match(html, /sxb-launch__light/);
  assert.match(html, /k-world--plate sxb-berth__plate/);
  assert.match(html, /k-world sxb-berth__world/);
  // The regions are the frame's, and the vitals rail is INSIDE the body beside the workspace.
  assert.match(html, /sxb-berth dp-frame__head/);
  assert.match(html, /dp-frame__body--station[\s\S]*sx-panel[\s\S]*sxb-crown/);
  assert.match(html, /sxb-ops dp-frame__foot/);
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

test('station chrome is built from computed material, not stretched bitmaps', () => {
  const css = read('styles/station.css');
  // INVERTED 2026-09-22. This test used to assert the OPPOSITE: that `key.legend.rest.png`,
  // `key.primary.rest.png`, `plate.bench.sunk.png` and friends all appeared in this sheet. It was
  // guarding a real intent -- the station must read as a built machine, not a flat CSS box -- but
  // it was enforcing that intent by mandating the one technique that made the game look cheap.
  //
  // A nine-sliced PNG has a fixed pixel size. `key.legend.rest.png` is 160x40 and was stretched
  // across every station tab; a 320x80 @2x sat beside it on disk and nothing referenced it. On the
  // Electron app at devicePixelRatio 2 every key and plate was a bitmap upsampled 2x, which is what
  // a player reads as a smudge. ONE_PHOTOGRAPH.md section 4.11 retires raster nine-slices as UI
  // material and re-purposes the Cycles renders as the calibration reference computed material is
  // judged against.
  //
  // So the assertion flips: the berth's CONTROLS must carry no stretched key or plate bitmap. The
  // intent is unchanged and still checked below -- the machine must still be a machine.
  // Comments are stripped first: this file DOCUMENTS the filenames it retired, and a test that
  // cannot tell a citation from a declaration would forbid explaining the change.
  const decl = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const controlRasters = [
    /key\.legend\.\w+\.png/, /key\.primary\.\w+\.png/, /key\.secondary\.\w+\.png/,
    /key\.small\.\w+\.png/, /key\.hazard\.\w+\.png/, /plate\.bench\.\w+\.png/,
  ];
  for (const pattern of controlRasters) {
    assert.doesNotMatch(decl, pattern,
      `styles/station.css must not paint a control with ${pattern} -- computed material only`);
  }

  // What replaced them. A control still has to be a MOULDED object: a lit top edge, a dark sill
  // and a seat shadow are what make a cap read as a cap, and they are the first thing a lazy pass
  // would drop on the way to a flat rectangle.
  assert.match(css, /inset 0 1px 0 0 rgb\(226 232 240/,
    'the dock rail lost its lit edge -- a control with no bevel is the flat CSS box this guards');
  assert.match(css, /--dp-lamp-hot/,
    'the rail must light its current destination from the Deckplate lamp token');

  // A BACKDROP is not a control: a photographic bay plate is a picture, stays raster, and is the
  // one kit image the retire does not touch.
  assert.match(css, /plate\.backdrop\.berth-bay\.png/);
  assert.match(css, /#screens \.sx-berth \.sxb-berth__world \{ opacity: 1/);
  assert.doesNotMatch(css, /:not\(\.sx-observatory\)/);
});

test('the Field Hardware kit layer states the computed-material doctrine', () => {
  // The old header in fh.css read: "EVERY material here is a produced asset ... there is no
  // linear-gradient, no box-shadow and no border: standing in for a material anywhere in this
  // file ... a screen built from CSS borders is rejected before it is looked at." That sentence is
  // the written CAUSE of the smudges -- the same species of defect as the old styles/AGENTS.md
  // line that authorised four stacked token roots. Left standing, the next agent reads it and puts
  // the PNGs back. This test keeps the correction in place.
  const fh = read('assets/ui/kit/kit/fh.css');
  assert.doesNotMatch(fh, /a screen built\s*\n?\s*\*?\s*from CSS borders is rejected/,
    'fh.css must not re-assert that computed material is rejected');
  assert.match(fh, /MATERIAL IS COMPUTED/,
    'fh.css must state the computed-material doctrine it now follows');
  assert.match(fh, /CALIBRATION REFERENCE/,
    'fh.css must record what the Cycles renders are FOR, or they read as dead weight');

  // The control classes themselves: no stretched key bitmaps left in the kit layer. Comments are
  // stripped first, for the same reason as above -- the header cites the filenames it retired.
  const fhDecl = fh.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(fhDecl, /keys\/key\.\w+\.\w+\.png/,
    'fh.css must not paint a key with a nine-sliced bitmap');
  assert.doesNotMatch(fhDecl, /windows\/window\.\w+(\.\w+)?\.png/,
    'fh.css must not paint a window with a nine-sliced bitmap');
  // ... and the vector half is still mandatory.
  assert.match(fh, /@font-face/, 'the kit still owns the variable faces');
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
  // Was: assert.doesNotMatch(skin, /\.fh-key[^;]*border-image:\s*none/) -- it forbade clearing a
  // key's nine-slice, which is now the required state. The intent worth keeping is that the
  // skin must not FLATTEN a key to nothing; it must hand it computed material instead.
  assert.doesNotMatch(skin, /\.fh-key[^{]*\{[^}]*background:\s*none[^}]*\}/,
    'the orbital skin must not blank a key -- retire the raster INTO computed material');
});
