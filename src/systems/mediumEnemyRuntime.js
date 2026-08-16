// PR95 Plan 13 — physical setup verbs for the Bulwark and Torcher medium hulls.
//
// This system owns only the transient relationship/hazard state for these two enemy roles. Motion
// remains with SG-02/physics and all health/shield writes remain in the combat damage router. The
// damage router calls activeBulwarkProjectionFor() to discover a currently valid projected shield;
// the helper never mutates vitals. Torcher trails similarly submit ordinary damage packets through
// the combat kernel instead of subtracting hull here.

const BULWARK_ID = 'bulwark_escort';
const TORCHER_ID = 'torcher_denial';

export const MEDIUM_RUNTIME_TUNING = Object.freeze({
  bulwarkLinkRange: 420,
  bulwarkMaxLinks: 3,
  torcherTrailSpacing: 72,
  torcherTrailRadius: 48,
  torcherTrailLifetimeS: 6,
  torcherTrailDamagePerPulse: 9,
  torcherTrailPulseTicks: 12,
  torcherTrailMaxPerSource: 8,
  torcherTrailMaxTotal: 48,
});

const TRANSIENT_VERSION = 1;
const DAMAGEABLE_TYPES = new Set(['ship', 'drone']);

function nowOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function entityKey(id) {
  return String(id);
}

function compareIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function enemyTypeOf(entity) {
  const data = entity && entity.data;
  return String(data && (data.lootTableId || data.enemyTypeId || data.typeId) || '');
}

function distanceSquared(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  return Number.isFinite(dx) && Number.isFinite(dz) ? dx * dx + dz * dz : Infinity;
}

function runtimeFor(state, entityId) {
  return state && state.combat && state.combat.entities
    ? state.combat.entities[entityKey(entityId)] || null
    : null;
}

function projectorPowerOnline(state, source) {
  const power = runtimeFor(state, source && source.id)?.subsystems?.subsystem_power;
  return !power || (power.destroyed !== true && power.effectiveDisabled !== true);
}

function sourceEntity(state, id) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) || null
    : null;
}

function ensureRuntime(state) {
  if (!state.mediumEnemyRuntime || state.mediumEnemyRuntime.version !== TRANSIENT_VERSION) {
    state.mediumEnemyRuntime = {
      version: TRANSIENT_VERSION,
      bulwarkLinksByTarget: {},
      torcherSources: {},
      torcherTrails: [],
      trailPulseReadyTick: {},
      torcherProvocation: {},
      nextTrailSeq: 1,
    };
  }
  return state.mediumEnemyRuntime;
}

/**
 * Read-only combat-router seam. A saved/stale record is never trusted by itself: source identity,
 * team, current distance, power subsystem, shield pool, and same-tick refresh all revalidate here.
 */
export function activeBulwarkProjectionFor(state, target) {
  const runtime = state && state.mediumEnemyRuntime;
  const record = runtime && runtime.bulwarkLinksByTarget
    ? runtime.bulwarkLinksByTarget[entityKey(target && target.id)]
    : null;
  if (!record || !target || target.alive === false) return null;
  const source = sourceEntity(state, record.sourceId);
  if (!source || source.alive === false || enemyTypeOf(source) !== BULWARK_ID) return null;
  if (source.id === target.id || source.team !== target.team || !(Number(source.shield) > 0)) return null;
  if (!projectorPowerOnline(state, source)) return null;
  const range = MEDIUM_RUNTIME_TUNING.bulwarkLinkRange;
  if (distanceSquared(source.pos, target.pos) > range * range) return null;
  const tick = Number(state && state.tick) || 0;
  if (!Number.isInteger(record.updatedTick) || tick - record.updatedTick > 1) return null;
  return { source, record };
}

function liveCraft(state) {
  const index = state && state.entityIndex;
  // The trail is a world hazard, not an AI-only effect. Use the all-ships domain so the player,
  // escorts, and NPCs share exactly the same physical rule.
  const source = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.ships)
    ? index.ships
    : (Array.isArray(state && state.entityList) ? state.entityList : []);
  return source
    .filter((entity) => entity && entity.alive !== false && DAMAGEABLE_TYPES.has(entity.type))
    .slice()
    .sort((a, b) => compareIds(a.id, b.id));
}

