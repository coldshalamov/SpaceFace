/**
 * Multi-ship production thruster fleet (VP-220).
 *
 * One ContinuousPlumeSystem per live engine family (fixed, not per-entity).
 * Ships are assigned into a **growable** ship table sized from live demand;
 * only candidates past the sanity ceiling fall back to legacy streaks.
 * No render-time sim recomputation.
 *
 * ## Why the ship table grows
 *
 * The original table was a fixed `new Array(10)` from the VP-220 prototype
 * checkpoint (`343f0d7c`), which cited no measurement. Ship eleven silently
 * lost its plume — no error, no warning, no saturation visible to the player.
 * Ten was an allocation strategy that got read as a design cap, and it was the
 * hard blocker on swarm framing (a web that lashes eight ships into a knot
 * plus escorts is trivially past ten).
 *
 * Growth follows the capacity-migration idiom `vfx.js:_syncParticleQuality`
 * uses for the particle SoA: allocate a sane initial size, migrate by doubling
 * when demand exceeds it, keep the surrounding objects and subscriptions
 * stable, and stop at a stated ceiling. Growth is **out of band** — it happens
 * on a high-water mark, at most `log2(ceiling / initial)` times per family per
 * session, and never on the steady-state per-frame write path. It is reported
 * honestly in `frameAllocations` and `capacityGrowths` so a regression that
 * churns capacity every frame is still measurable.
 */

import { ContinuousPlumeSystem } from './continuousPlume.js';
import { RcsImpulseSystem } from './rcsImpulse.js';
import {
  listThrusterRecipePacks,
  resolveThrusterRecipes,
  LIVE_ENGINE_PROFILE_IDS,
} from '../recipes/registry.js';

/**
 * Ship slots allocated up front. Sized so the ordinary encounter (player plus a
 * handful of NPCs) never triggers a migration — the same number the fixed table
 * used, so allocation churn is unchanged for every case that used to fit.
 */
export const FLEET_INITIAL_SHIPS = 10;
/**
 * Sanity ceiling on simultaneous production ships (player + NPCs). Not a design
 * statement about how many ships may exist — it is the point past which the
 * fleet stops growing and reports `saturated` so overflow is visible rather
 * than silent. Sized to cover a swarm-tier encounter with room over it.
 */
export const FLEET_MAX_SHIPS = 64;
/** Max trail sockets written per ship into a family batch. */
export const FLEET_SOCKETS_PER_SHIP = 2;
/** Instance capacity per family plume layer at construction. */
export const FLEET_INITIAL_SOCKETS_PER_FAMILY = FLEET_INITIAL_SHIPS * FLEET_SOCKETS_PER_SHIP;
/** Instance capacity per family plume layer at the ceiling. */
export const FLEET_MAX_SOCKETS_PER_FAMILY = FLEET_MAX_SHIPS * FLEET_SOCKETS_PER_SHIP;

/**
 * @param {typeof import('three')} THREE
 * @param {object} opts
 * @param {Record<string, import('three').Texture>} opts.textures
 * @param {number} [opts.maxShips] sanity ceiling (default {@link FLEET_MAX_SHIPS})
 * @param {number} [opts.initialShips] slots allocated up front (default {@link FLEET_INITIAL_SHIPS})
 */
