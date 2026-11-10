/** Fixed-seed demonstration. Synthetic facts, real packet event bus, real production module. */
import assert from 'node:assert/strict';
import { harness, chain } from '../tests/chronicler/harness.mjs';

const h = harness({}, 4242);
chain(h); h.step(13);
const connected = h.system.query({ completeOnly: true })[0];
assert.equal(connected?.complete, true);
for (const [t, transition] of [[20, 'encountered'], [30, 'fled'], [240, 'returned'], [260, 'defeated']]) {
  h.emit(t, 'aceMemory:transition', { aceId: 'iona-demo', aceName: 'Iona Voss', transition }); h.step(t + 3);
}
for (const [i, name] of ['Quiet Meridian', 'Peregrine', 'Tin Saint'].entries()) {
  const t = 300 + i * 30;
  h.emit(t, 'distress:rescued', { id: `rescue-${i}`, name, rescuerId: 1 }); h.step(t + 3);
}
h.step(3613);
const recall = h.system.requestRecall({ context: 'dock', stationId: 'station_helios_dock', sectorId: 'helios' });
assert.ok(recall); assert.match(recall.text, /sim-hour/);
const saved = h.system.serialize(); h.system.deserialize(saved);
assert.deepEqual(h.system.serialize(), saved);

// This second run deliberately lacks source-tagged inventory and sale receipts.
const native = harness({}, 4242); chain(native, { through: 4 });
native.emit(10, 'economy:tradeCompleted', {
  stationId: 'station_helios_dock', commodityId: 'cmdty_salvage', side: 'sell', qty: 4, total: 240,
});
native.step(13);
assert.equal(native.system.query({ completeOnly: true }).length, 0);
const result = {
  fixture: 'Synthetic producer receipts; not a full-game playthrough', seed: 4242,
  headline: h.events('news:publish')[0], connectedStory: connected,
  aceSaga: h.system.query({ kind: 'ace_saga' })[0], legends: h.system.getLegends(),
  stationRecall: recall,
  nativeOnly: { completeChains: 0, stories: native.system.query() },
  saveRoundTripExact: true, diagnostics: h.system.diagnostics(),
};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log('SPACEFACE / THE CHRONICLER — fixed-seed fixture 4242\n');
  console.log('NEWS\n' + result.headline.text + '\n');
  console.log('PROVEN CAUSAL PATH\n' + connected.milestones.join(' → ') + '\n');
  console.log('RIVAL MEMORY\n' + result.aceSaga.summary + '\n');
  console.log('LEGEND\n' + result.legends.map(l => `${l.title}: ${l.text}`).join('\n') + '\n');
  console.log('ONE SIM-HOUR LATER, AT THE STATION\n' + recall.text + '\n');
  console.log('TRUTHFUL FAILURE\nNative salvage completion + an unsourced trade remain separate; complete chains: 0.\n');
  console.log('SAVE / RESTORE\nExact round trip. This demonstrates the module, not a running SpaceFace integration.');
}
