// src/combat/stuntTaxonomy.js — Stunt grammar and trick taxonomy (PQ-146.00).
//
// Pure module: turns the receipt stream into named tricks with an explicit cause chain:
// (who threw, what hit, what it hit next).
//
// Every trick is an immutable receipt with:
//   - trickId: canonical identifier
//   - name: human-readable stunt name
//   - rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
//   - baseScore: numerical score foundation for Crucible combo scoring (PQ-146.01)
//   - actorId: the entity who initiated the chain (e.g. playerId)
//   - targetId: the primary victim or affected object
//   - secondaryIds: list of secondary objects in the chain
//   - causeChain: ordered causal steps [ { step, type, entityId, targetId, detail } ]
//   - metrics: physical values (momentum, deltaV, speed, releaseScore, etc.)
//   - tick: simulation tick when the trick was recognized
//
// Law:
//   - Detecting tricks from what the player pressed instead of what the physics produced is forbidden.
//     All tricks derive strictly from physics and combat receipts (PQ-146 How agents get this wrong).
//   - False-positive rate on ordinary flight tapes must be < 5%.
//
// Routes through: GDX-A04 combat causality; PQ-137.05 force table; PQ-146.

export const STUNT_SCHEMA_VERSION = 1;

export const TrickRarity = Object.freeze({
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  LEGENDARY: 'legendary',
});

export const TRICK_DEFINITIONS = Object.freeze({
  razor_release: Object.freeze({
    id: 'razor_release',
    name: 'Razor Release',
    rarity: TrickRarity.COMMON,
    baseScore: 100,
    description: 'Released a latched mass at peak angular velocity with razor timing.',
  }),
  wrecking_ball: Object.freeze({
    id: 'wrecking_ball',
    name: 'Wrecking Ball',
    rarity: TrickRarity.UNCOMMON,
    baseScore: 250,
    description: 'Whipped a tethered or slung heavy mass directly into a hostile craft or structure.',
  }),
  clothesline: Object.freeze({
    id: 'clothesline',
    name: 'Clothesline',
    rarity: TrickRarity.RARE,
    baseScore: 350,
    description: 'An enemy struck a taut tether line at speed and suffered violent arrest.',
  }),
  bolas: Object.freeze({
    id: 'bolas',
    name: 'Bolas',
    rarity: TrickRarity.RARE,
    baseScore: 400,
    description: 'Slung a projectile that entangled or consecutively struck two hostiles.',
  }),
  collateral: Object.freeze({
    id: 'collateral',
    name: 'Collateral',
    rarity: TrickRarity.UNCOMMON,
    baseScore: 200,
    description: 'An entity launched by the player collided with and damaged another hostile.',
  }),
  tow_kill: Object.freeze({
    id: 'tow_kill',
    name: 'Tow Kill',
    rarity: TrickRarity.RARE,
    baseScore: 450,
    description: 'Destroyed a pursuing or crossing hostile using an actively towed payload.',
  }),
  rock_discovery: Object.freeze({
    id: 'rock_discovery',
    name: 'Rock Discovery',
    rarity: TrickRarity.UNCOMMON,
    baseScore: 300,
    description: 'Concussed or slung an enemy into an asteroid at crushing speed.',
  }),
  dead_mans_mass: Object.freeze({
    id: 'dead_mans_mass',
    name: "Dead Man's Mass",
    rarity: TrickRarity.RARE,
    baseScore: 500,
    description: 'Propelled a dead derelict wreck to crush an active hostile.',
  }),
  well_golf: Object.freeze({
    id: 'well_golf',
    name: 'Well Golf',
    rarity: TrickRarity.LEGENDARY,
    baseScore: 600,
    description: 'Used a gravity well singularity to fling an entity into a lethal hazard.',
  }),
  near_miss: Object.freeze({
    id: 'near_miss',
    name: 'Near Miss',
    rarity: TrickRarity.COMMON,
    baseScore: 75,
    description: 'Skimmed past massive terrain or a station at extreme speed with razor clearance.',
  }),
  snap_catch: Object.freeze({
    id: 'snap_catch',
    name: 'Snap Catch',
    rarity: TrickRarity.COMMON,
    baseScore: 125,
    description: 'Latched and arrested a high-speed projectile or drifting body on first contact.',
  }),
  shove_bowling: Object.freeze({
    id: 'shove_bowling',
    name: 'Shove Bowling',
    rarity: TrickRarity.UNCOMMON,
    baseScore: 250,
    description: 'Fired a concussion shove into a hostile, knocking them into their wingman.',
  }),
  bank_shot: Object.freeze({
    id: 'bank_shot',
    name: 'Bank Shot',
    rarity: TrickRarity.RARE,
    baseScore: 400,
    description: 'Ricocheted a slung projectile off a rock wall into a hostile.',
  }),
});

export const KNOWN_TRICK_IDS = Object.freeze(Object.keys(TRICK_DEFINITIONS));

