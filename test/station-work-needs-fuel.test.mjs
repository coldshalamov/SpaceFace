// INF-3 (WF-04, stations/destinations) - you cannot be handed work in a place with no way to leave.
//
// CONSIDERED. Player words: "There are stations on the route that will patch my hull and hand me
// a contract, and there is not one drop of fuel in the whole sector. I dock, I take the job, and
// then I sit there." Sectors named: Research Station Veil and Triton Wake Lab - the two mission
// boards on the frontier whose sectors had no refuel anywhere.
//
// Three real alternatives:
//   (a) a station that hands out work also pumps fuel
//   (b) add refuel to every station that repairs a hull
//   (c) a fuel scoop / auto-rescue so a stranded pilot can self-rescue
// (a) wins. (b) LOSES to the vision: Eunomia Fence's chart note reads "fuel and hospitality do
// not" and Sedna Survey Post's reads "no fuel, no rescue, few questions" - those are authored
// frontier fiction and the danger is the point. (c) invents a system to paper over a data hole,
// and it deletes the same consequence the rim is written to have.
//
// The fix is therefore exactly two stations, and the test pins the real rule so neither hole can
// reopen and neither authored outpost can be "helpfully" refuelled later.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';

const stationsOf = (sector) => sector.stations || [];
const offers = (station, service) => (station.services || []).includes(service);
const allStations = SECTORS.flatMap((sector) => stationsOf(sector).map((station) => ({ sector, station })));

test('a sector that hands out work can also fuel you - a contract is not a trap', () => {
  const offenders = [];
  for (const sector of SECTORS) {
    const stations = stationsOf(sector);
    const boards = stations.filter((s) => offers(s, 'missions'));
    const pumps = stations.filter((s) => offers(s, 'refuel'));
    if (boards.length && !pumps.length) {
      offenders.push(`${sector.id} (missions@${boards.map((s) => s.id).join(',')})`);
    }
  }
  assert.deepEqual(offenders, [],
    `you must be able to leave the place that gave you the job: ${offenders.join('; ')}`);

  // The two that were broken are now explicitly fuelled.
  const veil = SECTORS.find((s) => s.id === 'sector_veil_nebula').stations.find((s) => s.id === 'station_veil');
  const triton = SECTORS.find((s) => s.id === 'sector_triton_wake').stations.find((s) => s.id === 'station_triton');
  assert.equal(offers(veil, 'refuel'), true, 'Research Station Veil pumps fuel');
  assert.equal(offers(triton, 'refuel'), true, 'Triton Wake Lab pumps fuel');
  assert.equal(offers(veil, 'missions'), true, 'and still hands out work');
  assert.equal(offers(triton, 'missions'), true, 'and still hands out work');
});

test('the authored fuel-less outposts keep their fiction, and say so on the chart', () => {
  // The rim is meant to be able to strand you. Those two stations carry the rule in their own
  // chart note, which is what makes fuel-less honest instead of a hole - a stranger is warned
  // before they commit, not after they dock.
  for (const id of ['station_sedna', 'station_eunomia']) {
    const found = allStations.find((row) => row.station.id === id);
    assert.ok(found, `${id} exists`);
    assert.equal(offers(found.station, 'refuel'), false,
      `${id} keeps the authored fuel-less frontier fiction - do not "helpfully" refuel it`);
    assert.equal(offers(found.station, 'missions'), false,
      `${id} hands out no work either, so the work-needs-fuel rule is not the thing stranding anyone`);
    assert.ok(found.station.chartNote, `${id} states the rule on the chart`);
    assert.match(found.station.chartNote, /fuel/i,
      `${id} chart note names fuel, so the warning is on the chart before the dock: "${found.station.chartNote}"`);
  }
});

test('the fix is exactly two stations, not a blanket service grant', () => {
  // Every station that repairs a hull is NOT given fuel - that would erase the frontier. Only
  // three yards now repair without fuelling, and each is honest: two are the authored fuel-less
  // outposts whose chart note says so, and the third (Forge Foundry) shares its sector with the
  // Refuel Depot, which is the designed foundry/depot split.
  const repairWithoutRefuel = allStations
    .filter(({ station }) => offers(station, 'repair') && !offers(station, 'refuel'))
    .map(({ sector, station }) => ({ sector, station }));

  assert.deepEqual(repairWithoutRefuel.map(({ station }) => station.id).sort(),
    ['station_eunomia', 'station_forge', 'station_sedna'],
    'only the two charted outposts and the Vesta foundry repair without fuelling');

  for (const { sector, station } of repairWithoutRefuel) {
    const sectorPumps = stationsOf(sector).filter((s) => offers(s, 'refuel'));
    const charted = /fuel/i.test(station.chartNote || '');
    assert.ok(sectorPumps.length > 0 || charted,
      `${station.id} repairs without fuelling only if its sector pumps elsewhere, or its chart says so`);
  }
  // Forge Foundry is the designed split: the Refuel Depot next door sells the fuel it does not.
  const vesta = SECTORS.find((s) => s.id === 'sector_vesta_forge');
  assert.equal(offers(vesta.stations.find((s) => s.id === 'station_depot3'), 'refuel'), true);
});
