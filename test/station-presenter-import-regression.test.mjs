import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appUrl = new URL('../src/ui/station/stationApp.js', import.meta.url);
const source = readFileSync(appUrl, 'utf8');

test('station app wires a station life presenter exactly when its module is delivered', () => {
  // Keep this scoped to the regression, not a replacement for a full import-graph check.
  if (!existsSync(new URL('./stationLife.js', appUrl))) {
    assert.equal(/stationLife\.js|createStationLifePresenter|\blifePresenter\b/.test(source), false,
      'the absent stationLife module must not block the station app import');
  } else {
    assert.match(source, /import \{ createStationLifePresenter \} from '\.\/stationLife\.js'/);
    assert.match(source, /const lifePresenter = createStationLifePresenter\(ctx, \{/);
    for (const method of ['show', 'hide', 'dispose']) {
      assert.match(source, new RegExp(`lifePresenter\\.${method}\\(\\)`));
    }
  }
});

test('station app keeps arrival receipts and lifecycle wiring', () => {
  assert.match(source, /import \{ createStationArrivalPresenter \} from '\.\/stationArrival\.js'/);
  assert.match(source, /const arrivalPresenter = createStationArrivalPresenter\(ctx, \{\s*\.\.\.opts\.arrivalTimers,\s*showReceipt,\s*receiptVisible: \(\) => receiptEl\.hidden === false,/);
  for (const method of ['show', 'hide', 'dispose']) {
    assert.match(source, new RegExp(`arrivalPresenter\\.${method}\\(\\)`));
  }
  assert.match(source, /while \(pendingReceipts\.length\)/);
  assert.match(source, /showReceipt\(row\.kind, row\.title, row\.delta\)/);
});

test('runtime Long Berth lookup still supplies its identity and copied services', () => {
  assert.match(source, /import \{ stationInfoFor \} from '\.\.\/\.\.\/systems\/missions\.js'/);
  const resolver = source.match(/function resolveStation\(ctx\) \{[\s\S]*?\n\}\n/);
  assert.ok(resolver, 'station resolver must remain available');
  const state = { ui: { dockedStationId: 'GOLD-HOME' } };
  const services = ['repair', 'refuel'];
  let calls = 0;
  const resolve = vm.runInNewContext(`(${resolver[0]})`, {
    STATION_REC: new Map(),
    FACTION_REC: new Map([['guild', { name: 'Guild' }]]),
    titleCaseWords: value => value[0].toUpperCase() + value.slice(1),
    stationInfoFor(actualState, id) {
      assert.equal(actualState, state);
      assert.equal(id, 'GOLD-HOME');
      calls++;
      return { name: 'Long Berth', type: 'berth', size: 'S', factionId: 'guild', services };
    },
  });
  const station = resolve({ state });
  assert.equal(calls, 1);
  assert.equal(station.name, 'Long Berth');
  assert.equal(station.typeLabel, 'Berth · Class S');
  assert.equal(station.factionId, 'guild');
  assert.equal(station.factionName, 'Guild');
  assert.deepEqual(station.services, services);
  assert.notEqual(station.services, services);
});
