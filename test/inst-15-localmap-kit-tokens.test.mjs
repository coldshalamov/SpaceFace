import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// INST-15: The local map frame uses the kit / deckplate tokens, not a one-off plate.
// Frame and labels use kit and deckplate tokens (--dp-field, --dp-rule, --dp-ink,
// --dp-ink-dim, --dp-ink-mute, --dp-lamp, --dp-face-read, --dp-face-etch).

const SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/localmap.js', import.meta.url)),
  'utf8',
);

test('INST-15: local map container and panels use deckplate field and rule tokens', () => {
  assert.match(SRC, /#sf-localmap\s*\{[^}]*background:\s*var\(--dp-field/,
    '#sf-localmap container must use --dp-field');
  assert.match(SRC, /\.lm-head\s*\{[^}]*background:\s*var\(--dp-field/,
    '.lm-head must use --dp-field');
  assert.match(SRC, /\.lm-head\s*\{[^}]*border-bottom:\s*1px solid var\(--dp-rule/,
    '.lm-head must use --dp-rule for edge dividing');
  assert.match(SRC, /\.lm-legend\s*\{[^}]*background:\s*var\(--dp-field/,
    '.lm-legend must use --dp-field');
  assert.match(SRC, /\.lm-routes\s*\{[^}]*background:\s*var\(--dp-field/,
    '.lm-routes must use --dp-field');
  assert.match(SRC, /\.lm-objective\s*\{[^}]*background:\s*var\(--dp-field/,
    '.lm-objective must use --dp-field');
});

test('INST-15: local map labels and typography use deckplate text/face tokens', () => {
  assert.match(SRC, /#sf-localmap\s*\{[^}]*color:\s*var\(--dp-ink/,
    '#sf-localmap must color text with --dp-ink');
  assert.match(SRC, /#sf-localmap\s*\{[^}]*font-family:\s*var\(--dp-face-read/,
    '#sf-localmap must bind --dp-face-read');
  assert.match(SRC, /\.lm-title\s*\{[^}]*font-family:\s*var\(--dp-face-etch/,
    '.lm-title must use --dp-face-etch');
  assert.match(SRC, /\.lm-title\s*\{[^}]*color:\s*var\(--dp-ink-dim/,
    '.lm-title must use --dp-ink-dim');
  assert.match(SRC, /\.lm-objective-title\s*\{[^}]*font-family:\s*var\(--dp-face-display/,
    '.lm-objective-title must use --dp-face-display');
  assert.match(SRC, /\.lm-objective-k\s*\{[^}]*color:\s*var\(--dp-lamp/,
    '.lm-objective-k must use --dp-lamp');
  assert.match(SRC, /\.lm-objective-k\s*\{[^}]*font-family:\s*var\(--dp-face-etch/,
    '.lm-objective-k must use --dp-face-etch');
});

test('INST-15: local map controls ride deckplate ghost-field and lamp tokens', () => {
  assert.match(SRC, /\.lm-close\s*\{[^}]*background:\s*var\(--dp-field-ink/,
    '.lm-close must sit on --dp-field-ink');
  assert.match(SRC, /\.lm-close:hover\s*\{[^}]*background:\s*var\(--dp-field-ink-hi/,
    '.lm-close hover must light up to --dp-field-ink-hi');
  assert.match(SRC, /\.lm-close:hover\s*\{[^}]*border-color:\s*var\(--dp-lamp/,
    '.lm-close hover must highlight with --dp-lamp');
  assert.match(SRC, /\.lm-route:hover[^}]*background:\s*var\(--dp-field-ink-hi/,
    '.lm-route hover must sit on --dp-field-ink-hi');
  assert.match(SRC, /\.lm-route\s*\.lm-route-profit\s*\{[^}]*color:\s*var\(--dp-lamp/,
    '.lm-route-profit must use --dp-lamp');
});

test('INST-15: canvasRoles prioritizes deckplate tokens over legacy fallbacks', () => {
  assert.match(SRC, /you:\s*read\('--dp-phos'/, 'canvasRoles must read --dp-phos');
  assert.match(SRC, /foe:\s*read\('--dp-danger'/, 'canvasRoles must read --dp-danger');
  assert.match(SRC, /goal:\s*read\('--dp-lamp'/, 'canvasRoles must read --dp-lamp');
  assert.match(SRC, /calm:\s*read\('--dp-ink-dim'/, 'canvasRoles must read --dp-ink-dim');
  assert.match(SRC, /paper:\s*read\('--dp-ink'/, 'canvasRoles must read --dp-ink');
  assert.match(SRC, /surface:\s*read\('--dp-field'/, 'canvasRoles must read --dp-field');
  assert.match(SRC, /edge:\s*read\('--dp-rule'/, 'canvasRoles must read --dp-rule');
});
