// DoD §22 missile / point-defense / evasion acceptance scenario (INTEGRATION_MAP §11).
//
// Drives the PRODUCTION weapons homing-steering + countermeasures systems on hand-constructed
// entities/projectiles — the same code the live sim runs every tick. Proves the target-centric
// combat loop the spec §9.1/§9.3 demands:
//
//   11. Missile homing: a fired missile's guidance steers it toward a moving target (the bearing
//       to target converges). This is the accessible guided-ordnance path.
//   12. Chaff countermeasure: deploying chaff diverts the homing missile off its target onto a
//       decoy (the missile no longer tracks the original ship).
//   13. ECM jammer: deploying ECM zeroes the missile's turnRate so it flies straight (it stops
//       tracking) — missile-defense that doesn't rely on dodging.
import assert from 'node:assert/strict';
import { weapons } from '../src/systems/weapons.js';
import { countermeasures } from '../src/systems/countermeasures.js';

const DT = 1 / 60;
const round = (v, p = 4) => Number(v.toFixed(p));
const wrapAngle = (a) => { let x = a % (Math.PI * 2); if (x <= -Math.PI) x += Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; return x; };

// Minimal state shape the two systems read: entityList, entityIndex (projectiles), entities map,
// helpers.getEntity, mode, rng, and a bus. This is the live contract; we hand-feed it deterministically.
function makeState(ships, projectiles) {
  const entities = new Map();
  for (const s of ships) entities.set(s.id, s);
  for (const p of projectiles) entities.set(p.id, p);
  const entityList = [...ships, ...projectiles];
  return {
    mode: 'flight', entities, entityList,
    entityIndex: { projectiles },
    helpers: { getEntity: (id) => entities.get(id) },
    rng: (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); }; })(),
    bus: { emit: () => {} },
    input: {},
    ui: {},
  };
}
function makeShip(id, x, z, rot = 0) {
  return { id, type: 'ship', alive: true, team: 1, factionId: 'f_test',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot, angVel: 0, radius: 12,
    cap: 1000, hull: 500, shield: 200, maxSpeed: 200,
    data: { weapons: [], fittings: [], combat: {}, derived: { cap: 1000 } } };
}
function makeMissile(id, x, z, vx, vz, targetId) {
  const heading = Math.atan2(vz, vx);
  return { id, type: 'projectile', alive: true,
    pos: { x, z }, vel: { x: vx, z: vz }, rot: heading, radius: 2,
    data: { kind: 'missile', targetId, turnRate: 3.5, projSpeed: 320, projAccel: 0, armed: true, ownerId: 1, ttl: 6, damage: 80 } };
}

const evidence = { schema: 'spaceface.dodMissilePdEvasion.v1', dt: DT, scenarios: {} };

// Bind minimal helpers so the stateless methods (_steerHoming, countermeasures.update) work without
// the full registry RNG/helpers. _steerHoming only reads helpers.getEntity; countermeasures.update
// reads state.entityList/entityIndex/rng/bus. We call them as plain functions, avoiding weapons.init
// (which needs hash32/mulberry32 RNG seeding we don't require for these pure steering/CM paths).
// _steerHoming resolves the missile's target via this.helpers.getEntity(id). Point it at the active
// state's entity map so homing can find the moving target. (Per-scenario states share this lookup.)
let activeState = null;
weapons.helpers = { getEntity: (id) => activeState && activeState.entities.get(id) };
const steerHoming = weapons._steerHoming.bind(weapons);
// countermeasures.update references this.helpers/state/bus defensively; bind them so its update
// loop resolves (we bypass _tryDeploy by setting cm directly, but the apply-effects loop reads these).
countermeasures.helpers = { getEntity: () => null };
countermeasures.state = { mode: 'flight' };
countermeasures.bus = { emit: () => {} };

// ── Scenario 11: missile homing (the missile steers toward a moving target) ──
{
  const target = makeShip(2, 400, 100); target.vel = { x: 0, z: 25 }; // drifting +Z
  const missile = makeMissile(10, 0, 0, 320, 0, 2); // fired +X toward where the target WAS
  const state = makeState([target], [missile]);
  // Bind helpers to this state for the homing steering.
  state.helpers.getEntity = (id) => state.entities.get(id);

  const initialBearing = Math.atan2(target.pos.z - missile.pos.z, target.pos.x - missile.pos.x);
  const initialDist = Math.hypot(target.pos.x - missile.pos.x, target.pos.z - missile.pos.z);
  let minDist = Infinity, closestTick = -1;
  const initialHeading = Math.atan2(missile.vel.z, missile.vel.x);
  activeState = state;
  for (let i = 0; i < 360; i++) { // 6s — enough for the turnRate-3.5 missile to close
    target.pos.x += target.vel.x * DT; target.pos.z += target.vel.z * DT; // target moves
    steerHoming(DT, state);
    missile.pos.x += missile.vel.x * DT; missile.pos.z += missile.vel.z * DT;
    const d = Math.hypot(target.pos.x - missile.pos.x, target.pos.z - missile.pos.z);
    if (d < minDist) { minDist = d; closestTick = i; }
  }
  const finalMissileHeading = Math.atan2(missile.vel.z, missile.vel.x);
  const totalTurn = Math.abs(wrapAngle(finalMissileHeading - initialHeading));
  // The missile was fired at heading 0 (+X) toward where the target WAS; the target drifts +Z at 25
  // wu/s. A BALLISTIC missile (no steering) would miss by the full drift offset (~150 units by 6s).
  // A HOMING missile steers toward the target and closes to within its turn-radius of it.
  const ballisticMissBy = target.pos.z - 0; // where a straight +X missile ends up vs the target's Z
  assert.ok(totalTurn > 0.5,
    `homing: the missile should steer significantly off its launch heading (turned ${totalTurn.toFixed(2)} rad)`);
  assert.ok(minDist < initialDist * 0.5,
    `homing: the missile should close to within half the initial distance (min ${minDist.toFixed(0)} vs initial ${initialDist.toFixed(0)})`);
  assert.ok(minDist < ballisticMissBy * 0.3,
    `homing: the homing missile should miss far less than a ballistic one (min ${minDist.toFixed(0)} vs ballistic miss ~${ballisticMissBy.toFixed(0)})`);
  evidence.scenarios.missileHoming = {
    initialBearing: round(initialBearing, 3), initialDist: round(initialDist, 0),
    totalTurnRad: round(totalTurn, 3), minDist: round(minDist, 0), closestTick,
    finalMissileHeading: round(finalMissileHeading, 3),
    pass: true, contract: 'A homing missile steers toward a moving target and closes distance (vs a ballistic miss)',
  };
  console.log(`[11] missile homing: turned ${totalTurn.toFixed(2)} rad off launch heading, closed to ${minDist.toFixed(0)} (initial ${initialDist.toFixed(0)}, ballistic miss ~${ballisticMissBy.toFixed(0)}) PASS`);
}

