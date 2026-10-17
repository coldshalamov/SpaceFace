import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { missions } from '../src/systems/missions.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';
const GOODS = 'cmdty_ore_iron';
const UNIT = COMMODITIES.find((good) => good.id === GOODS).basePrice;

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity, factions, economy, heat, cargo, custodyConsequences, missions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.credits = 5000;
  state.story.beatIndex = 7;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8 });
  state.playerId = player.id;
  sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 140, z: 0 }, hull: 80, hullMax: 80,
    data: { ai: { lawful: true } } });
  return { sim, state, bus, law: sim.registry.get('lawSecurity'), jobs: sim.registry.get('missions') };
}

function incident(h, name = 'Ivo Pell', discovered = false) {
  const pos = { x: discovered ? 5000 : 80, z: 0 };
  const victim = h.sim.spawn({ type: 'ship', team: 2, factionId: 'faction_free', pos,
    hull: 40, hullMax: 40, radius: 8,
    data: { name, shipClass: 'fighter', cargo: { [GOODS]: 10 }, ai: { archetype: 'fleeing_trader' } } });
  h.bus.emit('entity:killed', { id: victim.id, killerId: h.state.playerId, type: 'ship', pos,
    victimClass: 'fighter', factionId: victim.factionId, factionLawful: false, targetHostileToPlayer: false,
    presentation: { cause: 'kinetic', playerCaused: true } });
  if (discovered) {
    assert.equal(h.law.composedDisposition().some((row) => row.forPerson === name), false);
    h.law.deserialize(JSON.parse(JSON.stringify(h.law.serialize())));
    const markerId = `m13:wreck:${victim.id}`;
    h.state.aftermathWrecks = { bySector: { [SECTOR]: [{
      markerId, sectorId: SECTOR, victimId: victim.id, killerId: h.state.playerId, pos, tick: h.state.tick,
    }] } };
    h.bus.emit('scan:wreckResolved', { wreckId: victim.id, markerId, pos });
  }
  const bill = h.law.composedDisposition().find((row) => row.kind === 'restitution' && row.forPerson === name);
  assert.ok(bill, 'a witnessed real cargo incident must open the named bill');
  return bill;
}

function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.bus.emit('dock:docked', { stationId: STATION });
}

function acceptRecovery(h) {
  const offer = h.state.missions.boards[STATION]?.slots.find((row) => row.source === 'custodyRecovery' && row.title.includes('Ivo Pell'));
  assert.ok(offer, 'the damaged party posts through the ordinary board');
  assert.match(offer.summary, /original lots.*legitimate replacements.*partial deliveries/i);
  assert.equal(offer.preloadedCargo, false);
  assert.equal(h.jobs.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((m) => m.source === 'custodyRecovery');
  assert.ok(mission);
  return mission;
}

function recover(h, qty) {
  const pod = spawnJettisonedCargoPod(h.state, {
    commodityId: GOODS, amount: qty, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
  }, h.sim.helpers);
  assert.ok(pod);
  const pickup = { pickupId: pod.id, collectorId: h.state.playerId, kind: 'cargo', commodityId: GOODS, amount: qty };
  h.bus.emit('pickup:collected', pickup);
  assert.equal(pickup.acceptedAmount, qty);
  pod.alive = false;
}

test('M13 seed 4242: recover or replace a real billed incident; partial/duplicate returns settle only their named portion', () => {
  const h = boot();
  try {
    const bill = incident(h);
    const other = incident(h, 'Nia Voss');
    const loss = h.state.factions.faction_free.causeLosses.find((entry) => entry.causeId === bill.causeId);
    const repBefore = h.state.factions.faction_free.rep;
    const heatBefore = h.state.player.heat;
    const creditsBefore = h.state.player.credits;
    dock(h);
    const first = acceptRecovery(h);
    recover(h, 4);
    dock(h);
    assert.equal(h.law.restitutionFor(bill.causeId).remainingCr, UNIT * 6);
    assert.equal(h.law.restitutionFor(other.causeId).remainingCr, UNIT * 10);
    assert.equal(h.state.player.cargo.items[GOODS] || 0, 0);
    assert.equal(h.state.player.credits, creditsBefore, 'restitution returns goods, never a reward or another debit');
    assert.equal(loss.settled, false);
    assert.equal(h.state.factions.faction_free.rep, repBefore);
    h.bus.emit('cargo:delivered', { missionId: first.id, commodityId: GOODS, qty: 4, stationId: STATION });
    assert.equal(h.law.restitutionFor(bill.causeId).remainingCr, UNIT * 6, 'a replay cannot credit twice');

    // Both owners serialize their real state: Continue preserves exact partial progress.
    const law = h.law.serialize();
    const player = JSON.parse(JSON.stringify(h.state.player));
    h.law.deserialize(JSON.parse(JSON.stringify(law)));
    h.state.player = player;
    dock(h);
    acceptRecovery(h);
    const purchase = h.sim.registry.get('economy').execute(STATION, GOODS, 'buy', 6);
    assert.equal(purchase.ok, true, JSON.stringify(purchase));
    assert.ok(h.state.player.credits < creditsBefore, 'replacements cost real money at the ordinary market');
    dock(h);
    assert.equal(h.law.restitutionFor(bill.causeId).status, 'paid');
    assert.equal(h.law.restitutionFor(other.causeId).status, 'open');
    assert.equal(h.state.factions.faction_free.causeLosses.find((entry) => entry.causeId === bill.causeId).settled, true);
    assert.equal(h.state.factions.faction_free.causeLosses.find((entry) => entry.causeId === other.causeId).settled, false);
    assert.equal(h.state.player.heat, heatBefore, 'a restitution job does not pardon heat');
  } finally { h.sim.dispose(); }
});

test('M13 seed 4242: decline and abort preserve payment; paying during recovery does not consume goods again', () => {
  const h = boot();
  try {
    const bill = incident(h);
    dock(h);
    assert.equal(h.state.missions.active.length, 0, 'a board offer is optional');
    assert.equal(h.law.restitutionFor(bill.causeId).remainingCr, UNIT * 10);
    h.state.player.cargo.capVolume = 2 * COMMODITIES.find((good) => good.id === GOODS).volPerU;
    const mission = acceptRecovery(h);
    assert.equal(h.jobs.abandonMission(mission.id), true);
    assert.equal(h.law.restitutionFor(bill.causeId).status, 'open');
    assert.equal(h.state.missions.active.length, 0, 'aborting does not auto-accept a replacement debt');
    dock(h);
    acceptRecovery(h);
    recover(h, 2);
    assert.equal(h.law.payComposedObligation({ kind: 'restitution', causeId: bill.causeId }).accepted, true);
    const credits = h.state.player.credits;
    dock(h);
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.state.player.cargo.items[GOODS], 2, 'a paid bill cannot draw a stale job cargo');
    assert.equal(h.state.missions.active.filter((m) => m.source === 'custodyRecovery').length, 0);
  } finally { h.sim.dispose(); }
});

test('M13 seed 4242: a saved unwitnessed incident still offers recovery when its wreck is discovered', () => {
  const h = boot();
  try {
    const bill = incident(h, 'Ivo Pell', true);
    assert.equal(bill.recovery.lines[0].qty, 10);
    assert.equal(bill.recovery.pos.x, 5000);
    dock(h);
    acceptRecovery(h);
  } finally { h.sim.dispose(); }
});
