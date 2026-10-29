// The chart agrees with the berth: the galaxy map station inspector names the
// essential services a station LACKS, from the same rule the dock card speaks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { stationServiceGaps } from '../src/ui/dockArrival.js';
import { SECTORS } from '../src/data/sectors.js';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';

test('the chart source wires the shared gap rule into the station inspector', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/ui/galaxyMap.js', import.meta.url)), 'utf8');
  assert.ok(
    source.includes("import { stationServiceGaps } from './dockArrival.js'"),
    'galaxyMap imports the berth gap rule',
  );
  assert.ok(
    source.includes('const serviceGaps = stationServiceGaps(record)'),
    'the station branch computes gaps from the station record',
  );
  assert.ok(
    source.includes('Berth lacks:'),
    'the inspector renders the gap line beside the service chips',
  );
});

test('real sector stations with real service lists produce honest gap sets', () => {
  let checked = 0;
  let gapped = 0;
  for (const sec of SECTORS) {
    for (const st of (sec.stations || [])) {
      if (!Array.isArray(st.services) || st.services.length === 0) continue;
      checked++;
      const gaps = stationServiceGaps(st);
      // The rule may only name essentials, and only ones truly absent.
      for (const gap of gaps) assert.ok(['refuel', 'repair'].includes(gap));
      for (const gap of gaps) assert.equal(st.services.includes(gap), false, `${st.id} lists ${gap}`);
      if (gaps.length) gapped++;
    }
  }
  assert.ok(checked > 20, `expected the real chart to carry many serviced stations, got ${checked}`);
  assert.ok(gapped > 0, 'at least one real station should lack an essential service for the chart to name');
});

test('selected station services resolve from the live record, preserve point metadata, and keep empty berths empty', () => {
  const original = galaxyMapScreen._selectedTarget;
  try {
    galaxyMapScreen._selectedTarget = {
      kind: 'station', id: 'borrowed_sun_entity', stationId: 'station_borrowed_sun', name: 'The Borrowed Sun',
    };
    const liveStationState = { entityList: [{
      id: 'borrowed_sun_entity', type: 'station', alive: true,
      data: { stationId: 'station_borrowed_sun', services: ['trade', 'refuel', 'repair'] },
    }] };
    const borrowedSunHtml = galaxyMapScreen._servicesTabHtml(liveStationState);
    for (const service of ['trade', 'refuel', 'repair']) assert.ok(borrowedSunHtml.includes(service));
    assert.equal(borrowedSunHtml.includes('No services listed.'), false);

    galaxyMapScreen._selectedTarget = {
      kind: 'station', id: 'empty_berth_entity', stationId: 'station_empty_berth', name: 'Quiet Berth',
    };
    const emptyStationState = { entityList: [{
      id: 'empty_berth_entity', type: 'station', alive: true,
      data: { stationId: 'station_empty_berth', services: [] },
    }] };
    assert.ok(galaxyMapScreen._servicesTabHtml(emptyStationState).includes('No services listed.'));

    galaxyMapScreen._selectedTarget = {
      kind: 'station', id: 'charted_point', stationId: 'station_charted_point', name: 'Charted Point', services: ['trade'],
    };
    assert.ok(galaxyMapScreen._servicesTabHtml({ entityList: [] }).includes('>trade</span>'));
  } finally {
    galaxyMapScreen._selectedTarget = original;
  }
});
