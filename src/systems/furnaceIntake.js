// W-BOOKS-0-2 (row 533, 06 §34.7 Book 1): the CR-FEED furnace intake at Ceres — a marked
// mouth ring beside the closed refinery. Fling the infested ore hauler's pods (or any loose
// rock) across the lip and the yard burns them; each feed emits `furnace:fed`, which the
// Book 1 'infested' contract counts toward its disposal leg.
//
// WHAT THIS OWNS — one beacon marking the mouth (same event-driven seams as every one-off:
// init / deferred sector-enter / save:loaded / newGame) plus the per-tick eat pass. The
// intake never buys or holds freight — it consumes the body and files the fact.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

/** A furnace takes freight and rock — pods, jettisoned cargo, loose asteroids. Never
 *  hulls, stations, wrecks, drones, or living things. */
function furnaceEdible(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type === 'player' || entity.type === 'station' || entity.type === 'beacon') return false;
  const d = entity.data || {};
  if (d.payloadType === 'jettisoned_cargo' || d.jettisonedCargo === true) return true;
  if (entity.type === 'asteroid' || entity.type === 'payload') return true;
  return false;
}

export function furnaceIntakeSpec() {
  return {
    type: 'beacon',
    pos: { ...FURNACE_INTAKE.mouth }, vel: { x: 0, z: 0 },
    radius: 14, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: FURNACE_INTAKE.sectorId,
    data: {
      furnaceIntake: true, parentType: 'story_prop',
      scanLabel: 'CR-FEED — furnace intake',
      scannerSignalKind: 'anomaly',
      homeSectorId: FURNACE_INTAKE.sectorId,
    },
  };
}

export function createFurnaceIntake() {
  return {
    name: 'furnaceIntake',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => this._sync());
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === FURNACE_INTAKE.sectorId;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.furnaceIntake === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.furnaceIntake === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(furnaceIntakeSpec());
      const flags = this._flags();
      if (flags && flags[FURNACE_INTAKE.announceFlag] !== true) {
        flags[FURNACE_INTAKE.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'furnace_intake_announce', sender: FURNACE_INTAKE.sender, category: 'story',
          text: FURNACE_INTAKE.announce, ttl: 9, persist: false,
        });
      }
    },
    /** The mouth is a hazard ring: anything edible crossing the lip is taken, whatever
     *  the speed — flinging is the intended delivery. Once per body per tick. */
    update() {
      if (!this._adventure()) return;
      const list = this.state?.entityList || [];
      const mouth = FURNACE_INTAKE.mouth;
      const r2 = FURNACE_INTAKE.mouthRadius * FURNACE_INTAKE.mouthRadius;
      for (const e of list) {
        if (!furnaceEdible(e) || e._furnaceTaken === true) continue;
        const pos = e.pos;
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        const dx = pos.x - mouth.x, dz = pos.z - mouth.z;
        if (dx * dx + dz * dz > r2) continue;
        e._furnaceTaken = true;
        const flags = this._flags();
        if (flags) {
          flags[FURNACE_INTAKE.fedFlag] = true;
          flags[FURNACE_INTAKE.countFlag] = (flags[FURNACE_INTAKE.countFlag] | 0) + 1;
        }
        this.bus?.emit('furnace:fed', {
          entityId: e.id, type: e.type,
          payloadType: e.data?.payloadType || null,
          pos: { x: pos.x, z: pos.z },
          sectorId: FURNACE_INTAKE.sectorId,
          count: flags ? flags[FURNACE_INTAKE.countFlag] : undefined,
        });
        this.bus?.emit('comms:popup', {
          id: `furnace_fed_${e.id}`, sender: FURNACE_INTAKE.sender, category: 'info',
          text: FURNACE_INTAKE.fed, ttl: 6, persist: false,
        });
        this.helpers?.removeEntity?.(e.id);
      }
    },
  };
}

export const furnaceIntake = createFurnaceIntake();
