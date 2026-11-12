// PL-09 The recovery tug — A wreck left in a lane is collected by a real tug that comes from the nearest dock.
// What the player can do: Race it for the wreck; or cut its line.
//
// Invariants:
// - Deterministic: uses state.simTime and state.rng only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as recoveryTugPlantOps
//   and leases motion via trafficReactionLease (requestTrafficReaction / releaseTrafficReaction).
// - Physical: a real tug hull navigates from the nearest dock to the wreck in the lane,
//   attaches a tow line, and hauls it back to dock.
// - Voice / dialogue bounds: 8 words or fewer per plant rule (§0.0):
//   Dispatch hail: "Recovery dispatch: clearing lane wreck." (5 words)
//   Attach bark: "Tug on the tow. Clear the lane." (7 words)
//   Line cut: "Line parted! Dropping tow." (4 words)
//   Race lost: "Today, the tug came second." (5 words, canonical PL-111 quote)
//   Dock secured: "Wreck secured. Lane clear." (4 words)
// - Player agency:
//   1. Race it for the wreck: Player salvages, destroys, or tethers and moves the wreck before the
//      tug arrives; the tug arrives second, barks "Today, the tug came second.", and aborts.
//   2. Cut its line: While under tow, player severs the line or forcibly pulls the wreck away;
//      the line parts, tug barks "Line parted! Dropping tow.", and aborts.
// - Hard rule: emits ONLY its own events ('plants:recoveryTug*') plus 'bark:triggered' and 'comms:log'.
//   Never emits 'dock:*', 'tether:*', 'pickup:*', 'entity:killed', or 'cargo:*'.

import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { requestTrafficReaction, releaseTrafficReaction } from './trafficReactionLease.js';

export const PLANTS_RECOVERY_TUG_DISPATCH_EVENT = 'plants:recoveryTugDispatched';
export const PLANTS_RECOVERY_TUG_ATTACH_EVENT = 'plants:recoveryTugAttached';
export const PLANTS_RECOVERY_TUG_LINE_CUT_EVENT = 'plants:recoveryTugLineCut';
export const PLANTS_RECOVERY_TUG_RACE_LOST_EVENT = 'plants:recoveryTugRaceLost';
export const PLANTS_RECOVERY_TUG_SECURED_EVENT = 'plants:recoveryTugSecured';

export const RECOVERY_TUG_TUNING = Object.freeze({
  dispatchDelayS: 6.0,          // delay after wreck appears before tug dispatches
  laneCorridorRadiusWu: 220.0,  // radius defining lane corridor between stations/zones
  attachRadiusWu: 34.0,         // distance within which tug latches onto wreck
  dockCollectRadiusWu: 65.0,    // distance to dock station where wreck is secured
  tugSpeedWu: 32.0,             // transit speed when approaching
  towSpeedWu: 22.0,             // transit speed when towing
  towRestLengthWu: 28.0,        // distance wreck sits behind tug while towed
  lineCutThresholdDistWu: 85.0, // dist between tug and wreck before line snaps
  raceLostDistWu: 120.0,        // how far wreck must move from original spot to lose race
  cooldownS: 45.0,              // cooldown between recovery incidents
  memoryCap: 32,                // bounded memory entries
});

export const RECOVERY_TUG_DISPATCH_LINE = 'Recovery dispatch: clearing lane wreck.';
export const RECOVERY_TUG_ATTACH_LINE = 'Tug on the tow. Clear the lane.';
export const RECOVERY_TUG_LINE_CUT_LINE = 'Line parted! Dropping tow.';
export const RECOVERY_TUG_RACE_LOST_LINE = 'Today, the tug came second.';
export const RECOVERY_TUG_SECURED_LINE = 'Wreck secured. Lane clear.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pure geometry helper: distance from point (px, pz) to segment (x1, z1)-(x2, z2).
 */
