// pause-ship-fit.test.mjs — two probe-measured layout regressions stay fixed.
//
// 1. Pause at 1920x1080: the "PAUSED" title rendered 44 px wider than its console
//    (scrollWidth 422 vs clientWidth 378) and the Exit verbs (Main Menu, Quit Game)
//    sat at y=1140, below the frame — the stage held 835 px of verbs in a 626 px box.
// 2. THE SHIP / shipworks while the optics resolve: the Left/Center/Right camera words
//    and the drag cue stay visible over the acquiring rail and overlap its copy
//    (buttons y 275-314 vs rail copy y 268-333).
//
// Regression 1 used to be guarded by asserting that styles/pause.css carried the two
// rules that clawed the overflow back: a capped title size and a compacted row knob.
// The 2026-09-22 Deckplate migration removed the CAUSE instead, so that sheet is gone
// and those assertions have nothing to read. The title is no longer inside a 378 px
// console — dp-frame's head spans the frame — and thirteen verbs no longer need 835 px,
// because the runs a player does not reach for bank into wrapping rows of compact keys.
// What is asserted here now is that both mechanisms exist. The live gate is the picture:
// `node scripts/ui-bench.mjs --shot=pause` fails on OFF FRAME, which is how the original
// regression would be caught today.
//
// Measured evidence: node scripts/ui-bench.mjs --shot=pause,ship (1920x1080).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DECKPLATE_LAYOUT_CSS } from '../src/ui/deckplate/layout.js';

const STATION_CSS = readFileSync(new URL('../styles/station.css', import.meta.url), 'utf8');
const PAUSE_SRC = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
const FRAMES_SRC = readFileSync(new URL('../src/ui/views/menuFrames.js', import.meta.url), 'utf8');

test('pause: the screen title has the whole frame head, not a 378px console', () => {
  assert.match(FRAMES_SRC, /dp-frame__head/, 'the pause title sits in the frame head');
  assert.match(FRAMES_SRC, /dp-title__name/, 'and is the frame nameplate');
  assert.match(DECKPLATE_LAYOUT_CSS, /\.dp-frame__head \{ grid-area:head; min-width:0; \}/);
  // Nothing may put the retired finish layer back: a screen owning a stylesheet is the defect.
  // (The path still appears in this file's own comment explaining why it is gone; what must not
  // come back is the injector and the link.)
  assert.doesNotMatch(PAUSE_SRC, /injectPauseCss/);
  assert.doesNotMatch(PAUSE_SRC, /rel = 'stylesheet'/);
});

test('pause: the verb column banks so Exit seats inside the frame at 1080p', () => {
  // Every run under an etched legend banks; only RESUME keeps a full row.
  assert.match(PAUSE_SRC, /bank: true/);
  assert.match(PAUSE_SRC, /dp-menu--banked/);
  assert.match(DECKPLATE_LAYOUT_CSS, /\.dp-menu--banked > li\[data-bank\] \{ flex:0 1 auto; \}/);
  // The column keeps a scroll safety net for short viewports and long briefs.
  assert.match(FRAMES_SRC, /dp-frame__scroll/);
  assert.match(DECKPLATE_LAYOUT_CSS, /\.dp-frame__scroll \{ overflow:auto;/);
});

test('shipworks: camera words and drag cue yield while the optics resolve', () => {
  // The acquiring rail owns the stage until the hull resolves; the nameplate and
  // slotfield already yield (visibility:hidden). The camera words and drag cue
  // describe a preview that is not there yet — the preview-blocked rule hides
  // them for exactly that reason, and acquiring is the same condition, earlier.
  const hiding = STATION_CSS.match(
    /\.sx-sw__stage\.is-acquiring\s+[^{]*{([^}]*)}/g,
  );
  assert.ok(hiding && hiding.length > 0, 'station.css carries .is-acquiring rules');
  const joined = hiding.join('\n');
  assert.match(joined, /\.sx-sw__camera/, 'camera words yield while acquiring');
  assert.match(joined, /\.sx-sw__dragcue/, 'drag cue yields while acquiring');
  assert.match(joined, /visibility:\s*hidden/, 'yielding keeps layout (visibility, not display)');
});
