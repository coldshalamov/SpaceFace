// Phase 2b system #7 bench: collision response / ram consequences. The REAL physics (rapier-dynamic)
// + collisionConsequences + impulseKernel + tumbleStates path, focused bundle.
// A mover (an NPC hull by type, or the player) is driven at a fixed velocity until first contact
// with a target (static asteroid, dynamic loose rock, or another NPC hull), then released.
// Incidence: impact parameter b = (Rm+Rt)·sin(angle) -> 0° head-on, 80° grazing.
// Reports: pre-solve closing speed, normal restitution (post/pre normal speed), spin after,
// consequence control/stagger, helm-loss seconds, impact damage / hullMax, killed, contacts count.
import { createLabWorld, SIM_DT } from '../labWorld.mjs';
import * as cc from '../../../src/systems/collisionConsequences.js';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
const DEF = new Map(ENEMY_TYPES.map((d) => [d.id, d]));

export const MOVERS = ['wasp_swarmer', 'corsair_raider', 'reaver_pirate', 'bruiser_brawler', 'player'];
export const TARGETS = ['asteroid', 'rock', 'bruiser', 'wasp'];
export const SPEEDS = [20, 30, 40, 50, 60, 80, 100, 150, 200, 300];
export const ANGLES = [0, 30, 60, 80];
export const SCENARIOS = {};
for (const m of MOVERS) for (const t of TARGETS) for (const v of SPEEDS) for (const a of ANGLES) {
  SCENARIOS[`${m}|${t}|${v}|${a}`] = { mover: m, target: t, speed: v, angle: a };
}
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS).filter((k) => k.endsWith('|0'));
// Cruise: player flies a straight line at a fixed speed through a seeded rock field, 60 s.
for (const v of [80, 160, 260]) SCENARIOS[`cruise|${v}`] = { cruise: true, speed: v };
// Field: the player circles (r 250, 90 wu/s, invulnerable, guns cold) inside a seeded rock field while a
// live pack (AI free) fights it for 60 s. Counts NPC rock/ship contacts, collision kills, helm losses.
for (const pack of ['wasp', 'mixed']) for (const dens of ['sparse', 'dense']) SCENARIOS[`field|${pack}|${dens}`] = { field: true, pack, dens };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = (e) => (e && (e.physicsBody?.radius || e.radius)) || 10;

