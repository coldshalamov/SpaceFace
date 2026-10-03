// SF-122 — rammer-truck that makes cargo a decision.
//
// The packet's promise: a loaded Mule with a Ram Plate is a real collision role — the hold
// is part of the weapon — while visibly paying maneuverability for the mass, and the cargo
// aboard is never free ballast: a hard impact can still crack it and spill it into space.
//
// Every assertion runs against the live owners, not a staged copy:
//   ships.js getDerivedStats          cargo mass -> operational mass -> turn/propulsion
//   collisionConsequences.js          derived.ramDamageDealtMult -> craft-damage multiplier
//   combat/impulseKernel.js           the same consequence law the solver drives
//   systems/fragileCargo.js           hard-hit cracking, removal through cargo's writer,
//                                     half spilled as physical pods on a seeded scatter
//   data/synergies.js                 the authored rammer_truck tell
//   systems/shipCapabilities.js       the fit screen's own words for the same numbers
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import { playerRamPlateImpact } from '../src/systems/collisionConsequences.js';
import {
  resolveCollisionConsequence,
  COLLISION_CONSEQUENCE_LIMITS,
} from '../src/combat/impulseKernel.js';
import {
  applyFragileCargoImpact,
  fragileImpactLossFraction,
  isFragileCommodity,
  planFragileCargoLoss,
  FRAGILE_CARGO_HARD_DELTA_V,
  FRAGILE_CARGO_SPILL_TTL_S,
} from '../src/systems/fragileCargo.js';
import { synergiesForFittings, explainSynergy, synergyById } from '../src/data/synergies.js';
import {
  estimateAtCargoBasis,
  shipCapabilityVerbs,
  turnRecordText,
} from '../src/systems/shipCapabilities.js';

// ship_mule slot order (buildSlotList): 0 weapon/S, 1 shield/M, 2 engine/M,
// 3-5 cargo/M x3, 6 utility/S, 7 thruster/S.
const MULE = 'ship_mule';
const ENGINE = 'mod_engine_fusion_m';

function muleFit(overrides = {}) {
  const fittings = new Array(8).fill(null);
  fittings[2] = ENGINE;
  for (const [index, id] of Object.entries(overrides)) fittings[Number(index)] = id;
  return fittings;
}

const RAMMER_FIT = muleFit({ 3: 'mod_cargo_pod_m', 6: 'mod_ram_plate' });
const HAULER_FIT = muleFit({ 3: 'mod_cargo_pod_m' });
const BARE_FIT = muleFit();

function playerWithCargoMass(usedMass) {
  return { id: 'player', isPlayer: true, cargo: { usedMass } };
}

function directContactProvenance(actorId, tick) {
  return { actorId, weaponId: null, tag: 'direct_contact', appliedTick: tick };
}

function craftTarget(id = 9, mass = 20) {
  return { id, type: 'ship', mass, alive: true };
}

function craftOther(id = 'player', mass = 60) {
  return { id, type: 'ship', mass, alive: true };
}

test('cargo mass is real mass: a loaded hold moves the same physics the plate swings', () => {
  const empty = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(0));
  const loaded = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(400));
  assert.equal(empty.cargoMass, 0);
  assert.equal(loaded.cargoMass, 400);
  // Every tonne aboard lands on operational mass one for one — no hidden offset.
  assert.ok(Math.abs(loaded.operationalMass - (empty.operationalMass + 400)) < 1e-9);
  // The cost is visible in the live numbers, not a tooltip: turn rate and thrust both fall.
  assert.ok(loaded.turnRate < empty.turnRate,
    `loaded turn ${loaded.turnRate} must be below empty ${empty.turnRate}`);
  assert.ok(loaded.propulsion.mainAccel < empty.propulsion.mainAccel,
    'a full hold accelerates slower on the same drive');
  // And the pod itself is mass even before anything is loaded into it.
  const bare = getDerivedStats(MULE, BARE_FIT, playerWithCargoMass(0));
  const podded = getDerivedStats(MULE, HAULER_FIT, playerWithCargoMass(0));
  assert.ok(podded.dryMass > bare.dryMass, 'the pod weighs something empty');
  assert.ok(podded.cargoCap > bare.cargoCap, 'the pod is where the capacity comes from');
});

test('the fit screen says the same thing in words: loaded hold, worse turn', () => {
  const empty = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(0));
  const loaded = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(400));
  assert.match(turnRecordText(empty), /empty hold/);
  assert.match(turnRecordText(loaded), /cargo aboard/);
  // The row prints the real rate: the loaded-hold number the player reads is the dropped one.
  const emptyRate = Number(turnRecordText(empty).split(' ')[0]);
  const loadedRate = Number(turnRecordText(loaded).split(' ')[0]);
  assert.ok(loadedRate < emptyRate, `printed turn ${loadedRate} under load must be below ${emptyRate} empty`);
  const estimate = estimateAtCargoBasis({ derived: loaded, basis: 'current', fittings: RAMMER_FIT });
  assert.equal(estimate.basis, 'current');
  assert.match(estimate.sentence, /With the cargo aboard, the turn radius at fight speed is \d+ m/);
  const emptyEstimate = estimateAtCargoBasis({ derived: empty, basis: 'current', fittings: RAMMER_FIT });
  assert.ok(estimate.turnRate < emptyEstimate.turnRate,
    'the same estimate object carries the visibly worse turn');
});

