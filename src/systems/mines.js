// W03 mine-layer — owns physical mine entities (type 'mine').
//
// Placement intent comes from mine_layer doctrine / shape 325 ambush wiring.
// Proximity damage routes through combat commands (routeDamage / combat:routeDamage),
// never direct hull writes or direct Rapier body mutation. Mines carry hull and are
// shootable (counterplay: destroy before trigger). Telegraph uses cue 'wake_mines'.
// A Massline throw stamps playerThrown so the mine becomes a grenade against the
// pack that laid it. A mine the pilot's own field is moving turns the same way
// (inf-plow-turn: playerPushed, armed on the spot, the player's credit) — the fence
// the plow shoves into the pack does not stay loyal to the pack that laid it.
//
// inf-mine-strike — the fence answers the throw. A mine is a ghost to the contact solver
// (material 'projectile') and its proximity fuze senses only hulls its IFF admits, so a rock
// the pilot hurled through a fence used to pass straight through it, and so did the pilot's
// throw of the layer's own wingman. SF-041 names "throw a body through" as a fence answer:
// an armed mine now goes off on the mass the pilot hurls into it — a body carrying the
// pilot's fresh thrown-mass cause (the law card's own "you threw what hit them" tags), the
// body on the pilot's line, or the still-witnessed wreck of the pilot's own kill — when that
// body's swept path crosses the mine's contact disc at the throw floor or faster. One blast,
// one victim, exactly as the proximity fuze: the charge is spent on what struck it, the
// pilot's credit. Ambient drift, field piles and NPC throws stay what they were — the fuze
// reads custody, not every bump.
//
// Determinism: arm/trigger timers use state.simTime only; no Math.random / wall clock.
import { scalarHitToDamagePacket, npcCrossfireAdmits } from '../combat/damage.js';
import { readRecentImpulseProvenance } from '../combat/impulseKernel.js';
import { currentChainWreckWitness, isThrownMassTag } from '../combat/killCausality.js';
import { Masks } from '../core/entity.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isSwarmSpecialistRun } from '../data/swarmSpecialists.js';

export const MINE_OWNER_CAP = 6;
export const MINE_ARM_DELAY_S = 2.0;
export const MINE_TRIGGER_RADIUS = 55;
export const MINE_HULL = 28;
export const MINE_BLAST_DAMAGE = 42;
export const MINE_TELEGRAPH_CUE = 'wake_mines';
export const MINE_TYPE = 'mine';
export const MINE_THROW_GRACE_S = 0.5;

// inf-mine-strike. The strike floor is the repo's standing "that was a throw" bar
// (THROW_CREDIT_MIN_SPEED_WU in tumbleStates): a set-down below it is not a strike.
export const MINE_STRIKE_MIN_SPEED = 25;
/** Gather radius around a mine: a large rock's own radius plus one fixed step of travel. */
export const MINE_STRIKE_QUERY_WU = 140;
/** Sim seconds between strike band lines — one throw that clears a fence says it once. */
export const MINE_STRIKE_LINE_GAP_S = 6;
/**
 * Bodies that can be hurled into a fence: rock, hulk and hull — never a mine itself. Cargo
 * (payload/pod) is deliberately not a striker: a pod's damage is a cargo-loss and law event
 * its own recovery owners keep, and a strike fuze must not fabricate one.
 */
const STRIKE_TYPES = new Set(['asteroid', 'wreck', 'ship', 'drone']);
const STRIKE_LINES = Object.freeze({
  throw: 'Your throw set off that mine',
  line: 'The mass on your line set off that mine',
  wreck: 'The wreck you made set off that mine',
});

// SF-041 (PB-ORD-C) — the wake-corridor law: a seeded fence hugs ONE flank of the approach
// line, leaving the opposite flank an open, readable safe lane. Solutions are physical:
// thread the open flank, displace the fence with a field/blast, or throw a body through.
// Pure geometry from the two endpoints — no rng, so browser/Electron/probes seed the same
// corridor from the same standoff.
export const MINE_CORRIDOR_COUNT = 3;
export const MINE_CORRIDOR_FLANK_WU = 56;   // first hull's lateral offset: its trigger disc
                                            // (55 wu) just kisses the approach centreline
