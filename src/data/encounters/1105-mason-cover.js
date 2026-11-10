// 1105 — THE MASON MOVES THE COVER (SFQ-M M31). Raiders hold an ambush lane inside a precursor
// Mason's yard, and the Mason will not pause its schedule for them: it is relocating a rib section —
// a real, heavy, dynamic workpiece — along three waypoints that cross the firing lanes between the
// pilot and the raiders. A fixed gantry wreck is the safe alternate cover.
//
//   * use the moving mass: latch the rib section and use it as cover or as a Massline projectile —
//     it works, and the Mason records the diverted workpiece as an unresolved obligation;
//   * isolate the drive: pull the Mason's drive cell out of its cradle so the section stops being
//     driven, and fight conventionally — also an obligation, a different one;
//   * or leave the schedule alone, win the fight around it, and witness the relocation complete.
//
// The Mason drives the section with impulses through the physics authority; Rapier integrates them.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1105;
export const trigger = deepFreeze({
  id: 'mason_cover',
  tier: 'minor',
  deck: 'combat',
  weight: 1,
  zoneTypes: ['ambush_lane'],
  script: 'selfRegistered',
  pressureCost: 30,
  cooldownS: 1500,
  proximity: true,
  gates: {
    // The Pallas mason yard (machine site) and the two deep ambush lanes beyond it.
    sectorIds: ['sector_pallas_drift', 'sector_ashfall_reach', 'sector_sker_haven'],
  },
});

const WINDOW_S = 420;
const WAYPOINT_SPACING_WU = 200;
const MASON_BACK_WU = 260;          // the Mason stands back from the lane it works across
const RAIDER_STANDOFF_WU = 320;
const COVER_SIDE_WU = 260;
const CRADLE_OFFSET_WU = 34;
const SECTION_RADIUS = 22;
const SECTION_MASS = 900;
const CELL_RADIUS = 5;
const CELL_MASS = 30;
const DRIVE_WU = 80;                // a cell pulled this far from its cradle no longer feeds the lift
const ARRIVE_WU = 18;
const ARRIVE_SPEED = 1.5;
const HOLD_S = 8;
const DRIVE_K = 0.05;
const DRIVE_C = 0.45;
const DRIVE_MAX_ACCEL = 1.2;        // a slow, readable relocation …
const DRIVE_MAX_SPEED = 6;          // … that still changes firing lanes in a fight
const MAX_STEP_S = 1.5;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const WITNESSED_PAY = 380;
const OBLIGATION_PAY = 300;
const MACHINE_FACTION = 'faction_archive';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup' || e.type === 'ship') continue;
    if (dist(e.pos, center) <= radius) out.push(e);
  }
  return out;
}

