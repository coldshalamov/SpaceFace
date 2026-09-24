import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// INST-05 — resting flight does not wear the aerospace G-LOC sheet. The G-LOC vignette, the
// EMP/shield glitch jitter, and the scanline overlay exist only while their effect is on:
// the vignette and overlay sleep display:none until hud.js drives them, and the jitter is
// carried by the #hud.sf-hud--glitch class alone, never the resting #hud.

const HUD_CSS = readFileSync(
  fileURLToPath(new URL('../styles/hud.css', import.meta.url)),
  'utf8',
);
const HUD_STYLES_JS = readFileSync(
  fileURLToPath(new URL('../src/ui/views/hudStyles.js', import.meta.url)),
  'utf8',
);
const INDEX_HTML = readFileSync(
  fileURLToPath(new URL('../index.html', import.meta.url)),
  'utf8',
);
const HUD_JS = readFileSync(
  fileURLToPath(new URL('../src/ui/hud.js', import.meta.url)),
  'utf8',
);

test('INST-05 the G-LOC vignette sleeps display:none until the effect drives it', () => {
  assert.match(
    HUD_CSS,
    /\.sf-gloc-vignette\s*\{[^}]*display:\s*none/,
    'hud.css must default the vignette out of the compositor tree',
  );
  assert.match(
    HUD_STYLES_JS,
    /\.sf-gloc-vignette\s*\{[^}]*display:\s*none/,
    'the injected hudStyles copy must also sleep the vignette',
  );
  // The only path that shows the vignette is gated on a positive G-LOC fraction.
  const showBranch = HUD_JS.match(/gLocFraction\s*>\s*0\)\s*\{[^}]*glocVignette[^}]*'block'/s);
  assert.ok(showBranch, 'hud.js must only display the vignette while gLocFraction > 0');
});

test('INST-05 the EMP jitter rides the glitch class, never the resting #hud', () => {
  assert.match(
    HUD_CSS,
    /#hud\.sf-hud--glitch\s*\{[^}]*animation:\s*sf-hud-jitter/,
    'the jitter keyframes must be carried by #hud.sf-hud--glitch',
  );
  assert.doesNotMatch(
    HUD_CSS,
    /#hud\s*\{[^}]*animation:/,
    'the resting #hud must not carry an animation',
  );
  assert.doesNotMatch(
    HUD_CSS,
    /#hud\s*\{[^}]*will-change/,
    'the resting #hud must not hold a compositor layer',
  );
  assert.match(
    HUD_CSS,
    /\.sf-hud-glitch-overlay\s*\{[^}]*display:\s*none/,
    'the scanline overlay must sleep until .active',
  );
});

test('INST-05 index.html mounts no glitch or G-LOC state at rest', () => {
  const hudMount = INDEX_HTML.match(/<div id="hud"[^>]*>/);
  assert.ok(hudMount, 'index.html must mount the #hud host');
  assert.doesNotMatch(hudMount[0], /sf-hud--glitch|sf-gloc/, 'the #hud host starts clean');
  assert.doesNotMatch(INDEX_HTML, /sf-gloc-vignette|sf-hud-glitch-overlay/,
    'no effect element is statically mounted in the page');
});
