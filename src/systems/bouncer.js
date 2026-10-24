// W-SHIFT (row 506, 03 §4.3): BOUNCER / DR-0 — the bazaar's door robot. A real marked
// hull posts up at the no-weapons cordon around the Sker Bazaar berth and enforces the
// one law the ring keeps: a weapon fired inside is a strike. First strike is a spoken
// warning; the next inside the window is the throw — a radial impulse through the
// physics membrane, scaled to the hull's mass, pointed out through the door. The robot
// throws anyone: a corsair that opens up inside the ring flies out the same door, which
// is the backup play — bait rowdy ships into the cordon and the door does your work.
// Thrown rocks never emit combat:fire, so the ring's own ammo stays legal.
//
// WHAT THIS OWNS — the robot body (event-driven seams like every one-off: init /
// deferred sector-enter / save:loaded / newGame), the strike ledger per hull, the
// ejection impulses, and a calendar drift-home pass. Door law lives in story flags:
// ejection count, the once-ever announce, and the receipt when it throws YOU.
import { BOUNCER } from '../data/bouncer.js';
import { bouncerInRing, bouncerStrikeDecision, bouncerEjectImpulse, bouncerCanEject, bouncerDriftHome } from '../characters/bouncerRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function bouncerSpec() {
  return {
    type: 'drone',
    pos: { ...BOUNCER.post }, vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 300, hullMax: 300,
    homeSectorId: BOUNCER.sectorId,
    data: {
      bouncer: true, authoredCharacter: 'bouncer', parentType: 'story_prop',
      callsign: BOUNCER.callsign,
      scanLabel: 'BOUNCER / DR-0 — bazaar door robot',
      scannerSignalKind: 'salvage',
      homeSectorId: BOUNCER.sectorId,
    },
  };
}

export function createBouncer() {
  return {
    name: 'bouncer',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      // Per-visit door ledgers keyed on the entity OBJECT, not its id — a hull that dies
      // inside the window frees its id for a fresh occupant, and the recycled id must not
      // inherit a dead rowdy's strikes.
      this._strikes = new Map(); // entity -> {count, lastAt}
      this._ejectAt = new Map(); // entity -> simTime of its last throw (cooldown)
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._strikes.clear(); this._ejectAt.clear();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      // A restored visit is a fresh visit: the door ledger is in-memory only, so a save
      // carried mid-offense must not reload straight into the throw (docket/gateThreeWeir
      // drop their transient state on the same seam).
      on('save:loaded', () => { this._strikes.clear(); this._ejectAt.clear(); this._sync(); });
      on('game:newGame', () => { this._strikes.clear(); this._ejectAt.clear(); this._sync(); });
      on('combat:fire', (p) => this._onFire(p));
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
        && this.state?.world?.currentSectorId === BOUNCER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.bouncer === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.bouncer === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._robot() && this.helpers.spawnEntity) this.helpers.spawnEntity(bouncerSpec());
      const flags = this._flags();
      if (flags && flags[BOUNCER.announceFlag] !== true) {
        flags[BOUNCER.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'bouncer_announce', sender: BOUNCER.sender, category: 'story',
          text: BOUNCER.announce, ttl: 9, persist: false,
        });
      }
    },
    /** Door law on every firing report: inside the ring is a strike. Warn once, then
     *  throw — the same for the player and for every corsair dumb enough to test it. */
    _onFire(p) {
      if (!this._adventure() || !p) return;
      const owner = this._entity(p.ownerId);
      if (!owner || !bouncerInRing(owner.pos)) return;
      if (owner.data?.bouncer === true) return; // the door robot does not eject itself
      if (!bouncerCanEject(owner)) return; // a corpse's firing receipt is no strike
      const now = Number(this.state?.simTime) || 0;
      const prev = this._strikes.get(owner) || {};
      const dec = bouncerStrikeDecision(prev.count, prev.lastAt, now);
      this._strikes.set(owner, { count: dec.count, lastAt: now });
      if (!dec.eject) {
        this.bus?.emit('comms:popup', {
          id: `bouncer_warn_${owner.id}`, sender: BOUNCER.sender, category: 'warning',
          text: BOUNCER.warn, ttl: 7, persist: false,
        });
        this.bus?.emit('bouncer:warned', { entityId: owner.id, isPlayer: owner.id === this.state?.playerId || owner.isPlayer === true });
        return;
      }
      const lastThrow = this._ejectAt.get(owner);
      if (Number.isFinite(lastThrow) && (now - lastThrow) < BOUNCER.ejectCooldownS) return;
      this._ejectAt.set(owner, now);
      const isPlayer = owner.id === this.state?.playerId || owner.isPlayer === true;
      const impulse = bouncerEjectImpulse(owner.pos, owner.mass);
      queuePhysicsImpulse(owner, impulse,
        isPlayer ? { externalEffect: true, isPlayerTarget: true, tick: this.state?.tick } : { tick: this.state?.tick });
      const flags = this._flags();
      if (flags) {
        flags[BOUNCER.ejectCountFlag] = (Number(flags[BOUNCER.ejectCountFlag]) || 0) + 1;
        if (isPlayer) flags[BOUNCER.playerEjectedFlag] = true;
      }
      this.bus?.emit('comms:popup', {
        id: `bouncer_eject_${owner.id}_${Math.floor(now)}`, sender: BOUNCER.sender,
        category: 'warning', persist: isPlayer,
        text: isPlayer ? BOUNCER.ejectPlayer : BOUNCER.backup, ttl: 8,
      });
      this.bus?.emit('bouncer:ejected', {
        entityId: owner.id, isPlayer,
        ejections: flags ? Number(flags[BOUNCER.ejectCountFlag]) || 0 : 0,
      });
    },
    /** Calendar pass: the robot drifts home when pushed off its post — a door robot
     *  knocked across the ring walks back to the door. The walk crosses the impulse
     *  membrane like docket's servo: the robot is a live dynamic body, so a direct vel
     *  write would die in the physics readback before it ever moved. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const dv = bouncerDriftHome(robot);
      if (!dv || !(robot.mass > 0)) return;
      queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
    },
  };
}

export const bouncer = createBouncer();
