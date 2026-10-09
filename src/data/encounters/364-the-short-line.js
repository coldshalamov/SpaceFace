// 364 — THE SHORT LINE (SF-148: a delivery with a tempting, physically honest shortcut).
//
// A fat sender sits at a rock wall with a lot to move. On the far side, her
// receiver waits. Between two belt stones runs the slot — a real pinch measured
// surface to surface, wide enough for a light hull, too tight for the sender's
// own hull to risk. The contract names the same delivery either way: through
// the slot is the short line, around the wall's far edge is the long reliable
// line. The clues are all physical, none of them a wall of text:
//
//   * the sender's own hull is visibly fatter than the gap she refuses;
//   * a light runner threads the slot on the regular — watch it and you know
//     your own hull/load's answer;
//   * the long route is just space — nobody gates it, and a stuck pilot backs
//     out the way she came because the slot is a gap, not a one-way door.
//
// Take the lot as a real custody pod: tow it or scoop it, deliver it inside the
// receiver's ring. Decline or stall and the sender hauls it around the wall
// herself — the long line demonstrated by the hull that refused the short one.
// Lose the pod and the lot is gone with it; keep it and the receiver files the
// theft under the sender's name.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 364;
export const trigger = deepFreeze({
  id: 'short_line',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.1,
  // The premise is the wall: belt and derelict fields carry the stones. If the
  // fire-time scan finds no slot the situation honestly does not exist.
  zoneTypes: ['mining_belt', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 18,
  cooldownS: 640,
  proximity: true,
  fireWithinWu: 520,
  gates: {
    maxSecurity: 0.8,
  },
});

const WINDOW_S = 220;
const OFFER_S = 40;
const SLOT_SEARCH_WU = 1500;       // rocks this far from the anchor count as local
const SLOT_MIN_SEP_WU = 60;
const SLOT_MAX_SEP_WU = 460;
const SLOT_MIN_GAP_WU = 26;        // surface to surface — a light hull's line
const SLOT_MAX_GAP_WU = 52;        // the sender's hull never reads this as hers
const FRONT_WU = 320;              // sender holds this far short of the pinch
const BACK_WU = 360;               // receiver waits this far past the pinch
const WALL_RUN_WU = 200;           // long-route clearance past the outer stone
const RECEIVE_WU = 140;
const LOT_CMDTY = 'cmdty_ore_iron';
const LOT_QTY = 4;
const LOT_HOLD_WU2 = 150 * 150;    // pod gone while the player stood on it = aboard

const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

/** The slot is two REAL belt stones: the pinch is the clearance between their
 * surfaces, and it is never narrower than a light hull or wider than the
 * sender's nerve. Returns the tightest readable pair near the anchor. */
function findSlot(state, center) {
  const rocks = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
    const dx = e.pos.x - center.x, dz = e.pos.z - center.z;
    if (dx * dx + dz * dz > SLOT_SEARCH_WU * SLOT_SEARCH_WU) continue;
    rocks.push(e);
  }
  let best = null;
  for (let i = 0; i < rocks.length; i++) {
    for (let j = i + 1; j < rocks.length; j++) {
      const a = rocks[i], b = rocks[j];
      const sep = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const gap = sep - (a.radius || 0) - (b.radius || 0);
      if (sep < SLOT_MIN_SEP_WU || sep > SLOT_MAX_SEP_WU) continue;
      if (gap < SLOT_MIN_GAP_WU || gap > SLOT_MAX_GAP_WU) continue;
      const midx = (a.pos.x + b.pos.x) / 2, midz = (a.pos.z + b.pos.z) / 2;
      const dcost = Math.hypot(midx - center.x, midz - center.z);
      if (!best || dcost < best.dcost) {
        best = { a, b, mid: { x: midx, z: midz }, sep, gap, dcost };
      }
    }
  }
  return best;
}

