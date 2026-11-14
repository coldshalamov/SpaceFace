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

// — Paired readings (B1 "the board flips to a different number while you watch") —
// The scale owns one bounded fact in story.flags: { version: 1, first, second } where each
// sample is { plate, stamp, count }. A second, differently-stamped load is the pattern the
// mystery needs; an equal stamp or a replayed count cannot corroborate it.
const kesslerFinitePositive = (n) => Number.isFinite(n) && n > 0;
const kesslerValidSample = (row) => kesslerFinitePositive(row && row.plate)
  && kesslerFinitePositive(row.stamp) && row.plate < row.stamp && kesslerFinitePositive(row.count);

/** Remaining freight aboard a pod: the live salvage pool is authoritative — a multi-item
 *  pool must never collapse to one stale amount; only a pre-pool legacy pod falls back
 *  to its stamped `amount`. Returns null when no honest figure exists. */
function kesslerPodUnits(data) {
  const pool = data && data.salvagePool;
  if (pool && typeof pool === 'object') {
    let total = 0;
    for (const qty of Object.values(pool)) {
      const n = Math.floor(Number(qty) || 0);
      if (n > 0) total += n;
    }
    return total;
  }
  const amount = Math.floor(Number(data && data.amount) || 0);
  return amount > 0 ? amount : null;
}

/** The pod's own tag: its receipt rides beside its name so the pilot can come back for it. */
function kesslerWeighedTag(base, stamp, units) {
  const tag = `${base} · WEIGHED ${Number.isFinite(stamp) ? stamp.toFixed(1) : '0.0'} t`;
  return Number.isFinite(units) ? `${tag} · ${units} u` : tag;
}

/** The pod's name segment — the first ' · ' clause of whatever tag it currently wears. */
function kesslerTagBase(data) {
  const first = String(data && data.scanLabel || '').split(' · ')[0].trim();
  return first || (data && data.name) || 'Cargo pod';
}

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
      this._weighed = new Map();
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
      this._weighed?.clear();
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
      this._weighed?.clear();
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.kesslerScale === true && e.physicsBody === false)
          this.helpers?.removeEntity?.(e.id);
      }
    },
    /** A pod already read this visit (or restored weighed) is tracked by id inside the
     *  ordinary read pass; when its real pool drains, its own tag keeps the true figure. */
    _trackWeighed(e) {
      const d = e && e.data;
      if (!d || d.kesslerRead !== true || !d.kesslerReceipt
          || (d.jettisonedCargo !== true && d.payloadType !== 'jettisoned_cargo')) return;
      const units = kesslerPodUnits(d);
      const weighed = this._weighed || (this._weighed = new Map());
      if (!weighed.has(e.id)) { weighed.set(e.id, units); return; }
      if (weighed.get(e.id) === units) return;
      weighed.set(e.id, units);
      e.data.scanLabel = kesslerWeighedTag(kesslerTagBase(d), d.kesslerReceipt.trueRead, units);
    },
    /** The bounded paired-reading fact — written only here, beside the receipt stamp. */
    _recordComparison(flags, sample) {
      const key = KESSLER_SCALE.comparisonFlag;
      let watch = flags[key];
      if (!kesslerValidSample(sample)) return watch && watch.version === 1 ? watch : null;
      if (!watch || watch.version !== 1 || !kesslerValidSample(watch.first)) {
        watch = flags[key] = { version: 1, first: sample, second: null };
        return watch;
      }
      // Owner count is monotonic; a reweighed equal stamp cannot be the different load.
      if (watch.second || sample.count <= watch.first.count
          || Math.round(sample.stamp * 10) === Math.round(watch.first.stamp * 10)) return watch;
      watch.second = sample;
      return watch;
    },
    /** The one existing story-line voice (same seam story.js/missionStoryOps.js use):
     *  the voice arbiter floor, with the toast event as its own fallback. */
    _sayStoryLine(text, ttl = 6) {
      if (!text) return false;
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        const said = voice.say({ channel: 'story', text, kind: 'story', ttl });
        if (said) return true;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('toast', { text, kind: 'story', ttl });
        return true;
      }
      return false;
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
      if (!this._weighed) this._weighed = new Map();
      const settling = new Set();
      const pad = kesslerPadPosition();
      for (const e of s.entityList || []) {
        if (e?.alive === false) { this._weighed.delete(e.id); continue; }
        if (!kesslerPodEligible(e)) { this._trackWeighed(e); continue; }
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
        const units = kesslerPodUnits(e.data);
        e.data.scanLabel = kesslerWeighedTag(label, honest, units);
        this._weighed.set(e.id, units);
        const firstVariance = variance && flags[KESSLER_SCALE.varianceFlag] !== true;
        if (variance) flags[KESSLER_SCALE.varianceFlag] = true;
        const count = (Number(flags[KESSLER_SCALE.countFlag]) || 0) + 1;
        flags[KESSLER_SCALE.countFlag] = count;
        // The bounded paired-reading fact: this pod is the second sample only when its
        // stamp is a different displayed tenth-tonne — then the board shows the two
        // disagreeing readings and Kessler at the window says the one line, once.
        const watch = this._recordComparison(flags, { plate, stamp: honest, count });
        const secondNow = !!(watch && watch.second && watch.second.count === count);
        const beacon = this._beacon();
        if (beacon) {
          beacon.data.scanLabel = secondNow
            ? `PLATE ${plate.toFixed(1)} t · STAMP ${honest.toFixed(1)} t`
            : kesslerReceiptLabel(plate, honest);
        }
        if (secondNow && plate !== honest
            && flags[KESSLER_SCALE.comparisonSpokenFlag] !== true) {
          flags[KESSLER_SCALE.comparisonSpokenFlag] = true;
          this._sayStoryLine(KESSLER_SCALE.comparisonLine, 6);
        }
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

