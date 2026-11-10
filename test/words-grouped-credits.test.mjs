// words-grouped-credits — the money a player reads in flight, at the law desk and on the chart
// reads grouped, like every station receipt.
//
// The station screens group credits ("12,450 cr" — words-receipt-counts' grammar), but the money
// a player reads AWAY from the dock printed raw: the jump notice's toll ("Gate toll 12450 cr"),
// the customs bust fine, the bounty hunter's warrant and its PAY verb, the impound bill and its
// shift-work lines, the chart's remembered sell offers, the price watch's band line, and the
// sortie receipt's credit count. Four-figure money is ordinary here — a fine, a bounty, an
// accrued impound bill, a far-lane toll — and "12450" reads as a typo, not a price.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { bestKnownSellOffers } from '../src/ui/galaxyMap.js';

test('the jump notice names a four-figure toll grouped', () => {
  const line = jumpAbortText({ reason: 'credits', creditsNeeded: 12450, creditsHeld: 312 });
  assert.equal(line, 'Gate toll 12,450 cr — purse holds 312 cr. Earn it at a dock.');
  assert.equal(jumpAbortText({ reason: 'credits', creditsNeeded: 950, creditsHeld: 40 }),
    'Gate toll 950 cr — purse holds 40 cr. Earn it at a dock.', 'small money stays plain');
});

test('the chart remembers sell offers grouped, largest first', () => {
  const state = {
    simTime: 1000,
    player: {
      marketMemory: {
        station_a: { cmdty_ore_iron: { sell: 2450, buy: 900, seenAt: 990, source: 'dock' } },
        station_b: { cmdty_ore_iron: { sell: 10250, buy: 940, seenAt: 995, source: 'dock' } },
      },
    },
  };
  const offers = bestKnownSellOffers(state, 'cmdty_ore_iron', 3);
  assert.equal(offers.length, 2);
  assert.equal(offers[0].sell, 10250, 'the best price sorts first');
  const fmt = (n) => Number(n).toLocaleString('en-US');
  assert.equal(fmt(offers[0].sell), '10,250');
});

test('the legal money sites build grouped amounts (source contract)', () => {
  for (const [file, pattern] of [
    ['../src/ui/warrantOfferPrompt.js', /The bounty stands at \$\{owed\.toLocaleString\('en-US'\)\} cr/],
    ['../src/ui/warrantOfferPrompt.js', /label: `PAY \$\{owed\.toLocaleString\('en-US'\)\} CR`/],
    ['../src/ui/warrantOfferPrompt.js', /SHORT — the bounty is \$\{owed\.toLocaleString\('en-US'\)\} cr and you hold \$\{credits\.toLocaleString\('en-US'\)\} cr\./],
    ['../src/ui/impoundPayPrompt.js', /The bill stands at \$\{owed\.toLocaleString\('en-US'\)\} cr/],
    ['../src/ui/impoundPayPrompt.js', /label: `PAY \$\{owed\.toLocaleString\('en-US'\)\} CR`/],
    ['../src/ui/impoundPayPrompt.js', /wire the \$\{amount\.toLocaleString\('en-US'\)\} cr/],
    ['../src/ui/customsPrompt.js', /fined \$\{Math\.max\(0, Math\.round\(fine\)\)\.toLocaleString\('en-US'\)\} cr/],
    ['../src/ui/watchlistHud.js', /\$\{word\} \$\{Number\(target\)\.toLocaleString\('en-US'\)\} cr — quoting \$\{Number\(price\)\.toLocaleString\('en-US'\)\}/],
    ['../src/ui/hudAttention.js', /parts\.push\(`\$\{credits\.toLocaleString\('en-US'\)\} cr`\)/],
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, pattern, `${file}: ${pattern}`);
  }
  // The chart's own Credits row was already grouped at its source — never double-formatted.
  const chart = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  assert.match(chart, /const credits = state\.player && state\.player\.credits \? Math\.round\(state\.player\.credits\)\.toLocaleString\('en-US'\) : '0';/);
  assert.ok(!chart.includes('${Number(credits).toLocaleString'), 'the already-grouped string stays untouched');
});