// Tuning constants
export const STUNT_CONSTANTS = Object.freeze({
  MIN_ROCK_DISCOVERY_DELTA_V: 15.0,
  MIN_WRECKING_BALL_SPEED: 25.0,
  MIN_WRECKING_BALL_MASS: 10.0,
  MIN_NEAR_MISS_SPEED: 45.0,
  MAX_NEAR_MISS_CLEARANCE: 8.0,
  SNAP_CATCH_MIN_SPEED: 22.0,
  TOW_KILL_MIN_SPEED: 20.0,
  IMPULSE_WINDOW_TICKS: 180, // 3 seconds @ 60Hz
  SLING_WINDOW_TICKS: 360,   // 6 seconds @ 60Hz
  CHAIN_WINDOW_TICKS: 120,   // 2 seconds @ 60Hz
});

const PRIMARY_ORDER = Object.freeze([
  'dead_mans_mass',
  'well_golf',
  'bolas',
  'tow_kill',
  'wrecking_ball',
  'bank_shot',
  'shove_bowling',
  'rock_discovery',
  'clothesline',
  'snap_catch',
  'near_miss',
]);

const RAZOR_LINK_WINDOW_TICKS = 180;
const SETTLED_CONTACT_AGE_TICKS = 480;
const SETTLED_CONTACT_MAX = 256;
const DETECTED_TRICKS_MAX = 64;
const HISTORY_MAP_MAX = 128;
const ACTIVE_TETHER_MAX = 64;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function nonNegative(value, fallback = 0) {
  const n = finite(value, fallback);
  return n >= 0 ? n : fallback;
}

/**
 * Creates a clean stunt detector instance.
 *
 * @param {object} [options]
 * @param {string|number} [options.playerId] ID of the player entity (default null)
 * @returns {StuntDetector}
 */
export function createStuntDetector(options = {}) {
  return new StuntDetector(options);
}

export class StuntDetector {
  constructor(options = {}) {
    this.playerId = options.playerId != null ? options.playerId : null;
    this.recentImpulses = new Map(); // victimId -> { actorId, weaponId, tag, tick, pos }
    this.recentTetherReleases = new Map(); // targetId -> { actorId, score, classification, speed, tick }
    this.activeTethers = new Map(); // sourceId -> { targetId, attachedTick, restLength, isTow }
    this.recentBounces = new Map(); // projectileId -> { surfaceId, surfaceType, tick, pos }
    this.recentWhips = new Map(); // victimId -> { projectileId, actorId, relSpeed, tick }
    this.recentSingularityWells = new Map(); // wellId -> { actorId, tick, pos }
    this.recentNearMisses = new Map(); // obstacleId -> tick
    this._settledContacts = new Map();
    this.detectedTricks = [];
    this.tick = 0;
  }

  setPlayerId(id) {
    this.playerId = id != null ? id : null;
  }

  /**
   * Process a single event from the receipt stream.
   * Returns an array of newly detected tricks on this event.
   *
   * @param {string} eventName
   * @param {object} payload
   * @returns {Array<object>}
   */
  processEvent(eventName, payload) {
    if (!eventName || !payload || typeof payload !== 'object') return [];
    const eventTick = nonNegative(payload.tick, this.tick);
    this.tick = Math.max(this.tick, eventTick);
    this._pruneStale(this.tick);

    const candidates = [];

    switch (eventName) {
      case 'tether:attached':
      case 'tether:latch': {
        this._handleTetherAttached(payload, candidates);
        break;
      }
      case 'tether:releaseRated': {
        this._handleTetherReleaseRated(payload);
        break;
      }
      case 'tether:cut':
      case 'tether:released':
      case 'tether:broke': {
        this._handleTetherReleased(payload);
        break;
      }
      case 'tether:whipImpact': {
        this._handleWhipImpact(payload);
        break;
      }
      case 'tether:snapCatch': {
        this._handleSnapCatch(payload, candidates);
        break;
      }
      case 'combat:hitstunImpulse':
      case 'weapon:shove': {
        this._handleWeaponImpulse(payload);
        break;
      }
      case 'combat:collisionConsequence': {
        this._handleCollisionConsequence(payload, candidates);
        break;
      }
      case 'entity:killed':
      case 'combat:kill': {
        this._handleEntityKilled(payload, candidates);
        break;
      }
      case 'flight:nearMiss': {
        this._handleNearMiss(payload, candidates);
        break;
      }
      case 'well:capture':
      case 'well:fling': {
        this._handleWellEvent(payload);
        break;
      }
      case 'massline:sweepImpact':
      case 'massline:clothesline': {
        this._handleClotheslineEvent(payload, candidates);
        break;
      }
      default:
        break;
    }

    const primary = this._composePrimary(candidates, payload);
    if (!primary) return [];
    this.detectedTricks.push(primary);
    while (this.detectedTricks.length > DETECTED_TRICKS_MAX) this.detectedTricks.shift();
    return [primary];
  }