export class FamilyProductionFleet {
  constructor(THREE, opts = {}) {
    this.THREE = THREE;
    // Ceiling, not allocation. `shipCapacity` is what is actually allocated.
    this.maxShips = Math.max(1, opts.maxShips ?? FLEET_MAX_SHIPS);
    this.socketsPerShip = opts.socketsPerShip ?? FLEET_SOCKETS_PER_SHIP;
    this.textures = opts.textures || {};
    this._disposed = false;
    this._allocCount = 0;
    this._frameAllocs = 0;
    this._capacityGrowths = 0;
    this._scene = null;

    /** @type {Array<{ profileId: string, pack: object, plume: ContinuousPlumeSystem, rcs: RcsImpulseSystem|null }>} */
    this.families = [];
    this._familyByProfile = Object.create(null);

    // Per-family plume socket capacity. Grows with the ship table (see
    // _ensureFamilySockets); a family that never gets crowded never pays for
    // instance buffers it will not fill.
    this.initialSocketsPerFamily = Math.min(
      Math.max(this.socketsPerShip, (opts.initialShips ?? FLEET_INITIAL_SHIPS) * this.socketsPerShip),
      this.maxShips * this.socketsPerShip,
    );
    this.maxSocketsPerFamily = this.maxShips * this.socketsPerShip;

    const packs = listThrusterRecipePacks();
    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      const plume = new ContinuousPlumeSystem(THREE, pack.main, {
        textures: this.textures,
        maxSockets: this.initialSocketsPerFamily,
        distortionEnabled: false,
      });
      plume.group.visible = false;
      // Fixed per-family RCS system. Live fire/update is player-only (signed actuator
      // telemetry is player-owned); systems stay constructed so family switches are free.
      const rcs = new RcsImpulseSystem(THREE, pack.rcs, {
        textures: this.textures,
        maxImpulses: 12,
      });
      rcs.group.visible = false;
      const entry = {
        profileId: pack.profileId,
        pack,
        plume,
        rcs,
        activeEntities: 0,
      };
      this.families.push(entry);
      this._familyByProfile[pack.profileId] = entry;
      this._allocCount += 1;
    }

    // Growable ship table. Slots are identity-stable by entityId (not candidate-array
    // position), so reordering does not reset surviving drive state — and growth appends,
    // so an existing record's object identity survives a migration too.
    this.shipCapacity = Math.min(
      Math.max(1, opts.initialShips ?? FLEET_INITIAL_SHIPS),
      this.maxShips,
    );
    this.ships = new Array(this.shipCapacity);
    for (let i = 0; i < this.shipCapacity; i++) {
      this.ships[i] = this._makeShipRecord();
    }

    this.activeShipCount = 0;
    this.saturated = 0;
    this._playerRcsFamily = null;
    this._diag = {
      familiesActive: 0,
      shipsActive: 0,
      socketsWritten: 0,
      saturated: 0,
      frameAllocations: 0,
      playerProfileId: null,
      idleShips: 0,
      shipCapacity: this.shipCapacity,
      capacityGrowths: 0,
    };

