/** RU-7 owns only its encounter, persistent friendship and presentation facts.
 * All live movement crosses physicsAuthority. The attachment kernel, not event claims,
 * decides who holds a core. Entity object identity prevents stale-id resurrection.
 */
import { RUCKUS as C, RUCKUS_LINES as L, freshRuckusMemory, normalizeRuckusMemory } from '../data/ruckus.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { writePhysicsControl, queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { farActorTableRadius } from '../world/farActorTable.js';
import { occupantGenerationOf } from '../core/entity.js';
import { finiteXZ, distanceXZ as distance, speedOf, boundedPoint, retrieverControl,
  legalFetch, canCatch, mouthPoint, barkImpulse, avoidObstacle } from '../characters/ruckusRules.js';

export const RUCKUS_GLOBAL_ANCHOR = Object.freeze(sectorLocalToGlobalForSector(C.anchor, C.sectorId));
const HOME = RUCKUS_GLOBAL_ANCHOR;
const TOY_HOME = Object.freeze({ x: HOME.x + 64, z: HOME.z });
const ACTIVE = new Set(['offer', 'chase', 'carry', 'present']);

export function ruckusHoldsLine(state, target) {
  const p = state?.entities?.get(state.playerId);
  if (!p?.alive || !target?.alive || state.entities.get(target.id) !== target) return false;
  for (const a of Object.values(state.combat?.attachments?.byId || {})) {
    if (a?.state === 'active' && a.ownerId === p.id && a.targetId === target.id
      && (a.ownerGeneration == null || a.ownerGeneration === occupantGenerationOf(p))
      && (a.targetGeneration == null || a.targetGeneration === occupantGenerationOf(target))) return true;
  }
  return false;
}
export function ruckusEntitySpec(part = 'body', memory = freshRuckusMemory(), pos = null) {
  const toy = part === 'core', fx = part === 'pulse' || part === 'memorial';
  const radius = toy ? C.toyRadius : fx ? 1 : C.radius, mass = toy ? C.toyMass : C.mass;
  return {
    type: fx ? 'fx' : toy ? 'payload' : 'drone', team: 2, factionId: null,
    name: toy ? 'RUCKUS · pressure core · Massline and throw' : part === 'memorial' ? 'RU-7 · open work order' : C.callsign,
    pos: { ...(pos || (toy ? TOY_HOME : HOME)) }, vel: { x: 0, z: 0 }, rot: 0,
    radius, mass, hull: toy || fx ? 1 : memory.hull, hullMax: toy || fx ? 1 : C.hull,
    collides: !fx, flags: { invuln: toy || fx }, homeSectorId: C.sectorId,
    collisionMask: 1 | 2 | 4 | 8 | 32 | 64 | 128,
    physicsBody: fx ? false : { dynamic: true, sensor: false, shape: 'ball', radius, mass,
      useMeasuredSkin: false, ccd: true, material: 'debris', impactDamageScale: .2,
      contact: { friction: .12, restitution: toy ? .6 : .22, linearDamping: toy ? 0 : .15, angularDamping: 2 } },
    data: { ruckusPart: part, authoredCharacter: C.id, identityKey: `${C.id}:${part}`, persistenceOwner: 'ruckus',
      homeSectorId: C.sectorId, sectorId: C.sectorId, ai: { passive: true }, masslineTetherable: !fx,
      scannerSignalKind: 'anomaly', scanLabel: toy ? 'Pressure core · put a line on it, then throw'
        : part === 'memorial' ? 'RU-7 · no reply' : 'RU-7 · demolition retriever · scan to hail',
      visualRadius: toy || part === 'pulse' ? C.pulseRadius + 10 : C.visualRadius,
      ruckusPose: { phase: 'sleep', simTime: 0, phaseAt: 0, charge: 0, countdown: 0, held: false,
        bond: Math.min(3, memory.returns), speed: 0, gaze: 0, pulseAt: -100, pulseAge: -100 } },
  };
}
export function createRuckus() {
  return {
    name: 'ruckus',
    init(ctx) {
      this.destroy(); this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.ruckus = normalizeRuckusMemory(this.state.ruckus); this._unsubs = []; this._reset();
      const on = (key, fn) => { const off = this.bus?.on(key, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('scan:pulse', p => this._scan(p));
      on('collision', p => this._collision(p));
      on('combat:damage', p => this._damage(p));
      on('entity:killed', p => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => { this._restoring = true; this._disarm(); });
      on('save:loaded', () => { this._reset(); this._sync(); });
      on('sector:exit', () => { this._clear(); this._reset(); });
      this._cook = () => this._syncSteps();
      on('sector:enter', p => { if (!deferSectorEnterMaterialization(this.state, p, this._cook)) this._sync(); });
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = [])).push(this._cook);
    },
    _reset() {
      this._refs = {}; this._phase = 'sleep'; this._phaseAt = 0; this._deadline = 0;
      this._restoring = false; this._streaming = false; this._touchedAt = -100; this._origin = { ...TOY_HOME };
      this._held = false; this._wasHeld = false; this._seq = 0; this._scanPlayer = null;
      this._charge = 0; this._countdown = 0; this._presentAt = 0; this._lastTick = -1;
      this._lastVoice = -100; this._nextNudge = 0; this._quiet = 0; this._discovered = false;
      this._pulseAt = -100; this._obstacleAt = 0; this._obstacles = []; this._throwDistance = 0;
    },
    _entity(part) { const e = this._refs?.[part]; return e?.alive && this.state?.entities?.get(e.id) === e ? e : null; },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const kind = this.state?.run?.kind;
      return (!kind || kind === 'adventure' || kind === 'campaign') && this.state?.world?.currentSectorId === C.sectorId;
    },
    _live() { const p = this._player(); return this._adventure() && !this._restoring && this.state.mode === 'flight'
      && this.state.timeScale > 0 && p?.alive && !p.flags?.docked && finiteXZ(p.pos) && finiteXZ(p.vel); },
    _exitRadius() { try { const r = farActorTableRadius(this.state); if (r?.exit > 600) return r.exit; } catch { /* focused fixture */ } return C.farFallback; },
    _near() {
      const margin = this._streaming ? C.streamOutMargin : C.streamInMargin;
      return distance(this._player()?.pos, HOME) <= Math.max(250, this._exitRadius() - margin);
    },
    _dirty() { this.bus?.emit('save:dirty', { kind: 'ruckus', payload: this.serialize() }); },
    _remove(part) {
      const e = this._refs?.[part];
      if (e && this.state?.entities?.get(e.id) === e) this.helpers?.removeEntity?.(e.id);
      if (this._refs) delete this._refs[part];
    },
    _clear() {
      // Snapshot: the production remover mutates entityList synchronously.
      for (const e of [...(this.state?.entityList || [])]) if (e.data?.ruckusPart) this.helpers?.removeEntity?.(e.id);
      this._refs = {}; this._disarm();
    },
    _spawn(part, pos = null) {
      const e = this.helpers.spawnEntity?.(ruckusEntitySpec(part, this.state.ruckus, pos));
      if (e) this._refs[part] = e;
      return e;
    },
    *_syncSteps() {
      if (this._restoring) return;
      if (!this._adventure() || !this._near()) { this._clear(); this._streaming = false; this._setPhase('sleep'); return; }
      this._streaming = true;
      // A pending Massline stunt can carry an owned core through the generic save envelope.
      // Adopt restored objects before minting; never create a second anonymous pressure core.
      if (!this.state.ruckus.destroyed && (!this._entity('body') || !this._entity('core'))) {
        for (const e of [...this.state.entityList]) {
          const part = e.data?.ruckusPart;
          if (!e.alive || !['body', 'core', 'memorial', 'pulse'].includes(part)) continue;
          const held = this._entity(part);
          if (!held) this._refs[part] = e;
          else if (held !== e) this.helpers.removeEntity?.(e.id);
        }
      }
      if (this.state.ruckus.destroyed) {
        this._remove('body'); this._remove('core'); this._remove('pulse');
        if (!this._entity('memorial')) { this._spawn('memorial'); yield; }
        return;
      }
      // Death can precede its bus receipt; never turn a killed object into a fresh healthy one.
      const raw = this._refs.body;
      if (raw && !raw.alive && raw.hull <= 0) { this._die(); return; }
      if (!this._entity('body')) { this._spawn('body'); yield; }
      if (!this._entity('core')) { this._spawn('core'); this._origin = { ...TOY_HOME }; this._touchedAt = -100; this._disarm(); yield; }
    },
    _sync() { for (const _ of this._syncSteps()) { /* shared cooperative spawn path */ } },
    _say(key, important = false) {
      const now = this.state?.simTime || 0, text = L[key]; if (!text) return;
      if (!important && now - this._lastVoice < C.voiceCooldown) return;
      if (distance(this._player()?.pos, this._entity('body')?.pos || HOME) > C.hearRadius && key !== 'dead') return;
      this._lastVoice = now;
      const p = { id: `ruckus:${key}`, channel: 'comms', text, priority: important ? 58 : 23, ttl: important ? 12 : 8 };
      if (this.helpers.voice?.say) this.helpers.voice.say(p); else this.bus?.emit('toast', { text, kind: 'info', ttl: 9 });
      this.bus?.emit('ruckus:voice', { key, text });
    },
    _sound(key, pos = null) { this.bus?.emit('audio:cue', { id: `sfx_ruckus_${key}`, position: { ...(pos || this._entity('body')?.pos || HOME) }, gain: .6 }); },
    _setPhase(phase) {
      if (this._phase === phase) return;
      this._phase = phase; this._phaseAt = this.state?.simTime || 0;
      this.bus?.emit('ruckus:state', { phase, at: this._phaseAt });
    },
    _disarm() { this._charge = 0; this._countdown = 0; this._presentAt = 0; this._lastTick = -1; },
    _scan(p) {
      if (!this._live() || (!this._entity('body') && !this._entity('memorial'))) return;
      const player = this._player();
      if (!p || p.source !== 'player-scanner' || p.scannerId !== player.id || !Number.isSafeInteger(p.seq)
        || p.seq < 1 || !finiteXZ(p.pos) || distance(p.pos, player.pos) > 2 || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanPlayer === player && p.seq <= this._seq) return;
      this._scanPlayer = player; this._seq = p.seq;
      if (distance(player.pos, this._entity('body')?.pos || HOME) > Math.min(C.hailRadius, p.radius)) return;
      if (this.state.ruckus.destroyed) { this._say('memorial'); return; }
      if (this._phase === 'retreat') { this._say('hurt'); return; }
      if (ACTIVE.has(this._phase)) { this._disarm(); this._setPhase('sleep'); this._say('rest', true); return; }
      const first = !this.state.ruckus.met; this.state.ruckus.met = true; this.state.ruckus.visits++;
      this._setPhase('offer'); this._nextNudge = this.state.simTime + 20; this._say(first ? 'hello' : 'welcome', true); this._sound('wake'); this._dirty();
    },
    _collision(p) {
      const core = this._entity('core'), player = this._player();
      if (!this._live() || !core || !player || !p) return;
      if ((p.aId === core.id && p.bId === player.id) || (p.bId === core.id && p.aId === player.id)) {
        if (this.state.simTime - this._touchedAt > 1) this._origin = { x: core.pos.x, z: core.pos.z };
        this._touchedAt = this.state.simTime;
      }
    },
    _damage(p) {
      const body = this._entity('body');
      if (!body || !p || (p.entityId ?? p.targetId ?? p.id) !== body.id || !((p.applied ?? p.amount) > 0)) return;
      this.state.ruckus.hull = Math.max(0, body.hull); this._disarm();
      this._setPhase('retreat'); this._deadline = this.state.simTime + C.hurtSeconds; this._say('hurt', true); this._dirty();
    },
    _killed(p) { if (p && (p.id ?? p.entityId ?? p.targetId) === this._refs?.body?.id) this._die(); },
    _die() {
      if (this.state.ruckus.destroyed) return;
      this.state.ruckus.destroyed = true; this.state.ruckus.hull = 0;
      this._clear(); this._setPhase('memorial'); this._say('dead', true); this._dirty();
    },
    _drive(body, target, opts = {}) {
      if (!body || ruckusHoldsLine(this.state, body)) return;
      const p = this._player(), playerBound = Math.max(120, this._exitRadius() - 160);
      let goal = boundedPoint(boundedPoint(target, HOME, C.yardRadius), p.pos, playerBound);
      if (body.data.ruckusPart === 'body') goal = avoidObstacle(body, goal, this._obstacles, this._phase === 'carry' ? C.toyRadius : 0);
      const command = retrieverControl(body, goal, opts); if (command) writePhysicsControl(body, command);
    },
    _return() {
      const m = this.state.ruckus; m.returns++;
      m.longestThrow = Math.max(m.longestThrow, Math.min(C.yardRadius * 2, this._throwDistance));
      this._setPhase('present'); this._touchedAt = -100; this._origin = { ...this._entity('core').pos };
      this._say(m.returns === 1 ? 'returned' : m.returns === 2 ? 'second' : m.returns === 3 ? 'bonded' : 'returned', true);
      this._sound(m.returns === C.bondedAfter ? 'bond' : 'return');
      if (m.returns >= C.bondedAfter) { this._charge = 1; this._countdown = C.pulseSeconds; this._presentAt = this.state.simTime + 3; }
      this.bus?.emit('ruckus:retrieved', { returns: m.returns, distance: this._throwDistance, bonded: m.returns >= C.bondedAfter }); this._dirty();
    },
    _bark(core) {
      const center = { x: core.pos.x, z: core.pos.z }, exclude = [this._refs.body?.id, core.id];
      let affected = 0;
      // Deterministic nearest-first admission, not entity insertion order or RNG.
      const candidates = this.state.entityList.filter(e => distance(e.pos, center) < C.pulseRadius)
        .sort((a, b) => distance(a.pos, center) - distance(b.pos, center) || String(a.id).localeCompare(String(b.id)));
      for (const e of candidates) {
        const impulse = barkImpulse(e, center, exclude); if (!impulse) continue;
        queuePhysicsImpulse(e, impulse); if (++affected >= C.pulseMaxBodies) break;
      }
      this._disarm(); this._remove('pulse'); const fx = this._spawn('pulse', center);
      this._pulseAt = this.state.simTime; if (fx) fx.data.ruckusPose.pulseAt = this._pulseAt;
      this.state.ruckus.pulses++; this._sound('bark', center); this._say('bark');
      this.bus?.emit('ruckus:pulse', { position: center, affected, radius: C.pulseRadius }); this._dirty();
    },
    _pose() {
      const body = this._entity('body'), p = this._player(), now = this.state.simTime;
      for (const [part, e] of Object.entries(this._refs)) {
        if (!e?.alive) continue;
        const v = e.data.ruckusPose;
        v.phase = part === 'memorial' ? 'memorial' : this._phase; v.simTime = now; v.phaseAt = this._phaseAt;
        v.bond = Math.min(3, this.state.ruckus.returns); v.speed = speedOf(body); v.held = this._held;
        v.charge = this._charge; v.countdown = this._countdown / C.pulseSeconds;
        v.waiting = this._presentAt > now; v.pulseAt = this._pulseAt; v.pulseAge = now - this._pulseAt;
        v.gaze = body && p ? Math.atan2(p.pos.z - body.pos.z, p.pos.x - body.pos.x) - body.rot : 0;
      }
      const core = this._entity('core');
      if (core) core.data.scanLabel = this._charge ? `Pressure present · ${this._held ? 'held / countdown paused' : 'clear the amber ring'}` : 'Pressure core · Massline and throw';
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > .1 || this._restoring) return;
      if (!this._adventure() || !this._near()) { if (this._streaming) { this._clear(); this._setPhase('sleep'); } this._streaming = false; return; }
      if (!this._live()) {
        if (this._player()?.flags?.docked || !this._player()?.alive || this.state.mode !== 'flight') { this._disarm(); this._setPhase('sleep'); }
        return;
      }
      this._sync(); const body = this._entity('body'), core = this._entity('core'), p = this._player(), now = this.state.simTime;
      if (this._entity('pulse') && now - this._pulseAt > 1.25) this._remove('pulse');
      if (!body || !core) { this._pose(); return; }
      if (body.hull <= 0) { this._die(); return; }
      if (distance(body.pos, p.pos) > this._exitRadius() - 80 || distance(core.pos, p.pos) > this._exitRadius() - 80) {
        this._clear(); this._streaming = false; this._setPhase('sleep'); return;
      }
      if (!this._discovered && distance(p.pos, body.pos) < C.discoverRadius) { this._discovered = true; this._say('discover'); }
      if (now >= this._obstacleAt) {
        this._obstacleAt = now + .25;
        this._obstacles = this.state.entityList.filter(e => e.alive && e.collides && e !== body && e !== core && e !== p
          && e.data?.ruckusPart !== 'pulse' && distance(e.pos, body.pos) < 190).slice(0, 40);
      }
      this._held = ruckusHoldsLine(this.state, core);
      if (this._held) {
        if (!this._wasHeld) { this._origin = { x: core.pos.x, z: core.pos.z }; if (this._charge) this._say('held'); }
        this._touchedAt = now;
        if (this._phase === 'carry' || this._phase === 'chase') { this._setPhase('offer'); this._say('yours'); }
      } else if (this._wasHeld) {
        this._touchedAt = now; this._origin = { x: core.pos.x, z: core.pos.z };
        if (this._charge) this._countdown = Math.max(1.2, this._countdown);
      }
      this._wasHeld = this._held;
      if (distance(core.pos, HOME) > C.yardRadius + 100) {
        this._say('far'); this._remove('core'); this._disarm(); this._setPhase('sleep'); this._pose(); return;
      }
      if (this._phase === 'retreat') {
        this._drive(body, HOME, { maxSpeed: 85 });
        if (now >= this._deadline) { this._setPhase('sleep'); this._say('recovered'); }
      } else if (this._phase === 'sleep') {
        this._drive(body, HOME, { maxSpeed: 30, heading: 0 });
      } else if (this._phase === 'offer' || this._phase === 'present') {
        // Park to one side, leaving a clear firing/throwing corridor. Never follow to another sector.
        this._drive(body, { x: p.pos.x - 110, z: p.pos.z + 60 }, { maxSpeed: 36,
          heading: Math.atan2(core.pos.z - body.pos.z, core.pos.x - body.pos.x) });
        const displacement = distance(core.pos, this._origin);
        if (!this._charge && legalFetch({ now, touchedAt: this._touchedAt, displacement, speed: speedOf(core), held: this._held })) {
          this._throwDistance = displacement; this._setPhase('chase'); this._deadline = now + C.chaseSeconds; this._say('fetch');
        } else if (this._phase === 'offer' && now >= this._nextNudge && !this._held) { this._say('nudge'); this._nextNudge = now + 28; }
      } else if (this._phase === 'chase') {
        this._throwDistance = Math.max(this._throwDistance, distance(core.pos, this._origin));
        // Brake to the core's current drift; short lookahead is bounded and not an instant catch.
        this._drive(body, { x: core.pos.x + core.vel.x * .28, z: core.pos.z + core.vel.z * .28 }, { drift: core.vel });
        if (canCatch(body, core, this._held)) { this._setPhase('carry'); this._deadline = now + C.returnSeconds; this._sound('catch'); this._say('caught'); }
        else if (now >= this._deadline) { this._setPhase('offer'); this._touchedAt = -100; this._say('far'); }
      } else if (this._phase === 'carry') {
        const dx = body.pos.x - p.pos.x, dz = body.pos.z - p.pos.z, length = Math.hypot(dx, dz) || 1;
        const goal = { x: p.pos.x + dx / length * C.returnStandOff, z: p.pos.z + dz / length * C.returnStandOff };
        const heading = Math.atan2(p.pos.z - body.pos.z, p.pos.x - body.pos.x);
        this._drive(body, goal, { maxSpeed: C.carrySpeed, maxAccel: C.carryAccel, drift: speedOf(p) < 35 ? p.vel : null, heading });
        if (!this._held) {
          // Real spring-held core with opposite reaction force: neither a visual child nor a teleport.
          const command = retrieverControl(core, mouthPoint(body), { maxSpeed: 145, maxAccel: 220, drift: body.vel, heading: body.rot });
          if (command) {
            writePhysicsControl(core, command);
            queuePhysicsImpulse(body, { x: -command.force.x * dt, y: 0, z: -command.force.z * dt });
          }
        }
        if (distance(body.pos, goal) < 7 && distance(core.pos, mouthPoint(body)) < 8 && speedOf(body) < 8 && speedOf(core) < 9 && speedOf(p) < 6) this._return();
        else if (now >= this._deadline || distance(core.pos, body.pos) > 145) { this._setPhase('offer'); this._touchedAt = -100; }
      }
      if (this._charge && now >= this._presentAt) {
        if (this._presentAt > 0) { this._say('present', true); this._presentAt = 0; }
        if (!this._held) {
          this._countdown = Math.max(0, this._countdown - dt);
          const tick = Math.ceil(this._countdown); if (tick !== this._lastTick && tick > 0) { this._lastTick = tick; this._sound('tick', core.pos); }
          if (this._countdown <= 0) this._bark(core);
        }
      }
      if (this.state.ruckus.returns >= C.bondedAfter && !this.state.ruckus.quietHeard && speedOf(p) < 3 && distance(body.pos, p.pos) < 160 && !this._charge) {
        this._quiet += dt;
        if (this._quiet >= C.quietSeconds) { this.state.ruckus.quietHeard = true; this._say('quiet', true); this._dirty(); }
      } else this._quiet = 0;
      this._pose();
    },
    serialize() { const body = this._entity('body'); return normalizeRuckusMemory({ ...this.state?.ruckus, ...(body ? { hull: body.hull } : {}) }); },
    deserialize(raw) { const restoring = this._restoring; this._clear(); this.state.ruckus = normalizeRuckusMemory(raw); this._reset(); this._restoring = restoring; },
    newGame() { this._clear(); this.state.ruckus = freshRuckusMemory(); this._reset(); },
    destroy() {
      for (const off of this._unsubs || []) off(); this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders; if (providers && this._cook) { const at = providers.indexOf(this._cook); if (at >= 0) providers.splice(at, 1); }
      this._clear();
    },
  };
}
export const ruckus = createRuckus();
