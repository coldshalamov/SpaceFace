// W-SHIFT (row 506, 03 §4.3): HOLDFAST / AN-1 — the ice-anchor holding the rift.
// Haumea's fissure kept the tools and the shift that left them. An ice-anchor
// robot stands the lip with four clamp sockets and a crack that never stops
// running. Tow a drifting ice spire into an empty socket and the seat knocks
// the meter back; seat all four before the crack tops out and the rift holds —
// and AN-1 pays one weighed Measure Engine fragment, the same verge contract
// TARE and SHEPHERD-12 stamp, because a held rift is the Line's own arithmetic
// (06: the three trial members). Top the crack out instead and it shakes the
// oldest seat loose — the holding resumes, because the holding is the job.
//
// WHAT THIS OWNS — the robot hull, the drift spires and the paid fragment
// (one-off event seams: init / deferred sector-enter / save:loaded / newGame),
// the crack meter and held/paid/gone receipts in story flags, the seat ledger
// stamped on each anchored spire, and the calendar census that advances the
// crack, seats one spire a pass, and walks the robot home through the impulse
// membrane. Nothing here reads or writes entity.vel — even the crack-run shake
// goes through queuePhysicsImpulse.
import { HOLDFAST } from '../data/holdfast.js';
import {
  holdfastClampSpot, holdfastSpireSpot, holdfastSocketFor, holdfastCrackAfter,
  holdfastSpireOwed, holdfastDriftHome, holdfastFragmentSpot,
} from '../characters/holdfastRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { VERGE_LINE_TRIAL } from '../data/factions/vergelayers.js';

export function holdfastSpec() {
  return {
    type: 'drone',
    pos: { ...HOLDFAST.post }, vel: { x: 0, z: 0 },
    radius: 13, mass: 55, hull: 280, hullMax: 280,
    homeSectorId: HOLDFAST.sectorId,
    data: {
      holdfast: true, authoredCharacter: 'holdfast', parentType: 'story_prop',
      callsign: HOLDFAST.callsign,
      scanLabel: 'HOLDFAST / AN-1 — ice-anchor, four clamps, one verb',
      scannerSignalKind: 'salvage',
      homeSectorId: HOLDFAST.sectorId,
    },
  };
}

export function holdfastSpireSpec(index) {
  return {
    type: 'debris',
    pos: { ...holdfastSpireSpot(index) }, vel: { x: 0, z: 0 },
    radius: 11, mass: 90, hull: 70, hullMax: 70,
    homeSectorId: HOLDFAST.sectorId,
    data: {
      holdfastSpire: true, holdfastSpireIndex: index,
      runtimeOwner: 'holdfast', parentType: 'story_prop',
      callsign: 'DRIFT SPIRE',
      scanLabel: 'drift ice spire — rift shrapnel the anchor can use',
      scannerSignalKind: 'salvage',
      homeSectorId: HOLDFAST.sectorId,
    },
  };
}

export function holdfastFragmentSpec(spot, robotId, simTime) {
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 12, hull: 40, hullMax: 40,
    homeSectorId: HOLDFAST.sectorId,
    data: {
      holdfastFragment: true, runtimeOwner: 'holdfast', parentType: 'story_prop',
      callsign: 'MEASURE FRAGMENT',
      scanLabel: 'Measure Engine fragment — held, Line-trial currency',
      scannerSignalKind: 'anomaly',
      homeSectorId: HOLDFAST.sectorId,
      typeId: VERGE_LINE_TRIAL.fragmentTypeId,
      weighedMass: 12, weighedBy: robotId, weighedAt: simTime,
    },
  };
}

