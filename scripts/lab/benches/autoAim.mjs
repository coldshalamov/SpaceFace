// Auto-aim bench: the player fires the REAL weapons with the REAL auto-target assist at enemies
// running the REAL tactical AI. Every player round is tracked from muzzle to death and each miss
// gets a reason (occluded, out of range, target maneuver, aim off solution, lead error).
import { createLabWorld, wrapAngle, digest, SIM_DT } from '../labWorld.mjs';
import { stats, r4 } from '../labMetrics.mjs';
import { mulberry32 } from './tetherSpin.mjs';
import { setWeaponsAimLab } from '../../../src/systems/weapons.js';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';

const HZ = Math.round(1 / SIM_DT);
const s2t = (s) => Math.round(s * HZ);

// Player motion scripts. Target-relative so the fight stays inside weapon range: the pilot
// steers with the real yaw keys (pilot scheme: A/D yaw, Q/E strafe, mouse aims independently).
// ctx = { pl, tgt, dist }. KeyD raises rot; forward = (cos rot, sin rot).
function steerTo(pl, heading) {
  const err = wrapAngle(heading - pl.rot);
  return err > 0.06 ? ['KeyD'] : err < -0.06 ? ['KeyA'] : [];
}
function orbitHeading({ pl, tgt, dist }, sign = 1, offset = 0) {
  const bx = tgt.pos.x - pl.pos.x, bz = tgt.pos.z - pl.pos.z;
  const r = Math.hypot(bx, bz) || 1;
  const bearing = Math.atan2(bz, bx);
  const corr = Math.max(-0.9, Math.min(0.9, 1.5 * (r - dist) / dist)); // >0 when too far: cut inward
  return bearing + sign * (Math.PI / 2 - corr) + offset;
}
// Assisted flight welds the nose to the path under throttle (kernel assistedTurnBound), so a
// held W+yaw turns at mainAccel/speed (~0.56 rad/s under boost). A real pilot lets off to turn:
// throttle only when the nose is near the wanted heading, boost only when nearly on it.
function fly(pl, heading, { boost = false } = {}) {
  const err = Math.abs(wrapAngle(heading - pl.rot));
  const k = steerTo(pl, heading);
  if (err < 0.9) k.push('KeyW');
  if (boost && err < 0.35) k.push('ShiftLeft');
  return k;
}
function rangeKeep({ pl, tgt, dist }) {
  const r = Math.hypot(tgt.pos.x - pl.pos.x, tgt.pos.z - pl.pos.z);
  return r > dist + 30 ? ['KeyW'] : r < dist - 30 ? ['KeyS'] : [];
}
const bearingTo = ({ pl, tgt }) => Math.atan2(tgt.pos.z - pl.pos.z, tgt.pos.x - pl.pos.x);
function joustBoost(t, c, weave) {
  const bx = c.tgt.pos.x - c.pl.pos.x, bz = c.tgt.pos.z - c.pl.pos.z; const r = Math.hypot(bx, bz);
  if (c.mem.out && r > c.dist + 80) c.mem.out = false; else if (!c.mem.out && r < 60) c.mem.out = true;
  const toward = Math.atan2(bz, bx);
  return c.mem.out ? fly(c.pl, toward + Math.PI) : fly(c.pl, toward + (r > 90 ? weave : 0), { boost: true });
}
const PILOT = {
  hold: () => [],
  cruise: (t, c) => fly(c.pl, orbitHeading(c)),
  boost: (t, c) => fly(c.pl, orbitHeading(c), { boost: true }),
  spin: () => ['KeyD'],
  'cruise-spin': () => ['KeyW', 'KeyD'],
  // Face the target, slide side to side on Q/E, hold range with W/S.
  strafe: (t, c) => [((t / s2t(1.5)) | 0) % 2 ? 'KeyQ' : 'KeyE', ...steerTo(c.pl, bearingTo(c)), ...rangeKeep(c)],
  'boost-weave': (t, c) => fly(c.pl, orbitHeading(c, 1, ((t / s2t(1.2)) | 0) % 2 ? 0.6 : -0.6), { boost: true }),
  // Jousting passes: run at the target, overshoot to dist+60, turn back.
  joust: (t, c) => {
    const bx = c.tgt.pos.x - c.pl.pos.x, bz = c.tgt.pos.z - c.pl.pos.z; const r = Math.hypot(bx, bz);
    if (c.mem.out && r > c.dist + 60) c.mem.out = false; else if (!c.mem.out && r < 50) c.mem.out = true;
    const toward = Math.atan2(bz, bx);
    return fly(c.pl, c.mem.out ? toward + Math.PI : toward);
  },
  // Boosted passes (boost only inbound), optionally weaving +-0.5 rad on the run-in.
  'boost-joust': (t, c) => joustBoost(t, c, 0),
  'boost-joust-weave': (t, c) => joustBoost(t, c, ((t / s2t(0.8)) | 0) % 2 ? 0.5 : -0.5),
};

