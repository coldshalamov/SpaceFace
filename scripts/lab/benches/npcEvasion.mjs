// NPC evasion + engagement-spacing bench (lab system #4).
//
// Same engine as the aim bench (runAimSpec): the player fires the REAL locked aim at enemies running
// the REAL SG-06 tactical AI (invulnerable, so the fight runs its whole doctrine cycle). On top of
// the per-round hit/miss classification it records, per enemy and per doctrine phase (read from the
// maneuver planner's own request reason `combat_doctrine:<id>:<phase>`), the range to the player,
// the phase's authored preferredRange, speed and the active reflex, then scores:
//   - egress phases (extend/breakaway/peel/disengage/escape/retreat...): range must OPEN (dr > 0)
//     and never dive through the player (min range during the leg >= start - 15 wu);
//   - range-holding phases (orbit/hold on the player): |r - preferredRange| and time inside the
//     band (+-35% of preferred) after a 20-tick settle;
//   - hit% by fire range bucket (<=130, 130-200, >200 wu) and the share of target-maneuver misses.
import { runAimSpec } from './autoAim.mjs';
import { stats, r4 } from '../labMetrics.mjs';
import { ManeuverPlanner } from '../../../src/ai/maneuver.js';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
const ACCEL = new Map((Array.isArray(ENEMY_TYPES) ? ENEMY_TYPES : Object.values(ENEMY_TYPES)).map((d) => [d.id, d.accel || 60]));
const DT = 1 / 60;
import * as reflexesModule from '../../../src/ai/reflexes.js';
const setNpcEvasionLab = reflexesModule.setNpcEvasionLab || (() => {});

const EGRESS = new Set(['extend', 'breakaway', 'escape', 'recover', 'retreat', 'disengage', 'peel', 'regroup', 'relocate']);

const S = (o) => ({ durationS: 24, weapon: 'wpn_pulse_laser_s', pilot: 'hold', dist: 300, mode: 'assist', ...o });
// patrol_lawman (lawful: never engages a clean player) and choir_zealot (escort_screen: parks with no ward)
// were dropped after the baseline (results/npc-2b/baseline.*): they produce no fight in a 1v1.
const TYPES = ['wasp_swarmer', 'corsair_raider', 'reaver_pirate', 'lancer_sniper', 'bruiser_brawler', 'detonator_dart', 'quiet_ghost', 'mine_layer_jackal'];
const SHORT = { wasp_swarmer: 'wasp', choir_zealot: 'zealot', corsair_raider: 'corsair', reaver_pirate: 'reaver', patrol_lawman: 'lawman', lancer_sniper: 'lancer', bruiser_brawler: 'bruiser', detonator_dart: 'dart', quiet_ghost: 'ghost', mine_layer_jackal: 'jackal' };
export const SCENARIOS = {};
for (const t of TYPES) {
  SCENARIOS[`${SHORT[t]}-hold`] = S({ enemies: [{ type: t }] });
  SCENARIOS[`${SHORT[t]}-cruise`] = S({ pilot: 'cruise', dist: 200, enemies: [{ type: t }] });
}
SCENARIOS['wasp-pack3-hold'] = S({ enemies: [{ type: 'wasp_swarmer' }, { type: 'wasp_swarmer', dx: 40 }, { type: 'wasp_swarmer', dx: -40 }] });
SCENARIOS['wasp-hold-nofire'] = S({ noFire: true, enemies: [{ type: 'wasp_swarmer' }] });
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export const VARIANTS = {
  baseline: {},
};

let LAST = null;
function installPlannerTap() {
  const proto = ManeuverPlanner.prototype;
  if (proto.__labTap) return;
  const p0 = proto.plan;
  proto.plan = function (a) {
    const r = p0.call(this, a);
    if (LAST) {
      const m = a && a.behavior && a.behavior.maneuver;
      const rt = this.byEntity.get(a.entityId);
      LAST.set(a.entityId, { reason: r.reason, kind: r.kind, pref: m && m.preferredRange, mTarget: m && m.targetId, reflex: rt && rt.lastReflex });
    }
    return r;
  };
  proto.__labTap = true;
}

