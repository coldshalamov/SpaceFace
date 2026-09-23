// PQ-210.05 — the demo HUD reads as hardware, not a web page.
//
// Pins the cheap-overlay defects the owner named on 2026-09-20 so a later paint pass cannot
// silently restore them: a hidden threat lamp, translucent-smoke remapping of every glass face,
// the swarm restyle that painted teal CSS cards over the flight HUD, and the Crucible readout's
// semi-transparent rectangle. Visual acceptance is the ui-bench still; this file holds the
// regression floor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const hudStyles = readFileSync(root('src/ui/views/hudStyles.js'), 'utf8');
const survivalHud = readFileSync(root('src/ui/survivalHud.js'), 'utf8');
const crucibleCss = readFileSync(root('styles/crucible.css'), 'utf8');
const screensCss = readFileSync(root('src/ui/deckplate/screens.js'), 'utf8');
const hudJs = readFileSync(root('src/ui/hud.js'), 'utf8');

test('the instrument cluster is a machined bezel, not a smoke overlay', () => {
  assert.match(hudStyles, /#hud \.sf-cluster-chassis \{[\s\S]*?bezel\.svg/,
    'cluster chassis must assemble bezel.svg');
  assert.doesNotMatch(hudStyles, /--dp-glass-solid:var\(--dp-glass-flight\)/,
    'glass-solid must stay an opaque window in metal, not a translucent overlay');
});

test('the threat lamp stays a visible channel', () => {
  assert.match(hudJs, /sf-threat-lamp/, 'hud.js still mounts the lamp');
  assert.match(hudStyles, /#hud \.sf-threat-lamp \{ display:flex/,
    'the last paint pass must show the lamp');
  assert.doesNotMatch(hudStyles, /#hud \.sf-threat-lamp \{ display:none/,
    'PASS 6 hid the lamp; that overlay is the web-HUD read');
});

test('swarm does not restyle the flight HUD into CSS cards', () => {
  const swarm = crucibleCss.split('.sf-swarm-flight').slice(1).join('.sf-swarm-flight');
  assert.doesNotMatch(swarm, /border-radius/,
    'swarm must not round the HUD into app cards');
  assert.doesNotMatch(swarm, /154 230 238|#8ee8ff|#a9f1e7/,
    'swarm must not introduce a second teal palette on the HUD');
  assert.doesNotMatch(crucibleCss, /\.sf-swarm-flight \.sf-crun \{[^}]*position:\s*fixed/,
    'the Crucible readout stays in the comms strip, not a floating overlay');
});

test('the Crucible readout is an instrument, not a translucent rectangle', () => {
  const inject = survivalHud.slice(survivalHud.indexOf('_injectCss'));
  assert.doesNotMatch(inject, /rgba\(6,\s*12,\s*22/,
    'the readout must not paint a CSS card fill');
  assert.match(inject, /\.sf-crun \{[^}]*background:none/,
    'the parent comms bezel is the chassis; the readout is the glass');
});

// Owner ruling 2026-09-22 (design/frontend/ONE_PHOTOGRAPH.md section 0): CSS may not imitate a
// physical material. This assertion used to REQUIRE a fastened SVG bezel / keycap; it now requires
// the printed replacement and forbids the bezel coming back.
test('the results plate assembles printed fields and keys', () => {
  assert.match(screensCss, /sf-crucible-results/, 'results has a deckplate skin');
  assert.doesNotMatch(screensCss, /(?:bezel|keycap)[a-z-]*\.svg/, 'story and ledger sit on printed fields, not bezels');
  assert.match(screensCss, /\$\{printedKey\(`\$\{CRRES\} \.k-foot \.k-word`\)\}/,
    'the three ways out are printed keys');
});
