// 1100 — BREAKAWAY FREIGHT (SFQ-M M02). A yard tug on a refinery approach blew its coupler; the
// last freight segment of its train is already drifting down the approach toward a yard spar.
// The manifest is on the segment's label. Nothing scripted brings it back:
//
//   * gentle tow: latch it, match its drift, swing a wide turn and ease it into the tug's net;
//   * controlled throw: latch, line it up and release it into the same net.
//
// Both answers end in the same acceptance volume and are judged by the same measurement — the
// segment's real speed relative to the tug when it enters the net. Soft is intact; hard is caught
// but split (less pay, spilled alloys left as a cleanup lot); too hard bursts the net. A segment
// that reaches the spar is crushed into scrap and stays crushed. There is no drag: a segment
// nobody catches keeps drifting until it hits something or leaves the approach.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1100;
export const trigger = deepFreeze({
  id: 'breakaway_freight',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.1,
  zoneTypes: ['refinery_approach'],
  script: 'selfRegistered',
  pressureCost: 16,
  cooldownS: 1200,
  proximity: true,
  gates: {
    sectorIds: ['sector_ceres_belt', 'sector_charon_expanse', 'sector_vesta_forge'],
  },
});

const WINDOW_S = 240;
const SEGMENT_START_WU = 260;      // just clear of the tug when the coupler lets go
const SPAR_DIST_WU = 1150;         // the drift line ends here: ~64 s at drift speed
const DRIFT_SPEED = 14;
const SEGMENT_RADIUS = 9;
const SEGMENT_MASS = 60;           // tow-class for a starter hull: the line moves it, not the pilot
const BAY_WU = 140;                // the tug's receiving net, measured from the tug's centre
const SOFT_SPEED = 45;             // into the net at or under this: intact
const NET_SPEED = 110;             // over SOFT and up to this: caught but split; over this: burst
const LOST_RANGE_WU = 2600;
const SPAR_CONTACT_PAD_WU = 12;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 160;
const MANIFEST_COMMODITY = 'cmdty_alloys';
const MANIFEST_QTY = 8;
const SPLIT_SPILL_QTY = 3;
const BURST_SPILL_QTY = 2;
const CRUSH_SCRAP = Object.freeze({ cmdty_scrap_metal: 5 });
const SPILL_TTL_S = 600;
const INTACT_PAY = 340;
const SPLIT_PAY = 150;
const TUG_FACTION = 'faction_mts';

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

/** Points along the drift corridor must be clear, or the segment would hit something else first. */
function corridorBlocked(blockers, from, to) {
  let n = 0;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const p = { x: from.x + (to.x - from.x) * (i / steps), z: from.z + (to.z - from.z) * (i / steps) };
    for (const r of blockers) if (dist(r.pos, p) < (r.radius || 0) + CLEAR_WU) n++;
  }
  return n;
}

