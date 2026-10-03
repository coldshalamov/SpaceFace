// SV-3 owns four bodies and state.vesper only. Real Massline/collision receipts play the bells;
// every movement is an additive impulse consumed by the existing physics authority. No rewards,
// RNG draws, global listeners, timers, alternate inventories, fake contacts or player-velocity writes.
import { VESPER as C, VESPER_LINES, freshVesperMemory, normalizeVesperMemory } from '../data/vesper.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

const finiteXZ = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const belongs = e => e?.data?.vesper === true;
const bellIndex = e => belongs(e) && Number.isInteger(e.data.vesperBell) ? e.data.vesperBell : -1;

export function vesperEntitySpec(memory = freshVesperMemory(), index = -1) {
  if (index !== -1 && (!Number.isInteger(index) || index < 0 || index > 2)) throw new RangeError('Vesper bell index');
  const bell = index >= 0, b = bell ? memory.bells[index] : memory.hub;
  return { type: 'drone', team: 2, factionId: 'faction_free', name: bell ? `Vesper · ${C.names[index]}` : 'Vesper',
    pos: { x: b.x, z: b.z }, vel: { x: b.vx, z: b.vz }, rot: b.rot, angVel: b.angVel,
    mass: bell ? C.bellMass : C.mass, radius: bell ? C.bellRadius : C.radius,
    hull: b.hull, hullMax: bell ? C.bellHull : C.hull, collides: true,
    physicsBody: { dynamic: true, shape: 'ball', radius: bell ? C.bellRadius : C.radius,
      mass: bell ? C.bellMass : C.mass, useMeasuredSkin: false, material: 'debris', ccd: true,
      contact: { friction: 0.12, restitution: bell ? 0.48 : 0.18, linearDamping: 0.015, angularDamping: 0.3 } },
    data: { vesper: true, vesperBell: index, identityKey: bell ? `${C.id}_bell_${index}` : C.id,
      callsign: bell ? C.names[index] : C.callsign, ai: { passive: true }, masslineTetherable: true,
      homeSectorId: C.sectorId, scannerSignalKind: bell ? 'salvage' : 'anomaly',
      scanLabel: bell ? `Loose resonator · ${C.names[index]}` : 'Vesper · kinetic choir',
      visualRadius: bell ? 9 : 38, vesperPose: { simTime: 0, phase: memory.met ? 'listen' : 'sleep',
        met: memory.met, gaze: 0, phaseAt: 0, previousPhase: memory.met ? 'listen' : 'sleep', noteAt: -100, notePower: 0, bloomAt: -100, progress: 0, following: false,
        bellAlive: memory.bells.map(b => !b.dead), quiet: false } },
  };
}

/** A bounded acceleration toward a point. Physical drift survives; only the solver writes motion. */
export function vesperSteering(pos, vel, target, limit = C.returnAcceleration) {
  if (!finiteXZ(pos) || !finiteXZ(vel) || !finiteXZ(target) || !Number.isFinite(limit) || limit <= 0) return null;
  let x = (target.x - pos.x) * 0.1 - vel.x * 0.7, z = (target.z - pos.z) * 0.1 - vel.z * 0.7;
  const length = Math.hypot(x, z); if (length > limit) { x *= limit / length; z *= limit / length; }
  return { x, z };
}

