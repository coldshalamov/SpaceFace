// 1104 — DEAD-LETTER DELIVERY (SFQ-M M27). A precursor Courier repeats a failed delivery: it throws
// one sealed token down a short lane to a recipient machine, a jammed freight bale that drifted into
// the lane bats the token back, and the Courier reels it home and throws again. Even a clean arrival
// would be refused: the recipient's address seal has lapsed.
//
//   * escort: tow the bale out of the lane, renew the seal, and let the Courier's own throw land;
//   * custody: latch the token yourself and carry it in slowly once the seal is renewed.
//
// The seal is renewed by a close scan of the recipient, but only once the pilot understands the
// letter: they have read its address (scan near the token) or watched the recipient refuse it.
// A nearby archive Witness keeps anything that comes to rest in its volume — the wrong hand.
// A destroyed token is reissued once (never while another copy is alive); a second loss ends it.
// Every motion is an impulse through the physics authority; Rapier integrates it.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1104;
export const trigger = deepFreeze({
  id: 'dead_letter',
  tier: 'minor',
  deck: 'civilian',
  weight: 1,
  zoneTypes: ['anomaly_deep'],
  script: 'selfRegistered',
  pressureCost: 14,
  cooldownS: 1500,
  proximity: true,
  gates: {
    // The Io Listening Field (zone_io_listening_field) and the Pallas machine yards carry Couriers.
    sectorIds: ['sector_io_reach', 'sector_pallas_drift'],
  },
});

const WINDOW_S = 480;
const LANE_WU = 520;
const BALE_AT_WU = 250;
const DOCK_OFFSET_WU = 30;
const INTAKE_OFFSET_WU = 26;
const WITNESS_ALONG_WU = 300;
const WITNESS_SIDE_WU = 210;
const TOKEN_RADIUS = 4;
const TOKEN_MASS = 20;
const BALE_RADIUS = 16;
const BALE_MASS = 600;
const BALE_CLEAR_WU = 60;          // how far off the lane line the bale must be to stop blocking it
const THROW_SPEED = 12;
const CYCLE_S = 20;
const DOCK_WU = 60;
const RECALL_WU = 420;
const RECALL_K = 0.08;
const RECALL_C = 0.6;
const RECALL_MAX_ACCEL = 6;
const OUTBOUND_SPEED = 4;
const HOLD_WU = 34;
const ACCEPT_SPEED = 14;
const REFUSE_KICK = 10;
const REFUSE_COOLDOWN_S = 3;
const READ_SCAN_WU = 120;
const ACK_SCAN_WU = 160;
const REMINT_S = 30;
const MAX_REMINTS = 1;
const MAX_STEP_S = 1.5;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const ESCORT_PAY = 360;
const CARRY_PAY = 300;
const MACHINE_FACTION = 'faction_archive';
const TOKEN_LABEL = 'DEAD LETTER — SEALED, ADDRESSED, UNDELIVERED';

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
  const blockers = blockersNear(state, center, LANE_WU + 500);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const courier = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    const dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const along = (s, side = 0) => ({
      x: courier.x + dir.x * s - dir.z * side,
      z: courier.z + dir.z * s + dir.x * side,
    });
    const layout = {
      dir,
      courier,
      dock: along(DOCK_OFFSET_WU),
      recipient: along(LANE_WU),
      intake: along(LANE_WU - INTAKE_OFFSET_WU),
      bale: along(BALE_AT_WU),
      witness: along(WITNESS_ALONG_WU, WITNESS_SIDE_WU),
    };
    let blocked = 0;
    for (const p of [layout.courier, layout.recipient, layout.bale, layout.witness]) {
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
  const m = Number(e.mass) || TOKEN_MASS;
  return queuePhysicsImpulse(e, { x: dvx * m, y: 0, z: dvz * m }, {
    provenance: 'encounter:dead_letter', tick: state.tick | 0, kind,
  });
}

/** Perpendicular distance of a point from the courier→recipient lane segment. */
function offLane(p, pos) {
  const vx = pos.x - p.courierPos.x, vz = pos.z - p.courierPos.z;
  const s = vx * p.dir.x + vz * p.dir.z;
  if (s < 0 || s > LANE_WU) return Infinity;
  return Math.abs(vx * -p.dir.z + vz * p.dir.x);
}

