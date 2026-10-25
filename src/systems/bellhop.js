// W-SHIFT (row 506, 03 §4.3): BELLHOP / CB-9 — the Choir bell-tuning drone.
// Phoebe Echo is named for a return: the shrine's song broke and the Choir
// stopped answering. Five crystals hang in an arc on the chime floor west of
// the Echo Shrine, and CB-9 still stands them. Strike a crystal with anything
// that hits hard — a thrown rock is the intended verb — and a real physics
// impact rings it; ring the authored phrase and the drone calls each step
// ('Again. Lower. There.'), ring a wrong note and the phrase starts over.
// Finish the song and it HOLDS: the crystals stand tuned, the fee pays once,
// and the drone hums the recovered song on every return — a bell the player
// put back in the world.
//
// WHAT THIS OWNS — the drone hull and the five crystals (one-off event seams:
// init / deferred sector-enter / save:loaded / newGame), the song progress and
// sung/paid/gone receipts in story flags, the ring debounce ledger (in-memory,
// per visit), and the calendar pass that walks the drone home through the
// impulse membrane. Nothing here writes entity.vel.
import { BELLHOP } from '../data/bellhop.js';
import {
  bellhopCrystalSpot, bellhopNoteOf, bellhopRings, bellhopStrikeResult,
  bellhopStepLine, bellhopDriftHome,
} from '../characters/bellhopRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function bellhopSpec() {
  return {
    type: 'drone',
    pos: { ...BELLHOP.post }, vel: { x: 0, z: 0 },
    radius: 11, mass: 48, hull: 240, hullMax: 240,
    homeSectorId: BELLHOP.sectorId,
    data: {
      bellhop: true, authoredCharacter: 'bellhop', parentType: 'story_prop',
      callsign: BELLHOP.callsign,
      scanLabel: 'BELLHOP / CB-9 — bell-tuning drone, five crystals, one phrase',
      scannerSignalKind: 'archive',
      homeSectorId: BELLHOP.sectorId,
    },
  };
}

export function bellhopCrystalSpec(index, tuned) {
  return {
    type: 'debris',
    pos: { ...bellhopCrystalSpot(index) }, vel: { x: 0, z: 0 },
    radius: 14, mass: 240, hull: 320, hullMax: 320,
    homeSectorId: BELLHOP.sectorId,
    data: {
      bellhopCrystal: true, bellhopCrystalIndex: index,
      bellhopTuned: tuned === true,
      runtimeOwner: 'bellhop', parentType: 'story_prop',
      callsign: tuned ? 'CHIME CRYSTAL — TUNED' : 'CHIME CRYSTAL',
      scanLabel: tuned
        ? 'chime crystal — tuned; it holds its note now'
        : 'chime crystal — a real strike rings it',
      scannerSignalKind: 'anomaly',
      homeSectorId: BELLHOP.sectorId,
    },
  };
}

export function createBellhop() {
  return {
    name: 'bellhop',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      this._lastRing = new Map(); // entity -> tick — bounce debounce, per visit
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const seam = () => { this._announced = false; this._lastRing.clear(); };
      on('sector:enter', (p) => {
        seam();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { seam(); this._sync(); });
      on('game:newGame', () => { seam(); this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
      on('physics:impact', (p) => this._onImpact(p));
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
        && this.state?.world?.currentSectorId === BELLHOP.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.bellhop === true) return e;
      }
      return null;
    },
    _crystals() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.bellhopCrystal === true);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.bellhop === true || e.data?.bellhopCrystal === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 6) {
      this.bus?.emit('comms:popup', {
        id, sender: BELLHOP.sender, category: 'story', text, ttl, persist: false,
      });
    },
    /** The chime floor restocks what violence removes: a crystal shot to pieces
     *  is re-hung — tuned if the song holds, raw if it never learned. Seat
     *  indexes come from data stamps, never entity ids. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const live = new Set();
      for (const e of this._crystals()) {
        const i = Number(e.data?.bellhopCrystalIndex);
        if (Number.isInteger(i)) live.add(i);
      }
      const tuned = this._flags()?.[BELLHOP.sungFlag] === true;
      for (let i = 0; i < BELLHOP.crystalCount; i += 1) {
        if (live.has(i)) continue;
        this.helpers.spawnEntity(bellhopCrystalSpec(i, tuned));
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[BELLHOP.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(bellhopSpec());
      }
      this._housekeep();
      if (!gone && !this._announced) {
        this._announced = true;
        const sung = flags?.[BELLHOP.sungFlag] === true;
        this._say('bellhop_announce', sung ? BELLHOP.repriseLine : BELLHOP.announce, 9);
      }
    },
    /** A struck crystal is a rung note. The physics event names both bodies;
     *  the crystal is whichever side carries the stamp — a bell does not care
     *  what hit it, only that the hit was real and not its own bounce. */
    _onImpact(p) {
      if (!this._adventure() || !p) return;
      if (!bellhopRings(p.impulse)) return;
      const a = this._entity(p.aId);
      const b = this._entity(p.bId);
      const crystal = bellhopNoteOf(a) >= 0 ? a : (bellhopNoteOf(b) >= 0 ? b : null);
      if (!crystal) return;
      const note = bellhopNoteOf(crystal);
      const tick = Number(this.state?.tick) || 0;
      if (tick - (this._lastRing.get(crystal) || -Infinity) < BELLHOP.ringDebounceTicks) return;
      this._lastRing.set(crystal, tick);
      const flags = this._flags();
      if (!flags || flags[BELLHOP.sungFlag] === true) return; // post-song chimes are the sandbox
      const robot = this._robot();
      if (!robot) return; // no tuner, no judge — the crystal still rings silent
      const result = bellhopStrikeResult(flags[BELLHOP.progressFlag], note);
      if (result.verdict === 'miss') {
        flags[BELLHOP.progressFlag] = 0;
        this._say(`bellhop_wrong_${tick}`, BELLHOP.wrongLine, 4);
        return;
      }
      flags[BELLHOP.progressFlag] = result.progress;
      if (result.verdict === 'hit') {
        this._say(`bellhop_step_${result.progress - 1}_${tick}`, bellhopStepLine(result.progress - 1), 4);
        return;
      }
      // The phrase landed — the song holds. The fee pays once ever; the tuned
      // stamps ride the crystals so a re-hung spare comes back holding its note.
      flags[BELLHOP.sungFlag] = true;
      for (const e of this._crystals()) e.data.bellhopTuned = true;
      if (flags[BELLHOP.paidFlag] !== true) {
        flags[BELLHOP.paidFlag] = true;
        this.bus?.emit('economy:grantCredits', { amount: BELLHOP.payCr, reason: 'bellhop:song' });
      }
      this._say('bellhop_sung', BELLHOP.sungLine, 9);
    },
    /** Kill reports read the victim by id. A dead crystal is owed back to the
     *  floor; a dead tuner is durable — the crystals keep their own time. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data || victim.data.bellhop !== true) return;
      const flags = this._flags();
      if (flags && flags[BELLHOP.goneFlag] !== true) {
        flags[BELLHOP.goneFlag] = true;
        this._say('bellhop_gone', BELLHOP.goneLine, 9);
      }
    },
    /** The calendar pass: walk the drone home through the impulse membrane and
     *  keep the floor stocked. The judging itself is event-driven — a ring is
     *  a physics fact, not a census guess. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const dv = bellhopDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
    },
  };
}

export const bellhop = createBellhop();