// ── Scenario 12: chaff diverts the missile off its target ──
{
  const owner = makeShip(1, 0, 0);
  const target = makeShip(2, 200, 0); // stationary target the missile is locked onto
  const missile = makeMissile(10, 100, 0, 320, 0, 2);
  const state = makeState([owner, target], [missile]);
  state.helpers.getEntity = (id) => state.entities.get(id);

  // Equip the target with a chaff dispenser and deploy it (set the active effect the countermeasures
  // system reads). This mirrors what countermeasures._tryDeploy writes.
  const chaffCfg = { kind: 'chaff', radius: 600, divertPct: 1.0, duration: 4 }; // divertPct 1 = always divert
  target.data.cm = { cooldownT: 0, effectT: 4, effect: { cfg: chaffCfg, decoyId: 9999 } };
  // Run one countermeasures tick: it should divert the missile to the decoy.
  countermeasures.update(DT, state);

  assert.equal(missile.data.diverted, true,
    `chaff: the missile should be flagged diverted by chaff (diverted=${missile.data.diverted})`);
  assert.notEqual(missile.data.targetId, 2,
    `chaff: the missile should no longer target the original ship (targetId=${missile.data.targetId})`);
  evidence.scenarios.chaffDivert = {
    diverted: missile.data.diverted, newTargetId: missile.data.targetId, originalTargetId: 2,
    pass: true, contract: 'Chaff diverts an incoming homing missile off its target onto a decoy',
  };
  console.log(`[12] chaff divert: missile targetId ${2} -> ${missile.data.targetId} (diverted=${missile.data.diverted}) PASS`);
}

// ── Scenario 13: ECM jams the missile's guidance (turnRate zeroed) ──
{
  const target = makeShip(2, 300, 0);
  const missile = makeMissile(10, 0, 0, 320, 0, 2); missile.data.turnRate = 3.5;
  const state = makeState([target], [missile]);
  state.helpers.getEntity = (id) => state.entities.get(id);
  const originalTurnRate = missile.data.turnRate;

  // Deploy ECM (jams guidance within radius).
  const ecmCfg = { kind: 'ecm', radius: 600, turnRateMult: 0.0, duration: 4 };
  target.data.cm = { cooldownT: 0, effectT: 4, effect: { cfg: ecmCfg } };
  countermeasures.update(DT, state);

  assert.equal(missile.data.turnRate, 0,
    `ecm: ECM should zero the missile's turnRate (got ${missile.data.turnRate})`);
  assert.equal(missile.data._jammedTurnRate, originalTurnRate,
    `ecm: the original turnRate should be stored for restoration (got ${missile.data._jammedTurnRate})`);

  // With turnRate zeroed, homing no longer curves the missile — it flies straight (evasion works).
  activeState = state;
  const headingBefore = Math.atan2(missile.vel.z, missile.vel.x);
  for (let i = 0; i < 30; i++) { steerHoming(DT, state); missile.pos.x += missile.vel.x * DT; missile.pos.z += missile.vel.z * DT; }
  const headingAfter = Math.atan2(missile.vel.z, missile.vel.x);
  assert.ok(Math.abs(wrapAngle(headingAfter - headingBefore)) < 1e-6,
    `ecm: a jammed missile should fly straight (no steering); heading drift ${Math.abs(wrapAngle(headingAfter - headingBefore)).toExponential(2)}`);

  evidence.scenarios.ecmJam = {
    originalTurnRate, jammedTurnRate: missile.data.turnRate,
    storedForRestore: missile.data._jammedTurnRate,
    headingDriftWhenJammed: round(Math.abs(wrapAngle(headingAfter - headingBefore)), 8),
    pass: true, contract: 'ECM jams a missile guidance (zeros turnRate) so it flies straight — missile-defense without dodging',
  };
  console.log(`[13] ECM jam: missile turnRate ${originalTurnRate} -> ${missile.data.turnRate} (stored ${missile.data._jammedTurnRate}), jammed heading drift ${Math.abs(wrapAngle(headingAfter - headingBefore)).toExponential(2)} PASS`);
}

console.log('\nDoD §22 missile / point-defense / evasion evidence bundle:');
console.log(JSON.stringify(evidence, null, 2));
console.log('\nAll missile/PD/evasion DoD §22 scenarios PASS — driving the production weapons + countermeasures systems.');
