import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import { dropKickCargoPod, DROP_KICK_CRUISE_SPEED } from '../src/systems/jettisonImpulse.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { isJettisonedCargoPod, lootShards } from '../src/systems/lootShards.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';
import * as marketScreen from '../src/ui/station/screens/market.js';

const SEED = 17704;
const GOOD = 'cmdty_narcotics';
const UNITS = 8;
const OUTLAW = 'station_smuggler';

function ship(pos, { team = 0, mass = 18, radius = 14, dynamic = true, data = {} } = {}) {
  return {
    type: 'ship', team, pos, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius, mass, hull: 400, hullMax: 400, collides: true,
    factionId: team === 0 ? 'player' : 'faction_scn', flags: {},
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 80, dynamic, ccd: true, material: 'ship', revision: 0 },
    data: { defId: 'ship_kestrel', ...data },
  };
}

function place(entity, x, z) {
  Object.assign(entity.pos, { x, z });
  if (entity.prevPos) Object.assign(entity.prevPos, { x, z });
  Object.assign(entity.vel, { x: 0, z: 0 });
  entity.physicsBody.revision += 1;
}

test(`seed ${SEED}: physical smuggling reaches the outlaw market, pays a visible wash cut, and changes its own quote`, async () => {
  const sim = createSimulation({ seed: SEED, systems: [cargo, economy, lootShards, pirateDisguise, lawSecurity, heat, physics] });
  const { state, bus } = sim;
  const physicsSys = sim.registry.get('physics');
  try {
    state.mode = 'flight';
    state.player.credits = 10_000;
    state.player.cargo.capVolume = 40;
    const player = sim.spawn(ship({ x: -19, z: 28 }));
    state.playerId = player.id;
    assert.equal(await physicsSys.prepareBackend(state), true);
    const market = sim.registry.get('economy');
    const trades = [];
    const scans = [];
    bus.on('economy:tradeCompleted', (receipt) => trades.push(receipt));
    bus.on('contraband:scanned', (receipt) => scans.push(receipt));

    // Buy actual stock, then move the same cargo into a physical pod through the cargo owner.
    state.ui.dockedStationId = 'station_sker';
    bus.emit('dock:docked', { stationId: 'station_sker' });
    bus.emit('ui:buy', { commodityId: GOOD, qty: UNITS });
    assert.equal(state.player.cargo.items[GOOD], UNITS);
    assert.equal(market.quote('station_helios', GOOD, 'sell', UNITS).reason, 'untraded');
    bus.emit('dock:undocked', {});
    state.ui.dockedStationId = null;
    player.vel.x = 60; // cancels the rearward ejection; the subsequent kick owns transit speed.
    assert.equal(sim.registry.get('cargo').jettison(GOOD, UNITS), UNITS);
    const pod = state.entityList.find(isJettisonedCargoPod);
    assert.ok(pod);
    assert.equal(state.player.cargo.items[GOOD] || 0, 0);
    place(player, 420, 380);
    sim.spawn(ship({ x: 0, z: 0 }, { team: 2, mass: 400, data: { customsScanner: true, defId: 'customs_cutter' } }));
    sim.spawn(ship({ x: 125, z: 28 }, {
      team: 1, mass: 8000, radius: 18, dynamic: false,
      data: { outlawCatchNet: true, defId: 'ship_barge', trafficRole: 'outlaw' },
    }));
    sim.step();
    assert.equal(dropKickCargoPod(sim.helpers, state, pod, 0, DROP_KICK_CRUISE_SPEED), true);
    for (let tick = 0; tick < 220 && !pod.data.caughtByNet; tick += 1) sim.step();
    assert.equal(pod.data.customsConeEntered, true, 'cargo physically crossed customs');
    assert.equal(pod.data.caughtByNet, true, 'cargo reached the outlaw catch body');
    assert.equal(scans.length, 0, 'the fast transit beats scan dwell');

    // Dock alongside the delivered pod. The existing wash changes its papers and charges once.
    place(player, pod.pos.x + 40, pod.pos.z);
    const creditsBeforeWash = state.player.credits;
    state.ui.dockedStationId = OUTLAW;
    bus.emit('dock:docked', { stationId: OUTLAW });
    assert.equal(pod.data.laundered, true);
    assert.equal(pod.data.legality, 'legal');
    const wash = state.player.launderLedger[0];
    assert.equal(wash.cut, 616);
    assert.equal(state.player.credits, creditsBeforeWash - wash.cut);
    bus.emit('dock:launder', { stationId: OUTLAW });
    assert.equal(state.player.launderLedger.length, 1, 'repeated dock intents cannot re-charge washed cargo');

    // Collection's public synchronous acceptance seam returns the exact pod quantity to the hold.
    const pickup = { pickupId: pod.id, collectorId: player.id, ...pod.data };
    bus.emit('pickup:collected', pickup);
    assert.equal(pickup.acceptedAmount, UNITS);
    sim.helpers.removeEntity(pod.id);
    const listing = state.economy.markets[OUTLAW][GOOD];
    const stockBefore = listing.stock;
    const quoteBefore = market.quote(OUTLAW, GOOD, 'sell', UNITS);
    bus.emit('ui:sell', { commodityId: GOOD, qty: UNITS });
    const sale = trades.at(-1);
    assert.equal(sale.side, 'sell');
    assert.equal(sale.total, quoteBefore.total);
    assert.equal(listing.stock, stockBefore + UNITS);
    assert.equal(state.player.cargo.items[GOOD] || 0, 0);
    assert.equal(state.player.credits, creditsBeforeWash - wash.cut + sale.total);
    const nextQuote = market.quote(OUTLAW, GOOD, 'sell', UNITS);
    assert.ok(nextQuote.total < quoteBefore.total, 'the player supply lowers the next executable quote');
    assert.equal(state.economy.marketIntel[OUTLAW].snapshot[GOOD].stock, listing.stock);

    assert.equal(typeof marketScreen.marketLaunderLedgerHtml, 'function', 'the market must present the wash ledger');
    const visibleLedger = marketScreen.marketLaunderLedgerHtml(state);
    assert.match(visibleLedger, /Laundering ledger/);
    assert.match(visibleLedger, /Narcotics/);
    assert.match(visibleLedger, /8 u/);
    assert.match(visibleLedger, /616 cr/);
    assert.match(visibleLedger, /35%/);
    assert.equal(marketScreen.marketLaunderLedgerHtml({ ...state, player: JSON.parse(JSON.stringify(state.player)) }), visibleLedger,
      'the persisted player ledger renders the same receipt after a JSON round trip');
    state.ui.dockedStationId = 'station_helios';
    assert.equal(marketScreen.marketLaunderLedgerHtml(state), '', 'another berth cannot claim this wash');
    console.log(`PQ-177.04 seed=${SEED} customs=evaded delivered=${UNITS} wash=${wash.cut} sale=${sale.total} nextSale=${nextQuote.total} stock=${stockBefore}->${listing.stock}`);
  } finally {
    physicsSys._disableSg02DynamicAuthority();
    sim.dispose();
  }
});
