// A2: moral traps are about the ACTUAL cargo and leave a memory.
//   • a trap whose family contradicts the hold can no longer attach (air_is_owed cannot lie
//     about iron ore; the arms lie requires a military hold; counterfeit requires relief);
//   • the reveal lands when the route gives it weight — same-sector runs speak a short
//     interval after undock (never at the umbilical), cross-sector runs at the sector crossing;
//   • resolving a fork writes exactly one pending story.moralMemory.debts record through the
//     EXISTING moralMemory owner (zero before this unit).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { MORAL_TRAPS, trapFitsCargoFamily } from '../src/data/moralTraps.js';
import { COMMODITY_MORAL_TAGS } from '../src/data/commodityMoralTags.js';
import { missions } from '../src/systems/missions.js';
import { attachTrap, moralTrapSystem } from '../src/systems/moralTrap.js';
import { ensureMoralMemory } from '../src/systems/moralMemory.js';

const SEED = 4242;
const NON_HELIOS_STATIONS = Object.freeze([
  'station_beltout',
  'station_forge',
  'station_veil',
  'station_smuggler',
  'station_coalition',
  'station_tethys',
]);

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [missions, moralTrapSystem],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  return { sim, state, missionsSys: sim.registry.get('missions'), trapSys: sim.registry.get('moralTrap') };
}

test('family fit: each cargo trap answers only its own moral family', () => {
  // arms-class lie requires a military hold
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.cargo_is_weapons, 'cmdty_weapons'), true);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.cargo_is_weapons, 'cmdty_food'), false);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.cargo_is_weapons, 'cmdty_narcotics'), false);
  // counterfeit requires humanitarian relief in the hold
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.medicine_is_counterfeit, 'cmdty_medical'), true);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.medicine_is_counterfeit, 'cmdty_refined_metals'), false);
  // stolen relief air is a contraband-class lie
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.air_is_owed, 'cmdty_stolen_goods'), true);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.air_is_owed, 'cmdty_ore_iron'), false);
  // the grave lie is about INDUSTRIAL cargo (refined/alloys/polymers/fuel cells)
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.ore_is_mass_grave, 'cmdty_refined_metals'), true);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.ore_is_mass_grave, 'cmdty_medical'), false);
  // raw ore is amoral cargo — no family gate opens for it
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.ore_is_mass_grave, 'cmdty_ore_iron'), false);
  // a person is not a commodity: the passenger trap is never family-gated
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.passenger_is_fugitive, null), true);
  assert.equal(trapFitsCargoFamily(MORAL_TRAPS.passenger_is_fugitive, 'cmdty_ore_iron'), true);
  // the tags map is the single source of truth the gate reads
  assert.equal(COMMODITY_MORAL_TAGS.cmdty_ore_iron, undefined, 'raw ore is amoral cargo');
});

test('attachTrap picks by the actual hold: a contradicting trap can never be chosen', () => {
  const mk = (id, type, cmdtyId, destSectorId) => ({
    id, type, stationId: 'station_forge', destSectorId,
    params: { cmdtyId, qty: 6 },
  });
  const cases = [
    { offer: mk('o_food_c', 'cargo_delivery', 'cmdty_food', 'sector_ceres_belt'), only: 'medicine_is_counterfeit' },
    { offer: mk('o_med_c', 'cargo_delivery', 'cmdty_medical', 'sector_ceres_belt'), only: 'medicine_is_counterfeit' },
    { offer: mk('o_ref_c', 'cargo_delivery', 'cmdty_refined_metals', 'sector_ceres_belt'), only: 'ore_is_mass_grave' },
    { offer: mk('o_weap_s', 'smuggling_run', 'cmdty_weapons', 'sector_ceres_belt'), only: 'cargo_is_weapons' },
    { offer: mk('o_narc_s', 'smuggling_run', 'cmdty_narcotics', 'sector_ceres_belt'), only: 'air_is_owed' },
  ];
  for (const { offer, only } of cases) {
    let attached = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const stamped = attachTrap(offer, seed);
      if (!stamped.trap) continue;
      assert.equal(stamped.trap.id, only,
        `${offer.params.cmdtyId} hold can only pull ${only}, got ${stamped.trap.id}`);
      attached += 1;
    }
    assert.ok(attached > 0, `the ${offer.params.cmdtyId} case actually attached (${attached})`);
  }
  // An untagged (amoral) hold — raw ore, silicate — cannot pull any cargo-family lie at all.
  for (const amoralId of ['cmdty_ore_iron', 'cmdty_silicate']) {
    const amoral = mk(`o_amoral_${amoralId}`, 'cargo_delivery', amoralId, 'sector_ceres_belt');
    let untagged = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (attachTrap(amoral, seed).trap) untagged += 1;
    }
    assert.equal(untagged, 0, `${amoralId} stays trap-free across every seed`);
  }
});