export const MINE_CORRIDOR_RISE_WU = 46;    // each next hull steps further across (overlapping
                                            // discs: the hugged flank is a wall, not a sieve)

/**
 * Seed positions for one corridor fence between two endpoints (e.g. jackal → player approach).
 * Deterministic in the endpoints; the caller places each through the ordinary placeMine law.
 * @returns {Array<{x:number,z:number}>}
 */
export function mineCorridorLayout(fromPos, toPos, count = MINE_CORRIDOR_COUNT) {
  if (!fromPos || !toPos || !(count > 0)) return [];
  const dx = (toPos.x || 0) - (fromPos.x || 0);
  const dz = (toPos.z || 0) - (fromPos.z || 0);
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux; // perpendicular: the flank the fence hugs
  const depth0 = 80, depthStep = 70; // strung along the approach, as the wake always was
  const out = [];
  for (let i = 0; i < count; i++) {
    const along = depth0 + i * depthStep;
    const side = MINE_CORRIDOR_FLANK_WU + i * MINE_CORRIDOR_RISE_WU;
    out.push({
      x: (fromPos.x || 0) + ux * along + px * side,
      z: (fromPos.z || 0) + uz * along + pz * side,
    });
  }
  return out;
}

const TRIGGER_TYPES = new Set(['ship', 'drone']);

