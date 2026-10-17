import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS, stationContactServices } from '../src/data/sectors.js';
import { stationServiceLabel } from '../src/ui/station/stationHubModel.js';
import { instrumentScenario, mountInstrumentCard } from './helpers/infInstrumentScenario.mjs';

const STATIONS = new Map(SECTORS.flatMap((sector) =>
  (sector.stations || []).map((station) => [station.id, { sector, station }])));

test('INST-38 seed 4242: locking Helios and the Vesta depot names each authored public service before docking', () => {
  const h = instrumentScenario();
  const card = mountInstrumentCard(h);
  try {
    for (const [stationId, expected] of [
      ['station_helios', 'Services: Market · Shipyard · Refuel · Repair · Missions'],
      ['station_depot3', 'Services: Refuel · Missions'],
    ]) {
      const { sector, station } = STATIONS.get(stationId);
      h.state.world.currentSectorId = sector.id;
      const contact = h.sim.spawn({
        type: 'station', factionId: station.factionId, pos: { x: 200, z: 0 },
        data: { stationId, name: station.name, services: ['black_market', 'made_up'] },
      });
      h.state.player.targetId = contact.id;
      const before = JSON.stringify(contact.data);
      h.sim.step();
      card.update();
      assert.equal(h.state.ui.docked, false, 'no dock event or station screen needed');
      assert.equal(card.el.style.display, 'block');
      assert.equal(card.el.querySelector('.sf-target__object').style.display, 'block');
      assert.equal(card.el.querySelector('.sf-target__object').textContent, expected);
      assert.equal(expected, `Services: ${station.services.map(stationServiceLabel).join(' · ')}`);
      assert.equal(JSON.stringify(contact.data), before, 'the renderer only reads station data');
    }
  } finally { h.sim.dispose(); }
});

test('INST-38: a public lock never discloses the authored black-market service or invents services', () => {
  const { station } = STATIONS.get('station_smuggler');
  assert.ok(station.services.includes('black_market'));
  assert.deepEqual(stationContactServices(station.id), ['missions', 'refuel']);
  assert.deepEqual(stationContactServices('station_unknown'), []);
  assert.ok(station.services.includes('black_market'), 'filtering does not mutate the authored row');
});
