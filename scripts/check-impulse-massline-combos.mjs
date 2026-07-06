// Massline rung 16 acceptance check: the impulse+massline combo moves.
//
// Three signature moves (data: MASSLINE_COMBOS in src/data/impulseCharges.js; wiring:
// impulseCharges.js reading the massline mirrors observer-style):
//   • anchorKick — a charge stuck to the player's OWN tether anchor detonates: the anchor's blast
//     share is channeled ALONG the tether line (player → anchor) and amplified. Bystanders still
//     get the plain radial blast. The "slingshot bomb."
//   • slingBomb — any player detonation while masslineTelemetry shows a genuinely fast swing
//     (|tangentialSpeed| ≥ 40): the whole blast is amplified (impulse ×1.35, damage ×1.5).
//     Timing-gated: a lazy swing earns nothing.
//   • tailPop — cut + detonate on the same tick while tethered: a backward escape impulse on the
//     player along the line, away from the anchor. impulseCharges only READS actions.tetherCut
//     (tetherGameplay, later in UPDATE_ORDER, performs the actual cut from the same press).
//
// All impulses ride the rung-15 physics-authority path (the recording port below is the only
// mutator), damage rides the combat damage path, and every gate reads sim state only.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { IMPULSE_CHARGES, MASSLINE_COMBOS } from '../src/data/impulseCharges.js';

const DEF = IMPULSE_CHARGES.charge_standard;
const PLAYER_ID = 1;
const ANCHOR_ID = 40;
const CHARGE_ID = 50;
const BYSTANDER_ID = 60;

assertComboDefsExist();
assertAnchorKickChannelsAlongTheLine();
assertSlingBombAmplifiesBlast();
assertSlingBombTimingGate();
assertAnchorKickOutranksSlingBomb();
assertTailPopEscapeBurst();
assertTailPopRequiresCutAndADetonation();
assertNoTetherMeansNoCombos();

console.log('Impulse+massline combo checks OK');

function assertComboDefsExist() {
  assert.ok(MASSLINE_COMBOS.anchorKick && MASSLINE_COMBOS.anchorKick.impulseMult > 1,
    'anchorKick def must exist and amplify');
  assert.ok(MASSLINE_COMBOS.slingBomb && MASSLINE_COMBOS.slingBomb.minTangentialSpeed >= 25,
    'slingBomb must demand at least the snap-catch "genuinely moving" bar');
  assert.ok(MASSLINE_COMBOS.tailPop && MASSLINE_COMBOS.tailPop.impulse > 0,
    'tailPop def must exist with a positive impulse');
  assert.ok(IMPULSE_CHARGES.charge_standard, 'charge_standard must remain');
}

// 1. anchorKick: charge stuck to the tether anchor, stick point OFF the line axis so the radial
//    and line directions differ — the anchor's impulse must follow the LINE (player → anchor, +x),
//    amplified; the bystander still gets its plain radial shove.
function assertAnchorKickChannelsAlongTheLine() {
  const h = createHarness();
  h.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  stickChargeToAnchor(h, { x: 0, z: -12.2 }); // charge at (100, -12.2): radial to anchor is +z
  addBystander(h, { x: 100, z: 8 });          // dist 20.2 from the charge — inside the blast

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  const anchorCall = h.applied.find((c) => c.entityId === ANCHOR_ID);
  assert.ok(anchorCall, 'the anchor must receive an impulse');
  const falloff = 1 - 12.2 / DEF.radius;
  const expected = DEF.impulse * falloff * MASSLINE_COMBOS.anchorKick.impulseMult;
  assert.ok(Math.abs(anchorCall.impulse.x - expected) < 1e-9,
    `anchorKick must kick along the line (+x) at ×${MASSLINE_COMBOS.anchorKick.impulseMult}; got x=${anchorCall.impulse.x} (expected ${expected})`);
  assert.ok(Math.abs(anchorCall.impulse.z) < 1e-9,
    `anchorKick must NOT follow the radial (+z); got z=${anchorCall.impulse.z}`);

  const bystanderCall = h.applied.find((c) => c.entityId === BYSTANDER_ID);
  assert.ok(bystanderCall, 'bystanders in the radius still get the plain blast');
  const bystanderMag = Math.hypot(bystanderCall.impulse.x, bystanderCall.impulse.z);
  const bystanderFalloff = 1 - 20.2 / DEF.radius;
  assert.ok(Math.abs(bystanderMag - DEF.impulse * bystanderFalloff) < 1e-6,
    'the bystander blast must stay unamplified radial');

  assert.equal(h.combos.length, 1, 'exactly one combo event per detonation');
  assert.equal(h.combos[0].combo, 'anchorKick');
  assert.equal(h.combos[0].anchorId, ANCHOR_ID);
}

