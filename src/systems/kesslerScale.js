// W-CAST-HANDS (row 542, 03 §4.1 / 06 B1): Kessler's scale — "put cargo on his deck,
// compare his reading with your Line's strain gauge. The discrepancy is the clue."
// A weigh-slip plate beside the Tethys tally post: rest a jettisoned pod inside the
// ring and the desk reads it — the plate reporting the skimmed figure while the pod's
// own stamp reads true. The first variance a pilot notices files kessler_variance_seen
// for the campaign to read.
//
// WHAT THIS OWNS — one beacon marking the deck (same event-driven seams as every
// one-off: init / deferred sector-enter / save:loaded / newGame) plus the calendar
// read pass. The deck never buys or takes a pod — it reports, the freight stays yours.
// Reads latch per pod per visit via data.kesslerRead so a parked pod is read once,
// not polled.
import { KESSLER_SCALE } from '../data/kessler.js';
import { kesslerPodEligible, kesslerReadCheck, kesslerPlateRead, kesslerTrueRead, kesslerVarianceSeen } from '../characters/kesslerRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function kesslerScaleSpec() {
  return {
    type: 'beacon',
    pos: { ...KESSLER_SCALE.pad }, vel: { x: 0, z: 0 },
    radius: 12, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: KESSLER_SCALE.sectorId,
    data: {
      kesslerScale: true, parentType: 'story_prop',
      scanLabel: 'Scale deck · weigh-slip plate',
      scannerSignalKind: 'salvage',
      homeSectorId: KESSLER_SCALE.sectorId,
    },
  };
}

export function createKesslerScale() {
  return {
    name: 'kesslerScale',
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
        && this.state?.world?.currentSectorId === KESSLER_SCALE.sectorId;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.kesslerScale === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.kesslerScale === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(kesslerScaleSpec());
      const flags = this._flags();
      if (flags && flags[KESSLER_SCALE.announceFlag] !== true) {
        flags[KESSLER_SCALE.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'kessler_scale_announce', sender: KESSLER_SCALE.sender, category: 'story',
          text: KESSLER_SCALE.announce, ttl: 9, persist: false,
        });
      }
    },
    /** Calendar read pass: every weighable pod at rest inside the ring gets one desk
     *  reading — the thumbed plate figure against the pod's own stamp. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const flags = this._flags();
      if (!flags) return;
      for (const e of s.entityList || []) {
        if (!kesslerPodEligible(e)) continue;
        if (!kesslerReadCheck(e).arrived) continue;
        e.data.kesslerRead = true;
        const plate = kesslerPlateRead(e.mass);
        const honest = kesslerTrueRead(e.mass);
        const variance = kesslerVarianceSeen(plate, honest);
        const firstVariance = variance && flags[KESSLER_SCALE.varianceFlag] !== true;
        if (variance) flags[KESSLER_SCALE.varianceFlag] = true;
        const count = (Number(flags[KESSLER_SCALE.countFlag]) || 0) + 1;
        flags[KESSLER_SCALE.countFlag] = count;
        const line = (firstVariance ? KESSLER_SCALE.firstVariance : KESSLER_SCALE.read)
          .replace('{plate}', plate.toFixed(1)).replace('{true}', honest.toFixed(1));
        this.bus?.emit('comms:popup', {
          id: `kessler_read_${e.id}`, sender: KESSLER_SCALE.sender, category: 'story',
          text: line, ttl: 9, persist: firstVariance,
        });
        this.bus?.emit('kesslerPod:weighed', {
          entityId: e.id, plateRead: plate, trueRead: honest,
          variance, firstVariance, count,
        });
      }
    },
  };
}

export const kesslerScale = createKesslerScale();
