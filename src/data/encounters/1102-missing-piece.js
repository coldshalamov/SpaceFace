// 1102 — A PLACE FOR THE MISSING PIECE (SFQ-M M28). A precursor Custodian in a deep-anomaly drift
// repeats a stalled repair: its work light points at an empty socket whose outline matches a rib
// insert lying far out in the drift. A cracked insert of the wrong temper floats much closer.
//
//   * Massline: latch an insert, tow it into work reach and ease it into the socket;
//   * alignment field: scan the Custodian up close to wake its field, then guide an insert into
//     the field's reach — the field pulls and damps it through the real physics path (impulses
//     into Rapier, never a teleport) until it seats.
//
// The Custodian refuses a misaligned piece: arrive too fast and it shoves the insert back out.
// A seated piece is welded only while the pilot holds clear of the work reach. The genuine insert
// restores the machine; the cracked one works at reduced output, and the Custodian remembers which.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1102;
export const trigger = deepFreeze({
  id: 'missing_piece',
  tier: 'minor',
  deck: 'civilian',
  // Ashfall rolls a crowded deck since #286; weight 2 keeps the brief within the first 60 sector-days (first: day 25, seed 4242).
  weight: 2,
  zoneTypes: ['anomaly_deep'],
  script: 'selfRegistered',
  pressureCost: 14,
  cooldownS: 1500,
  proximity: true,
  gates: {
    sectorIds: ['sector_ashfall_reach', 'sector_veil_nebula'],
  },
});

