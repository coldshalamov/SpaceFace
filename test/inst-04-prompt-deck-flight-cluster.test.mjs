import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// INST-04: the prompt deck is a flight instrument, not a consumer card — bezel-framed
// plates on the same deckplate glass the power rail and comms fan wear, machined 2px
// corners, the lamp for act-on states, phosphor for readings. No 10px card radius.

const CSS = readFileSync(
  fileURLToPath(new URL('../styles/prompt-deck.css', import.meta.url)),
  'utf8',
);

test('INST-04: the decision card declares no 10px consumer radius', () => {
  const cardRule = CSS.match(/\.sf-prompt \{[^}]*\}/);
  assert.ok(cardRule, 'the .sf-prompt card rule must exist');
  assert.equal(/border-radius\s*:\s*10px/.test(cardRule[0]), false,
    'the card must not carry a 10px consumer radius');
  assert.equal(/border-radius\s*:\s*(8|10|12|14|16)px/.test(CSS), false,
    'no deck surface keeps a consumer-card radius');
});

test('INST-04: the card wears the flight bezel + glass tokens', () => {
  assert.match(
    CSS,
    /#sf-prompt-deck \.sf-prompt \{[^}]*border-image:url\("\/assets\/ui\/deckplate\/hw\/bezel-thin\.svg"\)/,
    'the decision card wears the deckplate hardware bezel',
  );
  assert.match(CSS, /#sf-prompt-deck \.sf-prompt \{[^}]*--dp-glass-solid/,
    'the card sits on deckplate glass');
  assert.match(CSS, /#sf-prompt-deck \.sf-prompt \{[^}]*--dp-metal-2/,
    'the card sits on the flight plate metal');
});

test('INST-04: verbs are glass keys with the lamp as the selection language', () => {
  assert.match(CSS, /#sf-prompt-deck \.sf-prompt__choice \{[^}]*--dp-glass-solid/,
    'choice keys sit on deckplate glass');
  assert.match(CSS, /--dp-lamp/, 'lamp tokens drive selection/attention states');
  assert.match(CSS, /keycap\.svg/, 'printed keycaps use the deckplate keycap asset');
  assert.match(CSS, /#sf-prompt-deck \.sf-prompt-chip \{[^}]*--dp-glass-solid/,
    'collapsed chips ride the same plate language');
});

test('INST-04: forced-colors fallback still resolves the deck', () => {
  assert.match(CSS, /@media \(forced-colors: active\)[\s\S]*#sf-prompt-deck \.sf-prompt/,
    'forced-colors strips the bezel image to a plain bordered plate');
});
