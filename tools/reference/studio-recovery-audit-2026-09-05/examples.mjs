import {ropeEnvelope} from './ropeEnvelope.mjs';
import {maneuverEnvelope} from './maneuverEnvelope.mjs';
import {planTrade} from './transferPlan.mjs';
const base = {massA: 18, massB: 630, speed: 200, length: 100, stiffness: 170};
const longLine = ropeEnvelope(base);
const shortLine = ropeEnvelope({...base, length: 8});
const shortStroke = maneuverEnvelope({samples: [{s: 0, curvature: 0}, {s: 1, curvature: 0}],
  maxSpeed: 100, lateralAccel: 100, accel: 100, brake: 100});
const initial = {version: 0, wallets: {pilot: 100, station: 7}, holds: {
  pilot: {capacity: 10, items: {ore: 1}}, station: {capacity: 20, items: {ore: 20}}}, receipts: {}};
const quote = {id: 'trade:example', buyer: 'pilot', seller: 'station', good: 'ore', quantity: 3,
  unitPrice: 5, expectedVersion: 0, expiresAtTick: 10};
const first = planTrade(initial, quote, 5);
const retry = planTrade(JSON.parse(JSON.stringify(first.state)), quote, 100);
console.log(JSON.stringify({
  label: 'ANALYTICAL / SYNTHETIC EXAMPLES. Not SpaceFace runtime measurements.',
  ropeInputs: base, longLine, shortLine,
  shortStroke,
  transaction: {initial, quote, receipt: first.receipt, walletsAfter: first.state.wallets,
    cargoAfter: first.state.holds, lateRetryDuplicate: retry.duplicate, versionAfterRetry: retry.state.version},
}, null, 2));
