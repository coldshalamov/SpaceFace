// PQ-137.09 — "Tethered pairs share helm loss and inertia."
//
// A rope makes two hulls one body. These tests pin the three things that makes true:
//   • the partner receives an INTENT (a published hitstun impulse), never a written velocity;
//   • the share is the rope's own coupled inertia, m_v/(m_v+m_p) = mu/m_p;
//   • a slack line transmits nothing, and a shared tumble never propagates again.
import test from 'node:test';
import assert from 'node:assert/strict';

import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';

const PHYSICAL = 'Combat should be physical.';
const CONSEQUENCES = 'Consequences or it is thin.';

function hull(id, x, z, mass) {
  return {
    id, type: 'ship', alive: true, rot: 0, angVel: 0,
    pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 },
    radius: 14, mass,
    physicsBody: { schemaVersion: 1, radius: 14, mass, inertiaY: 40, dynamic: true, ccd: false, material: 'ship', revision: 0 },
    data: { derived: { propulsion: { combatSpeed: 105 } } },
  };
}

function fixture({ phase = 'loaded', attachmentState = 'active', telemetry = true, victimMass = 16, partnerMass = 64 } = {}) {
  const victim = hull(2, 0, 0, victimMass);
  const partner = hull(3, 0, 90, partnerMass);
  const entities = new Map([[victim.id, victim], [partner.id, partner]]);
  const attachment = {
    id: 'att_1', state: attachmentState, ownerId: victim.id, targetId: partner.id,
    defId: 'tether_standard', physicsHandle: 'h1',
  };
  const state = {
    mode: 'flight', tick: 12, simTime: 0.2, playerId: 1,
    entities,
    entityList: [victim, partner],
    combat: { attachments: { byId: { att_1: attachment } } },
    player: {},
    input: { actions: {} },
  };
  const emitted = [];
  const bus = { emit(name, payload) { emitted.push({ name, payload }); }, on() { return () => {}; } };
  const system = Object.create(tetherGameplay);
  system.state = state;
  system.bus = bus;
  system.helpers = {
    combatPhysics: telemetry
      ? { getAttachmentTelemetry: () => ({ attachmentId: 'att_1', phase, stretch: 4, distance: 90, relativeSpeed: 2 }) }
      : {},
  };
  return { system, state, bus, emitted, victim, partner, attachment };
}

function hitstunFor(emitted, victimId) {
  return emitted.filter((e) => e.name === HITSTUN_IMPULSE_EVENT && e.payload.victimId === victimId).pop() || null;
}

test('a taut line hands the partner a share of the helm loss sized by the pair coupled inertia', () => {
  const f = fixture({ victimMass: 16, partnerMass: 64 });
  const shared = f.system._shareHelmLoss({ victimId: f.victim.id, source: 'collision', deltaV: 40, dirX: 0, dirZ: 1 });

  assert.equal(shared, 1, `${CONSEQUENCES} — a hull that loses its helm on the end of a rope has to move the other end`);
  const published = hitstunFor(f.emitted, f.partner.id);
  assert.ok(published, 'the partner must receive a published hitstun intent');

  // dV_p = dV_v * m_v/(m_v+m_p) = 40 * 16/80 = 8; equivalently dV_v * mu/m_p with mu = 12.8.
  const mu = (16 * 64) / (16 + 64);
  assert.ok(Math.abs(published.payload.deltaV - 40 * (mu / 64)) < 1e-9,
    `${PHYSICAL} — the share is the coupled inertia the rope already carries, not a tuned fraction`);
  assert.equal(published.payload.source, 'tether_share');
  assert.equal(published.payload.attackerId, f.victim.id);

  const receipt = f.emitted.find((e) => e.name === 'chain:tetherShare');
  assert.ok(receipt, 'the share publishes a receipt someone can read');
  assert.ok(Math.abs(receipt.payload.reducedMass - mu) < 1e-9);

  // The intent is all it does: nothing here writes the partner's motion.
  assert.deepEqual(f.partner.vel, { x: 0, z: 0 },
    `${PHYSICAL} — the rope emits an intent and the one law decides; it never writes the other hull's velocity`);
  assert.equal(f.partner.angVel, 0);
});

test('a slack line transmits nothing', () => {
  const f = fixture({ phase: 'slack' });
  const shared = f.system._shareHelmLoss({ victimId: f.victim.id, source: 'collision', deltaV: 40 });
  assert.equal(shared, 0,
    `${PHYSICAL} — a rope that is not taut is a rope lying in space; it cannot carry a hit`);
  assert.equal(hitstunFor(f.emitted, f.partner.id), null);
});

test('an inactive attachment shares nothing', () => {
  const f = fixture({ attachmentState: 'broken' });
  assert.equal(f.system._shareHelmLoss({ victimId: f.victim.id, source: 'collision', deltaV: 40 }), 0);
});

test('a shared tumble never propagates again', () => {
  const f = fixture();
  const shared = f.system._shareHelmLoss({ victimId: f.victim.id, source: 'tether_share', deltaV: 40 });
  assert.equal(shared, 0,
    'one hit crosses each rope once; without this guard two tethered hulls trade the same tumble forever');
});

test('the heavier end barely moves and the lighter end nearly comes with it', () => {
  const heavyPartner = fixture({ victimMass: 16, partnerMass: 200 });
  heavyPartner.system._shareHelmLoss({ victimId: heavyPartner.victim.id, source: 'collision', deltaV: 40 });
  const onHeavy = hitstunFor(heavyPartner.emitted, heavyPartner.partner.id).payload.deltaV;

  const lightPartner = fixture({ victimMass: 200, partnerMass: 16 });
  lightPartner.system._shareHelmLoss({ victimId: lightPartner.victim.id, source: 'collision', deltaV: 40 });
  const onLight = hitstunFor(lightPartner.emitted, lightPartner.partner.id).payload.deltaV;

  assert.ok(onLight > onHeavy * 5,
    `${PHYSICAL} — "mass and momentum decide": a light hull roped to a heavy one is dragged, and the heavy one shrugs`);
  assert.ok(onHeavy < 40 && onLight < 40, 'neither end can receive more than the hit itself');
});

test('the shared intent is published to the ONE hitstun law, which is free to refuse it', () => {
  // A gun-scale share on a heavy partner: the law's own uFloor declines it. The rule must publish
  // anyway and let the law decide, rather than deciding for it.
  const f = fixture({ victimMass: 16, partnerMass: 200 });
  f.system._shareHelmLoss({ victimId: f.victim.id, source: 'weapon', deltaV: 2 });
  const published = hitstunFor(f.emitted, f.partner.id);
  assert.ok(published, 'the intent is always published');
  assert.ok(published.payload.deltaV > 0 && published.payload.deltaV < 2,
    `${PHYSICAL} — the rope reports what it transmitted; whether that takes a helm is the law's call, not the rope's`);
});
