// W03 mine-layer — owns physical mine entities (type 'mine').
//
// Placement intent comes from mine_layer doctrine / shape 325 ambush wiring.
// Proximity damage routes through combat commands (routeDamage / combat:routeDamage),
// never direct hull writes or direct Rapier body mutation. Mines carry hull and are
// shootable (counterplay: destroy before trigger). Telegraph uses cue 'wake_mines'.
//
// Determinism: arm/trigger timers use state.simTime only; no Math.random / wall clock.
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { Masks } from '../core/entity.js';

export const MINE_OWNER_CAP = 6;
export const MINE_ARM_DELAY_S = 2.0;
export const MINE_TRIGGER_RADIUS = 55;
export const MINE_HULL = 28;
export const MINE_BLAST_DAMAGE = 42;
export const MINE_TELEGRAPH_CUE = 'wake_mines';
export const MINE_TYPE = 'mine';

const TRIGGER_TYPES = new Set(['ship', 'drone']);

export const mines = {
  name: 'mines',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this.registry = ctx.registry || null;
    this._scratch = [];
    // Encounter scripts / mine-layer AI place through this helper (no direct entity writes).
    this.helpers.placeMine = (opts) => this.placeMine(opts || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('mines:placeRequest', (p) => this.placeMine(p || {}));
      this.bus.on('sector:exit', () => this.releaseAll('sector_exit'));
      this.bus.on('sector:enter', () => this.releaseAll('sector_enter'));
      this.bus.on('game:new', () => this.releaseAll('new_game'));
      this.bus.on('save:loaded', () => this.releaseAll('save_loaded'));
    }
  },

  /**
   * Place a physical mine. Enforces per-owner caps. Returns the entity or null.
   * @param {{ ownerId: number, pos: {x:number,z:number}, vel?: {x:number,z:number}, team?: number, factionId?: string, armDelayS?: number, triggerRadius?: number, hull?: number, telegraph?: boolean, mineLayerWake?: boolean }} opts
   */
  placeMine(opts = {}) {
    const state = this.state;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    if (!opts.pos || !Number.isFinite(opts.pos.x) || !Number.isFinite(opts.pos.z)) return null;
    const ownerId = opts.ownerId == null ? null : opts.ownerId;
    if (ownerId != null && countOwnerMines(state, ownerId) >= MINE_OWNER_CAP) {
      if (this.bus) this.bus.emit('mines:capReached', { ownerId, cap: MINE_OWNER_CAP });
      return null;
    }

    const now = state.simTime || 0;
    const armDelay = Number.isFinite(opts.armDelayS) ? Math.max(0, opts.armDelayS) : MINE_ARM_DELAY_S;
    const triggerRadius = Number.isFinite(opts.triggerRadius) ? Math.max(0, opts.triggerRadius) : MINE_TRIGGER_RADIUS;
    const hull = Number.isFinite(opts.hull) ? Math.max(1, opts.hull) : MINE_HULL;
    const team = opts.team != null ? opts.team : teamOf(state, ownerId);

    const ent = spawnEntity({
      type: MINE_TYPE,
      pos: { x: opts.pos.x, z: opts.pos.z },
      vel: {
        x: Number.isFinite(opts.vel?.x) ? opts.vel.x : 0,
        z: Number.isFinite(opts.vel?.z) ? opts.vel.z : 0,
      },
      radius: 6,
      mass: 8,
      hull,
      hullMax: hull,
      collides: true,
      // Mines accept projectile sweeps only; their distinct category is owned by physics.js.
      collisionMask: Masks.PROJECTILE,
      // Dynamic so the existing field -> physics impulse membrane can move a wake mine. The
      // projectile material remains a ghost in solver contacts: ships do not shove mines and
      // projectile damage stays authoritative in physics.js's deterministic swept path.
      physicsBody: {
        dynamic: true,
        ccd: false,
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
        // Authored Jackal wake admission only. Render reads the live physics velocity from this
        // entity; the marker never grants a second motion or force authority.
        mineLayerWake: opts.mineLayerWake === true,
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
    const now = state.simTime || 0;
    const list = state.entityList || [];
    for (const mine of list) {
      if (!mine || !mine.alive || mine.type !== MINE_TYPE) continue;
      const data = mine.data || (mine.data = {});
      // Destroyed / hull-depleted mines never trigger (counterplay).
      if (!(mine.hull > 0)) {
        mine.alive = false;
        continue;
      }
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
      if (!victim) continue;
      this._triggerMine(state, mine, data, victim);
    }
  },

  _findTriggerVictim(state, mine, data) {
    const r = Number.isFinite(data.triggerRadius) ? Math.max(0, data.triggerRadius) : MINE_TRIGGER_RADIUS;
    const mx = mine.pos.x;
    const mz = mine.pos.z;
    const ownerId = data.ownerId;
    const team = mine.team;
    let best = null;
    let bestDistance = Infinity;
    const source = (state.entityIndex && state.entityIndex.shipLike) || state.entityList || [];
    for (const e of source) {
      if (!e || !e.alive || e.id === mine.id) continue;
      if (!TRIGGER_TYPES.has(e.type)) continue;
      if (e.id === ownerId) continue;
      if (team != null && e.team != null && e.team === team) continue;
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

  _triggerMine(state, mine, data, victim) {
    data.triggered = true;
    const damage = data.blastDamage || MINE_BLAST_DAMAGE;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'explosive',
      pos: { x: victim.pos.x, z: victim.pos.z },
      source: { kind: 'mine', id: mine.id, weaponId: 'mine_layer' },
    });
    // allowAnyTarget not required for ships; mines themselves use hull via projectile:hit path.
    const request = {
      attackerId: data.ownerId != null ? data.ownerId : mine.id,
      targetId: victim.id,
      packet,
      origin: { kind: 'mine', id: mine.id },
    };
    this._routeDamage(request);
    if (this.bus) {
      this.bus.emit('mines:triggered', {
        mineId: mine.id,
        ownerId: data.ownerId,
        targetId: victim.id,
        damage,
        pos: { x: mine.pos.x, z: mine.pos.z },
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
    if (!state || !state.entityList) return 0;
    let n = 0;
    for (const e of state.entityList) {
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
  for (const e of state.entityList || []) {
    if (!e || !e.alive || e.type !== MINE_TYPE) continue;
    if (e.ownerId === ownerId || (e.data && e.data.ownerId === ownerId)) n++;
  }
  return n;
}

export function listMines(state) {
  const out = [];
  for (const e of (state && state.entityList) || []) {
    if (e && e.alive && e.type === MINE_TYPE) out.push(e);
  }
  return out;
}

function teamOf(state, ownerId) {
  if (ownerId == null || !state || !state.entities) return 1;
  const owner = state.entities.get(ownerId);
  return owner && owner.team != null ? owner.team : 1;
}