export const mines = {
  name: 'mines',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this.registry = ctx.registry || null;
    this._scratch = [];
    this._strikeScratch = [];
    this._strikeLineAt = null;
    // Encounter scripts / mine-layer AI place through this helper (no direct entity writes).
    this.helpers.placeMine = (opts) => this.placeMine(opts || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('mines:placeRequest', (p) => this.placeMine(p || {}));
      this.bus.on('massline:throw', (p) => this._onThrown(p || {}));
      this.bus.on('sector:exit', () => this.releaseAll('sector_exit'));
      this.bus.on('sector:enter', () => this.releaseAll('sector_enter'));
      this.bus.on('game:new', () => this.releaseAll('new_game'));
      this.bus.on('save:loaded', () => this.releaseAll('save_loaded'));
      this.bus.on('run:waveCleared', () => this.releaseSwarmSpecialistMines('wave_cleared'));
      this.bus.on('run:ended', () => this.releaseSwarmSpecialistMines('run_ended'));
    }
  },

  /**
   * Place a physical mine. Enforces per-owner caps. Returns the entity or null.
   * VERB-32: a mine dropped at speed keeps the deploying ship's velocity at the
   * deploy tick, so laying a screen at cruise works. Explicit `opts.vel`
   * overrides; otherwise the owner's current velocity vector is copied.
   * @param {{ ownerId?: number|null, pos: {x:number,z:number}, vel?: {x:number,z:number}, team?: number, factionId?: string, armDelayS?: number, triggerRadius?: number, hull?: number, telegraph?: boolean }} opts
   */
  placeMine(opts = {}) {
    const state = this.state;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    if (!opts.pos || !Number.isFinite(opts.pos.x) || !Number.isFinite(opts.pos.z)) return null;
    // Omitted ownership keeps the legacy player-placement intent. An explicit
    // null is environmental ordnance and must never invent player kill credit.
    const ownerId = opts.ownerId === null ? null
      : opts.ownerId != null ? opts.ownerId : (state && state.playerId != null ? state.playerId : null);
    if (ownerId != null && countOwnerMines(state, ownerId) >= MINE_OWNER_CAP) {
      if (this.bus) this.bus.emit('mines:capReached', { ownerId, cap: MINE_OWNER_CAP });
      // FIGHT-07 — the player's refused press speaks through the voice floor and names the
      // count; an NPC layer hitting its own cap stays silent (its verbs are not the player's UI).
      if (ownerId === state.playerId && this.bus) {
        this.bus.emit('voice:say', {
          channel: 'alert',
          id: 'mine-cap',
          text: `Mine bay full — ${MINE_OWNER_CAP} already deployed`,
          ttl: 2.5,
        });
      }
      return null;
    }

    const now = state.simTime || 0;
    const armDelay = Number.isFinite(opts.armDelayS) ? Math.max(0, opts.armDelayS) : MINE_ARM_DELAY_S;
    const triggerRadius = Number.isFinite(opts.triggerRadius) ? Math.max(0, opts.triggerRadius) : MINE_TRIGGER_RADIUS;
    const hull = Number.isFinite(opts.hull) ? Math.max(1, opts.hull) : MINE_HULL;
    const team = opts.team != null ? opts.team : teamOf(state, ownerId);
    const deployVel = resolveDeployVelocity(opts, state, ownerId);

    const ent = spawnEntity({
      type: MINE_TYPE,
      pos: { x: opts.pos.x, z: opts.pos.z },
      vel: { x: deployVel.x, z: deployVel.z },
      radius: 6,
      mass: 8,
      hull,
      hullMax: hull,
      collides: true,
      // Rapier solver contacts stay projectile-sweep plus ship hulls so a thrown mine is a
      // grenade, not scenery. Parked mines still arm on simTime; Massline latch is explicit.
      collisionMask: Masks.SHIP | Masks.PROJECTILE,
      physicsBody: {
        dynamic: true,
        ccd: true,
        material: 'projectile',
      },
      team,
      ownerId,
      factionId: opts.factionId || null,
      data: {
        kind: 'mine',
        mine: true,
        ownerId,
        armedAt: now + armDelay,
        armed: armDelay <= 0,
        triggerRadius,
        blastDamage: Number.isFinite(opts.blastDamage) ? opts.blastDamage : MINE_BLAST_DAMAGE,
        placedAt: now,
        sectorId: state.world && state.world.currentSectorId || null,
        triggered: false,
        masslineTetherable: true,
        ...(opts.swarmSpecialistMine === true && isSwarmSpecialistRun(state) ? {
          swarmSpecialistMine: true,
          swarmWave: Number.isInteger(opts.swarmWave) ? opts.swarmWave : state.run?.wave ?? null,
          expiresAt: now + (Number.isFinite(opts.lifetimeS) ? Math.max(0, opts.lifetimeS) : 12),
        } : {}),
      },
    });
    if (!ent) return null;

    if (opts.telegraph !== false && this.bus) {
      this.bus.emit('ai:telegraph', {
        entityId: ownerId,
        mineId: ent.id,
        kind: MINE_TELEGRAPH_CUE,
        cue: MINE_TELEGRAPH_CUE,
        pos: { x: ent.pos.x, z: ent.pos.z },
        tick: state.tick | 0,
      });
      this.bus.emit('mines:placed', {
        mineId: ent.id,
        ownerId,
        pos: { x: ent.pos.x, z: ent.pos.z },
        armedAt: ent.data.armedAt,
        cue: MINE_TELEGRAPH_CUE,
      });
    }
    return ent;
  },

  update(_dt, state) {
    if (state.mode !== 'flight') return;
    const list = liveMineList(state);
    if (!list.length) return;
    const now = state.simTime || 0;
    const stepS = Number.isFinite(_dt) && _dt > 0 ? _dt : 1 / 60;
    for (const mine of list) {
      if (!mine || !mine.alive || mine.type !== MINE_TYPE) continue;
      const data = mine.data || (mine.data = {});
      if (data.swarmSpecialistMine === true && Number.isFinite(data.expiresAt) && now >= data.expiresAt) {
        mine.alive = false;
        if (this.bus) this.bus.emit('mines:expired', { mineId: mine.id, ownerId: data.ownerId, reason: 'specialist_lifetime' });
        continue;
      }
      // Destroyed / hull-depleted mines never trigger (counterplay).
      if (!(mine.hull > 0)) {
        mine.alive = false;
        continue;
      }
      // The pilot's field may turn this mine before anything else reads its allegiance.
      this._turnPlayerPushedMine(state, mine, data, now);
      if (!data.armed) {
        if (now >= (data.armedAt || 0)) {
          data.armed = true;
          if (this.bus) this.bus.emit('mines:armed', { mineId: mine.id, ownerId: data.ownerId });
        } else {
          continue;
        }
      }
      if (data.triggered) continue;
      const victim = this._findTriggerVictim(state, mine, data);
      if (victim) {
        this._triggerMine(state, mine, data, victim);
        continue;
      }
      // The proximity fuze senses hulls its IFF admits; the strike fuze answers mass the
      // pilot hurled into the mine itself (inf-mine-strike).
      const strike = this._findStrikingMass(state, mine, stepS);
      if (strike) this._strikeMine(state, mine, data, strike);
    }
  },

  /**
   * inf-plow-turn — the fence law's other half. The wake-corridor counterplay names
   * "displace the fence with a field/blast" as a physical solution; the Massline throw
   * already honors that custody (playerThrown → the mine trips on anyone and pays the
   * player's credit). A mine the PILOT'S OWN FIELD is moving now turns the same way: the
   * fields owner vouches for whose accepted force moved this body this tick, and when that
   * force is the player's, the mine becomes the player's grenade — stamped, armed on the
   * spot, one band line so the turn is readable. An NPC's field never turns an NPC's mine
   * against its own pack.
   */
  _turnPlayerPushedMine(state, mine, data, now) {
    if (data.playerThrown === true || data.playerPushed === true) return;
    const playerId = state.playerId;
    if (playerId == null || data.ownerId === playerId) return;
    const fieldsSys = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields') : null;
    if (!fieldsSys || typeof fieldsSys.readAcceptedFieldOwnerIds !== 'function') return;
    const owners = fieldsSys.readAcceptedFieldOwnerIds(mine);
    if (!owners || !owners.some((owner) => String(owner) === String(playerId))) return;
    data.playerPushed = true;
    data.pushedAt = now;
    data.pushedBy = playerId;
    if (!data.armed) {
      data.armed = true;
      data.armedAt = now;
      if (this.bus) this.bus.emit('mines:armed', { mineId: mine.id, ownerId: data.ownerId, pushed: true });
    }
    if (this.bus) {
      this.bus.emit('mines:turned', {
        mineId: mine.id,
        ownerId: data.ownerId,
        pushedBy: playerId,
        pos: { x: mine.pos.x, z: mine.pos.z },
      });
      if (!data.turnTold) {
        data.turnTold = true;
        this.bus.emit('voice:say', {
          channel: 'alert',
          id: 'mine-turned',
          text: 'Your field turned that mine — it trips on anyone now',
          ttl: 2.5,
        });
      }
    }
  },


  _onThrown(payload) {
    const id = payload && payload.payloadId;
    if (id == null || !this.state || !this.state.entities) return;
    const mine = this.state.entities.get(id);
    if (!mine || mine.alive === false || mine.type !== MINE_TYPE) return;
    const data = mine.data || (mine.data = {});
    const now = this.state.simTime || 0;
    data.playerThrown = true;
    data.thrownAt = now;
    data.thrownBy = this.state.playerId;
    data.masslineTetherable = true;
    mine.collisionMask = Masks.SHIP | Masks.PROJECTILE;
    mine.physicsBody = {
      ...(mine.physicsBody && typeof mine.physicsBody === 'object' ? mine.physicsBody : {}),
      dynamic: true,
      ccd: true,
      material: 'projectile',
    };
    if (!data.armed) {
      data.armed = true;
      data.armedAt = now;
      if (this.bus) this.bus.emit('mines:armed', { mineId: mine.id, ownerId: data.ownerId, thrown: true });
    }
  },

  releaseSwarmSpecialistMines(reason = 'release') {
    const state = this.state;
    if (!state) return 0;
    let count = 0;
    for (const mine of liveMineList(state)) {
      if (!mine || mine.alive !== true || mine.type !== MINE_TYPE
        || mine.data?.swarmSpecialistMine !== true) continue;
      mine.alive = false;
      count++;
    }
    if (count && this.bus) this.bus.emit('mines:released', { count, reason, swarmSpecialist: true });
    return count;
  },

  _findTriggerVictim(state, mine, data) {
    const r = Number.isFinite(data.triggerRadius) ? Math.max(0, data.triggerRadius) : MINE_TRIGGER_RADIUS;
    const mx = mine.pos.x;
    const mz = mine.pos.z;
    const ownerId = data.ownerId;
    const team = mine.team;
    // Player custody (inf-plow-turn): a thrown OR field-turned mine trips on any hull — the
    // short grace is the only kindness the pilot's own hull gets — while a mine still loyal
    // to its layer keeps the owner/team IFF and the crossfire admission below.
    const playerOrdnance = data.playerThrown === true || data.playerPushed === true;
    const now = state.simTime || 0;
    const grace = playerOrdnance
      && (now - (Number(data.playerThrown === true ? data.thrownAt : data.pushedAt) || 0)) < MINE_THROW_GRACE_S;
    const playerId = state.playerId;
    let best = null;
    let bestDistance = Infinity;
    const source = (state.entityIndex && state.entityIndex.shipLike) || state.entityList || [];
    for (const e of source) {
      if (!e || !e.alive || e.id === mine.id) continue;
      if (!TRIGGER_TYPES.has(e.type)) continue;
      if (playerOrdnance) {
        if (grace && e.id === playerId) continue;
      } else {
        if (e.id === ownerId) continue;
        // Pirate ordnance has IFF only as honest as its owner: a reckless owner's mine trips on a
        // same-team hull (the crossfire admission owns the lawful/civilian/player exclusions); a
        // disciplined owner's mine still ignores teammates.
        if (team != null && e.team != null && e.team === team) {
          const owner = ownerId != null && state.entities && typeof state.entities.get === 'function'
            ? state.entities.get(ownerId) : null;
          if (!npcCrossfireAdmits(state, owner, e, { kind: 'mine', id: mine.id })) continue;
        }
      }
      const dx = e.pos.x - mx;
      const dz = e.pos.z - mz;
      // Math.hypot scales before squaring, so finite 1e308-class coordinates retain
      // an ordered at/beyond comparison instead of collapsing both sides to Infinity.
      const distance = Math.hypot(dx, dz);
      if (distance > r) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = e;
      }
    }
    return best;
  },

  /**
   * inf-mine-strike — the mass the pilot hurled into this mine during the last step, or null.
   * A strike is physical contact, not proximity: the body's swept path RELATIVE to the mine
   * (the last fixed step of both motions) must cross the mine's contact disc, at the throw
   * floor or faster. Custody is read from the owners that already keep it: the body's fresh
   * impulse record naming the pilot with a thrown-mass tag, the pilot's tether target, or the
   * chain witness the aftermath owner binds to the wreck of the pilot's own kill. The pilot's
   * hull never strike-fuzes — the proximity law and the custody grace govern the pilot. Ties
   * break on the closest approach, then the stable id, so the same step answers the same way.
   */
  _findStrikingMass(state, mine, stepS) {
    const playerId = state.playerId;
    if (playerId == null || !mine.pos) return null;
    const mx = mine.pos.x;
    const mz = mine.pos.z;
    const mvx = finiteOr(mine.vel && mine.vel.x, 0);
    const mvz = finiteOr(mine.vel && mine.vel.z, 0);
    const mineRadius = Number.isFinite(mine.radius) && mine.radius > 0 ? mine.radius : 6;
    const scratch = this._strikeScratch || (this._strikeScratch = []);
    const candidates = queryNearbyEntities(state, mine.pos, MINE_STRIKE_QUERY_WU, scratch);
    let best = null;
    let bestGap = Infinity;
    let bestSpeed = 0;
    let bestCustody = null;
    for (let i = 0; i < candidates.length; i++) {
      const body = candidates[i];
      if (!body || body.alive === false || body === mine || body.id === mine.id || !body.pos) continue;
      if (!STRIKE_TYPES.has(body.type) || body.id === playerId) continue;
      const rvx = finiteOr(body.vel && body.vel.x, 0) - mvx;
      const rvz = finiteOr(body.vel && body.vel.z, 0) - mvz;
      const speed = Math.hypot(rvx, rvz);
      if (!(speed >= MINE_STRIKE_MIN_SPEED)) continue;
      const ex = body.pos.x - mx;
      const ez = body.pos.z - mz;
      const gap = segmentGapToOrigin(ex - rvx * stepS, ez - rvz * stepS, ex, ez);
      if (!(gap <= mineRadius + strikeBodyRadius(body))) continue;
      if (best && (gap > bestGap || (gap === bestGap && compareStableIds(body.id, best.id) >= 0))) continue;
      const custody = strikeCustody(state, body, playerId);
      if (!custody) continue;
      best = body;
      bestGap = gap;
      bestSpeed = speed;
      bestCustody = custody;
    }
    scratch.length = 0;
    return best ? { body: best, custody: bestCustody, speed: bestSpeed } : null;
  },

  /** The mine goes off on what struck it — the ordinary trigger receipts, the pilot's credit. */
  _strikeMine(state, mine, data, strike) {
    const body = strike.body;
    if (this.bus) {
      this.bus.emit('mines:struck', {
        mineId: mine.id,
        ownerId: data.ownerId,
        bodyId: body.id,
        bodyType: body.type,
        custody: strike.custody,
        speed: strike.speed,
        pos: { x: mine.pos.x, z: mine.pos.z },
      });
    }
    this._triggerMine(state, mine, data, body, { attackerId: state.playerId, struck: true });
    this._tellStrike(state, strike.custody);
  },

  /** One band line per throw: a single cast that clears a fence says so once, not per mine. */
  _tellStrike(state, custody) {
    if (!this.bus) return;
    const text = STRIKE_LINES[custody];
    if (!text) return;
    const now = state.simTime || 0;
    const last = this._strikeLineAt;
    if (Number.isFinite(last) && now >= last && now - last < MINE_STRIKE_LINE_GAP_S) return;
    this._strikeLineAt = now;
    this.bus.emit('voice:say', { channel: 'alert', id: 'mine-struck', text, ttl: 2.5 });
  },

  _triggerMine(state, mine, data, victim, opts = null) {
    data.triggered = true;
    const struck = !!(opts && opts.struck);
    const damage = data.blastDamage || MINE_BLAST_DAMAGE;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'explosive',
      pos: { x: victim.pos.x, z: victim.pos.z },
      source: { kind: 'mine', id: mine.id, weaponId: 'mine_layer' },
    });
    // allowAnyTarget not required for ships; mines themselves use hull via projectile:hit path.
    const request = {
      // A mine in the player's custody (thrown or field-turned) pays the player's credit;
      // a loyal one stays its layer's ordnance. A strike names its own attacker: the pilot
      // whose hurled mass set the charge off.
      attackerId: opts && opts.attackerId != null ? opts.attackerId
        : (data.playerThrown === true || data.playerPushed === true) ? state.playerId
          : data.ownerId != null ? data.ownerId : mine.id,
      targetId: victim.id,
      packet,
      origin: { kind: 'mine', id: mine.id },
    };
    const pos = { x: mine.pos.x, z: mine.pos.z };
    if (this.bus) {
      // The snap is the first receipt. Detonation follows on this same tick —
      // the fuse length does not change.
      this.bus.emit('mines:triggered', {
        mineId: mine.id,
        ownerId: data.ownerId,
        targetId: victim.id,
        damage,
        pos,
        ...(struck ? { struck: true } : null),
      });
    }
    this._routeDamage(request);
    if (this.bus) {
      this.bus.emit('mines:detonated', {
        mineId: mine.id,
        ownerId: data.ownerId,
        targetId: victim.id,
        damage,
        pos,
        ...(struck ? { struck: true } : null),
      });
    }
    mine.alive = false;
  },

  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') {
      return helpers.routeCombatDamage(request);
    }
    const combatSys = this.registry && this.registry.get && this.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') {
      return combatSys.ensureKernel().routeDamage(request);
    }
    if (this.bus) this.bus.emit('combat:routeDamage', request);
    return null;
  },

  /** Release mines on sector exit / lifecycle (ownership lifecycle). */
  releaseAll(reason = 'release') {
    const state = this.state;
    if (!state) return 0;
    this._strikeLineAt = null;
    const list = liveMineList(state);
    let n = 0;
    for (const e of list) {
      if (!e || !e.alive || e.type !== MINE_TYPE) continue;
      e.alive = false;
      n++;
    }
    if (n && this.bus) this.bus.emit('mines:released', { count: n, reason });
    return n;
  },
};