function spawnToken(d, live, pos, serial) {
  const token = d.spawnProp(live, {
    type: 'payload', pos, radius: TOKEN_RADIUS, mass: TOKEN_MASS, tetherable: true,
    scanLabel: TOKEN_LABEL, storyPropKind: 'm27_dead_letter',
  });
  if (!token) return null;
  token.physicsBody = { shape: 'ball', mass: TOKEN_MASS, dynamic: true };
  token.data.masslineTetherable = true;
  token.data.letterSerial = serial;
  return token;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const layout = findLayout(state, center, d.stream(live, 'm27_layout'));
    const courier = d.spawnProp(live, {
      type: 'machine', pos: layout.courier, radius: 12, mass: 1e6, tetherable: false,
      scanLabel: 'COURIER FRAME — REPEATING A FAILED DELIVERY', storyPropKind: 'm27_courier',
    });
    const recipient = d.spawnProp(live, {
      type: 'machine', pos: layout.recipient, radius: 14, mass: 1e6, tetherable: false,
      scanLabel: 'RECIPIENT — ADDRESS SEAL LAPSED, REFUSING DELIVERY', storyPropKind: 'm27_recipient',
    });
    const witness = d.spawnProp(live, {
      type: 'machine', pos: layout.witness, radius: 12, mass: 1e6, tetherable: false,
      scanLabel: 'ARCHIVE WITNESS — IT KEEPS WHAT COMES TO REST IN REACH', storyPropKind: 'm27_witness',
    });
    const bale = d.spawnProp(live, {
      type: 'payload', pos: layout.bale, radius: BALE_RADIUS, mass: BALE_MASS, tetherable: true,
      scanLabel: 'JAMMED FREIGHT BALE — DRIFTED INTO THE COURIER LANE', storyPropKind: 'm27_bale',
    });
    const token = spawnToken(d, live, layout.dock, 1);
    if (!courier || !recipient || !witness || !bale || !token) return d.abort(live, 'no_bodies');
    bale.physicsBody = { shape: 'ball', mass: BALE_MASS, dynamic: true };
    bale.data.masslineTetherable = true;
    // Catalogue machine silhouettes; no homeSectorId, so the Verge machine layer never patrols them.
    for (const [m, kind, at] of [[courier, 'courier', layout.courier], [recipient, 'conservator', layout.recipient], [witness, 'witness', layout.witness]]) {
      m.data.masslineTetherable = false;
      m.data.machine = { kind, anchor: { ...at }, t: 0, phase: 0, encounterOwned: true };
    }

    const now = d.now();
    live.data.letter = {
      courierId: courier.id,
      recipientId: recipient.id,
      witnessId: witness.id,
      baleId: bale.id,
      tokenId: token.id,
      tokenSerial: 1,
      remints: 0,
      lostAt: null,
      courierPos: { ...layout.courier },
      dir: { ...layout.dir },
      dockPos: { ...layout.dock },
      intakePos: { ...layout.intake },
      witnessPos: { ...layout.witness },
      nextThrowAt: now + 4,
      throws: 0,
      lastThrowAt: null,
      inCustody: false,
      addressRead: false,
      refusals: 0,
      refusedAt: -Infinity,
      acknowledged: false,
      permission: null,
      lastPulseSeq: -1,
      lastTickAt: null,
      settled: false,
      outcome: null,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'cycling';
    live.approach = { signal: 'courier_cycle', contacts: 5, t: now };
    d.say(live, 'alert',
      'SCAN: A Courier keeps throwing one sealed letter down its lane. A drifted bale bats it back every time — and the recipient is refusing deliveries anyway.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const p = live.data && live.data.letter;
    if (!p || live.phase === 'done' || p.settled || !payload) return;
    if (name === 'tetherAttached') {
      if (payload.targetId === p.tokenId && !p.inCustody) {
        p.inCustody = true;
        const courier = entityById(state, p.courierId);
        if (alive(courier)) courier.data.scanLabel = 'COURIER FRAME — ITS LETTER IS IN YOUR CUSTODY';
        d.say(live, 'alert', 'COURIER: CUSTODY TRANSFERRED. CYCLE SUSPENDED.', null, { literal: true });
      }
      return;
    }
    if (name !== 'scanPulse' || !payload.pos) return;
    const player = d.player();
    if (payload.source !== 'player-scanner' || !player || payload.scannerId !== player.id) return;
    if (Number.isFinite(payload.seq)) {
      if (payload.seq <= p.lastPulseSeq) return;
      p.lastPulseSeq = payload.seq;
    }
    const token = entityById(state, p.tokenId);
    if (!p.addressRead && alive(token) && dist(payload.pos, token.pos) <= READ_SCAN_WU) {
      p.addressRead = true;
      token.data.scanLabel = 'DEAD LETTER — ADDRESSED TO THE RECIPIENT; ITS SEAL WANTS RENEWING';
      d.say(live, 'alert', 'LETTER: ADDRESSEE SEAL EXPIRED. A WITNESSED SCAN AT THE RECIPIENT RENEWS IT.', null, { literal: true });
    }
    const recipient = entityById(state, p.recipientId);
    if (!p.acknowledged && alive(recipient) && dist(payload.pos, recipient.pos) <= ACK_SCAN_WU) {
      if (!p.addressRead && p.refusals < 1) {
        d.say(live, 'alert', 'RECIPIENT: NO DELIVERY PENDING THAT YOU CAN NAME.', null, { literal: true });
        return;
      }
      p.acknowledged = true;
      recipient.data.scanLabel = 'RECIPIENT — SEAL RENEWED, AWAITING ONE TOKEN';
      d.say(live, 'alert', 'RECIPIENT: SEAL RENEWED. PRESENT THE TOKEN — SLOWLY.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const p = live.data && live.data.letter;
    if (!p || live.phase === 'done' || p.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, p, 'lost');
    const step = Math.min(MAX_STEP_S, Math.max(0, now - (p.lastTickAt == null ? now : p.lastTickAt)));
    p.lastTickAt = now;
    let token = entityById(state, p.tokenId);

    if (!alive(token)) {
      if (p.lostAt == null) {
        p.lostAt = now;
        if (p.remints >= MAX_REMINTS) return this._settle(d, live, p, 'lost');
        d.say(live, 'alert', 'COURIER: TOKEN LOST. ONE COPY WILL BE REISSUED.', null, { literal: true });
      }
      if (now - p.lostAt < REMINT_S) return now >= live.deadlineAt ? this._settle(d, live, p, 'lapsed') : undefined;
      token = spawnToken(d, live, p.dockPos, p.tokenSerial + 1);
      if (!token) return this._settle(d, live, p, 'lost');
      p.tokenId = token.id;
      p.tokenSerial++;
      p.remints++;
      p.lostAt = null;
      p.inCustody = false;
      p.nextThrowAt = now + CYCLE_S;
      const courier = entityById(state, p.courierId);
      if (alive(courier)) courier.data.scanLabel = 'COURIER FRAME — REISSUED ITS LETTER (LAST COPY)';
    }

    const speed = speedOf(token);
    // The archive Witness keeps whatever comes to rest in its reach.
    if (dist(token.pos, p.witnessPos) <= HOLD_WU && speed <= ACCEPT_SPEED) {
      return this._settle(d, live, p, 'misdelivered');
    }

    const dIntake = dist(token.pos, p.intakePos);
    if (dIntake <= HOLD_WU) {
      if (p.acknowledged && speed <= ACCEPT_SPEED) {
        return this._settle(d, live, p, p.inCustody ? 'carried' : 'escorted');
      }
      if (now - p.refusedAt >= REFUSE_COOLDOWN_S) {
        p.refusedAt = now;
        p.refusals++;
        const vx = token.vel?.x || 0, vz = token.vel?.z || 0;
        kick(state, token, -vx - p.dir.x * REFUSE_KICK, -vz - p.dir.z * REFUSE_KICK, 'recipient_refusal');
        d.say(live, 'alert', p.acknowledged
          ? 'RECIPIENT: ARRIVAL TOO FAST. REFUSED.'
          : 'RECIPIENT: SEAL LAPSED. RETURN TO SENDER.', null, { literal: true });
      }
      return;
    }

    if (!p.inCustody) {
      const toDock = dist(token.pos, p.dockPos);
      const outbound = (token.vel?.x || 0) * p.dir.x + (token.vel?.z || 0) * p.dir.z;
      if (toDock <= DOCK_WU && speed < 2) {
        if (now >= p.nextThrowAt) {
          const vx = token.vel?.x || 0, vz = token.vel?.z || 0;
          kick(state, token, -vx + p.dir.x * THROW_SPEED, -vz + p.dir.z * THROW_SPEED, 'courier_throw');
          p.throws++;
          p.lastThrowAt = now;
          p.nextThrowAt = now + CYCLE_S;
        }
      } else if (toDock <= RECALL_WU && outbound < OUTBOUND_SPEED && step > 0) {
        // A bounced or stalled letter: the Courier reels it home on a damped line.
        const vx = token.vel?.x || 0, vz = token.vel?.z || 0;
        let ax = RECALL_K * (p.dockPos.x - token.pos.x) - RECALL_C * vx;
        let az = RECALL_K * (p.dockPos.z - token.pos.z) - RECALL_C * vz;
        const a = Math.hypot(ax, az);
        if (a > RECALL_MAX_ACCEL) { ax *= RECALL_MAX_ACCEL / a; az *= RECALL_MAX_ACCEL / a; }
        kick(state, token, ax * step, az * step, 'courier_recall');
      }
    }
    if (now >= live.deadlineAt) return this._settle(d, live, p, 'lapsed');
  },

  _settle(d, live, p, outcome) {
    if (p.settled) return;
    p.settled = true;
    p.outcome = outcome;
    const state = d.state;
    const courier = entityById(state, p.courierId);
    const recipient = entityById(state, p.recipientId);
    const witness = entityById(state, p.witnessId);
    const token = entityById(state, p.tokenId);
    const bale = entityById(state, p.baleId);
    const label = (e, text) => { if (alive(e) && e.data) e.data.scanLabel = text; };
    const laneClear = !alive(bale) || offLane(p, bale.pos) > BALE_RADIUS + BALE_CLEAR_WU;
    if (outcome === 'escorted' || outcome === 'carried') {
      p.permission = 'recipient_intake';
      d.grant(outcome === 'escorted' ? ESCORT_PAY : CARRY_PAY, `dead_letter:${outcome}`);
      d.rep(MACHINE_FACTION, outcome === 'escorted' ? 3 : 2, `dead_letter_${outcome}`);
      label(recipient, 'RECIPIENT — DELIVERY ACKNOWLEDGED, WORK ORDER RESUMED; YOUR TRANSPONDER IS ON ITS INTAKE ROLL');
      label(courier, laneClear ? 'COURIER FRAME — ROUTE CLEAR, CYCLE RESTORED' : 'COURIER FRAME — ROUTE STILL BLOCKED; YOU CARRIED ITS LETTER');
      label(token, 'DEAD LETTER — DELIVERED, ACKNOWLEDGED');
    } else if (outcome === 'misdelivered') {
      d.rep(MACHINE_FACTION, -1, 'dead_letter_misdelivered');
      label(witness, 'ARCHIVE WITNESS — HOLDING A LETTER THAT IS NOT ITS OWN');
      label(courier, 'COURIER FRAME — CYCLE STALLED, LETTER HELD BY THE WRONG HAND');
      label(token, 'DEAD LETTER — KEPT BY THE ARCHIVE WITNESS');
    } else if (outcome === 'lost') {
      label(courier, 'COURIER FRAME — NO LETTER LEFT TO CARRY');
    } else if (outcome === 'lapsed') {
      label(courier, 'COURIER FRAME — STILL CYCLING A DEAD LETTER');
    }
    if (alive(token) && token.data && outcome !== 'lapsed') {
      token.data.masslineTetherable = false;
      token.data.tetherable = false;
      const vx = token.vel?.x || 0, vz = token.vel?.z || 0;
      if (vx || vz) kick(state, token, -vx, -vz, 'letter_held');
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
  title: 'DEAD-LETTER DELIVERY',
  primaryLine: 'SCAN: A Courier keeps throwing one sealed letter down its lane. A drifted bale bats it back every time — and the recipient is refusing deliveries anyway.',
  verbs: ['scan', 'latch', 'tow', 'deliver'],
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    escorted: 'DELIVERED — the lane is clear, the Courier\'s own throw landed, and the recipient\'s work order runs again.',
    carried: 'DELIVERED BY HAND — the recipient takes the letter from you and puts your transponder on its intake roll.',
    misdelivered: 'WRONG HAND — the archive Witness keeps the letter. The Courier stalls with nothing to send.',
    lapsed: 'The Courier is still throwing its letter at a closed door.',
    lost: 'The letter is gone, and the Courier has no copy left to send.',
  },
});
