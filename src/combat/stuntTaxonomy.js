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

    const tricks = [];

    switch (eventName) {
      case 'tether:attached':
      case 'tether:latch': {
        this._handleTetherAttached(payload, tricks);
        break;
      }
      case 'tether:releaseRated': {
        this._handleTetherReleaseRated(payload, tricks);
        break;
      }
      case 'tether:cut':
      case 'tether:released': {
        this._handleTetherReleased(payload);
        break;
      }
      case 'tether:whipImpact': {
        this._handleWhipImpact(payload, tricks);
        break;
      }
      case 'tether:snapCatch': {
        this._handleSnapCatch(payload, tricks);
        break;
      }
      case 'combat:hitstunImpulse':
      case 'weapon:shove': {
        this._handleWeaponImpulse(payload, tricks);
        break;
      }
      case 'combat:collisionConsequence': {
        this._handleCollisionConsequence(payload, tricks);
        break;
      }
      case 'entity:killed':
      case 'combat:kill': {
        this._handleEntityKilled(payload, tricks);
        break;
      }
      case 'flight:nearMiss': {
        this._handleNearMiss(payload, tricks);
        break;
      }
      case 'well:capture':
      case 'well:fling': {
        this._handleWellEvent(payload, tricks);
        break;
      }
      case 'massline:sweepImpact':
      case 'massline:clothesline': {
        this._handleClotheslineEvent(payload, tricks);
        break;
      }
      default:
        break;
    }

    if (tricks.length > 0) {
      for (const trick of tricks) {
        this.detectedTricks.push(trick);
      }
    }

    return tricks;
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
  }

  _isPlayer(id) {
    if (id == null) return false;
    if (this.playerId != null) return id === this.playerId;
    return id === 'player' || id === 'player_ship' || id === 0;
  }

  _handleTetherAttached(payload, tricks) {
    const sourceId = payload.sourceId || payload.playerId || (payload.data && payload.data.sourceId);
    const targetId = payload.targetId || (payload.data && payload.data.targetId);
    const relSpeed = finite(payload.relSpeed || (payload.data && payload.data.relSpeed), 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (sourceId != null && targetId != null) {
      const isTow = payload.isTow === true || payload.mode === 'tow' || payload.mode === 'frame_coupler';
      this.activeTethers.set(sourceId, {
        targetId,
        attachedTick: tick,
        restLength: finite(payload.restLength, 20),
        isTow,
      });

      // Snap catch detection on attach
      if (this._isPlayer(sourceId) && relSpeed >= STUNT_CONSTANTS.SNAP_CATCH_MIN_SPEED) {
        tricks.push(this._createTrick('snap_catch', {
          actorId: sourceId,
          targetId,
          metrics: { relSpeed },
          tick,
          causeChain: [
            { step: 1, type: 'incoming_fast_mass', entityId: null, targetId, detail: `body moving at ${relSpeed.toFixed(1)} wu/s` },
            { step: 2, type: 'reaction_latch', entityId: sourceId, targetId, detail: 'tether latched and arrested kinetic energy on pass' },
          ],
        }));
      }
    }
  }

  _handleSnapCatch(payload, tricks) {
    const sourceId = payload.sourceId || payload.playerId || this.playerId;
    const targetId = payload.targetId;
    const relSpeed = finite(payload.relSpeed || payload.speed, 30);
    const tick = nonNegative(payload.tick, this.tick);

    if (this._isPlayer(sourceId) && targetId != null) {
      tricks.push(this._createTrick('snap_catch', {
        actorId: sourceId,
        targetId,
        metrics: { relSpeed },
        tick,
        causeChain: [
          { step: 1, type: 'incoming_fast_mass', entityId: null, targetId, detail: `body approaching at ${relSpeed.toFixed(1)} wu/s` },
          { step: 2, type: 'reaction_latch', entityId: sourceId, targetId, detail: 'instant tether latch arrested kinetic energy' },
        ],
      }));
    }
  }

  _handleTetherReleaseRated(payload, tricks) {
    const sourceId = payload.sourceId || payload.playerId || this.playerId;
    const targetId = payload.targetId;
    const score = finite(payload.releaseScore, 0);
    const classification = payload.classification || (score >= 0.85 ? 'razor' : score >= 0.65 ? 'clean' : 'good');
    const tangentialSpeed = finite(payload.tangentialSpeed, 0);
    const angularSpeed = finite(payload.angularSpeed, 0);
    const tick = nonNegative(payload.tick, this.tick);

    if (targetId != null) {
      this.recentTetherReleases.set(targetId, {
        actorId: sourceId,
        score,
        classification,
        speed: Math.hypot(tangentialSpeed, finite(payload.radialSpeed, 0)),
        tick,
      });
    }

    if (this._isPlayer(sourceId) && classification === 'razor') {
      tricks.push(this._createTrick('razor_release', {
        actorId: sourceId,
        targetId,
        metrics: { releaseScore: score, tangentialSpeed, angularSpeed },
        tick,
        causeChain: [
          { step: 1, type: 'tether_spin', entityId: sourceId, targetId, detail: `wound mass up to ${angularSpeed.toFixed(2)} rad/s` },
          { step: 2, type: 'razor_timing', entityId: sourceId, targetId, detail: `perfect tangent release (rating ${(score * 100).toFixed(0)}%)` },
        ],
      }));
    }
  }

  _handleTetherReleased(payload) {
    const sourceId = payload.sourceId || payload.playerId || this.playerId;
    if (sourceId != null) {
      this.activeTethers.delete(sourceId);
    }
  }

  _handleWhipImpact(payload, tricks) {
    const actorId = payload.sourceId || payload.playerId || this.playerId;
    const projectileId = payload.targetId; // In whipImpact, targetId is the slung mass
    const victimId = payload.victimId;     // and victimId is the body that got struck
    const relSpeed = finite(payload.relSpeed, 0);
    const mass = finite(payload.mass, 20);
    const momentum = finite(payload.momentum, relSpeed * mass);
    const tick = nonNegative(payload.tick, this.tick);

    if (projectileId != null && victimId != null) {
      this.recentWhips.set(victimId, { projectileId, actorId, relSpeed, tick });
    }

    if (this._isPlayer(actorId) && relSpeed >= STUNT_CONSTANTS.MIN_WRECKING_BALL_SPEED) {
      tricks.push(this._createTrick('wrecking_ball', {
        actorId,
        targetId: victimId,
        secondaryIds: [projectileId],
        metrics: { relSpeed, mass, momentum },
        tick,
        causeChain: [
          { step: 1, type: 'tether_whip', entityId: actorId, targetId: projectileId, detail: `player whipped heavy mass (${mass.toFixed(0)} t)` },
          { step: 2, type: 'whip_strike', entityId: projectileId, targetId: victimId, detail: `struck hostile at ${relSpeed.toFixed(1)} wu/s (${momentum.toFixed(0)} kg*m/s)` },
        ],
      }));
    }
  }

  _handleWeaponImpulse(payload, tricks) {
    const actorId = payload.actorId || payload.attackerId || (payload.provenance && payload.provenance.actorId);
    const victimId = payload.victimId || payload.targetId;
    const weaponId = payload.weaponId || (payload.provenance && payload.provenance.weaponId);
    const tag = payload.tag || (payload.provenance && payload.provenance.tag);
    const tick = nonNegative(payload.tick, this.tick);

    if (victimId != null && actorId != null) {
      this.recentImpulses.set(victimId, {
        actorId,
        weaponId: String(weaponId || ''),
        tag: String(tag || ''),
        tick,
        deltaV: finite(payload.deltaV, 0),
      });
    }
  }

  _handleClotheslineEvent(payload, tricks) {
    const actorId = payload.sourceId || payload.playerId || this.playerId;
    const victimId = payload.victimId || payload.targetId;
    const anchorId = payload.anchorId || null;
    const deltaV = finite(payload.deltaV || payload.transverseSpeed, 20);
    const tick = nonNegative(payload.tick, this.tick);

    if (this._isPlayer(actorId) && victimId != null) {
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
    const actorId = payload.actorId || payload.playerId || this.playerId;
    const obstacleId = payload.obstacleId || payload.targetId;
    const speed = finite(payload.speed || payload.playerSpeed, 0);
    const clearance = finite(payload.clearance || payload.distance, 10);
    const tick = nonNegative(payload.tick, this.tick);

    if (
      this._isPlayer(actorId)
      && speed >= STUNT_CONSTANTS.MIN_NEAR_MISS_SPEED
      && clearance <= STUNT_CONSTANTS.MAX_NEAR_MISS_CLEARANCE
    ) {
      // Cooldown per obstacle to prevent spamming near miss every single tick
      const lastTick = this.recentNearMisses.get(obstacleId) || 0;
      if (tick - lastTick >= 60) {
        this.recentNearMisses.set(obstacleId, tick);
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
    const actorId = payload.actorId || payload.playerId || this.playerId;
    const wellId = payload.wellId || payload.sourceId;
    const victimId = payload.targetId || payload.victimId;
    const tick = nonNegative(payload.tick, this.tick);

    if (wellId != null) {
      this.recentSingularityWells.set(wellId, {
        actorId,
        victimId,
        tick,
      });
    }
  }

  _handleCollisionConsequence(receipt, tricks) {
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
            metrics: { deltaV, exchangedMomentum },
            tick,
            causeChain: [
              { step: 1, type: 'kinetic_impulse', entityId: initiator, targetId, detail: 'player imparted heavy momentum' },
              { step: 2, type: 'rock_slam', entityId: targetId, targetId: otherId, detail: `hostile discovered asteroid face at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }

      // Record bounce for possible Bank Shot
      if (deltaV >= 8) {
        this.recentBounces.set(targetId, {
          surfaceId: otherId,
          surfaceType: surface,
          tick,
          pos: receipt.pos,
        });
      }
    }

    // 2. Craft vs Craft / Debris collision
    if (surface === 'craft' || surface === 'debris') {
      const priorImpulseTarget = this.recentImpulses.get(targetId);
      const priorImpulseOther = this.recentImpulses.get(otherId);
      const priorReleaseOther = this.recentTetherReleases.get(otherId);

      // A. Bank shot: bounced off wall then hit craft
      const priorBounce = this.recentBounces.get(otherId) || this.recentBounces.get(targetId);
      if (priorBounce && (tick - priorBounce.tick) <= STUNT_CONSTANTS.CHAIN_WINDOW_TICKS) {
        const initiator = (priorReleaseOther && priorReleaseOther.actorId)
          || (priorImpulseOther && priorImpulseOther.actorId)
          || this.playerId;

        if (this._isPlayer(initiator)) {
          const projectile = priorBounce === this.recentBounces.get(otherId) ? otherId : targetId;
          const victim = projectile === otherId ? targetId : otherId;
          tricks.push(this._createTrick('bank_shot', {
            actorId: initiator,
            targetId: victim,
            secondaryIds: [projectile, priorBounce.surfaceId],
            metrics: { deltaV, exchangedMomentum },
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
            metrics: { deltaV, exchangedMomentum },
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
            metrics: { deltaV, exchangedMomentum },
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
          metrics: { deltaV, exchangedMomentum },
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
              metrics: { deltaV, exchangedMomentum },
              tick,
              causeChain: [
                { step: 1, type: 'well_deploy', entityId: wellData.actorId, targetId: wellId, detail: 'deployed singularity well' },
                { step: 2, type: 'well_fling', entityId: wellId, targetId: otherId, detail: 'gravity well slingshot accelerated projectile' },
                { step: 3, type: 'target_impact', entityId: otherId, targetId, detail: 'slung body slammed into target' },
              ],
            }));
            this.recentSingularityWells.delete(wellId);
            break;
          }
        }
      }

      // F. Dead Man's Mass: target or other is a wreck/debris propelled by player that struck active craft
      if (receipt.surface === 'debris' || receipt.otherType === 'wreck' || receipt.targetType === 'wreck') {
        const wreckId = receipt.otherType === 'wreck' ? otherId : targetId;
        const livingTarget = wreckId === otherId ? targetId : otherId;
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
            metrics: { deltaV, exchangedMomentum },
            tick,
            causeChain: [
              { step: 1, type: 'wreck_propulsion', entityId: initiator, targetId: wreckId, detail: 'propelled dead derelict wreck' },
              { step: 2, type: 'derelict_crush', entityId: wreckId, targetId: livingTarget, detail: `dead hull crushed active hostile at ${deltaV.toFixed(1)} wu/s` },
            ],
          }));
        }
      }
    }
  }

  _handleEntityKilled(payload, tricks) {
    const tick = nonNegative(payload.tick, this.tick);
    const victimId = payload.id || payload.targetId;
    const killerId = payload.killerId;
    const cause = payload.cause || (payload.presentation && payload.presentation.cause);

    // Tow Kill: victim killed while player is actively towing a mass
    if (this._isPlayer(killerId) || (this.playerId != null && killerId === this.playerId)) {
      const activeTow = this.activeTethers.get(killerId);
      if (activeTow && activeTow.targetId != null) {
        tricks.push(this._createTrick('tow_kill', {
          actorId: killerId,
          targetId: victimId,
          secondaryIds: [activeTow.targetId],
          metrics: { towTargetId: activeTow.targetId },
          tick,
          causeChain: [
            { step: 1, type: 'active_tow', entityId: killerId, targetId: activeTow.targetId, detail: 'player maintained towing haul at combat speed' },
            { step: 2, type: 'tow_destruction', entityId: activeTow.targetId, targetId: victimId, detail: 'trailing towed mass eliminated hostile' },
          ],
        }));
      }
    }

    // Clean up cached victim records
    this.recentImpulses.delete(victimId);
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
      actorId: params.actorId != null ? params.actorId : this.playerId,
      targetId: params.targetId != null ? params.targetId : null,
      secondaryIds: Array.isArray(params.secondaryIds) ? Object.freeze([...params.secondaryIds]) : Object.freeze([]),
      metrics: params.metrics && typeof params.metrics === 'object' ? Object.freeze({ ...params.metrics }) : Object.freeze({}),
      causeChain: Array.isArray(params.causeChain) ? Object.freeze(params.causeChain.map((step, idx) => Object.freeze({ step: idx + 1, ...step }))) : Object.freeze([]),
      tick: nonNegative(params.tick, this.tick),
    });
  }
}
