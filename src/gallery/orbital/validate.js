// Authoring guards. Pure: no sim step and no ambient randomness. No Three.js objects.

import { glassHalfExtents } from '../../render/tabletopPolicy.js';

const ZOOM = 144;
const FOV = 50;
const TILT = 60;
const GLASS_MARGIN = 8;

export const GLASS = Object.freeze({
  desktop: glassHalfExtents(ZOOM, FOV, 16 / 9, TILT),
  constrained: glassHalfExtents(ZOOM, FOV, 4 / 3, TILT),
  portrait: glassHalfExtents(ZOOM, FOV, 9 / 16, TILT),
});

const FAMILIES = ['momentum', 'sling', 'chain', 'cargo', 'field', 'rescue'];

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function inside(px, pz, volume) {
  const dx = px - volume.x;
  const dz = pz - volume.z;
  return dx * dx + dz * dz <= volume.r * volume.r;
}

/**
 * @param {object} scenario
 * @returns {string[]} human-readable problems. Empty means the contract is launchable.
 */
export function validateScenario(scenario) {
  const issues = [];
  if (!scenario || scenario.schema !== 'spaceface.orbitalGallery.v1') {
    issues.push('schema');
    return issues;
  }
  if (!scenario.id || typeof scenario.id !== 'string') issues.push('id');
  if (!FAMILIES.includes(scenario.family)) issues.push(`family ${scenario.family}`);
  if (!scenario.inference || typeof scenario.inference !== 'string') issues.push('inference');
  if (!finite(scenario.seed)) issues.push('seed');
  if (!finite(scenario.limitTicks) || scenario.limitTicks < 60 || scenario.limitTicks > 900) {
    issues.push('limitTicks');
  }
  const player = scenario.player;
  if (!player || !finite(player.x) || !finite(player.z)) issues.push('player');
  const bodies = Array.isArray(scenario.bodies) ? scenario.bodies : [];
  if (bodies.length < 1 || bodies.length > 10) issues.push(`body count ${bodies.length}`);
  const roles = new Set();
  let focus = null;
  for (const body of bodies) {
    if (!body || !body.role || roles.has(body.role)) {
      issues.push(`role ${body && body.role}`);
      continue;
    }
    roles.add(body.role);
    if (!finite(body.x) || !finite(body.z)) issues.push(`${body.role} pos`);
    if (!finite(body.radius) || body.radius < 4) issues.push(`${body.role} radius`);
    if (!finite(body.mass) || body.mass <= 0) issues.push(`${body.role} mass`);
    if (body.focus) focus = body;
    const dx = Math.abs(body.x - player.x) + body.radius;
    const dz = Math.abs(body.z - player.z) + body.radius;
    if (dx > GLASS.constrained.halfX - GLASS_MARGIN || dz > GLASS.constrained.halfZ - GLASS_MARGIN) {
      issues.push(`${body.role} outside constrained glass`);
    }
  }
  if (!focus) issues.push('focus body');
  else {
    const dx = Math.abs(focus.x - player.x) + focus.radius;
    const dz = Math.abs(focus.z - player.z) + focus.radius;
    if (dx > GLASS.portrait.halfX - 6 || dz > GLASS.portrait.halfZ - GLASS_MARGIN) {
      issues.push('focus outside portrait glass');
    }
  }
  const playerR = 14;
  for (const body of bodies) {
    const d = Math.hypot(body.x - player.x, body.z - player.z);
    if (d < playerR + body.radius + 1) issues.push(`${body.role} overlaps pilot`);
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < a.radius + b.radius + 0.5) issues.push(`${a.role} overlaps ${b.role}`);
    }
  }
  const pockets = Array.isArray(scenario.pockets) ? scenario.pockets : [];
  if (pockets.length < 1) issues.push('pockets');
  for (const pocket of pockets) {
    if (!pocket.id || !roles.has(pocket.role)) issues.push(`pocket ${pocket && pocket.id}`);
    if (!finite(pocket.x) || !finite(pocket.z) || !finite(pocket.r) || pocket.r < 8) {
      issues.push(`pocket geom ${pocket && pocket.id}`);
    }
    const dx = Math.abs(pocket.x - player.x) + pocket.r;
    const dz = Math.abs(pocket.z - player.z) + pocket.r;
    if (dx > GLASS.constrained.halfX - GLASS_MARGIN || dz > GLASS.constrained.halfZ - GLASS_MARGIN) {
      issues.push(`pocket ${pocket.id} outside glass`);
    }
    const body = bodies.find((b) => b.role === pocket.role);
    if (body && inside(body.x, body.z, pocket)) issues.push(`${body.role} starts inside ${pocket.id}`);
    if (!finite(pocket.minTravel) || pocket.minTravel < 8) issues.push(`minTravel ${pocket && pocket.id}`);
  }
  const strategies = Array.isArray(scenario.strategies) ? scenario.strategies : [];
  if (strategies.length < 1) issues.push('strategies');
  const seen = new Set();
  for (const strategy of strategies) {
    if (!strategy || !strategy.id || seen.has(strategy.id)) issues.push('strategy id');
    seen.add(strategy && strategy.id);
    if (!Array.isArray(strategy.tape) || strategy.tape.length < 1) issues.push(`tape ${strategy && strategy.id}`);
  }
  return issues;
}

export function validateCatalog(scenarios) {
  const issues = [];
  if (!Array.isArray(scenarios) || scenarios.length !== 24) {
    issues.push(`count ${scenarios && scenarios.length}`);
    return issues;
  }
  const ids = new Set();
  const inferences = new Set();
  const byFamily = Object.create(null);
  let duals = 0;
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) issues.push(`dup ${scenario.id}`);
    ids.add(scenario.id);
    if (inferences.has(scenario.inference)) issues.push(`dup inference ${scenario.id}`);
    inferences.add(scenario.inference);
    byFamily[scenario.family] = (byFamily[scenario.family] || 0) + 1;
    if (scenario.strategies && scenario.strategies.length >= 2) duals += 1;
    for (const issue of validateScenario(scenario)) issues.push(`${scenario.id}: ${issue}`);
  }
  for (const family of FAMILIES) {
    if (byFamily[family] !== 4) issues.push(`${family} has ${byFamily[family] || 0}`);
  }
  if (duals < 12) issues.push(`dual strategies ${duals}`);
  const syntheses = scenarios.filter((s) => s.synthesis === true);
  if (syntheses.length !== 6) issues.push(`syntheses ${syntheses.length}`);
  return issues;
}
