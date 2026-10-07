// Auto-aim bench: the player fires the REAL weapons with the REAL auto-target assist at enemies
// running the REAL tactical AI. Every player round is tracked from muzzle to death and each miss
// gets a reason (occluded, out of range, target maneuver, aim off solution, lead error).
import { createLabWorld, wrapAngle, digest, SIM_DT } from '../labWorld.mjs';
import { stats, r4 } from '../labMetrics.mjs';
import { mulberry32 } from './tetherSpin.mjs';
import * as weaponsModule from '../../../src/systems/weapons.js';
// Lab seams exist only on lab/tuning-phase1; on a production checkout every run is "shipped" and
// the oracle predictors fall back to constant velocity.
const setWeaponsAimLab = weaponsModule.setWeaponsAimLab || (() => {});
const labTargetPredictor = weaponsModule.labTargetPredictor || ((tg) => { const x = tg.pos.x, z = tg.pos.z, vx = tg.vel.x, vz = tg.vel.z; return (t) => ({ x: x + vx * t, z: z + vz * t }); });
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
import { WEAPONS } from '../../../src/data/weapons.js';
const WEAPON_DEFS = new Map(WEAPONS.map((w) => [w.id, w]));

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
  // Shipped (Phase 2a): locked player aim solved from the real muzzle.
  baseline: {},
  // Pre-2a locked aim: lead solved from the hull centre.
  'pre-2a': { aimLab: { hullCentre: true, noLaunchModel: true } },
  // Muzzle solve without the launch-model refinement (isolates that half of the 2a change).
  'muzzle-only': { aimLab: { noLaunchModel: true } },
  'no-spread': { aimLab: { noSpread: true } },
  // Oracles (muzzle solve + a richer target model). accel = this tick's commanded force;
  // intent = that thrust slewing toward the AI's own targetHeading at its turn rate.
  'oracle-accel': { aimLab: { law: 'accel' } },
  'oracle-intent': { aimLab: { law: 'intent' } },
  'oracle-intent-no-spread': { aimLab: { law: 'intent', noSpread: true } },
  // Half-size targets (hit radius x0.5): the same fights against a hull half as wide.
  'half': { targetScale: 0.5 },
  'half-pre-2a': { targetScale: 0.5, aimLab: { hullCentre: true, noLaunchModel: true } },
  'half-muzzle-only': { targetScale: 0.5, aimLab: { noLaunchModel: true } },
  'half-no-spread': { targetScale: 0.5, aimLab: { noSpread: true } },
  'half-oracle-accel': { targetScale: 0.5, aimLab: { law: 'accel' } },
  'half-oracle-intent': { targetScale: 0.5, aimLab: { law: 'intent' } },
  'half-oracle-intent-no-spread': { targetScale: 0.5, aimLab: { law: 'intent', noSpread: true } },
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
    const wdef = WEAPON_DEFS.get(weapon.id || sc.weapon) || {};
    const projSpeedNominal = weapon.projSpeed || wdef.projSpeed || 320;
    const rangeNominal = weapon.range || wdef.range || 240;
    // Half-size variant: physics hit test is segment-vs-circle on proj.radius + target.radius.
    const scale = Number(params.targetScale) || 1;
    const baseRadius = new Map(enemies.map((en) => [en.id, en.radius]));
    const applyScale = () => { if (scale !== 1) for (const en of enemies) en.radius = baseRadius.get(en.id) * scale; };
    applyScale();
    // Intent oracle feed (lab only): the AI's last maneuver request per entity.
    const lastRequest = new Map();
    const aiPorts = world.runtime.getSystem('aiPorts');
    if (aiPorts && aiPorts._pendingManeuvers) {
      const m = aiPorts._pendingManeuvers; const set0 = m.set.bind(m);
      m.set = (k, v) => { if (v && v.request) lastRequest.set(v.request.entityId, v.request); return set0(k, v); };
    }
    setWeaponsAimLab({ ...(params.aimLab || {}), intentOf: (tg) => {
      const rq = tg && lastRequest.get(tg.id);
      if (!rq) return null;
      const def = ENEMY_TYPES.find((d) => d.id === tg.labTypeId);
      return { targetHeading: rq.targetHeading, turnRate: def ? def.turnRate : 1.5 };
    } });
    // Record the random spread each fired round received (weapons._spread), so a miss can be
    // split into "solution wrong" vs "authored dispersion".
    const wsys = world.runtime.getSystem('weapons');
    // Spread bookkeeping, matched per round by its exact launch direction: combat:fire carries the
    // final heading, and a fire whose round was suppressed (live cap) must not shift the next one.
    const pendingFires = [];
    let svcSpread = 0;
    if (wsys && typeof wsys._spread === 'function') {
      let shooter = null; // only the player's rounds; enemy guns draw spread from the same stream
      const svc0 = wsys._serviceProjectileWeapon;
      wsys._serviceProjectileWeapon = function (e, ...rest) { shooter = e; svcSpread = 0; try { return svc0.call(this, e, ...rest); } finally { shooter = null; } };
      const sp0 = wsys._spread.bind(wsys);
      wsys._spread = (deg) => { const v = sp0(deg); if (shooter && shooter.id === world.state.playerId) svcSpread = v; return v; };
    }
    // Round tracking. Projectile ids are recycled, so a round is keyed by its data object (fresh
    // per spawn) and registered the instant weapons emits combat:fire (before physics can hit it).
    const bus = world.runtime.bus;
    const rounds = [];
    const liveById = new Map();
    const ghosts = new Set();
    const seenData = new WeakSet();
    let curTarget = enemies[0];
    const register = () => {
      for (const e of world.state.entityList) {
        if (!e || e.type !== 'projectile' || e.ownerId !== world.state.playerId || !e.data || seenData.has(e.data)) continue;
        seenData.add(e.data);
        const rd = newRound(e, world.state.entities.get(world.state.player.targetId) || curTarget, world, weapon);
        rd.dataRef = e.data; rd.projId = e.id;
        { let best = -1, bestD = 1e-6;
          for (let k = 0; k < pendingFires.length; k++) {
            const d = Math.abs(wrapAngle(pendingFires[k].dir - rd.dir));
            if (d < bestD) { bestD = d; best = k; }
          }
          rd.spread = best >= 0 ? pendingFires[best].spread : 0;
          rd.spreadMatched = best >= 0;
          if (best >= 0) pendingFires.splice(best, 1);
          while (pendingFires.length && pendingFires[0].tick < world.state.tick - 2) pendingFires.shift(); }
        rd.ghost = { x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z };
        // Score over the round's approach: to 1.5x its constant-velocity meet time (+0.25 s),
        // capped by its real life; 2 s when no meet exists (then it is 'unreachable' anyway).
        rd.ticksLeft = Math.ceil(Math.min(rd.life, rd.tMeet != null ? rd.tMeet * 1.5 + 0.25 : 2) * HZ) + 2;
        rd.trueMin = Infinity; rd.cvMin = Infinity; rd.solMin = Infinity; rd.maxCurveDeg = 0;
        { const tg = world.state.entities.get(rd.targetId);
          rd.tp0 = { x: tg.pos.x, z: tg.pos.z }; rd.tv0 = { x: tg.vel.x, z: tg.vel.z };
          rd.prevRel = { x: e.pos.x - tg.pos.x, z: e.pos.z - tg.pos.z }; rd.prevCv = { ...rd.prevRel }; rd.prevSol = { ...rd.prevRel };
          rd.age = 0;
          // Prediction check (oracle question): where does each target model put the target at
          // this round's meet time, vs where it actually is then?
          const tau = rd.tMeet != null ? Math.min(rd.tMeet, 3) : rd.tof;
          rd.predAge = Math.max(1, Math.round(tau / SIM_DT));
          rd.pred = {};
          for (const law of ['cv', 'accel', 'intent']) rd.pred[law] = labTargetPredictor(tg, law)(rd.predAge * SIM_DT);
          rd.predErr = null; }
        { const tg = world.state.entities.get(rd.targetId); const a = enemyAccel(tg); rd.dodgeWu = 0.5 * a * rd.tof * rd.tof; rd.dodgeable = rd.dodgeWu > rd.targetRadius + 1.5; }
        rounds.push(rd); liveById.set(e.id, rd); ghosts.add(rd);
      }
    };
    bus.on('combat:fire', (ev) => {
      if (!ev || ev.ownerId !== world.state.playerId) return;
      pendingFires.push({ dir: Number(ev.dir), spread: svcSpread, tick: world.state.tick });
      register();
    });
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
    // A short no-fire tail lets rounds fired near the end resolve instead of being dropped.
    const tailTicks = s2t(2);
    for (let t = 0; t < ticks + tailTicks; t++) {
      const pl = world.player();
      const tgt = enemies.find((e) => e.alive !== false) || enemies[0];
      curTarget = tgt;
      world.state.player.targetId = tgt.id; // selection is not under test; the lead is
      if (sc.mode === 'G') world.state.input.autoFire = true;
      world.aim.x = tgt.pos.x; world.aim.z = tgt.pos.z; // raw cursor parked on the target
      const d = Math.hypot(tgt.pos.x - pl.pos.x, tgt.pos.z - pl.pos.z);
      const range = weapon.range || 240;
      const fire = t > 30 && t < ticks && d < range;
      if (fire) fireTicks++;
      const pk = PILOT[sc.pilot](t, { pl, tgt, dist: sc.dist, mem: pilotMem });
      if (process.env.LAB_TRACE && t % 60 === 0) console.error(`[trace] t=${t} d=${d.toFixed(0)} keys=${pk.join('+')} rot=${pl.rot.toFixed(2)} v=${Math.hypot(pl.vel.x, pl.vel.z).toFixed(0)} tgtV=${Math.hypot(tgt.vel.x, tgt.vel.z).toFixed(0)}`);
      world.keys(pk, { fire });
      world.step();
      register();
      applyScale();
      // Live rounds: follow the real projectile; check it flies straight (no homing).
      for (const [pid, rd] of liveById) {
        const proj = world.state.entities.get(pid);
        if (!proj || proj.alive === false || proj.data !== rd.dataRef) { rd.done = true; liveById.delete(pid); continue; }
        rd.ghost.x = proj.pos.x; rd.ghost.z = proj.pos.z; rd.ghost.vx = proj.vel.x; rd.ghost.vz = proj.vel.z;
        const curve = Math.abs(wrapAngle(Math.atan2(proj.vel.z, proj.vel.x) - rd.dir)) * 180 / Math.PI;
        if (curve > rd.maxCurveDeg) rd.maxCurveDeg = curve;
      }
      // Every round (alive or a straight-line ghost after it died) is scored over its full
      // flight against: the real target path (trueMin), the fire-tick constant-velocity target
      // (cvMin), and the same with the round's random spread removed (solMin = the solver).
      for (const rd of ghosts) {
        if (!liveById.has(rd.projId) || liveById.get(rd.projId) !== rd) {
          rd.ghost.x += rd.ghost.vx * SIM_DT; rd.ghost.z += rd.ghost.vz * SIM_DT;
        }
        rd.age++;
        const target = world.state.entities.get(rd.targetId);
        const tau = rd.age * SIM_DT;
        const cvx = rd.tp0.x + rd.tv0.x * tau, cvz = rd.tp0.z + rd.tv0.z * tau;
        const gx = rd.ghost.x, gz = rd.ghost.z;
        // Spread removed: rotate the ghost's displacement from its spawn point by -spread.
        const ox = gx - rd.spawn.x, oz = gz - rd.spawn.z;
        const cs = Math.cos(-rd.spread), sn = Math.sin(-rd.spread);
        const sx = rd.spawn.x + ox * cs - oz * sn, sz = rd.spawn.z + ox * sn + oz * cs;
        if (target && rd.age === rd.predAge) {
          rd.predErr = {};
          for (const law of Object.keys(rd.pred)) rd.predErr[law] = Math.hypot(rd.pred[law].x - target.pos.x, rd.pred[law].z - target.pos.z);
        }
        if (target) {
          const rel = { x: gx - target.pos.x, z: gz - target.pos.z };
          rd.trueMin = Math.min(rd.trueMin, segPointDist(rd.prevRel.x, rd.prevRel.z, rel.x, rel.z));
          rd.prevRel = rel;
        }
        const relCv = { x: gx - cvx, z: gz - cvz };
        rd.cvMin = Math.min(rd.cvMin, segPointDist(rd.prevCv.x, rd.prevCv.z, relCv.x, relCv.z));
        rd.prevCv = relCv;
        const relSol = { x: sx - cvx, z: sz - cvz };
        rd.solMin = Math.min(rd.solMin, segPointDist(rd.prevSol.x, rd.prevSol.z, relSol.x, relSol.z));
        rd.prevSol = relSol;
        if (process.env.LAB_ROUND_TRACE && rd.spawnTick === Number(process.env.LAB_ROUND_TRACE)) {
          const pj = world.state.entities.get(rd.projId);
          console.error(`[round] age=${rd.age} live=${liveById.get(rd.projId) === rd} g=(${gx.toFixed(1)},${gz.toFixed(1)}) proj=${pj ? `(${pj.pos.x.toFixed(1)},${pj.pos.z.toFixed(1)}) same=${pj.data === rd.dataRef}` : 'none'} tgt=${target ? `(${target.pos.x.toFixed(1)},${target.pos.z.toFixed(1)}) R=${target.radius}` : 'none'} hit=${rd.hitId} trueMin=${rd.trueMin.toFixed(1)}`);
        }
        if (--rd.ticksLeft <= 0) { rd.scored = true; ghosts.delete(rd); }
      }
      { const tg = curTarget; const sp = Math.hypot(tg.vel.x, tg.vel.z); tgtSpd.push(sp);
        if (lastTV) { const acc = Math.hypot(tg.vel.x - lastTV.x, tg.vel.z - lastTV.z) * 60; tgtAcc.push(acc);
          for (const rd of liveById.values()) if (rd.targetId === tg.id) rd.maxTA = Math.max(rd.maxTA || 0, acc); }
        lastTV = { x: tg.vel.x, z: tg.vel.z }; const p2 = world.player(); rngTr.push(Math.hypot(tg.pos.x - p2.pos.x, tg.pos.z - p2.pos.z)); }
      if (t % 6 === 0) kin.push([r4(pl.pos.x), r4(pl.pos.z), r4(tgt.pos.x), r4(tgt.pos.z)]);
    }
    for (const rd of ghosts) rd.inFlightAtEnd = true;
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
  // Real flight budget: weapons gives the body flightDistance (well past the engagement range),
  // so a round can still connect beyond maxDistance; its life is that budget at world speed.
  const life = (proj.data && proj.data.flightDistance ? proj.data.flightDistance
    : proj.data && proj.data.maxDistance ? proj.data.maxDistance : (weapon.range || 240)) / spd;
  const tStar = rv2 > 1e-9 ? Math.max(0, Math.min(life * 1.2, -(rx * rvx + rz * rvz) / rv2)) : 0;
  const cvMiss = Math.hypot(rx + rvx * tStar, rz + rvz * tStar);
  // Ideal straight-shot direction from this muzzle for a constant-velocity target, honouring the
  // aim-true launch model (world direction = dir, relative speed = projSpeed).
  const ideal = Math.atan2(rz + target.vel.z * tStar, rx + target.vel.x * tStar);
  // Reachability for a constant-velocity target: earliest t with |r + tv*t| = spd*t, using the
  // round's actual world speed. No root, or a root past the round's life, means no straight shot
  // from this muzzle can meet the target (it is outrunning the round or the meet point is out of
  // range): such a round cannot hit no matter how it is aimed.
  const a2 = target.vel.x * target.vel.x + target.vel.z * target.vel.z - spd * spd;
  const b2 = 2 * (rx * target.vel.x + rz * target.vel.z), c2 = rx * rx + rz * rz;
  let tMeet = null;
  if (Math.abs(a2) < 1e-9) { if (b2 < 0) tMeet = -c2 / b2; }
  else { const disc = b2 * b2 - 4 * a2 * c2; if (disc >= 0) { const q = Math.sqrt(disc); const ts = [(-b2 - q) / (2 * a2), (-b2 + q) / (2 * a2)].filter((x) => x > 0); if (ts.length) tMeet = Math.min(...ts); } }
  // Exact constant-velocity intercept direction from this muzzle at this round's world speed.
  const meetDir = tMeet != null ? Math.atan2(rz + target.vel.z * tMeet, rx + target.vel.x * tMeet) : null;
  return {
    tMeet, life, meetDir,
    targetId: target.id, spawn: { x: proj.pos.x, z: proj.pos.z }, spawnTick: world.state.tick,
    dir, speed: spd, fireDist: Math.hypot(rx, rz), range: proj.data && proj.data.maxDistance,
    targetRadius: target.radius || 6, cvMiss, aimErrDeg: Math.atan2(cvMiss, Math.hypot(rx, rz)) * 180 / Math.PI, idealDeltaDeg: Math.abs(wrapAngle(dir - ideal)) * 180 / Math.PI,
    minDist: Infinity, minT: null, lastRel: null,
    tof: Math.hypot(rx, rz) / spd,
    noseOffDeg: Math.abs(wrapAngle(dir - pl.rot)) * 180 / Math.PI,
    playerSpeed: Math.hypot(pl.vel.x, pl.vel.z), playerBoost: !!(pl.flags && pl.flags.boosting), done: false, hitId: null,
  };
}

