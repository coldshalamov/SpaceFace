// W-CAST-HANDS (row 542, 03 §4.1 / 06 B6): the Gate 3 weir — Hale and Dree's shared post.
// A standing Concord weigh-cordon across the Tethys lane at the Customs Gate. Crossing
// the ring IS submitting: the calendar census sweeps the player's path for a cordon
// entry and, when it finds one, runs the shared row-513 scale model — hull signature
// plus loose freight near the hull against the manifest the papers declare.
//
//   * CLEAN   — transit logged, Hale's desk line.
//   * WAIVED  — Inspector Dree waves the weir: one small over-mass, once ever (B6).
//   * FINED   — anything bigger or anything after: REF 44-C filed, the second fine
//               charged correctly through economy:chargeCredits.
//
// WHAT THIS OWNS — one beacon marking the cordon post (same event-driven seams as every
// one-off: init / deferred sector-enter / save:loaded / newGame) plus the calendar
// entry census. The post never opens the hold; the scale reads signatures, not papers.
// The entry latch is a from-position the adapter keeps — a hull inside the ring is not
// re-weighed until it leaves and submits again.
import { GATE_THREE_WEIR } from '../data/gateThree.js';
import { gateThreeEntered, gateThreeWeigh, gateThreeOutcome } from '../characters/gateThreeRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export function gateThreeWeirSpec() {
  return {
    type: 'beacon',
    pos: { ...GATE_THREE_WEIR.post }, vel: { x: 0, z: 0 },
    radius: 14, mass: 1e6, hull: 1, hullMax: 1,
    collides: false,
    homeSectorId: GATE_THREE_WEIR.sectorId,
    data: {
      gateThreeWeir: true, parentType: 'story_prop',
      scanLabel: 'Gate 3 customs weir — Concord weigh cordon',
      scannerSignalKind: 'salvage',
      homeSectorId: GATE_THREE_WEIR.sectorId,
    },
  };
}

export function createGateThreeWeir() {
  return {
    name: 'gateThreeWeir',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._lastPos = null;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._lastPos = null;
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { this._lastPos = null; this._sync(); });
      on('game:newGame', () => { this._lastPos = null; this._sync(); });
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      this._lastPos = null;
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
        && this.state?.world?.currentSectorId === GATE_THREE_WEIR.sectorId;
    },
    _player() {
      const s = this.state;
      const id = s?.playerId;
      if (!id) return null;
      return s.entities?.get?.(id) || (s.entityList || []).find((e) => e && e.id === id) || null;
    },
    _beacon() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gateThreeWeir === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gateThreeWeir === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._beacon() && this.helpers.spawnEntity) this.helpers.spawnEntity(gateThreeWeirSpec());
      const flags = this._flags();
      if (flags && flags[GATE_THREE_WEIR.announceFlag] !== true) {
        flags[GATE_THREE_WEIR.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'gate3_weir_announce', sender: GATE_THREE_WEIR.sender, category: 'story',
          text: GATE_THREE_WEIR.announce, ttl: 9, persist: false,
        });
      }
    },
    /** Calendar census: a swept entry into the cordon submits the hull once — then the
     *  shared scale model reads it and the post answers clean, waived, or filed. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) { this._lastPos = null; return; }
      const player = this._player();
      const pos = player && player.pos;
      const last = this._lastPos;
      this._lastPos = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z } : null;
      if (!player || player.alive === false || !gateThreeEntered(last, pos)) return;
      const flags = this._flags();
      if (!flags) return;
      const { verdict, manifestMassT } = gateThreeWeigh(player, s.entityList);
      const outcome = gateThreeOutcome(verdict, flags[GATE_THREE_WEIR.waveFlag] === true);
      const fmt = (tpl) => tpl
        .replace('{read}', (verdict.readMassT || 0).toFixed(1))
        .replace('{manifest}', manifestMassT.toFixed(1))
        .replace('{over}', (outcome.overT || 0).toFixed(1))
        .replace('{fine}', String(outcome.fine || 0));
      if (outcome.kind === 'waived') {
        flags[GATE_THREE_WEIR.waveFlag] = true;
      } else if (outcome.kind === 'fined') {
        flags[GATE_THREE_WEIR.countFlag] = (Number(flags[GATE_THREE_WEIR.countFlag]) || 0) + 1;
        this.bus?.emit('economy:chargeCredits', { amount: outcome.fine, reason: 'fine:gate3-ref44c' });
      }
      this.bus?.emit('comms:popup', {
        id: `gate3_verdict_${s.tick || 0}`, sender: GATE_THREE_WEIR.sender,
        category: outcome.kind === 'clean' ? 'traffic' : 'warning',
        text: fmt(outcome.kind === 'clean' ? GATE_THREE_WEIR.clean
          : outcome.kind === 'waived' ? GATE_THREE_WEIR.waived : GATE_THREE_WEIR.fined),
        ttl: 9, persist: outcome.kind !== 'clean',
      });
      this.bus?.emit('gateThree:weighed', {
        outcome: outcome.kind, readMassT: verdict.readMassT, manifestMassT,
        overT: outcome.overT || 0, fine: outcome.fine || 0,
        waived: flags[GATE_THREE_WEIR.waveFlag] === true,
        finesFiled: Number(flags[GATE_THREE_WEIR.countFlag]) || 0,
      });
    },
  };
}

export const gateThreeWeir = createGateThreeWeir();
