// W-SHIFT (row 506, 03 §4.3): LAMPLIGHTER / LL-6 — who relights the dead rim buoys.
// Sedna Dark is the unlit rim: a survey post, no fuel, and a route the dark never let
// anyone finish. A marked robot hull keeps the relight post; tow one of the dead lane
// buoys drifting the rim into its arms and it plants the relit lamp on the old lane
// path — one light per buoy, lowest dark slot first, until the sixth lamp is the last
// buoy and the rim is lit. The lit record is a slot bitmask in story flags, so the
// path survives the save and the return trip; the dead stock is the sector's, and a
// buoy shot to pieces is replaced the way a dead lane marker persists.
//
// WHAT THIS OWNS — the robot hull, the drifting dead stock, and the planted lamps
// (one-off event seams: init / deferred sector-enter / save:loaded / newGame), the lit
// bitmask and rim/gone receipts in story flags, and the calendar census that accepts a
// settled delivery, keeps the seats honest, and walks the robot home through the
// impulse membrane. Nothing here reads or writes entity.vel — the robot is a live
// dynamic body, so steering goes through queuePhysicsImpulse.
import { LAMPLIGHTER } from '../data/lamplighter.js';
import {
  lamplighterDeadSpot, lamplighterSlotSpot, lamplighterArmable, lamplighterDeadOwed,
  lamplighterLitCount, lamplighterFirstDark, lamplighterMaskSet, lamplighterMaskClear,
  lamplighterDriftHome,
} from '../characters/lamplighterRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function lamplighterSpec() {
  return {
    type: 'drone',
    pos: { ...LAMPLIGHTER.post }, vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 250, hullMax: 250,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighter: true, authoredCharacter: 'lamplighter', parentType: 'story_prop',
      callsign: LAMPLIGHTER.callsign,
      scanLabel: 'LAMPLIGHTER / LL-6 — relights the dead rim buoys',
      scannerSignalKind: 'salvage',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function lamplighterDeadSpec(index) {
  return {
    type: 'debris',
    pos: { ...lamplighterDeadSpot(index) }, vel: { x: 0, z: 0 },
    radius: 7, mass: 24, hull: 60, hullMax: 60,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterDead: true, lamplighterDeadIndex: index, parentType: 'story_prop',
      callsign: 'DEAD LANE BUOY',
      scanLabel: 'dead lane buoy — dark hardware on the unlit lane',
      scannerSignalKind: 'salvage',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function lamplighterLampSpec(slot) {
  return {
    type: 'debris',
    pos: { ...lamplighterSlotSpot(slot) }, vel: { x: 0, z: 0 },
    radius: 7, mass: 60, hull: 80, hullMax: 80,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterLamp: true, lamplighterSlot: slot, parentType: 'story_prop',
      callsign: 'LIT LANE LAMP',
      scanLabel: 'lit lane lamp — the light the dark lost',
      scannerSignalKind: 'anomaly',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function createLamplighter() {
  return {
    name: 'lamplighter',
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
        && this.state?.world?.currentSectorId === LAMPLIGHTER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.lamplighter === true) return e;
      }
      return null;
    },
    _deadAlive() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.lamplighterDead === true);
    },
    _lampsAlive() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.lamplighterLamp === true);
    },
    _litMask() {
      const flags = this._flags();
      return flags ? (Number(flags[LAMPLIGHTER.litFlag]) || 0) : 0;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.lamplighter === true || e.data?.lamplighterDead === true
            || e.data?.lamplighterLamp === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: LAMPLIGHTER.sender, category: 'story', text, ttl, persist: false,
      });
    },
    /** The two housekeeping passes that keep the rim honest: materialize a lamp on
     *  every lit slot no live lamp occupies (the occupied-seat check — a restored
     *  lamp claiming its slot never gets a twin), and top up the drifting dead
     *  stock for whatever the arms consumed or violence destroyed. Seats and stock
     *  indexes key on data stamps, never entity ids. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const mask = this._litMask();
      const claimed = new Set();
      for (const lamp of this._lampsAlive()) {
        const slot = Number(lamp.data?.lamplighterSlot);
        if (Number.isInteger(slot)) claimed.add(slot);
      }
      for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) {
        if ((mask & (1 << i)) !== 0 && !claimed.has(i)) {
          this.helpers.spawnEntity(lamplighterLampSpec(i));
        }
      }
      const owed = lamplighterDeadOwed(this._deadAlive().length, lamplighterLitCount(mask));
      if (owed <= 0) return;
      const taken = new Set();
      for (const dead of this._deadAlive()) {
        const idx = Number(dead.data?.lamplighterDeadIndex);
        if (Number.isInteger(idx)) taken.add(idx);
      }
      for (let i = 0, spawned = 0; i < LAMPLIGHTER.deadCount && spawned < owed; i += 1) {
        if (taken.has(i)) continue;
        this.helpers.spawnEntity(lamplighterDeadSpec(i));
        spawned += 1;
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[LAMPLIGHTER.goneFlag] === true;
      // The robot never respawns once killed — the lamps it planted stay lit anyway;
      // they are the rim's furniture, not the robot's breath.
      if (!gone && !this._robot()) this.helpers.spawnEntity && this.helpers.spawnEntity(lamplighterSpec());
      this._housekeep();
      // One hail per arrival, in-memory like the scale deck's price board: a returning
      // pilot hears the ask again; a finished rim answers with its own line.
      if (!gone && !this._announced) {
        this._announced = true;
        const done = lamplighterLitCount(this._litMask()) >= LAMPLIGHTER.slotCount;
        this._say('lamplighter_announce', done ? LAMPLIGHTER.rimLine : LAMPLIGHTER.announce, 9);
      }
    },
    /** Kill reports read the victim by id — the emitter marks it dead before the bus
     *  hears it, so a live-only scan never sees its own corpse. A dead lamp clears its
     *  seat bit (the light really goes out; the stock replaces the raw material). A
     *  dead robot sets the durable gone flag and files its own last line, once. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data) return;
      if (victim.data.lamplighter === true) {
        const flags = this._flags();
        if (flags && flags[LAMPLIGHTER.goneFlag] !== true) {
          flags[LAMPLIGHTER.goneFlag] = true;
          this._say('lamplighter_gone', LAMPLIGHTER.goneLine, 9);
        }
        return;
      }
      if (victim.data.lamplighterLamp === true) {
        const slot = Number(victim.data.lamplighterSlot);
        const flags = this._flags();
        if (flags && Number.isInteger(slot)) {
          flags[LAMPLIGHTER.litFlag] = lamplighterMaskClear(this._litMask(), slot);
        }
      }
    },
    /** The calendar census: walk the robot home if it was shoved off the post
     *  (impulse-membrane steering, never a vel write), keep the seats and the stock
     *  honest, and accept the first settled dead buoy inside the arm ring — consume
     *  it, light the lowest dark slot, speak the payoff. The arms follow the robot's
     *  live position: they are its arms, not its address. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const dv = lamplighterDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
      const flags = this._flags();
      if (!flags) return;
      const mask = this._litMask();
      if (lamplighterFirstDark(mask) < 0) return; // the rim holds — nothing left to plant
      for (const e of s.entityList || []) {
        if (!e || e === robot) continue;
        if (!lamplighterArmable(e, robot.pos)) continue;
        const slot = lamplighterFirstDark(mask);
        this.helpers?.removeEntity?.(e.id);
        flags[LAMPLIGHTER.litFlag] = lamplighterMaskSet(mask, slot);
        if (this.helpers.spawnEntity) this.helpers.spawnEntity(lamplighterLampSpec(slot));
        const lit = lamplighterLitCount(flags[LAMPLIGHTER.litFlag]);
        if (lit >= LAMPLIGHTER.slotCount) {
          flags[LAMPLIGHTER.rimFlag] = true;
          this._say('lamplighter_rim', LAMPLIGHTER.rimLine, 9);
        } else {
          this._say(`lamplighter_lit_${slot}_${lit}`, LAMPLIGHTER.litLine, 6);
        }
        // One delivery per census — the robot rebuilds one buoy at a time; the rest
        // of the stock waits on the rim for the next pass.
        return;
      }
    },
  };
}

export const lamplighter = createLamplighter();