export function createHoldfast() {
  return {
    name: 'holdfast',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      this._lastT = null; // crack baseline — re-anchored on every seam, never dt-guessed
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const seam = () => { this._announced = false; this._lastT = null; };
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
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === HOLDFAST.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.holdfast === true) return e;
      }
      return null;
    },
    _spires() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.holdfastSpire === true);
    },
    _anchored() {
      return this._spires().filter((e) => e.data?.holdfastAnchored === true);
    },
    _claimed() {
      const claimed = new Set();
      for (const e of this._anchored()) {
        const i = Number(e.data?.holdfastClamp);
        if (Number.isInteger(i)) claimed.add(i);
      }
      return claimed;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.holdfast === true || e.data?.holdfastSpire === true
            || e.data?.holdfastFragment === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: HOLDFAST.sender, category: 'story', text, ttl, persist: false,
      });
    },
    /** Top the drift stock back to the authored count — a spire the clamps seat
     *  or violence breaks is owed back to the rift, which keeps spalling. Free
     *  seat indexes come from data stamps, never entity ids. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const spires = this._spires();
      const anchored = spires.filter((e) => e.data?.holdfastAnchored === true).length;
      const owed = holdfastSpireOwed(spires.length - anchored, anchored);
      if (owed <= 0) return;
      const taken = new Set();
      for (const e of spires) {
        const i = Number(e.data?.holdfastSpireIndex);
        if (Number.isInteger(i)) taken.add(i);
      }
      for (let i = 0, n = 0; i < HOLDFAST.spireCount && n < owed; i += 1) {
        if (taken.has(i)) continue;
        this.helpers.spawnEntity(holdfastSpireSpec(i));
        n += 1;
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[HOLDFAST.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(holdfastSpec());
      }
      this._housekeep();
      if (!gone && !this._announced) {
        this._announced = true;
        const held = flags?.[HOLDFAST.heldFlag] === true;
        this._say('holdfast_announce', held ? HOLDFAST.holdingLine : HOLDFAST.announce, 9);
      }
    },
    /** Kill reports read the victim by id. A dead spire frees nothing but its
     *  body — an anchored one's socket simply stands empty again when the seat
     *  ledger re-reads the live stamps. A dead anchor robot is durable: the
     *  seated ice stays seated, but nothing holds the post. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data || victim.data.holdfast !== true) return;
      const flags = this._flags();
      if (flags && flags[HOLDFAST.goneFlag] !== true) {
        flags[HOLDFAST.goneFlag] = true;
        this._say('holdfast_gone', HOLDFAST.goneLine, 9);
      }
    },
    /** The calendar census: walk the robot home, seat the first spire parked in
     *  an empty socket (one seat per pass — the clamps close deliberately), then
     *  run the meter. A seat knocks the crack back before it climbs; topping it
     *  out shakes the lowest seat loose through the impulse membrane and the
     *  meter falls to the run floor. All four sockets claimed is RIFT HELD —
     *  the first time pays the fragment; later holds speak the verb. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const flags = this._flags();
      if (!flags) return;
      const dv = holdfastDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
      // The seat pass: one spire per census, lowest free socket it parks in.
      const claimed = this._claimed();
      if (claimed.size < HOLDFAST.clampCount) {
        for (const e of this._spires()) {
          const socket = holdfastSocketFor(e, robot.pos, HOLDFAST.clampCount, claimed);
          if (socket < 0) continue;
          e.data.holdfastAnchored = true;
          e.data.holdfastClamp = socket;
          e.data.holdfastAnchoredBy = robot.id;
          e.data.holdfastAnchoredAt = Number(s.simTime) || 0;
          flags[HOLDFAST.crackFlag] = holdfastCrackAfter(flags[HOLDFAST.crackFlag], 0, 1);
          this._say(`holdfast_seat_${socket}_${s.tick}`, HOLDFAST.seatLine, 6);
          claimed.add(socket);
          break;
        }
      }
      // The crack climbs on elapsed sim time — the baseline re-anchors on seams
      // so a save/enter never bills the meter for time it did not run.
      const now = Number(s.simTime) || 0;
      const last = this._lastT == null ? now : this._lastT;
      this._lastT = now;
      const crack = holdfastCrackAfter(flags[HOLDFAST.crackFlag], Math.max(0, now - last), 0);
      flags[HOLDFAST.crackFlag] = crack;
      if (crack >= HOLDFAST.crackMax) {
        // The run: the oldest seat gives — unstamp it and throw it off the lip
        // through the impulse membrane (a fast body is mid-throw, never a seat).
        flags[HOLDFAST.crackFlag] = HOLDFAST.crackRunFloor;
        const anchored = this._anchored().sort((a, b) => a.data.holdfastClamp - b.data.holdfastClamp)[0];
        if (anchored) {
          anchored.data.holdfastAnchored = false;
          delete anchored.data.holdfastClamp;
          const dx = anchored.pos.x - robot.pos.x, dz = anchored.pos.z - robot.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const shake = HOLDFAST.seatSpeed * 3;
          if (anchored.mass > 0) {
            queuePhysicsImpulse(anchored, { x: (dx / d) * shake * anchored.mass, z: (dz / d) * shake * anchored.mass }, { tick: s.tick });
          }
        }
        this._say(`holdfast_ran_${s.tick}`, HOLDFAST.crackRanLine, 7);
      }
      // RIFT HELD — every socket claimed while the robot stands. The flag is the
      // durable receipt; the fragment pays once ever; later re-holds speak the verb.
      const full = this._claimed().size >= HOLDFAST.clampCount;
      if (full && flags[HOLDFAST.heldFlag] !== true) {
        flags[HOLDFAST.heldFlag] = true;
        if (flags[HOLDFAST.paidFlag] !== true) {
          flags[HOLDFAST.paidFlag] = true;
          if (this.helpers.spawnEntity) {
            this.helpers.spawnEntity(holdfastFragmentSpec(holdfastFragmentSpot(), robot.id, s.simTime));
          }
          this._say('holdfast_held', HOLDFAST.heldLine, 9);
        } else {
          this._say(`holdfast_holding_${s.tick}`, HOLDFAST.holdingLine, 7);
        }
      } else if (!full) {
        flags[HOLDFAST.heldFlag] = false; // a shaken seat re-arms the hold
      }
    },
  };
}

export const holdfast = createHoldfast();
