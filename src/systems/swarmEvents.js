// Swarm event director (SWARM_PROGRAM S4) — the semi-curated layer of the swarm armory.
//
// Arms on run:waveStarted during 'active': the card is read off the seeded event tables
// (src/data/swarmEvents.js), telegraphed through the one-voice `alert` seam, then spent through
// the shipped seams only — fields.updateExternal to run an installed field hot, a temporary
// registerEnvironmental for pulse fields, mines:placeRequest for a drift (its own owner cap is
// the bound), and one helpers.spawnEntity pickup for the supply pod. No entity writes, no
// direct state mutation — the room stays the writer.
//
// This file deliberately registers no manifest slot of its own. The director is hosted by
// survivalArena — it already ticks at the exact slot this work needs ("Arena toys intercept
// shots and update field strengths before fields and physics resolve this tick"), and
// survivalArena owns the installed-field ledger the surge kind needs to reach. Field slots,
// mine caps and the teardown on rearm/ended are inherited, not re-declared.

import { mulberry32 } from '../core/rng.js';
import { gateBearing } from './waveMaterialization.js';
import { swarmEventFor, SWARM_EVENT_BY_ID } from '../data/swarmEvents.js';

export const SWARM_EVENT_FIELD_ID = 'swarm_event_field';
export const SWARM_EVENT_MINE_OWNER = 'survival-arena';
export const SWARM_EVENT_POD_KIND = 'swarm_supply_pod';
/** Seconds a pod rides before the ordinary despawn sweep takes it — matches the repair cell. */
export const SWARM_EVENT_POD_TTL_S = 18;

const TAU = Math.PI * 2;

function simTimeOf(state) {
  return state && Number.isFinite(state.simTime) ? state.simTime : 0;
}

function liveSwarmRun(state) {
  const run = state && state.run;
  if (!run || typeof run !== 'object') return null;
  if (run.kind !== 'survival' || run.ruleset !== 'swarm') return null;
  return run;
}

function playerPosOf(state) {
  if (!state || state.playerId == null || !state.entities) return null;
  const entity = typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  const pos = entity && entity.pos;
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null;
}

/**
 * The frame a pulse field or mine drift needs: the fight's anchor and the bearings the room
 * install already used. `lane` is the arrival gate's bearing, `across` the perpendicular the
 * sweep rides, `spin` the room's own bearing — reproducing planArenaInstall's stream so a field
 * named 'spin' lands where the room's lean already put it.
 */
export function swarmEventFrame({ at, laneGate, seed, wave } = {}) {
  const anchor = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? { x: at.x, z: at.z } : { x: 0, z: 0 };
  const rng = mulberry32(((seed >>> 0) || 1) ^ Math.imul((Number(wave) || 0) + 1, 0x9e3779b9));
  const spin = rng() * TAU;
  const lane = gateBearing(laneGate);
  const across = rng() < 0.5 ? { x: -lane.z, z: lane.x } : { x: lane.z, z: -lane.x };
  return { at: anchor, lane, across, spin: { x: Math.cos(spin), z: Math.sin(spin) } };
}

export function bearingPoint(frame, bearing, dist) {
  const dir = bearing === 'lane' ? frame.lane
    : bearing === 'across' ? frame.across
    : bearing === 'spin' ? frame.spin
    : { x: 0, z: 0 }; // 'center' and 'player' resolve on the frame's anchor
  const d = Number.isFinite(dist) ? dist : 0;
  return { x: frame.at.x + dir.x * d, z: frame.at.z + dir.z * d };
}

/**
 * The director object survivalArena hosts. `init(ctx)` takes the same context a system would;
 * `update(dt, state)` is called by the host's slot; `teardown(reason)` calms and clears.
 */
