// U4 (WF-04): multi-berth displacement watch tracks each faction berth's hulk independently,
// dockArrival + galaxyMap share factionBerthStatusLine for moored/displaced exterior berth
// state, and dockArrival paperwork distinguishes outlaw black-market fences from customs
// ports for both contraband and restricted salvage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { factionBerthById, factionBerthHulkHome } from '../src/data/factionBerths.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { buildDockArrival, factionBerthStatusLine } from '../src/ui/dockArrival.js';

test('displacing two faction berths tracks each hulk independently on return', () => {
  const pallasBerth = factionBerthById('berth_archive_pallas_stacks');
  const sednaBerth = factionBerthById('berth_helix_variance_pier');
  const pallasHome = factionBerthHulkHome(pallasBerth);
  const sednaHome = factionBerthHulkHome(sednaBerth);

  const folio = {
    id: 101,
    type: 'wreck',
    alive: true,
    pos: { x: pallasHome.x + 400, z: pallasHome.z },
    data: { berthConsign: { berthId: pallasBerth.id, stationId: pallasBerth.stationId } },
  };
  const copy = {
    id: 202,
    type: 'wreck',
    alive: true,
    pos: { x: sednaHome.x + 400, z: sednaHome.z },
    data: { berthConsign: { berthId: sednaBerth.id, stationId: sednaBerth.stationId } },
  };

  const events = [];
  const bus = {
    on: () => () => {},
    emit: (name, payload) => events.push({ name, payload }),
  };
  const state = {
    simTime: 20,
    factions: {},
    world: { currentSectorId: 'sector_pallas_drift' },
    entities: new Map([[folio.id, folio], [copy.id, copy]]),
    factionPresence: {
      serviceReceipts: {
        [pallasBerth.receiptKey]: { kind: 'berthFolio', count: 2, t: 10 },
        [sednaBerth.receiptKey]: { kind: 'berthFiling', count: 1, t: 12 },
      },
      berthWatch: {},
    },
  };

  const sys = Object.create(factionPresence);
  sys.init({ state, bus, helpers: {} });

  // 1. Displace Pallas folio
  sys._watchBerths();
  assert.equal(state.factionPresence.berthWatch[pallasBerth.id].displaced, true);

  // 2. Displace Sedna copy (previously clobbered single _watchedHulkId)
  state.world.currentSectorId = 'sector_sedna_dark';
  sys._watchBerths();
  assert.equal(state.factionPresence.berthWatch[sednaBerth.id].displaced, true);

  // 3. Return Pallas folio first — must still resolve berthReturned even after Sedna was watched
  state.world.currentSectorId = 'sector_pallas_drift';
  folio.pos.x = pallasHome.x;
  folio.pos.z = pallasHome.z;
  sys._watchBerths();
  assert.equal(state.factionPresence.berthWatch[pallasBerth.id].displaced, false,
    'returning the first berth hulk closes its writ even when a second berth was displaced later');
  assert.equal(state.factionPresence.berthWatch[sednaBerth.id].displaced, true,
    'the second berth remains displaced until its own copy is returned');
  assert.ok(events.some((e) => e.name === 'factionPresence:berthReturned' && e.payload.berthId === pallasBerth.id));
});

test('dockArrival and galaxyMap report moored and displaced faction-berth status, and distinguish fence vs customs', () => {
  const pallasBerth = factionBerthById('berth_archive_pallas_stacks');
  const state = {
    player: {
      heat: 0,
      cargo: { usedVolume: 2, items: { cmdty_classified_salvage: 2 } },
    },
    missions: { active: [] },
    ui: { marketNews: { log: [], lastCard: null } },
    stationLife: { traffic: [] },
    factionPresence: {
      serviceReceipts: {
        [pallasBerth.receiptKey]: { kind: 'berthFolio', count: 2, t: 10 },
      },
      berthWatch: {},
    },
  };

  // Moored folio at Drift Market (which is also a black_market station)
  const driftStation = {
    id: 'station_drift',
    name: 'Drift Market',
    services: ['trade', 'black_market', 'repair', 'refuel'],
  };
  const mooredView = buildDockArrival(state, driftStation);
  assert.equal(
    mooredView.factionBerth,
    'The Pallas Stacks: Sealed Folio moored on the apron (×2).',
  );
  assert.ok(mooredView.lines.includes('The Pallas Stacks: Sealed Folio moored on the apron (×2).'));
  assert.equal(
    mooredView.paperwork,
    'Fence open for restricted cargo at this berth.',
    'an outlaw black-market berth advertises its fence instead of a customs scan',
  );

  // Displaced folio reports open variance
  state.factionPresence.berthWatch[pallasBerth.id] = { displaced: true, displacedAt: 30, visits: 1 };
  const displacedLine = factionBerthStatusLine(state, 'station_drift');
  assert.equal(
    displacedLine,
    'The Pallas Stacks: moored record missing from the apron — variance open.',
  );

  // Lawful berth with restricted cargo warns of customs scan (both restricted and contraband)
  const heliosView = buildDockArrival(state, {
    id: 'station_helios',
    name: 'Helios Station',
    services: ['trade', 'repair', 'refuel'],
  });
  assert.equal(heliosView.paperwork, 'Restricted cargo may draw a customs scan.');

  // Galaxy map wires factionBerthStatusLine into the station inspector
  const mapSource = readFileSync(fileURLToPath(new URL('../src/ui/galaxyMap.js', import.meta.url)), 'utf8');
  assert.ok(mapSource.includes('factionBerthStatusLine(state, t.stationId || t.id)'));
});