  /**
   * Process a batch of events (e.g. from an eventTrace or test tape).
   *
   * @param {Array<{type: string, data?: object, payload?: object, tick?: number}>} events
   * @returns {Array<object>} All detected tricks across the stream
   */
  processTrace(events) {
    if (!Array.isArray(events)) return [];
    const allTricks = [];
    for (const entry of events) {
      if (!entry || typeof entry !== 'object') continue;
      const type = entry.type || entry.event;
      const payload = entry.data || entry.payload || entry;
      const tick = entry.tick != null ? entry.tick : payload.tick;
      const tricks = this.processEvent(type, { ...payload, tick });
      allTricks.push(...tricks);
    }
    return allTricks;
  }

  _pruneStale(currentTick) {
    const prune = (map, maxAge) => {
      for (const [key, val] of map.entries()) {
        if (currentTick - (val.tick || 0) > maxAge) {
          map.delete(key);
        }
      }
    };
    prune(this.recentImpulses, STUNT_CONSTANTS.IMPULSE_WINDOW_TICKS);
    prune(this.recentTetherReleases, STUNT_CONSTANTS.SLING_WINDOW_TICKS);
    prune(this.recentBounces, STUNT_CONSTANTS.CHAIN_WINDOW_TICKS);
    prune(this.recentWhips, STUNT_CONSTANTS.CHAIN_WINDOW_TICKS);
    prune(this.recentSingularityWells, STUNT_CONSTANTS.IMPULSE_WINDOW_TICKS);
    for (const [id, nearTick] of this.recentNearMisses) {
      if (currentTick - nearTick > SETTLED_CONTACT_AGE_TICKS) this.recentNearMisses.delete(id);
    }
    for (const [key, settledTick] of this._settledContacts.entries()) {
      if (currentTick - settledTick > SETTLED_CONTACT_AGE_TICKS) this._settledContacts.delete(key);
    }
  }

  _boundedSet(map, key, value, max) {
    if (!map.has(key) && map.size >= max) {
      map.delete(map.keys().next().value);
    }
    map.set(key, value);
  }

  _episodeRoot(trick, payload) {
    const actorId = trick.actorId != null ? trick.actorId : null;
    const chainTarget = Array.isArray(trick.causeChain) && trick.causeChain[0]
      ? trick.causeChain[0].targetId
      : null;
    const ids = [];
    if (chainTarget != null) ids.push(chainTarget);
    if (trick.targetId != null && !ids.includes(trick.targetId)) ids.push(trick.targetId);
    for (const id of Array.isArray(trick.secondaryIds) ? trick.secondaryIds : []) {
      if (id != null && !ids.includes(id)) ids.push(id);
    }
    let bodyId = null;
    let rootTick = null;
    for (const id of ids) {
      let best = null;
      const consider = (record) => {
        if (!record || record.actorId !== actorId || !Number.isFinite(record.tick)) return;
        if (best == null || record.tick < best) best = record.tick;
      };
      consider(this.recentImpulses.get(id));
      consider(this.recentTetherReleases.get(id));
      consider(this.recentWhips.get(id));
      for (const whip of this.recentWhips.values()) {
        if (whip && whip.projectileId === id) consider(whip);
      }
      consider(this.recentBounces.get(id));
      consider(this.recentSingularityWells.get(id));
      const tether = actorId != null ? this.activeTethers.get(actorId) : null;
      if (tether && tether.targetId === id && Number.isFinite(tether.attachedTick)
        && (best == null || tether.attachedTick < best)) {
        best = tether.attachedTick;
      }
      if (best != null) {
        bodyId = id;
        rootTick = best;
        break;
      }
    }
    if (rootTick == null) {
      const provenance = payload && payload.provenance;
      const appliedTick = provenance && Number.isInteger(provenance.appliedTick)
        ? provenance.appliedTick
        : null;
      const now = Number.isFinite(trick.tick) ? trick.tick : this.tick;
      if (appliedTick != null && appliedTick >= 0 && provenance.actorId === actorId
        && now - appliedTick >= 0 && now - appliedTick <= RAZOR_LINK_WINDOW_TICKS) {
        bodyId = chainTarget != null ? chainTarget : (trick.targetId != null ? trick.targetId : null);
        rootTick = appliedTick;
      }
    }
    return {
      actorId,
      bodyId,
      rootTick,
      targetId: trick.targetId != null ? trick.targetId : null,
    };
  }