// 2. slingBomb: a free charge detonated mid-fast-swing amplifies impulse AND damage for the blast.
function assertSlingBombAmplifiesBlast() {
  const h = createHarness();
  h.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  h.state.player.masslineTelemetry = { active: true, tangentialSpeed: 60 };
  addFreeCharge(h, { x: 300, z: 0 });
  addBystander(h, { x: 320, z: 0 }); // dist 20 from the charge

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  const call = h.applied.find((c) => c.entityId === BYSTANDER_ID);
  assert.ok(call, 'the victim must receive an impulse');
  const falloff = 1 - 20 / DEF.radius;
  const expected = DEF.impulse * falloff * MASSLINE_COMBOS.slingBomb.impulseMult;
  assert.ok(Math.abs(call.impulse.x - expected) < 1e-9,
    `slingBomb impulse must be ×${MASSLINE_COMBOS.slingBomb.impulseMult}; got ${call.impulse.x} (expected ${expected})`);

  assert.equal(h.damage.length, 1, 'the ship victim must take blast damage');
  const kinetic = h.damage[0].packet.channels.kinetic + h.damage[0].packet.channels.thermal;
  const expectedDamage = DEF.damage * falloff * MASSLINE_COMBOS.slingBomb.damageMult;
  assert.ok(Math.abs(kinetic - expectedDamage) < 1e-9,
    `slingBomb damage must be ×${MASSLINE_COMBOS.slingBomb.damageMult}; got ${kinetic} (expected ${expectedDamage})`);

  assert.equal(h.combos.length, 1);
  assert.equal(h.combos[0].combo, 'slingBomb');
}

// 3. The timing gate: the same detonation under a lazy swing (< minTangentialSpeed) is a plain
//    blast — no amplification, no combo event.
function assertSlingBombTimingGate() {
  const h = createHarness();
  h.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  h.state.player.masslineTelemetry = { active: true, tangentialSpeed: 20 };
  addFreeCharge(h, { x: 300, z: 0 });
  addBystander(h, { x: 320, z: 0 });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  const call = h.applied.find((c) => c.entityId === BYSTANDER_ID);
  const falloff = 1 - 20 / DEF.radius;
  assert.ok(Math.abs(call.impulse.x - DEF.impulse * falloff) < 1e-9,
    'a lazy swing must earn a plain unamplified blast');
  const total = h.damage[0].packet.channels.kinetic + h.damage[0].packet.channels.thermal;
  assert.ok(Math.abs(total - DEF.damage * falloff) < 1e-9, 'plain damage under the gate');
  assert.equal(h.combos.length, 0, 'no combo event below the timing gate');
}

// 4. Precedence: a charge on the anchor during a fast swing is an anchorKick (the channeled kick
//    IS the amplified form), not a stacked slingBomb — and damage stays unscaled.
function assertAnchorKickOutranksSlingBomb() {
  const h = createHarness();
  h.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  h.state.player.masslineTelemetry = { active: true, tangentialSpeed: 60 };
  stickChargeToAnchor(h, { x: 0, z: -12.2 });
  addBystander(h, { x: 100, z: 8 });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  assert.equal(h.combos.length, 1, 'one combo per detonation, no stacking');
  assert.equal(h.combos[0].combo, 'anchorKick', 'anchorKick outranks slingBomb');
  const total = h.damage[0].packet.channels.kinetic + h.damage[0].packet.channels.thermal;
  const bystanderFalloff = 1 - 20.2 / DEF.radius;
  assert.ok(Math.abs(total - DEF.damage * bystanderFalloff) < 1e-9,
    'anchorKick must not apply the slingBomb damage multiplier');
}

// 5. tailPop: cut + detonate on the same tick while tethered — the player gets the backward
//    escape impulse along the line (away from the anchor), and the cut intent is left for
//    tetherGameplay to consume (we only read it).
function assertTailPopEscapeBurst() {
  const h = createHarness();
  h.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  addFreeCharge(h, { x: 300, z: 0 }); // detonates far from everyone — the burst is the point

  h.state.input.actions.chargeDetonate = true;
  h.state.input.actions.tetherCut = true;
  h.system.update(SIM_DT, h.state);

  const playerCall = h.applied.find((c) => c.entityId === PLAYER_ID);
  assert.ok(playerCall, 'tailPop must impulse the player');
  assert.ok(Math.abs(playerCall.impulse.x + MASSLINE_COMBOS.tailPop.impulse) < 1e-9,
    `the burst must push away from the anchor (-x at ${MASSLINE_COMBOS.tailPop.impulse}); got ${playerCall.impulse.x}`);
  assert.ok(Math.abs(playerCall.impulse.z) < 1e-9, 'anchor dead ahead means a straight-astern burst');
  assert.ok(h.combos.some((c) => c.combo === 'tailPop'), 'tailPop must announce itself');
  assert.equal(h.state.input.actions.tetherCut, true,
    'impulseCharges must not consume tetherCut — the actual cut is tetherGameplay\'s');
}

