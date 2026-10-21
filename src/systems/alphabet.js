// Automation alphabet (V2 §4 / cut-list #28). The unified 5-primitive vocabulary that lets the
// player PROGRAM drones instead of just deploying them. This is the spine that connects the manual
// verbs (you drilled by hand in #27; now you hand that verb to a drone) to the empire fantasy.
//
// THE FIVE PRIMITIVES (orthogonal, never bloat):
//   MOVE     — to a beacon / entity / sector (named targets, never raw coords)
//   MINE     — here, until cargo full or vein empty
//   INTERACT — contextual verb from target: sell / buy / load / unload / dock / repair / build
//   GUARD    — follow an entity, engage hostiles (how escorts work — allied NPC, no new engine)
//   WAIT     — on a condition: cargo full, hull<X, threat near, or a timer
//
// SCOPE (per IMPROVEMENT_IDEAS #28 refinement): the primitives exist as typed data; templates are
// named sequences; ONE runtime executes a drone's current template step-by-step. No conditional
// nodes in this pass (those unlock at a later tier per the V2 plan) — templates are straight-line
// loops for now, which is enough to prove the fantasy: you compose Mine→Move→Sell and a drone
// repeats it forever, earning while you do something else.
//
// Integration: this is an opt-in layer over the existing automation drone. A drone group with a
// `program` field runs the alphabet; a drone without one uses the legacy mine-to-buffer behavior
// (backward compatible). The alphabet reads/writes only its own program state on the group.
// Programmed mining fills the operation shipment (PQ-177.06), never the player hold; credits
// still go through economy:grantCredits via the automation seller.
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { hasMachineProtocol } from '../data/alienEcology.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { COMMODITIES } from '../data/commodities.js';
import { DRONES } from '../data/automation.js';

export const MAX_PROGRAM_STEPS = 6;
export const MAX_PROGRAM_NAME_LENGTH = 40;
export const MAX_PROGRAM_WAIT_S = 600;
const commodityIds = new Set(COMMODITIES.map((c) => c.id));

export function resolveProgram(group) {
  const p = group?.program;
  return p?.kind === 'custom' ? (p.blocked ? null : p) : TEMPLATES[p?.templateId] || null;
}

// Blocked saved programs remain programs, so they can never fall through to passive miners.
export function hasProgram(group) {
  return group?.program?.kind === 'custom' || !!TEMPLATES[group?.program?.templateId];
}