function classify(rd) {
  const R = rd.targetRadius + 1.5; // projectile radius allowance
  rd.missDist = Math.max(0, rd.trueMin - rd.targetRadius);
  // Solver error: the round's launch direction with its random spread removed, against the exact
  // constant-velocity intercept direction (same muzzle, same world speed). Unreachable rounds
  // have no such direction; they fall back to the miss angle.
  rd.aimErrDeg = rd.meetDir != null
    ? Math.abs(wrapAngle(rd.dir - rd.spread - rd.meetDir)) * 180 / Math.PI
    : Math.atan2(rd.solMin, rd.fireDist) * 180 / Math.PI;
  rd.cvErrDeg = Math.atan2(rd.cvMin, rd.fireDist) * 180 / Math.PI;     // as fired (with spread)
  if (rd.hitId === rd.targetId) { rd.outcome = 'hit'; return; }
  if (rd.hitId != null) { rd.outcome = 'occluded'; return; }
  if (rd.pdIntercept != null) { rd.outcome = 'pd-intercepted'; return; } // enemy point defence shot it down
  if (rd.fireDist > (rd.range || 240) + rd.targetRadius) { rd.outcome = 'out-of-range'; return; }
  if (rd.trueMin <= R - 1.5) { rd.outcome = 'grazed-no-hit'; return; } // passed through the hull, no receipt
  if (rd.tMeet == null || rd.tMeet > rd.life) { rd.outcome = 'unreachable'; return; } // no straight shot can meet it
  if (rd.solMin > R) { rd.outcome = 'lead-error'; return; }               // the solver itself was off
  if (rd.cvMin > R) { rd.outcome = 'dispersion'; return; }                // authored random spread
  // A velocity jump far beyond any hull's thrust (>800 wu/s^2) during the flight is a contact
  // (ram, bounce, knockback), not piloting.
  if ((rd.maxTA || 0) > 800) { rd.outcome = 'target-contact'; return; }
  rd.outcome = 'target-maneuver'; // right for a constant-velocity target; it changed course
}

