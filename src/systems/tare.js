// W-SHIFT (row 506, 03 §4.3): TARE / WG-2 — the weighing robot on the dead scale deck.
// A marked robot hull keeps the decommissioned weigh bay off the Dione Exchange apron.
// Whatever physical body settles on its plate gets weighed and stamped under the same
// weighedMass contract the Measure Engines use — the stamp is real testimony for the
// Sleeping Jury and the trial machinery. Hit the requested mass inside its tolerance
// and it pays one weighed Measure Engine fragment: `verge_measure_fragment` +
// `weighedMass`, which is exactly what faction_verge's Line-site Class trial consumes —
// tow the payment on your Line and the trial records the Class. Four steps pay four
// fragments; after the last, the scale keeps reading but stops paying.
//
// WHAT THIS OWNS — the robot body and its paid fragments (one-off event seams: init /
// deferred sector-enter / save:loaded / newGame), the ladder step in story flags, the
// weigh-stamp on deck bodies, and the calendar census pass that reads the plate.
// Fragment consumption stays faction_verge's; this only mints the weighed token.
import { TARE } from '../data/tare.js';
import {
  tareWeighable, tareTargetAt, tareMatches, tareReadLine, tareTargetLine, tareFragmentSpot,
} from '../characters/tareRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { VERGE_LINE_TRIAL } from '../data/factions/vergelayers.js';

export function tareSpec() {
  return {
    type: 'drone',
    pos: { ...TARE.post }, vel: { x: 0, z: 0 },
    radius: 14, mass: 60, hull: 300, hullMax: 300,
    homeSectorId: TARE.sectorId,
    data: {
      tare: true, authoredCharacter: 'tare', parentType: 'story_prop',
      callsign: TARE.callsign,
      scanLabel: 'TARE / WG-2 — weighing robot, dead scale deck',
      scannerSignalKind: 'salvage',
      homeSectorId: TARE.sectorId,
    },
  };
}

export function tareFragmentSpec(mass, spot, robotId, simTime) {
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z }, vel: { x: 0, z: 0 },
    radius: 6, mass, hull: 40, hullMax: 40,
    homeSectorId: TARE.sectorId,
    data: {
      tareFragment: true, parentType: 'story_prop',
      callsign: 'MEASURE FRAGMENT',
      scanLabel: 'Measure Engine fragment — weighed, Line-trial currency',
      scannerSignalKind: 'anomaly',
      homeSectorId: TARE.sectorId,
      // The Class-trial contract (src/systems/faction_verge.js _tickLineTrial): a
      // fragment on the player's Line whose mass a weighing machine has recorded.
      typeId: VERGE_LINE_TRIAL.fragmentTypeId,
      weighedMass: mass, weighedBy: robotId, weighedAt: simTime,
    },
  };
}

export function createTare() {
  return {
    name: 'tare',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._announced = false;
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { this._announced = false; this._sync(); });
      on('game:newGame', () => { this._announced = false; this._sync(); });
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
        && this.state?.world?.currentSectorId === TARE.sectorId;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.tare === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.tare === true || e.data?.tareFragment === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: TARE.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const robot = this._robot() || (this.helpers.spawnEntity && this.helpers.spawnEntity(tareSpec()));
      if (!robot) return;
      // One hail per arrival: the tare-set call plus the open request. In-memory —
      // a returning pilot gets the price board again; a finished scale hails once.
      if (!this._announced) {
        this._announced = true;
        const flags = this._flags();
        const step = flags ? (Number(flags[TARE.stepFlag]) || 0) : 0;
        const target = tareTargetAt(step);
        this._say('tare_set', target == null
          ? TARE.tareSet
          : `${TARE.tareSet} ${tareTargetLine(target)}`, 9);
      }
    },
    /** The calendar census: weigh every settled body on the plate, stamp it under
     *  the Measure contract (weighedMass/weighedBy/weighedAt — real testimony the
     *  Sleeping Jury and trial read), speak the reading once per body per visit,
     *  and pay a fragment when a body answers the open request. The stamp rides
     *  entity data so a save:loaded restore keeps the testimony; the spoken-read
     *  marker clears when the body leaves the plate, so a return gets re-read. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const flags = this._flags();
      const step = flags ? (Number(flags[TARE.stepFlag]) || 0) : 0;
      const target = tareTargetAt(step);
      for (const e of s.entityList || []) {
        if (!e || e === robot) continue;
        if (!tareWeighable(e)) {
          if (e.data && e.data.tareRead === true) delete e.data.tareRead;
          continue;
        }
        e.data = e.data || {};
        // Weigh it: the stamp is the same contract a Measure Engine writes, so a
        // body TARE has read counts as testimony anywhere the Verge law reads it.
        if (e.data.weighedBy !== robot.id || e.data.weighedMass !== e.mass) {
          e.data.weighedMass = e.mass;
          e.data.weighedBy = robot.id;
          e.data.weighedAt = Number(s.simTime) || 0;
          this.bus?.emit('verge:massWeighed', {
            engineId: robot.id, entityId: e.id, mass: e.mass, tick: s.tick,
          });
        }
        if (e.data.tareRead !== true) {
          e.data.tareRead = true;
          this._say(`tare_read_${e.id}`, tareReadLine(e.mass), 5);
          if (target != null) {
            this._say(`tare_verdict_${e.id}`,
              tareMatches(e.mass, target) ? TARE.massCorrect : TARE.massIncorrect, 6);
          }
        }
        if (target == null || !tareMatches(e.mass, target)) continue;
        // A match answers the open request: pay one weighed fragment, step the
        // ladder, and keep processing — two true bodies can climb two steps.
        if (flags) {
          flags[TARE.stepFlag] = step + 1;
          flags[TARE.paidFlag] = (Number(flags[TARE.paidFlag]) || 0) + 1;
          const paid = flags[TARE.paidFlag];
          if (this.helpers.spawnEntity) {
            this.helpers.spawnEntity(
              tareFragmentSpec(TARE.fragmentMass, tareFragmentSpot(paid), robot.id, s.simTime));
          }
          const next = tareTargetAt(step + 1);
          if (next != null) {
            this._say(`tare_next_${step}`, tareTargetLine(next), 7);
          } else {
            flags[TARE.masteryFlag] = true;
            this._say('tare_mastery', TARE.masteryLine, 9);
          }
        }
        // Only the FIRST matching body answers a request — the scale weighs one
        // petition at a time; the rest wait their turn on the next pass.
        return;
      }
    },
  };
}

export const tare = createTare();