test('seed-4242 boards: every attached cargo trap matches the hauled family', () => {
  const h = boot(SEED);
  let trapped = 0;
  let familyGated = 0;
  const kinds = new Set();
  for (const stationId of NON_HELIOS_STATIONS) {
    for (let epoch = 0; epoch < 16; epoch += 1) {
      h.state.simTime = epoch * 600;
      const board = h.missionsSys.ensureBoard(stationId);
      for (const offer of (board && Array.isArray(board.slots)) ? board.slots : []) {
        if (!offer || !offer.trap) continue;
        trapped += 1;
        kinds.add(offer.trap.id);
        const def = MORAL_TRAPS[offer.trap.id];
        if (!def || !def.needsCargoFamily) continue;
        familyGated += 1;
        const family = COMMODITY_MORAL_TAGS[offer.params && offer.params.cmdtyId] || null;
        assert.equal(family, def.needsCargoFamily,
          `${offer.trap.id} on ${offer.id} must match the hold family`);
      }
    }
  }
  assert.ok(trapped > 0, 'traps still reach boards after the gate');
  assert.ok(familyGated > 0, `family-gated traps actually attach (${familyGated}/${trapped})`);
  assert.ok(kinds.size >= 2, 'more than one trap kind survives the gate');
  console.log(`[moral-trap-family-memory] seed ${SEED}: ${trapped} traps across 96 boards, ` +
    `${familyGated} family-gated (kinds: ${[...kinds].sort().join(', ')})`);
});

function stampedMissionFor(h, offerShell) {
  // Sweep seeds until the 18% roll attaches, then hand the stamped overlay to a live mission.
  for (let seed = 0; seed < 500; seed += 1) {
    const stamped = attachTrap(offerShell, seed);
    if (stamped.trap) return stamped.trap;
  }
  return null;
}

test('same-sector run: undock schedules, never speaks at the umbilical; the delay lands the fork', () => {
  const h = boot(SEED);
  const trap = stampedMissionFor(h, {
    id: 'o_same_sector', type: 'cargo_delivery', stationId: 'station_forge',
    destSectorId: 'sector_vesta_forge', params: { cmdtyId: 'cmdty_refined_metals', qty: 6 },
  });
  assert.ok(trap, 'the same-sector probe attached a trap');
  assert.equal(trap.revealCue, 'undock_delayed', 'same-sector topology stamps the undock cue');
  const mission = {
    id: 'm_same', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: { cmdtyId: 'cmdty_ore_iron', qty: 6 }, trap,
  };
  h.state.missions.active.push(mission);
  h.state.simTime = 100;
  let revealed = 0;
  h.sim.bus.on('moralTrap:revealed', () => { revealed += 1; });

  h.sim.bus.emit('dock:undocked', {});
  assert.equal(revealed, 0, 'the fork does not speak at the umbilical');
  assert.equal(mission._trapRevealAt, 130, 'the reveal is scheduled a short interval out');

  h.state.simTime = 129;
  h.trapSys.update(0.5, h.state);
  assert.equal(revealed, 0, 'the fork waits out the delay');

  h.state.simTime = 131;
  h.trapSys.update(0.5, h.state);
  assert.equal(revealed, 1, 'the fork lands mid-lane once the delay elapses');
  assert.equal(mission._trapRevealed, true);
});