function stableLinkPayload(record, active, reason = null) {
  return Object.freeze({
    schemaVersion: 1,
    cueId: active ? 'medium.bulwark.link.active' : 'medium.bulwark.link.broken',
    active,
    reason,
    sourceId: record.sourceId,
    targetId: record.targetId,
    range: MEDIUM_RUNTIME_TUNING.bulwarkLinkRange,
  });
}

export const mediumEnemyRuntime = {
  name: 'mediumEnemyRuntime',

  init(ctx) {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    ensureRuntime(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs = [
        this.bus.on('sector:exit', () => this._clearTransient('sector_exit')),
        this.bus.on('game:new', () => this._clearTransient('new_game')),
        this.bus.on('save:loaded', () => this._clearTransient('save_loaded')),
        this.bus.on('combat:damage', (payload) => this._rememberTorcherProvocation(payload || {})),
      ];
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  update(dt, state) {
    const runtime = ensureRuntime(state);
    if (state.mode !== 'flight') {
      this._expireTrails(runtime, nowOf(state));
      return;
    }
    const craft = liveCraft(state);
    this._syncBulwarkLinks(state, runtime, craft);
    this._syncTorcherTrails(state, runtime, craft);
    this._applyTorcherTrails(dt, state, runtime, craft);
  },

  _clearTransient(reason) {
    const previous = ensureRuntime(this.state);
    for (const record of Object.values(previous.bulwarkLinksByTarget || {})) {
      this._emitLink(record, false, reason);
    }
    this.state.mediumEnemyRuntime = null;
    ensureRuntime(this.state);
  },

  _syncBulwarkLinks(state, runtime, craft) {
    const rangeSq = MEDIUM_RUNTIME_TUNING.bulwarkLinkRange ** 2;
    const sources = craft.filter((entity) => enemyTypeOf(entity) === BULWARK_ID
      && Number(entity.shield) > 0 && projectorPowerOnline(state, entity));
    const proposals = [];
    for (const source of sources) {
      if (source.data && source.data.mediumSetup) source.data.mediumSetup.runtime = this.name;
      const candidates = craft.filter((target) => target.id !== source.id
        && target.team === source.team
        && enemyTypeOf(target) !== BULWARK_ID
        && distanceSquared(source.pos, target.pos) <= rangeSq)
        .sort((a, b) => distanceSquared(source.pos, a.pos) - distanceSquared(source.pos, b.pos)
          || compareIds(a.id, b.id));
      for (const target of candidates.slice(0, MEDIUM_RUNTIME_TUNING.bulwarkMaxLinks)) {
        proposals.push({ source, target, distanceSq: distanceSquared(source.pos, target.pos) });
      }
    }
    proposals.sort((a, b) => a.distanceSq - b.distanceSq
      || compareIds(a.source.id, b.source.id)
      || compareIds(a.target.id, b.target.id));

    const next = {};
    for (const proposal of proposals) {
      const key = entityKey(proposal.target.id);
      if (next[key]) continue; // one real projector pool per wing member; links never stack.
      next[key] = {
        sourceId: proposal.source.id,
        targetId: proposal.target.id,
        updatedTick: Number(state.tick) || 0,
      };
    }

    const previous = runtime.bulwarkLinksByTarget || {};
    for (const [key, oldRecord] of Object.entries(previous)) {
      const replacement = next[key];
      if (replacement && replacement.sourceId === oldRecord.sourceId) continue;
      this._emitLink(oldRecord, false, this._linkBreakReason(state, oldRecord));
    }
    for (const [key, record] of Object.entries(next)) {
      const oldRecord = previous[key];
      if (!oldRecord || oldRecord.sourceId !== record.sourceId) this._emitLink(record, true, null);
    }
    runtime.bulwarkLinksByTarget = next;
  },

  _linkBreakReason(state, record) {
    const source = sourceEntity(state, record.sourceId);
    const target = sourceEntity(state, record.targetId);
    if (!source || source.alive === false) return 'source_destroyed';
    if (!target || target.alive === false) return 'target_destroyed';
    if (!projectorPowerOnline(state, source)) return 'power_stripped';
    if (!(Number(source.shield) > 0)) return 'projector_shield_depleted';
    if (distanceSquared(source.pos, target.pos) > MEDIUM_RUNTIME_TUNING.bulwarkLinkRange ** 2) return 'physical_separation';
    return 'link_reassigned';
  },

  _emitLink(record, active, reason) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const payload = stableLinkPayload(record, active, reason);
    this.bus.emit('medium:bulwarkLink', payload);
    this.bus.emit('medium:semanticCue', payload);
  },

  _syncTorcherTrails(state, runtime, craft) {
    const now = nowOf(state);
    this._expireTrails(runtime, now);
    const torchers = craft.filter((entity) => enemyTypeOf(entity) === TORCHER_ID);
    const liveIds = new Set(torchers.map((entity) => entityKey(entity.id)));
    for (const key of Object.keys(runtime.torcherSources)) {
      if (!liveIds.has(key)) delete runtime.torcherSources[key];
    }
    for (const key of Object.keys(runtime.torcherProvocation)) {
      const record = runtime.torcherProvocation[key];
      if (!liveIds.has(key) || (state.tick | 0) - (record && record.tick | 0) > 180) {
        delete runtime.torcherProvocation[key];
      }
    }
    for (const source of torchers) {
      if (source.data && source.data.mediumSetup) source.data.mediumSetup.runtime = this.name;
      const key = entityKey(source.id);
      const record = runtime.torcherSources[key] || (runtime.torcherSources[key] = {
        lastDrop: { x: source.pos.x, z: source.pos.z },
      });
      this._layTrailBehind(source, record, runtime, now, state.tick | 0);
    }

    for (const segment of runtime.torcherTrails) {
      if (segment.ownerArmed) continue;
      const owner = sourceEntity(state, segment.sourceId);
      if (!owner || owner.alive === false
        || distanceSquared(owner.pos, segment.center) > (segment.radius * 1.15) ** 2) {
        segment.ownerArmed = true;
      }
    }
  },

  _layTrailBehind(source, sourceRecord, runtime, now, tick) {
    const spacing = MEDIUM_RUNTIME_TUNING.torcherTrailSpacing;
    let dx = source.pos.x - sourceRecord.lastDrop.x;
    let dz = source.pos.z - sourceRecord.lastDrop.z;
    let distance = Math.hypot(dx, dz);
    let laid = 0;
    while (distance >= spacing && laid < 4) {
      this._addTrail(runtime, source, sourceRecord.lastDrop, now, tick);
      const ratio = spacing / distance;
      sourceRecord.lastDrop = {
        x: sourceRecord.lastDrop.x + dx * ratio,
        z: sourceRecord.lastDrop.z + dz * ratio,
      };
      dx = source.pos.x - sourceRecord.lastDrop.x;
      dz = source.pos.z - sourceRecord.lastDrop.z;
      distance = Math.hypot(dx, dz);
      laid++;
    }
  },

  _addTrail(runtime, source, center, now, tick) {
    const maxPerSource = MEDIUM_RUNTIME_TUNING.torcherTrailMaxPerSource;
    const own = runtime.torcherTrails.filter((segment) => segment.sourceId === source.id);
    if (own.length >= maxPerSource) {
      const oldest = own[0];
      runtime.torcherTrails = runtime.torcherTrails.filter((segment) => segment !== oldest);
      this._emitTrailEnded(oldest, 'source_cap');
    }
    while (runtime.torcherTrails.length >= MEDIUM_RUNTIME_TUNING.torcherTrailMaxTotal) {
      const oldest = runtime.torcherTrails.shift();
      this._emitTrailEnded(oldest, 'global_cap');
    }
    const sequence = runtime.nextTrailSeq++;
    const segment = {
      id: `torcher_trail_${entityKey(source.id)}_${sequence}`,
      sourceId: source.id,
      center: { x: center.x, z: center.z },
      radius: MEDIUM_RUNTIME_TUNING.torcherTrailRadius,
      createdAt: now,
      expiresAt: now + MEDIUM_RUNTIME_TUNING.torcherTrailLifetimeS,
      createdTick: tick,
      ownerArmed: false,
    };
    runtime.torcherTrails.push(segment);
    const payload = Object.freeze({
      schemaVersion: 1,
      cueId: 'medium.torcher.trail.laid',
      trailId: segment.id,
      sourceId: segment.sourceId,
      center: Object.freeze({ ...segment.center }),
      radius: segment.radius,
      expiresAt: segment.expiresAt,
    });
    this.bus?.emit('medium:torcherTrailLaid', payload);
    this.bus?.emit('medium:semanticCue', payload);
  },

  _expireTrails(runtime, now) {
    const survivors = [];
    for (const segment of runtime.torcherTrails || []) {
      if (segment.expiresAt > now) survivors.push(segment);
      else this._emitTrailEnded(segment, 'expired');
    }
    runtime.torcherTrails = survivors;
    const liveTrailIds = new Set(survivors.map((segment) => segment.id));
    for (const key of Object.keys(runtime.trailPulseReadyTick || {})) {
      const separator = key.indexOf('|');
      if (!liveTrailIds.has(separator >= 0 ? key.slice(0, separator) : key)) delete runtime.trailPulseReadyTick[key];
    }
  },

  _emitTrailEnded(segment, reason) {
    if (!segment || !this.bus) return;
    const payload = Object.freeze({
      schemaVersion: 1,
      cueId: 'medium.torcher.trail.ended',
      trailId: segment.id,
      sourceId: segment.sourceId,
      reason,
    });
    this.bus.emit('medium:torcherTrailEnded', payload);
    this.bus.emit('medium:semanticCue', payload);
  },

  _applyTorcherTrails(_dt, state, runtime, craft) {
    if (!runtime.torcherTrails.length) return;
    const tick = state.tick | 0;
    for (const target of craft) {
      let selected = null;
      let selectedDistance = Infinity;
      for (const segment of runtime.torcherTrails) {
        if (target.id === segment.sourceId && !segment.ownerArmed) continue;
        const distanceSq = distanceSquared(target.pos, segment.center);
        if (distanceSq > segment.radius * segment.radius) continue;
        const pulseKey = `${segment.id}|${entityKey(target.id)}`;
        if ((runtime.trailPulseReadyTick[pulseKey] | 0) > tick) continue;
        if (distanceSq < selectedDistance || (distanceSq === selectedDistance && segment.id < selected.id)) {
          selected = segment;
          selectedDistance = distanceSq;
        }
      }
      if (!selected) continue;
      const pulseKey = `${selected.id}|${entityKey(target.id)}`;
      runtime.trailPulseReadyTick[pulseKey] = tick + MEDIUM_RUNTIME_TUNING.torcherTrailPulseTicks;
      this._routeTrailDamage(state, target, selected);
    }
  },

  _routeTrailDamage(state, target, segment) {
    const kernel = this._combatKernel();
    if (!kernel || typeof kernel.routeDamage !== 'function') return null;
    const provocation = target.id === segment.sourceId
      ? ensureRuntime(state).torcherProvocation[entityKey(target.id)] || null
      : null;
    const attackerId = provocation && (state.tick | 0) - (provocation.tick | 0) <= 180
      ? provocation.attackerId
      : segment.sourceId;
    const receipt = kernel.routeDamage({
      attackerId,
      targetId: target.id,
      origin: { kind: 'environment', id: 'medium_torcher_trail', trailId: segment.id },
      packet: {
        channels: { thermal: MEDIUM_RUNTIME_TUNING.torcherTrailDamagePerPulse },
        heat: 2,
        hit: { pos: { x: target.pos.x, z: target.pos.z } },
        source: { kind: 'medium_torcher_trail', sourceId: segment.sourceId },
        flags: { ignoreFriendlyFire: true, allowAnyTarget: true },
      },
    });
    if (receipt && receipt.ok) {
      const payload = Object.freeze({
        schemaVersion: 1,
        cueId: 'medium.torcher.trail.hit',
        trailId: segment.id,
        sourceId: segment.sourceId,
        targetId: target.id,
        selfCrossing: target.id === segment.sourceId,
        attributedAttackerId: attackerId,
        applied: receipt.totalApplied,
      });
      this.bus?.emit('medium:torcherTrailHit', payload);
      this.bus?.emit('medium:semanticCue', payload);
    }
    return receipt;
  },

  _rememberTorcherProvocation(payload) {
    const target = sourceEntity(this.state, payload.targetId);
    if (!target || enemyTypeOf(target) !== TORCHER_ID) return;
    if (payload.attackerId == null || payload.attackerId === target.id) return;
    const attacker = sourceEntity(this.state, payload.attackerId);
    if (attacker && attacker.team != null && attacker.team === target.team) return;
    ensureRuntime(this.state).torcherProvocation[entityKey(target.id)] = {
      attackerId: payload.attackerId,
      tick: this.state.tick | 0,
    };
  },

  _combatKernel() {
    const helper = this.helpers && this.helpers.routeCombatDamage;
    if (typeof helper === 'function') return { routeDamage: helper };
    const system = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('combat')
      : null;
    return system && typeof system.ensureKernel === 'function' ? system.ensureKernel() : null;
  },
};

export default mediumEnemyRuntime;