  _composePrimary(candidates, payload) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const pool = candidates.some((t) => t && t.trickId !== 'collateral')
      ? candidates.filter((t) => t && t.trickId !== 'collateral')
      : candidates;
    let primary = null;
    let best = PRIMARY_ORDER.length + 1;
    for (const candidate of pool) {
      if (!candidate || typeof candidate !== 'object') continue;
      const rank = PRIMARY_ORDER.indexOf(candidate.trickId);
      const order = rank === -1 ? PRIMARY_ORDER.length : rank;
      if (order < best) {
        best = order;
        primary = candidate;
      }
    }
    if (!primary) return null;
    const root = this._episodeRoot(primary, payload);
    if (!Number.isInteger(root.rootTick) || root.rootTick < 0 || root.bodyId == null) return null;
    const rootAge = primary.tick - root.rootTick;
    if (rootAge < 0 || rootAge > SETTLED_CONTACT_AGE_TICKS) return null;
    const rootId = JSON.stringify([root.actorId, root.bodyId, root.rootTick]);
    const episodeId = JSON.stringify([root.actorId, root.bodyId, root.rootTick, root.targetId]);
    if (this._settledContacts.has(episodeId)) return null;
    this._boundedSet(this._settledContacts, episodeId, primary.tick, SETTLED_CONTACT_MAX);
    const release = root.bodyId != null ? this.recentTetherReleases.get(root.bodyId) : null;
    const modifiers = [];
    let releaseGrade = null;
    let name = primary.name;
    if (release && release.actorId === primary.actorId
      && (primary.tick - release.tick) >= 0
      && (primary.tick - release.tick) <= RAZOR_LINK_WINDOW_TICKS) {
      if (release.classification === 'clean' || release.classification === 'razor') {
        releaseGrade = release.classification;
        if (release.classification === 'razor') {
          modifiers.push('razor_release');
          name = `Razor ${primary.name}`;
        }
      }
    }
    return Object.freeze({
      ...primary,
      name,
      episodeId,
      rootId,
      rootTick: root.rootTick,
      modifiers: Object.freeze(modifiers),
      releaseGrade,
    });
  }

  _isPlayer(id) {
    if (id == null) return false;
    if (this.playerId != null) return id === this.playerId;
    return false;
  }

  _handleTetherAttached(payload, tricks) {
    if (payload == null || typeof payload !== 'object') return;
    const actorId = payload.controllerId ?? payload.actorId ?? payload.sourceId ?? payload.playerId ?? payload.data?.sourceId;
    const targetId = payload.targetId ?? payload.data?.targetId;
    const relSpeed = finite(payload.relSpeed ?? payload.data?.relSpeed, 0);
    const arrestDeltaV = finite(payload.arrestDeltaV ?? payload.data?.arrestDeltaV, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (actorId != null && targetId != null) {
      const isTow = payload.isTow === true || payload.mode === 'tow' || payload.mode === 'frame_coupler';
      this._boundedSet(this.activeTethers, actorId, {
        targetId,
        attachedTick: tick,
        restLength: finite(payload.restLength, 20),
        isTow,
      }, ACTIVE_TETHER_MAX);

      // Snap catch detection on attach
      if (this._isPlayer(actorId)
        && arrestDeltaV >= STUNT_CONSTANTS.SNAP_CATCH_MIN_SPEED
        && payload.materialConsequence === true) {
        tricks.push(this._createTrick('snap_catch', {
          actorId,
          targetId,
          metrics: { relSpeed, arrestDeltaV },
          tick,
          causeChain: [
            { step: 1, type: 'incoming_fast_mass', entityId: null, targetId, detail: `body moving at ${relSpeed.toFixed(1)} wu/s` },
            { step: 2, type: 'reaction_latch', entityId: actorId, targetId, detail: 'tether latched and arrested kinetic energy on pass' },
          ],
        }));
      }
    }
  }

  _handleSnapCatch(payload, tricks) {
    if (payload == null || typeof payload !== 'object') return;
    const sourceId = payload.sourceId ?? payload.playerId ?? payload.provenance?.actorId;
    const targetId = payload.targetId;
    const relSpeed = finite(payload.relSpeed ?? payload.speed, 0);
    const arrestDeltaV = finite(payload.arrestDeltaV, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (this._isPlayer(sourceId) && targetId != null
      && arrestDeltaV >= STUNT_CONSTANTS.SNAP_CATCH_MIN_SPEED
      && payload.materialConsequence === true) {
      tricks.push(this._createTrick('snap_catch', {
        actorId: sourceId,
        targetId,
        metrics: { relSpeed, arrestDeltaV },
        tick,
        causeChain: [
          { step: 1, type: 'incoming_fast_mass', entityId: null, targetId, detail: `body approaching at ${relSpeed.toFixed(1)} wu/s` },
          { step: 2, type: 'reaction_latch', entityId: sourceId, targetId, detail: 'instant tether latch arrested kinetic energy' },
        ],
      }));
    }
  }

  _handleTetherReleaseRated(payload) {
    if (payload == null || typeof payload !== 'object') return;
    const sourceId = payload.sourceId ?? payload.playerId ?? payload.provenance?.actorId;
    const targetId = payload.targetId;
    const score = finite(payload.releaseScore, 0);
    const classification = payload.classification ?? 'messy';
    const tangentialSpeed = finite(payload.tangentialSpeed, 0);
    const angularSpeed = finite(payload.angularSpeed, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (targetId != null) {
      this._boundedSet(this.recentTetherReleases, targetId, {
        actorId: sourceId,
        score,
        classification,
        tangentialSpeed,
        angularSpeed,
        speed: Math.hypot(tangentialSpeed, finite(payload.radialSpeed, 0)),
        tick,
      }, HISTORY_MAP_MAX);
    }
  }

  _handleTetherReleased(payload) {
    if (payload == null || typeof payload !== 'object') return;
    const sourceId = payload.sourceId ?? payload.actorId ?? payload.controllerId ?? payload.playerId;
    const targetId = payload.targetId ?? payload.data?.targetId;
    if (sourceId != null) {
      const active = this.activeTethers.get(sourceId);
      if (active && (targetId == null || active.targetId === targetId)) {
        this.activeTethers.delete(sourceId);
      }
      return;
    }
    if (targetId != null) {
      for (const [key, tether] of this.activeTethers) {
        if (tether.targetId === targetId) this.activeTethers.delete(key);
      }
    }
  }

  _handleWhipImpact(payload) {
    if (payload == null || typeof payload !== 'object') return;
    const actorId = payload.actorId ?? payload.sourceId ?? payload.playerId ?? payload.provenance?.actorId;
    const projectileId = payload.targetId; // In whipImpact, targetId is the slung mass
    const victimId = payload.victimId;     // and victimId is the body that got struck
    const relSpeed = finite(payload.relSpeed, 0);
    const mass = finite(payload.mass, 20);
    const momentum = finite(payload.momentum, relSpeed * mass);
    const tick = nonNegative(payload.tick, this.tick);

    if (projectileId != null && victimId != null) {
      this._boundedSet(this.recentWhips, victimId, { projectileId, actorId, relSpeed, mass, momentum, tick }, HISTORY_MAP_MAX);
    }
  }

  _handleWeaponImpulse(payload) {
    if (payload == null || typeof payload !== 'object') return;
    const actorId = payload.provenance?.actorId ?? payload.actorId ?? payload.attackerId;
    const victimId = payload.victimId ?? payload.targetId;
    const weaponId = payload.weaponId ?? payload.provenance?.weaponId;
    const tag = payload.tag ?? payload.provenance?.tag;
    const deltaV = finite(payload.deltaV, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (victimId != null && actorId != null
      && payload.source !== 'collision'
      && deltaV > 0) {
      this._boundedSet(this.recentImpulses, victimId, {
        actorId,
        weaponId: String(weaponId ?? ''),
        tag: String(tag ?? ''),
        tick,
        deltaV,
      }, HISTORY_MAP_MAX);
    }
  }

  _handleClotheslineEvent(payload, tricks) {
    if (payload == null || typeof payload !== 'object') return;
    const actorId = payload.sourceId ?? payload.playerId ?? payload.provenance?.actorId;
    const victimId = payload.victimId ?? payload.targetId;
    const anchorId = payload.anchorId ?? null;
    const deltaV = finite(payload.deltaV ?? payload.transverseSpeed, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (this._isPlayer(actorId) && victimId != null
      && payload.lineIntercepted === true
      && payload.followOnConsequence === true
      && deltaV >= 20) {
      tricks.push(this._createTrick('clothesline', {
        actorId,
        targetId: victimId,
        secondaryIds: anchorId ? [anchorId] : [],
        metrics: { deltaV },
        tick,
        causeChain: [
          { step: 1, type: 'tether_snare', entityId: actorId, targetId: anchorId, detail: 'player maintained line tension across transit lane' },
          { step: 2, type: 'line_crossing', entityId: null, targetId: victimId, detail: 'hostile intercepted taut massline' },
          { step: 3, type: 'clothesline_arrest', entityId: actorId, targetId: victimId, detail: `line inflicted ${deltaV.toFixed(1)} wu/s shear stop` },
        ],
      }));
    }
  }

  _handleNearMiss(payload, tricks) {
    if (payload == null || typeof payload !== 'object') return;
    const actorId = payload.actorId ?? payload.playerId ?? payload.provenance?.actorId;
    const obstacleId = payload.obstacleId ?? payload.targetId;
    const speed = finite(payload.speed ?? payload.playerSpeed, 0);
    const clearance = finite(payload.clearance ?? payload.distance, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (
      this._isPlayer(actorId)
      && payload.threatId != null
      && payload.threatHostile === true
      && payload.avoidedInterception === true
      && payload.escapeResolved === true
      && clearance > 0
      && speed >= STUNT_CONSTANTS.MIN_NEAR_MISS_SPEED
      && clearance <= STUNT_CONSTANTS.MAX_NEAR_MISS_CLEARANCE
    ) {
      // Cooldown per obstacle to prevent spamming near miss every single tick
      const lastTick = this.recentNearMisses.get(payload.threatId) ?? -Infinity;
      if (tick - lastTick >= 60) {
        this._boundedSet(this.recentNearMisses, payload.threatId, tick, HISTORY_MAP_MAX);
        tricks.push(this._createTrick('near_miss', {
          actorId,
          targetId: obstacleId,
          metrics: { speed, clearance },
          tick,
          causeChain: [
            { step: 1, type: 'high_speed_approach', entityId: actorId, targetId: obstacleId, detail: `shaved obstacle at ${speed.toFixed(1)} wu/s` },
            { step: 2, type: 'clean_clearance', entityId: actorId, targetId: obstacleId, detail: `zero-contact pass with ${clearance.toFixed(1)} wu clearance` },
          ],
        }));
      }
    }
  }

  _handleWellEvent(payload, tricks) {
    const actorId = payload.actorId ?? payload.playerId ?? payload.provenance?.actorId;
    const wellId = payload.wellId || payload.sourceId;
    const victimId = payload.targetId || payload.victimId;
    const tick = nonNegative(payload.tick, this.tick);

    // Ambient arena wells have no pilot owner. Their accidents are room activity,
    // not a player trick; never invent an initiator for a world field.
    if (wellId != null && actorId != null) {
      this._boundedSet(this.recentSingularityWells, wellId, {
        actorId,
        victimId,
        tick,
      }, HISTORY_MAP_MAX);
    }
  }

  _handleCollisionConsequence(receipt, tricks) {
    if (receipt == null || typeof receipt !== 'object') return;
    const tick = nonNegative(receipt.tick, this.tick);
    const targetId = receipt.targetId;
    const otherId = receipt.otherId;
    const surface = receipt.surface;
    const deltaV = finite(receipt.deltaV, 0);
    const exchangedMomentum = finite(receipt.exchangedMomentum, 0);
    const provenance = receipt.provenance || {};
    const actorId = provenance.actorId;
    const weaponId = String(provenance.weaponId || '');
    const tag = String(provenance.tag || '');

    // Record bounce for possible Bank Shot
    if ((surface === 'terrain' || surface === 'structure') && deltaV > 0 && targetId != null) {
      const bounceImpulse = this.recentImpulses.get(targetId);
      const bounceRelease = this.recentTetherReleases.get(targetId);
      const prior = (bounceImpulse && tick - bounceImpulse.tick >= 0
        && tick - bounceImpulse.tick <= STUNT_CONSTANTS.IMPULSE_WINDOW_TICKS) ? bounceImpulse
        : (bounceRelease && tick - bounceRelease.tick >= 0
          && tick - bounceRelease.tick <= STUNT_CONSTANTS.SLING_WINDOW_TICKS) ? bounceRelease
        : null;
      if (prior && this._isPlayer(prior.actorId)) {
        this._boundedSet(this.recentBounces, targetId, {
          actorId: prior.actorId,
          surfaceId: otherId,
          surfaceType: surface,
          tick,
          pos: receipt.pos,
        }, HISTORY_MAP_MAX);
      }
    }

    if (receipt.targetHostile !== true || receipt.damageApplied !== true) return;
    if (receipt.targetKilled !== true
      && !(receipt.hullDamage >= 0.25 * receipt.targetHullMax
        && receipt.targetHullMax > 0
        && receipt.helmLossSeconds >= 1)) return;
    const consequence = {
      victimId: targetId,
      killed: receipt.targetKilled === true,
      hullDamage: receipt.hullDamage,
      hullMax: receipt.targetHullMax,
      helmLossSeconds: finite(receipt.helmLossSeconds, 0),
    };
    const outcome = {
      deltaV,
      exchangedMomentum,
      targetType: receipt.targetType,
      otherType: receipt.otherType,
      targetMass: receipt.targetMass,
      otherMass: receipt.otherMass,
    };

    if (receipt.targetKilled === true && this.playerId != null) {
      const activeTow = this.activeTethers.get(this.playerId);
      if (activeTow && activeTow.targetId === targetId) {
        const towImpulse = this.recentImpulses.get(targetId);
        const towRelease = this.recentTetherReleases.get(targetId);
        const playerCaused = this._isPlayer(actorId)
          || (towImpulse && this._isPlayer(towImpulse.actorId))
          || (towRelease && this._isPlayer(towRelease.actorId));
        if (playerCaused) {
          tricks.push(this._createTrick('tow_kill', {
            actorId: this.playerId,
            targetId,
            secondaryIds: [activeTow.targetId],
            metrics: { ...outcome, towTargetId: activeTow.targetId },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'active_tow', entityId: this.playerId, targetId: activeTow.targetId, detail: 'player maintained towing haul at combat speed' },
              { step: 2, type: 'tow_destruction', entityId: activeTow.targetId, targetId, detail: 'trailing towed mass eliminated hostile' },
            ],
          }));
        }
      }
    }

    // 1. Rock Discovery detection:
    // A craft with prior player impulse slams into terrain/rock
    if (surface === 'terrain' || surface === 'structure') {
      const priorImpulse = this.recentImpulses.get(targetId);
      const priorRelease = this.recentTetherReleases.get(targetId);
      const isPlayerVictim = this._isPlayer(targetId);

      // Ordinary flight bumps by the player NEVER trigger rock discovery
      if (!isPlayerVictim) {
        const causedByPlayer = (priorImpulse && this._isPlayer(priorImpulse.actorId))
          || (priorRelease && this._isPlayer(priorRelease.actorId))
          || this._isPlayer(actorId);

        if (causedByPlayer && deltaV >= STUNT_CONSTANTS.MIN_ROCK_DISCOVERY_DELTA_V) {
          const initiator = (priorImpulse && priorImpulse.actorId)
            || (priorRelease && priorRelease.actorId)
            || actorId;

          tricks.push(this._createTrick('rock_discovery', {
            actorId: initiator,
            targetId,
            secondaryIds: [otherId],
            metrics: { ...outcome },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'kinetic_impulse', entityId: initiator, targetId, detail: 'player imparted heavy momentum' },
              { step: 2, type: 'rock_slam', entityId: targetId, targetId: otherId, detail: `hostile discovered asteroid face at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }
    }

    // 2. Craft vs Craft / Debris collision
    if (surface === 'craft' || surface === 'debris') {
      const priorImpulseTarget = this.recentImpulses.get(targetId);
      const priorImpulseOther = this.recentImpulses.get(otherId);
      const priorReleaseOther = this.recentTetherReleases.get(otherId);

      // A. Bank shot: bounced off wall then hit craft
      const priorBounce = this.recentBounces.get(otherId);
      if (priorBounce && (tick - priorBounce.tick) <= STUNT_CONSTANTS.CHAIN_WINDOW_TICKS) {
        // A wall collision is not evidence of a player throw. Preserve the instigator of
        // the body that actually rebounded; enemy pile-ups must never mint player tricks.
        const initiator = priorBounce.actorId;

        if (this._isPlayer(initiator)) {
          const projectile = otherId;
          const victim = targetId;
          tricks.push(this._createTrick('bank_shot', {
            actorId: initiator,
            targetId: victim,
            secondaryIds: [projectile, priorBounce.surfaceId],
            metrics: { ...outcome },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'sling_throw', entityId: initiator, targetId: projectile, detail: 'player launched projectile at obstacle' },
              { step: 2, type: 'wall_rebound', entityId: projectile, targetId: priorBounce.surfaceId, detail: 'banked off asteroid surface' },
              { step: 3, type: 'rebound_strike', entityId: projectile, targetId: victim, detail: `ricochet struck target at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }

      // B. Shove bowling: concussion shove weapon launched other into target
      const isShove = weaponId.includes('shove') || weaponId.includes('concussion') || tag.includes('shove')
        || (priorImpulseOther && (priorImpulseOther.weaponId.includes('shove') || priorImpulseOther.tag.includes('shove')));

      if (isShove && !this._isPlayer(targetId) && !this._isPlayer(otherId)) {
        const initiator = priorImpulseOther ? priorImpulseOther.actorId : actorId;
        if (this._isPlayer(initiator) && deltaV >= 10) {
          tricks.push(this._createTrick('shove_bowling', {
            actorId: initiator,
            targetId,
            secondaryIds: [otherId],
            metrics: { ...outcome },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'concussion_shove', entityId: initiator, targetId: otherId, detail: 'delivered concussion shove blast' },
              { step: 2, type: 'bowling_strike', entityId: otherId, targetId, detail: `launched hostile bowled into wingman at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }

      // C. Bolas: slung projectile struck target and other
      if (priorReleaseOther && this._isPlayer(priorReleaseOther.actorId)) {
        const priorWhip = this.recentWhips.get(targetId);
        if (priorWhip || (deltaV >= 12 && !this._isPlayer(targetId))) {
          tricks.push(this._createTrick('bolas', {
            actorId: priorReleaseOther.actorId,
            targetId,
            secondaryIds: [otherId],
            metrics: { ...outcome },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'tether_sling', entityId: priorReleaseOther.actorId, targetId: otherId, detail: 'slung rotating body into flight group' },
              { step: 2, type: 'chain_strike', entityId: otherId, targetId, detail: 'entangled consecutive targets in one throw' },
            ],
          }));
        }
      }

      // D. Collateral: an entity hit by player collides with another entity
      const causedByPlayer = (priorImpulseOther && this._isPlayer(priorImpulseOther.actorId))
        || (priorImpulseTarget && this._isPlayer(priorImpulseTarget.actorId))
        || (priorReleaseOther && this._isPlayer(priorReleaseOther.actorId))
        || this._isPlayer(actorId);

      if (causedByPlayer && !this._isPlayer(targetId) && !this._isPlayer(otherId) && deltaV >= 8) {
        const initiator = (priorImpulseOther && priorImpulseOther.actorId)
          || (priorReleaseOther && priorReleaseOther.actorId)
          || (priorImpulseTarget && priorImpulseTarget.actorId)
          || actorId;

        tricks.push(this._createTrick('collateral', {
          actorId: initiator,
          targetId,
          secondaryIds: [otherId],
          metrics: { ...outcome },
          consequence,
          tick,
          causeChain: [
            { step: 1, type: 'primary_action', entityId: initiator, targetId: otherId, detail: 'player engaged primary target' },
            { step: 2, type: 'secondary_collision', entityId: otherId, targetId, detail: `impact propagated into secondary hull (ΔV ${deltaV.toFixed(1)} wu/s)` },
          ],
        }));
      }

      // E. Well Golf: entity flings out of a well into another
      for (const [wellId, wellData] of this.recentSingularityWells.entries()) {
        if ((tick - wellData.tick) <= STUNT_CONSTANTS.CHAIN_WINDOW_TICKS) {
          if (this._isPlayer(wellData.actorId) && (targetId === wellData.victimId || otherId === wellData.victimId)) {
            tricks.push(this._createTrick('well_golf', {
              actorId: wellData.actorId,
              targetId,
              secondaryIds: [otherId, wellId],
              metrics: { ...outcome },
              consequence,
              tick,
              causeChain: [
                { step: 1, type: 'well_deploy', entityId: wellData.actorId, targetId: wellId, detail: 'deployed singularity well' },
                { step: 2, type: 'well_fling', entityId: wellId, targetId: otherId, detail: 'gravity well slingshot accelerated projectile' },
                { step: 3, type: 'target_impact', entityId: otherId, targetId, detail: 'slung body slammed into target' },
              ],
            }));
            break;
          }
        }
      }

      // F. Dead Man's Mass: target or other is a wreck/debris propelled by player that struck active craft
      if (receipt.otherType === 'wreck') {
        const wreckId = otherId;
        const livingTarget = targetId;
        const priorImpulseWreck = this.recentImpulses.get(wreckId);
        const priorReleaseWreck = this.recentTetherReleases.get(wreckId);

        const playerPropelled = (priorImpulseWreck && this._isPlayer(priorImpulseWreck.actorId))
          || (priorReleaseWreck && this._isPlayer(priorReleaseWreck.actorId));

        if (playerPropelled && !this._isPlayer(livingTarget) && deltaV >= 10) {
          const initiator = (priorImpulseWreck && priorImpulseWreck.actorId) || priorReleaseWreck.actorId;
          tricks.push(this._createTrick('dead_mans_mass', {
            actorId: initiator,
            targetId: livingTarget,
            secondaryIds: [wreckId],
            metrics: { ...outcome },
            consequence,
            tick,
            causeChain: [
              { step: 1, type: 'wreck_propulsion', entityId: initiator, targetId: wreckId, detail: 'propelled dead derelict wreck' },
              { step: 2, type: 'derelict_crush', entityId: wreckId, targetId: livingTarget, detail: `dead hull crushed active hostile at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }

      const whip = this.recentWhips.get(targetId);
      const playerTow = this.playerId != null ? this.activeTethers.get(this.playerId) : null;
      const tetheredOther = playerTow != null && playerTow.targetId === otherId;
      if (whip != null && whip.projectileId === otherId
        && tetheredOther && this._isPlayer(whip.actorId)
        && whip.relSpeed >= STUNT_CONSTANTS.MIN_WRECKING_BALL_SPEED) {
        tricks.push(this._createTrick('wrecking_ball', {
          actorId: whip.actorId,
          targetId,
          secondaryIds: [otherId],
          metrics: { ...outcome, relSpeed: whip.relSpeed, mass: whip.mass, momentum: whip.momentum },
          consequence,
          tick,
          causeChain: [
            { step: 1, type: 'tether_whip', entityId: whip.actorId, targetId: otherId, detail: `player whipped heavy mass (${finite(whip.mass, 0).toFixed(0)} t)` },
            { step: 2, type: 'whip_strike', entityId: otherId, targetId, detail: `struck hostile at ${whip.relSpeed.toFixed(1)} wu/s (${finite(whip.momentum, 0).toFixed(0)} kg*m/s)` },
          ],
        }));
      }
    }
  }

  _handleEntityKilled(payload, tricks) {
    if (payload == null || typeof payload !== 'object') return;

    // Tow Kill: victim killed while player is actively towing a mass

    // Clean up cached victim records
  }

  _createTrick(trickId, params = {}) {
    const def = TRICK_DEFINITIONS[trickId] || {
      id: trickId,
      name: trickId,
      rarity: TrickRarity.COMMON,
      baseScore: 100,
      description: 'Stunt performed.',
    };

    return Object.freeze({
      schemaVersion: STUNT_SCHEMA_VERSION,
      trickId: def.id,
      name: def.name,
      rarity: def.rarity,
      baseScore: def.baseScore,
      description: def.description,
      actorId: params.actorId != null ? params.actorId : null,
      targetId: params.targetId != null ? params.targetId : null,
      secondaryIds: Array.isArray(params.secondaryIds) ? Object.freeze([...params.secondaryIds]) : Object.freeze([]),
      metrics: params.metrics && typeof params.metrics === 'object' ? Object.freeze({ ...params.metrics }) : Object.freeze({}),
      consequence: params.consequence && typeof params.consequence === 'object'
        ? Object.freeze({ ...params.consequence })
        : null,
      causeChain: Array.isArray(params.causeChain) ? Object.freeze(params.causeChain.map((step, idx) => Object.freeze({ step: idx + 1, ...step }))) : Object.freeze([]),
      tick: nonNegative(params.tick, this.tick),
    });
  }
}