test('cross-sector run: undock is silent, the sector crossing reveals', () => {
  const h = boot(SEED);
  const trap = stampedMissionFor(h, {
    id: 'o_cross_sector', type: 'smuggling_run', stationId: 'station_forge',
    destSectorId: 'sector_ceres_belt', params: { cmdtyId: 'cmdty_narcotics', qty: 6 },
  });
  assert.ok(trap, 'the cross-sector probe attached a trap');
  assert.equal(trap.revealCue, 'sector_enter', 'cross-sector topology stamps the crossing cue');
  const mission = {
    id: 'm_cross', type: 'smuggling_run', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: { cmdtyId: 'cmdty_narcotics', qty: 6 }, trap,
  };
  h.state.missions.active.push(mission);
  let revealed = 0;
  h.sim.bus.on('moralTrap:revealed', () => { revealed += 1; });

  h.sim.bus.emit('dock:undocked', {});
  assert.equal(revealed, 0, 'undock does not fire a cross-sector fork');
  assert.equal(mission._trapRevealAt, undefined, 'and does not schedule one either');

  h.sim.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(revealed, 1, 'the destination-sector crossing carries the reveal');
  assert.equal(mission._trapRevealed, true);
});

test('resolving a divert choice writes exactly one pending moralMemory debt — zero before', () => {
  const h = boot(SEED);
  const mission = {
    id: 'm_divert', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: { cmdtyId: 'cmdty_weapons', qty: 6 },
    trap: MORAL_TRAPS.cargo_is_weapons,
  };
  h.state.missions.active.push(mission);
  assert.equal(Object.keys(ensureMoralMemory(h.state).debts).length, 0,
    'no debt exists before the fork is answered');

  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'divert' });
  const memory = ensureMoralMemory(h.state);
  const ids = Object.keys(memory.debts);
  assert.equal(ids.length, 1, 'exactly one debt record is written');
  const debt = memory.debts[ids[0]];
  assert.equal(debt.id, 'moralTrap:m_divert');
  assert.equal(debt.status, 'pending', 'the record is a pending debt the readers can surface');
  assert.equal(debt.disposition, 'vengeful', 'the double-crossed counterparty remembers');
  assert.ok(debt.cause.includes('cargo_is_weapons') && debt.cause.includes('divert'));
  assert.ok(debt.name && debt.name !== 'moralTrap:m_divert', 'the counterparty has a person name');

  // A duplicated choose event cannot write a second record.
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'divert' });
  assert.equal(Object.keys(ensureMoralMemory(h.state).debts).length, 1);

  // The honor branch of a second trap keeps its counterparty kindly, as its own record.
  const honor = {
    id: 'm_honor', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: { cmdtyId: 'cmdty_weapons', qty: 6 },
    trap: MORAL_TRAPS.cargo_is_weapons,
  };
  h.state.missions.active.push(honor);
  h.sim.bus.emit('moralTrap:choose', { missionId: honor.id, optionId: 'deliver' });
  const after = ensureMoralMemory(h.state);
  assert.equal(Object.keys(after.debts).length, 2, 'each resolved trap leaves its own person');
  assert.equal(after.debts['moralTrap:m_honor'].disposition, 'ally',
    'keeping the deal is remembered kindly');
  assert.equal(after.debts['moralTrap:m_honor'].status, 'pending');
});

test('the passenger fugitive fork leaves the NAMED passenger as the debt', () => {
  const h = boot(SEED);
  const mission = {
    id: 'm_fugitive', type: 'passenger_transport', stationId: 'station_tethys',
    status: 'active', reward_cr: 1200,
    params: { passengers: 1, passenger: { name: 'Mira Falken', why: 'Family question at the dock.' } },
    trap: MORAL_TRAPS.passenger_is_fugitive,
  };
  h.state.missions.active.push(mission);
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'turn_in' });
  const debt = ensureMoralMemory(h.state).debts['moralTrap:m_fugitive'];
  assert.ok(debt, 'the fork leaves a record');
  assert.equal(debt.name, 'Mira Falken', 'the debt is the person the run made real');
  assert.equal(debt.status, 'pending');
});