export function validateProgram(raw, { state, group, validateTargets = true } = {}) {
  const fail = (reason, i, message) => ({ ok: false, reason, stepIndex: i, message: `Step ${i + 1}: ${message}` });
  if (!raw || raw.kind !== 'custom' || raw.version !== 1) return fail('invalid_program', 0, 'Use a version 1 custom loop.');
  if (Object.keys(raw).some((k) => !['kind', 'version', 'name', 'steps', 'reaction'].includes(k))) return fail('unsupported_node', 0, 'Conditional or extra program nodes are not supported.');
  // Reaction authoring stays in the existing protocol-gated reaction API.
  if (raw.reaction != null && raw.reaction !== 'none') return fail('invalid_reaction', 0, 'Assign reactions separately through the machine protocol.');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > MAX_PROGRAM_NAME_LENGTH) return fail('invalid_name', 0, 'Name the loop in 1–40 characters.');
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > MAX_PROGRAM_STEPS) return fail('step_count', 0, 'A loop needs 1–6 steps.');
  const steps = [];
  const cap = Number(group?.bufferCap || DRONES.find((d) => d.id === group?.defId)?.bufferCap) || 40;
  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i];
    if (!s || typeof s !== 'object') return fail('invalid_step', i, 'Choose an instruction.');
    if (s.op === 'guard') return fail('persistent_guard', i, 'Guard stays active indefinitely; use Guard Player.');
    if (!['move', 'mine', 'interact', 'wait'].includes(s.op)) return fail('unknown_operation', i, 'Unknown operation.');
    const keys = s.op === 'move' ? ['op', 'target'] : s.op === 'mine' ? ['op', 'target', 'until']
      : s.op === 'wait' ? ['op', 'until', 'seconds'] : s.verb === 'sell' ? ['op', 'verb', 'target', 'good'] : ['op', 'verb', 'target', 'good', 'qty'];
    if (Object.keys(s).some((k) => !keys.includes(k))) return fail('unsupported_node', i, 'Conditional or extra instruction nodes are not supported.');
    if (s.op === 'wait') {
      if (s.until !== 'timer' || !Number.isFinite(s.seconds) || s.seconds < 1 || s.seconds > MAX_PROGRAM_WAIT_S) return fail('invalid_timer', i, 'Wait needs a timer from 1 to 600 seconds.');
      steps.push({ op: s.op, until: 'timer', seconds: s.seconds });
      continue;
    }
    if (s.op === 'mine') {
      if (s.target !== 'field' || s.until !== 'cargoFull') return fail('invalid_mine', i, 'Mine the field until shipment full.');
      steps.push({ op: s.op, target: 'field', until: 'cargoFull' });
      continue;
    }
    const explicit = typeof s.target === 'string' && /^(claim|station):[a-zA-Z0-9_-]+$/.test(s.target);
    if (!explicit && !['field', 'depot', 'player'].includes(s.target)) return fail('invalid_target', i, 'Choose a field, player, claim, or station.');
    if (s.op === 'interact') {
      if (!['collect', 'unload', 'sell'].includes(s.verb)) return fail('unknown_verb', i, 'Choose collect, unload, or sell.');
      if (!commodityIds.has(s.good)) return fail('unknown_commodity', i, 'Choose a registered commodity.');
      if (s.verb === 'sell' ? !(s.target === 'depot' || s.target.startsWith('station:')) : !s.target.startsWith('claim:')) return fail('invalid_target', i, 'Choose the named destination for this handoff.');
      if (s.verb !== 'sell' && (!Number.isInteger(s.qty) || s.qty <= 0 || s.qty > cap)) return fail('invalid_quantity', i, `Quantity must be a whole number from 1 to ${cap}.`);
    }
    if (validateTargets && explicit) {
      const ctx = { state, group };
      const b = resolveBeacon(s.target, ctx);
      if (!b) return fail('unavailable_target', i, 'Target must be owned, active, and in the drone sector; stations must be live and not gates.');
      if (s.op === 'interact' && s.verb === 'unload' && !['spec_refinery', 'spec_relay'].includes(b.claim?.spec?.id)) return fail('invalid_intake', i, 'Only a refinery or relay accepts freight.');
    }
    const step = { op: s.op, target: s.target };
    if (s.op === 'interact') { step.verb = s.verb; step.good = s.good; if (s.verb !== 'sell') step.qty = s.qty; }
    steps.push(step);
  }
  return { ok: true, program: { kind: 'custom', version: 1, name: raw.name.trim(), steps, reaction: raw.reaction === 'none' ? 'none' : undefined } };
}

// Primitive type tags.
export const P = Object.freeze({
  MOVE: 'move',
  MINE: 'mine',
  INTERACT: 'interact',
  GUARD: 'guard',
  WAIT: 'wait',
});

// Built-in reaction tokens (FLT-01 / V2 §4 / build_map §30).
// One conditional token per drone program — "ON threat-near → FLEE to station",
// "ON cargo-full → drop beacon and hail" — earned through the precursor machine protocol.
export const REACTION_TOKENS = Object.freeze({
  flee_to_station_on_threat: Object.freeze({
    id: 'flee_to_station_on_threat',
    name: 'Flee to Station on Threat',
    desc: 'When hostile contacts approach, interrupt loop and flee to the nearest depot station, then resume when clear.',
    on: 'threat_near',
    step: Object.freeze({ op: P.MOVE, target: 'depot' }),
    mode: 'resume',
  }),
  drop_beacon_and_hail_on_cargo_full: Object.freeze({
    id: 'drop_beacon_and_hail_on_cargo_full',
    name: 'Hail on Full Cargo',
    desc: 'When cargo is full, drop a beacon and hail the depot station, then resume loop.',
    on: 'cargo_full',
    step: Object.freeze({ op: P.INTERACT, verb: 'drop_beacon_and_hail', target: 'depot' }),
    mode: 'resume',
  }),
  evacuate_on_threat: Object.freeze({
    id: 'evacuate_on_threat',
    name: 'Evacuate on Threat',
    desc: 'When hostile contacts approach, retreat to depot and abort the program.',
    on: 'threat_near',
    step: Object.freeze({ op: P.MOVE, target: 'depot' }),
    mode: 'exit',
  }),
});