export function pointToSegmentDistance(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - x1, pz - z1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

/**
 * Pure check: is the given wreck position inside a lane?
 * Checks defined trade/patrol lane zones, explicit lane flags, or station corridors.
 */
export function isWreckInLane(wreck, state, tuning = RECOVERY_TUG_TUNING) {
  if (!wreck || !wreck.pos) return false;
  const data = wreck.data || {};
  if (data.inTrafficLane === true || data.trafficLane === true || data.laneZone != null) {
    return true;
  }

  const wx = finite(wreck.pos.x, 0);
  const wz = finite(wreck.pos.z, 0);

  // Check sector zones if available:
  const sector = state?.world?.currentSector || (state?.world?.sectors && state?.world?.currentSectorId ? state.world.sectors[state.world.currentSectorId] : null);
  const zones = sector?.zones || state?.zones || [];
  for (const z of zones) {
    if (!z || (z.type !== 'trade_lane' && z.type !== 'patrol_corridor' && z.type !== 'ambush_lane')) continue;
    const zx = finite(z.x, 0);
    const zz = finite(z.z, 0);
    const r = finite(z.radius, tuning.laneCorridorRadiusWu);
    if (Math.hypot(wx - zx, wz - zz) <= r) return true;
  }

  // Check station corridors:
  const stations = (state?.stations && Array.isArray(state.stations))
    ? state.stations
    : (state?.entities ? Array.from(state.entities.values ? state.entities.values() : []).filter(e => e && e.type === 'station') : []);

  if (stations.length >= 2) {
    for (let i = 0; i < stations.length; i++) {
      const s1 = stations[i];
      if (!s1 || !s1.pos) continue;
      for (let j = i + 1; j < stations.length; j++) {
        const s2 = stations[j];
        if (!s2 || !s2.pos) continue;
        const dist = pointToSegmentDistance(wx, wz, s1.pos.x, s1.pos.z, s2.pos.x, s2.pos.z);
        if (dist <= tuning.laneCorridorRadiusWu) return true;
      }
    }
  }

  return false;
}

/**
 * Pure check: is the entity an eligible wreck for the recovery tug?
 */
export function isRecoveryWreckCandidate(entity, state = null, tuning = RECOVERY_TUG_TUNING) {
  if (!entity || entity.alive === false) return false;
  const type = entity.type;
  const data = entity.data || {};

  const isWreck = type === 'wreck' || type === 'derelict' || data.isWreck === true || data.derelict === true;
  if (!isWreck) return false;

  if (!entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;

  // Not already claimed by a salvor or recovery tug:
  if (data.salvorClaimedBy != null || data.recoveryTugClaimed != null) return false;
  if (data.npcTowedByJobId != null) return false;

  // Not an authored static world structure:
  if (data.worldSiteId != null || data.worldObjectId != null) return false;

  // Check player tether:
  if (state && isPlayerTetheringWreck(entity, state)) return false;

  // Must be in a lane:
  if (!isWreckInLane(entity, state, tuning)) return false;

  return true;
}

/**
 * Pure check: is the player currently tethering this wreck?
 */
export function isPlayerTetheringWreck(wreck, state) {
  if (!wreck || !state) return false;
  const playerId = state.playerId;
  if (playerId == null) return false;

  const attachments = state.combat?.attachments?.byId;
  if (attachments && typeof attachments === 'object') {
    for (const a of Object.values(attachments)) {
      if (a && a.state === 'active' && a.ownerId === playerId && a.targetId === wreck.id) {
        return true;
      }
    }
  }

  // Also check wreck data for direct player line flags:
  if (wreck.data?.tetheredByPlayer === true || wreck.data?.playerTethered === true) return true;
  return false;
}

/**
 * Find the nearest dock / station to the target position.
 */
export function findNearestDock(pos, state) {
  if (!pos || !state) return null;
  const px = finite(pos.x, 0);
  const pz = finite(pos.z, 0);

  let stations = [];
  if (Array.isArray(state.stations) && state.stations.length > 0) {
    stations = state.stations;
  } else if (state.entities) {
    const iter = typeof state.entities.values === 'function'
      ? state.entities.values()
      : (Array.isArray(state.entityList) ? state.entityList : []);
    for (const ent of iter) {
      if (ent && ent.alive !== false && ent.type === 'station' && ent.pos) {
        stations.push(ent);
      }
    }
  }

  if (stations.length === 0) return null;

  let best = null;
  let bestD2 = Infinity;
  for (const s of stations) {
    if (!s || !s.pos) continue;
    const dx = s.pos.x - px;
    const dz = s.pos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s;
    }
  }

  if (!best) return null;
  return {
    id: best.id,
    entity: best,
    pos: { x: best.pos.x, z: best.pos.z },
    radius: finite(best.radius, 40),
  };
}

export const recoveryTugPlantOps = {
  _initRecoveryTugPlant(ctx = {}) {
    this._recoveryTugMemory = new Map();
    this._activeRecoveryIncident = null;
    this._recoveryTugCooldownUntil = -Infinity;
    this._pendingWreckQueue = [];

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', (p) => this._onRecoveryWreckCreated(p));
      this.bus.on('tether:severed', (p) => this._onRecoveryLineSevered(p));
      this.bus.on('tether:cut', (p) => this._onRecoveryLineSevered(p));
      this.bus.on('combat:hitstunImpulse', (p) => this._onRecoveryHitstun(p));
      this.bus.on('sector:exit', () => this._resetRecoveryTugPlant());
      this.bus.on('save:loaded', () => this._resetRecoveryTugPlant());
    }
  },

  _resetRecoveryTugPlant() {
    if (this._activeRecoveryIncident && this._activeRecoveryIncident.tugId) {
      const state = this.state;
      const tug = state?.entities && typeof state.entities.get === 'function'
        ? state.entities.get(this._activeRecoveryIncident.tugId)
        : null;
      if (tug) {
        if (tug.data) delete tug.data.recoveryTug;
        if (tug.data) delete tug.data.recoveryTug;
        releaseTrafficReaction(tug, 'recovery_tug_mission');
      }
    }
    if (this._recoveryTugMemory instanceof Map) {
      this._recoveryTugMemory.clear();
    }
    this._activeRecoveryIncident = null;
    this._recoveryTugCooldownUntil = -Infinity;
    this._pendingWreckQueue = [];
  },

  _onRecoveryWreckCreated(payload) {
    if (!payload) return;
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;

    const wreckId = payload.wreckId ?? payload.id ?? payload.entityId;
    if (wreckId == null) return;

    const now = finite(state.simTime, 0);
    this._pendingWreckQueue.push({
      wreckId,
      reportedAt: now,
      pos: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
    });
  },

  _onRecoveryLineSevered(payload) {
    if (!this._activeRecoveryIncident || this._activeRecoveryIncident.state !== 'tow') return;
    const inc = this._activeRecoveryIncident;
    const targetId = payload?.targetId ?? payload?.entityId;
    const ownerId = payload?.ownerId;

    if (targetId === inc.wreckId || ownerId === inc.tugId || targetId === inc.tugId) {
      this._triggerLineCut('tether_severed_event');
    }
  },

  _onRecoveryHitstun(payload) {
    if (!this._activeRecoveryIncident || this._activeRecoveryIncident.state !== 'tow') return;
    const inc = this._activeRecoveryIncident;
    const targetId = payload?.targetId ?? payload?.entityId;

    // A hard hit on the tug or wreck while under tow can part the line:
    if (targetId === inc.tugId || targetId === inc.wreckId) {
      const impulse = finite(payload.impulse, 0);
      if (impulse >= 40) {
        this._triggerLineCut('hitstun_impulse');
      }
    }
  },

  _triggerLineCut(reason = 'player_cut') {
    const inc = this._activeRecoveryIncident;
    if (!inc || inc.state !== 'tow') return;

    const state = this.state;
    const now = finite(state?.simTime, 0);
    inc.state = 'line_cut';
    inc.endedAt = now;
    inc.cutReason = reason;

    // Release wreck claim:
    const wreck = state?.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.wreckId)
      : null;
    if (wreck && wreck.data) {
      delete wreck.data.recoveryTugClaimed;
      delete wreck.data.npcTowedByJobId;
    }

    // Emit line cut event:
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_RECOVERY_TUG_LINE_CUT_EVENT, {
        tugId: inc.tugId,
        wreckId: inc.wreckId,
        reason,
        t: now,
      });
      this.bus.emit('bark:triggered', {
        speakerId: inc.tugId,
        text: RECOVERY_TUG_LINE_CUT_LINE,
        kind: 'traffic',
      });
      this.bus.emit('comms:log', {
        from: 'RECOVERY TUG',
        text: RECOVERY_TUG_LINE_CUT_LINE,
        kind: 'traffic',
      });
    }

    const tug = state?.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.tugId)
      : null;
    if (tug) {
      if (tug.data) delete tug.data.recoveryTug;
      releaseTrafficReaction(tug, 'recovery_tug_mission');
    }

    this._activeRecoveryIncident = null;
    this._recoveryTugCooldownUntil = now + RECOVERY_TUG_TUNING.cooldownS;
  },

  _triggerRaceLost(reason = 'wreck_taken_by_player') {
    const inc = this._activeRecoveryIncident;
    if (!inc || inc.state !== 'approach') return;

    const state = this.state;
    const now = finite(state?.simTime, 0);
    inc.state = 'race_lost';
    inc.endedAt = now;
    inc.raceReason = reason;

    // Release wreck claim:
    const wreck = state?.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.wreckId)
      : null;
    if (wreck && wreck.data) {
      delete wreck.data.recoveryTugClaimed;
      delete wreck.data.npcTowedByJobId;
    }

    // Emit race lost event:
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_RECOVERY_TUG_RACE_LOST_EVENT, {
        tugId: inc.tugId,
        wreckId: inc.wreckId,
        reason,
        t: now,
      });
      this.bus.emit('bark:triggered', {
        speakerId: inc.tugId,
        text: RECOVERY_TUG_RACE_LOST_LINE,
        kind: 'traffic',
      });
      this.bus.emit('comms:log', {
        from: 'RECOVERY TUG',
        text: RECOVERY_TUG_RACE_LOST_LINE,
        kind: 'traffic',
      });
    }

    const tug = state?.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.tugId)
      : null;
    if (tug) {
      if (tug.data) delete tug.data.recoveryTug;
      releaseTrafficReaction(tug, 'recovery_tug_mission');
    }

    this._activeRecoveryIncident = null;
    this._recoveryTugCooldownUntil = now + RECOVERY_TUG_TUNING.cooldownS;
  },

  _updateRecoveryTugPlant(dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const now = finite(state.simTime, 0);

    // 1. If an incident is active, step it:
    if (this._activeRecoveryIncident) {
      this._stepRecoveryIncident(dt, state, now);
      return;
    }

    // 2. Cooldown check before new incident:
    if (now < this._recoveryTugCooldownUntil) return;

    // 3. Check for eligible candidate wreck:
    this._evaluateNewRecoveryIncident(now, state);
  },

  _evaluateNewRecoveryIncident(now, state) {
    let candidateWreck = null;

    // Check pending reported queue first:
    while (this._pendingWreckQueue.length > 0) {
      const item = this._pendingWreckQueue.shift();
      if (now - item.reportedAt < RECOVERY_TUG_TUNING.dispatchDelayS) {
        this._pendingWreckQueue.unshift(item);
        break;
      }
      const ent = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(item.wreckId)
        : null;
      if (ent && isRecoveryWreckCandidate(ent, state)) {
        candidateWreck = ent;
        break;
      }
    }

    // Fall back to scanning state entities for loose wrecks in lanes:
    if (!candidateWreck && state.entities) {
      const iter = typeof state.entities.values === 'function'
        ? state.entities.values()
        : (Array.isArray(state.entityList) ? state.entityList : []);
      for (const ent of iter) {
        if (ent && isRecoveryWreckCandidate(ent, state)) {
          candidateWreck = ent;
          break;
        }
      }
    }

    if (!candidateWreck) return;

    // Find nearest dock:
    const dock = findNearestDock(candidateWreck.pos, state);
    if (!dock) return;

    // Find or spawn a real tug:
    const tug = this._resolveRecoveryTug(dock, state);
    if (!tug) return;

    // Claim the wreck:
    candidateWreck.data = candidateWreck.data || {};
    candidateWreck.data.recoveryTugClaimed = tug.id;

    // Establish incident:
    const incidentId = `recovery_inc_${now.toFixed(1)}_${candidateWreck.id}`;
    const incident = {
      id: incidentId,
      state: 'approach',
      wreckId: candidateWreck.id,
      tugId: tug.id,
      dockId: dock.id,
      dockPos: { x: dock.pos.x, z: dock.pos.z },
      originalWreckPos: { x: candidateWreck.pos.x, z: candidateWreck.pos.z },
      startedAt: now,
    };

    this._activeRecoveryIncident = incident;

    // Lease reaction:
    requestTrafficReaction(tug, 'recovery_tug_mission', 80, 120);

    // Emit dispatch event and hail:
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_RECOVERY_TUG_DISPATCH_EVENT, {
        tugId: tug.id,
        wreckId: candidateWreck.id,
        dockId: dock.id,
        t: now,
      });
      this.bus.emit('bark:triggered', {
        speakerId: tug.id,
        text: RECOVERY_TUG_DISPATCH_LINE,
        kind: 'traffic',
      });
      this.bus.emit('comms:log', {
        from: 'RECOVERY TUG',
        text: RECOVERY_TUG_DISPATCH_LINE,
        kind: 'traffic',
      });
    }
  },

  _resolveRecoveryTug(dock, state) {
    if (!state || !dock) return null;

    // Look for an existing idle tug:
    if (state.entities) {
      const iter = typeof state.entities.values === 'function'
        ? state.entities.values()
        : (Array.isArray(state.entityList) ? state.entityList : []);
      for (const ent of iter) {
        if (!ent || ent.alive === false || ent.type !== 'ship') continue;
        const d = ent.data || {};
        const role = String(d.trafficRole || d.role || '').toLowerCase();
        if (role === 'tug' && !d.jobId && !d.recoveryTug && d.ai?.passive !== false) {
          d.recoveryTug = true;
          return ent;
        }
      }
    }

    // Otherwise spawn one if helpers available:
    if (this.helpers && typeof this.helpers.spawnEntity === 'function') {
      const ang = (hash32(state.meta?.seed || 1, 'recovery_tug_spawn', String(dock.id)) >>> 0) / 0xffffffff * Math.PI * 2;
      const r = (dock.radius || 40) + 30;
      const spawnPos = { x: dock.pos.x + Math.cos(ang) * r, z: dock.pos.z + Math.sin(ang) * r };
      const spec = {
        id: `tug_recovery_${state.tick || 0}`,
        type: 'ship',
        team: 2,
        pos: spawnPos,
        vel: { x: 0, z: 0 },
        rot: ang,
        radius: 9,
        hull: 90,
        hullMax: 90,
        data: {
          trafficRole: 'tug',
          role: 'tug',
          recoveryTug: true,
          homeStationId: dock.id,
          ai: { passive: true, archetype: 'tug' },
          intent: { moveX: 0, moveZ: 0, boost: false, fire: false, aimAngle: 0, brake: false },
        },
        flags: {},
      };
      const ent = this.helpers.spawnEntity(spec);
      if (ent) {
        if (state.entities instanceof Map) state.entities.set(ent.id, ent);
        return ent;
      }
    }

    return null;
  },

  _stepRecoveryIncident(dt, state, now) {
    const inc = this._activeRecoveryIncident;
    if (!inc) return;

    const tug = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.tugId)
      : null;
    const wreck = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(inc.wreckId)
      : null;

    if (!tug || tug.alive === false) {
      this._triggerLineCut('tug_lost');
      return;
    }

    // ── Phase: Approach ─────────────────────────────────────────────────────────
    if (inc.state === 'approach') {
      // Check if wreck is gone or player won the race:
      if (!wreck || wreck.alive === false || wreck.data?.salvaged === true) {
        this._triggerRaceLost('wreck_destroyed_or_salvaged');
        return;
      }

      // Check if player took it via tether or moved it far:
      if (isPlayerTetheringWreck(wreck, state)) {
        this._triggerRaceLost('player_tethered');
        return;
      }

      const dxWreckFromOrigin = wreck.pos.x - inc.originalWreckPos.x;
      const dzWreckFromOrigin = wreck.pos.z - inc.originalWreckPos.z;
      if (Math.hypot(dxWreckFromOrigin, dzWreckFromOrigin) > RECOVERY_TUG_TUNING.raceLostDistWu) {
        this._triggerRaceLost('wreck_moved_by_player');
        return;
      }

      // Steer tug toward wreck:
      const dx = wreck.pos.x - tug.pos.x;
      const dz = wreck.pos.z - tug.pos.z;
      const dist = Math.hypot(dx, dz);
      const aim = Math.atan2(dz, dx);

      tug.rot = aim;
      tug.vel = {
        x: Math.cos(aim) * RECOVERY_TUG_TUNING.tugSpeedWu,
        z: Math.sin(aim) * RECOVERY_TUG_TUNING.tugSpeedWu,
      };
      tug.pos.x += tug.vel.x * dt;
      tug.pos.z += tug.vel.z * dt;

      // Close enough to attach tow:
      if (dist <= RECOVERY_TUG_TUNING.attachRadiusWu) {
        inc.state = 'tow';
        inc.attachedAt = now;
        wreck.data = wreck.data || {};
        wreck.data.recoveryTugClaimed = tug.id;
        wreck.data.npcTowedByJobId = inc.id;

        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_RECOVERY_TUG_ATTACH_EVENT, {
            tugId: tug.id,
            wreckId: wreck.id,
            t: now,
          });
          this.bus.emit('bark:triggered', {
            speakerId: tug.id,
            text: RECOVERY_TUG_ATTACH_LINE,
            kind: 'traffic',
          });
          this.bus.emit('comms:log', {
            from: 'RECOVERY TUG',
            text: RECOVERY_TUG_ATTACH_LINE,
            kind: 'traffic',
          });
        }
      }
      return;
    }

    // ── Phase: Tow ─────────────────────────────────────────────────────────────
    if (inc.state === 'tow') {
      if (!wreck || wreck.alive === false) {
        this._triggerLineCut('wreck_lost');
        return;
      }

      // Check if distance between tug and wreck exceeds break threshold:
      const tugWreckDist = Math.hypot(wreck.pos.x - tug.pos.x, wreck.pos.z - tug.pos.z);
      if (tugWreckDist > RECOVERY_TUG_TUNING.lineCutThresholdDistWu) {
        this._triggerLineCut('line_pulled_taut');
        return;
      }

      // Check if player attached tether to the wreck while under tow:
      if (isPlayerTetheringWreck(wreck, state)) {
        this._triggerLineCut('player_counter_tether');
        return;
      }

      // Steer tug toward dock:
      const dxDock = inc.dockPos.x - tug.pos.x;
      const dzDock = inc.dockPos.y ? (inc.dockPos.y - tug.pos.z) : (inc.dockPos.z - tug.pos.z);
      const distDock = Math.hypot(dxDock, dzDock);
      const aimDock = Math.atan2(dzDock, dxDock);

      tug.rot = aimDock;
      tug.vel = {
        x: Math.cos(aimDock) * RECOVERY_TUG_TUNING.towSpeedWu,
        z: Math.sin(aimDock) * RECOVERY_TUG_TUNING.towSpeedWu,
      };
      tug.pos.x += tug.vel.x * dt;
      tug.pos.z += tug.vel.z * dt;

      // Tow the wreck behind the tug:
      const trailingAim = aimDock + Math.PI;
      const desiredWreckX = tug.pos.x + Math.cos(trailingAim) * RECOVERY_TUG_TUNING.towRestLengthWu;
      const desiredWreckZ = tug.pos.z + Math.sin(trailingAim) * RECOVERY_TUG_TUNING.towRestLengthWu;

      wreck.pos.x = desiredWreckX;
      wreck.pos.z = desiredWreckZ;
      wreck.vel = { x: tug.vel.x, z: tug.vel.z };

      // Dock reached -> secured:
      if (distDock <= RECOVERY_TUG_TUNING.dockCollectRadiusWu) {
        inc.state = 'secured';
        inc.endedAt = now;

        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_RECOVERY_TUG_SECURED_EVENT, {
            tugId: tug.id,
            wreckId: wreck.id,
            dockId: inc.dockId,
            t: now,
          });
          this.bus.emit('bark:triggered', {
            speakerId: tug.id,
            text: RECOVERY_TUG_SECURED_LINE,
            kind: 'traffic',
          });
          this.bus.emit('comms:log', {
            from: 'RECOVERY TUG',
            text: RECOVERY_TUG_SECURED_LINE,
            kind: 'traffic',
          });
        }

        // Retire wreck into dock:
        wreck.alive = false;
        if (wreck.data) wreck.data.recoveredToDock = true;
        if (this.helpers && typeof this.helpers.despawnEntity === 'function') {
          this.helpers.despawnEntity(wreck.id);
        }

        if (tug.data) delete tug.data.recoveryTug;
        releaseTrafficReaction(tug, 'recovery_tug_mission');
        this._activeRecoveryIncident = null;
        this._recoveryTugCooldownUntil = now + RECOVERY_TUG_TUNING.cooldownS;
      }
    }
  },
};

/**
 * Standalone recovery tug plant module for testing or direct instantiation.
 */
export const recoveryTugPlant = {
  ...recoveryTugPlantOps,

  init(ctx = {}) {
    this.bus = ctx.bus || null;
    this.state = ctx.state || null;
    this.helpers = ctx.helpers || {};
    this._initRecoveryTugPlant(ctx);
  },

  update(dt) {
    this._updateRecoveryTugPlant(dt, this.state);
  },

  destroy() {
    this._resetRecoveryTugPlant();
  },
};
