/**
 * THE WORLD REMEMBERS — U-C, stations with memory. One condition record per berth
 * (`state.economy.stationConditions[stationId]`), written only by economy, lazy, saved only while
 * live: the C6 slam outage moved under it (and still answers `stationServiceOutage`), a strike
 * (the player killed a berth's own crew) worsens that berth's sell quote and slows/costs its yard,
 * a boom (a surplus-band ore flood) makes that sector's yards cheaper, a grudge (three slams in a
 * day) refuses the berth until the note is paid, and a war front on a berth's sector blockades it
 * (derived, never stored).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  economy, DOCK_SLAM_LAW, serviceUnitCr, SERVICE_PRICES, stationServiceOutage,
  stationConditionsFor, stationConditionLine, stationRefuelRation,
} from '../src/systems/economy.js';
import { STATION_CONDITION_LAW, stationYardRateMult } from '../src/economy/stationConditions.js';
import { stationBerthAdmits, stationBerthRefusal } from '../src/data/frontierRumors.js';
import { resolveDockDeny } from '../src/core/dockAccess.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

const STATION_ENTITY_ID = 900;
const BELT_ENTITY_ID = 901;
const DRONE_ID = 77;
const CERES = 'station_ceres';
const BELT = 'station_beltout';
const HELIOS = 'station_helios';

function makeCtx(seed) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100, data: {} };
  const ceres = { id: STATION_ENTITY_ID, type: 'station', alive: true, pos: { x: 200, z: 0 }, data: { stationId: CERES, name: 'Ceres Refinery' } };
  const belt = { id: BELT_ENTITY_ID, type: 'station', alive: true, pos: { x: 3000, z: 0 }, data: { stationId: BELT, name: 'Belt Outpost' } };
  const drone = { id: DRONE_ID, type: 'drone', alive: true, team: 2, pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, mass: 12, data: {} };
  const entities = [player, ceres, belt, drone];
  state.entities = new Map(entities.map((e) => [e.id, e]));
  state.entityList = entities;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const registry = {
    get(name) {
      if (name === 'economy') return economy;
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  economy.newGame();
  return { state, bus, emitted, player };
}

const receiptsOf = (emitted, name) => emitted.filter((e) => e.event === name).map((e) => e.payload);
const recordOf = (id) => SECTORS.flatMap((s) => s.stations || []).find((st) => st.id === id);

function slam(overrides = {}) {
  return {
    targetId: DRONE_ID, otherId: STATION_ENTITY_ID,
    surface: 'structure', targetType: 'drone', otherType: 'station',
    exchangedMomentum: 900, deltaV: 40, feelDeltaV: 75, control: 0.2,
    impactDamage: 30, hullDamage: 30, targetMass: 12, otherMass: 1e6, targetKilled: true,
    provenance: { actorId: 1, weaponId: 'wpn_tractor', tag: 'tether_sling' },
    tick: 7200,
    ...overrides,
  };
}

let victimSeq = 1000;
/** A civilian hull the player kills: spawned dead-on-arrival at `pos`, receipt as combat.kill emits it. */
function killCrew(ctx, { role = 'miner', pos = { x: 210, z: 10 }, data = {}, killerId = 1, hostile = false } = {}) {
  const id = victimSeq++;
  const hull = { id, type: 'ship', alive: false, team: 2, pos: { ...pos }, data: { trafficRole: role, role, ...data } };
  ctx.state.entities.set(id, hull);
  ctx.bus.emit('entity:killed', {
    id, killerId, type: 'ship', pos: { ...pos }, factionId: 'faction_dmc',
    targetHostileToPlayer: hostile, victimClass: 'ship_pelican',
  });
  return id;
}

/** A commodity both berths quote for the player to sell. */
function tradedCommodity(a, b) {
  for (const id of ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_fuel_cells', 'cmdty_scrap_metal', 'cmdty_food']) {
    const qa = economy.quote(a, id, 'sell', 3);
    const qb = economy.quote(b, id, 'sell', 3);
    if (qa && qa.ok && qb && qb.ok) return id;
  }
  throw new Error('no commodity both berths quote');
}

