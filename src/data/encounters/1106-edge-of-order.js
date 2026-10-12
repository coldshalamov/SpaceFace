// 1106 — AT THE EDGE OF ORDER (SFQ-M M33). Two Boundary Walkers hold a finite containment plane
// between them. On the far side reactive spore mass is drifting in; on the near side a Pitborn ore
// barge is crossing on a fixed burn whose route runs past both ends of the plane.
//
// The plane is selective: it arrests the admitted category (reactive spore mass) by cancelling the
// velocity that would carry a clump through it, and it does nothing to ordinary hulls — ships,
// barges and Massline-thrown bodies pass. It is finite: at either edge the barge is exposed.
//
//   * use the plane: keep the barge in its shadow and intercept only the clumps that flank the edges;
//   * or take the barge in tow and run it out your own way, fighting the clumps without the field.
//
// Three clumps stuck to the barge foul its burn and strand it. The Walkers announce a power cycle at
// fire; when it comes the plane releases what it holds exactly as its law says — held clumps keep the
// zero normal velocity it left them, nothing is flung. All motion is impulses through the authority.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1106;
export const trigger = deepFreeze({
  id: 'edge_of_order',
  tier: 'minor',
  deck: 'civilian',
  weight: 1,
  zoneTypes: ['anomaly_deep'],
  script: 'selfRegistered',
  pressureCost: 16,
  cooldownS: 1500,
  proximity: true,
  gates: {
    // Ashfall's boundary-walker site and the deep anomalies of the outer Bolus and Sedna dark.
    sectorIds: ['sector_ashfall_reach', 'sector_the_bolus', 'sector_sedna_dark'],
  },
});

