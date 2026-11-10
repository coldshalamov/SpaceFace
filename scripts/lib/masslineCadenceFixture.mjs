/** Reduced two-body proving ground, NOT the game's Rapier/SG-02 world.
 * Both laws use exactly this same unilateral central spring and fixed 4-substep integrator.
 * It demonstrates operator response and honest release; it cannot establish Crucible kill rate.
 */
import { createCadenceWinch, stepCadenceWinch, readCadencePair, rateCadenceTechnique } from '../../src/systems/masslineControlLaw.js';
import { solveCadenceRelease, forecastCadenceWindow, sweptDiskContact } from '../../src/combat/masslineReleaseGeometry.js';
import { solveThrowSolution as baselineSolution } from '../../test/massline-cadence/baseline/tetherFireControl.js';
import { baselineReelDelta } from '../../test/massline-cadence/baseline/gameplayMethods.js';
export const DT = 1 / 60;
export function seeded(seed = 4242) { let n = seed >>> 0; return () => {
  n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; }
const make = (id, x, z, vx, vz, mass, radius) => ({ id, pos: {x,z}, vel: {x:vx,z:vz}, mass, radius });
export function createFixture(seed = 4242, variant = 'cadence') {
  const rng = seeded(seed), theta = -0.65 + (rng() - 0.5) * 0.2;
  const radius = 120, tangent = 100, ma = 120, mb = 80, mu = ma * mb / (ma + mb);
  const rx = Math.cos(theta) * radius, rz = Math.sin(theta) * radius;
  const vx = -Math.sin(theta) * tangent, vz = Math.cos(theta) * tangent;
  return { seed, rng, variant, tick: 0, simTime: 0,
    owner: make('pilot', -rx * .4, -rz * .4, -vx * .4, -vz * .4, ma, 6),
    payload: make('payload', rx * .6, rz * .6, vx * .6, vz * .6, mb, 10),
    target: make('target', 65 + rng() * 15, 200, -3 + rng() * 6, 0, 220, 13),
    restLength: radius - (mu * tangent * tangent / radius) / 1200,
    winch: createCadenceWinch(), phase: 'coast', tension: 0, attached: true,
    outcome: null, release: null, lastDelta: 0, mechanicalWork: 0,
    springK: 1200, springDamping: 48, minLength: 22, maxLength: 230, reelRate: 60,
  };
}
export function cutFixture(s) {
  if (!s.attached) return false;
  const solution = solveCadenceRelease(s.payload, s.target);
  s.release = { tick: s.tick, time: s.simTime, solution, pos: {...s.payload.pos}, vel: {...s.payload.vel} };
  s.attached = false; s.winch.velocity = 0; s.phase = 'released';
  return true; // Exactly zero impulse on both bodies.
}
export function stepFixture(s, command = {}) {
  if (command.cut) cutFixture(s);
  s.lastDelta = 0;
  if (s.attached) {
    const input = { axis: command.reel || 0, dt: DT, restLength: s.restLength,
      minLength: s.minLength, maxLength: s.maxLength, reelRate: s.reelRate, tension: s.tension,
      orbit: command.orbit !== false, pump: !!command.pump, pair: readCadencePair(s.owner, s.payload, s.restLength) };
    if (s.variant === 'cadence') {
      const proposal = stepCadenceWinch(s.winch, input);
      s.winch = proposal.runtime; s.phase = proposal.phase; s.lastDelta = proposal.delta;
    } else {
      s.lastDelta = baselineReelDelta(input); s.winch.velocity = s.lastDelta / DT;
      s.phase = input.axis < 0 ? 'draw' : input.axis > 0 ? 'pay_out' : 'coast';
    }
    s.restLength += s.lastDelta;
    s.mechanicalWork += Math.max(0, -s.lastDelta) * s.tension;
  }
  const h = DT / 4;
  for (let i = 0; i < 4; i++) {
    const p = s.owner, b = s.payload, t = s.target;
    let rx = b.pos.x - p.pos.x, rz = b.pos.z - p.pos.z, r = Math.hypot(rx, rz);
    const nx = rx / Math.max(r, 1e-9), nz = rz / Math.max(r, 1e-9);
    if (s.attached) {
      // Ship thrusters are the only external work source besides commanded winching.
      const thrust = Math.max(-1, Math.min(1, command.turn || 0)) * 22;
      p.vel.x += nz * thrust * h; p.vel.z -= nx * thrust * h;
      const radial = (b.vel.x - p.vel.x) * nx + (b.vel.z - p.vel.z) * nz;
      s.tension = r > s.restLength ? Math.min(40000, Math.max(0, s.springK * (r - s.restLength) + s.springDamping * radial)) : 0;
      const j = Math.min(40000, s.tension) * h;
      p.vel.x += nx * j / p.mass; p.vel.z += nz * j / p.mass;
      b.vel.x -= nx * j / b.mass; b.vel.z -= nz * j / b.mass;
    } else s.tension = 0;
    const contact = !s.attached && !s.outcome && sweptDiskContact(t.pos.x - b.pos.x, t.pos.z - b.pos.z,
      t.vel.x - b.vel.x, t.vel.z - b.vel.z, t.radius + b.radius, h);
    if (contact?.hit) s.outcome = { hit: true, tick: s.tick, time: s.simTime + i * h + contact.impactTime,
      relativeSpeed: Math.hypot(t.vel.x - b.vel.x, t.vel.z - b.vel.z) };
    for (const body of [p,b,t]) { body.pos.x += body.vel.x * h; body.pos.z += body.vel.z * h; }
  }
  s.tick++; s.simTime = s.tick * DT;
  if (!s.attached && !s.outcome && s.simTime - s.release.time >= 6) s.outcome = { hit: false, tick: s.tick };
  return s;
}
export function readFixture(s, withWindow = true) {
  const pair = readCadencePair(s.owner, s.payload, s.restLength);
  const exact = solveCadenceRelease(s.payload, s.target);
  const shown = s.variant === 'cadence' ? exact : baselineSolution(s.payload, s.target, {omega:pair.omega});
  const window = withWindow && s.attached ? forecastCadenceWindow(s.owner, s.payload, s.target, {restLength:s.restLength}) : null;
  return { pair, exact, shown, window, technique: rateCadenceTechnique(pair, {phase:s.phase}) };
}
export function measureFixture(s) {
  const a=s.owner,b=s.payload,mu=a.mass*b.mass/(a.mass+b.mass),pair=readCadencePair(a,b,s.restLength);
  return { tick:s.tick,restLength:s.restLength,rate:s.lastDelta/DT,tangentialSpeed:Math.abs(pair.tangentialSpeed),
    radialSpeed:pair.radialSpeed,tension:s.tension,work:s.mechanicalWork,
    momentumX:a.mass*a.vel.x+b.mass*b.vel.x,momentumZ:a.mass*a.vel.z+b.mass*b.vel.z,
    angularMomentum:mu*pair.distance*pair.tangentialSpeed };
}
