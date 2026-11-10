// SF-123 — control-tug as a two-context capability.
//
// The packet's promise: a Heavy-Duty Winch plus an Impulse Charge Rack is not two
// independent percentage bumps. It opens a second way to run a scene — the tether holds
// the body while the charge does the moving — in two different contexts:
//   combat positioning:   line on a hull, plate stuck to that hull, detonate -> the line
//                         channels the blast into an amplified kick ALONG the tether
//                         (MASSLINE_COMBOS.anchorKick), a move an untethered rack cannot do.
//   industrial recovery:  the same winch authority plus the deeper deployed-charge pool
//                         works wrecks/pods without the fight.
//
// Asserted against the live owners:
//   combat/attachments.js effectiveTetherPolicy  — winch multipliers land on the real policy
//   systems/impulseCharges.js                    — rack capacity, combo detection, and the
//                                                  channeled blast path itself (helpers
//                                                  stubbed, physics faked through the seam)
//   data/synergies.js                            — the authored control_tug tell
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import {
  impulseCharges,
  resolveImpulseChargeCapacity,
} from '../src/systems/impulseCharges.js';
import { MASSLINE_COMBOS, IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { synergiesForFittings, explainSynergy, synergyById } from '../src/data/synergies.js';

const TETHER = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');

// ship_drifter slot order: 0-1 weapon/M, 2 shield/M, 3 engine/M, 4-5 cargo/M,
// 6 mining/M, 7-8 utility/M, 9 thruster/M.
const DRIFTER = 'ship_drifter';

function drifterFit(overrides = {}) {
  const fittings = new Array(10).fill(null);
  fittings[3] = 'mod_engine_fusion_m';
  for (const [index, id] of Object.entries(overrides)) fittings[Number(index)] = id;
  return fittings;
}

const TUG_FIT = drifterFit({ 7: 'mod_winch_hd', 8: 'mod_charge_rack' });
const WINCH_ONLY = drifterFit({ 7: 'mod_winch_hd' });
const RACK_ONLY = drifterFit({ 7: 'mod_charge_rack' });
const BARE = drifterFit();

function playerState(fittings) {
  return {
    player: { activeShipIndex: 0, ownedShips: [{ fittings }] },
  };
}

function ownerWith(fit, cargoMass = 0) {
  return { data: { derived: getDerivedStats(DRIFTER, fit, { isPlayer: true, cargo: { usedMass: cargoMass } }) } };
}

test('the winch half is real line authority, and the rack half is real charge capacity', () => {
  const base = effectiveTetherPolicy(TETHER, ownerWith(BARE));
  const tug = effectiveTetherPolicy(TETHER, ownerWith(TUG_FIT));
  const winch = effectiveTetherPolicy(TETHER, ownerWith(WINCH_ONLY));
  assert.ok(tug.maxLength > base.maxLength, `spool ${tug.maxLength} must beat ${base.maxLength}`);
  assert.ok(tug.reelRate > base.reelRate, `reel ${tug.reelRate} must beat ${base.reelRate}`);
  // Winch-only carries exactly the same line authority as the full tug — the rack adds
  // charges, not rope. The capability split is honest.
  assert.equal(tug.maxLength, winch.maxLength);
  assert.equal(tug.reelRate, winch.reelRate);

  const baseCap = resolveImpulseChargeCapacity(playerState(BARE));
  const tugCap = resolveImpulseChargeCapacity(playerState(TUG_FIT));
  const winchCap = resolveImpulseChargeCapacity(playerState(WINCH_ONLY));
  assert.equal(baseCap, IMPULSE_CHARGES.charge_standard.maxActive, 'an unfitted hull keeps four');
  assert.equal(tugCap, 8, 'the rack raises the deployed pool to eight');
  assert.equal(winchCap, baseCap, 'the winch adds no charge capacity — removing it loses none');
});

test('removal is honest: each module takes only its own capability with it', () => {
  const rackOnly = effectiveTetherPolicy(TETHER, ownerWith(RACK_ONLY));
  const base = effectiveTetherPolicy(TETHER, ownerWith(BARE));
  assert.equal(rackOnly.maxLength, base.maxLength, 'a rack without a winch is a stock line');
  assert.equal(rackOnly.reelRate, base.reelRate);
  assert.equal(resolveImpulseChargeCapacity(playerState(RACK_ONLY)), 8);
  // Repeated resolution is stable — the policy is a pure read of derived stats.
  const again = effectiveTetherPolicy(TETHER, ownerWith(TUG_FIT));
  assert.equal(again.maxLength, effectiveTetherPolicy(TETHER, ownerWith(TUG_FIT)).maxLength);
});

// A minimal live-blast harness: the real impulseCharges object with a stub bus, a fake
// entity index, and the combatPhysics seam faked to collect impulses — the same helper
// contract the registry supplies in production.
function blastHarness(state) {
  const impulses = [];
  const emitted = [];
  const system = Object.create(impulseCharges);
  system.state = state;
  system.bus = { emit: (id, payload) => emitted.push({ id, payload }), on: () => {} };
  system.helpers = {
    combatPhysics: {
      applyImpulse(request) {
        impulses.push(request);
        return true;
      },
    },
  };
  system.registry = { get: () => null };
  system._blastScratch = [];
  system._resetChainState();
  return { system, impulses, emitted };
}

function tugScene() {
  const player = { id: 'player', type: 'ship', pos: { x: 0, z: 0 }, radius: 10, mass: 48, alive: true, hull: 100 };
  const anchor = { id: 7, type: 'ship', pos: { x: 100, z: 0 }, radius: 10, mass: 30, alive: true, hull: 100 };
  const bystander = { id: 8, type: 'ship', pos: { x: 130, z: 40 }, radius: 8, mass: 16, alive: true, hull: 100 };
  const entities = new Map([[player.id, player], [anchor.id, anchor], [bystander.id, bystander]]);
  const state = {
    playerId: 'player',
    entities,
    entityList: [player, anchor, bystander],
    tick: 100,
    simTime: 50,
    player: { tether: { active: true, targetId: anchor.id } },
  };
  const charge = {
    id: 55, type: 'charge', alive: true,
    pos: { x: 108, z: 0 },
    data: { chargeId: 'charge_standard', armed: true, hostId: anchor.id },
  };
  entities.set(charge.id, charge);
  state.entityList.push(charge);
  return { state, player, anchor, bystander, charge };
}

test('the combined move is a different blast, not a cheaper one: the line channels the kick', () => {
  const { state, anchor, charge } = tugScene();
  const { system, impulses, emitted } = blastHarness(state);
  // Combo detection: a plate stuck to the live tether anchor is the anchorKick.
  const combo = system._detectCombo(charge.data, 'player', state);
  assert.equal(combo.combo, 'anchorKick');
  assert.equal(combo.anchorId, anchor.id);
  system._detonateOne(charge, charge.data, 'player', state);
  const kick = impulses.find((i) => i.entityId === anchor.id);
  assert.ok(kick, 'the tethered hull must take the channeled impulse');
  // The kick runs player -> anchor along the line (+x here), amplified past the radial base.
  const falloff = 1 - (8 / IMPULSE_CHARGES.charge_standard.radius); // host is 8 wu from the plate
  const radialBase = IMPULSE_CHARGES.charge_standard.impulse * falloff;
  assert.ok(kick.impulse.x > 0, 'the channeled direction is along the line, not radial');
  assert.ok(Math.abs(kick.impulse.z) < 1e-9, 'the tether line has no off-axis component here');
  assert.ok(kick.impulse.x > radialBase,
    `channeled ${kick.impulse.x} beats the radial ${radialBase} at the same falloff`);
  const comboEvent = emitted.find((e) => e.id === 'charge:combo');
  assert.ok(comboEvent, 'the combo publishes itself');
  assert.equal(comboEvent.payload.combo, 'anchorKick');
});

test('without the line the same plate is just a radial bomb — the pair opens the move', () => {
  const { state, charge } = tugScene();
  state.player.tether = { active: false, targetId: null };
  const { system, emitted } = blastHarness(state);
  const combo = system._detectCombo(charge.data, 'player', state);
  assert.equal(combo, null, 'no live tether, no channeled kick');
  system._detonateOne(charge, charge.data, 'player', state);
  assert.equal(emitted.filter((e) => e.id === 'charge:combo').length, 0);
});

test('the second context rides the same pair: a fast swing turns the whole blast up', () => {
  const { state, charge } = tugScene();
  // Industrial swing context: no anchor match for this charge, but a genuine massline swing.
  state.player.tether = { active: true, targetId: 999 };
  state.player.masslineTelemetry = { active: true, tangentialSpeed: MASSLINE_COMBOS.slingBomb.minTangentialSpeed + 5 };
  const { system, impulses } = blastHarness(state);
  const combo = system._detectCombo(charge.data, 'player', state);
  assert.equal(combo.combo, 'slingBomb', 'a real swing amplifies the whole detonation');
  system._detonateOne(charge, charge.data, 'player', state);
  const anchorHit = impulses.find((i) => i.entityId === 7);
  assert.ok(anchorHit);
});

test('the authored tell matches the mechanics: control_tug needs winch plus rack', () => {
  const synergy = synergyById('control_tug');
  assert.ok(synergy);
  assert.equal(synergy.validation.shipId, DRIFTER);
  assert.ok(synergiesForFittings(TUG_FIT).some((row) => row.id === 'control_tug'));
  assert.ok(!synergiesForFittings(WINCH_ONLY).some((row) => row.id === 'control_tug'));
  assert.ok(!synergiesForFittings(RACK_ONLY).some((row) => row.id === 'control_tug'));
  const note = explainSynergy(synergy, TUG_FIT);
  assert.equal(note.active, true);
  assert.match(note.text, /tether reel authority and \+impulse charge capacity/);
  // The advertised drawback is the real one: both modules draw continuous power.
  const tugDerived = getDerivedStats(DRIFTER, TUG_FIT, { isPlayer: true });
  const bareDerived = getDerivedStats(DRIFTER, BARE, { isPlayer: true });
  assert.ok(tugDerived.continuousDrain > bareDerived.continuousDrain,
    'the sensor-and-iron tax on the fit is the power bill, not a phantom stat');
});
