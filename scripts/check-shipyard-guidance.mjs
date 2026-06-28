import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { describeShipyardPurchase } from '../src/ui/screens/shipyard.js';

const source = readFileSync(new URL('../src/ui/screens/shipyard.js', import.meta.url), 'utf8');
const ship = (id) => SHIPS.find((entry) => entry.id === id);

let guidance = describeShipyardPurchase(ship('ship_wasp'), { credits: 100000 }, false);
assert.equal(guidance.state, 'locked');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Combat Basics');
assert.match(guidance.title, /requires Combat Basics/);

guidance = describeShipyardPurchase(ship('ship_pelican'), { credits: 500 }, true);
assert.equal(guidance.state, 'funding');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need 21,500 cr');
assert.match(guidance.title, /need 21,500 more credits/i);

guidance = describeShipyardPurchase(ship('ship_pelican'), { credits: 22000 }, true);
assert.equal(guidance.state, 'available');
assert.equal(guidance.disabled, false);
assert.equal(guidance.label, 'Buy');
assert.match(guidance.title, /After purchase/);

guidance = describeShipyardPurchase(ship('ship_kestrel'), { credits: 0 }, true);
assert.equal(guidance.state, 'free');
assert.equal(guidance.label, 'Claim');

assert.match(source, /export function describeShipyardPurchase/);
assert.match(source, /Research ' \+ req/);
assert.match(source, /aria-label="' \+ escapeHtml\(purchase\.title\)/);
assert.doesNotMatch(source, /Requires ' \+ escapeHtml\(def\.requiresTech\)/);
assert.doesNotMatch(source, />Locked<\/button>/);

console.log('Shipyard guidance OK - hull purchase buttons explain tech and credit blockers.');
