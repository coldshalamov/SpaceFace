// Winning the real crates at the seed-4242 day-196 Drift Auction spills both
// salvage loads. Amounts, the dud shell, and the bidding window stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { DRIFT_AUCTION_RUNTIME } from '../src/systems/driftAuctionRuntime.js';

const SECTOR = 'sector_pallas_drift';
const SHAPE = 'the_drift_auction';
const ENCOUNTER_ID = 'enc_sector_pallas_drift_196_the_drift_auction_4';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.world.activeSector = { stations: [], pois: [] };
  return { sim, state: sim.state, director: sim.registry.get('encounterDirector') };
}

test('the day-196 Drift Auction places Platinoid Ore beside the Refined Metals', () => {
  const scheduled = planEncounters(4242, SECTOR, 196, zonesForSector(SECTOR));
  const row = scheduled.find((item) => item.shapeId === SHAPE);
  assert.ok(row, 'seed 4242 schedules the Drift Auction on sector-day 196');
  assert.equal(row.squadId, ENCOUNTER_ID);
  assert.equal(row.zoneName, 'The Empty Habitat');

  const t = boot();
  const live = {
    id: row.squadId,
    shapeId: SHAPE,
    sectorId: SECTOR,
    anchor: { x: row.zoneCenter.x, z: row.zoneCenter.z },
    phase: 'offer',
    ids: [],
    roles: {},
    vars: {},
    data: {},
    factionId: 'faction_quiet',
    shape: { receipts: {}, motive: 'three tethered crates', primaryLine: 'SCOW: Three crates.' },
    plan: { motive: 'three tethered crates' },
  };
  t.state.encounterDirector.live[row.squadId] = live;
  DRIFT_AUCTION_RUNTIME.fire(t.director, live, t.state);

  const crates = live.vars.crates;
  assert.equal(crates.length, 3);
  const byId = Object.fromEntries(crates.map((crate) => [crate.commodityId, crate]));
  assert.equal(byId.cmdty_refined_metals?.amount, 12);
  assert.equal(byId.cmdty_ore_platinoid?.amount, 6);
  assert.equal(byId.cmdty_scrap_metal?.amount, 3);
  assert.equal(crates.filter((crate) => crate.dud).length, 1);
  assert.equal(COMMODITIES.find((row) => row.id === 'cmdty_ore_platinoid')?.name, 'Platinoid Ore');
  assert.equal(COMMODITIES.find((row) => row.id === 'cmdty_refined_metals')?.name, 'Refined Metals');

  const platinoid = crates.find((crate) => crate.commodityId === 'cmdty_ore_platinoid');
  for (const rivalId of live.vars.rivals) {
    const rival = t.state.entities.get(rivalId);
    rival.pos.x += 20000;
    rival.pos.z += 20000;
  }
  const shell = t.state.entities.get(platinoid.id);
  t.sim.bus.emit('scan:pulse', {
    pos: { x: shell.pos.x, z: shell.pos.z },
    radius: 1200,
    source: 'player-scanner',
    scannerId: t.state.playerId,
    seq: 1,
    simTime: t.director.now(),
  });
  DRIFT_AUCTION_RUNTIME.tick(t.director, live, t.state, live.vars.startedAt + 120);

  let pod = null;
  for (const entity of t.state.entities.values()) {
    if (entity?.data?.commodityId === 'cmdty_ore_platinoid' && entity.data.jettisonedCargo) pod = entity;
  }
  assert.ok(pod, 'winning the platinoid crate spills a cargo pod');
  assert.equal(pod.data.amount, 6);
  assert.equal(pod.data.kind, 'cargo');
  assert.equal(shell.alive, false);
  const metals = t.state.entities.get(byId.cmdty_refined_metals.id);
  assert.notEqual(metals.alive, false);
});
