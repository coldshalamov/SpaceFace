// Massline rung 15 acceptance check: impulse-charge blasts route through the physics AUTHORITY.
//
// The contract fix: impulseCharges._detonateOne used to write blast Δv straight onto entity.vel
// (a physics-authority violation — ARCHITECTURE §3: under rapier-dynamic the backend owns body
// state; direct mutation desyncs the rigid body and breaks determinism on reload). Now the blast
// is an applyImpulse REQUEST on helpers.combatPhysics — the same port + call shape proven in
// combat/actions.js:185 and combat/damage.js:201 — with magnitude def.impulse × falloff (the old
// per-entity Δv × mass; same physics, different owner of the mutation).
//
// The proof shape: the mock physics port is the ONLY vel mutator in this harness. If the system
// still wrote vel directly, the "no direct mutation" case would see a vel change with a
// non-mutating mock — that assertion failing is exactly the reintroduced violation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { WEAPONS } from '../src/data/weapons.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { auditPhysicsMembraneSources } from './lib/physicsMembraneAudit.mjs';

const DEF = IMPULSE_CHARGES.charge_standard;
const PLAYER_ID = 1;
const CHARGE_ID = 50;
const TARGET_ID = 60;
const TARGET_MASS = 32;

assertImpulseRoutesThroughAuthority();
assertNoDirectMutation();
assertRejectedImpulseSkippedNotForced();
assertMissingPortIsSafe();
assertMagnitudeAndDirectionMatchBlastGeometry();
assertUniversalWeaponIdentities();
assertCollisionConsequenceContract();
assertNewPathMembraneContract();

console.log('Universal impulse authority checks OK');

// 1. A detonation near a ship routes exactly one applyImpulse through the port (correct entity,
//    call shape, and magnitude = def.impulse × falloff), the port's own mutation is what moves the
//    ship, and blast damage still routes through the combat damage path unchanged.
function assertImpulseRoutesThroughAuthority() {
  const h = createHarness({ targetPos: { x: 120, z: 0 } }); // dist 20 from the charge
  const applied = [];
  h.helpers.combatPhysics = recordingPort(applied, { mutate: true, state: h.state });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  assert.equal(applied.length, 1, `blast must request exactly one impulse; got ${applied.length}`);
  const call = applied[0];
  assert.equal(call.entityId, TARGET_ID, 'impulse must target the blast victim');
  assert.equal(call.point, null, 'blast impulse applies at the center of mass (point null)');
  assert.equal(call.reason, 'impulse_charge', 'impulse must carry the reason for the combat trace');
  assert.equal(call.tick, h.state.tick, 'impulse must be sim-tick stamped');

  const falloff = 1 - 20 / DEF.radius;
  const expected = DEF.impulse * falloff;
  assert.ok(Math.abs(call.impulse.x - expected) < 1e-9,
    `impulse magnitude must be def.impulse × falloff (${expected}); got ${call.impulse.x}`);
  assert.ok(Math.abs(call.impulse.z) < 1e-9, 'a +x blast line must carry no z impulse');

  // The PORT moved the ship (impulse / mass), not the system.
  const target = h.state.entities.get(TARGET_ID);
  assert.ok(Math.abs(target.vel.x - expected / TARGET_MASS) < 1e-9,
    'the victim Δv must be exactly the port-applied impulse / mass');

  assert.equal(h.damage.length, 1, 'blast damage must still route through the combat damage path');
  assert.equal(h.damage[0].targetId, TARGET_ID);
  assert.ok(h.detonated.length === 1 && h.detonated[0].hits.includes(TARGET_ID),
    'charge:detonated must still report the victim');
}

// 2. THE violation-gone proof: with a port that records but does NOT mutate, the victim's velocity
//    stays exactly as seeded — the system itself never writes entity.vel anymore.
function assertNoDirectMutation() {
  const h = createHarness({ targetPos: { x: 120, z: 0 } });
  const applied = [];
  h.helpers.combatPhysics = recordingPort(applied, { mutate: false });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  assert.equal(applied.length, 1, 'sanity: the impulse request was made');
  const target = h.state.entities.get(TARGET_ID);
  assert.deepEqual({ x: target.vel.x, z: target.vel.z }, { x: 0, z: 0 },
    'REGRESSION: entity.vel changed without the port mutating — a direct vel write is back');
}

