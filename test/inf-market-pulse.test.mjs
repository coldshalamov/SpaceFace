/**
 * inf-market-pulse — the market screen reads the economy's own measured pulse.
 *
 * WF-06 (visible value flow). The economy already bins twelve hours of observed cash in/out,
 * sale proceeds, contract offers and accepts, and field work published vs depleted
 * (src/economy/economyPulse.js) and exposes economyPulseReport — with zero readers, so the one
 * flow the economy tracks never reached the screen where the player watches money. The market
 * screen now paints that pulse beside its routes. This focused test proves the read: honest
 * totals, quiet stretches stated as quiet (never interpolated), singular/plural whole sentences,
 * honest empty state, fail-closed on corrupt input, and the frame slot present.
 *
 * Focused: owners = src/ui/marketPulsePresenter.js, src/ui/views/stationFrames.js,
 * src/ui/station/screens/market.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEconomyPulse, recordEconomyPulse, recordEconomyCash, economyPulseReport,
} from '../src/economy/economyPulse.js';
import { marketPulseRead, marketPulseHtml } from '../src/ui/marketPulsePresenter.js';
import { marketFrameHtml } from '../src/ui/views/stationFrames.js';

const NOW = 48 * 900 + 300; // middle of bin 48, so 48 complete bins and one live one

function pulseReport(bins) {
  const economy = createEconomyPulse(0);
  for (const b of bins) recordEconomyPulse(economy, b.at, b.fields);
  return economyPulseReport(economy, NOW);
}

test('a busy economy reads as totals, sale share, live quarter-hour and quiet stretches', () => {
  const report = pulseReport([
    { at: 900, fields: { cashInCr: 5200, cashOutCr: 1400, saleCr: 5200, offers: 4, accepts: 2 } },
    { at: 1800, fields: { cashInCr: 300, cashOutCr: 2600, buyCr: 2600 } },
    // bins 3..8 quiet (complete, zero movement): the longest quiet stretch is 6
    { at: 48 * 900 + 60, fields: { cashInCr: 640, cashOutCr: 90 } },
  ]);
  const read = marketPulseRead(report);
  assert.ok(read && read.alive, 'the pulse reads as alive');
  const text = read.lines.join(' ');
  assert.match(text, /10,230 cr moved: 6,140 cr in, 4,090 cr out/, 'the twelve-hour totals are grouped and honest');
  assert.match(text, /Sales accounted for 5,200 cr of the inflow/, 'the sale share is named');
  assert.match(text, /This quarter-hour already moved 640 cr in and 90 cr out/, 'the live bin reads');
  assert.match(text, /The longest quiet stretch ran 45 quarter-hours/, 'quiet is stated, not smoothed');
  assert.equal(read.lines.filter((l) => /Contract work/.test(l)).length, 1, 'work line present');
  assert.match(text, /4 offers posted, 2 were taken/, 'offers and accepts read');
  assert.ok(!/undefined|NaN/.test(marketPulseHtml(read)), 'no leaked undefined or NaN');
  assert.match(marketPulseHtml(read), /Observed cash flow/, 'the report scope line rides along');
});

test('singular counts stay whole sentences', () => {
  const report = pulseReport([
    { at: 900, fields: { cashInCr: 100, offers: 1, accepts: 1, publishedUnits: 1 } },
    { at: 1800, fields: { cashInCr: 200, depletedRequests: 1 } },
  ]);
  const text = marketPulseRead(report).lines.join(' ');
  assert.match(text, /1 offer posted, 1 was taken/, 'one offer and one taker read singular');
  assert.match(text, /fields published 1 unit of work/, 'one published unit reads singular');
  assert.match(text, /1 work request came back depleted/, 'one depleted request reads singular');
});

test('a silent economy stays silent on the page', () => {
  const report = pulseReport([]);
  const read = marketPulseRead(report);
  assert.ok(read && !read.alive, 'no movement reads as not yet alive');
  assert.equal(
    read.lines[0],
    'Nothing observed yet — the pulse starts when the first credit moves.',
    'the empty state is honest, not dressed up',
  );
});

test('a stale pulse says when the last credit moved', () => {
  const report = pulseReport([
    { at: 900, fields: { cashInCr: 700 } }, // movement ends at bin 1's end (1800s), ~10.5h before NOW
  ]);
  const read = marketPulseRead(report);
  assert.match(read.lines.join(' '), /The last credit moved \d+ quarter-hours? ago/, 'staleness is stated in bins');
});

test('corrupt input fails closed to the honest line', () => {
  assert.equal(marketPulseRead(null), null, 'null report reads null');
  assert.equal(marketPulseRead({ rows: 'nope' }), null, 'non-array rows read null');
  assert.match(marketPulseHtml(null), /Nothing observed yet/, 'null renders the honest line');
  const text = marketPulseHtml(marketPulseRead({ rows: [] }));
  assert.match(text, /Nothing observed yet/, 'empty rows render the honest line');
});

test('the market frame carries the pulse slot beside route intelligence', () => {
  const frame = marketFrameHtml();
  assert.match(frame, /sx-mkt__pulse/, 'the pulse mount exists');
  assert.match(frame, /Market pulse/, 'the disclosure is labelled');
  assert.match(frame, /aria-label="Market pulse, twelve hours observed"/, 'the region is named for readers');
  assert.match(frame, /<details class="so-route-disclosure" open><summary>Market pulse/, 'the pulse opens by default so the flow is visible without a click');
});