const S = (o) => ({ durationS: 16, weapon: 'wpn_pulse_laser_s', pilot: 'hold', dist: 160, enemies: [{ type: 'wasp_swarmer' }], mode: 'assist', ...o });
export const SCENARIOS = {
  'wasp-hold-160': S({}),
  'wasp-cruise-160': S({ pilot: 'cruise' }),
  'wasp-boost-160': S({ pilot: 'boost-joust' }),
  'wasp-spin-160': S({ pilot: 'spin' }),
  'wasp-strafe-160': S({ pilot: 'strafe' }),
  'wasp-boostweave-160': S({ pilot: 'boost-joust-weave' }),
  'wasp-hold-230': S({ dist: 230 }),
  'wasp-pack3-hold': S({ enemies: [{ type: 'wasp_swarmer' }, { type: 'wasp_swarmer', dx: 40 }, { type: 'wasp_swarmer', dx: -40 }] }),
  'bruiser-cruise-160': S({ pilot: 'cruise', enemies: [{ type: 'bruiser_brawler' }] }),
  'reaver-strafe-160': S({ pilot: 'strafe', enemies: [{ type: 'reaver_pirate' }] }),
  'corsair-boostweave-160': S({ pilot: 'boost-joust-weave', enemies: [{ type: 'corsair_raider' }] }),
  'mule-flee-boost': S({ pilot: 'boost-joust', enemies: [{ type: 'mule_trader' }], dist: 120 }),
  'wasp-cruise-autocannon': S({ pilot: 'cruise', weapon: 'wpn_autocannon_s' }),
  'wasp-joust-railgun-400': S({ pilot: 'joust', weapon: 'wpn_railgun_m', dist: 400 }), // spinal mount: fires along the nose only
  'wasp-cruise-bankstream': S({ pilot: 'cruise', weapon: 'wpn_bank_stream_m' }),
  'wasp-hold-G': S({ mode: 'G' }),
  'wasp-boostweave-G': S({ pilot: 'boost-joust-weave', mode: 'G' }),
  'wasp-cruise-helm': S({ pilot: 'hold', scheme: 'helm-assist' }), // helm: the cursor (on the target) owns the nose
  'wasp-rock-occluder': S({ rock: { dx: 0, dz: 0, radius: 14 } }),
  'wasp-joust-160': S({ pilot: 'joust' }),
  // Stress: long time-of-flight against the most agile hulls / slow or spread weapons.
  'dart-hold-200': S({ dist: 200, enemies: [{ type: 'detonator_dart' }] }),
  'zealot-strafe-230': S({ pilot: 'strafe', dist: 230, enemies: [{ type: 'choir_zealot' }] }),
  'wasp-hold-plasma-250': S({ dist: 250, weapon: 'wpn_plasma_cannon_m' }),
  'wasp-hold-autocannon-230': S({ dist: 230, weapon: 'wpn_autocannon_s' }),
  'corsair-joust-railgun': S({ pilot: 'joust', weapon: 'wpn_railgun_m', dist: 400, enemies: [{ type: 'corsair_raider' }] }),
};
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export const VARIANTS = {
  baseline: {},
  // Oracle: lead on the target's acceleration this tick (from the physics command the AI's
  // flight step just wrote), solved by fixed-point iteration from the real muzzle.
  'oracle-accel': { aimLab: { law: 'accel' } },
  // Oracle + muzzle: also solve from the real muzzle in non-G mode.
  'oracle-accel-muzzle': { aimLab: { law: 'accel', muzzle: true } },
  'muzzle-only': { aimLab: { law: 'linear', muzzle: true } },
  'no-spread': { aimLab: { noSpread: true } },
};

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown aim scenario ${id}`);
  setWeaponsAimLab(params.aimLab || {});
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: sc.scheme || 'pilot' } });
  try {
    const rng = mulberry32(seed * 104729 + 3);
    const bearing = (rng() - 0.5) * 1.2; // enemy bearing jitter around +x
    const player = world.spawnPlayer({ modules: [sc.weapon, 'mod_engine_ion_m', 'mod_shield_booster_s'], pos: { x: 0, z: 0 }, rot: bearing });
    const enemies = [];
    for (const e of sc.enemies) {
      const ang = bearing + (rng() - 0.5) * 0.3;
      const pos = { x: Math.cos(ang) * sc.dist + (e.dx || 0), z: Math.sin(ang) * sc.dist + (e.dz || 0) };
      const ent = world.spawnEnemy({ typeId: e.type, level: e.level, pos, rot: ang + Math.PI });
      ent.labTypeId = e.type;
      enemies.push(ent);
    }
    let rock = null;
    if (sc.rock) {
      const a = enemies[0];
      rock = world.spawnAsteroid({ pos: { x: (player.pos.x + a.pos.x) / 2 + sc.rock.dx, z: (player.pos.z + a.pos.z) / 2 + sc.rock.dz }, radius: sc.rock.radius });
    }
    await world.prepare();
    const weapon = (world.player().data.weapons || [])[0];
    if (!weapon) throw new Error(`weapon ${sc.weapon} did not fit`);
    // Round tracking. Projectile ids are recycled, so a round is keyed by its data object (fresh
    // per spawn) and registered the instant weapons emits combat:fire (before physics can hit it).
    const bus = world.runtime.bus;
    const rounds = [];
    const liveById = new Map();
    const seenData = new WeakSet();
    let curTarget = enemies[0];
    const register = () => {
      for (const e of world.state.entityList) {
        if (!e || e.type !== 'projectile' || e.ownerId !== world.state.playerId || !e.data || seenData.has(e.data)) continue;
        seenData.add(e.data);
        const rd = newRound(e, world.state.entities.get(world.state.player.targetId) || curTarget, world, weapon);
        rd.dataRef = e.data; rd.projId = e.id;
        { const tg = world.state.entities.get(rd.targetId); const a = enemyAccel(tg); rd.dodgeWu = 0.5 * a * rd.tof * rd.tof; rd.dodgeable = rd.dodgeWu > rd.targetRadius + 1.5; }
        rounds.push(rd); liveById.set(e.id, rd);
      }
    };
    bus.on('combat:fire', (ev) => { if (ev && ev.ownerId === world.state.playerId) register(); });
    bus.on('projectile:hit', (p) => {
      if (!p || p.projectileId == null) return;
      const rd = liveById.get(p.projectileId);
      if (!rd || rd.done) return;
      rd.hitId = p.targetId; rd.done = true; liveById.delete(p.projectileId);
      if (rd.targetId === p.targetId) rd.minDist = Math.min(rd.minDist, 0);
    });
    bus.on('pds:intercept', (p) => {
      const rd = p && liveById.get(p.projectileId);
      if (!rd || rd.done) return;
      rd.pdIntercept = p.shipId; rd.done = true; liveById.delete(p.projectileId);
    });
    const ticks = s2t(sc.durationS);
    const kin = [];
    const tgtSpd = [], tgtAcc = [], rngTr = [];
    let lastTV = null;
    const pilotMem = {};
    let fireTicks = 0;
    // Real damage path with its invulnerability flag (src/combat/damage.js): the player survives the
    // bench and targets never die, so we measure aim rather than time-to-kill.
    for (const en of [world.player(), ...enemies]) { en.flags = en.flags || {}; en.flags.invuln = true; en._invulnUntil = Infinity; }
    for (let t = 0; t < ticks; t++) {
      const pl = world.player();
      const tgt = enemies.find((e) => e.alive !== false) || enemies[0];
      curTarget = tgt;
      world.state.player.targetId = tgt.id; // selection is not under test; the lead is
      if (sc.mode === 'G') world.state.input.autoFire = true;
      world.aim.x = tgt.pos.x; world.aim.z = tgt.pos.z; // raw cursor parked on the target
      const d = Math.hypot(tgt.pos.x - pl.pos.x, tgt.pos.z - pl.pos.z);
      const range = weapon.range || 240;
      const fire = t > 30 && d < range;
      if (fire) fireTicks++;
      const pk = PILOT[sc.pilot](t, { pl, tgt, dist: sc.dist, mem: pilotMem });
      if (process.env.LAB_TRACE && t % 60 === 0) console.error(`[trace] t=${t} d=${d.toFixed(0)} keys=${pk.join('+')} rot=${pl.rot.toFixed(2)} v=${Math.hypot(pl.vel.x, pl.vel.z).toFixed(0)} tgtV=${Math.hypot(tgt.vel.x, tgt.vel.z).toFixed(0)}`);
      world.keys(pk, { fire });
      world.step();
      register();
      for (const [pid, rd] of liveById) {
        const proj = world.state.entities.get(pid);
        const target = world.state.entities.get(rd.targetId);
        if (!proj || proj.alive === false || proj.data !== rd.dataRef) { rd.done = true; liveById.delete(pid); continue; }
        if (!target) continue;
        const dx = proj.pos.x - target.pos.x, dz = proj.pos.z - target.pos.z;
        const prev = rd.lastRel;
        const dist = prev ? segPointDist(prev.x, prev.z, dx, dz) : Math.hypot(dx, dz);
        if (dist < rd.minDist) { rd.minDist = dist; rd.minT = t; }
        rd.lastRel = { x: dx, z: dz };
      }
      { const tg = curTarget; const sp = Math.hypot(tg.vel.x, tg.vel.z); tgtSpd.push(sp);
        if (lastTV) { const acc = Math.hypot(tg.vel.x - lastTV.x, tg.vel.z - lastTV.z) * 60; tgtAcc.push(acc);
          for (const rd of liveById.values()) if (rd.targetId === tg.id) rd.maxTA = Math.max(rd.maxTA || 0, acc); }
        lastTV = { x: tg.vel.x, z: tg.vel.z }; const p2 = world.player(); rngTr.push(Math.hypot(tg.pos.x - p2.pos.x, tg.pos.z - p2.pos.z)); }
      if (t % 6 === 0) kin.push([r4(pl.pos.x), r4(pl.pos.z), r4(tgt.pos.x), r4(tgt.pos.z)]);
    }
    for (const rd of liveById.values()) rd.inFlightAtEnd = true;
    const done = rounds.filter((r) => !r.inFlightAtEnd);
    for (const rd of done) classify(rd);
    return summarize(id, sc, done, { seed, digest: digest(kin), fireTicks, weapon, tgtSpd: stats(tgtSpd), tgtAcc: stats(tgtAcc), rng: stats(rngTr) });
  } finally {
    world.dispose();
    setWeaponsAimLab({});
  }
}

const ENEMY_ACCEL = new Map();
function enemyAccel(tg) {
  const typeId = tg && tg.labTypeId;
  if (!ENEMY_ACCEL.size) for (const d of (Array.isArray(ENEMY_TYPES) ? ENEMY_TYPES : Object.values(ENEMY_TYPES || {}))) if (d && d.id) ENEMY_ACCEL.set(d.id, d.accel || 0);
  return ENEMY_ACCEL.get(typeId) || (tg && tg.accel) || 0;
}
function newRound(proj, target, world, weapon) {
  const pl = world.player();
  const spd = Math.hypot(proj.vel.x, proj.vel.z) || 1;
  const dir = Math.atan2(proj.vel.z, proj.vel.x);
  // Constant-velocity counterfactual: where would the closest approach be if the target held
  // its velocity from the fire tick? (Lead was right for a non-maneuvering target if this hits.)
  const rx = target.pos.x - proj.pos.x, rz = target.pos.z - proj.pos.z;
  const rvx = target.vel.x - proj.vel.x, rvz = target.vel.z - proj.vel.z;
  const rv2 = rvx * rvx + rvz * rvz;
  const life = (proj.data && proj.data.maxDistance ? proj.data.maxDistance : (weapon.range || 240)) / spd;
  const tStar = rv2 > 1e-9 ? Math.max(0, Math.min(life * 1.2, -(rx * rvx + rz * rvz) / rv2)) : 0;
  const cvMiss = Math.hypot(rx + rvx * tStar, rz + rvz * tStar);
  // Ideal straight-shot direction from this muzzle for a constant-velocity target, honouring the
  // aim-true launch model (world direction = dir, relative speed = projSpeed).
  const ideal = Math.atan2(rz + target.vel.z * tStar, rx + target.vel.x * tStar);
  return {
    targetId: target.id, spawn: { x: proj.pos.x, z: proj.pos.z }, spawnTick: world.state.tick,
    dir, speed: spd, fireDist: Math.hypot(rx, rz), range: proj.data && proj.data.maxDistance,
    targetRadius: target.radius || 6, cvMiss, aimErrDeg: Math.atan2(cvMiss, Math.hypot(rx, rz)) * 180 / Math.PI, idealDeltaDeg: Math.abs(wrapAngle(dir - ideal)) * 180 / Math.PI,
    minDist: Infinity, minT: null, lastRel: null,
    tof: Math.hypot(rx, rz) / spd,
    playerSpeed: Math.hypot(pl.vel.x, pl.vel.z), playerBoost: !!(pl.flags && pl.flags.boosting), done: false, hitId: null,
  };
}

function classify(rd) {
  const R = rd.targetRadius + 1.5; // projectile radius allowance
  rd.missDist = Math.max(0, rd.minDist - rd.targetRadius);
  if (rd.hitId === rd.targetId) { rd.outcome = 'hit'; return; }
  if (rd.hitId != null) { rd.outcome = 'occluded'; return; }
  if (rd.pdIntercept != null) { rd.outcome = 'pd-intercepted'; return; } // enemy point defense shot it down
  if (rd.fireDist > (rd.range || 240) + rd.targetRadius) { rd.outcome = 'out-of-range'; return; }
  if (rd.minDist <= R) { rd.outcome = 'grazed-no-hit'; return; } // geometric pass inside the hull, no hit receipt
  // A velocity jump far beyond any hull's thrust (>800 wu/s^2) during the flight is a contact
  // (ram, bounce, knockback), not piloting: an exceptional miss, reported separately.
  if (rd.cvMiss <= R && (rd.maxTA || 0) > 800) { rd.outcome = 'target-contact'; return; }
  if (rd.cvMiss <= R) { rd.outcome = 'target-maneuver'; return; }
  rd.outcome = 'lead-error'; // would miss even a target that held its fire-tick velocity
}

function summarize(id, sc, rounds, extra) {
  const by = {};
  for (const r of rounds) by[r.outcome] = (by[r.outcome] || 0) + 1;
  const n = rounds.length;
  const misses = rounds.filter((r) => r.outcome !== 'hit');
  return {
    scenario: id, seed: extra.seed, digest: extra.digest, weapon: sc.weapon, pilot: sc.pilot, mode: sc.mode,
    projSpeed: extra.weapon.projSpeed, range: extra.weapon.range, fired: n, fireTicks: extra.fireTicks,
    hitRate: n ? r4(by.hit ? by.hit / n : 0) : null,
    outcomes: by,
    missDist: stats(misses.map((r) => r.missDist)),
    aimErrDeg: stats(rounds.map((r) => r.aimErrDeg)),
    cvMissHitPct: n ? r4(100 * rounds.filter((r) => r.cvMiss <= r.targetRadius + 1.5).length / n) : null,
    fireDist: stats(rounds.map((r) => r.fireDist)),
    playerSpeed: stats(rounds.map((r) => r.playerSpeed)),
    cvMiss: stats(rounds.map((r) => r.cvMiss)),
    missLog: misses.slice(0, 25).map((r) => ({ tick: r.spawnTick, outcome: r.outcome, fireDist: r4(r.fireDist), tof: r4(r.tof), cvMiss: r4(r.cvMiss), minDist: r4(r.minDist), maxTA: r4(r.maxTA || 0), dodgeWu: r4(r.dodgeWu), playerSpeed: r4(r.playerSpeed), hitId: r.hitId })),
    dodgeablePct: rounds.length ? r4(100 * rounds.filter((r) => r.dodgeable).length / rounds.length) : null,
    dodgeWu: stats(rounds.map((r) => r.dodgeWu)),
    targetSpeed: extra.tgtSpd, targetAccel: extra.tgtAcc, rangeTrace: extra.rng,
  };
}

function segPointDist(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? -(ax * dx + az * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t, az + dz * t);
}

const avg = (a) => { const f = a.filter(Number.isFinite); return f.length ? r4(f.reduce((x, y) => x + y, 0) / f.length) : null; };
export function summarizeRuns(results) {
  const groups = new Map();
  for (const r of results) { const k = `${r.variant}|${r.scenario}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = [];
  for (const [k, rs] of groups) {
    const [variant, scenario] = k.split('|');
    const fired = rs.reduce((s, r) => s + r.fired, 0);
    const oc = {};
    for (const r of rs) for (const [o, c] of Object.entries(r.outcomes)) oc[o] = (oc[o] || 0) + c;
    const share = (o) => fired ? r4(100 * (oc[o] || 0) / fired) : null;
    out.push({ variant, scenario, seeds: rs.length, fired, hit: share('hit'), maneuver: share('target-maneuver'),
      aimOff: share('aim-off-solution'), lead: share('lead-error'), occl: share('occluded'), oor: share('out-of-range'),
      graze: share('grazed-no-hit'), contact: share('target-contact'), pd: share('pd-intercepted'),
      missP50: r4(rs.map((r) => r.missDist.p50).filter(Number.isFinite).reduce((a, b, _, arr) => a + b / arr.length, 0)),
      aimErrP50: r4(rs.map((r) => r.aimErrDeg.p50).filter(Number.isFinite).reduce((a, b, _, arr) => a + b / arr.length, 0)),
      tgtSpd: avg(rs.map((r) => r.targetSpeed.p50)), tgtAccP95: avg(rs.map((r) => r.targetAccel.p95)),
      rangeP50: avg(rs.map((r) => r.rangeTrace.p50)), dodgeable: avg(rs.map((r) => r.dodgeablePct)), dodgeWuP50: avg(rs.map((r) => r.dodgeWu.p50)), cvMissP95: avg(rs.map((r) => r.cvMiss.p95)),
      cvHit: r4(rs.map((r) => r.cvMissHitPct).filter(Number.isFinite).reduce((a, b, _, arr) => a + b / arr.length, 0)) });
  }
  return out;
}

export const COLUMNS = [
  { label: 'variant', key: 'variant' }, { label: 'scenario', key: 'scenario' }, { label: 'fired', key: 'fired' },
  { label: 'hit%', key: 'hit' }, { label: 'maneuver%', key: 'maneuver' }, { label: 'contact%', key: 'contact' }, { label: 'pd%', key: 'pd' }, 
  { label: 'lead%', key: 'lead' }, { label: 'graze%', key: 'graze' }, { label: 'occl%', key: 'occl' }, { label: 'oor%', key: 'oor' },
  { label: 'miss wu p50', key: 'missP50' }, { label: 'angErr° p50', key: 'aimErrP50' }, { label: 'cvMiss p95', key: 'cvMissP95' }, { label: 'cv-hit%', key: 'cvHit' },
  { label: 'tgt spd p50', key: 'tgtSpd' }, { label: 'tgt acc p95', key: 'tgtAccP95' }, { label: 'range p50', key: 'rangeP50' }, { label: 'dodge wu p50', key: 'dodgeWuP50' }, { label: 'dodgeable%', key: 'dodgeable' },
];