function summarize(id, sc, rounds, extra) {
  const by = {};
  for (const r of rounds) by[r.outcome] = (by[r.outcome] || 0) + 1;
  const n = rounds.length;
  const misses = rounds.filter((r) => r.outcome !== 'hit' || r.aimErrDeg > 0.5);
  return {
    scenario: id, seed: extra.seed, digest: extra.digest, weapon: sc.weapon, pilot: sc.pilot, mode: sc.mode,
    projSpeed: extra.weapon.projSpeed, range: extra.weapon.range, fired: n, fireTicks: extra.fireTicks,
    hitRate: n ? r4(by.hit ? by.hit / n : 0) : null,
    outcomes: by,
    missDist: stats(misses.map((r) => r.missDist)),
    aimErrDeg: stats(rounds.filter((r) => r.outcome !== 'unreachable' && r.outcome !== 'out-of-range').map((r) => r.aimErrDeg)),
    // Rounds whose meet time is a normal engagement (<= 2 s). Past that the round is crawling
    // (fired backwards from a hull fleeing near its own projectile speed) and tiny residuals in
    // a 4 s+ flight read as large angles while still passing inside the hull.
    aimErrDegEngage: stats(rounds.filter((r) => r.outcome !== 'unreachable' && r.outcome !== 'out-of-range' && r.tMeet != null && r.tMeet <= 2).map((r) => r.aimErrDeg)),
    bigAimErr: rounds.filter((r) => r.outcome !== 'unreachable' && r.outcome !== 'out-of-range' && r.aimErrDeg > 0.5)
      .map((r) => ({ aimErrDeg: r4(r.aimErrDeg), tMeet: r4(r.tMeet), solMiss: r4(r.solMin), R: r.targetRadius, outcome: r.outcome })),
    cvMissHitPct: n ? r4(100 * rounds.filter((r) => r.cvMin <= r.targetRadius + 1.5).length / n) : null,
    fireDist: stats(rounds.map((r) => r.fireDist)),
    playerSpeed: stats(rounds.map((r) => r.playerSpeed)),
    cvMiss: stats(rounds.map((r) => r.cvMin)),
    solMiss: stats(rounds.map((r) => r.solMin)),
    trueMiss: stats(rounds.map((r) => r.trueMin)),
    cvErrDeg: stats(rounds.map((r) => r.cvErrDeg)),
    predErr: Object.fromEntries(['cv', 'accel', 'intent'].map((law) => [law, stats(rounds.filter((r) => r.predErr).map((r) => r.predErr[law]))])),
    predWithinR: Object.fromEntries(['cv', 'accel', 'intent'].map((law) => { const rs = rounds.filter((r) => r.predErr); return [law, rs.length ? r4(100 * rs.filter((r) => r.predErr[law] <= r.targetRadius + 1.5).length / rs.length) : null]; })),
    maxCurveDeg: rounds.reduce((m, r) => Math.max(m, r.maxCurveDeg || 0), 0),
    targetRadius: rounds.length ? rounds[0].targetRadius : null,
    missLog: misses.slice(0, 40).map((r) => ({ tick: r.spawnTick, outcome: r.outcome, aimErrDeg: r4(r.aimErrDeg), tMeet: r4(r.tMeet), life: r4(r.life), idealDeltaDeg: r4(r.idealDeltaDeg), tgtSpd0: r4(Math.hypot(r.tv0.x, r.tv0.z)), noseOffDeg: r4(r.noseOffDeg), fireDist: r4(r.fireDist), tof: r4(r.tof), cvMiss: r4(r.cvMin), solMiss: r4(r.solMin), trueMiss: r4(r.trueMin), spreadDeg: r4(r.spread * 180 / Math.PI), maxTA: r4(r.maxTA || 0), dodgeWu: r4(r.dodgeWu), playerSpeed: r4(r.playerSpeed), hitId: r.hitId })),
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
    // Exceptional (allowed) misses: something physically in the way, point defence, a ram.
    const exceptional = (oc.occluded || 0) + (oc['pd-intercepted'] || 0) + (oc['target-contact'] || 0) + (oc['out-of-range'] || 0) + (oc.unreachable || 0);
    const unblocked = fired - exceptional;
    const maxOf = (f) => rs.reduce((m, r) => Math.max(m, f(r) || 0), 0);
    out.push({ variant, scenario, seeds: rs.length, fired,
      hit: share('hit'), unblockedHit: unblocked > 0 ? r4(100 * (oc.hit || 0) / unblocked) : null,
      lead: share('lead-error'), disp: share('dispersion'), maneuver: share('target-maneuver'), graze: share('grazed-no-hit'),
      unreach: share('unreachable'), occl: share('occluded'), pd: share('pd-intercepted'), contact: share('target-contact'), oor: share('out-of-range'),
      aimErrEngMax: r4(maxOf((r) => r.aimErrDegEngage && r.aimErrDegEngage.max)),
      bigAimErr: rs.reduce((n, r) => n + ((r.bigAimErr && r.bigAimErr.length) || 0), 0),
      aimErrP50: avg(rs.map((r) => r.aimErrDeg.p50)), aimErrP95: avg(rs.map((r) => r.aimErrDeg.p95)), aimErrMax: r4(maxOf((r) => r.aimErrDeg.max)),
      cvErrP95: avg(rs.map((r) => r.cvErrDeg && r.cvErrDeg.p95)),
      trueMissP95: avg(rs.map((r) => r.trueMiss && r.trueMiss.p95)), solMissP95: avg(rs.map((r) => r.solMiss && r.solMiss.p95)),
      curveMax: r4(maxOf((r) => r.maxCurveDeg)),
      predCv: avg(rs.map((r) => r.predErr && r.predErr.cv.p50)), predAccel: avg(rs.map((r) => r.predErr && r.predErr.accel.p50)), predIntent: avg(rs.map((r) => r.predErr && r.predErr.intent.p50)),
      inRCv: avg(rs.map((r) => r.predWithinR && r.predWithinR.cv)), inRAccel: avg(rs.map((r) => r.predWithinR && r.predWithinR.accel)), inRIntent: avg(rs.map((r) => r.predWithinR && r.predWithinR.intent)), tgtR: avg(rs.map((r) => r.targetRadius)),
      tgtSpd: avg(rs.map((r) => r.targetSpeed.p50)), tgtAccP95: avg(rs.map((r) => r.targetAccel.p95)),
      rangeP50: avg(rs.map((r) => r.rangeTrace.p50)), dodgeable: avg(rs.map((r) => r.dodgeablePct)) });
  }
  return out;
}

export const COLUMNS = [
  { label: 'variant', key: 'variant' }, { label: 'scenario', key: 'scenario' }, { label: 'fired', key: 'fired' },
  { label: 'hit%', key: 'hit' }, { label: 'unblocked hit%', key: 'unblockedHit' }, { label: 'lead%', key: 'lead' },
  { label: 'disp%', key: 'disp' }, { label: 'maneuver%', key: 'maneuver' }, { label: 'graze%', key: 'graze' },
  { label: 'unreach%', key: 'unreach' }, { label: 'occl%', key: 'occl' }, { label: 'pd%', key: 'pd' }, { label: 'contact%', key: 'contact' },
  { label: 'aimErr° p50', key: 'aimErrP50' }, { label: 'aimErr° p95', key: 'aimErrP95' }, { label: 'aimErr° max', key: 'aimErrMax' },
  { label: 'trueMiss p95', key: 'trueMissP95' }, { label: 'curve° max', key: 'curveMax' }, { label: 'tgt R', key: 'tgtR' },
  { label: 'dodgeable%', key: 'dodgeable' },
];
