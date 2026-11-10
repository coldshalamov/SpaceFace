// weight-vael-524 — W-VAEL (build_map §34.5 row 524, bible 02 §6).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/vael.js   the Lien Anchor (telegraphed, contract-only, transferable),
//                           Page Nine, the Override Head, hull-script dressing
//   systems/faction_vael.js the tender telegraphs and clamps +mass; a thrown anchor
//                           transfers the debt — LIEN TRANSFERRED; payoff and cut-loose
//                           both end the clamp; the Override Head flies a held ship's
//                           own thrusters
//
// Run: node --test test/weight-vael-524.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  vaelLiens,
  ensureVaelState,
  lienAnchorFor,
  vaelContractJobActive,
} from '../src/systems/faction_vael.js';
import faction, {
  VAEL_LIEN,
  VAEL_PAGE_NINE,
  VAEL_OVERRIDE_HEAD,
  VAEL_HULL_SCRIPT,
} from '../src/data/factions/vael.js';

const SEED = 4242;

function boot({ contract = false } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [vaelLiens] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_veil_nebula';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  if (contract) state.missions.active = [{ id: 'm_contract_1', kind: 'contract' }];
  return { sim, state, bus, player };
}

const tender = (sim, x, z) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_vael',
  pos: { x, z }, radius: 18, mass: 60, hull: 400, hullMax: 400, collides: true,
  data: { overrideTender: true, role: 'override-tender', name: 'Override Tender' },
});

test('data: the lien is telegraphed, contract-only and transferable; the roster carries a tender', () => {
  assert.equal(VAEL_LIEN.contractJobsOnly, true, 'contract jobs only');
  assert.ok(VAEL_LIEN.telegraphS > 0, 'the clamp is telegraphed');
  assert.ok(VAEL_LIEN.anchorMass > 0, 'the clamp adds mass — Katamari in reverse');
  assert.ok(VAEL_LIEN.flingSpeedMin > 0, 'transferable by throwing');
  assert.match(VAEL_LIEN.transferLogTemplate, /LIEN TRANSFERRED/);
  assert.equal(VAEL_PAGE_NINE.id, 'E-18');
  assert.match(VAEL_HULL_SCRIPT.scanLine, /page 9/i, 'the hull text is readable on scan');
  assert.equal(VAEL_OVERRIDE_HEAD.id, 'head_override');
  assert.ok(faction.shipRoles.some((r) => r.role === 'override-tender'), 'Override Tender on the roster');
  assert.equal(faction.custom.liensArePhysical, true);
});

test('no contract job, no clamp — the lien only bites inside contract work', () => {
  const { sim } = boot({ contract: false });
  try {
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 30);
    assert.equal(vaelContractJobActive(sim.state), false);
    assert.equal(sim.state.entityList.some((e) => e.data?.lienAnchor), false, 'no anchor without a contract');
  } finally {
    sim.dispose();
  }
});

test('the tender telegraphs, then the Lien Anchor clamps mass onto the hull', () => {
  const { sim, state, player } = boot({ contract: true });
  try {
    const t = tender(sim, VAEL_LIEN.clampRange - 100, 0);
    const telegraphs = [];
    sim.bus.on('vael:lienTelegraph', (p) => telegraphs.push(p));
    sim.step();
    assert.equal(telegraphs.length, 1, 'the wind-up reads before the bite');

    const m0 = player.mass;
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor, 'the anchor clamped on');
    assert.equal(player.mass, m0 + VAEL_LIEN.anchorMass, `+${VAEL_LIEN.anchorMass}t on the hull`);
    assert.equal(player.data.lienMass, VAEL_LIEN.anchorMass);

    // The clamp rides the hull.
    player.pos.x += 500;
    sim.step();
    const d = Math.hypot(anchor.pos.x - player.pos.x, anchor.pos.z - player.pos.z);
    assert.ok(d <= player.radius + anchor.radius + 8, 'the anchor rides the host');
    assert.notEqual(t.data?.lienAnchor, true, 'the tender stays a tender');
  } finally {
    sim.dispose();
  }
});