export const VARIANTS = { cap25: { selfCrashCap: 0.25 }, cap35: { selfCrashCap: 0.35 }, cap50: { selfCrashCap: 0.5 }, cap75: { selfCrashCap: 0.75 } };
export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  if (typeof cc.setCollisionLab === 'function') cc.setCollisionLab(params);
  const sc = typeof id === 'object' ? id : SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario ${id}`);
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' } });
  try { return sc.field ? await field(world, sc, seed) : sc.cruise ? await cruise(world, sc, seed) : await impact(world, sc, seed); }
  finally { world.dispose(); if (typeof cc.setCollisionLab === 'function') cc.setCollisionLab({}); }
}

async function impact(world, sc, seed) {
  const st = world.state;
  const playerMover = sc.mover === 'player';
  const pl = world.spawnPlayer({ pos: playerMover ? { x: -400, z: 0 } : { x: 0, z: -600 }, rot: 0 });
  let target;
  if (sc.target === 'asteroid') target = world.spawnAsteroid({ pos: { x: 0, z: 0 }, radius: 22 });
  else if (sc.target === 'rock') target = world.spawnRock({ pos: { x: 0, z: 0 }, radius: 10, mass: 60 });
  else target = world.spawnEnemy({ typeId: sc.target === 'bruiser' ? 'bruiser_brawler' : 'wasp_swarmer', level: 1, pos: { x: 0, z: 0 }, rot: Math.PI / 2 });
  const mover = playerMover ? pl : world.spawnEnemy({ typeId: sc.mover, level: (DEF.get(sc.mover).levelRange || [1])[0], pos: { x: -400, z: 0 }, rot: 0 });
  if (playerMover) { pl.flags = pl.flags || {}; }
  const b = (R(mover) + R(target)) * Math.sin(sc.angle * Math.PI / 180) * 0.98;
  // Start 1.5 s of travel (>= 60 wu) short of contact so every speed reaches the target well inside the cap.
  const x0 = -(R(mover) + R(target) + Math.max(60, sc.speed * 1.5));
  mover.pos.x = x0; mover.pos.z = b; mover.rot = 0;
  await world.prepare();
  const HP = (e) => Math.max(0, e.shield || 0) + Math.max(0, e.armorHp || 0) + Math.max(0, e.hull || 0);
  const hullMax = HP(mover) || 1; const hull0 = HP(mover);
  const thull0 = target.type === 'ship' ? HP(target) : null, thullMax = thull0 || 1;
  let firstImpact = null, contacts = 0; const cons = [];
  world.runtime.bus.on('physics:impact', (p) => {
    if (!p) return; const ids = [p.aId, p.bId];
    if (!ids.includes(mover.id)) return;
    contacts++;
    if (!firstImpact) firstImpact = { tick: st.tick, pre: p.preSolveClosingSpeed, nx: p.normal?.x, nz: p.normal?.z };
  });
  world.runtime.bus.on('combat:collisionConsequence', (p) => { if (p) cons.push({ t: p.targetId, control: p.control, st: p.staggerTicks, dmg: p.impactDamage, dv: p.deltaV, helm: p.helmLossSeconds, killed: p.targetKilled }); });
  let pre = null, post = null, spinPost = 0, t = 0, impactTick = null;
  const cap = Math.round(6 / SIM_DT);
  let helmLostTicks = 0;
  for (; t < cap; t++) {
    world.keys([]);
    const vBefore = { x: mover.vel.x, z: mover.vel.z };
    world.step();
    // Drive by writing pose+velocity AFTER each step (a kinematic carry: a helmed hull's flight cap
    // would otherwise clamp the approach to its maxSpeed); released at first contact. Pre-impact velocity = what the solver saw.
    if (firstImpact && impactTick == null) { impactTick = st.tick; pre = vBefore; }
    if (!firstImpact) { mover.vel.x = sc.speed; mover.vel.z = 0; mover.pos.x = x0 + sc.speed * (t + 1) * SIM_DT; mover.pos.z = b; mover.rot = 0; if ('angVel' in mover) mover.angVel = 0; if (target.vel && sc.target !== 'asteroid') { target.vel.x = 0; target.vel.z = 0; target.pos.x = 0; target.pos.z = 0; } }
    if (impactTick != null && st.tick === impactTick + 3) { post = { x: mover.vel.x, z: mover.vel.z }; spinPost = Math.abs(mover.angVel || 0); }
    if (impactTick != null) {
      const ts = mover.data?.tumble || mover.tumble; const lost = !!(mover._helmLost || (ts && ts.state && ts.state !== 'none' && ts.state !== 'ok'));
      if (lost) helmLostTicks++;
    }
    if (mover.alive === false || !st.entities.get(mover.id)) break;
    if (impactTick != null && st.tick > impactTick + 240) break;
  }
  let e = null;
  if (firstImpact && pre && post) {
    const n = { x: firstImpact.nx || 1, z: firstImpact.nz || 0 }; const nl = Math.hypot(n.x, n.z) || 1; n.x /= nl; n.z /= nl;
    const vin = Math.abs(pre.x * n.x + pre.z * n.z); const vout = Math.abs(post.x * n.x + post.z * n.z);
    e = vin > 1 ? vout / vin : null;
  }
  const mine = cons.filter((c) => c.t === mover.id);
  const theirs = cons.filter((c) => c.t === target.id);
  return {
    key: `${sc.mover}|${sc.target}|${sc.speed}|${sc.angle}`, mover: sc.mover, target: sc.target, speed: sc.speed, angle: sc.angle, seed,
    hit: !!firstImpact, pre: firstImpact ? +(firstImpact.pre ?? NaN).toFixed(1) : null, contacts,
    restitution: e == null ? null : +e.toFixed(3), spin: +spinPost.toFixed(3),
    speedAfter: post ? +Math.hypot(post.x, post.z).toFixed(1) : null,
    control: mine.length ? mine.map((c) => c.control).sort().slice(-1)[0] : 'none', staggerTicks: mine.reduce((s, c) => s + c.st, 0),
    helmS: +Math.max(0, ...mine.map((c) => c.helm || 0)).toFixed(2), helmLostS: +(helmLostTicks * SIM_DT).toFixed(2),
    dmgFrac: +(Math.max(0, hull0 - HP(mover)) / hullMax).toFixed(3), impactDmg: +mine.reduce((s, c) => s + c.dmg, 0).toFixed(1),
    killed: mover.alive === false || !st.entities.get(mover.id),
    tgtDmgFrac: thull0 != null ? +(Math.max(0, thull0 - HP(target)) / thullMax).toFixed(3) : null,
    tgtKilled: theirs.some((c) => c.killed), hullMax,
  };
}

async function cruise(world, sc, seed) {
  const st = world.state; const rng = mulberry32(seed * 7919 + 13);
  const pl = world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: 0 });
  const L = sc.speed * 60;
  for (let i = 0; i < Math.round(L / 60); i++) {
    world.spawnAsteroid({ pos: { x: 100 + rng() * L, z: (rng() * 2 - 1) * 120 }, radius: 12 + rng() * 26 });
  }
  await world.prepare();
  const hull0 = pl.hull; let contacts = 0, worst = 0; let lostTicks = 0;
  world.runtime.bus.on('physics:impact', (p) => { if (p && (p.aId === pl.id || p.bId === pl.id)) { contacts++; worst = Math.max(worst, p.preSolveClosingSpeed || 0); } });
  let maxDev = 0;
  for (let t = 0; t < Math.round(60 / SIM_DT); t++) {
    world.aim.x = pl.pos.x + 1000; world.aim.z = 0;
    world.keys(['KeyW']);
    world.step();
    // cruise control: hold forward speed, steer back to the lane (a pilot correcting)
    const fx = sc.speed - pl.vel.x; pl.vel.x += Math.max(-4, Math.min(4, fx)); pl.vel.z += Math.max(-4, Math.min(4, -pl.pos.z * 0.05 - pl.vel.z * 0.3));
    if (pl._helmLost || (pl.data?.tumble && pl.data.tumble.state && pl.data.tumble.state !== 'none')) lostTicks++;
    maxDev = Math.max(maxDev, Math.abs(pl.pos.z));
    if (pl.alive === false) break;
  }
  return { key: `cruise|${sc.speed}`, cruise: true, speed: sc.speed, seed, contacts, worstPre: +worst.toFixed(1), hullLostFrac: +((hull0 - (pl.hull || 0)) / (pl.hullMax || 1)).toFixed(3), died: pl.alive === false, helmLostS: +(lostTicks * SIM_DT).toFixed(2), maxDev: +maxDev.toFixed(0) };
}

async function field(world, sc, seed) {
  const st = world.state; const rng = mulberry32(seed * 104729 + 7);
  const pl = world.spawnPlayer({ pos: { x: 250, z: 0 }, rot: Math.PI / 2 });
  pl.flags = pl.flags || {}; pl.flags.invuln = true; pl._invulnUntil = Infinity;
  const n = sc.dens === 'dense' ? 60 : 25;
  const rocks = [];
  for (let i = 0; i < n; i++) {
    const r = 12 + rng() * 30; const a = rng() * Math.PI * 2; const d = 120 + rng() * 700;
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    if (Math.abs(Math.hypot(p.x, p.z) - 250) < r + 25) continue; // keep the player's ring clear
    rocks.push(world.spawnAsteroid({ pos: p, radius: r }));
  }
  const types = sc.pack === 'wasp' ? ['wasp_swarmer', 'wasp_swarmer', 'wasp_swarmer', 'wasp_swarmer']
    : ['wasp_swarmer', 'wasp_swarmer', 'corsair_raider', 'reaver_pirate'];
  const npcs = types.map((t, i) => { const a = (i / types.length) * Math.PI * 2 + rng(); return world.spawnEnemy({ typeId: t, level: (DEF.get(t).levelRange || [1])[0], pos: { x: Math.cos(a) * 900, z: Math.sin(a) * 900 }, rot: a + Math.PI }); });
  await world.prepare();
  const ids = new Set(npcs.map((e) => e.id));
  const killLog = [];
  let terrainHits = 0, craftHits = 0, tumbles = 0, collisionKills = 0, worst = 0, dmg = 0;
  const tough = new Map(npcs.map((e) => [e.id, Math.max(0, e.shield || 0) + Math.max(0, e.armorHp || 0) + Math.max(0, e.hull || 0)]));
  world.runtime.bus.on('combat:collisionConsequence', (p) => {
    if (!p || !ids.has(p.targetId)) return;
    if (p.surface === 'terrain') terrainHits++; else if (p.surface === 'craft') craftHits++;
    if (p.control === 'tumble') tumbles++;
    if (p.targetKilled) { collisionKills++; killLog.push({ self: p.provenance && p.provenance.actorId === p.targetId, player: p.provenance && p.provenance.actorId === st.playerId, tag: p.provenance && p.provenance.tag, actor: p.provenance && p.provenance.actorId, surface: p.surface, feel: p.feelDeltaV && +p.feelDeltaV.toFixed(1), ctl: p.control }); }
    worst = Math.max(worst, p.feelDeltaV || 0); dmg += (p.impactDamage || 0) / (tough.get(p.targetId) || 1);
  });
  for (let t = 0; t < Math.round(60 / SIM_DT); t++) {
    const ang = Math.atan2(pl.pos.z, pl.pos.x) + 90 / 250 * SIM_DT;
    world.keys([]); world.step();
    pl.pos.x = Math.cos(ang) * 250; pl.pos.z = Math.sin(ang) * 250;
    pl.vel.x = -Math.sin(ang) * 90; pl.vel.z = Math.cos(ang) * 90; pl.rot = ang + Math.PI / 2;
  }
  const alive = npcs.filter((e) => e.alive !== false && st.entities.get(e.id)).length;
  return { key: `field|${sc.pack}|${sc.dens}`, field: true, pack: sc.pack, dens: sc.dens, seed, rocks: rocks.length,
    terrainHits, craftHits, tumbles, collisionKills, npcAliveEnd: alive, worstFeel: +worst.toFixed(1), dmgShare: +dmg.toFixed(2), killLog };
}