test('a ram plate turns the contact into a weapon only while the plate is fitted', () => {
  const player = playerWithCargoMass(400);
  const rammer = { id: 'player', type: 'ship', data: { derived: getDerivedStats(MULE, RAMMER_FIT, player) } };
  const hauler = { id: 'player', type: 'ship', data: { derived: getDerivedStats(MULE, HAULER_FIT, player) } };
  const prov = directContactProvenance('player', 42);
  const hit = playerRamPlateImpact(rammer, 'player', 42, prov, { playerId: 'player' });
  assert.ok(hit, 'a fitted plate must claim its direct contact');
  assert.ok(hit.damageMultiplier > 1, 'the plate multiplies the hit, it does not rename it');
  assert.equal(hit.provenance.weaponId, 'mod_ram_plate');
  assert.equal(hit.provenance.tag, 'ram_plate');
  // Removal path: take the plate off and the same contact is just a hull hitting a hull.
  assert.equal(playerRamPlateImpact(hauler, 'player', 42, prov, { playerId: 'player' }), null);
  // And the plate never claims a contact the physics did not attribute to the player.
  const alien = directContactProvenance(77, 42);
  assert.equal(playerRamPlateImpact(rammer, 'player', 42, alien, { playerId: 'player' }), null);
});

test('direct ram and glancing scrape are different physics, and the plate multiplies only the real hit', () => {
  const mult = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(400)).ramDamageDealtMult;
  assert.ok(mult > 1, 'derived block publishes the plate multiplier the consequence path reads');
  // The consequence receipt in-game carries the plate's own provenance — that tag is what
  // lets a real ram take the helm, where a helm-neutral bump never does.
  const ramProv = { actorId: 'player', weaponId: 'mod_ram_plate', tag: 'ram_plate', appliedTick: 10 };
  const direct = resolveCollisionConsequence({
    tick: 10,
    target: craftTarget(9, 20),
    other: craftOther('player', 60),
    exchangedMomentum: 40 * 20,
    preSolveClosingSpeed: 40,
    craftDamageMultiplier: mult,
    provenance: ramProv,
  });
  const glancing = resolveCollisionConsequence({
    tick: 10,
    target: craftTarget(9, 20),
    other: craftOther('player', 60),
    exchangedMomentum: 12 * 20,
    preSolveClosingSpeed: 12,
    craftDamageMultiplier: mult,
    provenance: ramProv,
  });
  assert.ok(direct, 'a committed ram must produce a consequence');
  assert.ok(glancing, 'a scrape still registers');
  assert.equal(direct.control, 'tumble', 'a 40 WU/s ram knocks the helm away');
  assert.equal(glancing.control, 'stagger', 'a lighter clip staggers instead of tumbling');
  assert.ok(direct.impactDamage > glancing.impactDamage * 4,
    `direct ${direct.impactDamage} must dwarf glancing ${glancing.impactDamage}`);
  const directBare = resolveCollisionConsequence({
    tick: 10,
    target: craftTarget(9, 20),
    other: craftOther('player', 60),
    exchangedMomentum: 40 * 20,
    preSolveClosingSpeed: 40,
    craftDamageMultiplier: 1,
    provenance: ramProv,
  });
  assert.ok(direct.impactDamage > directBare.impactDamage * 1.5,
    'the plate multiplier lands on the same kernel output the solver writes');
  // A feather touch below the consequence floor is honestly nothing.
  const brush = resolveCollisionConsequence({
    tick: 10,
    target: craftTarget(9, 20),
    other: craftOther('player', 60),
    exchangedMomentum: COLLISION_CONSEQUENCE_LIMITS.minMomentum * 0.5,
    preSolveClosingSpeed: 0.5,
  });
  assert.equal(brush, null);
});

function fragileState(cargoItems, playerPos = { x: 0, z: 0 }) {
  const spawned = [];
  const player = { id: 'player', type: 'ship', pos: playerPos, vel: { x: 10, z: 0 }, radius: 12 };
  const entities = new Map([[player.id, player]]);
  const state = {
    playerId: 'player',
    entities,
    simTime: 100,
    tick: 60,
    meta: { seed: 7 },
    player: {
      cargo: { items: { ...cargoItems }, capVolume: 1600, usedVolume: 0, usedMass: 0 },
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const pod = { id: `pod_${spawned.length}`, alive: true, ...spec };
      spawned.push(pod);
      entities.set(pod.id, pod);
      return pod;
    },
  };
  return { state, helpers, spawned };
}