function transitTo(ent, live, now, anchor, reason, leash) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: leash || 4000,
      startedTick: Math.round(now * 60),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const senderSpec = ships.find((sh) => sh && sh.role === 'sender');
    const receiverSpec = ships.find((sh) => sh && sh.role === 'receiver');
    if (!senderSpec || !receiverSpec) return d.abort(live, 'no_cast');
    const center = live.plan && live.plan.zoneCenter;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');

    const slot = findSlot(state, center);
    if (!slot) return d.abort(live, 'no_slot');

    // The wall line runs stone to stone; the corridor through the pinch is its
    // perpendicular. Sender side is whichever face the player approached from.
    const gx = slot.b.pos.x - slot.a.pos.x, gz = slot.b.pos.z - slot.a.pos.z;
    const glen = Math.hypot(gx, gz) || 1;
    const gateLine = { x: gx / glen, z: gz / glen };
    let corridor = { x: -gateLine.z, z: gateLine.x };
    const p = d.player();
    if (p && p.pos) {
      const toPlayer = (p.pos.x - slot.mid.x) * corridor.x + (p.pos.z - slot.mid.z) * corridor.z;
      if (toPlayer > 0) { corridor = { x: -corridor.x, z: -corridor.z }; }
    }
    live.data.slot = {
      mid: { x: slot.mid.x, z: slot.mid.z },
      corridor,
      gateLine,
      clearanceWu: Math.round(slot.gap),
      rockIds: [slot.a.id, slot.b.id],
      lotState: 'pending',        // pending | taken | aboard | delivered | lost | kept
      lotPodId: null,
      lotPodLastPos: null,
      senderEnRoute: false,
      senderWaypoints: [],
    };

    // Cast placement: sender short of the pinch on the player's side, receiver
    // past it on the far side — the delivery line IS the corridor.
    senderSpec.pos = {
      x: slot.mid.x - corridor.x * FRONT_WU,
      z: slot.mid.z - corridor.z * FRONT_WU,
    };
    receiverSpec.pos = {
      x: slot.mid.x + corridor.x * BACK_WU + gateLine.x * 60,
      z: slot.mid.z + corridor.z * BACK_WU + gateLine.z * 60,
    };
    const rng = d.stream(live, 'shortline_layout');
    const courierSpec = {
      archetype: 'wasp_swarmer',
      level: senderSpec.level,
      pos: {
        x: slot.mid.x + corridor.x * (BACK_WU + 220) - gateLine.x * 30,
        z: slot.mid.z + corridor.z * (BACK_WU + 220) - gateLine.z * 30,
      },
      factionId: live.factionId,
      context: 'civilian',
      passive: true,
      role: 'courier',
      scanLabel: 'RUNNER HULL — WORKS THE SLOT',
    };
    const ids = d.spawnShips(live, [senderSpec, receiverSpec, courierSpec]);
    if (!ids.length || d.aliveCount(live, 'sender') < 1 || d.aliveCount(live, 'receiver') < 1) {
      return d.abort(live, 'no_budget');
    }
    const now = d.now();
    const sender = d.entsOf(live, 'sender')[0];
    if (sender && sender.data) sender.data.scanLabel = 'LOT SENDER — TOO WIDE FOR THE SLOT';
    const receiver = d.entsOf(live, 'receiver')[0];
    if (receiver && receiver.data) receiver.data.scanLabel = 'LOT RECEIVER — FAR SIDE';

    // The long route the sender will take if refused: off the pinch face, wide
    // around whichever stone stands farther down the gate line, then in to the
    // receiver. Real waypoints — she flies them on her own hull.
    const edgeRock = slot.b;
    const edgeSign = ((edgeRock.pos.x - slot.mid.x) * gateLine.x + (edgeRock.pos.z - slot.mid.z) * gateLine.z) >= 0 ? 1 : -1;
    const edgeAnchor = {
      x: edgeRock.pos.x + gateLine.x * edgeSign * ((edgeRock.radius || 40) + WALL_RUN_WU)
        - corridor.x * (FRONT_WU * 0.4),
      z: edgeRock.pos.z + gateLine.z * edgeSign * ((edgeRock.radius || 40) + WALL_RUN_WU)
        - corridor.z * (FRONT_WU * 0.4),
    };
    live.data.slot.senderWaypoints = [
      edgeAnchor,
      { x: receiverSpec.pos.x, z: receiverSpec.pos.z },
    ];

    // The runner demonstrates the line: one transit through the pinch on spawn,
    // re-threaded on a cadence — the slot's fit class made visible.
    const courier = d.entsOf(live, 'courier')[0];
    if (courier) {
      transitTo(courier, live, now, {
        x: slot.mid.x - corridor.x * (FRONT_WU + 160),
        z: slot.mid.z - corridor.z * (FRONT_WU + 160),
      }, 'short_line:courier_thread', 400);
      live.data.slot.courierBack = false;
    }

    live.deadlineAt = now + WINDOW_S;
    live.data.offerDeadlineAt = now + OFFER_S;
    live.phase = 'offer';
    live.approach = { signal: 'lot_wall_and_slot', contacts: ids.length, t: now };
    d.say(live, 'alert',
      'FREIGHT CHANNEL: a lot needs the far side. The slot saves the burn if your hull is light — the long way around the stones is open to anyone.',
      null, { primary: true, literal: true });
    d.offerChoices(live, live.shape.choices.map((c) => c.id), 'pass', live.data.offerDeadlineAt);
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const slot = live.data.slot;
    const sender = d.entsOf(live, 'sender')[0] || null;
    const receiver = d.entsOf(live, 'receiver')[0] || null;
    const p = d.player();

    if (!receiver) {
      // No receiver, no contract — whatever is left of the lot is loose freight.
      return this._release(d, live, 'receiver_gone');
    }

    // The runner's demonstration cadence: thread the pinch, then thread it back.
    const courier = d.entsOf(live, 'courier')[0];
    if (courier && slot.mid) {
      const nearAnchor = {
        x: slot.mid.x - slot.corridor.x * (FRONT_WU + 160),
        z: slot.mid.z - slot.corridor.z * (FRONT_WU + 160),
      };
      const farAnchor = {
        x: slot.mid.x + slot.corridor.x * (BACK_WU + 220),
        z: slot.mid.z + slot.corridor.z * (BACK_WU + 220),
      };
      const toward = live.data.slot.courierBack ? farAnchor : nearAnchor;
      if (dist2(courier.pos.x, courier.pos.z, toward.x, toward.z) < 120 * 120) {
        live.data.slot.courierBack = !live.data.slot.courierBack;
        transitTo(courier, live, now, live.data.slot.courierBack ? farAnchor : nearAnchor,
          'short_line:courier_thread', 400);
      }
    }

    // The lot's physical truth: a pod on the field, or aboard the player's hold.
    const pod = slot.lotPodId != null && state.entities ? state.entities.get(slot.lotPodId) : null;
    if (pod && pod.alive !== false) {
      slot.lotPodLastPos = { x: pod.pos.x, z: pod.pos.z };
      // Pod delivered on its own wheels — pushed or towed into the ring counts.
      if (dist2(pod.pos.x, pod.pos.z, receiver.pos.x, receiver.pos.z) <= RECEIVE_WU * RECEIVE_WU) {
        return this._deliver(d, live);
      }
    } else if (slot.lotPodId != null && slot.lotState === 'taken') {
      // The pod left the field: aboard the player if she stood on it, else lost.
      slot.lotState = (p && p.pos && slot.lotPodLastPos
        && dist2(p.pos.x, p.pos.z, slot.lotPodLastPos.x, slot.lotPodLastPos.z) <= LOT_HOLD_WU2)
        ? 'aboard' : 'lost';
      if (slot.lotState === 'lost') return this._release(d, live, 'lot_lost');
    }

    if (slot.lotState === 'aboard' && p && p.pos
      && dist2(p.pos.x, p.pos.z, receiver.pos.x, receiver.pos.z) <= RECEIVE_WU * RECEIVE_WU) {
      return this._deliver(d, live);
    }
    // Kept freight: the player left the scene holding the lot.
    if (slot.lotState === 'aboard' && p && p.pos && !d.playerNearZone(live, 700)) {
      slot.lotState = 'kept';
      d.rep(live.plan && live.plan.factionId || 'faction_scn', -4, 'short_line_lot_kept');
      return this._release(d, live, 'lot_taken');
    }

    // The sender's own answer to a pass or a stall: the long line, on her hull.
    if (!slot.senderEnRoute && (slot.lotState === 'pending' && now >= live.data.offerDeadlineAt)) {
      this._sendSender(d, live);
    }
    if (slot.senderEnRoute && sender) {
      const wp = slot.senderWaypoints[0];
      if (!wp) {
        return this._release(d, live, 'self_hauled');
      }
      if (dist2(sender.pos.x, sender.pos.z, wp.x, wp.z) < 110 * 110) {
        slot.senderWaypoints.shift();
        if (slot.senderWaypoints.length) {
          transitTo(sender, live, now, slot.senderWaypoints[0], 'short_line:sender_long_line');
        }
      }
    }

    if (now >= live.deadlineAt) {
      if (slot.lotState === 'taken' || slot.lotState === 'aboard') {
        // The window closed mid-haul; the lot is still real and the receiver
        // still waits — a late delivery beats an honest report either way.
        return this._release(d, live, 'window_closed');
      }
      return this._release(d, live, 'self_hauled');
    }
  },

  choose(d, live, state, choiceId) {
    const slot = live.data.slot;
    if (!slot || live.phase === 'done' || slot.lotState !== 'pending') return;
    if (choiceId === 'take') {
      // The lot materializes as real custody freight at the sender's side.
      const sender = d.entsOf(live, 'sender')[0];
      if (!sender) return this._release(d, live, 'receiver_gone');
      const pod = d.spawnFreightPickup(live, {
        pos: { x: sender.pos.x + 24, z: sender.pos.z + 18 },
        commodityId: LOT_CMDTY,
        qty: LOT_QTY,
        ttlS: WINDOW_S + 120,
        custody: {
          ownerName: 'SHORT-LINE LOT — SENDER\'S FREIGHT',
          encounterId: live.id,
        },
      });
      if (!pod) return this._release(d, live, 'receiver_gone');
      slot.lotPodId = pod.id;
      slot.lotState = 'taken';
      slot.lotPodLastPos = { x: pod.pos.x, z: pod.pos.z };
      d.say(live, 'bark', 'LOT SENDER: freight is on the field. Through the slot if she fits — around the stones if she doesn\'t.', null, { literal: true });
      return;
    }
    // 'pass' (and silence at the deadline): the sender files the long line.
    if (choiceId === 'pass') this._sendSender(d, live);
  },

  event() {},

  _sendSender(d, live) {
    const slot = live.data.slot;
    const sender = d.entsOf(live, 'sender')[0];
    if (!sender || slot.senderEnRoute) return;
    slot.senderEnRoute = true;
    const wp = slot.senderWaypoints[0];
    if (wp) transitTo(sender, live, d.now(), wp, 'short_line:sender_long_line');
    d.say(live, 'bark', 'LOT SENDER: no takers. I go around — the long line never asks your beam.', null, { literal: true });
  },

  _deliver(d, live) {
    live.data.slot.lotState = 'delivered';
    d.grant(300, 'short_line:delivered');
    d.rep(live.plan && live.plan.factionId || 'faction_scn', 3, 'short_line_delivered');
    d.say(live, 'alert', 'LOT RECEIVER: manifest matches the lot — short line or long, the freight decides.', null, { literal: true });
    return this._release(d, live, 'lot_delivered');
  },

  _release(d, live, outcome) {
    d.despawnAll(live, 30);
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'trade',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'mule_trader',
  },
  title: 'THE SHORT LINE',
  primaryLine: 'FREIGHT CHANNEL: a lot needs the far side. The slot saves the burn if your hull is light — the long way around the stones is open to anyone.',
  verbs: ['haul', 'outrun'],
  choices: [
    { id: 'take', label: 'Take the lot — your hull, your line' },
    { id: 'pass', label: 'Pass — she hauls it the long way' },
  ],
  timeoutChoice: 'pass',
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    clusterRadius: 60,
    minSeparation: 40,
    team: 2,
    passive: true,
    doctrine: 'official',
    formation: 'line',
  },
  // Role names only: civilian→'sender', squad→'receiver'. plan.predation stays
  // null — the only custody here is the physical lot pod.
  predation: {
    carrierRole: 'sender',
    raiderRole: 'receiver',
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    lot_delivered: 'LOT DELIVERED — the receiver signs the manifest. Your line, your proof.',
    self_hauled: 'SELF-HAULED — the sender took the long line and the lot arrived without you.',
    lot_lost: 'LOT LOST — the freight is gone and the wall kept its shortcuts.',
    lot_taken: 'LOT KEPT — the freight rode off in the wrong hold. The sender filed your name.',
    window_closed: 'WINDOW CLOSED — the receiver stood down with the lot still riding.',
    receiver_gone: 'CONTRACT VOID — no receiver on the far side; the lot is loose freight now.',
  },
});