function findLayout(state, center, rng) {
  const blockers = blockersNear(state, center, 900);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const mid = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    // `fwd` points from the raiders' side toward the pilot's; the workpiece crosses along `side`.
    const fwd = { x: Math.cos(ang), z: Math.sin(ang) };
    const side = { x: -fwd.z, z: fwd.x };
    const at = (f, s) => ({ x: mid.x + fwd.x * f + side.x * s, z: mid.z + fwd.z * f + side.z * s });
    const layout = {
      fwd,
      side,
      mid,
      waypoints: [at(0, -WAYPOINT_SPACING_WU), at(0, 0), at(0, WAYPOINT_SPACING_WU)],
      mason: at(0, -WAYPOINT_SPACING_WU - MASON_BACK_WU),
      cradle: at(CRADLE_OFFSET_WU, -WAYPOINT_SPACING_WU - MASON_BACK_WU),
      raiders: [at(-RAIDER_STANDOFF_WU, -60), at(-RAIDER_STANDOFF_WU, 60)],
      cover: at(RAIDER_STANDOFF_WU * 0.4, COVER_SIDE_WU + WAYPOINT_SPACING_WU * 0.6),
    };
    let blocked = 0;
    for (const p of [...layout.waypoints, layout.mason, layout.cover]) {
      for (const r of blockers) if (dist(r.pos, p) < (r.radius || 0) + CLEAR_WU) blocked++;
    }
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function speedOf(e) { return Math.hypot((e.vel && e.vel.x) || 0, (e.vel && e.vel.z) || 0); }

function kick(state, e, dvx, dvz, kind) {
  const m = Number(e.mass) || SECTION_MASS;
  return queuePhysicsImpulse(e, { x: dvx * m, y: 0, z: dvz * m }, {
    provenance: 'encounter:mason_cover', tick: state.tick | 0, kind,
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const layout = findLayout(state, center, d.stream(live, 'm31_layout'));
    const raiderSpecs = ships.filter((sh) => sh && sh.role === 'squad').slice(0, layout.raiders.length);
    if (!raiderSpecs.length) return d.abort(live, 'no_cast');
    raiderSpecs.forEach((sh, i) => { sh.role = 'raider'; sh.pos = { ...layout.raiders[i] }; });
    d.spawnShips(live, raiderSpecs);
    if (d.aliveCount(live, 'raider') < 1) return d.abort(live, 'no_budget');

    const mason = d.spawnProp(live, {
      type: 'machine', pos: layout.mason, radius: 16, mass: 1e6, tetherable: false,
      scanLabel: 'MASON — RELOCATING A RIB SECTION ON SCHEDULE', storyPropKind: 'm31_mason',
    });
    const section = d.spawnProp(live, {
      type: 'payload', pos: layout.waypoints[0], radius: SECTION_RADIUS, mass: SECTION_MASS, tetherable: true,
      scanLabel: 'RIB SECTION — MASON WORKPIECE, IN TRANSIT', storyPropKind: 'm31_rib_section',
    });
    const cell = d.spawnProp(live, {
      type: 'payload', pos: layout.cradle, radius: CELL_RADIUS, mass: CELL_MASS, tetherable: true,
      scanLabel: 'MASON DRIVE CELL — FEEDING THE WORKPIECE LIFT', storyPropKind: 'm31_drive_cell',
    });
    const cover = d.spawnWreck(live, {
      pos: layout.cover, scanLabel: 'OLD GANTRY WRECK — FIXED COVER', storyPropKind: 'm31_fixed_cover',
      pool: { cmdty_scrap_metal: 1 },
    });
    if (!mason || !section || !cell || !cover) return d.abort(live, 'no_bodies');
    section.physicsBody = { shape: 'ball', mass: SECTION_MASS, dynamic: true };
    section.data.masslineTetherable = true;
    cell.physicsBody = { shape: 'ball', mass: CELL_MASS, dynamic: true };
    cell.data.masslineTetherable = true;
    mason.data.masslineTetherable = false;
    // The catalogue Mason silhouette; no homeSectorId, so the Verge machine layer never patrols it.
    mason.data.machine = { kind: 'mason', anchor: { ...layout.mason }, t: 0, phase: 0, encounterOwned: true };

    const now = d.now();
    live.data.yard = {
      masonId: mason.id,
      sectionId: section.id,
      cellId: cell.id,
      coverId: cover.id,
      waypoints: layout.waypoints.map((w) => ({ ...w })),
      cradlePos: { ...layout.cradle },
      fwd: { ...layout.fwd },
      leg: 1,
      heldSince: null,
      relocated: false,
      diverted: false,
      driveIsolated: false,
      obligation: null,
      raidersCleared: false,
      lastTickAt: null,
      settled: false,
      outcome: null,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'fight';
    live.approach = { signal: 'mason_work_light', contacts: 2 + raiderSpecs.length, t: now };
    d.say(live, 'alert',
      'SCAN: Raiders in a Mason\'s yard — and the Mason is still working. Its rib section is crossing the lane between you. Use it, shut its drive, or fight around it.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const y = live.data && live.data.yard;
    if (!y || live.phase === 'done' || y.settled || !payload) return;
    if (name === 'tetherAttached' && payload.targetId === y.sectionId && !y.diverted) {
      y.diverted = true;
      if (!y.relocated) this._oblige(d, live, y, 'workpiece_diverted');
    }
  },

  _oblige(d, live, y, kind) {
    if (y.obligation) return;
    y.obligation = kind;
    const mason = entityById(d.state, y.masonId);
    if (alive(mason)) {
      mason.data.scanLabel = kind === 'workpiece_diverted'
        ? 'MASON — WORKPIECE DIVERTED; OBLIGATION UNRESOLVED'
        : 'MASON — DRIVE ISOLATED; OBLIGATION UNRESOLVED';
    }
    d.say(live, 'alert', kind === 'workpiece_diverted'
      ? 'MASON: WORKPIECE OFF SCHEDULE. OBLIGATION RECORDED.'
      : 'MASON: LIFT UNPOWERED. SCHEDULE HELD. OBLIGATION RECORDED.', null, { literal: true });
  },

  tick(d, live, state, now) {
    const y = live.data && live.data.yard;
    if (!y || live.phase === 'done' || y.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, y, 'lost');
    const step = Math.min(MAX_STEP_S, Math.max(0, now - (y.lastTickAt == null ? now : y.lastTickAt)));
    y.lastTickAt = now;
    const section = entityById(state, y.sectionId);
    const cell = entityById(state, y.cellId);

    if (!y.driveIsolated && (!alive(cell) || dist(cell.pos, y.cradlePos) > DRIVE_WU)) {
      y.driveIsolated = true;
      if (!y.relocated) this._oblige(d, live, y, 'drive_isolated');
    }

    // The Mason keeps its schedule while its lift is fed and its workpiece is its own.
    if (alive(section) && !y.relocated && !y.diverted && !y.driveIsolated && step > 0) {
      const target = y.waypoints[y.leg];
      const dT = dist(section.pos, target);
      if (dT <= ARRIVE_WU && speedOf(section) <= ARRIVE_SPEED) {
        if (y.heldSince == null) y.heldSince = now;
        if (y.leg === y.waypoints.length - 1) {
          y.relocated = true;
          const mason = entityById(state, y.masonId);
          if (alive(mason)) mason.data.scanLabel = 'MASON — RELOCATION COMPLETE';
          section.data.scanLabel = 'RIB SECTION — SET IN PLACE BY THE MASON';
          d.say(live, 'alert', 'MASON: WORKPIECE SET. SCHEDULE COMPLETE.', null, { literal: true });
        } else if (now - y.heldSince >= HOLD_S) {
          y.leg++;
          y.heldSince = null;
        }
      } else {
        y.heldSince = null;
      }
      if (!y.relocated) {
        const vx = section.vel?.x || 0, vz = section.vel?.z || 0;
        let ax = DRIVE_K * (target.x - section.pos.x) - DRIVE_C * vx;
        let az = DRIVE_K * (target.z - section.pos.z) - DRIVE_C * vz;
        const a = Math.hypot(ax, az);
        if (a > DRIVE_MAX_ACCEL) { ax *= DRIVE_MAX_ACCEL / a; az *= DRIVE_MAX_ACCEL / a; }
        let nvx = vx + ax * step, nvz = vz + az * step;
        const ns = Math.hypot(nvx, nvz);
        if (ns > DRIVE_MAX_SPEED) { nvx *= DRIVE_MAX_SPEED / ns; nvz *= DRIVE_MAX_SPEED / ns; }
        kick(state, section, nvx - vx, nvz - vz, 'mason_lift');
      }
    }

    if (!y.raidersCleared && d.aliveCount(live, 'raider') === 0) {
      y.raidersCleared = true;
      live.phase = 'aftermath';
      if (!y.obligation && !y.relocated) {
        d.say(live, 'alert', 'The lane is yours. The Mason is still setting its rib section.', null, { literal: true });
      }
    }
    if (y.raidersCleared) {
      if (y.obligation === 'workpiece_diverted') return this._settle(d, live, y, 'exploited');
      if (y.obligation === 'drive_isolated') return this._settle(d, live, y, 'isolated');
      if (y.relocated || !alive(section)) return this._settle(d, live, y, y.relocated ? 'witnessed' : 'exploited');
    }
    if (now >= live.deadlineAt) return this._settle(d, live, y, 'lapsed');
  },

  _settle(d, live, y, outcome) {
    if (y.settled) return;
    y.settled = true;
    y.outcome = outcome;
    if (outcome === 'witnessed') {
      d.grant(WITNESSED_PAY, 'mason_cover:witnessed');
      d.rep(MACHINE_FACTION, 2, 'mason_cover_witnessed');
    } else if (outcome === 'exploited' || outcome === 'isolated') {
      d.grant(OBLIGATION_PAY, `mason_cover:${outcome}`);
      d.rep(MACHINE_FACTION, -1, `mason_cover_${outcome}`);
      const section = entityById(d.state, y.sectionId);
      if (alive(section) && section.data && !y.relocated) {
        section.data.scanLabel = outcome === 'exploited'
          ? 'RIB SECTION — PULLED OFF THE MASON\'S SCHEDULE'
          : 'RIB SECTION — STRANDED WHEN THE LIFT LOST POWER';
      }
    }
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'reaver_pirate',
  },
  factionId: MACHINE_FACTION,
  title: 'THE MASON MOVES THE COVER',
  primaryLine: 'SCAN: Raiders in a Mason\'s yard — and the Mason is still working. Its rib section is crossing the lane between you. Use it, shut its drive, or fight around it.',
  verbs: ['fight', 'latch', 'throw', 'isolate'],
  squad: {
    archetypes: ['reaver_pirate'],
    size: [2, 2],
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    witnessed: 'LANE CLEARED, SCHEDULE KEPT — the rib section is set where the Mason meant it to be.',
    exploited: 'LANE CLEARED WITH THE MASON\'S STONE — it worked, and the Mason has written down whose hand moved it.',
    isolated: 'LANE CLEARED WITH THE LIFT DEAD — the section sits stranded mid-yard. The Mason has an unresolved line against you.',
    lapsed: 'The raiders still hold the yard. The Mason works on around them.',
    lost: 'The yard fight ended without you.',
  },
});