test('the cargo in the weapon can still break: hard hit cracks fragile stacks through cargo', () => {
  assert.ok(isFragileCommodity('cmdty_luxury_goods'), 'luxury goods are the fragile stack');
  const { state, helpers, spawned } = fragileState({ cmdty_luxury_goods: 20, cmdty_ore_iron: 30 });
  // A glancing bump below the hard-hit floor cracks nothing.
  const soft = applyFragileCargoImpact(
    state,
    { playerInvolved: true, playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V - 4, simTime: state.simTime, tick: state.tick, aId: 'player', bId: 9 },
    { helpers },
  );
  assert.equal(soft, null, 'a gentle scrape never cracks the hold');
  assert.equal(state.player.cargo.items.cmdty_luxury_goods, 20);
  // The ram hit the packet describes: well over the fragile threshold.
  const payload = {
    playerInvolved: true, playerDeltaV: 40, simTime: state.simTime, tick: state.tick,
    aId: 'player', bId: 9, dp: 0.95,
  };
  const plan = planFragileCargoLoss(state, payload);
  assert.ok(plan.fraction > 0.05, 'a committed ram cracks a real share of the fragile stack');
  assert.equal(plan.losses.length, 1);
  assert.equal(plan.losses[0].commodityId, 'cmdty_luxury_goods');
  const receipt = applyFragileCargoImpact(state, payload, { helpers });
  assert.ok(receipt, 'the hard hit must write a loss receipt');
  const remaining = state.player.cargo.items.cmdty_luxury_goods;
  assert.ok(remaining < 20 && remaining > 0, 'some of the stack survived the hit');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 30, 'ordinary ore does not bruise');
  // Half the cracked units spill as physical pods — recoverable, on a seeded scatter, on a TTL.
  assert.ok(receipt.totalSpilledQty > 0, 'the spill is real cargo in space');
  assert.equal(spawned.length, receipt.spillPods);
  for (const pod of spawned) {
    assert.equal(pod.type, 'pickup');
    assert.equal(pod.data.fragileSpill, true);
    assert.equal(pod.data.despawnAt, 100 + FRAGILE_CARGO_SPILL_TTL_S);
  }
  // Cooldown: an immediate second impact cannot double-dip the same crack.
  const again = applyFragileCargoImpact(state, payload, { helpers });
  assert.equal(again, null, 'the cooldown guards repeated invocation');
});

test('repeated impacts across the cooldown keep cracking — the risk does not become free', () => {
  const { state, helpers } = fragileState({ cmdty_medical: 40 });
  const first = applyFragileCargoImpact(state, {
    playerInvolved: true, playerDeltaV: 30, simTime: 100, tick: 1, aId: 'player', bId: 9,
  }, { helpers });
  assert.ok(first);
  const afterFirst = state.player.cargo.items.cmdty_medical;
  const second = applyFragileCargoImpact(state, {
    playerInvolved: true, playerDeltaV: 30, simTime: 102, tick: 200, aId: 'player', bId: 9,
  }, { helpers });
  assert.ok(second, 'a later hard hit is a new decision, not a suppressed repeat');
  assert.ok(state.player.cargo.items.cmdty_medical < afterFirst);
  assert.ok(fragileImpactLossFraction({ playerDeltaV: 0 }) === 0, 'standing still breaks nothing');
});

test('the authored tell matches the physics: rammer_truck needs plate plus pod', () => {
  const synergy = synergyById('rammer_truck');
  assert.ok(synergy, 'the tell exists in the catalog');
  assert.deepEqual(synergy.validation.shipId, MULE);
  const active = synergiesForFittings(RAMMER_FIT);
  assert.ok(active.some((row) => row.id === 'rammer_truck'), 'plate + pod lights the tell');
  const note = explainSynergy(synergy, RAMMER_FIT);
  assert.equal(note.active, true);
  assert.match(note.text, /Drawback: -turn rate from added mass/);
  // Removal: pod alone or plate alone is not the truck.
  assert.ok(!synergiesForFittings(muleFit({ 6: 'mod_ram_plate' })).some((row) => row.id === 'rammer_truck'));
  assert.ok(!synergiesForFittings(HAULER_FIT).some((row) => row.id === 'rammer_truck'));
  // And the drawback the tell advertises is the one the derived stats actually show.
  const empty = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(0));
  const loaded = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(400));
  assert.ok(loaded.turnRate < empty.turnRate);
});

test('the mass is not only a drawback: a loaded rammer is harder to write off against rock', () => {
  const empty = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(0));
  const loaded = getDerivedStats(MULE, RAMMER_FIT, playerWithCargoMass(400));
  const emptyVerbs = shipCapabilityVerbs({ derived: empty, fittings: RAMMER_FIT });
  const loadedVerbs = shipCapabilityVerbs({ derived: loaded, fittings: RAMMER_FIT });
  assert.ok(
    loadedVerbs.slam.unbreakable || loadedVerbs.slam.speedWuPerS > emptyVerbs.slam.speedWuPerS,
    'the same mass that slows the turn also anchors the hull — the tradeoff is two-sided',
  );
});