function phaseOf(reason) {
  const s = String(reason || '');
  if (s.startsWith('combat_doctrine:')) { const parts = s.split(':'); return { doctrine: parts[1], phase: parts[2] }; }
  return { doctrine: null, phase: s || 'none' };
}

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown npc scenario ${id}`);
  installPlannerTap();
  setNpcEvasionLab(params.npcLab || {});
  LAST = new Map();
  const per = new Map(); // enemy id -> tracker
  try {
    return await runAimSpec(id, sc, { seed, bundle, params }, {
      onTick(ctx) {
        const pl = ctx.world.player();
        for (const en of ctx.enemies) {
          const L = LAST.get(en.id); if (!L) continue;
          let tr = per.get(en.id);
          if (!tr) { tr = { type: en.labTypeId, segs: [], cur: null, spd: [], reflexTicks: {}, jinks: 0, lastReflex: null, ranges: [], minR: Infinity }; per.set(en.id, tr); }
          const r = Math.hypot(en.pos.x - pl.pos.x, en.pos.z - pl.pos.z);
          const { doctrine, phase } = phaseOf(L.reason);
          tr.ranges.push(r); tr.minR = Math.min(tr.minR, r);
          tr.spd.push(Math.hypot(en.vel.x, en.vel.z));
          if (L.reflex) tr.reflexTicks[L.reflex] = (tr.reflexTicks[L.reflex] || 0) + 1;
          if (L.reflex === 'volley_jink' && tr.lastReflex !== 'volley_jink') tr.jinks++;
          tr.lastReflex = L.reflex;
          if (!tr.cur || tr.cur.phase !== phase) {
            if (tr.cur) tr.segs.push(tr.cur);
            tr.cur = { doctrine, phase, kind: L.kind, t0: ctx.t, t1: ctx.t, r0: r, r1: r, rMin: r, rMax: r, pref: L.pref, onPlayer: L.mTarget === pl.id, rs: [], spdSum: 0, ownDr: 0, ownMin: 0, vr0: null, vrs: [] };
          }
          const c = tr.cur; c.spdSum += Math.hypot(en.vel.x, en.vel.z); c.t1 = ctx.t;
          { const ux = (en.pos.x - pl.pos.x) / (r || 1), uz = (en.pos.z - pl.pos.z) / (r || 1); const vr = en.vel.x * ux + en.vel.z * uz;
            if (c.vr0 == null) c.vr0 = vr; c.ownDr += vr * DT; c.ownMin = Math.min(c.ownMin, c.ownDr); c.vrs.push(vr); } c.r1 = r; c.rMin = Math.min(c.rMin, r); c.rMax = Math.max(c.rMax, r);
          if (ctx.t - c.t0 >= 20) c.rs.push(r);
        }
      },
      extra(ctx, rounds) {
        const enemies = [];
        for (const tr of per.values()) {
          if (tr.cur) tr.segs.push(tr.cur);
          const eg = tr.segs.filter((s) => EGRESS.has(s.phase) && s.t1 - s.t0 >= 20);
          // Own-motion scoring (independent of the player's flying): the enemy's own radial
          // displacement over the leg must be outward, it must be heading out by the last third,
          // and its inward carry may not exceed its braking distance from the entry speed + 15 wu.
          const acc = ACCEL.get(tr.type) || 60;
          for (const s of eg) {
            const tail = s.vrs.slice(Math.floor(s.vrs.length * 2 / 3));
            s.vrTail = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;
            const vin = Math.max(0, -(s.vr0 || 0));
            s.carryAllow = vin * vin / (2 * acc) + 15;
            s.ownOpen = s.ownDr > 0 && s.vrTail > 0;
            s.ownDive = s.ownMin < -s.carryAllow;
          }
          const holds = tr.segs.filter((s) => (s.kind === 'orbit' || s.kind === 'hold') && s.onPlayer && Number.isFinite(s.pref) && s.rs.length);
          const holdErr = []; let inBand = 0, bandN = 0;
          for (const s of holds) for (const r of s.rs) { holdErr.push(Math.abs(r - s.pref) / s.pref); bandN++; if (Math.abs(r - s.pref) <= 0.35 * s.pref) inBand++; }
          const phaseTime = {};
          const phaseSpd = {};
          for (const s of tr.segs) { phaseTime[s.phase] = (phaseTime[s.phase] || 0) + (s.t1 - s.t0 + 1); phaseSpd[s.phase] = (phaseSpd[s.phase] || 0) + s.spdSum; }
          for (const k of Object.keys(phaseSpd)) phaseSpd[k] = r4(phaseSpd[k] / phaseTime[k]);
          enemies.push({
            type: tr.type,
            egressN: eg.length,
            egressOpenPct: eg.length ? r4(100 * eg.filter((s) => s.r1 - s.r0 > 0).length / eg.length) : null,
            egressDiveN: eg.filter((s) => s.rMin < s.r0 - 15).length,
            egressDr: stats(eg.map((s) => s.r1 - s.r0)),
            egressMaxR: stats(eg.map((s) => s.rMax)),
            egressOwnOpenPct: eg.length ? r4(100 * eg.filter((s) => s.ownOpen).length / eg.length) : null,
            egressOwnDiveN: eg.filter((s) => s.ownDive).length,
            egressOwnDr: stats(eg.map((s) => s.ownDr)),
            egressSegs: eg.slice(0, 12).map((s) => ({ phase: s.phase, t0: s.t0, dur: s.t1 - s.t0, r0: r4(s.r0), r1: r4(s.r1), rMin: r4(s.rMin), rMax: r4(s.rMax), pref: s.pref, ownDr: r4(s.ownDr), ownMin: r4(s.ownMin), vr0: r4(s.vr0), vrTail: r4(s.vrTail), carry: r4(s.carryAllow) })),
            holdErr: stats(holdErr), holdInBandPct: bandN ? r4(100 * inBand / bandN) : null, holdPref: holds.length ? holds[0].pref : null,
            range: stats(tr.ranges), minRange: r4(tr.minR), speed: stats(tr.spd),
            jinksPerMin: r4(tr.jinks / (tr.spd.length / 3600)), reflexTicks: tr.reflexTicks, phaseTime, phaseSpd,
          });
        }
        const bucket = (lo, hi) => {
          const rs = rounds.filter((r) => r.fireDist > lo && r.fireDist <= hi);
          const blocked = (o) => o === 'occluded' || o === 'pd-intercepted' || o === 'target-contact' || o === 'out-of-range' || o === 'unreachable';
          const ub = rs.filter((r) => !blocked(r.outcome));
          return { n: rs.length, unblocked: ub.length, hit: ub.filter((r) => r.outcome === 'hit').length, maneuver: ub.filter((r) => r.outcome === 'target-maneuver').length };
        };
        return { npc: enemies, buckets: { near: bucket(0, 130), mid: bucket(130, 200), far: bucket(200, 1e9) } };
      },
    });
  } finally {
    LAST = null;
    setNpcEvasionLab({});
  }
}

const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const avg = (a) => { const f = a.filter(Number.isFinite); return f.length ? r4(f.reduce((x, y) => x + y, 0) / f.length) : null; };
export function summarizeRuns(results) {
  const groups = new Map();
  for (const r of results) { const k = `${r.variant}|${r.scenario}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = [];
  for (const [k, rs] of groups) {
    const [variant, scenario] = k.split('|');
    const B = (b) => { const n = sum(rs, (r) => r.buckets[b].unblocked); const h = sum(rs, (r) => r.buckets[b].hit); const m = sum(rs, (r) => r.buckets[b].maneuver); return { n, hit: n ? r4(100 * h / n) : null, man: n ? r4(100 * m / n) : null }; };
    const near = B('near'), mid = B('mid'), far = B('far');
    const allN = near.n + mid.n + far.n;
    const allHit = sum(rs, (r) => r.buckets.near.hit + r.buckets.mid.hit + r.buckets.far.hit);
    const npcs = rs.flatMap((r) => r.npc);
    const egN = sum(npcs, (n) => n.egressN);
    const egOpen = sum(npcs, (n) => n.egressN && n.egressOpenPct != null ? n.egressOpenPct * n.egressN / 100 : 0);
    out.push({
      variant, scenario, seeds: rs.length, fired: sum(rs, (r) => r.fired),
      ubHit: allN ? r4(100 * allHit / allN) : null, nearHit: near.hit, midHit: mid.hit, farHit: far.hit,
      nearN: near.n, midN: mid.n, farN: far.n, manPct: allN ? r4(100 * sum(rs, (r) => r.buckets.near.maneuver + r.buckets.mid.maneuver + r.buckets.far.maneuver) / allN) : null,
      egN, egOpenPct: egN ? r4(100 * egOpen / egN) : null, egDive: sum(npcs, (n) => n.egressDiveN), egDrP50: avg(npcs.map((n) => n.egressDr.p50)),
      holdErrP50: avg(npcs.map((n) => n.holdErr.p50)), holdInBand: avg(npcs.map((n) => n.holdInBandPct)), holdPref: npcs.find((n) => n.holdPref)?.holdPref ?? null,
      rangeP50: avg(npcs.map((n) => n.range.p50)), minRange: r4(Math.min(...npcs.map((n) => n.minRange))), spdP50: avg(npcs.map((n) => n.speed.p50)),
      jinksPerMin: avg(npcs.map((n) => n.jinksPerMin)),
    });
  }
  return out;
}

export const COLUMNS = [
  { label: 'variant', key: 'variant' }, { label: 'scenario', key: 'scenario' }, { label: 'fired', key: 'fired' },
  { label: 'ubHit%', key: 'ubHit' }, { label: 'near%', key: 'nearHit' }, { label: 'mid%', key: 'midHit' }, { label: 'far%', key: 'farHit' },
  { label: 'man%', key: 'manPct' }, { label: 'egN', key: 'egN' }, { label: 'egOpen%', key: 'egOpenPct' }, { label: 'dive', key: 'egDive' },
  { label: 'egDr p50', key: 'egDrP50' }, { label: 'holdErr', key: 'holdErrP50' }, { label: 'inBand%', key: 'holdInBand' }, { label: 'pref', key: 'holdPref' },
  { label: 'r p50', key: 'rangeP50' }, { label: 'rMin', key: 'minRange' }, { label: 'spd', key: 'spdP50' }, { label: 'jink/min', key: 'jinksPerMin' },
];
