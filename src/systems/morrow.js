// Morrow owns ONLY state.morrow, its own entity, and its transient interaction state.
// No renderer, inventory, economy, HP healing, timers, or ambient random stream. Motion crosses
// the same additive command membrane used by Massline. The player keeps their own controls.
import { MORROW, MORROW_LINES, freshMorrowMemory, normalizeMorrowMemory } from '../data/morrow.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finitePos = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function morrowEntitySpec(memory = freshMorrowMemory()) {
  return {
    type: 'drone', team: 2, factionId: 'faction_free', name: MORROW.name,
    pos: { ...MORROW.anchor }, radius: MORROW.radius, mass: MORROW.mass,
    hull: memory.hull, hullMax: MORROW.hull, collides: true,
    // Explicit solid body; no giant invisible halo collider. The physical hub is the solid.
    physicsBody: { dynamic: true, shape: 'ball', radius: MORROW.radius, mass: MORROW.mass,
      useMeasuredSkin: false, material: 'debris', ccd: true,
      contact: { friction: 0.1, restitution: 0.25, angularDamping: 0.45 } },
    data: { morrow: true, visualRadius: 130, callsign: MORROW.callsign, scanLabel: 'Morrow · rescue machine',
      scannerSignalKind: 'anomaly', homeSectorId: MORROW.sectorId,
      identityKey: MORROW.id, ai: { passive: true },
      morrowPose: { phase: 'sleep', charge: 0, sweep: 0, gaze: 0, gesture: '',
        gestureAt: -100, launchAt: -100, launchYaw: 0, awake: memory.met } },
  };
}

/** Sweep must be continuous in one direction. Oscillating back and forth never earns a launch. */
export function advanceMorrowOrbit(track, angle, radius, speed, dt) {
  if (!Number.isFinite(angle) || !Number.isFinite(radius) || !Number.isFinite(speed)
    || dt <= 0 || radius < MORROW.orbitInner || radius > MORROW.orbitOuter
    || speed < MORROW.minimumSpeed) {
    track.angle = null; track.sweep = 0; track.sign = 0; return false;
  }
  if (track.angle === null) { track.angle = angle; return false; }
  const delta = wrap(angle - track.angle);
  track.angle = angle;
  // Reject teleports and low-cadence jumps rather than mistaking them for a flown arc.
  const maxArc = Math.min(0.3, (speed * dt / Math.max(radius, 1)) * 2.5 + 0.01);
  if (Math.abs(delta) > maxArc) { track.sweep = 0; track.sign = 0; return false; }
  if (Math.abs(delta) < 0.00005) return false;
  const sign = Math.sign(delta);
  if (track.sign && track.sign !== sign) track.sweep = Math.max(0, track.sweep - Math.abs(delta) * 3);
  else track.sweep += Math.abs(delta);
  if (track.sweep <= 0) { track.sign = sign; track.sweep = 0; }
  if (!track.sign) track.sign = sign;
  return track.sweep >= MORROW.orbitSweep;
}

/** Proposed bounded delta-v along actual momentum; never rotates or overwrites velocity. */
export function morrowLaunchDelta(velocity) {
  if (!finitePos(velocity)) return null;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < MORROW.minimumSpeed || speed >= MORROW.maximumSpeed) return null;
  const dv = Math.min(MORROW.deltaSpeed, MORROW.maximumSpeed - speed);
  return { x: velocity.x / speed * dv, z: velocity.z / speed * dv };
}