export function countOwnerMines(state, ownerId) {
  if (!state || ownerId == null) return 0;
  let n = 0;
  for (const e of liveMineList(state)) {
    if (!e || !e.alive || e.type !== MINE_TYPE) continue;
    if (e.ownerId === ownerId || (e.data && e.data.ownerId === ownerId)) n++;
  }
  return n;
}

/**
 * FIGHT-11 — the screen the layer laid, as the halo counts it: live hulls only,
 * armed only. An unarmed mine is cargo in transit (still arming), not a threat the
 * halo can count; a spent hull (triggered / dead / hull-depleted) has left the screen.
 */
export function countArmedOwnerMines(state, ownerId) {
  if (!state || ownerId == null) return 0;
  let n = 0;
  for (const e of liveMineList(state)) {
    if (!e || e.alive !== true || e.type !== MINE_TYPE) continue;
    if (!(e.hull > 0)) continue;
    const data = e.data || {};
    if (e.ownerId !== ownerId && data.ownerId !== ownerId) continue;
    if (data.triggered === true) continue;
    if (data.armed !== true) continue;
    n++;
  }
  return n;
}

export function listMines(state) {
  const out = [];
  for (const e of liveMineList(state)) {
    if (e && e.alive && e.type === MINE_TYPE) out.push(e);
  }
  return out;
}