export function normalizeCondition(cond) {
  if (!cond || typeof cond !== 'string') return null;
  const c = cond.trim().toLowerCase().replace(/-/g, '_');
  if (c === 'threat_near' || c === 'threatnear') return 'threat_near';
  if (c === 'cargo_full' || c === 'cargofull') return 'cargo_full';
  if (c === 'hull_low' || c === 'hulllow') return 'hull_low';
  return c;
}

export function resolveReactionToken(token) {
  if (!token) return null;
  if (typeof token === 'string') return REACTION_TOKENS[token] || null;
  if (typeof token === 'object') {
    const on = normalizeCondition(token.on || token.trigger || token.when);
    if (!on) return null;
    const mode = token.mode === 'exit' ? 'exit' : 'resume';
    const step = token.step || (token.op ? {
      op: token.op,
      target: token.target,
      verb: token.verb,
      until: token.until,
      seconds: token.seconds,
    } : null);
    if (!step || !step.op) return null;
    return {
      id: token.id || 'custom',
      name: token.name || 'Reaction Token',
      desc: token.desc || '',
      on,
      step,
      mode,
    };
  }
  return null;
}

const _threatScratch = [];

export function resolveStationDisplayName(state, stationId, beacon = null) {
  if (beacon && beacon.entity) {
    const e = beacon.entity;
    if (e.name) return e.name;
    if (e.data && e.data.name) return e.data.name;
    if (e.data && e.data.stationName) return e.data.stationName;
  }
  if (stationId && state) {
    const byId = state.entityIndex && state.entityIndex.byStationId;
    if (byId && typeof byId.get === 'function') {
      const ent = byId.get(stationId);
      if (ent) {
        if (ent.name) return ent.name;
        if (ent.data && ent.data.name) return ent.data.name;
        if (ent.data && ent.data.stationName) return ent.data.stationName;
      }
    }
    if (state.entities && typeof state.entities.values === 'function') {
      for (const ent of state.entities.values()) {
        if (!ent || ent.type !== 'station') continue;
        if (ent.id === stationId || (ent.data && ent.data.stationId === stationId)) {
          if (ent.name) return ent.name;
          if (ent.data && ent.data.name) return ent.data.name;
          if (ent.data && ent.data.stationName) return ent.data.stationName;
        }
      }
    }
  }
  return 'depot station';
}

function emitReactionAlert(group, token, ctx) {
  if (!ctx || !ctx.bus || typeof ctx.bus.emit !== 'function') return;
  const beacon = token.step && token.step.target ? resolveBeacon(token.step.target, ctx) : null;
  const stationName = resolveStationDisplayName(ctx.state, beacon && beacon.stationId, beacon);
  let text = `Drone group falls back to ${stationName}`;
  if (token.on === 'cargo_full') {
    text = `Drone group cargo full — hailing ${stationName}`;
  } else if (token.mode === 'exit') {
    text = `Drone group evacuates to ${stationName} — program aborted`;
  }
  ctx.bus.emit('automation:programInterrupted', {
    groupId: group.id,
    action: 'interrupt',
    token: token.id,
    target: stationName,
    text,
  });
  ctx.bus.emit('toast', {
    text,
    kind: 'warn',
    ttl: 3.5,
  });
  ctx.bus.emit('comms:log', {
    from: 'Drone automation',
    text,
    kind: 'machine',
  });
}

