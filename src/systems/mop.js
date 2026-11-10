// W-SHIFT (row 506, 03 §4.3): MOP / CL-5 — the clean-up drone that erases evidence. A
// marked drone hull sweeps Nyx March for unmarked wreck bodies and tidies them — the
// physical evidence of every fight, gone. It works a real patrol: nearest eligible hull
// first, travel at sweep speed, consume on contact. The play is a race — it started at
// the station and the wreck you want is the one you reach first. Quiet by canon: no
// broadcasts; it speaks only when it tidies something you were standing near.
//
// WHAT THIS OWNS — the drone body (one-off event seams: init / deferred sector-enter /
// save:loaded / newGame), the tidy count in story flags, and the calendar patrol pass
// that steers and consumes. Eligibility law is the shared unmarked-wreck rule — authored,
// mission-pinned, durable and claimed hulls are somebody's property, not evidence.
import { MOP } from '../data/mop.js';
import {
  mopEligible, mopSweepTarget, mopSteerDeltaV, mopCanConsume, mopNoticed,
} from '../characters/mopRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function mopSpec() {
  return {
    type: 'drone',
    pos: { ...MOP.post }, vel: { x: 0, z: 0 },
    radius: 9, mass: 22, hull: 200, hullMax: 200,
    homeSectorId: MOP.sectorId,
    data: {
      mop: true, authoredCharacter: 'mop', parentType: 'story_prop',
      callsign: MOP.callsign,
      scanLabel: 'MOP / CL-5 — clean-up drone',
      scannerSignalKind: 'salvage',
      homeSectorId: MOP.sectorId,
    },
  };
}

export function createMop() {
  return {
    name: 'mop',
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
        && this.state?.world?.currentSectorId === MOP.sectorId;
    },
    _drone() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.mop === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.mop === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._drone() && this.helpers.spawnEntity) this.helpers.spawnEntity(mopSpec());
    },
    /** Hulls mid-hand are somebody's property, not evidence: the client's live massline
     *  latch and salvage-beam lock ride on state.player, where the pure entity law
     *  cannot see — the sweep refuses them so the drone never takes a hull off the
     *  client's line or out from under the client's beam. */
    _engagedIds(s) {
      const player = (s && s.player) || s?.entities?.get?.(s.playerId);
      if (!player) return null;
      let ids = null;
      const tether = player.tether;
      if (tether && tether.active && tether.targetId != null) (ids || (ids = new Set())).add(tether.targetId);
      if (player.miningTargetId != null) (ids || (ids = new Set())).add(player.miningTargetId);
      return ids;
    },
    /** The calendar patrol: steer at the nearest unmarked hull through the impulse
     *  membrane — the drone is a live Rapier body and owns its own linvel, so a direct
     *  vel write would die in the readback before it ever moved (same membrane the
     *  bouncer's drift-home and docket's servo ride). Tidy on contact, brake over the
     *  cleared site, drift home when the sector is clean. One quiet remark only when
     *  the client was close enough to feel the loss — a Quiet drone does not file
     *  reports. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const drone = this._drone();
      if (!drone || !drone.pos) return;
      const engaged = this._engagedIds(s);
      const eligible = engaged ? (e) => mopEligible(e) && !engaged.has(e.id) : mopEligible;
      const target = mopSweepTarget(drone.pos, s.entityList, eligible);
      let dv = null;
      if (!target) {
        dv = mopSteerDeltaV(drone, MOP.post, MOP.sweepSpeed, MOP.leashRadius);
      } else if (mopCanConsume(drone.pos, target.pos)) {
        this.helpers?.removeEntity?.(target.id);
        const flags = this._flags();
        if (flags) flags[MOP.tidyFlag] = (Number(flags[MOP.tidyFlag]) || 0) + 1;
        const player = s.player || s.entities?.get?.(s.playerId);
        if (mopNoticed(target.pos, player?.pos)) {
          this.bus?.emit('comms:popup', {
            id: `mop_tidy_${target.id}`, sender: MOP.sender, category: 'story',
            text: MOP.tidyLine, ttl: 6, persist: false,
          });
        }
        // Brake over the cleared site: the drone parks on a tidy, it does not coast past.
        const vx = Number.isFinite(drone.vel?.x) ? drone.vel.x : 0;
        const vz = Number.isFinite(drone.vel?.z) ? drone.vel.z : 0;
        dv = (vx !== 0 || vz !== 0) ? { x: -vx, z: -vz } : null;
      } else {
        dv = mopSteerDeltaV(drone, target.pos, MOP.sweepSpeed, MOP.consumeRadius);
      }
      if (dv && drone.mass > 0) {
        queuePhysicsImpulse(drone, { x: dv.x * drone.mass, z: dv.z * drone.mass }, { tick: s.tick });
      }
    },
  };
}

export const mop = createMop();
