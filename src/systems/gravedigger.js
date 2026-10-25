// W-SHIFT (row 506, 03 §4.3): GRAVEDIGGER / UG-4 — the machine that buries
// wrecks into gardens. Eunomia Gulf is a wreck field and the ground keeps its
// own ledger. UG-4 races you for loose hulls: the nearest unmarked, un-towed
// wreck inside its pursuit range gets run down and put IN THE GROUND —
// consumed where it lay and a garden bed planted on the grave. The beds
// persist through a flag ledger of spots+serials the way planted lamps do.
// Three burials earns the lesson the machine was built to teach: park a wreck
// settled in the pit at its feet and the ground pays you back — composting,
// a standing sell-price for hulls nobody disputes. 'Everything goes in the
// ground. Even the ground.'
//
// WHAT THIS OWNS — the robot hull and the garden beds (one-off event seams:
// init / deferred sector-enter / save:loaded / newGame), the garden ledger and
// serial/taught/gone receipts in story flags, the chase steering and bury and
// compost passes on the calendar census — every hull motion through
// queuePhysicsImpulse, never entity.vel.
import { GRAVEDIGGER } from '../data/gravedigger.js';
import {
  gravediggerBuryable, gravediggerTarget, gravediggerCanBury,
  gravediggerCompostable, gravediggerSteerDeltaV, gravediggerDriftHome,
  gravediggerGardenOwed,
} from '../characters/gravediggerRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function gravediggerSpec() {
  return {
    type: 'drone',
    pos: { ...GRAVEDIGGER.post }, vel: { x: 0, z: 0 },
    radius: 13, mass: 70, hull: 320, hullMax: 320,
    homeSectorId: GRAVEDIGGER.sectorId,
    data: {
      gravedigger: true, authoredCharacter: 'gravedigger', parentType: 'story_prop',
      callsign: GRAVEDIGGER.callsign,
      scanLabel: 'GRAVEDIGGER / UG-4 — burying the gulf into a garden',
      scannerSignalKind: 'salvage',
      homeSectorId: GRAVEDIGGER.sectorId,
    },
  };
}

export function gravediggerGardenSpec(spot, serial) {
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z }, vel: { x: 0, z: 0 },
    radius: 16, mass: 420, hull: 500, hullMax: 500,
    homeSectorId: GRAVEDIGGER.sectorId,
    data: {
      gravediggerGarden: true, gravediggerGardenSerial: serial,
      runtimeOwner: 'gravedigger', parentType: 'story_prop',
      callsign: 'WRECK GARDEN',
      scanLabel: 'a buried wreck — something is growing in it',
      scannerSignalKind: 'anomaly',
      homeSectorId: GRAVEDIGGER.sectorId,
    },
  };
}