export function checkThreatNear(group, ctx) {
  if (typeof ctx.isThreatNear === 'function') return !!ctx.isThreatNear();
  if (typeof ctx.threatNear === 'boolean') return ctx.threatNear;
  const state = ctx.state;
  if (!state) return false;
  let self = state.entities?.get(state.playerId);
  let pos = group.originPos;
  if (group.entityIds && group.entityIds.length && state.entities) {
    const lead = state.entities.get(group.entityIds[0]);
    if (lead && lead.alive !== false && lead.pos) { self = lead; pos = lead.pos; }
  }
  if (!pos && state.entities) {
    const p = state.entities.get(state.playerId);
    pos = p ? p.pos : { x: 0, z: 0 };
  }
  if (!pos) return false;
  const radius = 600;
  const r2 = radius * radius;
  const fallback = (state.entityIndex && (state.entityIndex.shipLike || state.entityIndex.ships))
    || state.entityList
    || (state.entities && typeof state.entities.values === 'function' ? state.entities.values() : null);
  const candidates = queryNearbyEntities(state, pos, radius, _threatScratch, fallback);
  for (const e of candidates) {
    if (!e || e.alive === false) continue;
    if (e.id === state.playerId) continue;
    if (group.entityIds && group.entityIds.includes(e.id)) continue;
    if (!isHostileForAI(state, self, e)) continue;
    if (!e.pos) continue;
    const dx = e.pos.x - pos.x;
    const dz = e.pos.z - pos.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

export function evaluateCondition(cond, group, ctx) {
  const norm = normalizeCondition(cond);
  switch (norm) {
    case 'threat_near':
      return checkThreatNear(group, ctx);
    case 'cargo_full': {
      const cargo = ctx.state && ctx.state.player && ctx.state.player.cargo;
      return typeof ctx.operationFull === 'function'
        ? !!ctx.operationFull()
        : !!(cargo && cargo.usedVolume >= cargo.capVolume - 0.01);
    }
    case 'hull_low': {
      if (typeof ctx.isHullLow === 'function') return !!ctx.isHullLow();
      const leadId = group.entityIds && group.entityIds[0];
      const e = leadId && ctx.state && ctx.state.entities && ctx.state.entities.get(leadId);
      if (e && e.hullMax > 0) return (e.hull / e.hullMax) < 0.3;
      return false;
    }
    default:
      return false;
  }
}

// Built-in templates the player can assign without authoring. Each is a named sequence of steps.
// `target` is a beacon name (resolved at runtime to a world position/station); '*' = current/named.
export const TEMPLATES = Object.freeze({
  mine_to_depot: {
    id: 'mine_to_depot', name: 'Mine → Haul to Depot', desc: 'Mine the current field until full, fly to the depot beacon, sell, repeat.',
    steps: [
      { op: P.MINE, target: 'field', until: 'cargoFull' },
      { op: P.MOVE, target: 'depot' },
      { op: P.INTERACT, verb: 'sell', target: 'depot' },
      { op: P.MOVE, target: 'field' },
    ],
  },
  patrol_guard: {
    id: 'patrol_guard', name: 'Guard the Player', desc: 'Follow the player and engage any hostile that comes near.',
    steps: [
      { op: P.GUARD, target: 'player' },
    ],
  },
  scout_report: {
    id: 'scout_report', name: 'Scout → Report', desc: 'Fly to a beacon, wait there watching for threats, return.',
    steps: [
      { op: P.MOVE, target: 'scout' },
      { op: P.WAIT, until: 'timer', seconds: 30 },
      { op: P.MOVE, target: 'depot' },
    ],
  },
});

const BEACON_ASTEROID_QUERY_RADIUS_PAD = 64;

// Resolve a beacon name to a world position. Beacons are named anchors the player places; for this
// pass 'depot' resolves to the player's current position (a stand-in until beacon placement lands)
// and 'field' to the nearest asteroid field, 'player' to the live player entity. Keeps templates
// portable (V2 §4 beacons-not-coords).
export function resolveBeacon(name, ctx) {
  const state = ctx.state;
  if (name?.startsWith('claim:')) {
    const body = state.claims?.bodies?.find((b) => b.id === name.slice(6));
    if (!body || body.owned !== true || body.spec?.status !== 'active' || body.sectorId !== ctx.group?.sectorId
      || !Number.isFinite(body.x) || !Number.isFinite(body.z)) return null;
    const entity = Array.from(state.entities.values()).find((e) => e.alive !== false && e.data?.poiId === body.poiId);
    return { x: body.x, z: body.z, claim: body, bodyId: body.id, entity };
  }
  if (name?.startsWith('station:')) {
    if (ctx.group?.sectorId !== state.world?.currentSectorId) return null;
    const e = Array.from(state.entities.values()).find((e) => e.alive !== false && e.type === 'station'
      && !e.data?.isGate && e.data?.stationId === name.slice(8));
    return e ? { x: e.pos.x, z: e.pos.z, entity: e, stationId: e.data.stationId } : null;
  }
  if (name === 'player') {
    const e = state.entities.get(state.playerId);
    return e ? { x: e.pos.x, z: e.pos.z, entity: e } : null;
  }
  if (name === 'depot' || name === 'home' || name === 'station') {
    // nearest station (the natural depot); fall back to player position
    const p = state.entities.get(state.playerId);
    const stations = stationBeaconCandidates(state);
    let best = null;
    let bestD = Infinity;
    for (const e of stations) {
      if (!e.alive || e.type !== 'station' || (e.data && e.data.isGate)) continue;
      if (!p) { best = e; break; }
      const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) return { x: best.pos.x, z: best.pos.z, entity: best, stationId: best.data && best.data.stationId };
    if (p) return { x: p.pos.x, z: p.pos.z };
    return null;
  }
  if (name === 'field' || name === 'rock') {
    // nearest live asteroid — the MINE target
    const g = ctx.group || {};
    const anchor = g.originPos || (state.entities.get(state.playerId) || {}).pos || { x: 0, z: 0 };
    let best = null, bestD = Infinity;
    const range = (g.deployRange || 450);
    const asteroids = asteroidBeaconCandidates(state, anchor, range, ctx);
    for (const e of asteroids) {
      if (!e.alive || e.type !== 'asteroid') continue;
      if (e.data && e.data.respawnAt != null) continue;
      const d = (e.pos.x - anchor.x) ** 2 + (e.pos.z - anchor.z) ** 2;
      if (d < bestD && d < range * range) { bestD = d; best = e; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, entity: best } : null;
  }
  // Unknown beacon: treat as the player's position (safe default).
  const p = state.entities.get(state.playerId);
  return p ? { x: p.pos.x, z: p.pos.z } : null;
}

// Execute one tick of a drone group's program. Returns true if the group did meaningful work this
// tick (used by the automation system to gate accrual). Advances the program counter as steps
// complete; loops back to step 0 at the end (templates are loops by design).
//
// This is the runtime. It mutates only ctx.group.programState (the program counter + wait timer +
// cargo-full latch) and grants cargo/credits through canonical events. Movement is applied by
// steering the group's flying entities toward the resolved beacon (the existing _driveDrone helper
// shape), reusing the automation system's entity pool.
export function tickProgram(group, ctx, dt) {
  const tpl = resolveProgram(group);
  if (!tpl) return false;
  const ps = group.programState || (group.programState = { pc: 0, waitT: 0, cargoWasFull: false });

  // Reaction slot evaluation (FLT-01 / V2 §4 / build_map §30):
  // Gated by the precursor machine protocol (alienEcology.machineProtocol).
  // When unlocked, a program with no explicit reaction defaults to flee_to_station_on_threat.
  const reactionUnlocked = hasMachineProtocol(ctx.state);
  let reactionToken = null;
  if (reactionUnlocked) {
    if (group.program.reaction && group.program.reaction !== 'none') {
      reactionToken = resolveReactionToken(group.program.reaction);
    } else if (group.program.reaction == null) {
      reactionToken = REACTION_TOKENS.flee_to_station_on_threat;
    }
  }

  if (reactionUnlocked && reactionToken) {
    const condActive = evaluateCondition(reactionToken.on, group, ctx);
    if (!ps.interrupt && condActive && !ps.reactionLatched) {
      ps.interrupt = {
        token: reactionToken,
        savedPc: ps.pc,
        step: reactionToken.step,
        waitT: 0,
      };
      ps.reactionLatched = true;
      emitReactionAlert(group, reactionToken, ctx);
    } else if (!condActive) {
      ps.reactionLatched = false;
      if (ps.interrupt && ps.interrupt.token.mode === 'resume') {
        finishInterrupt(group, ps, ctx);
      }
    }
  } else if (!reactionToken) {
    if (ps.interrupt) ps.interrupt = null;
  }

  const isInterrupt = Boolean(ps.interrupt);
  const step = isInterrupt ? ps.interrupt.step : tpl.steps[ps.pc];
  if (!step) {
    if (isInterrupt) finishInterrupt(group, ps, ctx);
    else ps.pc = 0;
    return false;
  }

  const beacon = step.target ? resolveBeacon(step.target, ctx) : null;
  const custom = tpl.kind === 'custom' && !isInterrupt;
  if (custom) {
    if (!beacon && (step.op === P.MOVE || step.op === P.INTERACT)) return blockProgram(ps, ctx, `Step ${ps.pc + 1}: Target unavailable; restore an active local claim or station.`);
    if (step.target === 'depot' && !beacon?.stationId && step.op === P.INTERACT) return blockProgram(ps, ctx, `Step ${ps.pc + 1}: No live depot station available.`);
    if (step.op !== P.INTERACT) ps.blockedReason = null;
  }
  const cargo = ctx.state && ctx.state.player && ctx.state.player.cargo;
  const holdFull = typeof ctx.operationFull === 'function'
    ? !!ctx.operationFull()
    : !!(cargo && cargo.usedVolume >= cargo.capVolume - 0.01);

  switch (step.op) {
    case P.MINE: {
      // Steer to the field; fill the operation shipment. Completion is shipment-full, never the
      // player hold (a full Hitch must not freeze a worker, and a worker must not wait on the hold).
      const mineBeacon = beacon || resolveBeacon('field', ctx);
      if (!mineBeacon) {
        // A depleted field sends an existing load home. An empty worker waits here instead of
        // cycling through empty trips and alternating between "running" and "no rock to cut".
        const stored = typeof ctx.operationUsed === 'function'
          ? ctx.operationUsed() : Number(cargo && cargo.usedVolume) || 0;
        if (stored > 0) {
          if (isInterrupt) finishInterrupt(group, ps, ctx);
          else advance(ps, tpl);
        }
        return false;
      }
      const onRock = ctx.steerTo(mineBeacon, dt);
      if (onRock && !holdFull) {
        ctx.mineIntoCargo(dt, mineBeacon.entity);
      }
      if (step.until === 'cargoFull' && holdFull) {
        if (isInterrupt) finishInterrupt(group, ps, ctx);
        else advance(ps, tpl);
      }
      return onRock;
    }
    case P.MOVE: {
      if (!beacon) {
        if (isInterrupt) finishInterrupt(group, ps, ctx);
        else advance(ps, tpl);
        return false;
      }
      const arrived = ctx.steerTo(beacon, dt);
      if (arrived) {
        if (isInterrupt) {
          // If arrived at safety during interrupt, wait until condition clears if resume mode
          const stillActive = reactionUnlocked && evaluateCondition(ps.interrupt.token.on, group, ctx);
          if (stillActive && ps.interrupt.token.mode === 'resume') {
            return true;
          }
          finishInterrupt(group, ps, ctx);
        } else {
          advance(ps, tpl);
        }
      }
      return true;
    }
    case P.INTERACT: {
      if (custom) {
        if (!ctx.steerTo(beacon, dt)) return false;
        if (step.verb === 'sell') {
          if ((ctx.shipmentQty?.(step.good) || 0) > 0) {
            const result = ctx.sellMinedCargo(beacon.stationId, step.good);
            if (result?.ok === false) return blockProgram(ps, ctx, `Step ${ps.pc + 1}: Sale refused — ${String(result.reason || 'refused').replace(/_/g, ' ')}.`);
          }
          if ((ctx.shipmentQty?.(step.good) || 0) > 0) return false;
        } else {
          const result = ctx.transferFreight({ bodyId: beacon.bodyId, direction: step.verb, good: step.good, qty: step.qty - (ps.stepMoved || 0) });
          ps.stepMoved = (ps.stepMoved || 0) + (result?.moved || 0);
          if (ps.stepMoved < step.qty) return blockProgram(ps, ctx, `Step ${ps.pc + 1}: ${result?.reason || 'Waiting for remaining freight'}.`);
        }
        advance(ps, tpl);
        return true;
      }
      // sell: realize the group's mined cargo as credits at the depot station.
      if (step.verb === 'sell') {
        const result = ctx.sellMinedCargo(beacon && beacon.stationId);
        if (result && result.ok === false) return false;
      } else if (step.verb === 'hail' || step.verb === 'drop_beacon_and_hail') {
        if (typeof ctx.dropBeacon === 'function') ctx.dropBeacon();
        if (typeof ctx.hailStation === 'function') ctx.hailStation(beacon && beacon.stationId);
      }
      if (typeof ctx.onInteract === 'function') {
        ctx.onInteract(step, beacon);
      }
      if (isInterrupt) finishInterrupt(group, ps, ctx);
      else advance(ps, tpl);
      return true;
    }
    case P.GUARD: {
      // follow the target (player); engagement is the existing fleet-escort path.
      if (beacon) ctx.steerTo(beacon, dt);
      return true; // guard is a persistent state — never advances
    }
    case P.WAIT: {
      // A moving drone switched to WAIT must publish a park intent — otherwise the last steer
      // command (moveZ:1, brake:false) keeps driving it through the whole wait.
      if (typeof ctx.park === 'function') ctx.park();
      if (step.until === 'timer') {
        ps.waitT += dt;
        if (ps.waitT >= (step.seconds || 10)) {
          ps.waitT = 0;
          if (isInterrupt) finishInterrupt(group, ps, ctx);
          else advance(ps, tpl);
        }
      } else if (step.until) {
        if (evaluateCondition(step.until, group, ctx)) {
          if (isInterrupt) finishInterrupt(group, ps, ctx);
          else advance(ps, tpl);
        }
      }
      return false;
    }
    default:
      if (isInterrupt) finishInterrupt(group, ps, ctx);
      else advance(ps, tpl);
      return false;
  }
}

function advance(ps, tpl) {
  ps.pc = (ps.pc + 1) % tpl.steps.length;
  ps.waitT = 0;
  ps.stepMoved = 0;
  ps.blockedReason = null;
  if (ps.pc === 0) ps.cycles = (ps.cycles || 0) + 1;
}

function blockProgram(ps, ctx, message) {
  ctx.park?.();
  if (ps.blockedReason !== message) ctx.bus?.emit('toast', { text: message, kind: 'warn', ttl: 3 });
  ps.blockedReason = message;
  return false;
}

function finishInterrupt(group, ps, ctx) {
  const token = ps.interrupt && ps.interrupt.token;
  ps.interrupt = null;
  if (!token) return;
  if (token.mode === 'exit') {
    clearTemplate(group);
    if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
      ctx.bus.emit('automation:programInterrupted', {
        groupId: group.id,
        action: 'exit',
        token: token.id,
      });
    }
  } else {
    if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
      ctx.bus.emit('automation:programInterrupted', {
        groupId: group.id,
        action: 'resume',
        token: token.id,
        pc: ps.pc,
      });
    }
  }
}

function stationBeaconCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) return index.dockStations || index.stations || [];
  return (state && state.entityList) || [];
}