test('LIEN TRANSFERRED: a thrown anchor lands the debt on a hostile hull', () => {
  const { sim, state, player } = boot({ contract: true });
  try {
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor);
    const pirate = sim.spawn({
      type: 'ship', team: 2, pos: { x: 900, z: 0 }, radius: 14, mass: 30,
      hull: 200, hullMax: 200, collides: true, data: { name: 'Reaver-3' },
    });
    const logs = [];
    sim.bus.on('comms:log', (p) => logs.push(p.text || ''));

    // The throw: the anchor leaves the clamp ring fast, aimed at the pirate.
    anchor.pos.x = player.pos.x + player.radius + anchor.radius + 200;
    anchor.vel.x = VAEL_LIEN.flingSpeedMin + 30;
    sim.step();
    assert.equal(anchor.data.detached, true, 'the throw broke the clamp');

    // It lands on the hostile hull.
    anchor.pos.x = pirate.pos.x - pirate.radius - anchor.radius - 2;
    anchor.pos.z = pirate.pos.z;
    const pirateMass0 = pirate.mass;
    sim.step();
    assert.equal(anchor.data.detached, false, 'the anchor re-clamped on the new host');
    assert.equal(anchor.data.hostId, pirate.id);
    assert.equal(pirate.mass, pirateMass0 + VAEL_LIEN.anchorMass, 'the debt is mass now');
    assert.equal(player.mass, 24, 'the player is light again');
    assert.ok(logs.some((l) => l.includes('LIEN TRANSFERRED') && l.includes('REAVER-3')),
      'LOG files the transfer: LIEN TRANSFERRED: REAVER-3 NOW OWES THE VAEL.');
    assert.equal(ensureVaelState(state).transferredCount, 1);
  } finally {
    sim.dispose();
  }
});

test('Page Nine (E-18): arming the addendum lets the clamp land mid-job', () => {
  const { sim, state } = boot({ contract: false });
  try {
    const sys = sim.registry.get('vaelLiens');
    sys.armPageNine(state, { jobId: 'hazard_salvage_1' });
    assert.equal(vaelContractJobActive(state), true, 'the addendum activates inside the job');
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, state.playerId), 'page nine reached the hull');
    const lien = Object.values(ensureVaelState(state).liens)[0];
    assert.equal(lien.pageNine, true, 'the lien ledger remembers which page bit');
  } finally {
    sim.dispose();
  }
});

test('paying off or cutting loose both end the clamp — on different terms', () => {
  const { sim, state, player } = boot({ contract: true });
  try {
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const sys = sim.registry.get('vaelLiens');

    const charges = [], rep = [];
    sim.bus.on('economy:chargeCredits', (p) => charges.push(p));
    sim.bus.on('faction:repDelta', (p) => rep.push(p));
    const paid = sys.payoffLien(state);
    assert.ok(paid > 0, 'settling costs credits per tonne');
    assert.equal(lienAnchorFor(state, player.id), null, 'the clamp released');
    assert.equal(player.mass, 24);
    assert.equal(charges.length, 1);

    // Second lien, cut loose: it ends the same way but the Vael remember.
    sys.armPageNine(state, {});
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id));
    assert.equal(sys.cutLienLoose(state), 1);
    assert.equal(lienAnchorFor(state, player.id), null);
    assert.ok(rep.some((r) => r.factionId === 'faction_vael' && r.delta < 0), 'the rep hit landed');
  } finally {
    sim.dispose();
  }
});

test('Override Head: a held ship answers your helm with its own thrusters', () => {
  const { sim, state, player } = boot();
  try {
    player.data = { ...(player.data || {}), lineHeadId: VAEL_OVERRIDE_HEAD.id };
    const held = sim.spawn({
      type: 'ship', team: 2, pos: { x: 60, z: 0 }, radius: 14, mass: 30,
      hull: 100, hullMax: 100, collides: true, data: {},
    });
    state.player.tether = { active: true, targetId: held.id };
    state.input.aimAngle = Math.PI / 2; // helm hard to port
    sim.step();
    assert.ok(Math.abs(held.vel.z - VAEL_OVERRIDE_HEAD.thrustAccel / 60) < 1e-9,
      'the held ship burns its own drive where you point');
    assert.ok(Math.abs(held.vel.x) < 1e-9);
  } finally {
    sim.dispose();
  }
});