export function createVesper() {
  return {
    name: 'vesper',
    init(ctx) {
      this.destroy(); this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.vesper = normalizeVesperMemory(this.state.vesper, this.state.simTime || 0); this._reset();
      this._unsubs = [];
      const on = (name, fn) => { const off = this.bus?.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('scan:pulse', p => this._scan(p));
      on('tether:latched', p => this._latch(p)); on('tether:released', p => this._release(p));
      on('tether:cut', p => this._release(p));
      on('tether:broken', () => { this._held = null; });
      on('physics:impact', p => this._impact(p));
      on('combat:damage', p => this._damage(p)); on('entity:killed', p => this._killed(p));
      on('sector:exit', () => { this._capture(); this._clear(); this._reset(); });
      // Live GPU + flight + hard enter: capture/reset stay inline bookkeeping;
      // the ensemble sync defers into the cook's FIFO — _sync itself (not the
      // home-gated provider wrapper) so off-home enters keep their capture+clear.
      on('sector:enter', (p) => {
        this._capture(); this._reset();
        if (deferSectorEnterMaterialization(this.state, p, () => this._sync())) return;
        this._sync();
      });
      // sector:enter listeners are count-sliced and registration-ordered, so this system's
      // spawn can land after the jump census walks entityList — the four bodies then miss
      // firstFlightIds and mount mid-flight. The renderer's live-sector cook invokes these
      // providers inside its census instead of relying on listener order.
      const providers = this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []);
      this._cookProvider = () => { if (this._home()) this._sync(); };
      providers.push(this._cookProvider);
      on('save:restoring', () => { this._clear(); this._reset(); });
      on('save:loaded', () => { this._reset(); this._sync(); });
      on('game:newGame', () => this.newGame());
    },
    _reset() {
      this._hubId = null; this._bellIds = [null, null, null]; this._nextSync = 0;
      this._scanSeq = 0; this._scanSource = null; this._held = null; this._following = false;
      this._notes = []; this._phrase = []; this._progress = 0; this._lastPlayerNote = -100;
      this._lastVoice = -100; this._lastRing = [-100, -100, -100]; this._physicalRings = [-100, -100, -100]; this._ballistic = [0, 0, 0];
      this._inside = false; this._discovered = false; this._idle = 0; this._bloomAt = -100;
      this._rest = { x: this.state?.vesper?.hub?.x ?? C.anchor.x, z: this.state?.vesper?.hub?.z ?? C.anchor.z };
    },
    _get(id) { const e = this.state?.entities?.get(id); return e?.alive && belongs(e) ? e : null; },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _home() { const kind = this.state?.run?.kind; return (!kind || kind === 'adventure' || kind === 'campaign')
      && this.state?.world?.currentSectorId === C.sectorId; },
    _live() { const p = this._player(); return this._home() && this.state.mode === 'flight'
      && this.state.timeScale > 0 && p?.alive && !p.flags?.docked && finiteXZ(p.pos); },
    _clear() {
      for (const e of this.state?.entityList || []) if (e?.alive && belongs(e)) this.helpers?.removeEntity?.(e.id);
      this._hubId = null; this._bellIds = [null, null, null];
    },
    _capture() {
      if (!this.state?.vesper) return;
      const capture = (e, b) => { if (!e || !finiteXZ(e.pos) || !finiteXZ(e.vel)) return;
        b.x = e.pos.x; b.z = e.pos.z; b.vx = e.vel.x; b.vz = e.vel.z;
        b.rot = Number.isFinite(e.rot) ? e.rot : 0; b.angVel = Number.isFinite(e.angVel) ? e.angVel : 0;
        b.hull = Number.isFinite(e.hull) ? e.hull : b.hull; };
      capture(this._get(this._hubId), this.state.vesper.hub);
      for (let i = 0; i < 3; i++) capture(this._get(this._bellIds[i]), this.state.vesper.bells[i]);
    },
    _sync() {
      if (!this._home()) { this._capture(); this._clear(); return; }
      const m = this.state.vesper, found = [null, null, null, null];
      for (const e of this.state.entityList || []) {
        if (!e?.alive || !belongs(e)) continue;
        const slot = e.data.vesperBell + 1;
        if (!Number.isInteger(slot) || slot < 0 || slot > 3 || found[slot] || (slot === 0 ? m.hub.dead : m.bells[slot - 1].dead)) {
          this.helpers.removeEntity?.(e.id); continue;
        }
        found[slot] = e;
      }
      for (let slot = 0; slot < 4; slot++) {
        const record = slot === 0 ? m.hub : m.bells[slot - 1];
        if (!found[slot] && !record.dead && this.helpers.spawnEntity) found[slot] = this.helpers.spawnEntity(vesperEntitySpec(m, slot - 1));
      }
      this._hubId = found[0]?.id ?? null; this._bellIds = found.slice(1).map(e => e?.id ?? null);
    },
    newGame() { this._clear(); this.state.vesper = freshVesperMemory(); this._reset(); },
    serialize() { this._capture(); return normalizeVesperMemory(this.state.vesper, this.state.simTime || 0); },
    deserialize(raw) { this._clear(); this.state.vesper = normalizeVesperMemory(raw, this.state.simTime || 0); this._reset(); },
    destroy() {
      for (const off of this._unsubs || []) off(); this._unsubs = [];
      const providers = this.helpers && this.helpers.sectorCookProviders;
      if (Array.isArray(providers) && this._cookProvider) {
        const index = providers.indexOf(this._cookProvider);
        if (index >= 0) providers.splice(index, 1);
      }
      this._cookProvider = null;
      this._clear(); this._notes = [];
    },
    _say(key, force = false) {
      const now = this.state.simTime || 0; if (!force && now - this._lastVoice < 7) return;
      const text = VESPER_LINES[key]; if (!text) return; this._lastVoice = now;
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `vesper:${key}`, priority: force ? 58 : 24, channel: 'comms', text, ttl: 9 });
      else this.bus?.emit('toast', { text, kind: 'info', ttl: 9 });
      this.bus?.emit('vesper:voice', { from: C.callsign, key, text });
    },
    _demonstrate(reverse = false) {
      const now = this.state.simTime || 0, phrase = reverse ? C.reverse : C.phrase;
      this._notes = phrase.map((note, i) => ({ note, at: now + 0.65 + i * 0.9 }));
    },
    _scan(p) {
      if (!this._live()) return; const player = this._player(), hub = this._get(this._hubId);
      if (!hub || !p || p.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1 || !finiteXZ(p.pos) || dist(p.pos, player.pos) > 2
        || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player; this._scanSeq = p.seq;
      if (dist(player.pos, hub.pos) > Math.min(C.scanRadius, p.radius)) return;
      const m = this.state.vesper;
      if (m.mutedUntil > this.state.simTime) { this._say('shy'); return; }
      if (!m.met) { m.met = true; this._say('hello', true); this._demonstrate(); this.bus?.emit('vesper:met', { id: hub.id }); return; }
      if (m.performances > 0) {
        this._following = !this._following; this._rest.x = hub.pos.x; this._rest.z = hub.pos.z;
        this._say(this._following ? 'follow' : 'stay', true); return;
      }
      this._progress = 0; this._phrase.length = 0;
      this._say(m.bells.some(b => b.dead) ? 'missing' : 'demonstrate', true); this._demonstrate();
    },
    _latch(p) {
      if (!this._live()) return; const e = this._get(p?.targetId), i = bellIndex(e);
      if (i < 0 || i > 2) { this._held = null; return; }
      this._held = { id: e.id, index: i, x: e.pos.x, z: e.pos.z };
    },
    _release(p) {
      if (!this._live() || !this._held) return;
      // tether:cut carries targetId in the live authority; a missing/stale target is not a pluck.
      const held = this._held; if (p?.targetId !== held.id) return;
      this._held = null; const e = this._get(held.id); if (!e || !finiteXZ(e.vel)) return;
      const now = this.state.simTime || 0; this._ballistic[held.index] = now + C.ballisticSeconds;
      const speed = Math.hypot(e.vel.x, e.vel.z), travel = dist(e.pos, held);
      const earned = speed >= C.pluckSpeed && travel >= C.pluckTravel;
      this._ring(held.index, clamp(speed / 28, 0.2, 1), earned, 'massline');
      if (!earned && this.state.vesper.met) this._say('soft');
    },
    _impact(p) {
      if (!this._live() || !p || !Number.isFinite(p.impulse) || p.impulse <= 0) return;
      for (const id of [p.aId, p.bId]) {
        const e = this._get(id), i = bellIndex(e); if (i < 0 || i > 2) continue;
        const speed = Number.isFinite(p.preSolveClosingSpeed) ? p.preSolveClosingSpeed : p.impulse / C.bellMass;
        if (speed < 2) continue;
        const direct = p.aId === this.state.playerId || p.bId === this.state.playerId || p.causalActorId === this.state.playerId;
        this._ballistic[i] = (this.state.simTime || 0) + C.ballisticSeconds;
        this._ring(i, clamp(speed / 30, 0.15, 1), direct && speed >= C.pluckSpeed, 'contact');
      }
    },
    _ring(i, power, playerPlayed = false, source = 'answer') {
      const now = this.state.simTime || 0, bell = this._get(this._bellIds[i]);
      if (!bell || now - this._lastRing[i] < C.noteCooldown) return false;
      this._lastRing[i] = now; bell.data.vesperPose.noteAt = now; bell.data.vesperPose.notePower = power;
      const player = this._player(), audible = player?.alive && dist(player.pos, bell.pos) <= C.hearRadius;
      if (audible) this.bus?.emit('audio:cue', { id: `sfx_vesper_resonator_${i}`,
        position: { x: bell.pos.x, z: bell.pos.z }, gain: 0.35 + power * 0.4, rate: 1 });
      this.bus?.emit('vesper:note', { index: i, entityId: bell.id, power, source, playerPlayed, simTime: now });
      const hub = this._get(this._hubId), m = this.state.vesper;
      if (!m.met || !hub || m.mutedUntil > now || !audible || dist(player.pos, hub.pos) > C.hearRadius) return true;
      if (source !== 'answer') {
        this._physicalRings[i] = now;
        if (this._physicalRings.every(t => now - t < 1.35) && !m.unisonHeard) this._celebrate('unison');
      }
      if (!playerPlayed) return true;
      this._notes.length = 0; this._idle = 0;
      if (now - this._lastPlayerNote > C.phraseGap) { this._progress = 0; this._phrase.length = 0; }
      this._lastPlayerNote = now; this._phrase.push(i); if (this._phrase.length > 3) this._phrase.shift();
      if (this._phrase.length === 3 && this._phrase.every((v, k) => v === C.reverse[k]) && !m.reverseHeard) this._celebrate('reverse');
      if (i === C.phrase[this._progress]) this._progress++;
      else { this._progress = i === C.phrase[0] ? 1 : 0; this._say('missed'); }
      if (this._progress > 0 && this._progress < C.phrase.length) this.bus?.emit('toast', {
        text: `VESPER · ${this._progress}/3 — next: ${C.names[C.phrase[this._progress]]}`, kind: 'info', ttl: 3 });
      this.bus?.emit('vesper:phraseProgress', { progress: this._progress, total: C.phrase.length, next: C.phrase[this._progress] ?? null });
      if (this._progress === C.phrase.length) { this._progress = 0; this._phrase.length = 0; this._celebrate('phrase'); }
      return true;
    },
    _celebrate(kind) {
      const m = this.state.vesper, now = this.state.simTime || 0; this._bloomAt = now;
      if (kind === 'phrase') { m.performances = Math.min(1e6, m.performances + 1); this._say(m.performances === 1 ? 'success' : 'encore', true); }
      else { m[kind === 'reverse' ? 'reverseHeard' : 'unisonHeard'] = true; this._say(kind, true); }
      this.bus?.emit('vesper:performance', { kind, count: m.performances, simTime: now });
      this._demonstrate(kind === 'reverse');
    },
    _damage(p) {
      if (p?.targetId !== this._hubId || !((p.applied ?? p.amount) > 0)) return;
      const now = this.state.simTime || 0, m = this.state.vesper, alreadyShy = m.mutedUntil > now;
      m.mutedUntil = now + C.mutedSeconds; this._following = false; this._notes.length = 0; this._progress = 0;
      this._phrase.length = 0; this._held = null; this._capture();
      const hub = this._get(this._hubId); if (hub) { this._rest.x = hub.pos.x; this._rest.z = hub.pos.z; }
      if (!alreadyShy) this._say('shy', true);
    },
    _killed(p) {
      if (p?.id == null) return;
      if (p.id === this._hubId) {
        this.state.vesper.hub.dead = true; this.state.vesper.hub.hull = 0; this._hubId = null;
        this._following = false; this._held = null; this._notes.length = 0;
        this.bus?.emit('comms:log', { from: C.callsign, text: VESPER_LINES.memorial, kind: 'character' }); return;
      }
      const i = this._bellIds.indexOf(p.id); if (i < 0) return;
      this.state.vesper.bells[i].dead = true; this.state.vesper.bells[i].hull = 0; this._bellIds[i] = null;
      if (this._held?.id === p.id) this._held = null;
      this._progress = 0; this._phrase.length = 0; if (this.state.vesper.met) this._say('missing');
    },
    _steer(e, target, dt, acceleration) {
      const force = vesperSteering(e.pos, e.vel, target, acceleration);
      if (force && force.x * force.x + force.z * force.z > 0.0004) queuePhysicsImpulse(e, { x: force.x * e.mass * dt, y: 0, z: force.z * e.mass * dt });
    },
    update(dt, state = this.state) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || state !== this.state) return;
      if (!this._home()) { this._capture(); this._clear(); this._reset(); return; }
      if (!this._live()) { this._held = null; this._notes.length = 0; return; }
      const now = state.simTime || 0;
      if (now >= this._nextSync) { this._sync(); this._nextSync = now + 1; }
      const player = this._player(), hub = this._get(this._hubId), m = state.vesper;
      // No respawn of a killed conductor; surviving bells are ordinary loose matter.
      if (!hub) {
        for (const id of this._bellIds) { const bell = this._get(id); if (bell) bell.data.vesperPose.simTime = now; }
        this._capture(); return;
      }
      const distance = dist(player.pos, hub.pos), shy = m.mutedUntil > now;
      if (distance < C.discoverRadius && !this._discovered) { this._discovered = true; if (!m.met) this._say('discover'); }
      if (distance < C.scanRadius && !this._inside) {
        this._inside = true; m.visits = Math.min(1e6, m.visits + 1);
        if (m.met && m.visits > 1) this._say('welcome');
      } else if (distance > C.discoverRadius + 50) this._inside = false;
      if (this._held && !this._get(this._held.id)) this._held = null;
      if (now - this._lastPlayerNote > C.phraseGap) this._progress = 0;
      while (this._notes.length && this._notes[0].at <= now) { const note = this._notes.shift(); this._ring(note.note, 0.6, false, 'answer'); }
      let tx = this._rest.x, tz = this._rest.z;
      if (this._following && !shy) {
        const speed = Math.hypot(player.vel.x, player.vel.z), dx = speed > 2 ? player.vel.x / speed : Math.cos(player.rot || 0),
          dz = speed > 2 ? player.vel.z / speed : Math.sin(player.rot || 0);
        tx = player.pos.x - dx * 82; tz = player.pos.z - dz * 82;
        this._rest.x = tx; this._rest.z = tz;
      }
      const hubTethered = state.player?.tether?.active && state.player.tether.targetId === hub.id;
      if (!hubTethered && !shy) this._steer(hub, { x: tx, z: tz }, dt, this._following ? C.followAcceleration : 2.4);
      for (let i = 0; i < 3; i++) {
        const bell = this._get(this._bellIds[i]); if (!bell) continue;
        const yaw = hub.rot || 0, ox = C.perches[i].x * Math.cos(yaw) - C.perches[i].z * Math.sin(yaw),
          oz = C.perches[i].x * Math.sin(yaw) + C.perches[i].z * Math.cos(yaw);
        const tethered = this._held?.id === bell.id || (state.player?.tether?.active && state.player.tether.targetId === bell.id);
        if (!tethered && now >= this._ballistic[i] && !shy) this._steer(bell,
          { x: hub.pos.x + ox, z: hub.pos.z + oz }, dt, C.returnAcceleration);
        const p = bell.data.vesperPose; p.simTime = now; p.met = m.met; p.phase = shy ? 'shy' : 'listen';
      }
      this._idle = m.met && !shy && distance < 130 && Math.hypot(player.vel.x, player.vel.z) < 2 && !this._held ? this._idle + dt : 0;
      if (this._idle >= C.quietSeconds && !m.quietHeard) { m.quietHeard = true; this._say('quiet', true); }
      const pose = hub.data.vesperPose;
      pose.simTime = now; pose.met = m.met;
      const phase = shy ? 'shy' : !m.met ? 'sleep' : now - this._bloomAt < C.bloomSeconds ? 'bloom' : 'listen';
      if (phase !== pose.phase) { pose.previousPhase = pose.phase; pose.phaseAt = now; pose.phase = phase; }
      const desiredGaze = Math.atan2(player.pos.z - hub.pos.z, player.pos.x - hub.pos.x),
        gazeDelta = Math.atan2(Math.sin(desiredGaze - pose.gaze), Math.cos(desiredGaze - pose.gaze));
      pose.gaze += clamp(gazeDelta, -1.8 * dt, 1.8 * dt); pose.bloomAt = this._bloomAt;
      pose.progress = this._progress; pose.following = this._following; pose.quiet = this._idle > C.quietSeconds;
      for (let i = 0; i < 3; i++) pose.bellAlive[i] = !m.bells[i].dead;
      this._capture();
    },
  };
}
export const vesper = createVesper();