// 3. A rejected impulse (accepted === false — e.g. no rigid-body record) is skipped, never forced:
//    no vel write, no throw, and the detonation still completes (damage + events unchanged).
function assertRejectedImpulseSkippedNotForced() {
  const h = createHarness({ targetPos: { x: 120, z: 0 } });
  const applied = [];
  h.helpers.combatPhysics = {
    applyImpulse(input) { applied.push(input); return false; },
  };

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  assert.equal(applied.length, 1, 'the request must still be made');
  const target = h.state.entities.get(TARGET_ID);
  assert.deepEqual({ x: target.vel.x, z: target.vel.z }, { x: 0, z: 0 },
    'a backend-rejected impulse must not be forced onto entity.vel');
  assert.equal(h.damage.length, 1, 'rejection of the impulse must not suppress blast damage');
  assert.equal(h.detonated.length, 1, 'the detonation must still complete');
  assert.equal(h.state.entities.get(CHARGE_ID).alive, false, 'the charge must still be spent');
}

// 4. No physics port at all (harness/legacy context): safe no-op on velocity, detonation intact.
function assertMissingPortIsSafe() {
  const h = createHarness({ targetPos: { x: 120, z: 0 } });
  delete h.helpers.combatPhysics;

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  const target = h.state.entities.get(TARGET_ID);
  assert.deepEqual({ x: target.vel.x, z: target.vel.z }, { x: 0, z: 0 },
    'no port must mean no impulse — never a direct-write fallback');
  assert.equal(h.detonated.length, 1, 'the detonation must still complete without a port');
}

// 5. Blast geometry rides the request: a victim on the -z side at a different range gets the
//    right direction unit and the linear-falloff magnitude (same numbers the old Δv math produced).
function assertMagnitudeAndDirectionMatchBlastGeometry() {
  const h = createHarness({ targetPos: { x: 100, z: -35 } }); // dist 35, straight -z
  const applied = [];
  h.helpers.combatPhysics = recordingPort(applied, { mutate: true, state: h.state });

  h.state.input.actions.chargeDetonate = true;
  h.system.update(SIM_DT, h.state);

  assert.equal(applied.length, 1);
  const call = applied[0];
  const expected = DEF.impulse * (1 - 35 / DEF.radius);
  assert.ok(Math.abs(call.impulse.z + expected) < 1e-9,
    `-z victim must get -z impulse of ${expected}; got ${call.impulse.z}`);
  assert.ok(Math.abs(call.impulse.x) < 1e-9, 'a -z blast line must carry no x impulse');
}

// 6. PQ-009: every shipped weapon carries a stable authored identity; the starter exemption is a
//    near-zero plink, never a missing value, and representative families remain mechanically apart.
function assertUniversalWeaponIdentities() {
  assert.ok(WEAPONS.length > 0, 'weapon catalog must not be empty');
  for (const weapon of WEAPONS) {
    assert.ok(Number.isFinite(weapon.impulsePerHit) && weapon.impulsePerHit > 0,
      `${weapon.id}: positive impulsePerHit required`);
    assert.ok(Number.isFinite(weapon.tumbleTorque) && weapon.tumbleTorque >= 0,
      `${weapon.id}: finite tumbleTorque required`);
    assert.match(String(weapon.impulseProvenance || ''), /^[a-z0-9_]+$/,
      `${weapon.id}: stable impulseProvenance required`);
  }
  const byId = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
  const starter = byId.get('wpn_pulse_laser_s');
  assert.ok(starter && starter.impulsePerHit > 0 && starter.impulsePerHit <= 1,
    'starter pulse must keep its near-zero impulse exemption');
  const familyIds = [
    'wpn_pulse_laser_s',
    'wpn_autocannon_s',
    'wpn_beam_laser_m',
    'wpn_railgun_m',
    'wpn_missile_rack_m',
    'wpn_emp_disruptor_m',
  ];
  assert.equal(new Set(familyIds.map((id) => byId.get(id)?.impulseProvenance)).size, familyIds.length,
    'representative weapon families may not collapse onto one impulse identity');
}

// 7. The pure consequence contract gives both terrain and craft contact a bounded payoff. Runtime
//    attribution, Ram Plate scaling, player immunity, and Massline ownership are covered by
//    weapon-impulse-consequence.test.mjs.
function assertCollisionConsequenceContract() {
  const target = { id: 2, type: 'ship', mass: 20, radius: 6 };
  const common = {
    target,
    exchangedMomentum: 800,
    tick: 120,
    pos: { x: 6, z: 0 },
    normal: { x: -1, z: 0 },
    provenance: { actorId: 1, weaponId: 'wpn_railgun_m', tag: 'railgun_penetrator', appliedTick: 118 },
  };
  const terrain = resolveCollisionConsequence({ ...common, other: { id: 3, type: 'asteroid' } });
  const craft = resolveCollisionConsequence({ ...common, other: { id: 4, type: 'ship' } });
  // 2026-08-21 deliberate gameplay change: environment surfaces never steal the helm, even with
  // fresh weapon provenance — a post-shot rock graze must read as a scrape, not a concussion.
  // The bounded damage/debris payoff stays; helm loss requires hard craft-on-craft contact.
  assert.equal(terrain.control, 'none',
    'terrain contact must not stagger or tumble, even when the victim was just shot');
  assert.equal(terrain.staggerTicks, 0);
  assert.ok(terrain.impactDamage > 0 && terrain.debrisCount > 0,
    'high-momentum terrain contact must produce bounded damage/debris payoff');
  assert.ok(['stagger', 'tumble'].includes(craft.control),
    'combat-attributed craft contact still takes the helm at the Δv floors');
  assert.ok(craft.impactDamage > 0,
    'high-momentum craft contact must produce the authored baseline hull damage');
  assert.ok(craft.impactDamage < terrain.impactDamage,
    'the 0.6 craft baseline stays subordinate to a comparable terrain impact');
}