// 6. tailPop gates: no cut intent -> no burst; cut intent but nothing armed to detonate -> no burst.
function assertTailPopRequiresCutAndADetonation() {
  const noCut = createHarness();
  noCut.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  addFreeCharge(noCut, { x: 300, z: 0 });
  noCut.state.input.actions.chargeDetonate = true;
  noCut.system.update(SIM_DT, noCut.state);
  assert.ok(!noCut.applied.some((c) => c.entityId === PLAYER_ID), 'no cut intent, no burst');
  assert.equal(noCut.combos.length, 0);

  const noCharge = createHarness();
  noCharge.state.player.tether = { active: true, targetId: ANCHOR_ID, strain: 0.3, load: 0.6, phase: 'loaded' };
  noCharge.state.input.actions.chargeDetonate = true;
  noCharge.state.input.actions.tetherCut = true;
  noCharge.system.update(SIM_DT, noCharge.state);
  assert.equal(noCharge.applied.length, 0, 'nothing detonated means no burst to ride');
  assert.equal(noCharge.combos.length, 0);
}

// 7. The control the rung demands: a detonation with NO massline state is a plain blast — plain
//    impulse, plain damage, zero combo events.
function assertNoTetherMeansNoCombos() {
  const h = createHarness(); // player.tether/masslineTelemetry left absent
  stickChargeToAnchor(h, { x: 0, z: -12.2 }); // stuck to a rock, but the rock is NOT a tether anchor
  addBystander(h, { x: 100, z: 8 });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  const anchorCall = h.applied.find((c) => c.entityId === ANCHOR_ID);
  const falloff = 1 - 12.2 / DEF.radius;
  assert.ok(Math.abs(anchorCall.impulse.z - DEF.impulse * falloff) < 1e-9,
    'without a tether the host gets the plain RADIAL blast (+z here)');
  assert.ok(Math.abs(anchorCall.impulse.x) < 1e-9, 'no line-channeling without a tether');
  const total = h.damage[0].packet.channels.kinetic + h.damage[0].packet.channels.thermal;
  const bystanderFalloff = 1 - 20.2 / DEF.radius;
  assert.ok(Math.abs(total - DEF.damage * bystanderFalloff) < 1e-9, 'plain damage without a tether');
  assert.equal(h.combos.length, 0, 'no massline state, no combo events');
}

// ---- harness (mirrors check-impulse-authority.mjs; adds massline mirrors + combo capture) ----

function createHarness() {
  const bus = createBus();
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 32,
    data: {},
  };
  const anchor = {
    id: ANCHOR_ID, type: 'asteroid', alive: true,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 11, mass: 640,
    data: {},
  };
  const state = {
    mode: 'flight',
    tick: 500,
    simTime: 500 / 60,
    playerId: PLAYER_ID,
    player: {},
    entities: new Map([[PLAYER_ID, player], [ANCHOR_ID, anchor]]),
    entityList: [player, anchor],
    input: { actions: { chargeThrow: false, chargeDetonate: false, tetherCut: false } },
  };

  const applied = [];
  const damage = [];
  const helpers = {
    combatPhysics: {
      applyImpulse(input) { applied.push(input); return true; },
    },
    routeCombatDamage(request) { damage.push(request); return { ok: true }; },
  };
  const system = Object.create(impulseCharges);
  system.init({ state, bus, helpers, registry: null });

  const combos = [];
  bus.on('charge:combo', (p) => combos.push(p));

  return { state, bus, system, helpers, applied, damage, combos, player, anchor };
}

function stickChargeToAnchor(h, localOffset) {
  const charge = {
    id: CHARGE_ID, type: 'charge', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 1.2, mass: 0.5,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: PLAYER_ID,
      hostId: ANCHOR_ID, localOffset: { ...localOffset }, armed: true, spawnedAt: 0,
    },
  };
  h.state.entities.set(CHARGE_ID, charge);
  h.state.entityList.push(charge);
  return charge;
}

function addFreeCharge(h, pos) {
  const charge = {
    id: CHARGE_ID, type: 'charge', alive: true, team: 'player',
    pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, radius: 1.2, mass: 0.5,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: PLAYER_ID,
      hostId: null, localOffset: null, armed: true, spawnedAt: 0,
    },
  };
  h.state.entities.set(CHARGE_ID, charge);
  h.state.entityList.push(charge);
  return charge;
}

function addBystander(h, pos) {
  const ship = {
    id: BYSTANDER_ID, type: 'ship', alive: true, team: 'pirate',
    pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 32,
    hull: 100, data: {},
  };
  h.state.entities.set(BYSTANDER_ID, ship);
  h.state.entityList.push(ship);
  return ship;
}