export function createMorrow() {
  return {
    name: 'morrow',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.morrow = normalizeMorrowMemory(this.state.morrow, this.state.simTime || 0);
      this._reset();
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('scan:pulse', (p) => this._scan(p));
      on('combat:damage', (p) => this._damage(p));
      on('entity:killed', (p) => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => this._reset());
      on('save:loaded', () => { this._reset(); this._syncEntity(); });
      // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
      // drains the same reset+sync under its slice clock in listener order.
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._scanSeq = 0; this._syncEntity();
      });
      // Census arm: the morrow entity materializes inside the sector cook deterministically.
      this._cookProvider = () => { this._scanSeq = 0; this._syncEntity(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
    },
    _reset() {
      this._id = null; this._nextSync = 0; this._scanSeq = 0; this._scanSource = null;
      this._phase = this.state?.morrow?.met ? 'idle' : 'sleep'; this._until = 0; this._releaseAt = -1; this._lastVoice = -100;
      this._orbit = { angle: null, sweep: 0, sign: 0 };
      this._inside = false; this._discoverySaid = false; this._idle = 0;
      this._spin = 0; this._previousRot = null; this._notes = [];
      this._poseGestureAt = -100; this._poseGesture = ''; this._launchAt = -100;
      this._launchYaw = 0; this._charge = 0;
    },
    newGame() {
      this._removeOwned(); this.state.morrow = freshMorrowMemory(); this._reset();
    },
    serialize() {
      const e = this._entity();
      const raw = { ...this.state.morrow, hull: e?.alive ? e.hull : this.state.morrow.hull };
      return normalizeMorrowMemory(raw, this.state.simTime || 0);
    },
    deserialize(raw) {
      this._removeOwned();
      this.state.morrow = normalizeMorrowMemory(raw, this.state.simTime || 0);
      this._reset(); // No armed/half-spent impulse crosses a load boundary.
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = []; this._notes = [];
      this._removeOwned();
    },
    _entity() {
      const e = this.state?.entities?.get(this._id);
      return e?.alive && e.data?.morrow === true ? e : null;
    },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const run = this.state.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state.world?.currentSectorId === MORROW.sectorId;
    },
    _removeOwned() {
      // Rare lifecycle pass, not a per-frame scan; repair duplicates from stale/imported entities.
      for (const e of this.state?.entityList || []) {
        if (e?.data?.morrow === true && e.alive) this.helpers?.removeEntity?.(e.id);
      }
      this._id = null;
    },
    _syncEntity() {
      if (!this._adventure() || this.state.morrow.destroyed) {
        this._removeOwned(); this._inside = false; this._cancel(false); return;
      }
      let found = null;
      for (const e of this.state.entityList || []) {
        if (!e?.alive || e.data?.morrow !== true) continue;
        if (found) this.helpers.removeEntity?.(e.id);
        else found = e;
      }
      if (!found && this.helpers.spawnEntity) found = this.helpers.spawnEntity(morrowEntitySpec(this.state.morrow));
      this._id = found?.id ?? null;
    },
    _say(key, important = false) {
      const now = this.state.simTime || 0;
      if (!important && now - this._lastVoice < 6) return;
      const text = MORROW_LINES[key]; if (!text) return;
      this._lastVoice = now;
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `morrow:${key}`, priority: important ? 65 : 25, channel: 'comms', text, ttl: 7 });
      else this.bus?.emit('toast', { text, kind: 'info', ttl: 7 });
      // Observability only: comms:log also toasts, which would duplicate the voice arbiter.
      this.bus?.emit('morrow:voice', { from: MORROW.callsign, key, text });
    },
    _sound(id, rate = 1) {
      const e = this._entity();
      this.bus?.emit('audio:cue', { id, position: e ? { x: e.pos.x, z: e.pos.z } : MORROW.anchor,
        gain: 0.7, rate });
    },
    _song(reverse = false) {
      const now = this.state.simTime || 0;
      this._notes = [0, 1, 2].map((i) => ({ at: now + i * 0.34, note: reverse ? 2 - i : i }));
    },
    _scan(p) {
      if (this.state.mode !== 'flight' || !(this.state.timeScale > 0) || !this._adventure()) return;
      const player = this._player(), e = this._entity();
      if (!player?.alive || player.flags?.docked || !e || !finitePos(player.pos)) return;
      // Scanner-issued pulse only. Duplicate deliveries cannot arm/cancel twice.
      if (!p || p.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1 || !finitePos(p.pos)
        || distance(p.pos, player.pos) > 2 || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player; this._scanSeq = p.seq;
      if (distance(e.pos, player.pos) > Math.min(p.radius, MORROW.scanRadius)) return;
      const now = this.state.simTime || 0, m = this.state.morrow;
      if (m.shyUntil > now) { this._say('shy'); return; }
      if (!m.met) {
        m.met = true; this._phase = 'idle'; this._song(); this._say('hello', true);
        this.bus?.emit('morrow:met', { id: e.id }); return;
      }
      if (this._phase === 'armed' || this._phase === 'windup') { this._cancel(true); return; }
      if (m.cooldownUntil > now) { this._say('cooldown'); return; }
      if (this.state.player?.tether?.active) { this._say('tether'); return; }
      this._phase = 'armed'; this._until = now + MORROW.armSeconds;
      this._orbit = { angle: null, sweep: 0, sign: 0 }; this._charge = 0;
      this._sound('sfx_morrow_bell_0'); this._say('armed', true);
    },
    _cancel(speak) {
      if (!this.state) return;
      this._phase = this.state.morrow?.met ? 'idle' : 'sleep';
      this._releaseAt = -1; this._charge = 0;
      if (this._orbit) { this._orbit.angle = null; this._orbit.sweep = 0; this._orbit.sign = 0; }
      if (speak) this._say('cancel', true);
    },
    _damage(p) {
      if (!p || p.targetId !== this._id || !((p.applied ?? p.amount) > 0)) return;
      const e = this._entity(); if (!e) return;
      this.state.morrow.hull = e.hull;
      this.state.morrow.shyUntil = (this.state.simTime || 0) + MORROW.shySeconds;
      const wasShy = this._phase === 'shy';
      this._cancel(false); this._phase = 'shy';
      if (!wasShy) this._song(true);
      this._say('shy');
    },
    _killed(p) {
      if (!p || p.id !== this._id) return;
      this.state.morrow.destroyed = true; this.state.morrow.hull = 0;
      this._cancel(false); this._id = null; this._notes = [];
      this.bus?.emit('comms:log', { from: MORROW.callsign, text: MORROW_LINES.memorial, kind: 'character' });
    },
    _clearAhead(player, delta) {
      const speed = Math.hypot(player.vel.x + delta.x, player.vel.z + delta.z);
      const length = speed * 1.0 + MORROW.radius, dirX = delta.x / Math.hypot(delta.x, delta.z),
        dirZ = delta.z / Math.hypot(delta.x, delta.z);
      // One scan at commitment, never each frame. Refuse to knowingly sling into a solid.
      for (const e of this.state.entityList || []) {
        if (!e?.alive || e === player || e.collides === false
          || !['station', 'asteroid', 'wreck', 'machine', 'ship', 'drone', 'planet'].includes(e.type) || !finitePos(e.pos)) continue;
        const x = e.pos.x - player.pos.x, z = e.pos.z - player.pos.z;
        const along = x * dirX + z * dirZ;
        if (along > 0 && along < length && Math.abs(x * dirZ - z * dirX) < (e.radius || 1) + (player.radius || 4) + 7) return false;
      }
      return true;
    },
    _launch(player, e) {
      const delta = morrowLaunchDelta(player.vel);
      if (!delta || !this._clearAhead(player, delta)) {
        this._cancel(false); this._say(delta ? 'obstruction' : 'cancel', true); return;
      }
      const mass = player.physicsBody?.mass || player.mass || 1;
      if (!Number.isFinite(mass) || mass <= 0) { this._cancel(false); return; }
      const now = this.state.simTime || 0;
      this._phase = 'release'; this._releaseAt = now;
      this._launchAt = now; this._launchYaw = Math.atan2(player.vel.z, player.vel.x);
      this._remainingImpulse = { x: delta.x * mass, z: delta.z * mass };
      this.state.morrow.launches += 1;
      this.state.morrow.cooldownUntil = now + MORROW.cooldownSeconds;
      this._sound('sfx_morrow_release'); this._song();
      this._say(this.state.morrow.launches === 10 ? 'tenth' : 'launched', true);
      this.bus?.emit('morrow:launch', { id: e.id, playerId: player.id,
        deltaVelocity: delta, duration: MORROW.launchSeconds, direction: this._launchYaw });
    },
    update(dt, state = this.state) {
      if (!state || !Number.isFinite(dt) || dt <= 0 || state.mode !== 'flight' || !(state.timeScale > 0)) return;
      dt = Math.min(dt, MORROW.maxStep);
      const now = state.simTime || 0;
      if (now >= this._nextSync) { this._syncEntity(); this._nextSync = now + 2; }
      const e = this._entity(), player = this._player();
      if (!e || !player?.alive || !finitePos(player.pos) || !finitePos(player.vel)) return;
      if (!this._adventure() || player.flags?.docked) { this._cancel(false); return; }
      const m = state.morrow, r = distance(e.pos, player.pos);
      // Its station-keeping is also physical. Tethering/bombs can move Morrow; no teleport home.
      const dx = MORROW.anchor.x - e.pos.x, dz = MORROW.anchor.z - e.pos.z;
      const ax = clamp(dx * 0.09 - e.vel.x * 0.65, -5, 5), az = clamp(dz * 0.09 - e.vel.z * 0.65, -5, 5);
      queuePhysicsImpulse(e, { x: ax * MORROW.mass * dt, y: 0, z: az * MORROW.mass * dt });
      while (this._notes.length && this._notes[0].at <= now) this._sound(`sfx_morrow_bell_${this._notes.shift().note}`);
      if (r < MORROW.discoverRadius && !this._discoverySaid) {
        this._discoverySaid = true;
        if (!m.met) this._say('discovered');
      }
      if (r < MORROW.nearRadius && !this._inside) {
        this._inside = true; m.visits += 1;
        if (m.met && m.visits > 1) { this._say('welcome'); this._song(); }
      } else if (r > MORROW.discoverRadius + 50) { this._inside = false; }
      if (m.shyUntil > now) this._phase = 'shy';
      else if (this._phase === 'shy') this._cancel(false);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const angle = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
      if ((this._phase === 'armed' || this._phase === 'windup')
        && (now > this._until || r > MORROW.scanRadius || state.player?.tether?.active)) this._cancel(true);
      if (this._phase === 'armed') {
        if (advanceMorrowOrbit(this._orbit, angle, r, speed, dt)) {
          this._phase = 'windup'; this._releaseAt = now + MORROW.windupSeconds;
          this._sound('sfx_morrow_charge'); this._say('windup', true);
        }
      } else if (this._phase === 'windup') {
        if (r < MORROW.orbitInner || r > MORROW.orbitOuter || speed < MORROW.minimumSpeed) this._cancel(true);
        else {
          this._charge = clamp(1 - (this._releaseAt - now) / MORROW.windupSeconds, 0, 1);
          if (now >= this._releaseAt) this._launch(player, e);
        }
      } else if (this._phase === 'release') {
        // Evenly distributed force, not a velocity snap. Equal and opposite recoil on Morrow.
        const remaining = MORROW.launchSeconds - (now - this._releaseAt);
        if (remaining <= 0 || r > MORROW.scanRadius || state.player?.tether?.active) this._cancel(false);
        else {
          const fraction = Math.min(1, dt / remaining);
          const ix = this._remainingImpulse.x * fraction, iz = this._remainingImpulse.z * fraction;
          this._remainingImpulse.x -= ix; this._remainingImpulse.z -= iz;
          queuePhysicsImpulse(player, { x: ix, y: 0, z: iz });
          queuePhysicsImpulse(e, { x: -ix, y: 0, z: -iz });
        }
      }
      // Small social rituals are optional; neither consumes a control nor rewards grinding.
      if (m.met && r < MORROW.nearRadius && this._phase === 'idle') {
        this._idle = speed < 2 ? this._idle + dt : 0;
        if (!m.quietHeard && this._idle > MORROW.idleSeconds) {
          m.quietHeard = true; this._poseGesture = 'quiet'; this._poseGestureAt = now;
          this._song(); this._say('quiet', true);
        }
        if (this._previousRot !== null) this._spin += wrap((player.rot || 0) - this._previousRot);
        if (!m.danced && Math.abs(this._spin) > TAU * 1.75) {
          m.danced = true; this._poseGesture = 'dance'; this._poseGestureAt = now;
          this._song(); this._say('dance', true);
        }
      } else { this._idle = 0; this._spin = 0; }
      this._previousRot = player.rot || 0;
      const pose = e.data.morrowPose;
      pose.simTime = now; // Renderer authored clock advances through pause; our physical ritual must not.
      pose.phase = this._phase; pose.awake = m.met; pose.charge = this._charge;
      pose.sweep = clamp(this._orbit.sweep / MORROW.orbitSweep, 0, 1);
      pose.gaze = angle; pose.gesture = this._poseGesture; pose.gestureAt = this._poseGestureAt;
      pose.launchAt = this._launchAt; pose.launchYaw = this._launchYaw;
      m.hull = e.hull;
    },
  };
}

export const morrow = createMorrow();