const WINDOW_S = 360;
const SOCKET_OFFSET_WU = 70;
const GENUINE_DIST_WU = 760;
const SUBSTITUTE_DIST_WU = 300;
const INSERT_RADIUS = 7;
const INSERT_MASS = 40;
const SEAT_WU = 26;
const SEAT_SPEED = 12;
const REFUSE_KICK = 22;            // WU/s the Custodian pushes a misaligned insert back out
const REFUSE_COOLDOWN_S = 3;
const WORK_CLEAR_WU = 110;
const WELD_S = 8;
const WAKE_SCAN_WU = 140;
const FIELD_S = 120;
const FIELD_WU = 260;
const FIELD_K = 0.12;              // spring toward the socket (1/s^2) …
const FIELD_C = 0.7;               // … critically damped, so the field delivers a piece slowly
const FIELD_MAX_ACCEL = 8;
const CLAMP_GAIN = 0.3;            // 1/s: the clamp's pull back onto the socket per call
const MAX_STEP_S = 1.5;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const RESTORED_PAY = 420;
const PATCHED_PAY = 220;
const MACHINE_FACTION = 'faction_archive';

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
  const blockers = blockersNear(state, center, GENUINE_DIST_WU + 400);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const custodian = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const layout = {
      custodian,
      socket: { x: custodian.x + dx * SOCKET_OFFSET_WU, z: custodian.z + dz * SOCKET_OFFSET_WU },
      genuine: { x: custodian.x + dx * GENUINE_DIST_WU, z: custodian.z + dz * GENUINE_DIST_WU },
      substitute: { x: custodian.x - dz * SUBSTITUTE_DIST_WU, z: custodian.z + dx * SUBSTITUTE_DIST_WU },
    };
    let blocked = 0;
    for (const p of [layout.custodian, layout.genuine, layout.substitute]) {
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

/** A velocity change delivered as one impulse through the physics authority (Rapier integrates it). */
function kick(state, e, dvx, dvz, kind) {
  const m = Number(e.mass) || INSERT_MASS;
  return queuePhysicsImpulse(e, { x: dvx * m, y: 0, z: dvz * m }, {
    provenance: 'encounter:missing_piece', tick: state.tick | 0, kind,
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const layout = findLayout(state, center, d.stream(live, 'm28_layout'));
    const custodian = d.spawnProp(live, {
      type: 'machine', pos: layout.custodian, radius: 14, mass: 1e6, tetherable: false,
      scanLabel: 'CUSTODIAN — REPEATING A STALLED REPAIR', storyPropKind: 'm28_custodian',
    });
    const socket = d.spawnProp(live, {
      type: 'beacon', pos: layout.socket, radius: 3, mass: 1e6, tetherable: false,
      scanLabel: 'EMPTY SOCKET — OUTLINE OF A RIB INSERT', storyPropKind: 'm28_socket',
    });
    const genuine = d.spawnProp(live, {
      type: 'payload', pos: layout.genuine, radius: INSERT_RADIUS, mass: INSERT_MASS, tetherable: true,
      scanLabel: 'RIB INSERT — MATCHES THE SOCKET OUTLINE', storyPropKind: 'm28_insert_genuine',
    });
    const substitute = d.spawnProp(live, {
      type: 'payload', pos: layout.substitute, radius: INSERT_RADIUS, mass: INSERT_MASS, tetherable: true,
      scanLabel: 'CRACKED INSERT — WRONG TEMPER, IT WILL FIT', storyPropKind: 'm28_insert_cracked',
    });
    if (!custodian || !socket || !genuine || !substitute) return d.abort(live, 'no_bodies');
    for (const piece of [genuine, substitute]) {
      piece.physicsBody = { shape: 'ball', mass: INSERT_MASS, dynamic: true };
      piece.data.masslineTetherable = true;
    }
    custodian.data.masslineTetherable = false;
    // The catalogue Custodian silhouette; no homeSectorId, so the Verge machine layer never patrols it.
    custodian.data.machine = { kind: 'custodian', anchor: { ...layout.custodian }, t: 0, phase: 0, encounterOwned: true };
    socket.data.masslineTetherable = false;

    const now = d.now();
    live.data.piece = {
      custodianId: custodian.id,
      socketId: socket.id,
      genuineId: genuine.id,
      substituteId: substitute.id,
      socketPos: { ...layout.socket },
      fieldUntil: null,
      lastPulseSeq: -1,
      lastTickAt: null,
      refusals: 0,
      refusedAt: -Infinity,
      seatedId: null,
      weldS: 0,
      clearHinted: false,
      settled: false,
      outcome: null,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'stalled';
    live.approach = { signal: 'custodian_work_light', contacts: 4, t: now };
    d.say(live, 'alert',
      'SCAN: A Custodian is repeating one repair. Its work light points at an empty socket — the matching insert is far out in the drift. A cracked one floats closer.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const p = live.data && live.data.piece;
    if (!p || live.phase === 'done' || p.settled) return;
    if (name !== 'scanPulse' || !payload || !payload.pos) return;
    const player = d.player();
    if (payload.source !== 'player-scanner' || !player || payload.scannerId !== player.id) return;
    if (Number.isFinite(payload.seq)) {
      if (payload.seq <= p.lastPulseSeq) return;
      p.lastPulseSeq = payload.seq;
    }
    const custodian = entityById(state, p.custodianId);
    if (!alive(custodian) || dist(payload.pos, custodian.pos) > WAKE_SCAN_WU) return;
    const fresh = p.fieldUntil == null || d.now() >= p.fieldUntil;
    p.fieldUntil = d.now() + FIELD_S;
    if (fresh) {
      d.say(live, 'alert', 'CUSTODIAN: ALIGNMENT FIELD — ACTIVE. PRESENT THE PART.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const p = live.data && live.data.piece;
    if (!p || live.phase === 'done' || p.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, p, 'lost');
    const genuine = entityById(state, p.genuineId);
    const substitute = entityById(state, p.substituteId);
    if (!alive(genuine) && !alive(substitute)) return this._settle(d, live, p, 'lost');
    // The director calls scripts on its ~1 Hz calendar: every rate here uses real elapsed sim time.
    const step = Math.min(MAX_STEP_S, Math.max(0, now - (p.lastTickAt == null ? now : p.lastTickAt)));
    p.lastTickAt = now;
    const fieldOn = p.fieldUntil != null && now < p.fieldUntil;

    if (p.seatedId != null) {
      const piece = entityById(state, p.seatedId);
      if (!alive(piece) || dist(piece.pos, p.socketPos) > SEAT_WU * 1.5) {
        p.seatedId = null;
        p.weldS = 0;
        live.phase = 'stalled';
      } else {
        // The Custodian clamps the seated part: damp it and hold it on the socket.
        const tx = p.socketPos.x - piece.pos.x, tz = p.socketPos.z - piece.pos.z;
        kick(state, piece, tx * CLAMP_GAIN - (piece.vel?.x || 0), tz * CLAMP_GAIN - (piece.vel?.z || 0), 'custodian_clamp');
        if (dist(player.pos, p.socketPos) < WORK_CLEAR_WU) {
          if (!p.clearHinted) {
            p.clearHinted = true;
            d.say(live, 'alert', 'CUSTODIAN: WORK REACH OCCUPIED. WELD HELD.', null, { literal: true });
          }
        } else {
          p.weldS += step;
          if (p.weldS >= WELD_S) return this._settle(d, live, p, piece.id === p.genuineId ? 'restored' : 'patched');
        }
        return;
      }
    }

    for (const piece of [genuine, substitute]) {
      if (!alive(piece)) continue;
      const dSock = dist(piece.pos, p.socketPos);
      if (dSock <= SEAT_WU) {
        if (speedOf(piece) <= SEAT_SPEED) {
          p.seatedId = piece.id;
          p.weldS = 0;
          live.phase = 'welding';
          d.say(live, 'alert', piece.id === p.genuineId
            ? 'CUSTODIAN: PART ACCEPTED. HOLD CLEAR.'
            : 'CUSTODIAN: PART ACCEPTED — TOLERANCE EXCEEDED. OUTPUT WILL BE REDUCED. HOLD CLEAR.', null, { literal: true });
          return;
        }
        if (now - p.refusedAt >= REFUSE_COOLDOWN_S) {
          p.refusedAt = now;
          p.refusals++;
          const ux = (piece.pos.x - p.socketPos.x) / (dSock || 1), uz = (piece.pos.z - p.socketPos.z) / (dSock || 1);
          const vx = piece.vel?.x || 0, vz = piece.vel?.z || 0;
          // Kill the incoming velocity and send it back out along the socket normal.
          kick(state, piece, -vx + ux * REFUSE_KICK, -vz + uz * REFUSE_KICK, 'custodian_refusal');
          d.say(live, 'alert', 'CUSTODIAN: MISALIGNED. REFUSED.', null, { literal: true });
        }
        continue;
      }
      if (fieldOn && dSock <= FIELD_WU) {
        const vx = piece.vel?.x || 0, vz = piece.vel?.z || 0;
        let ax = FIELD_K * (p.socketPos.x - piece.pos.x) - FIELD_C * vx;
        let az = FIELD_K * (p.socketPos.z - piece.pos.z) - FIELD_C * vz;
        const a = Math.hypot(ax, az);
        if (a > FIELD_MAX_ACCEL) { ax *= FIELD_MAX_ACCEL / a; az *= FIELD_MAX_ACCEL / a; }
        if (step > 0) kick(state, piece, ax * step, az * step, 'alignment_field');
      }
    }
    if (now >= live.deadlineAt) return this._settle(d, live, p, 'lapsed');
  },

  _settle(d, live, p, outcome) {
    if (p.settled) return;
    p.settled = true;
    p.outcome = outcome;
    const custodian = entityById(d.state, p.custodianId);
    const seated = entityById(d.state, p.seatedId);
    if (outcome === 'restored') {
      d.grant(RESTORED_PAY, 'missing_piece:restored');
      d.rep(MACHINE_FACTION, 4, 'missing_piece_restored');
      if (alive(custodian)) custodian.data.scanLabel = 'CUSTODIAN — REPAIR COMPLETE, SERVICE RESTORED';
    } else if (outcome === 'patched') {
      d.grant(PATCHED_PAY, 'missing_piece:patched');
      d.rep(MACHINE_FACTION, 2, 'missing_piece_patched');
      if (alive(custodian)) custodian.data.scanLabel = 'CUSTODIAN — RUNNING ON A CRACKED INSERT (REDUCED OUTPUT)';
    }
    if (alive(seated) && seated.data) {
      seated.data.masslineTetherable = false;
      seated.data.scanLabel = outcome === 'restored' ? 'RIB INSERT — WELDED IN' : 'CRACKED INSERT — WELDED IN, UNDER TOLERANCE';
    }
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'anomaly',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: MACHINE_FACTION,
  },
  factionId: MACHINE_FACTION,
  title: 'A PLACE FOR THE MISSING PIECE',
  primaryLine: 'SCAN: A Custodian is repeating one repair. Its work light points at an empty socket — the matching insert is far out in the drift. A cracked one floats closer.',
  verbs: ['scan', 'latch', 'tow', 'align'],
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    restored: 'SERVICE RESTORED — the Custodian welds the true insert and the drift logs your hand in it.',
    patched: 'PATCHED — the cracked insert holds at reduced output. The Custodian logs the tolerance.',
    lapsed: 'The Custodian is still repeating its repair. The socket is still empty.',
    lost: 'Neither insert survived. The Custodian keeps working on nothing.',
  },
});