function findLayout(state, center, rng) {
  const blockers = blockersNear(state, center, SPAR_DIST_WU + 900);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const tug = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    const dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const layout = {
      tug,
      dir,
      segment: { x: tug.x + dir.x * SEGMENT_START_WU, z: tug.z + dir.z * SEGMENT_START_WU },
      spar: { x: tug.x + dir.x * SPAR_DIST_WU, z: tug.z + dir.z * SPAR_DIST_WU },
    };
    const blocked = corridorBlocked(blockers, tug, layout.spar);
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function relSpeed(a, b) {
  const av = a.vel || { x: 0, z: 0 };
  const bv = (b && b.vel) || { x: 0, z: 0 };
  return Math.hypot((av.x || 0) - (bv.x || 0), (av.z || 0) - (bv.z || 0));
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const tugSpec = ships.find((sh) => sh && (sh.role === 'squad' || sh.role === 'tug'));
    if (!tugSpec) return d.abort(live, 'no_cast');
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');

    const layout = findLayout(state, center, d.stream(live, 'm02_layout'));
    tugSpec.role = 'tug';
    tugSpec.team = 2;
    tugSpec.context = 'civilian';
    tugSpec.pos = { ...layout.tug };
    tugSpec.factionId = TUG_FACTION;
    tugSpec.passive = true;
    const ids = d.spawnShips(live, [tugSpec]);
    if (!ids.length || d.aliveCount(live, 'tug') < 1) return d.abort(live, 'no_budget');
    const tug = d.entsOf(live, 'tug')[0];
    if (tug && tug.data) tug.data.scanLabel = 'YARD TUG — COUPLER BLOWN, NET OUT';

    const segment = d.spawnProp(live, {
      type: 'payload', pos: layout.segment, radius: SEGMENT_RADIUS, mass: SEGMENT_MASS, tetherable: true,
      scanLabel: `BREAKAWAY SEGMENT — MANIFEST: ${MANIFEST_QTY}× COMPOSITE ALLOYS`, storyPropKind: 'm02_freight_segment',
    });
    const spar = d.spawnWreck(live, {
      pos: layout.spar, pool: {}, scanLabel: 'YARD SPAR — IMMOVABLE', storyPropKind: 'm02_yard_spar',
    });
    if (!segment || !spar) return d.abort(live, 'no_bodies');
    segment.vel = { x: layout.dir.x * DRIFT_SPEED, z: layout.dir.z * DRIFT_SPEED };
    segment.physicsBody = { shape: 'ball', mass: SEGMENT_MASS, dynamic: true };
    segment.data.masslineTetherable = true;
    segment.data.manifest = { commodityId: MANIFEST_COMMODITY, qty: MANIFEST_QTY };
    if (spar.data) { spar.data.salvagePool = {}; spar.data.salvageTimeLeft = 0; }

    const now = d.now();
    live.data.breakaway = {
      tugId: tug ? tug.id : ids[0],
      segmentId: segment.id,
      sparId: spar.id,
      sparPos: { ...layout.spar },
      sparRadius: Number(spar.radius) || 0,
      latched: false,
      latchHinted: false,
      entrySpeed: null,
      settled: false,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'drifting';
    live.approach = { signal: 'breakaway_segment', contacts: ids.length + 2, t: now };
    d.say(live, 'alert',
      'TUG: Coupler blew — my last segment is loose and drifting for the spar. Eight alloys on it. Ease it into my net, or put it in there clean. Fast and it splits.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const b = live.data && live.data.breakaway;
    if (!b || live.phase === 'done' || b.settled) return;
    if (name === 'tetherAttached' && payload && payload.targetId === b.segmentId) {
      b.latched = true;
      if (b.latchHinted) return;
      b.latchHinted = true;
      d.say(live, 'alert', 'TUG: You\'ve got it. Kill the drift first — then bring it home wide.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const b = live.data && live.data.breakaway;
    if (!b || live.phase === 'done' || b.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, b, 'lost', null);
    const segment = entityById(state, b.segmentId);
    if (!alive(segment)) return this._settle(d, live, b, 'destroyed', null);
    const tug = entityById(state, b.tugId);

    if (dist(segment.pos, b.sparPos) <= b.sparRadius + SEGMENT_RADIUS + SPAR_CONTACT_PAD_WU) {
      return this._settle(d, live, b, 'crushed', segment);
    }
    if (alive(tug) && dist(segment.pos, tug.pos) <= BAY_WU) {
      const speed = relSpeed(segment, tug);
      b.entrySpeed = Math.round(speed * 10) / 10;
      if (speed <= SOFT_SPEED) return this._settle(d, live, b, 'intact', segment);
      if (speed <= NET_SPEED) return this._settle(d, live, b, 'split', segment);
      return this._settle(d, live, b, 'burst', segment);
    }
    if (alive(tug) && dist(segment.pos, tug.pos) >= LOST_RANGE_WU) return this._settle(d, live, b, 'drifted', segment);
    if (!alive(tug)) return this._settle(d, live, b, 'lost', segment);
    if (now >= live.deadlineAt) return this._settle(d, live, b, 'lapsed', segment);
  },

  _spill(d, live, at, qty, commodityId) {
    return d.spawnFreightPickup(live, { pos: { x: at.x, z: at.z }, commodityId, qty, ttlS: SPILL_TTL_S });
  },

  _settle(d, live, b, outcome, segment) {
    if (b.settled) return;
    b.settled = true;
    const tug = entityById(d.state, b.tugId);
    if (outcome === 'intact') {
      d.grant(INTACT_PAY, 'breakaway_freight:intact');
      d.rep(TUG_FACTION, 3, 'breakaway_freight_intact');
    } else if (outcome === 'split') {
      d.grant(SPLIT_PAY, 'breakaway_freight:split');
      d.rep(TUG_FACTION, 1, 'breakaway_freight_split');
      const spill = this._spill(d, live, segment.pos, SPLIT_SPILL_QTY, MANIFEST_COMMODITY);
      if (spill && spill.data) spill.data.scanLabel = 'SPILLED ALLOYS — THE TUG WANTS THIS SWEPT';
    } else if (outcome === 'burst') {
      const spill = this._spill(d, live, segment.pos, BURST_SPILL_QTY, MANIFEST_COMMODITY);
      if (spill && spill.data) spill.data.scanLabel = 'BURST SEGMENT — LOOSE ALLOYS';
    } else if (outcome === 'crushed') {
      // The segment is not deleted: it becomes the wreck it now is, and its scrap is real salvage.
      // The yard's arrest tackle takes the crushed segment's momentum through the physics authority.
      const m = Number(segment.mass) || SEGMENT_MASS;
      const v = segment.vel || {};
      queuePhysicsImpulse(segment, { x: -(Number(v.x) || 0) * m, y: 0, z: -(Number(v.z) || 0) * m }, {
        provenance: 'encounter:breakaway_freight', tick: d.state.tick | 0, kind: 'crush_arrest',
      });
      segment.data.scanLabel = 'CRUSHED SEGMENT — WRITTEN OFF';
      segment.data.masslineTetherable = false;
      segment.data.manifest = null;
      for (const [commodityId, qty] of Object.entries(CRUSH_SCRAP)) this._spill(d, live, segment.pos, qty, commodityId);
    } else if (outcome === 'destroyed') {
      d.rep(TUG_FACTION, -3, 'breakaway_freight_destroyed');
    }
    if (segment && segment.data && outcome !== 'crushed') {
      segment.data.manifest = outcome === 'intact' ? null : segment.data.manifest;
      if (outcome === 'intact' || outcome === 'split' || outcome === 'burst') {
        segment.data.scanLabel = outcome === 'intact' ? 'FREIGHT SEGMENT — IN THE NET' : 'SPLIT SEGMENT — EMPTY CASING';
        segment.data.masslineTetherable = outcome !== 'intact';
      }
    }
    b.outcome = outcome;
    if (alive(tug)) d.despawnAll(live, 30, 'tug');
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'yard',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: TUG_FACTION,
  },
  factionId: TUG_FACTION,
  title: 'BREAKAWAY FREIGHT',
  primaryLine: 'TUG: Coupler blew — my last segment is loose and drifting for the spar. Eight alloys on it. Ease it into my net, or put it in there clean. Fast and it splits.',
  verbs: ['latch', 'brake', 'tow', 'release'],
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: TUG_FACTION,
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    intact: 'IN THE NET — the tug pays the full recovery and logs your handling.',
    split: 'CAUGHT HARD — the segment split. Reduced pay; the spilled alloys are yours to sweep.',
    burst: 'TOO FAST — the net burst and the casing tore. No pay; a few alloys tumble loose.',
    crushed: 'The segment hit the spar. It is scrap now, and the scrap is still out there.',
    destroyed: 'The segment was shot apart. The tug will remember who was holding the gun.',
    drifted: 'The segment drifted off the approach. The tug writes it off.',
    lapsed: 'The tug gives up on the segment. It is still drifting out there.',
    lost: 'The recovery ended without a catch. Nobody pays.',
  },
});
