// RUBRIC / HM-11 owns state.rubric, its own marker body, its own filing hull (F-41) and the mark
// entities that follow wrecks. It never writes credits, cargo, reputation, heat, the aftermath
// markers or any foreign entity's motion: motion crosses the physics command membrane only, and
// the one foreign field it enriches is a wreck's scan label (the lossLedger precedent). Rendering
// never decides whether a mark took; the sim checks the hull's own speed and spin.
//
// The loop: wrecks never slow down on their own, and a marker will not paint a moving hull. So the
// marker finds a hull, waits beside it matching its drift, and the player puts a Massline on it
// and brings it to rest. Held still for paintSeconds, the mark takes. Shake it and the paint smears.
import { RUBRIC as C, RUBRIC_LINES as L, RUBRIC_QUIET, RUBRIC_TRUTH as T,
  freshRubricMemory, normalizeRubricMemory } from '../data/rubric.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { hash32 } from '../core/rng.js';
import { isHostileToPlayer } from './scanner.js';
import { farActorTableRadius } from '../world/farActorTable.js';
import { finiteXZ, clamp, distanceXZ, speedOf, stillness, playerHoldsLine, mooringGoal, boundedServo,
  workPoint, truthFacts, truthLine, markStyle, scoreTarget, hostileNear } from '../characters/rubricRules.js';

export const RUBRIC_GLOBAL_ANCHOR = Object.freeze(sectorLocalToGlobalForSector(C.anchor, C.sectorId));
const HULL_REST = Object.freeze({ x: RUBRIC_GLOBAL_ANCHOR.x + 34, z: RUBRIC_GLOBAL_ANCHOR.z + 40 });
const F41 = 'f41';
const SELF = 'self';
// Stencil wheel cartridges: 0 level bars, 1 working dots, 2 alarm wedges, 3 struck eyes, 4 blank.
export const WHEEL = Object.freeze({ calm: 0, work: 1, alarm: 2, struck: 3, blank: 4 });
const isMarkEntity = e => e?.alive && e.data?.rubricPart === 'mark';

export function rubricEntitySpec(part = 'body', memory = freshRubricMemory(), extra = {}) {
  const base = { team: 2, factionId: null, collides: true, homeSectorId: C.sectorId };
  if (part === 'hull') {
    return { ...base, type: 'wreck', name: 'Hull F-41',
      pos: { x: HULL_REST.x, z: HULL_REST.z }, vel: { x: 0, z: 0 }, rot: 0.55, angVel: C.hullSpin,
      radius: C.hullRadius, mass: C.hullMass, hull: 1, hullMax: 1,
      physicsBody: { shape: 'capsule', mass: C.hullMass },
      data: { rubricPart: 'hull', identityKey: `${C.id}:f41`, persistenceOwner: 'rubric',
        homeSectorId: C.sectorId, sectorId: C.sectorId, parentType: 'ship', proportions: WRECK_COLLIDER_PROPORTIONS,
        wreckClass: 'battlefield', wreckClassLabel: 'Filed Hull', hulkOfDefId: 'ship_mule',
        loot: [], salvagePool: {}, salvageTimeLeft: 0, rubricLocked: true, killedAt: -3600,
        scanLabel: memory.f41 ? 'Hull F-41 · NOT CLEARED' : 'Hull F-41 · filed CLEARED' } };
  }
  if (part === 'mark') {
    const t = extra.target || { pos: HULL_REST, radius: C.hullRadius, rot: 0 };
    return { type: 'fx', team: 2, factionId: null, collides: false, physicsBody: false, name: 'Rubric mark',
      pos: { x: t.pos.x, z: t.pos.z }, rot: t.rot || 0, radius: t.radius || 8, hull: 1, hullMax: 1,
      flags: { invuln: true }, homeSectorId: C.sectorId,
      data: { rubricPart: 'mark', persistenceOwner: 'rubric', homeSectorId: C.sectorId, sectorId: C.sectorId,
        masslineTetherable: false, markKey: extra.key || '', targetId: t.id ?? null,
        visualRadius: (t.radius || 8) * 1.6,
        rubricMark: { key: extra.key || '', style: extra.style || 1, filed: !!extra.filed,
          progress: extra.progress ?? 0, cause: extra.cause || 'u', simTime: 0 } } };
  }
  return { ...base, type: 'drone', name: C.name,
    pos: { x: RUBRIC_GLOBAL_ANCHOR.x - 26, z: RUBRIC_GLOBAL_ANCHOR.z + 6 }, radius: C.radius, mass: C.mass,
    hull: memory.hull, hullMax: C.hull,
    physicsBody: { dynamic: true, shape: 'ball', radius: C.radius, mass: C.mass, useMeasuredSkin: false,
      material: 'debris', ccd: true, contact: { friction: 0.1, restitution: 0.2, linearDamping: 0.5, angularDamping: 2 } },
    data: { rubricPart: 'body', identityKey: C.id, ai: { passive: true }, homeSectorId: C.sectorId,
      callsign: C.callsign, scanLabel: 'RUBRIC · hull marker · scan to read its work',
      scannerSignalKind: 'anomaly', visualRadius: 40,
      rubricPose: { mode: 'idle', simTime: 0, wheel: WHEEL.calm, progress: 0, smear: 0, clamp: 0, spray: 0,
        paint: memory.paint, aim: { x: 0, z: 0, live: false }, aimRadius: 9, aimRot: 0, look: 0, wronged: memory.wronged,
        witness: memory.witness, memorial: memory.last === 'done', offer: false, held: false } } };
}

