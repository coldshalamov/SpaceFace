// W-SHIFT (row 506, 03 §4.3): SHEPHERD-12 — the broken shepherd herding debris
// flocks. Orcus Shadow's Tide pins debris in a slow ring around the shadow, and a
// burned-out Verge Shepherd Engine walks its edge. It cannot pull the flock, so it
// does the one thing a shepherd with no coil can still do — it counts. Push the
// strays back inside the ring and the census reports them home; when every living
// member stands inside, it says the truth it was built to say: FLOCK: PRESENT. The
// first whole flock pays one weighed Measure Engine fragment — the same
// verge_measure_fragment + weighedMass contract TARE's scale stamps — because a
// Shepherd Engine is the Line's kin and its count IS a weighing (06: SHEPHERD-12
// is one of the three members that unlock a Line Class trial). Then the tide waits
// a while and shies the next strays loose, because the count never ends.
//
// WHAT THIS OWNS — the shepherd hull, the flock members it stamped, and its paid
// fragment (one-off event seams: init / deferred sector-enter / save:loaded /
// newGame), the flock/stride ledgers in story flags, the patrol walk through the
// impulse membrane, and the calendar census that counts shy members home. Nothing
// here reads or writes entity.vel — the shepherd is a live dynamic body, so its
// patrol goes through queuePhysicsImpulse.
import { SHEPHERD12 } from '../data/shepherd12.js';
import {
  shepherd12MemberSpot, shepherd12StraySpot, shepherd12FragmentSpot, shepherd12Member,
  shepherd12Shy, shepherd12MemberOwed, shepherd12PatrolLeg, shepherd12PatrolDeltaV,
  shepherd12ShyLine, shepherd12HomeLine,
} from '../characters/shepherd12Rules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { VERGE_LINE_TRIAL } from '../data/factions/vergelayers.js';

export function shepherd12Spec() {
  return {
    type: 'drone',
    pos: {
      x: SHEPHERD12.flockCenter.x + SHEPHERD12.patrolRadius,
      z: SHEPHERD12.flockCenter.z,
    },
    vel: { x: 0, z: 0 },
    radius: 14, mass: 70, hull: 300, hullMax: 300,
    homeSectorId: SHEPHERD12.sectorId,
    data: {
      shepherd12: true, authoredCharacter: 'shepherd_12', parentType: 'story_prop',
      callsign: SHEPHERD12.callsign,
      scanLabel: 'SHEPHERD-12 — broken shepherd, herding the tide',
      scannerSignalKind: 'salvage',
      homeSectorId: SHEPHERD12.sectorId,
    },
  };
}

export function shepherd12MemberSpec(index, straySeq) {
  // A member is a piece of The Tide's debris: a strut of hull the ring pinned.
  // `memberIndex` is its authored seat; `straySeq` is the tide's serial — indexes
  // are data stamps, never entity ids, so a recycled id inherits nothing.
  const stray = straySeq != null;
  const spot = stray
    ? shepherd12StraySpot(straySeq, SHEPHERD12.flockCenter)
    : shepherd12MemberSpot(index, SHEPHERD12.flockCenter);
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z },
    vel: { x: 0, z: 0 },
    radius: 9, mass: 26, hull: 60, hullMax: 60,
    homeSectorId: SHEPHERD12.sectorId,
    data: {
      shepherdFlock: true, shepherdMemberIndex: index,
      runtimeOwner: 'shepherd_12', parentType: 'story_prop',
      callsign: 'FLOCK MEMBER',
      scanLabel: 'tide debris — one of the flock SHEPHERD-12 counts',
      scannerSignalKind: 'salvage',
      homeSectorId: SHEPHERD12.sectorId,
    },
  };
}

export function shepherd12FragmentSpec(spot, robotId, simTime) {
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 12, hull: 40, hullMax: 40,
    homeSectorId: SHEPHERD12.sectorId,
    data: {
      shepherdFragment: true, runtimeOwner: 'shepherd_12', parentType: 'story_prop',
      callsign: 'MEASURE FRAGMENT',
      scanLabel: 'Measure Engine fragment — counted, Line-trial currency',
      scannerSignalKind: 'anomaly',
      homeSectorId: SHEPHERD12.sectorId,
      // The Class-trial contract (src/systems/faction_verge.js _tickLineTrial): a
      // fragment on the player's Line whose mass a Line machine has recorded.
      typeId: VERGE_LINE_TRIAL.fragmentTypeId,
      weighedMass: 12, weighedBy: robotId, weighedAt: simTime,
    },
  };
}