const WINDOW_S = 300;
const POWER_S = 170;               // declared at fire: the Walkers' power cycle
const PLANE_HALF_WU = 220;
const PLANE_SKIN_WU = 30;
const ROUTE_OFFSET_WU = 90;        // the barge's route runs this far behind the plane …
const ROUTE_HALF_WU = 360;         // … and past both of its edges
const BLOOM_WU = 380;              // spores enter from this far beyond the plane
const BARGE_RADIUS = 20;
const BARGE_MASS = 1500;
const BARGE_SPEED = 5;
const BURN_GAIN = 0.6;
const SPORE_RADIUS = 6;
const SPORE_MASS = 15;
const SPORE_SPEED = 8;
const SPORE_EVERY_S = 10;
const MAX_SPORES = 14;
const STICK_SLACK_WU = 4;
const FOUL_AT = 3;
const EXIT_WU = 60;
const MAX_STEP_S = 1.5;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const CLEAN_PAY = 340;
const DIRTY_PAY = 220;
const CONVOY_FACTION = 'faction_pitborn';
const SPORE_KIND = 'm33_reactive_spore';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
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
    // `n` is the plane normal pointing from the bloom side to the protected side; `t` runs along it.
    const n = { x: Math.cos(ang), z: Math.sin(ang) };
    const t = { x: -n.z, z: n.x };
    const at = (along, normal) => ({ x: mid.x + t.x * along + n.x * normal, z: mid.z + t.z * along + n.z * normal });
    const layout = {
      mid, n, t,
      walkers: [at(-PLANE_HALF_WU, 0), at(PLANE_HALF_WU, 0)],
      routeStart: at(-ROUTE_HALF_WU, ROUTE_OFFSET_WU),
      routeEnd: at(ROUTE_HALF_WU, ROUTE_OFFSET_WU),
      bloom: at(0, -BLOOM_WU),
    };
    let blocked = 0;
    for (const p of [...layout.walkers, layout.routeStart, layout.routeEnd, layout.mid]) {
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

function alive(e) { return !!e && e.alive !== false && !(e.data && e.data.sporeStuck); }

function kick(state, e, dvx, dvz, kind) {
  const m = Number(e.mass) || SPORE_MASS;
  return queuePhysicsImpulse(e, { x: dvx * m, y: 0, z: dvz * m }, {
    provenance: 'encounter:edge_of_order', tick: state.tick | 0, kind,
  });
}

/** Plane coordinates of a point: `s` along the plane, `h` signed height on the protected side. */
function planeCoords(o, pos) {
  const dx = pos.x - o.mid.x, dz = pos.z - o.mid.z;
  return { s: dx * o.t.x + dz * o.t.z, h: dx * o.n.x + dz * o.n.z };
}

/** The plane's law, applied to one body: only the admitted category, only inside the finite span. */
export function planeArrests(o, e) {
  if (!e || !e.data || e.data.storyPropKind !== SPORE_KIND) return false;
  const { s, h } = planeCoords(o, e.pos);
  if (Math.abs(s) > PLANE_HALF_WU || h > 0 || h < -PLANE_SKIN_WU) return false;
  const vn = (e.vel?.x || 0) * o.n.x + (e.vel?.z || 0) * o.n.z;
  return vn > 0;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const layout = findLayout(state, center, d.stream(live, 'm33_layout'));
    const walkers = layout.walkers.map((pos, i) => d.spawnProp(live, {
      type: 'machine', pos, radius: 12, mass: 1e6, tetherable: false,
      scanLabel: `BOUNDARY WALKER ${i ? 'B' : 'A'} — HOLDING A SELECTIVE PLANE (REACTIVE MATTER ONLY)`,
      storyPropKind: 'm33_walker',
    }));
    const barge = d.spawnProp(live, {
      type: 'payload', pos: layout.routeStart, radius: BARGE_RADIUS, mass: BARGE_MASS, tetherable: true,
      scanLabel: 'PITBORN ORE BARGE — CROSSING ON A FIXED BURN', storyPropKind: 'm33_ore_barge',
    });
    if (walkers.some((w) => !w) || !barge) return d.abort(live, 'no_bodies');
    walkers.forEach((w, i) => {
      w.data.masslineTetherable = false;
      w.data.machine = { kind: 'boundary_walker', anchor: { ...layout.walkers[i] }, t: 0, phase: 0, encounterOwned: true };
    });
    barge.physicsBody = { shape: 'ball', mass: BARGE_MASS, dynamic: true };
    barge.data.masslineTetherable = true;
    barge.vel = { x: layout.t.x * BARGE_SPEED, z: layout.t.z * BARGE_SPEED };

    const now = d.now();
    live.data.edge = {
      walkerIds: walkers.map((w) => w.id),
      bargeId: barge.id,
      sporeIds: [],
      mid: { ...layout.mid }, n: { ...layout.n }, t: { ...layout.t },
      routeEnd: { ...layout.routeEnd },
      bloom: { ...layout.bloom },
      powerOffAt: now + POWER_S,
      powered: true,
      nextSporeAt: now + 6,
      sporeSerial: 0,
      arrested: 0,
      stuck: 0,
      inTow: false,
      fouled: false,
      lastTickAt: null,
      settled: false,
      outcome: null,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'crossing';
    live.approach = { signal: 'walker_plane', contacts: 3, t: now };
    d.say(live, 'alert',
      `SCAN: Two Boundary Walkers hold a plane against drifting spore mass. A Pitborn barge is crossing behind it — past both ends. Walker power cycles in ${POWER_S} s.`,
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const o = live.data && live.data.edge;
    if (!o || live.phase === 'done' || o.settled || !payload) return;
    if (name === 'tetherAttached' && payload.targetId === o.bargeId && !o.inTow && !o.fouled) {
      o.inTow = true;
      const barge = entityById(state, o.bargeId);
      if (barge && barge.data) barge.data.scanLabel = 'PITBORN ORE BARGE — IN YOUR TOW, BURN CUT';
      d.say(live, 'alert', 'BARGE: BURN CUT. YOUR LINE, YOUR ROUTE — GET US OUT.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const o = live.data && live.data.edge;
    if (!o || live.phase === 'done' || o.settled) return;
    const player = d.player();
    if (!player || player.alive === false) return this._settle(d, live, o, 'lost');
    const barge = entityById(state, o.bargeId);
    if (!barge || barge.alive === false) return this._settle(d, live, o, 'lost');
    const step = Math.min(MAX_STEP_S, Math.max(0, now - (o.lastTickAt == null ? now : o.lastTickAt)));
    o.lastTickAt = now;

    if (o.powered && now >= o.powerOffAt) {
      o.powered = false;
      for (const id of o.walkerIds) {
        const w = entityById(state, id);
        if (w && w.data) w.data.scanLabel = 'BOUNDARY WALKER — POWER CYCLE, PLANE DOWN';
      }
      d.say(live, 'alert', 'WALKERS: POWER CYCLE. PLANE RELEASED.', null, { literal: true });
    }

    // The bloom keeps feeding clumps toward wherever the barge is now.
    if (now >= o.nextSporeAt && o.sporeIds.length < MAX_SPORES) {
      o.nextSporeAt = now + SPORE_EVERY_S;
      const rng = d.stream(live, `m33_spore_${o.sporeSerial}`);
      const lateral = (rng() - 0.5) * 2 * PLANE_HALF_WU * 1.4;
      const pos = { x: o.bloom.x + o.t.x * lateral, z: o.bloom.z + o.t.z * lateral };
      const spore = d.spawnProp(live, {
        type: 'payload', pos, radius: SPORE_RADIUS, mass: SPORE_MASS, tetherable: true,
        scanLabel: 'REACTIVE SPORE MASS — ADHESIVE, DRIFTING FOR WARM HULLS', storyPropKind: SPORE_KIND,
      });
      if (spore) {
        o.sporeSerial++;
        spore.data.spawnedAt = now;
        spore.physicsBody = { shape: 'ball', mass: SPORE_MASS, dynamic: true };
        spore.data.masslineTetherable = true;
        const dx = barge.pos.x - pos.x, dz = barge.pos.z - pos.z, L = Math.hypot(dx, dz) || 1;
        // Launched through the authority on the next tick, once its Rapier body exists.
        spore.data.launch = { x: (dx / L) * SPORE_SPEED, z: (dz / L) * SPORE_SPEED };
        o.sporeIds.push(spore.id);
      }
    }

    for (const id of o.sporeIds) {
      const spore = entityById(state, id);
      if (!alive(spore)) continue;
      if (spore.data.launch && spore.data.launchQueuedAt == null && spore.data.spawnedAt !== now) {
        spore.data.launchQueuedAt = now;
        kick(state, spore, spore.data.launch.x, spore.data.launch.z, 'spore_drift');
        continue;
      }
      if (o.powered && planeArrests(o, spore)) {
        const vn = (spore.vel?.x || 0) * o.n.x + (spore.vel?.z || 0) * o.n.z;
        kick(state, spore, -vn * o.n.x, -vn * o.n.z, 'plane_arrest');
        if (!spore.data.planeHeld) { spore.data.planeHeld = true; o.arrested++; }
      }
      if (!o.fouled && dist(spore.pos, barge.pos) <= BARGE_RADIUS + SPORE_RADIUS + STICK_SLACK_WU) {
        spore.data.sporeStuck = true;
        spore.data.despawnAt = now;
        o.stuck++;
        d.say(live, 'alert', o.stuck >= FOUL_AT
          ? 'BARGE: BURN FOULED. WE ARE STRANDED.'
          : `BARGE: SPORE ON THE HULL (${o.stuck}/${FOUL_AT}).`, null, { literal: true });
        if (o.stuck >= FOUL_AT) o.fouled = true;
      }
    }
    o.sporeIds = o.sporeIds.filter((id) => alive(entityById(state, id)));

    if (o.fouled) return this._settle(d, live, o, 'fouled');

    const pc = planeCoords(o, barge.pos);
    if (dist(barge.pos, o.routeEnd) <= EXIT_WU || pc.s > ROUTE_HALF_WU + EXIT_WU || (o.inTow && dist(barge.pos, o.mid) > ROUTE_HALF_WU + 2 * EXIT_WU)) {
      return this._settle(d, live, o, o.stuck === 0 ? 'crossed' : 'crossed_fouled');
    }
    if (!o.inTow && step > 0) {
      // The barge's own burn: hold the route line at a fixed crossing speed.
      const vx = barge.vel?.x || 0, vz = barge.vel?.z || 0;
      const want = { x: o.t.x * BARGE_SPEED - o.n.x * (pc.h - ROUTE_OFFSET_WU) * 0.05, z: o.t.z * BARGE_SPEED - o.n.z * (pc.h - ROUTE_OFFSET_WU) * 0.05 };
      kick(state, barge, (want.x - vx) * BURN_GAIN, (want.z - vz) * BURN_GAIN, 'barge_burn');
    }
    if (now >= live.deadlineAt) return this._settle(d, live, o, 'lapsed');
  },

  _settle(d, live, o, outcome) {
    if (o.settled) return;
    o.settled = true;
    o.outcome = outcome;
    const barge = entityById(d.state, o.bargeId);
    if (outcome === 'crossed' || outcome === 'crossed_fouled') {
      d.grant(outcome === 'crossed' ? CLEAN_PAY : DIRTY_PAY, `edge_of_order:${outcome}`);
      d.rep(CONVOY_FACTION, outcome === 'crossed' ? 3 : 1, `edge_of_order_${outcome}`);
      if (barge && barge.data) barge.data.scanLabel = outcome === 'crossed' ? 'PITBORN ORE BARGE — THROUGH, CLEAN HULL' : `PITBORN ORE BARGE — THROUGH, ${o.stuck} SPORE SCARS`;
    } else if (outcome === 'fouled') {
      d.rep(CONVOY_FACTION, -1, 'edge_of_order_fouled');
      if (barge && barge.data) {
        barge.data.scanLabel = 'PITBORN ORE BARGE — FOULED, STRANDED AT THE EDGE OF ORDER';
        const vx = barge.vel?.x || 0, vz = barge.vel?.z || 0;
        // The fouled burn stalls the barge through the authority; it stays where it died.
        kick(d.state, barge, -vx, -vz, 'burn_fouled');
      }
    }
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: CONVOY_FACTION,
  },
  factionId: CONVOY_FACTION,
  title: 'AT THE EDGE OF ORDER',
  primaryLine: `SCAN: Two Boundary Walkers hold a plane against drifting spore mass. A Pitborn barge is crossing behind it — past both ends. Walker power cycles in ${POWER_S} s.`,
  verbs: ['escort', 'latch', 'throw', 'tow'],
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    crossed: 'THROUGH CLEAN — the barge clears the edge with no spore on its hull. Pitborn pay in full.',
    crossed_fouled: 'THROUGH, SCARRED — the barge made it out with spore on its hull. Reduced pay.',
    fouled: 'FOULED — the barge is stranded at the edge of order, its burn choked with spore.',
    lapsed: 'The barge is still out there, crawling along the plane.',
    lost: 'The crossing ended without the barge.',
  },
});