export function createSwarmEventDirector(ctx) {
  const api = {
    name: 'swarmEvents',
    _armed: null,     // { event, fireAt } — telegraphed, waiting to spend
    _live: null,      // { event, until, restores:[{id, strength}], fieldId, podId }
    _podIds: new Set(),

    init() {
      this._state = ctx && ctx.state;
      this._bus = ctx && ctx.bus;
      this._helpers = ctx && ctx.helpers;
      this._registry = ctx && ctx.registry;
      this._unsubs = [];
      if (this._bus && typeof this._bus.on === 'function') {
        this._unsubs.push(this._bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
        this._unsubs.push(this._bus.on('run:waveCleared', () => this.teardown('wave_cleared')));
        this._unsubs.push(this._bus.on('run:ended', () => this.teardown('run_ended')));
        this._unsubs.push(this._bus.on('pickup:collected', (p) => this._onPodCollected(p)));
      }
    },

    destroy() {
      this.teardown('destroy');
      for (const off of this._unsubs || []) if (typeof off === 'function') off();
      this._unsubs = [];
    },

    /** The host hands over the frame it installed with — bearings come from the same room. */
    setFrame(frame) { this._frame = frame; },
    /** The host's installed field specs — surge needs their authored strengths to overdrive. */
    setInstalledFields(specs) { this._installedFields = Array.isArray(specs) ? specs : []; },

    _onWaveStarted(payload) {
      const state = this._state;
      const run = liveSwarmRun(state);
      if (!run || run.phase !== 'active') return;
      const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
      const event = swarmEventFor({ arenaId: run.arenaId, wave, seed: run.seed });
      if (!event) return;
      // Telegraph first, spend later — the player reads the card before the room plays it.
      const now = simTimeOf(state);
      this._armed = { event, fireAt: now + event.windupS };
      if (this._bus) {
        this._bus.emit('alert', {
          key: `swarm-event-${event.id}`,
          sev: 'warn',
          text: event.telegraph,
          ttl: 5,
        });
        this._bus.emit('swarm:eventTelegraphed', {
          wave, eventId: event.id, windupS: event.windupS,
        });
      }
    },

    update(_dt, state) {
      const st = state || this._state;
      const now = simTimeOf(st);
      if (this._armed && now >= this._armed.fireAt) {
        const event = this._armed.event;
        this._armed = null;
        this._live = { event, until: event.windowS > 0 ? now + event.windowS : now, restores: [] };
        this._spend(event, st);
        if (event.windowS <= 0) this._finishLive(st);
      }
      if (this._live && this._live.until != null && now >= this._live.until) this._finishLive(st);
    },

    _spend(event, state) {
      const live = this._live;
      if (!live) return;
      switch (event.kind) {
        case 'surge': {
          // Overdrive every field the room installed — the authored strengths came in with the
          // wave plan, so calm is a restore, not a guess.
          const fields = this._fields();
          const installed = this._installedFields || [];
          for (const spec of installed) {
            if (!spec || typeof spec.id !== 'string' || !fields) continue;
            const authored = Number.isFinite(spec.strength) ? spec.strength : 0;
            const patched = fields.updateExternal(spec.id, { strength: authored * event.factor });
            if (patched != null) live.restores.push({ id: spec.id, strength: authored });
          }
          this._emitEvent('spend', state, event, { surged: live.restores.length });
          break;
        }
        case 'pulse': {
          const fields = this._fields();
          const spec = event.field;
          if (!fields || !spec || !this._frame) break;
          const player = playerPosOf(state);
          const at = spec.bearing === 'player' && player ? player : this._frame.at;
          const frame = { ...this._frame, at };
          const center = bearingPoint(frame, spec.bearing, spec.dist || 0);
          const dir = spec.bearing && spec.bearing !== 'player' && spec.bearing !== 'center'
            ? (bearingPoint(frame, spec.bearing, 1)) : null;
          const record = fields.registerEnvironmental({
            id: SWARM_EVENT_FIELD_ID,
            kind: spec.kind,
            center,
            dir: dir && spec.kind === 'cone' ? { x: dir.x - at.x, z: dir.z - at.z } : undefined,
            radius: spec.radius,
            strength: spec.strength,
            damping: spec.damping,
            falloff: spec.falloff,
            halfAngleRad: spec.halfAngleRad,
            createdAt: simTimeOf(state),
          });
          if (record != null) live.fieldId = SWARM_EVENT_FIELD_ID;
          this._emitEvent('spend', state, event, { pulsed: record != null });
          break;
        }
        case 'mines': {
          // The drift rides 'across' — sweeping the lane the wave poured out of.
          if (!this._bus || !this._frame) break;
          const count = Math.max(1, Math.min(4, Math.trunc(event.count) || 4));
          const mouth = bearingPoint(this._frame, 'lane', 260);
          const team = this._playerTeam(state);
          for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * 62;
            this._bus.emit('mines:placeRequest', {
              ownerId: SWARM_EVENT_MINE_OWNER,
              pos: {
                x: mouth.x + this._frame.across.x * offset,
                z: mouth.z + this._frame.across.z * offset,
              },
              team,
              armDelayS: 3,
            });
          }
          this._emitEvent('spend', state, event, { mines: count });
          break;
        }
        case 'supply': {
          const helpers = this._helpers;
          const pos = this._frame ? bearingPoint(this._frame, 'across', 140) : null;
          if (!helpers || typeof helpers.spawnEntity !== 'function' || !pos) break;
          const spawned = helpers.spawnEntity({
            type: 'pickup',
            pos,
            vel: { x: 0, z: 0 },
            radius: 6,
            mass: 0.1,
            collides: true,
            data: {
              kind: SWARM_EVENT_POD_KIND,
              amount: event.credits,
              swarmSupplyPod: true,
              despawnAt: simTimeOf(state) + SWARM_EVENT_POD_TTL_S,
            },
          });
          const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
          if (id != null) {
            live.podId = id;
            this._podIds.add(id);
          }
          this._emitEvent('spend', state, event, { podId: id ?? null });
          break;
        }
        default:
          break;
      }
    },

    _finishLive(state) {
      const live = this._live;
      if (!live) return;
      this._live = null;
      const fields = this._fields();
      for (const restore of live.restores || []) {
        if (fields) fields.updateExternal(restore.id, { strength: restore.strength });
      }
      if (live.fieldId && fields) fields.unregisterExternal(live.fieldId);
      this._emitEvent('calm', state, live.event, {});
    },

    _onPodCollected(payload) {
      const id = payload && payload.pickupId;
      if (id == null || !this._podIds.has(id)) return;
      this._podIds.delete(id);
      const credits = this._live && this._live.event && this._live.event.kind === 'supply'
        ? this._live.event.credits : (SWARM_EVENT_BY_ID.supply_drop && 60);
      // The run wallet takes the pod's worth — award is the only credits write path.
      if (this._bus) this._bus.emit('run:awardRequested', { credits, reason: 'swarm:supplyPod' });
    },

    teardown(reason) {
      // A wave that cleared mid-surge must calm the room, not leave it running hot.
      if (this._live) this._finishLive(this._state);
      this._armed = null;
      this._podIds.clear();
      this._lastTeardown = reason;
    },

    _emitEvent(verb, state, event, extra) {
      if (!this._bus) return;
      this._bus.emit('swarm:event', {
        verb,
        eventId: event && event.id,
        wave: state && state.run && state.run.wave,
        ...extra,
      });
    },

    _fields() {
      return this._registry && typeof this._registry.get === 'function'
        ? this._registry.get('fields') : null;
    },

    _playerTeam(state) {
      const entity = state && state.playerId != null && state.entities
        && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
      return entity && Number.isInteger(entity.team) ? entity.team : 0;
    },
  };
  return api;
}