export function createShepherd12() {
  return {
    name: 'shepherd12',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      this._shy = new Set();   // member objects currently counted out
      this._leg = null;        // which patrol leg it is walking (re-derived on seam)
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const seam = () => {
        this._announced = false;
        this._shy = new Set();
        this._leg = null;
      };
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
      this._shy = new Set();
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === SHEPHERD12.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.shepherd12 === true) return e;
      }
      return null;
    },
    _members() {
      return (this.state?.entityList || []).filter((e) => e?.alive && shepherd12Member(e));
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.shepherd12 === true || e.data?.shepherdFlock === true
            || e.data?.shepherdFragment === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: SHEPHERD12.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _nextStraySeq() {
      const flags = this._flags();
      const seq = (Number(flags?.shepherd_straySeq) || SHEPHERD12.flockCount);
      if (flags) flags.shepherd_straySeq = seq + 1;
      return seq;
    },
    /** The two housekeeping passes: top the flock back up to the authored count —
     *  a member shot to pieces comes back as a new stray, because the tide replaces
     *  what violence removes — and, once the last flock reported whole, wait the
     *  authored beat and shy the next strays loose. The count never ends. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const flags = this._flags();
      let members = this._members();
      // First materialization lays the authored flock: three strays already shy,
      // four riding the ring. Every later restock comes back SHY — the tide
      // re-pins what violence removes, but it never hands a member back inside.
      if (flags && flags.shepherd_seeded !== true && members.length === 0) {
        for (let i = 0; i < SHEPHERD12.flockCount; i += 1) {
          this.helpers.spawnEntity(shepherd12MemberSpec(i, null));
        }
        flags.shepherd_seeded = true;
        members = this._members();
      }
      const owed = shepherd12MemberOwed(members.length);
      for (let i = 0; i < owed; i += 1) {
        const seq = this._nextStraySeq();
        this.helpers.spawnEntity(shepherd12MemberSpec(seq, seq));
      }
      // The wave: a whole flock earns a quiet beat, then the tide gives new strays.
      if (!flags) return;
      const waveAt = Number(flags[SHEPHERD12.waveFlag]);
      if (!Number.isFinite(waveAt) || this.state.simTime < waveAt) return;
      // Re-read the flock: restocked strays are shy by construction, and a wave
      // must never loose extra strays into a flock already shy — the cap counts
      // the shy the restock just made, not the snapshot before it.
      members = this._members();
      const shyNow = members.filter((m) => shepherd12Shy(m)).length;
      if (shyNow > 0) { delete flags[SHEPHERD12.waveFlag]; return; }
      const straysToLoose = Math.min(SHEPHERD12.waveStrays, SHEPHERD12.strayCap - shyNow);
      for (let i = 0; i < straysToLoose; i += 1) {
        const seq = this._nextStraySeq();
        this.helpers.spawnEntity(shepherd12MemberSpec(seq, seq));
      }
      delete flags[SHEPHERD12.waveFlag];
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[SHEPHERD12.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(shepherd12Spec());
      }
      this._housekeep();
      if (!gone && !this._announced) {
        this._announced = true;
        this._say('shepherd12_announce', SHEPHERD12.announce, 9);
      }
    },
    /** Kill reports read the victim by id — the bus hears it after alive=false, so
     *  a live-only scan never sees its own corpse. A lost member is a shy member
     *  the tide owes back. A killed shepherd is durable: it never re-walks the
     *  ring, and the flock outlives it the way the lamps outlive the lamplighter. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data) return;
      if (victim.data.shepherd12 === true) {
        const flags = this._flags();
        if (flags && flags[SHEPHERD12.goneFlag] !== true) {
          flags[SHEPHERD12.goneFlag] = true;
          this._say('shepherd12_gone', SHEPHERD12.goneLine, 9);
        }
        return;
      }
      if (victim.data.shepherdFlock === true) {
        this._shy.delete(victim);
        this._say(`shepherd12_lost_${victim.id}`, SHEPHERD12.lostLine, 5);
      }
    },
    /** The calendar census: walk the patrol leg (impulse-membrane steering, never
     *  a vel write), keep the flock stocked, and count the shy. A member the ledger
     *  last counted out that now stands inside the ring is ONE HOME; a census with
     *  nobody shy is FLOCK: PRESENT — the first of those pays the fragment, every
     *  one of them arms the next wave. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const flags = this._flags();
      if (!flags) return;
      // The patrol: a broken engine still walks the edge it cannot pull. The leg is
      // in-memory — a seam re-derives it from where the hull actually stands.
      if (this._leg == null) this._leg = shepherd12PatrolLeg(robot.pos);
      const dv = shepherd12PatrolDeltaV(robot, this._leg);
      if (dv) {
        if (dv.arrived) this._leg += 1;
        if (robot.mass > 0) {
          queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
        }
      }
      // The count. `this._shy` keys member OBJECTS, not ids — a recycled id can
      // never inherit a stray's shame. PRESENT is a state, not an event: it is
      // counted once per shy→whole transition via the durable whole flag, so a
      // quiet census never re-speaks a flock already reported.
      const members = this._members();
      const shyNow = new Set(members.filter((m) => shepherd12Shy(m)));
      const cameHome = [...this._shy].filter((m) => !shyNow.has(m));
      this._shy = shyNow;
      const stillOut = shyNow.size;
      if (stillOut > 0) {
        const wasWhole = flags.shepherd_whole === true;
        flags.shepherd_whole = false;
        if (wasWhole) {
          this._say(`shepherd12_shy_${flags[SHEPHERD12.flocksFlag]}`, shepherd12ShyLine(stillOut), 6);
        }
        if (cameHome.length > 0) {
          this._say(`shepherd12_home_${s.tick}`, shepherd12HomeLine(stillOut, cameHome.length), 5);
        }
        return;
      }
      if (members.length === 0 || flags.shepherd_whole === true) return;
      // Nobody shy — every living member is inside. Say the count.
      flags.shepherd_whole = true;
      flags[SHEPHERD12.flocksFlag] = (Number(flags[SHEPHERD12.flocksFlag]) || 0) + 1;
      const first = flags[SHEPHERD12.paidFlag] !== true;
      if (first) {
        flags[SHEPHERD12.paidFlag] = true;
        if (this.helpers.spawnEntity) {
          this.helpers.spawnEntity(shepherd12FragmentSpec(
            shepherd12FragmentSpot(), robot.id, s.simTime));
        }
        this._say('shepherd12_paid', SHEPHERD12.paidLine, 9);
      } else {
        this._say(`shepherd12_flock_${flags[SHEPHERD12.flocksFlag]}`, SHEPHERD12.flockPresent, 7);
      }
      // The tide's patience: a beat of quiet, then new strays — the count resumes.
      flags[SHEPHERD12.waveFlag] = (Number(s.simTime) || 0) + SHEPHERD12.waveDelay;
    },
  };
}

export const shepherd12 = createShepherd12();