// 8. New weapon/impulse/consequence paths are gameplay requesters, never motion owners. The
//    injected source is the kill switch: if this audit stops recognizing a direct write, the public
//    check fails even when the current tree happens to be clean.
function assertNewPathMembraneContract() {
  const paths = [
    '../src/combat/damage.js',
    '../src/combat/impulseKernel.js',
    '../src/systems/collisionConsequences.js',
  ];
  const entries = paths.map((path) => ({
    path,
    source: readFileSync(new URL(path, import.meta.url), 'utf8'),
  }));
  const weaponsPath = '../src/systems/weapons.js';
  const weaponsSource = readFileSync(new URL(weaponsPath, import.meta.url), 'utf8');
  const packetBuilderStart = weaponsSource.indexOf('export function buildWeaponDamagePacket');
  assert.ok(packetBuilderStart >= 0, 'weapons impulse packet builder must remain reachable');
  // The older homing-missile block has two named direct writes in the T2 debt list. Step 8 is
  // forbidden from repairing them, so audit the newly introduced request path rather than hiding
  // those violations behind a broad exemption.
  entries.push({
    path: `${weaponsPath}#buildWeaponDamagePacket`,
    source: weaponsSource.slice(packetBuilderStart),
  });
  assert.deepEqual(auditPhysicsMembraneSources(entries), [],
    'PQ-009 requester paths contain a direct velocity write');
  const injected = auditPhysicsMembraneSources([{
    path: '<injected-direct-write>',
    source: 'function violate(target) { target.vel.x += 1; }',
  }]);
  assert.equal(injected.length, 1,
    'membrane audit must fail closed on an injected direct velocity write');
}

// ---- harness: real impulseCharges.update; the mock port is the only allowed vel mutator ----

function createHarness({ targetPos }) {
  const bus = createBus();
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 32,
    data: {},
  };
  // Armed free charge at (100, 0) — outside stick range of both the player (dist 100) and the
  // target (dist >= 20 > stickRadius + surface), so _tickCharges can't re-stick it mid-check.
  const charge = {
    id: CHARGE_ID, type: 'charge', alive: true, team: 'player',
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 1.2, mass: 0.5,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: PLAYER_ID,
      hostId: null, localOffset: null, armed: true, spawnedAt: 0,
    },
  };
  const target = {
    id: TARGET_ID, type: 'ship', alive: true, team: 'pirate',
    pos: { ...targetPos }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: TARGET_MASS,
    hull: 100, data: {},
  };
  const state = {
    mode: 'flight',
    tick: 500,
    simTime: 500 / 60,
    playerId: PLAYER_ID,
    entities: new Map([[PLAYER_ID, player], [CHARGE_ID, charge], [TARGET_ID, target]]),
    entityList: [player, charge, target],
    input: { actions: { chargeThrow: false, chargeDetonate: false } },
  };

  const damage = [];
  const helpers = {
    routeCombatDamage(request) { damage.push(request); return { ok: true }; },
  };
  const system = Object.create(impulseCharges);
  system.init({ state, bus, helpers, registry: null });

  const detonated = [];
  bus.on('charge:detonated', (p) => detonated.push(p));

  return { state, bus, system, helpers, damage, detonated };
}

// A port that records every applyImpulse and (optionally) performs the mutation itself — the
// authority behavior: Δv = impulse / mass onto the entity it owns.
function recordingPort(applied, { mutate, state } = {}) {
  return {
    applyImpulse(input) {
      applied.push(input);
      if (mutate && state) {
        const ent = state.entities.get(input.entityId);
        if (ent) {
          const mass = Math.max(0.1, ent.mass || 1);
          ent.vel.x += input.impulse.x / mass;
          ent.vel.z += input.impulse.z / mass;
        }
      }
      return true;
    },
  };
}