function liveMineList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.mines)) return index.mines;
  return (state && state.entityList) || [];
}

function teamOf(state, ownerId) {
  if (ownerId == null || !state || !state.entities) return 1;
  const owner = state.entities.get(ownerId);
  return owner && owner.team != null ? owner.team : 1;
}

// ── inf-mine-strike helpers ─────────────────────────────────────────────────────────────────

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** Distance from the origin to the segment A→B (the relative path of one fixed step). */
function segmentGapToOrigin(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-12 ? -(ax * dx + az * dz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(ax + dx * t, az + dz * t);
}

function strikeBodyRadius(body) {
  return Number.isFinite(body && body.radius) && body.radius > 0 ? body.radius : 0;
}

function compareStableIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Whose hurled mass this body is, in the owners' own words — or null. 'line': the pilot's
 * tether holds it now (the whip on the line). 'throw': its freshest impulse record names the
 * pilot with a thrown-mass tag (the release, the sling cut, the whip it struck, the hull a
 * thrown hull knocked loose). 'wreck': the aftermath owner still binds the pilot's own kill to
 * this exact wreck life. Anything else — drift, a field pile, an NPC throw — is not custody.
 */
function strikeCustody(state, body, playerId) {
  const tether = state.player && state.player.tether;
  if (tether && tether.active === true && tether.targetId != null
    && String(tether.targetId) === String(body.id)) return 'line';
  const tick = Number.isFinite(state.tick) ? state.tick | 0 : 0;
  const record = readRecentImpulseProvenance(body, tick);
  if (record && record.actorId === playerId && isThrownMassTag(record.tag)) return 'throw';
  if (body.type === 'wreck' && currentChainWreckWitness(state, body)) return 'wreck';
  return null;
}

// VERB-32 — mine spawn velocity is the deploying ship's velocity vector at the
// deploy tick. Explicit opts.vel wins; otherwise copy the owner's live vel.
// Anything non-finite falls back to rest. Values are copied, never aliased.
function resolveDeployVelocity(opts, state, ownerId) {
  const fromOpts = opts && opts.vel;
  if (fromOpts && Number.isFinite(fromOpts.x) && Number.isFinite(fromOpts.z)) {
    return { x: fromOpts.x, z: fromOpts.z };
  }
  const owner = ownerId != null && state && state.entities
    ? state.entities.get(ownerId)
    : null;
  const ov = owner && owner.vel;
  if (ov && Number.isFinite(ov.x) && Number.isFinite(ov.z)) {
    return { x: ov.x, z: ov.z };
  }
  return { x: 0, z: 0 };
}
