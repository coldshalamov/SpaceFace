/**
 * Bounded multi-ship production thruster fleet (VP-220).
 *
 * One ContinuousPlumeSystem per live engine family (fixed, not per-entity).
 * Ships are assigned into a fixed ship table; saturated candidates fall back
 * to legacy streaks. No render-time sim recomputation.
 */

import { ContinuousPlumeSystem } from './continuousPlume.js';
import { RcsImpulseSystem } from './rcsImpulse.js';
import {
  listThrusterRecipePacks,
  resolveThrusterRecipes,
  LIVE_ENGINE_PROFILE_IDS,
} from '../recipes/registry.js';

/** Hard cap on simultaneous production ships (player + NPCs). */
export const FLEET_MAX_SHIPS = 10;
/** Max trail sockets written per ship into a family batch. */
export const FLEET_SOCKETS_PER_SHIP = 2;
/** Instance capacity per family plume layer. */
export const FLEET_MAX_SOCKETS_PER_FAMILY = FLEET_MAX_SHIPS * FLEET_SOCKETS_PER_SHIP;

/**
 * @param {typeof import('three')} THREE
 * @param {object} opts
 * @param {Record<string, import('three').Texture>} opts.textures
 * @param {number} [opts.maxShips]
 */
export class FamilyProductionFleet {
  constructor(THREE, opts = {}) {
    this.THREE = THREE;
    this.maxShips = opts.maxShips ?? FLEET_MAX_SHIPS;
    this.socketsPerShip = opts.socketsPerShip ?? FLEET_SOCKETS_PER_SHIP;
    this.textures = opts.textures || {};
    this._disposed = false;
    this._allocCount = 0;
    this._frameAllocs = 0;

    /** @type {Array<{ profileId: string, pack: object, plume: ContinuousPlumeSystem, rcs: RcsImpulseSystem|null }>} */
    this.families = [];
    this._familyByProfile = Object.create(null);

    const packs = listThrusterRecipePacks();
    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      const plume = new ContinuousPlumeSystem(THREE, pack.main, {
        textures: this.textures,
        maxSockets: FLEET_MAX_SOCKETS_PER_FAMILY,
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

    // Fixed ship table — never grows past maxShips. Slots are identity-stable by entityId
    // (not candidate-array position), so reordering does not reset surviving drive state.
    this.ships = new Array(this.maxShips);
    for (let i = 0; i < this.maxShips; i++) {
      this.ships[i] = {
        alive: false,
        entityId: null,
        // Snapshot of entityId at beginFrame — stable for the whole frame even if admit
        // overwrites a departed slot. Used by hadEntity() for retain/admit partition.
        priorEntityId: null,
        profileId: 'engine_ion_small',
        familyIndex: 0,
        isPlayer: false,
        driveState: { plumeDrive: 0, boostBlend: 0 },
        sockets: [
          { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
          { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
        ],
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
      this._allocCount += 1;
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
    };

    // Per-frame family begin flags (Uint8, fixed)
    this._familyOpen = new Uint8Array(this.families.length);
    // Retention-safe two-phase: retainShip only until beginAdmitPhase().
    this._admitOpen = false;
  }

  get allocationCount() {
    return this._allocCount;
  }

  get frameAllocations() {
    return this._frameAllocs;
  }

  /** Scene roots to add once. */
  attachToScene(scene) {
    if (!scene) return;
    for (let i = 0; i < this.families.length; i++) {
      const f = this.families[i];
      if (f.plume.group && !f.plume.group.parent) scene.add(f.plume.group);
      if (f.rcs && f.rcs.group && !f.rcs.group.parent) scene.add(f.rcs.group);
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
    const ship = vacant || departed;
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

    // Scan full fixed table — alive slots are not packed by candidate order.
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.alive) continue;
      aliveCount += 1;
      const fam = this.families[ship.familyIndex];
      if (!fam) continue;
      if (!this._familyOpen[ship.familyIndex]) {
        fam.plume.beginUpdate(a11y);
        this._familyOpen[ship.familyIndex] = 1;
      }
      const sockView = ship.sockets;
      const n = ship.socketCount > 0 ? ship.socketCount : 1;
      // ship carries cruise/reverse/throttle/faction RGB as driveSignals (no alloc).
      const written = fam.plume.writeEntity(
        dt,
        ship.drive,
        sockView,
        ship,
        ship.driveState,
        n,
      );
      socketsWritten += written;
      if (ship.drive < 0.08 && ship.boost < 0.05) idleShips += 1;
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