for (const seed of [4242, 8008]) {
  test(`nothing happened, no key: quiet world, taps, non-crew kills and hostile kills leave no condition (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus } = ctx;
    assert.equal(state.economy.stationConditions, undefined);
    assert.equal(stationConditionsFor(state, CERES), null);
    assert.equal(stationConditionLine(state, CERES), null);
    killCrew(ctx, { role: 'hauler' });
    killCrew(ctx, { role: 'courier' });
    killCrew(ctx, { role: 'miner', hostile: true });
    killCrew(ctx, { role: 'miner', killerId: 55 });
    bus.emit('combat:collisionConsequence', slam({ feelDeltaV: DOCK_SLAM_LAW.closingSpeedMin - 1 }));
    bus.emit('economy:oreFlood', { sectorId: 'sector_ceres_belt', pricePressure: -0.05, yieldU: 8 });
    assert.equal(state.economy.stationConditions, undefined, 'no record was created');
    const chunk = economy.serialize();
    assert.equal(chunk.stationConditions, undefined);
    assert.equal(chunk.stationOutages, undefined);
    assert.equal(Math.round(serviceUnitCr(state, 10, 'repair')), 10);
  });

  test(`outage: the slam outage lives under the condition record and the alias reads it (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus } = ctx;
    const t0 = state.simTime;
    bus.emit('combat:collisionConsequence', slam());
    const rec = state.economy.stationConditions[CERES];
    assert.ok(Math.abs(rec.outageRepairUntil - (t0 + DOCK_SLAM_LAW.repairOutageS)) < 1e-9);
    assert.equal(state.economy.stationOutages, undefined, 'the legacy bag is no longer written');
    const outage = stationServiceOutage(state, CERES, 'repair');
    assert.equal(outage.cause, 'dock_slam');
    assert.equal(stationConditionsFor(state, CERES).outage.untilSimTime, rec.outageRepairUntil);
    assert.equal(stationServiceOutage(state, HELIOS, 'repair'), null);
    assert.match(stationConditionLine(state, CERES), /^(Dock control|Yardmaster), Ceres Refinery: repair bay down 10 min/);
    // The legacy shape older fixtures and saves wrote is still read.
    state.economy.stationOutages = { [HELIOS]: { repairUntil: state.simTime + 120, cause: 'dock_slam', atT: 0 } };
    assert.ok(stationServiceOutage(state, HELIOS, 'repair'));
    state.simTime = rec.outageRepairUntil + 1;
    assert.equal(stationServiceOutage(state, CERES, 'repair'), null, 'the clock reopens the bay');
  });

  test(`strike: two of Ceres' own crew killed in a window worsen ITS sell quote and yard, then expire (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, emitted } = ctx;
    const good = tradedCommodity(CERES, HELIOS);
    const beforeCeres = economy.quote(CERES, good, 'sell', 3);
    const beforeHelios = economy.quote(HELIOS, good, 'sell', 3);

    killCrew(ctx, { role: 'miner' });
    assert.equal(receiptsOf(emitted, 'station:strike').length, 0, 'one death is a bad day, not a strike');
    assert.equal(stationConditionsFor(state, CERES), null);
    killCrew(ctx, { role: 'tender' });

    const receipts = receiptsOf(emitted, 'station:strike');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].stationId, CERES);
    assert.equal(receipts[0].sectorId, 'sector_ceres_belt');
    assert.equal(receipts[0].schemaVersion, 1);
    const live = stationConditionsFor(state, CERES);
    assert.ok(live && live.strike, 'the strike is live at Ceres');
    assert.equal(stationConditionsFor(state, BELT), null, 'the next berth over is untouched');

    const afterCeres = economy.quote(CERES, good, 'sell', 3);
    const afterHelios = economy.quote(HELIOS, good, 'sell', 3);
    assert.ok(Math.abs(afterCeres.unitAvg / beforeCeres.unitAvg - STATION_CONDITION_LAW.strike.sellMult) < 1e-9, 'sell price × strike factor');
    assert.equal(afterHelios.unitAvg, beforeHelios.unitAvg, 'another berth pays what it paid');
    assert.equal(afterCeres.side, 'sell');

    state.ui.dockedStationId = CERES;
    assert.ok(Math.abs(serviceUnitCr(state, 10, 'repair') - 10 * STATION_CONDITION_LAW.strike.serviceCostMult) < 1e-9, 'yard costlier');
    assert.equal(serviceUnitCr(state, 10), 10, 'a non-yard price is not touched');
    assert.equal(stationYardRateMult(state, CERES), STATION_CONDITION_LAW.strike.yardRateMult, 'yard slower');
    assert.equal(stationYardRateMult(state, HELIOS), 1);
    assert.match(stationConditionLine(state, CERES), /Crews are off the floor over what you did to their shift\./);

    state.player.hull = 40;
    state.player.hullMax = 100;
    const quote = serviceQuote('repair', state, state.entities.get(1));
    assert.ok(quote.chips.some((c) => /crews on strike/.test(c.text)), 'the quote names the strike');

    const rec = state.economy.stationConditions[CERES];
    state.simTime = rec.strikeUntil + 1;
    const expired = economy.quote(CERES, good, 'sell', 3);
    assert.equal(expired.standingPriceMultiplier, afterHelios.standingPriceMultiplier, 'the strike lapses on the clock');
    assert.equal(stationConditionsFor(state, CERES), null);
  });

  test(`strike: the crew's home stamp outranks proximity, and two kills must fall inside the window (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, emitted } = ctx;
    // Dying beside Ceres but stamped to Belt Outpost: it is Belt's shift.
    killCrew(ctx, { role: 'miner', data: { homeStationId: BELT } });
    killCrew(ctx, { role: 'ore_carrier', data: { homeStationId: BELT } });
    assert.equal(receiptsOf(emitted, 'station:strike')[0].stationId, BELT);
    assert.equal(stationConditionsFor(state, CERES), null);
    // Kills a window apart do not add up.
    const ctx2 = makeCtx(seed);
    killCrew(ctx2, { role: 'miner' });
    ctx2.state.simTime += STATION_CONDITION_LAW.strike.windowS + 1;
    killCrew(ctx2, { role: 'miner' });
    assert.equal(receiptsOf(ctx2.emitted, 'station:strike').length, 0);
  });

  test(`boom: a surplus-band ore flood makes that sector's yards cheaper for a day, others not (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus, emitted } = ctx;
    bus.emit('economy:oreFlood', { sectorId: 'sector_ceres_belt', pricePressure: -0.2, yieldU: 40, commodityId: 'cmdty_ore_iron' });
    const receipts = receiptsOf(emitted, 'station:boom');
    assert.deepEqual(receipts.map((r) => r.stationId), [CERES], 'only Ceres runs a yard or a pump in that sector');
    assert.equal(receipts[0].sectorId, 'sector_ceres_belt');
    assert.equal(stationConditionsFor(state, BELT), null);

    state.ui.dockedStationId = CERES;
    const base = SERVICE_PRICES.repairCrPerHp;
    assert.ok(Math.abs(serviceUnitCr(state, base, 'repair') - base * STATION_CONDITION_LAW.boom.serviceCostMult) < 1e-9);
    assert.ok(Math.abs(serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit, 'refuel') - SERVICE_PRICES.fuelCrPerUnit * STATION_CONDITION_LAW.boom.serviceCostMult) < 1e-9);
    state.ui.dockedStationId = HELIOS;
    assert.equal(serviceUnitCr(state, base, 'repair'), base, 'another berth is at list');
    assert.match(stationConditionLine(state, CERES), /The yard is flush/);

    state.ui.dockedStationId = CERES;
    state.player.hull = 40;
    state.player.hullMax = 100;
    assert.ok(serviceQuote('repair', state, state.entities.get(1)).chips.some((c) => /yard flush/.test(c.text)));

    state.simTime = state.economy.stationConditions[CERES].boomUntil + 1;
    assert.equal(serviceUnitCr(state, base, 'repair'), base, 'the boom ends on the clock');
  });

  test(`grudge: three slams in a day refuse the berth until the note is paid, then clear (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus, emitted } = ctx;
    const rec = recordOf(CERES);
    const fire = () => { state.simTime += DOCK_SLAM_LAW.relatchS + 1; bus.emit('combat:collisionConsequence', slam()); };
    fire();
    fire();
    assert.equal(receiptsOf(emitted, 'station:grudge').length, 0, 'two slams are an accident');
    assert.ok(stationBerthAdmits(rec, 0, state));
    fire();
    const grudges = receiptsOf(emitted, 'station:grudge');
    assert.equal(grudges.length, 1);
    assert.equal(grudges[0].stationId, CERES);
    assert.equal(grudges[0].slams, 3);
    assert.equal(state.player.debt, 450, 'three floor-priced fines on the note');

    assert.equal(stationBerthAdmits(rec, 0, state), false, 'berth refused');
    assert.deepEqual(stationBerthRefusal(rec, 0, state), {
      kind: 'structural', reason: 'grudge',
      text: 'Dock control: pay your note before you come through our ring again',
    });
    const deny = resolveDockDeny(state, CERES);
    assert.equal(deny.reason, 'grudge');
    assert.equal(deny.text, 'Dock control: pay your note before you come through our ring again');
    assert.ok(stationBerthAdmits(recordOf(HELIOS), 0, state), 'another berth still admits');
    assert.equal(resolveDockDeny(state, HELIOS), null);
    assert.match(stationConditionLine(state, CERES), /Pay your note before you come through our ring again\./);

    // A fourth slam deepens the grudge without a second receipt.
    fire();
    assert.equal(receiptsOf(emitted, 'station:grudge').length, 1);
    assert.equal(state.economy.stationConditions[CERES].grudge.slams, 4);
    assert.equal(state.player.debt, 600);

    // Pay it down — at another berth — a part payment is not enough, the whole fines are.
    state.player.credits = 10000;
    state.ui.dockedStationId = HELIOS;
    state.ui.docked = true;
    bus.emit('ui:service', { type: 'settle', amount: 100 });
    assert.equal(state.player.debt, 500);
    assert.equal(stationBerthAdmits(rec, 0, state), false, 'still owed');
    assert.equal(receiptsOf(emitted, 'station:grudgeCleared').length, 0);
    bus.emit('ui:service', { type: 'settle' });
    assert.equal(state.player.debt, 0);
    assert.equal(stationBerthAdmits(rec, 0, state), true, 'note paid, berth reopens');
    assert.equal(resolveDockDeny(state, CERES), null);
    const cleared = receiptsOf(emitted, 'station:grudgeCleared');
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].stationId, CERES);
    assert.equal(state.economy.stationConditions && state.economy.stationConditions[CERES] && state.economy.stationConditions[CERES].grudge, undefined);
  });

  test(`grudge: the note is paid back to where it stood before the slams, not to zero (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus, emitted } = ctx;
    state.player.debt = 1000; // an honest loan from before
    for (let i = 0; i < 3; i++) { state.simTime += DOCK_SLAM_LAW.relatchS + 1; bus.emit('combat:collisionConsequence', slam()); }
    assert.equal(receiptsOf(emitted, 'station:grudge')[0].untilPaidCr, 1000);
    assert.equal(stationBerthAdmits(recordOf(CERES), 0, state), false);
    bus.emit('economy:releaseDebt', { amount: 449 });
    assert.equal(stationBerthAdmits(recordOf(CERES), 0, state), false, 'one credit short of the fines');
    bus.emit('economy:releaseDebt', { amount: 1 });
    assert.equal(stationBerthAdmits(recordOf(CERES), 0, state), true);
    assert.equal(receiptsOf(emitted, 'station:grudgeCleared').length, 1);
    // Slams a day apart never arm one.
    const ctx2 = makeCtx(seed);
    for (let i = 0; i < 4; i++) { ctx2.state.simTime += STATION_CONDITION_LAW.grudge.windowS / 2 + 1; ctx2.bus.emit('combat:collisionConsequence', slam()); }
    assert.equal(receiptsOf(ctx2.emitted, 'station:grudge').length, 0);
    assert.equal(stationBerthAdmits(recordOf(CERES), 0, ctx2.state), true);
  });

  test(`blockade: a live war front on the berth's sector derives dear goods and rationed fuel — nothing stored (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus, emitted } = ctx;
    state.world.currentSectorId = 'sector_helios_prime';
    const good = tradedCommodity(HELIOS, CERES);
    state.conflicts = { 'faction_reach:faction_scn': { state: 'tense', tension: 0.5 } };
    assert.equal(stationConditionsFor(state, HELIOS), null, 'a tense front is pickets, not a blockade');
    const calm = economy.quote(HELIOS, good, 'buy', 2);

    state.conflicts = { 'faction_reach:faction_scn': { state: 'war', tension: 0.9 } };
    const live = stationConditionsFor(state, HELIOS);
    assert.ok(live && live.blockade, 'war on Helios Prime blockades Helios');
    assert.equal(live.blockade.pairKey, 'faction_reach:faction_scn');
    assert.equal(stationConditionsFor(state, CERES), null, 'a berth on another lane is not blockaded');
    assert.equal(state.economy.stationConditions, undefined, 'derived: no stored condition');
    const war = economy.quote(HELIOS, good, 'buy', 2);
    assert.ok(Math.abs(war.unitAvg / calm.unitAvg - STATION_CONDITION_LAW.blockade.buyMult) < 1e-9, 'goods run dear');

    const fuel = { current: 20, max: 100 };
    assert.equal(stationRefuelRation(state, HELIOS, fuel), 40, 'the pumps fill to 60%');
    assert.equal(stationRefuelRation(state, CERES, fuel), Infinity);
    state.fuel = { current: 20, max: 100 };
    state.ui.dockedStationId = HELIOS;
    state.player.credits = 5000;
    bus.emit('ui:service', { type: 'refuel' });
    assert.ok(state.fuel.current <= 60, `rationed to 60% (tank ${state.fuel.current})`);
    state.fuel.current = 70;
    const rationed = serviceQuote('refuel', state, state.entities.get(1));
    assert.equal(rationed.disabled, true);
    assert.ok(rationed.chips.some((c) => /rationed/.test(c.text)));

    bus.emit('dock:docked', { stationId: HELIOS });
    const receipts = receiptsOf(emitted, 'station:blockade');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].stationId, HELIOS);
    assert.match(stationConditionLine(state, HELIOS), /^Dock control, Helios Station: Blockade — the .+ front is on this lane/);
    assert.ok(receiptsOf(emitted, 'toast').some((t) => /Blockade/.test(t.text)), 'the dock line speaks');
    bus.emit('dock:docked', { stationId: HELIOS });
    assert.equal(receiptsOf(emitted, 'station:blockade').length, 1, 'one receipt per front, not per dock');

    state.conflicts = {};
    assert.equal(stationConditionsFor(state, HELIOS), null, 'the front cools, the blockade lifts');
  });

  test(`save round-trip keeps live conditions and drops expired ones (seed ${seed})`, () => {
    const ctx = makeCtx(seed);
    const { state, bus } = ctx;
    bus.emit('combat:collisionConsequence', slam());                       // outage at Ceres
    killCrew(ctx, { role: 'miner', data: { homeStationId: BELT } });       // strike at Belt
    killCrew(ctx, { role: 'miner', data: { homeStationId: BELT } });
    bus.emit('economy:oreFlood', { sectorId: 'sector_helios_prime', pricePressure: -0.3, yieldU: 60 }); // boom at Helios
    for (let i = 0; i < 3; i++) { state.simTime += DOCK_SLAM_LAW.relatchS + 1; bus.emit('combat:collisionConsequence', slam()); } // grudge at Ceres

    const chunk = JSON.parse(JSON.stringify(economy.serialize()));
    assert.ok(chunk.stationOutages[CERES], 'the C6 chunk shape is kept');
    assert.ok(chunk.stationConditions[BELT].strikeUntil > state.simTime);
    assert.ok(chunk.stationConditions[HELIOS].boomUntil > state.simTime);
    assert.equal(chunk.stationConditions[CERES].grudge.slams, 4, 'the outage slam counts: four in a day');
    assert.equal(chunk.stationConditions[CERES].outageRepairUntil, undefined, 'outage rides its own chunk, not twice');

    const fresh = makeCtx(seed);
    fresh.state.simTime = state.simTime;
    fresh.state.player.debt = state.player.debt;
    economy.deserialize(chunk);
    const f = fresh.state;
    assert.ok(stationConditionsFor(f, CERES).outage, 'outage restored');
    assert.ok(stationConditionsFor(f, CERES).grudge, 'grudge restored while the note stands');
    assert.ok(stationConditionsFor(f, BELT).strike, 'strike restored');
    assert.ok(stationConditionsFor(f, HELIOS).boom, 'boom restored');

    // A paid-down note does not travel as a grudge.
    f.player.debt = 0;
    assert.equal(economy.serialize().stationConditions[CERES], undefined, 'a paid grudge is not saved');

    // The clock drops everything else.
    f.simTime = state.simTime + 2000;
    f.player.debt = state.player.debt;
    const later = economy.serialize();
    assert.equal(later.stationOutages, undefined);
    assert.ok(later.stationConditions && later.stationConditions[CERES].grudge, 'only the note-bound grudge outlives the clock');
    assert.equal(later.stationConditions[BELT], undefined);
    assert.equal(later.stationConditions[HELIOS], undefined);
    f.player.debt = 0;
    const none = economy.serialize();
    assert.equal(none.stationConditions, undefined);
    assert.equal(none.stationOutages, undefined);
  });
}
