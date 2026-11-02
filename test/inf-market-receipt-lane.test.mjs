// inf-market-receipt-lane — WF-14: the station's receipt line stays on the glass.
//
// The market band past ~900 wide at 461–800 tall (1280×720 is the common laptop shape) pinned
// the berth receipt `position: fixed; bottom: 4px` — a 24–38px line over a 14px strip. It rode
// up onto the dock rail, `keepReceiptOffControls` answered with the above-the-rail anchor, and
// because the receipt was fixed there, that anchor resolved against the viewport: the receipt
// painted at y −48..−10, off the top of the glass (measured with check:ui:layout — 17 findings,
// every one the receipt family). Sales, tolls, services and the station PA were unreadable for
// their whole 3.6 s life on the market at this size.
//
// The honest lane is the one the narrow band already proved (stationLayouts: "a live receipt
// needs its own measured row"): flow. These pins hold that contract so the lane cannot regress
// back to a viewport-anchored overlay.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKET_LAYOUTS = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'orrery', 'marketLayouts.js'), 'utf8');
const STATION_LAYOUTS = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'orrery', 'stationLayouts.js'), 'utf8');
const STATION_APP = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'station', 'stationApp.js'), 'utf8');

const MARKET_BAND = /@media \(min-width:901px\) and \(min-height:461px\) and \(max-height:800px\) \{([\s\S]*?)\n\}/;

test('the market receipt lane past 900 wide at 461-800 tall is flow, not a viewport overlay', () => {
  const band = MARKET_BAND.exec(MARKET_LAYOUTS);
  assert.ok(band, 'the 901+/461-800 market band exists');
  const css = band[1];
  assert.ok(/\.sx-receipt\s*\{[^}]*position:static !important/.test(css),
    'the receipt sits in the foot by flow, never position:fixed');
  assert.equal(/position:fixed/.test(css), false,
    'a fixed receipt turns the collision resolver into a viewport anchor — the off-glass bug');
  assert.ok(/\.sxb-ops:has\(> \.sx-comms > \.sx-receipt:not\(\[hidden\]\)\) > \.sx-comms \{ display:contents/.test(css),
    'the comms aside dissolves while a receipt is live, so the line gets its own row');
  assert.ok(/order:-1 !important;\s*\n?\s*flex:1 0 100% !important/.test(css),
    'the live receipt takes a full-width row at the foot head, controls keep their row');
});

test('the flow lane matches the proven narrow-band resolution it extends', () => {
  const narrow = /A live receipt needs its own measured row[\s\S]*?display:contents !important/.test(STATION_LAYOUTS);
  assert.ok(narrow, 'the ≤650 band still owns the original flow-row pattern');
  // Same shape: the live receipt row wraps instead of overrunning, and its children can break.
  const band = MARKET_BAND.exec(MARKET_LAYOUTS)[1];
  assert.ok(/flex-wrap:wrap !important; white-space:normal !important/.test(band));
  assert.ok(/overflow-wrap:anywhere/.test(band));
});

test('the collision resolver stays anchored to the receipt, not the viewport, for positioned lanes', () => {
  // keepReceiptOffControls only ever answers a real cover (it measures rects before writing);
  // with the receipt in flow it measures its own row and writes nothing. Its above-the-rail
  // anchor stays correct for every lane that resolves against the foot.
  assert.ok(STATION_APP.includes("receiptEl.style.setProperty('bottom', 'calc(100% + 10px)', 'important')"),
    'the above-the-rail anchor is unchanged for anchored lanes');
  assert.ok(STATION_APP.includes('const guards = [launchEl, commsToggle, helpEl, dock.el];'),
    'the resolver still guards the dock words and UNDOCK');
});