const shortCause = f => (f.cause === 'p' ? 'yours' : f.cause === 'y' ? 'your hull'
  : f.cause === 'o' ? (f.killerLabel ? `killed by ${f.killerLabel}` : 'killed by another hull')
    : f.cause === 'l' ? 'ledger loss' : 'cause unlogged');

export function createRubric() {
  return {
    name: 'rubric',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.rubric = normalizeRubricMemory(this.state.rubric);
      this._unsubs = []; this._restoring = false;
      this._reset();
      const on = (name, fn) => { const off = this.bus.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('scan:pulse', p => this._scan(p));
      on('voice:surface', p => this._surfaced(p));
      on('combat:damage', p => this._damage(p));
      on('entity:killed', p => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => { this._restoring = true; this._abortWork(); });
      on('save:loaded', () => { this._restoring = false; this._reset(); this._sync(); });
      on('sector:enter', p => { if (!deferSectorEnterMaterialization(this.state, p, this._cookProvider)) this._sync(); });
      this._cookProvider = () => this._syncSteps();
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = [])).push(this._cookProvider);
    },
    _reset() {
      const m = this.state?.rubric;
      this._bodyRef = null; this._hullRef = null;
      this._mode = m?.last === 'done' ? 'dark' : m?.last === 'offered' ? 'offer' : 'idle';
      this._target = null; this._paintT = 0; this._smearAt = -100; this._smear = 0;
      this._workMark = null; this._marks = new Map();
      this._fleeUntil = 0; this._hurtUntil = 0; this._reloadUntil = 0; this._lastVoice = -100; this._lastHostile = null;
      this._syncAt = 0; this._retargetAt = 0; this._nudgeAt = 0; this._nearSince = null;
      this._inside = false; this._discovered = false; this._quietSeq = 0; this._streaming = false;
      this._queue = []; this._pending = []; this._hullHeldAt = -100; this._hullAwayT = 0; this._hullGone = 0;
      this._announcedWork = false; this._tagged = new Set((m?.marks || []).map(x => x.k));
      this._tmp = { x: 0, z: 0 }; this._dv = { x: 0, z: 0 }; this._goal = { x: 0, z: 0 };
    },
    // ----- entity handles -------------------------------------------------------------------
    _entity(ref) { return ref && this.state?.entities?.get(ref.id) === ref && ref.alive ? ref : null; },
    _body() { return this._entity(this._bodyRef); },
    _hull() { return this._entity(this._hullRef); },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const r = this.state.run;
      return (!r || !r.kind || r.kind === 'adventure' || r.kind === 'campaign')
        && this.state.world?.currentSectorId === C.sectorId;
    },
    _live() {
      const p = this._player();
      return !this._restoring && this._adventure() && this.state.mode === 'flight' && this.state.timeScale > 0
        && p?.alive && !p.flags?.docked && finiteXZ(p.pos) && finiteXZ(p.vel);
    },
    /** The far-actor table's exit radius: beyond it a drone or wreck is shelved and later promoted as an anonymous shell. */
    _exitRadius() {
      try { const r = farActorTableRadius(this.state); if (r && Number.isFinite(r.exit) && r.exit > 400) return r.exit; }
      catch (_) { /* minimal harness: no far-actor table */ }
      return C.farFallback;
    },
    /** Distance streaming with hysteresis: the encounter is alive only while the player is near enough that the
     * far-actor table would leave it alone. */
    _streamed() {
      const p = this._player();
      if (!p || !finiteXZ(p.pos)) return this._streaming;
      const exit = this._exitRadius(), d = distanceXZ(p.pos, RUBRIC_GLOBAL_ANCHOR);
      const limit = this._streaming ? exit - C.streamOutMargin : exit - C.streamInMargin;
      return (this._streaming = d <= Math.max(limit, 250));
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) if (e?.alive && e.data?.rubricPart) this.helpers?.removeEntity?.(e.id);
      this._bodyRef = null; this._hullRef = null; this._marks.clear(); this._workMark = null;
    },
    // ----- census: adopt what exists, mint what is missing ----------------------------------
    _sync() { for (const _ of this._syncSteps()) { /* drained inline */ } },
    *_syncSteps() {
      if (this._restoring) return;
      const m = this.state.rubric;
      if (!this._adventure()) { this._streaming = false; this._abortWork(); this._removeOwned(); this._inside = false; return; }
      if (!this._streamed()) { this._abortWork(); this._removeOwned(); this._inside = false; return; }
      let body = null, hull = null;
      const marks = new Map();
      for (const e of (this.state.entityList || []).slice()) {
        yield;
        if (!e?.alive) continue;
        // A shell the far-actor table promoted from a shelved row keeps our owner stamp but not our part.
        if (!e.data?.rubricPart) { if (e.data?.persistenceOwner === 'rubric') this.helpers.removeEntity?.(e.id); continue; }
        const part = e.data.rubricPart;
        if (part === 'body' && !body && !m.destroyed) body = e;
        else if (part === 'hull' && !hull) hull = e;
        else if (part === 'mark' && !marks.has(e.data.markKey)) marks.set(e.data.markKey, e);
        else this.helpers.removeEntity?.(e.id);
      }
      if (m.destroyed && body) this.helpers.removeEntity?.(body.id);
      yield;
      if (!body && !m.destroyed) body = this.helpers.spawnEntity?.(rubricEntitySpec('body', m)) || null;
      if (!hull) hull = this.helpers.spawnEntity?.(rubricEntitySpec('hull', m)) || null;
      this._bodyRef = body; this._hullRef = hull; this._marks = marks;
      this._guardHullLabel();
      this._syncMarks();
      this._publish();
    },
    _guardHullLabel() {
      // lossLedger re-labels any wreck spawned in a sector with a recorded loss. F-41 keeps its own.
      const h = this._hull();
      if (!h) return;
      const want = this.state.rubric.f41 ? 'Hull F-41 · NOT CLEARED' : 'Hull F-41 · filed CLEARED';
      if (h.data.scanLabel !== want) h.data.scanLabel = want;
      if (h.data.wreckClass !== 'battlefield') h.data.wreckClass = 'battlefield';
      h.data.rubricLocked = true;
    },
    // ----- mark entities --------------------------------------------------------------------
    _wrecksByKey() {
      const out = new Map();
      for (const e of this.state.entityList || []) {
        if (!e?.alive || e.type !== 'wreck' || e.data?.rubricPart) continue;
        const k = e.data?.markerId || e.data?.aftermath?.markerId || e.data?.provenance?.markerId;
        if (k) out.set(String(k), e);
      }
      return out;
    },
    _markTarget(key, wrecks) { return key === F41 ? this._hull() : wrecks.get(key) || null; },
    _syncMarks() {
      const m = this.state.rubric, player = this._player();
      const wrecks = this._wrecksByKey();
      for (const [key, ent] of [...this._marks]) {
        const tgt = this._markTarget(key, wrecks);
        if (!ent.alive || !tgt || !tgt.alive) { this.helpers.removeEntity?.(ent.id); this._marks.delete(key); }
      }
      const live = [];
      for (const rec of m.marks) {
        if (rec.k === SELF) continue;
        const tgt = this._markTarget(rec.k, wrecks);
        if (!tgt) continue;
        if (tgt.data && tgt.data.rubricTruth !== rec.x && rec.k !== F41) this._enrichLabel(tgt, rec);
        live.push({ rec, tgt, d: player ? distanceXZ(tgt.pos, player.pos) : 0 });
      }
      live.sort((a, b) => a.d - b.d);
      for (const { rec, tgt } of live.slice(0, C.maxLiveMarks)) {
        if (this._marks.has(rec.k)) continue;
        const ent = this.helpers.spawnEntity?.(rubricEntitySpec('mark', m, { target: tgt, key: rec.k, style: rec.s,
          filed: rec.k === F41, progress: 1, cause: rec.c }));
        if (ent) this._marks.set(rec.k, ent);
      }
      if (!m.f41 && this._hull() && !this._marks.has(F41) && !this._workMark) this._ensureFiledMark();
    },
    _ensureFiledMark() {
      const hull = this._hull();
      if (!hull || this._marks.has(F41)) return;
      const ent = this.helpers.spawnEntity?.(rubricEntitySpec('mark', this.state.rubric,
        { target: hull, key: F41, style: 1, filed: true, progress: 0, cause: 'l' }));
      if (ent) this._marks.set(F41, ent);
    },
    _enrichLabel(wreck, rec) {
      const d = wreck.data;
      d.rubricTruth = rec.x;
      if (d.isCommunicator || d.parentType === 'communicator' || d.wreckMissionId || d.playerWreck) return;
      const base = String(d.wreckClassLabel || 'Wreck').slice(0, 24);
      d.scanLabel = `${base} · marked: ${rec.c === 'p' ? 'yours' : rec.c === 'o' ? 'killed by another hull'
        : rec.c === 'l' ? 'ledger loss' : 'cause unlogged'}`.slice(0, 64);
    },
    _followMarks() {
      const wrecks = this._wrecksByKey();
      for (const [key, ent] of this._marks) {
        const tgt = this._markTarget(key, wrecks);
        if (!tgt?.alive || !ent.alive) continue;
        ent.pos.x = tgt.pos.x; ent.pos.z = tgt.pos.z; ent.rot = tgt.rot || 0;
        if (ent.vel) { ent.vel.x = tgt.vel?.x || 0; ent.vel.z = tgt.vel?.z || 0; }
        ent.data.targetId = tgt.id;
        ent.data.rubricMark.simTime = this.state.simTime || 0;
      }
    },
    // ----- lifecycle ------------------------------------------------------------------------
    newGame() { this._removeOwned(); this.state.rubric = freshRubricMemory(); this._restoring = false; this._reset(); },
    serialize() {
      const m = this.state.rubric;
      return normalizeRubricMemory({ ...m, hull: this._body()?.hull ?? m.hull });
    },
    deserialize(raw) { this._removeOwned(); this.state.rubric = normalizeRubricMemory(raw); this._reset(); },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      if (this.state) this._removeOwned();
      const providers = this.helpers?.sectorCookProviders;
      if (providers) { const i = providers.indexOf(this._cookProvider); if (i >= 0) providers.splice(i, 1); }
      const q = this.state?.render?.deferredEnterMaterializers;
      if (q) for (let i = q.length - 1; i >= 0; i--) if (q[i].provider === this._cookProvider) q.splice(i, 1);
      this._cookProvider = null;
    },
    // ----- voice ----------------------------------------------------------------------------
    _say(key, important = false) { return this._speak(L[key], key, important); },
    _speak(text, key, important = false) {
      const now = this.state.simTime || 0;
      if (!text || (!important && now - this._lastVoice < C.voiceCooldown)) return false;
      this._lastVoice = now;
      // Register the delivery record BEFORE queuing: a floor that is free surfaces the line immediately.
      if (important) this._offer(key, text, now);
      this._emitVoice(text, key, important);
      this.bus.emit('rubric:voice', { key, text });
      return true;
    },
    _emitVoice(text, key, important) {
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `rubric:${key}`, channel: 'comms', priority: important ? 62 : 24, text, ttl: C.voiceTtl });
      else this.bus.emit('toast', { text, kind: 'info', ttl: C.voiceTtl });
    },
    // ----- re-offering: a line is delivered when it takes the floor, not when it is queued ------
    _offer(key, text, now) {
      const row = this._pending.find(r => r.key === key);
      if (row) { row.text = text; row.attempts = 0; row.deadline = now + C.voiceTtl + 0.5; }
      else if (this._pending.length < 4) this._pending.push({ key, text, attempts: 0, deadline: now + C.voiceTtl + 0.5 });
    },
    /** The arbiter announces every line that takes the one-voice floor; that is the delivery receipt. */
    _surfaced(p) {
      const text = p && p.text; if (!text || !this._pending?.length) return;
      const i = this._pending.findIndex(r => r.text === text);
      if (i >= 0) this._pending.splice(i, 1);
    },
    /** A line that expired in the queue behind a longer alert is offered again (never forced past it), at most
     * offerAttempts more times, and only while the pilot is still within earshot. */
    _reoffer(now, player, body) {
      for (const r of [...this._pending]) {
        if (now < r.deadline) continue;
        const gone = player && body && distanceXZ(player.pos, body.pos) > C.hearRadius * 2;
        if (gone || r.attempts >= C.offerAttempts || !this._live()) { this._pending.splice(this._pending.indexOf(r), 1); continue; }
        r.attempts++; r.deadline = now + C.voiceTtl + 0.5;
        this._emitVoice(r.text, r.key, true);
      }
    },
    _sayOnce(key, important = true) {
      const m = this.state.rubric;
      if (m.told.includes(key)) return false;
      if (!this._say(key, important)) return false;
      m.told.push(key);
      return true;
    },
    _later(seconds, key) { this._queue.push({ at: (this.state.simTime || 0) + seconds, key }); },
    _sound(id, pos) { this.bus.emit('audio:cue', { id, position: { ...(pos || this._body()?.pos || RUBRIC_GLOBAL_ANCHOR) }, gain: 0.7 }); },
    // ----- player verbs ---------------------------------------------------------------------
    _scan(p) {
      if (!this._live()) return;
      const player = this._player(), m = this.state.rubric;
      if (p?.source !== 'player-scanner' || p.scannerId !== player.id || !Number.isSafeInteger(p.seq) || p.seq < 1
        || !finiteXZ(p.pos) || distanceXZ(p.pos, player.pos) > 2 || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player; this._scanSeq = p.seq;
      const body = this._body();
      if (!body || m.destroyed) return;
      if (distanceXZ(body.pos, player.pos) > Math.min(C.scanRadius, p.radius)) return;
      if (m.last === 'done') { this._say('memorialScan', true); return; }
      if (!m.met) {
        m.met = true; this._say('hello', true); this._sound('sfx_rubric_wake'); this._later(7, 'brief'); this._publish(); return;
      }
      this._speak(this._statusLine(), 'status', true);
    },
    _statusLine() {
      const m = this.state.rubric;
      const bits = [`RUBRIC: Marks on file: ${m.witness}.`, `Red lead: ${Math.round(m.paint * 100)} percent.`];
      if (m.wronged > 0) bits.push('Damage on file: you.');
      if (m.last === 'offered') bits.push('One mark left. Hold me still.');
      else if (this._mode === 'flee') bits.push('Withdrawn. Contact in range.');
      else if (this._target && this._targetEntity()) {
        const t = this._targetEntity(), s = stillness(t);
        bits.push(s.still ? 'Marking.' : `Next: ${this._targetLabel()}, moving ${Math.round(s.speed)}, turning ${s.spin.toFixed(1)}.`);
      } else bits.push('Next: none in range.');
      return bits.join(' ');
    },
    _damage(p) {
      const body = this._body();
      if (!body || !p || p.targetId !== body.id || !(p.applied > 0)) return;
      const m = this.state.rubric, now = this.state.simTime || 0;
      m.hull = body.hull;
      this._fleeUntil = Math.max(this._fleeUntil, now + C.hurtQuietSeconds);
      this._abortWork();
      if (p.attackerId === this.state.playerId) {
        m.wronged = Math.min(99, m.wronged + 1); this._hurtUntil = now + 25;
        if (!this._sayOnce('hit')) this._sayOnce('wronged');
        else this._later(4, 'wronged');
      }
      this._sound('sfx_rubric_alarm', body.pos);
    },
    _killed(p) {
      if (!p || !this._adventure()) return;
      const body = this._bodyRef;
      if (body && p.id === body.id && this.state.entities.get(body.id) === body) {
        const m = this.state.rubric;
        m.destroyed = true; m.hull = 0; if (m.last === 'done') m.last = '';
        this._abortWork(); this._say('dead', true);
        this.bus.emit('rubric:destroyed', { witness: m.witness });
        this._bodyRef = null;
      }
    },
    // ----- targeting ------------------------------------------------------------------------
    _targetEntity() {
      const t = this._target; if (!t) return null;
      const e = t.key === F41 ? this._hull() : this.state.entities.get(t.id);
      return e?.alive && e.type === 'wreck' ? e : null;
    },
    _targetLabel() {
      const e = this._targetEntity();
      return e ? (e.data?.rubricPart ? 'Hull F-41' : truthFacts(e, this.state).label) : 'hull';
    },
    _chooseTarget(now) {
      const m = this.state.rubric, body = this._body();
      if (!body) return;
      const cur = this._targetEntity();
      let best = null, bestScore = -Infinity;
      const player = this._player(), roam = this._exitRadius() - C.roamMargin;
      const consider = (e, key) => {
        if (player && distanceXZ(e.pos, player.pos) > roam) return; // beyond the far-actor table: out of the marker's reach
        const facts = key === F41 ? { isPlayerHull: false, byPlayer: false, ageSeconds: null } : truthFacts(e, this.state);
        const s = scoreTarget(e, facts, RUBRIC_GLOBAL_ANCHOR, playerHoldsLine(this.state, e), this._tagged.has(key));
        if (s > bestScore) { bestScore = s; best = { id: e.id, key }; }
      };
      const hull = this._hull();
      if (hull && !m.f41) consider(hull, F41);
      // The first job is always F-41; the sector's other hulls wait until the filing is corrected.
      if (m.f41) for (const [k, e] of this._wrecksByKey()) consider(e, k);
      if (!best) { this._target = null; return; }
      if (cur && this._target && this._target.key !== best.key) {
        const curKey = this._target.key;
        const curFacts = curKey === F41 ? { isPlayerHull: false, byPlayer: false, ageSeconds: null } : truthFacts(cur, this.state);
        const curScore = scoreTarget(cur, curFacts, RUBRIC_GLOBAL_ANCHOR, playerHoldsLine(this.state, cur), this._tagged.has(curKey));
        if (curScore > -Infinity && bestScore < curScore + C.retargetMargin) return;
      }
      if (!this._target || this._target.key !== best.key) { this._paintT = 0; this._announcedWork = false; }
      this._target = best;
    },
    // ----- the work -------------------------------------------------------------------------
    _abortWork() {
      this._paintT = 0; this._smear = 0;
      if (this._workMark && this.state) {
        const ent = this._workMark;
        if (ent.alive && ent.data?.rubricMark) ent.data.rubricMark.progress = 0;
      }
      this._workMark = null;
    },
    _beginMark(tgt, key) {
      if (this._workMark?.alive && this._workMark.data.markKey === key) return;
      const ent = this._marks.get(key);
      if (ent?.alive) { this._workMark = ent; return; }
      const facts = key === F41 ? null : truthFacts(tgt, this.state);
      const made = this.helpers.spawnEntity?.(rubricEntitySpec('mark', this.state.rubric, { target: tgt, key,
        style: key === F41 ? 1 : markStyle(facts), filed: key === F41, progress: 0, cause: facts ? facts.cause : 'l' }));
      if (made) { this._marks.set(key, made); this._workMark = made; }
    },
    _complete(tgt, key) {
      const m = this.state.rubric, now = this.state.simTime || 0;
      const facts = key === F41 ? null : truthFacts(tgt, this.state, now);
      const text = key === F41 ? T.f41 : truthLine(facts, this.state.meta?.seed);
      const style = key === F41 ? 1 : markStyle(facts);
      const cause = key === F41 ? 'l' : facts.cause;
      m.marks = m.marks.filter(x => x.k !== key);
      m.marks.push({ k: key, c: cause, s: style, x: text.slice(0, C.markTextMax), t: now });
      if (m.marks.length > C.maxMarks) m.marks.splice(0, m.marks.length - C.maxMarks);
      m.witness++; this._tagged.add(key);
      m.paint = Math.max(0, m.paint - C.paintPerMark);
      if (key === F41) { m.f41 = true; tgt.data.scanLabel = 'Hull F-41 · NOT CLEARED'; }
      else this._enrichLabel(tgt, m.marks[m.marks.length - 1]);
      const ent = this._marks.get(key);
      if (ent?.alive) { ent.data.rubricMark.progress = 1; ent.data.rubricMark.style = style; }
      this._workMark = null; this._paintT = 0; this._target = null;
      this._sound('sfx_rubric_done', tgt.pos);
      if (key === F41) {
        this._say('f41', true);
        if (this.helpers.voice?.say) this.helpers.voice.say({ id: 'rubric:news', channel: 'news', priority: 30, text: L.news, ttl: 10 });
      } else {
        this._speak(`RUBRIC: ${text}`, 'marked', true);
        if (facts.cause === 'p') this._later(5, 'yours');
        else if (facts.cause === 'y') this._later(5, 'playerHull');
      }
      if (m.witness === 3) this._later(9, 'witness3');
      this.bus.emit('rubric:marked', { key, style, cause, text, witness: m.witness });
      if (m.paint < C.lowPaint) this._startReload(now);
    },
    _startReload(now) {
      this._mode = 'reload'; this._reloadUntil = now + C.reloadSeconds; this._abortWork(); this._target = null;
      this._say('lowPaint', true);
    },
    _paintTick(dt, now, body, tgt) {
      const m = this.state.rubric, key = this._target.key;
      this._beginMark(tgt, key);
      const s = stillness(tgt), held = playerHoldsLine(this.state, tgt);
      if (!this._announcedWork && held) { this._announcedWork = true; this._sayOnce('lineOn'); }
      if (s.still) {
        if (this._paintT === 0 || now - this._smearAt < 0.01) this._say('still');
        this._paintT += dt; this._smear = Math.max(0, this._smear - dt * 2);
        if (this._paintT >= C.paintSeconds) { this._complete(tgt, key); return; }
      } else {
        if (this._paintT > 0) {
          if (now - this._smearAt > C.smearGrace) this._paintT = Math.max(0, this._paintT - C.smearDecay * dt);
          if (this._smear < 0.5) { this._say('smear'); }
          this._smear = Math.min(1, this._smear + dt * 3);
        }
        this._smearAt = now;
        if (now >= this._nudgeAt) {
          // A hint the voice cooldown swallowed is retried on the next tick, not ten seconds later.
          let spoke = false;
          if (!s.speedOk && !held) spoke = this._sayOnce('brief', false) || this._say('nudge');
          else if (s.speedOk && !s.spinOk) spoke = this._say('turning');
          if (spoke) this._nudgeAt = now + C.nudgeSeconds * 0.25;
        }
      }
      if (this._workMark?.alive) this._workMark.data.rubricMark.progress = clamp(this._paintT / C.paintSeconds, 0, 1);
    },
    // ----- last layer -----------------------------------------------------------------------
    _lastTick(dt, now, body) {
      const m = this.state.rubric;
      const held = playerHoldsLine(this.state, body), s = stillness(body);
      if (held && s.speedOk) {
        if (this._paintT === 0) { this._say('lastStill', true); this._sound('sfx_rubric_clamp'); }
        this._paintT += dt;
        if (this._paintT >= C.paintSeconds) {
          m.marks = m.marks.filter(x => x.k !== SELF);
          m.marks.push({ k: SELF, c: 'l', s: m.wronged > 0 ? 2 : 1, x: T.self, t: now });
          m.witness++; m.last = 'done'; m.paint = 0; this._mode = 'dark'; this._paintT = 0;
          this._say('last', true); this._sound('sfx_rubric_last', body.pos);
          this.bus.emit('rubric:last', { witness: m.witness });
        }
      } else this._paintT = Math.max(0, this._paintT - dt * 0.6);
    },
    // ----- publish --------------------------------------------------------------------------
    _publish() {
      const body = this._body(), m = this.state.rubric;
      if (!body) return;
      const p = body.data.rubricPose, player = this._player(), tgt = this._targetEntity();
      p.mode = this._mode; p.simTime = this.state.simTime || 0;
      p.paint = m.paint; p.wronged = m.wronged; p.witness = m.witness; p.memorial = m.last === 'done';
      p.offer = this._mode === 'offer'; p.held = playerHoldsLine(this.state, body);
      p.progress = this._mode === 'offer' ? clamp(this._paintT / C.paintSeconds, 0, 1)
        : clamp(this._paintT / C.paintSeconds, 0, 1);
      p.smear = this._smear;
      const working = this._mode === 'work' && !!tgt;
      p.clamp += ((working ? 1 : 0) - p.clamp) * 0.15;
      p.spray = working && this._paintT > 0 && this._smear < 0.3 ? 1 : 0;
      // The face strikes its own eyes for a while after the player hurt it, even mid-retreat.
      p.wheel = m.last === 'done' ? WHEEL.blank : p.simTime < this._hurtUntil ? WHEEL.struck
        : this._mode === 'flee' ? WHEEL.alarm : working ? WHEEL.work : WHEEL.calm;
      if (tgt) {
        p.aim.x = tgt.pos.x - body.pos.x; p.aim.z = tgt.pos.z - body.pos.z; p.aim.live = working;
        p.aimRadius = tgt.radius || 9; p.aimRot = tgt.rot || 0;
      } else p.aim.live = false;
      for (const [key, ent] of this._marks) {
        if (ent.alive && ent.data.rubricMark) ent.data.rubricMark.smear = ent === this._workMark ? this._smear : 0;
        void key;
      }
      if (player && finiteXZ(player.pos)) p.look = Math.atan2(player.pos.z - body.pos.z, player.pos.x - body.pos.x);
      body.flags.invuln = false;
    },
    _impulse(e, dv) {
      const mass = e.physicsBody?.mass ?? e.mass;
      if (!finiteXZ(dv) || !Number.isFinite(mass) || mass <= 0) return false;
      this._tmp.x = dv.x * mass; this._tmp.z = dv.z * mass;
      return queuePhysicsImpulse(e, this._tmp, { source: 'rubric', part: e.data?.rubricPart || 'body' });
    },
    _steer(body, goal, dt, accel, speed, goalVel) {
      const dv = boundedServo(body, goal, dt, this._dv, accel, speed, goalVel);
      if (dv) this._impulse(body, dv);
    },
    // ----- hull F-41 ------------------------------------------------------------------------
    _hullTick(dt, now) {
      const hull = this._hull(), m = this.state.rubric, player = this._player();
      if (!hull) {
        this._hullGone += dt;
        if (this._hullGone > C.recallSeconds) { this._hullGone = 0; this._sync(); }
        return;
      }
      this._hullGone = 0;
      const held = playerHoldsLine(this.state, hull);
      if (held) this._hullHeldAt = now;
      if (now - this._hullHeldAt > 3) {
        const goal = m.f41 ? HULL_REST : mooringGoal(now, RUBRIC_GLOBAL_ANCHOR, this._goal);
        const dv = boundedServo(hull, goal, dt, this._dv, C.mooringAccel, m.f41 ? 8 : 12);
        if (dv) this._impulse(hull, dv);
      }
      // A filing the player carried off the sector comes back, but never under the player's nose.
      if (distanceXZ(hull.pos, RUBRIC_GLOBAL_ANCHOR) > C.mooringLeash && !held && player
        && distanceXZ(hull.pos, player.pos) > 500) {
        this._hullAwayT += dt;
        if (this._hullAwayT > C.recallSeconds) {
          this._hullAwayT = 0; this._abortWork(); this.helpers.removeEntity?.(hull.id); this._hullRef = null;
          this._marks.delete(F41);
        }
      } else this._hullAwayT = 0;
    },
    // ----- tick -----------------------------------------------------------------------------
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || this._restoring || !this.state) return;
      const now = this.state.simTime || 0, m = this.state.rubric;
      if (now >= this._syncAt) { this._syncAt = now + 1; this._sync(); }
      if (!this._adventure() || !this._streaming) return;
      this._followMarks();
      if (this._pending.length) this._reoffer(now, this._player(), this._body());
      for (let i = this._queue.length - 1; i >= 0; i--) {
        if (now >= this._queue[i].at && this._live()) { const q = this._queue.splice(i, 1)[0]; this._sayOnce(q.key, true); }
      }
      this._hullTick(dt, now);
      const body = this._body();
      if (!body) return;
      if (!this._live()) {
        if (this.state.mode !== 'flight' || this._player()?.flags?.docked) this._abortWork();
        return;
      }
      const player = this._player(), d = distanceXZ(player.pos, body.pos);
      if (!this._inside && d < C.workRadius) { this._inside = true; m.visits++; if (m.visits === 3 && m.met) this._say('third'); }
      if (!this._discovered && d < C.discoverRadius) { this._discovered = true; if (!m.met) this._say('discover'); }
      // Danger first: a marker is not armed.
      const threat = m.last === 'done' ? null : hostileNear(this.state, body.pos, C.fleeRange, isHostileToPlayer);
      if (threat && this._mode !== 'flee' && this._mode !== 'dark') {
        this._mode = 'flee'; this._abortWork(); this._lastHostile = threat.pos;
        this._say('flee', true); this._sound('sfx_rubric_alarm');
      }
      if (this._mode === 'flee') {
        if (threat) { this._fleeUntil = Math.max(this._fleeUntil, now + C.fleeSeconds); this._lastHostile = threat.pos; }
        if (!threat && now >= this._fleeUntil) { this._mode = m.last === 'offered' ? 'offer' : 'idle'; this._say('safe'); }
      } else if (now < this._fleeUntil && this._mode !== 'dark') {
        // Hit but nothing hostile in sight: withdraw to the line and stay quiet.
        this._mode = 'flee';
      }
      if (this._mode === 'dark') {
        this._steerIdle(body, dt, now);
      } else if (this._mode === 'flee') {
        const away = this._lastHostile || player.pos;
        const dx = body.pos.x - away.x, dz = body.pos.z - away.z, n = Math.hypot(dx, dz) || 1;
        this._goal.x = RUBRIC_GLOBAL_ANCHOR.x + dx / n * 90; this._goal.z = RUBRIC_GLOBAL_ANCHOR.z + dz / n * 90;
        if (!playerHoldsLine(this.state, body)) this._steer(body, this._goal, dt, C.maxAccel * 1.3, C.maxSpeed * 1.35);
      } else if (this._mode === 'reload') {
        this._steerIdle(body, dt, now);
        if (now >= this._reloadUntil) {
          m.paint = clamp(1 - m.witness * 0.125, 0.25, 1); this._mode = 'idle'; this._say('reloaded');
        }
      } else if (this._mode === 'offer') {
        this._lastTick(dt, now, body);
      } else {
        this._workTick(dt, now, body, player, m);
      }
      this._quietTalk(now, player, body, m);
      this._publish();
    },
    _steerIdle(body, dt, now) {
      if (playerHoldsLine(this.state, body)) return;
      this._goal.x = RUBRIC_GLOBAL_ANCHOR.x - 24 + Math.cos(now * 0.31) * 6;
      this._goal.z = RUBRIC_GLOBAL_ANCHOR.z + 6 + Math.sin(now * 0.23) * 6;
      this._steer(body, this._goal, dt, C.maxAccel * 0.6, C.maxSpeed * 0.7);
    },
    _workTick(dt, now, body, player, m) {
      if (m.met && m.witness >= C.lastAfter && m.last === '' && !m.destroyed) {
        m.last = 'offered'; this._mode = 'offer'; this._target = null; this._abortWork(); this._sayOnce('lastOffer', true);
        m.paint = Math.min(m.paint, 0.2); return;
      }
      if (m.met && m.paint < C.lowPaint) { this._startReload(now); return; }
      if (now >= this._retargetAt) { this._retargetAt = now + C.retargetSeconds; if (m.met) this._chooseTarget(now); }
      const tgt = this._targetEntity();
      if (!tgt) { this._mode = 'idle'; this._abortWork(); this._steerIdle(body, dt, now); return; }
      const key = this._target.key;
      const held = playerHoldsLine(this.state, body);
      const near = distanceXZ(body.pos, tgt.pos) <= (tgt.radius || 8) + C.reach + 6;
      this._mode = near ? 'work' : 'seek';
      if (this._mode === 'seek') {
        if (this._workMark) this._abortWork();
        if (m.met && !this._announcedSeek && distanceXZ(player.pos, tgt.pos) < C.hearRadius && !stillness(tgt).still) {
          this._announcedSeek = true; this._sayOnce('seek', false);
        }
      }
      workPoint(body, tgt, this._goal);
      const cap = clamp(speedOf(tgt) + 25, C.maxSpeed, 140);
      if (!held) this._steer(body, this._goal, dt, C.maxAccel * 1.5, cap, tgt.vel);
      if (this._mode === 'work' && m.met) this._paintTick(dt, now, body, tgt);
    },
    /** Ambient testimony: only after the player has sat quietly within earshot for quietSeconds, and
     * never on top of another line. Leaving earshot or speeding up resets the wait. */
    _quietTalk(now, player, body, m) {
      const near = distanceXZ(player.pos, body.pos) <= C.hearRadius && Math.hypot(player.vel.x, player.vel.z) <= 30;
      if (!near || !m.met || this._mode === 'flee' || this._mode === 'offer' || m.last === 'done') { this._nearSince = null; return; }
      if (this._nearSince == null) this._nearSince = now;
      if (now - this._nearSince < C.quietSeconds || now - this._lastVoice < C.quietSeconds) return;
      const pool = RUBRIC_QUIET.filter(q => q.f41 === null || q.f41 === m.f41);
      if (!pool.length) return;
      const ix = hash32(this.state.meta?.seed >>> 0 || 1, 'rubric-quiet', this._quietSeq++, m.visits) % pool.length;
      if (this._speak(pool[ix].text, 'quiet', false)) this._nearSince = now;
    },
  };
}
export const rubric = createRubric();
