// W-CAST-HANDS (row 542, 03 §4.1 / 06 B1): Kessler's scale — "put cargo on his deck,
// compare his reading with your Line's strain gauge. The discrepancy is the clue."
// A weigh-slip plate beside the Tethys tally post: rest a jettisoned pod inside the
// ring and the desk reads it — the plate reporting the skimmed figure while the pod's
// own stamp reads true. The first variance a pilot notices files kessler_variance_seen
// for the campaign to read.
//
// WHAT THIS OWNS — the open measuring ring and its flanking worksite (same seams as every
// one-off: init / deferred sector-enter / save:loaded / newGame) plus the calendar
// read pass. The deck never buys or takes a pod — it reports, the freight stays yours.
// Reads latch per pod per visit via data.kesslerRead so a parked pod is read once,
// not polled.
import { kesslerWorksiteSpecs, kesslerReceiptLabel, kesslerPadPosition } from './kesslerScaleWorksite.js';
import { insertDressingRow, dropDressingRow } from '../world/dressingTable.js';
import { stampSolidDressing } from '../world/solidDressing.js';
import { KESSLER_SCALE } from '../data/kessler.js';
import { kesslerPodEligible, kesslerReadCheck, kesslerPlateRead, kesslerTrueRead, kesslerVarianceSeen } from '../characters/kesslerRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function kesslerScaleSpec() {
  return {
    type: 'beacon',
    pos: kesslerPadPosition(), vel: { x: 0, z: 0 },
    radius: 12, mass: 1e6, hull: 1, hullMax: 1,
    collides: false, physicsBody: false,
    homeSectorId: KESSLER_SCALE.sectorId,
    data: {
      kesslerScale: true, kesslerWorksiteVersion: 1, parentType: 'story_prop',
      scanLabel: 'Scale 4 · rest a cargo pod inside the ring · freight retained',
      circuitMark: true, ringRadius: KESSLER_SCALE.padRadius,
      visualRadius: KESSLER_SCALE.padRadius,
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
      this._settlingPods = new Set();
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
      this._settlingPods?.clear();
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
        if (e?.alive && e.data?.kesslerScale === true
            && e.data.kesslerWorksiteVersion === 1) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const row of [...(this.state?.world?.dressing?.rows || [])]) {
        if (row?.data?.kesslerWorksite) dropDressingRow(this.state, row.id);
      }
      this._settlingPods?.clear();
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.kesslerScale === true && e.physicsBody === false)
          this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      // Only explicitly nonphysical legacy markers can be retired here. The old
      // collides:false beacon could still have a native body: preserve it (and every
      // legacy pod) rather than teleporting or destroying someone else's physics.
      for (const e of this.state.entityList || []) {
        if (e?.alive && e.data?.kesslerScale === true
            && e.data.kesslerWorksiteVersion !== 1 && e.physicsBody === false) {
          this.helpers.removeEntity?.(e.id);
        }
      }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(kesslerScaleSpec());
      // Dressing-table rows participate in the normal render and measured static-body
      // paths without becoming extra scanner/nav contacts. Save/re-entry repairs only
      // missing pieces; never duplicates foreign scenery or transfers freight.
      for (const spec of kesslerWorksiteSpecs()) {
        if ((this.state.world?.dressing?.rows || []).some((r) =>
          r.alive !== false && r.data?.kesslerWorksite === spec.data.kesslerWorksite)) continue;
        const solid = stampSolidDressing(spec.data, { radius: spec.radius });
        insertDressingRow(this.state, {
          ...spec, collides: !!solid,
          ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
        });
      }
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
      const settling = new Set();
      const pad = kesslerPadPosition();
      for (const e of s.entityList || []) {
        if (!kesslerPodEligible(e)) continue;
        const check = kesslerReadCheck(e, pad);
        if (!check.arrived) {
          if (check.inZone && Number.isFinite(check.speed)) {
            settling.add(e.id);
            if (!this._settlingPods?.has(e.id)) this.bus?.emit('comms:popup', {
              id: `kessler_settle_${e.id}`, sender: KESSLER_SCALE.sender, category: 'story',
              text: `Scale 4 · load moving at ${check.speed.toFixed(1)} WU/s. Reading waits at ${KESSLER_SCALE.restSpeed} WU/s or below. Freight stays yours.`,
              ttl: 5, persist: false,
            });
          }
          continue;
        }
        e.data.kesslerRead = true;
        const plate = kesslerPlateRead(e.mass);
        const honest = kesslerTrueRead(e.mass);
        const variance = kesslerVarianceSeen(plate, honest);
        // Retain the paired reading on this very pod for the existing lock/hover readout.
        // The original cargo stamp/commodity name remains intact; no cargo ledger write.
        const label = e.data.scanLabel || e.data.name || 'Cargo pod';
        e.data.kesslerReceipt = { plateRead: plate, trueRead: honest };
        e.data.scanLabel = `${label} · ${kesslerReceiptLabel(plate, honest)}`;
        const beacon = this._beacon();
        if (beacon) beacon.data.scanLabel = kesslerReceiptLabel(plate, honest);
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
      this._settlingPods = settling;
    },
  };
}

export const kesslerScale = createKesslerScale();

