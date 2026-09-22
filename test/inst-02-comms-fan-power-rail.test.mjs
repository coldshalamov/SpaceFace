import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// INST-02: the comms fan rides the flight cluster's language — deckplate bezel
// and glass tokens — not the old web-kit --sf-surface fill and 6px radius.
const CSS = readFileSync(
  fileURLToPath(new URL('../styles/commsradial.css', import.meta.url)),
  'utf8',
);

test('INST-02 comms fan declares no --sf-surface fill', () => {
  assert.equal(
    /--sf-surface/.test(CSS),
    false,
    'commsradial.css must not fill any comms-fan surface with --sf-surface',
  );
});

test('INST-02 comms fan declares no web-kit radius', () => {
  assert.equal(
    /border-radius\s*:\s*var\(--r-md/.test(CSS),
    false,
    'commsradial.css must not use the 6px web radius token on the fan',
  );
});

test('INST-02 comms fan hub and wedges use flight bezel/glass tokens', () => {
  assert.match(
    CSS,
    /#sf-commsfan \.sf-commsfan__hub \{[^}]*border-image:url\("\/assets\/ui\/deckplate\/hw\/bezel-thin\.svg"\)/,
    'hub must wear the deckplate hardware bezel',
  );
  assert.match(CSS, /#sf-commsfan \.sf-commsfan__hub \{[^}]*--dp-glass-solid/, 'hub must sit on deckplate glass');
  assert.match(CSS, /#sf-commsfan \.sf-commsfan__wedge \{[^}]*--dp-glass-solid/, 'wedge keys must sit on deckplate glass');
  assert.match(CSS, /\.sf-haildeck__link \{[^}]*--dp-glass-solid/, 'haildeck links must sit on deckplate glass');
});