    // Per-frame family begin flags (Uint8, fixed)
    this._familyOpen = new Uint8Array(this.families.length);
    // Per-frame socket demand per family, used to size plume capacity before the write
    // pass. Fixed-length, reused — the growth check itself must not allocate.
    this._familySocketDemand = new Uint32Array(this.families.length);
    // Retention-safe two-phase: retainShip only until beginAdmitPhase().
    this._admitOpen = false;
  }

  /** One ship slot. Allocated at construction and on capacity growth only. */
  _makeShipRecord() {
    this._allocCount += 1;
    const sockets = new Array(this.socketsPerShip);
    for (let s = 0; s < this.socketsPerShip; s++) {
      sockets[s] = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    }
    return {
      alive: false,
      entityId: null,
      // Snapshot of entityId at beginFrame — stable for the whole frame even if admit
      // overwrites a departed slot. Used by hadEntity() for retain/admit partition.
      priorEntityId: null,
      profileId: 'engine_ion_small',
      familyIndex: 0,
      isPlayer: false,
      driveState: { plumeDrive: 0, boostBlend: 0 },
      sockets,
      socketCount: 0,
      drive: 0,
      throttle: 0,
      boost: 0,
      cruise: 0,
      reverse: 0,
      retroOnly: false,
      brake: 0,
      speedDrive: 0,
      // Precomputed faction thruster RGB (0..1) for per-instance plume blend.
      factionR: 0.533,
      factionG: 0.667,
      factionB: 1.0,
    };
  }

  /**
   * Append slots, doubling, up to the ceiling. Appending keeps every live record's
   * object identity and array index, so warmed drive state and hadEntity() survive.
   * @returns {boolean} whether capacity actually moved
   */
  _growShipTable() {
    if (this.shipCapacity >= this.maxShips) return false;
    const next = Math.min(this.maxShips, Math.max(this.shipCapacity * 2, this.shipCapacity + 1));
    for (let i = this.shipCapacity; i < next; i++) {
      this.ships.push(this._makeShipRecord());
      this._frameAllocs += 1;
    }
    this.shipCapacity = next;
    this._capacityGrowths += 1;
    return true;
  }

  /**
   * Raise one family's plume instance capacity to cover `demandSockets`, doubling.
   * ContinuousPlumeSystem sizes its instance buffers at construction, so this is a
   * resource migration: build the replacement, swap it into the scene, dispose the
   * old one. Safe because the plume holds no cross-frame per-entity state — drive
   * state lives on the ship record here, and the slot pool is rewritten every frame.
   * The quality tier re-resolves from a11y flags on the next beginUpdate.
   * @returns {boolean} whether capacity actually moved
   */
  _ensureFamilySockets(entry, demandSockets) {
    const current = entry.plume?.pool?.maxSockets ?? 0;
    if (!entry.plume || demandSockets <= current || current >= this.maxSocketsPerFamily) {
      return false;
    }
    // Floor of 1 so a degenerate zero capacity cannot make the doubling loop spin forever.
    let next = Math.max(1, current);
    while (next < demandSockets && next < this.maxSocketsPerFamily) next *= 2;
    next = Math.min(next, this.maxSocketsPerFamily);
    if (next <= current) return false;
    if (!this.THREE) return false; // pool-only harness: nothing to rebuild

    const old = entry.plume;
    const parent = old.group ? old.group.parent : null;
    const wasVisible = old.group ? old.group.visible : false;
    const replacement = new ContinuousPlumeSystem(this.THREE, entry.pack.main, {
      textures: this.textures,
      maxSockets: next,
      distortionEnabled: false,
    });
    if (replacement.group) replacement.group.visible = wasVisible;
    const host = parent || this._scene;
    if (host && replacement.group) host.add(replacement.group);
    if (this._scene && replacement.bindDynamicBuffers) replacement.bindDynamicBuffers(this._scene);
    if (parent && old.group) parent.remove(old.group);
    old.dispose();
    entry.plume = replacement;
    this._allocCount += 1;
    this._frameAllocs += 1;
    this._capacityGrowths += 1;
    return true;
  }

  get allocationCount() {
    return this._allocCount;
  }

  get frameAllocations() {
    return this._frameAllocs;
  }

  /** Lifetime count of capacity migrations (ship table + family plume rebuilds). */
  get capacityGrowths() {
    return this._capacityGrowths;
  }

  /** Scene roots to add once. */
  attachToScene(scene) {
    if (!scene) return;
    // Remembered so a plume rebuilt for capacity can re-enter the same scene.
    this._scene = scene;
    for (let i = 0; i < this.families.length; i++) {
      const f = this.families[i];
      if (f.plume.group && !f.plume.group.parent) scene.add(f.plume.group);
      if (f.plume.bindDynamicBuffers) f.plume.bindDynamicBuffers(scene);
      if (f.rcs && f.rcs.group && !f.rcs.group.parent) scene.add(f.rcs.group);
      if (f.rcs?.bindDynamicBuffers) f.rcs.bindDynamicBuffers(scene);
    }
  }

  beginFrame(a11y) {
    this._frameAllocs = 0;
    this.activeShipCount = 0;
    this.saturated = 0;
    // Mark unclaimed for this frame; keep entityId + driveState for identity-stable reacquire.
    // Snapshot priorEntityId once so hadEntity stays true for historical owners even if a
    // departed slot is later overwritten by an admitted newcomer in the same frame.
    // Keep _playerRcsFamily across frames so family switches can reset the previous RCS pool.
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      s.priorEntityId = s.entityId;
      s.alive = false;
    }
    for (let i = 0; i < this.families.length; i++) {
      this.families[i].activeEntities = 0;
      this._familyOpen[i] = 0;
    }
    this._a11y = a11y || null;
    this._admitOpen = false;
  }

  /**
   * Close retention phase. After this, admitShip may reuse only !alive slots
   * (vacant or truly departed). Survivors that were not retained stay !alive and
   * become free for newcomers — only once every eligible survivor has had a chance
   * to retainShip first.
   */
  beginAdmitPhase() {
    this._admitOpen = true;
  }

  _resolveFamilyEntry(profileId) {
    return this._familyByProfile[profileId] || this._familyByProfile.engine_ion_small || null;
  }

  _activateShip(ship, entityId, entry, isPlayer) {
    const prevEntity = ship.entityId;
    const prevProfile = ship.profileId;
    // New ownership or family change must not inherit smoothed boost / plume drive.
    if (prevEntity !== entityId || prevProfile !== entry.profileId) {
      ship.driveState.plumeDrive = 0;
      ship.driveState.boostBlend = 0;
    }
    ship.alive = true;
    ship.entityId = entityId;
    ship.profileId = entry.profileId;
    ship.familyIndex = this.families.indexOf(entry);
    ship.isPlayer = !!isPlayer;
    ship.socketCount = 0;
    ship.drive = 0;
    ship.throttle = 0;
    ship.boost = 0;
    ship.cruise = 0;
    ship.reverse = 0;
    ship.retroOnly = false;
    ship.brake = 0;
    ship.speedDrive = 0;
    entry.activeEntities += 1;
    this.activeShipCount += 1;
    if (isPlayer) {
      if (this._playerRcsFamily && this._playerRcsFamily !== entry && this._playerRcsFamily.rcs) {
        this._playerRcsFamily.rcs.reset();
      }
      this._playerRcsFamily = entry;
    }
    return ship;
  }

  /**
   * Phase 1 — retain only. Reclaims the persistent slot for a known entityId.
   * Never steals another entity's historical slot. Returns null for newcomers
   * (no prior record). Call for every eligible survivor before beginAdmitPhase().
   */
  retainShip(entityId, profileId, isPlayer) {
    const entry = this._resolveFamilyEntry(profileId);
    if (!entry) {
      this.saturated += 1;
      return null;
    }
    let ship = null;
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].entityId === entityId) {
        ship = this.ships[i];
        break;
      }
    }
    if (!ship) return null;
    if (ship.alive) return ship; // already retained this frame
    return this._activateShip(ship, entityId, entry, isPlayer);
  }

  /**
   * Phase 2 — admit newcomers only after beginAdmitPhase().
   * Uses vacant (entityId null) or departed (!alive historical) slots only.
   * Survivors that completed retainShip are alive and cannot be stolen.
   */
  admitShip(entityId, profileId, isPlayer) {
    if (!this._admitOpen) {
      // Fail closed: never steal historical slots before retention completes.
      this.saturated += 1;
      return null;
    }
    const entry = this._resolveFamilyEntry(profileId);
    if (!entry) {
      this.saturated += 1;
      return null;
    }
    // If this entity already has a live slot (retained or duplicate admit), return it.
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].entityId === entityId && this.ships[i].alive) {
        return this.ships[i];
      }
    }
    // Prefer vacant, then departed (!alive). Alive survivors are skipped.
    let vacant = null;
    let departed = null;
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].alive) continue;
      if (this.ships[i].entityId == null) {
        vacant = this.ships[i];
        break;
      }
      if (!departed) departed = this.ships[i];
    }
    let ship = vacant || departed;
    // Every existing slot is a live survivor. Reusing one would evict a warmed ship to
    // draw a newcomer, so grow instead — up to the ceiling, after which we saturate.
    if (!ship) {
      const firstNew = this.ships.length;
      if (this._growShipTable()) ship = this.ships[firstNew];
    }
    if (!ship) {
      this.saturated += 1;
      return null;
    }
    return this._activateShip(ship, entityId, entry, isPlayer);
  }

  /**
   * Convenience: retain if known, else admit only when beginAdmitPhase() already ran.
   * Never auto-opens admit — newcomers before unfinished retains would steal slots.
   * Live route: retainShip all eligibles → beginAdmitPhase → admitShip newcomers.
   */
  acquireShip(entityId, profileId, isPlayer) {
    const retained = this.retainShip(entityId, profileId, isPlayer);
    if (retained) return retained;
    return this.admitShip(entityId, profileId, isPlayer);
  }

  /**
   * Write plume sockets into a reserved ship (mutates ship.sockets in place).
   * Call after acquireShip; sockets are plain {x,y,z,ax,ay,az}.
   */
  setShipSockets(ship, sockets, count) {
    if (!ship) return;
    const n = Math.min(this.socketsPerShip, Math.max(0, count | 0), sockets ? sockets.length : 0);
    ship.socketCount = n;
    for (let i = 0; i < n; i++) {
      const src = sockets[i];
      const dst = ship.sockets[i];
      dst.x = src.x; dst.y = src.y; dst.z = src.z;
      dst.ax = src.ax; dst.ay = src.ay; dst.az = src.az;
    }
    // Zero unused slots. A later write that treats "0 sockets" as "1 fallback" would
    // otherwise light a jet at the last written pose or at the world origin.
    for (let i = n; i < this.socketsPerShip; i++) {
      const dst = ship.sockets[i];
      dst.x = 0; dst.y = 0; dst.z = 0;
      dst.ax = 1; dst.ay = 0; dst.az = 0;
    }
  }

  setShipDrive(ship, driveInfo) {
    if (!ship || !driveInfo) return;
    ship.drive = driveInfo.drive || 0;
    // Commanded forward authority — brake mode classification must not use smoothed residual.
    ship.throttle = driveInfo.throttle != null ? driveInfo.throttle : 0;
    ship.boost = driveInfo.boost || 0;
    ship.cruise = driveInfo.cruise || 0;
    ship.reverse = driveInfo.reverse || 0;
    ship.retroOnly = !!driveInfo.retroOnly;
    ship.brake = driveInfo.brake || 0;
    ship.speedDrive = driveInfo.speedDrive || 0;
  }

  /**
   * Precomputed faction thruster RGB (0..1). Stored on the ship record so plume
   * instance colors can blend without per-frame object allocation.
   */
  setShipFactionRgb(ship, r, g, b) {
    if (!ship) return;
    ship.factionR = Number.isFinite(r) ? r : 0.533;
    ship.factionG = Number.isFinite(g) ? g : 0.667;
    ship.factionB = Number.isFinite(b) ? b : 1.0;
  }

  /**
   * Flush all reserved ships into family GPU batches.
   * @param {number} dt
   */
  endFrame(dt) {
    if (this._disposed) return this._diag;
    const a11y = this._a11y;
    let socketsWritten = 0;
    let idleShips = 0;
    let familiesActive = 0;
    let aliveCount = 0;

    // Size each family's instance capacity to this frame's demand BEFORE any write.
    // Without this, growing the ship table alone would hand ship eleven a slot and then
    // silently drop its sockets on the plume pool's capacity break — the same invisible
    // failure in a different place.
    this._familySocketDemand.fill(0);
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.alive) continue;
      const fi = ship.familyIndex;
      if (fi < 0 || fi >= this._familySocketDemand.length) continue;
      this._familySocketDemand[fi] += ship.socketCount;
    }
    for (let fi = 0; fi < this.families.length; fi++) {
      const demand = this._familySocketDemand[fi];
      if (demand > 0) this._ensureFamilySockets(this.families[fi], demand);
    }

    // Scan full table — alive slots are not packed by candidate order.
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.alive) continue;
      aliveCount += 1;
      if (ship.drive < 0.08 && ship.boost < 0.05) idleShips += 1;
      // 0 sockets is intentional (player plasma stream owns the jet). Do not invent
      // a fallback socket — that drew a throttle-locked ghost at the world origin.
      if (ship.socketCount <= 0) continue;
      const fam = this.families[ship.familyIndex];
      if (!fam) continue;
      if (!this._familyOpen[ship.familyIndex]) {
        fam.plume.beginUpdate(a11y);
        this._familyOpen[ship.familyIndex] = 1;
      }
      // ship carries cruise/reverse/throttle/faction RGB as driveSignals (no alloc).
      const written = fam.plume.writeEntity(
        dt,
        ship.drive,
        ship.sockets,
        ship,
        ship.driveState,
        ship.socketCount,
      );
      socketsWritten += written;
    }
    this.activeShipCount = aliveCount;

    for (let fi = 0; fi < this.families.length; fi++) {
      if (!this._familyOpen[fi]) {
        // Sleep family: reset GPU counts, keep resources.
        const fam = this.families[fi];
        fam.plume.pool.beginFrame();
        fam.plume.pool.endWrite();
        if (fam.plume.layerBatches) {
          for (let b = 0; b < fam.plume.layerBatches.length; b++) {
            const batch = fam.plume.layerBatches[b];
            batch.writeCount = 0;
            if (batch.mesh) {
              batch.mesh.count = 0;
              batch.mesh.visible = false;
            }
          }
        }
        if (fam.plume.group) fam.plume.group.visible = false;
        continue;
      }
      const fam = this.families[fi];
      fam.plume.endUpdate(dt);
      if (fam.plume.group.visible) familiesActive += 1;
    }

    this._diag.familiesActive = familiesActive;
    this._diag.shipsActive = this.activeShipCount;
    this._diag.socketsWritten = socketsWritten;
    this._diag.saturated = this.saturated;
    this._diag.frameAllocations = this._frameAllocs;
    this._diag.idleShips = idleShips;
    this._diag.shipCapacity = this.shipCapacity;
    this._diag.capacityGrowths = this._capacityGrowths;
    let playerProfile = null;
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].alive && this.ships[i].isPlayer) {
        playerProfile = this.ships[i].profileId;
        break;
      }
    }
    this._diag.playerProfileId = playerProfile;
    return this._diag;
  }

  /** Player RCS system for the active player family (or ion_small). */
  playerRcsSystem() {
    if (this._playerRcsFamily && this._playerRcsFamily.rcs) return this._playerRcsFamily.rcs;
    const fallback = this._familyByProfile.engine_ion_small;
    return fallback ? fallback.rcs : null;
  }

  playerPlumeSystem() {
    if (this._playerRcsFamily) return this._playerRcsFamily.plume;
    const fallback = this._familyByProfile.engine_ion_small;
    return fallback ? fallback.plume : null;
  }

  /** Whether entityId is currently in the production fleet this frame. */
  hasEntity(entityId) {
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].alive && this.ships[i].entityId === entityId) return true;
    }
    return false;
  }

  /**
   * Whether entityId owned a fixed slot at beginFrame (primitive priorEntityId scan).
   * Stable for the whole frame — admit overwriting a departed slot does not clear it.
   * Live VFX: retain pass evaluates only hadEntity; admit pass only !hadEntity.
   */
  hadEntity(entityId) {
    if (entityId == null) return false;
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].priorEntityId === entityId) return true;
    }
    return false;
  }

  /** Find persistent ship record by entity id (alive or not). */
  findShip(entityId) {
    for (let i = 0; i < this.ships.length; i++) {
      if (this.ships[i].entityId === entityId) return this.ships[i];
    }
    return null;
  }

  familyPlume(profileId) {
    const e = this._familyByProfile[profileId];
    return e ? e.plume : null;
  }

  reset() {
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      s.alive = false;
      s.entityId = null;
      s.priorEntityId = null;
      s.driveState.plumeDrive = 0;
      s.driveState.boostBlend = 0;
      s.factionR = 0.533;
      s.factionG = 0.667;
      s.factionB = 1.0;
    }
    this.activeShipCount = 0;
    this.saturated = 0;
    this._admitOpen = false;
    this._playerRcsFamily = null;
    for (let i = 0; i < this.families.length; i++) {
      const f = this.families[i];
      f.plume.reset();
      if (f.rcs) f.rcs.reset();
      f.activeEntities = 0;
    }
  }

  dispose() {
    if (this._disposed) return;
    this.reset();
    for (let i = 0; i < this.families.length; i++) {
      const f = this.families[i];
      if (f.plume.group?.parent) f.plume.group.parent.remove(f.plume.group);
      if (f.rcs?.group?.parent) f.rcs.group.parent.remove(f.rcs.group);
      f.plume.dispose();
      if (f.rcs) f.rcs.dispose();
    }
    this._disposed = true;
  }
}

export function familyFleetProfileIds() {
  return LIVE_ENGINE_PROFILE_IDS;
}

export { resolveThrusterRecipes };
