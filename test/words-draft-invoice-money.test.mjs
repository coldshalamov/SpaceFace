// words-draft-invoice-money — the last raw money lines read grouped.
//
// The grouped-credits family missed three small surfaces a player still reads: the Crucible
// draft's re-roll verb ("Re-roll · 1250 cr"), the Special-500 assessment invoice ("PAID · 4500 cr
// transferred", "LATE FEE ... 4500 cr charged"), and the asteroid bore-charge cost chip. Each now
// reads grouped; small prices stay plain. Labeled chips keeping their "u" symbol are a different
// family (key-value chips, not prose) and stay as they are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the draft, invoice and bore-cost money sites build grouped amounts', () => {
  for (const [file, pattern] of [
    ['../src/ui/screens/crucibleDraft.js', /Re-roll · \$\{Number\(price\)\.toLocaleString\('en-US'\)\} cr/],
    ['../src/ui/special500InvoicePrompt.js', /PAID · \$\{Number\(amount\)\.toLocaleString\('en-US'\)\} cr transferred/],
    ['../src/ui/special500InvoicePrompt.js', /LATE FEE ON STANDBY FEE · \$\{Number\(amount\)\.toLocaleString\('en-US'\)\} cr charged/],
    ['../src/ui/asteroid/asteroidController.js', /\$\{Number\(pv\.cost\)\.toLocaleString\('en-US'\)\} cr/],
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, pattern, `${file}: ${pattern}`);
  }
});

test('the grouping helper agrees with the house format on the boundaries', () => {
  assert.equal(Number(1250).toLocaleString('en-US'), '1,250');
  assert.equal(Number(950).toLocaleString('en-US'), '950', 'small prices stay plain');
  assert.equal(Number(0).toLocaleString('en-US'), '0');
});