function asteroidBeaconCandidates(state, anchor, range, ctx) {
  const fallback = (state.entityIndex && (state.entityIndex.mineables || state.entityIndex.asteroids)) || state.entityList;
  const scratch = alphabetAsteroidScratch(ctx);
  const candidates = queryNearbyEntities(
    state,
    anchor,
    range + BEACON_ASTEROID_QUERY_RADIUS_PAD,
    scratch,
    fallback,
  );
  recordAlphabetCandidates(ctx, candidates, scratch);
  return candidates;
}

function alphabetAsteroidScratch(ctx) {
  if (!ctx._alphabetAsteroidScratch) ctx._alphabetAsteroidScratch = [];
  return ctx._alphabetAsteroidScratch;
}

function recordAlphabetCandidates(ctx, candidates, scratch) {
  const diag = ctx && ctx.diagnostics;
  if (!diag) return;
  if (candidates === scratch) diag.alphabetSpatialQueries = (diag.alphabetSpatialQueries || 0) + 1;
  diag.alphabetCandidates = (diag.alphabetCandidates || 0) + candidates.length;
}

// Assign a template to a drone group (the UI calls this). Resets program state.
// Optionally accepts a reaction token for the reaction slot (FLT-01).
export function assignTemplate(group, templateId, reaction = null) {
  if (!TEMPLATES[templateId]) return false;
  group.program = { templateId };
  if (reaction) {
    const token = resolveReactionToken(reaction);
    if (token) group.program.reaction = token;
  }
  group.programState = { pc: 0, waitT: 0, cargoWasFull: false, interrupt: null, reactionLatched: false };
  return true;
}

// Assign a reaction token to a drone group's program reaction slot (FLT-01).
// Gated by the precursor machine protocol when state is provided.
export function assignReaction(group, reactionToken, state = null) {
  if (!group || !group.program) return false;
  if (state && !hasMachineProtocol(state)) return false;
  if (reactionToken === 'none' || reactionToken === false) {
    group.program.reaction = 'none';
    if (group.programState) {
      group.programState.interrupt = null;
      group.programState.reactionLatched = false;
    }
    return true;
  }
  const token = resolveReactionToken(reactionToken);
  if (!token) {
    delete group.program.reaction;
    if (group.programState) {
      group.programState.interrupt = null;
      group.programState.reactionLatched = false;
    }
    return false;
  }
  group.program.reaction = token;
  return true;
}

// Clear a group's reaction slot.
export function clearReaction(group) {
  if (!group || !group.program) return;
  delete group.program.reaction;
  if (group.programState) {
    group.programState.interrupt = null;
    group.programState.reactionLatched = false;
  }
}

// Clear a group's program (return to legacy mine-to-buffer behavior).
export function clearTemplate(group) {
  group.program = null;
  group.programState = null;
  group.programMotion = null;
}