export function createGravedigger() {
  return {
    name: 'gravedigger',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const seam = () => { this._announced = false; };
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
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _gardens() {
      const flags = this._flags();
      if (!flags) return [];
      if (!Array.isArray(flags[GRAVEDIGGER.gardensFlag])) flags[GRAVEDIGGER.gardensFlag] = [];
      return flags[GRAVEDIGGER.gardensFlag];
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === GRAVEDIGGER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gravedigger === true) return e;
      }
      return null;
    },
    _liveGardens() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.gravediggerGarden === true);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.gravedigger === true || e.data?.gravediggerGarden === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 6) {
      this.bus?.emit('comms:popup', {
        id, sender: GRAVEDIGGER.sender, category: 'story', text, ttl, persist: false,
      });
    },
    /** The plot owes its ledger: every recorded bed needs a live garden wearing
     *  its serial — a bed shot to pieces re-settles on the same grave, the way
     *  a killed lamp leaves a hole the next buoy replants. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const live = new Set();
      for (const e of this._liveGardens()) live.add(Number(e.data?.gravediggerGardenSerial));
      for (const g of gravediggerGardenOwed(this._gardens(), live)) {
        this.helpers.spawnEntity(gravediggerGardenSpec(g, g.serial));
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[GRAVEDIGGER.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(gravediggerSpec());
      }
      this._housekeep();
      if (!gone && !this._announced) {
        this._announced = true;
        const taught = flags?.[GRAVEDIGGER.taughtFlag] === true;
        this._say('gravedigger_announce', taught ? GRAVEDIGGER.teachLine : GRAVEDIGGER.announce, 9);
      }
    },
    /** A burial: the wreck is consumed where it lay and a bed is recorded in
     *  the flag ledger (spot + serial), capped at the plot's count — past it
     *  the ground still takes hulls into the old beds. Returns true if the
     *  wreck was taken. */
    _bury(wreck, { pay = false } = {}) {
      const flags = this._flags();
      if (!flags || !wreck?.alive) return false;
      const gardens = this._gardens();
      const serial = (Number(flags[GRAVEDIGGER.serialFlag]) || 0) + 1;
      flags[GRAVEDIGGER.serialFlag] = serial;
      if (gardens.length < GRAVEDIGGER.gardenMax && this.helpers.spawnEntity) {
        const bed = { x: wreck.pos.x, z: wreck.pos.z, serial };
        gardens.push(bed);
        this.helpers.spawnEntity(gravediggerGardenSpec(bed, serial));
      }
      this.helpers?.removeEntity?.(wreck.id);
      if (pay) {
        this.bus?.emit('economy:grantCredits', { amount: GRAVEDIGGER.compostFee, reason: 'gravedigger:compost' });
      }
      if (flags[GRAVEDIGGER.taughtFlag] !== true && gardens.length >= GRAVEDIGGER.teachAfter) {
        flags[GRAVEDIGGER.taughtFlag] = true;
        this._say('gravedigger_teach', GRAVEDIGGER.teachLine, 10);
      }
      return true;
    },
    /** Kill reports read the victim by id. A dead gardener is durable: the
     *  beds persist, but nobody chases, nobody pays. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data || victim.data.gravedigger !== true) return;
      const flags = this._flags();
      if (flags && flags[GRAVEDIGGER.goneFlag] !== true) {
        flags[GRAVEDIGGER.goneFlag] = true;
        this._say('gravedigger_gone', GRAVEDIGGER.goneLine, 9);
      }
    },
    /** The calendar pass: restock the beds, then the robot's two jobs. A
     *  taught pit offering composts first — it pays, plants, and the machine
     *  never has to leave home; otherwise the nearest loose wreck in range is
     *  the grave it runs down next. One burial per pass. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const flags = this._flags();
      if (!flags) return;
      // The pit: post-teach, an offered hull pays the fee and becomes a bed.
      if (flags[GRAVEDIGGER.taughtFlag] === true) {
        const offering = (s.entityList || []).find((e) => gravediggerCompostable(e, GRAVEDIGGER.post));
        if (offering) {
          const full = this._gardens().length >= GRAVEDIGGER.gardenMax;
          this._bury(offering, { pay: true });
          this._say(`gravedigger_compost_${s.tick}`, full ? GRAVEDIGGER.fullLine : GRAVEDIGGER.compostLine, 6);
          return;
        }
      }
      // The race: the nearest eligible wreck is the next grave. Towed and
      // beamed hulls are the client's — the shared law plus the live marks.
      const engaged = this._engagedIds(s);
      const eligible = (e) => gravediggerBuryable(e, robot.pos) && !(engaged && engaged.has(e.id));
      const target = gravediggerTarget(robot.pos, s.entityList, eligible);
      if (target) {
        if (gravediggerCanBury(target, robot.pos)) {
          this._bury(target);
          this._say(`gravedigger_bury_${s.tick}`, GRAVEDIGGER.buryLine, 5);
          return;
        }
        const dv = gravediggerSteerDeltaV(robot, target.pos);
        if (dv && robot.mass > 0) {
          queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
        }
        return;
      }
      const dv = gravediggerDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
    },
    _engagedIds(s) {
      const player = s?.player;
      let ids = null;
      const tether = player?.tether;
      if (tether && tether.active && tether.targetId != null) (ids || (ids = new Set())).add(tether.targetId);
      if (player?.miningTargetId != null) (ids || (ids = new Set())).add(player.miningTargetId);
      return ids;
    },
  };
}

export const gravedigger = createGravedigger();
