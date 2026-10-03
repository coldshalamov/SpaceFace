// BRACKET is a complete encounter owner. Physics moves its bodies; render reads the pose only.
// No player movement/health, credits, inventory, input bindings or hostile AI is written here.
import { BRACKET as C, BRACKET_LINES, freshBracketMemory, normalizeBracketMemory } from '../data/bracket.js';
import { clamp, finiteXZ, goalCrossing, predictKeeperTarget, legalShot, keeperControl } from '../characters/bracketRules.js';
import { writePhysicsControl, queuePhysicsImpulse } from '../core/physicsAuthority.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ACTIVE = new Set(['serve', 'play', 'result']);
const STATIC_PARTS = ['post-left', 'post-right', 'bumper-left', 'bumper-right'];
export function bracketEntitySpec(part, center = C.anchor, memory = freshBracketMemory(), offset = 0) {
  const keeper = part === 'keeper', ball = part === 'ball', bumper = part.startsWith('bumper');
  const side = part.endsWith('left') ? -1 : 1;
  const x = keeper ? 0 : ball ? offset : side * (bumper ? C.bumperX : C.postX);
  const z = keeper ? C.keeperZ : ball ? C.serveZ : bumper ? C.bumperZ : C.goalZ;
  const radius = keeper ? C.keeperRadius : ball ? C.ballRadius : bumper ? C.bumperRadius : 6;
  const mass = keeper ? C.keeperMass : ball ? C.ballMass : 10000;
  return {
    type: ball ? 'payload' : 'drone', name: keeper ? 'BRACKET / Keeper of the Small Goal' : ball ? 'Scrapball · push or Massline' : 'BRACKET · yard hardware',
    team: 2, factionId: 'faction_free', pos: { x: center.x + x, z: center.z + z },
    radius, mass, hull: keeper ? memory.hull : 1000, hullMax: keeper ? C.hull : 1000,
    // Include every physical court counterpart on the compatibility backend too.
    collisionMask: 1 | 2 | 4 | 8 | 32 | 64 | 128, collides: true,
    flags: { invuln: !keeper },
    physicsBody: { dynamic: keeper || ball, sensor: false, shape: 'ball', radius, mass,
      useMeasuredSkin: false, material: 'debris', ccd: true, impactDamageScale: 0,
      contact: { friction: 0.08, restitution: ball || bumper ? 0.88 : 0.45,
        angularDamping: 0.6 } },
    data: { bracketPart: part, homeSectorId: C.sectorId, identityKey: `${C.id}:${part}`,
      ai: { passive: true }, visualRadius: keeper ? 22 : part === 'post-left' ? 120 : radius + 4,
      scanLabel: keeper ? 'BRACKET · scan to play scrapball' : 'Scrapball court',
      scannerSignalKind: 'anomaly', bracketPose: {} },
  };
}

export function createBracket() {
  return {
    name: 'bracket',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.bracket = normalizeBracketMemory(this.state.bracket);
      this._reset(); this._unsubs = [];
      const on = (name, fn) => { const off = this.bus?.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('scan:pulse', p => this._scan(p));
      on('collision', p => this._contact(p));
      on('tether:attached', p => this._tether(p));
      on('combat:damage', p => this._damage(p));
      on('entity:killed', p => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => { this._restoring = true; this._cancel(false); });
      on('save:loaded', () => { this._removeAll(); this._reset(); this._sync(); });
      on('sector:enter', () => { this._removeAll(); this._reset(); this._sync(); });
      on('sector:exit', () => { this._removeAll(); this._reset(); });
    },
    _reset() {
      this._ids = {}; this._center = { ...C.anchor }; this._phase = 'idle'; this._until = 0;
      this._nextSync = 0; this._lastVoice = -100; this._seq = 0; this._scanSource = null;
      this._score = 0; this._round = 0; this._results = []; this._bank = false; this._matchBanks = 0;
      this._touchAt = -100; this._launched = false; this._previousBall = null;
      this._tier = 0; this._keeperPhase = 'watch'; this._keeperUntil = 0; this._targetX = 0; this._nextRead = 0;
      this._discovered = false; this._inside = false; this._quietSeconds = 0;
      this._gesture = ''; this._gestureAt = -100; this._goalAt = -100; this._goalX = 0;
      this._bumps = {}; this._restoring = false; this._lastSaveAt = -100; this._closedUntil = 0;
    },
    newGame() { this._removeAll(); this.state.bracket = freshBracketMemory(); this._reset(); },
    serialize() {
      const e = this._entity('keeper');
      return normalizeBracketMemory({ ...this.state.bracket, hull: e ? e.hull : this.state.bracket.hull });
    },
    deserialize(raw) { this._removeAll(); this.state.bracket = normalizeBracketMemory(raw); this._reset(); },
    destroy() { for (const off of this._unsubs || []) off(); this._unsubs = []; this._removeAll(); },
    _entity(part) {
      const e = this.state?.entities?.get(this._ids?.[part]);
      return e?.alive && e.data?.bracketPart === part ? e : null;
    },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const kind = this.state?.run?.kind;
      return (!kind || kind === 'adventure' || kind === 'campaign')
        && this.state?.world?.currentSectorId === C.sectorId;
    },
    _running() {
      return this._adventure() && !this._restoring && this.state?.mode === 'flight'
        && this.state.timeScale > 0 && this._player()?.alive && !this._player()?.flags?.docked;
    },
    _remove(part) {
      const e = this._entity(part); if (e) this.helpers?.removeEntity?.(e.id);
      if (this._ids) delete this._ids[part];
    },
    _removeAll() {
      // Iterate a snapshot: removeEntity splices the canonical entityList synchronously.
      const owned = (this.state?.entityList || []).filter(e => e?.alive && e.data?.bracketPart).map(e => e.id);
      for (const id of owned) this.helpers?.removeEntity?.(id);
      this._ids = {};
    },
    _spawn(part, offset = 0) {
      const e = this.helpers.spawnEntity?.(bracketEntitySpec(part, this._center, this.state.bracket, offset));
      if (e) this._ids[part] = e.id;
      return e;
    },
    _sync() {
      if (!this._adventure() || this.state.bracket.destroyed) { this._removeAll(); this._cancel(false); return; }
      // Adopting an orphan keeper would carry a half-played match across a load boundary.
      if (!this._entity('keeper')) {
        const stale = this.state.entities.get(this._ids.keeper);
        if (stale?.data?.bracketPart === 'keeper' && stale.hull <= 0) {
          this.state.bracket.destroyed = true; this.state.bracket.hull = 0;
          this._removeAll(); this._cancel(false); return;
        }
        this._removeAll();
        for (const part of ['keeper', ...STATIC_PARTS]) this._spawn(part);
        this._phase = 'idle';
      }
      for (const part of STATIC_PARTS) if (!this._entity(part)) this._spawn(part);
    },
    _say(key, important = false) {
      const now = this.state.simTime || 0;
      if (!important && now - this._lastVoice < 6) return;
      const text = BRACKET_LINES[key]; if (!text) return;
      this._lastVoice = now;
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `bracket:${key}`, channel: 'comms', priority: important ? 60 : 23, text, ttl: important ? 9 : 7 });
      else this.bus?.emit('toast', { text, kind: 'info', ttl: 9 });
      this.bus?.emit('bracket:voice', { key, text });
    },
    _sound(id) { this.bus?.emit('audio:cue', { id: `sfx_bracket_${id}`, position: { ...this._center }, gain: 0.65 }); },
    _scan(p) {
      if (!this._running() || !this._entity('keeper')) return;
      const player = this._player();
      if (!p || p.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1 || !finiteXZ(p.pos)
        || distance(p.pos, player.pos) > 2 || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._seq) return;
      this._scanSource = player; this._seq = p.seq;
      if (distance(player.pos, this._center) > Math.min(p.radius, C.hailRadius)) return;
      if (this.state.simTime < this._closedUntil) { this._say('hurt'); return; }
      if (ACTIVE.has(this._phase)) { this._cancel(true); return; }
      const first = !this.state.bracket.met;
      this.state.bracket.met = true;
      this._score = 0; this._round = 0; this._results = []; this._matchBanks = 0;
      this._tier = Math.min(2, this.state.bracket.wins);
      this._say(first ? 'hello' : this.state.bracket.matches === 2 ? 'third' : 'serve', true);
      this._serve();
      this.bus?.emit('bracket:matchStarted', { keeperId: this._ids.keeper, tier: this._tier });
    },
    _serve() {
      this._remove('ball'); this._round++;
      this._phase = 'serve'; this._until = this.state.simTime + C.serveSeconds;
      this._bank = false; this._bumps = {}; this._touchAt = -100; this._launched = false; this._previousBall = null;
      this._keeperPhase = 'watch'; this._targetX = 0; this._nextRead = 0;
      this._gesture = 'serve'; this._gestureAt = this.state.simTime;
      this._sound('serve');
    },
    _startBall() {
      // Serving creates a new physical ball. It never teleports a tethered, living body.
      const offset = [0, -18, 18, -26, 26][this._round - 1] || 0;
      const e = this._spawn('ball', offset);
      if (!e) { this._cancel(false); return; }
      this._servePos = { ...e.pos }; this._previousBall = { x: offset, z: C.serveZ };
      this._phase = 'play'; this._until = this.state.simTime + C.shotSeconds;
    },
    _contact(p) {
      if (!this._running() || this._phase !== 'play' || !p) return;
      const ball = this._entity('ball'); if (!ball) return;
      const otherId = p.aId === ball.id ? p.bId : p.bId === ball.id ? p.aId : null;
      if (otherId == null) return;
      const other = this.state.entities.get(otherId);
      if (otherId === this.state.playerId) this._touchAt = this.state.simTime;
      else if (other?.data?.bracketPart?.startsWith('bumper') && this.state.simTime - this._touchAt <= C.playerTouchSeconds) {
        this._bank = true;
        // An authored powered plunger, not an aim assist: only an actual court contact can
        // top up the outgoing normal speed. Tangential velocity and player motion are untouched.
        const part = other.data.bracketPart, now = this.state.simTime;
        const dx = ball.pos.x - other.pos.x, dz = ball.pos.z - other.pos.z, length = Math.hypot(dx, dz);
        const closing = p.preSolveClosingSpeed;
        if (Number.isFinite(closing) && closing > 3 && length > 0.01 && length < C.bumperRadius + C.ballRadius + 5
          && now - (this._bumps[part] ?? -100) > 0.3) {
          this._bumps[part] = now;
          const nx = dx / length, nz = dz / length;
          const delta = clamp(Math.min(95, closing * 0.8) - (ball.vel.x * nx + ball.vel.z * nz), 0, 90);
          if (delta > 0) queuePhysicsImpulse(ball, { x: nx * delta * C.ballMass, y: 0, z: nz * delta * C.ballMass });
          this._sound('save');
          this.bus?.emit('bracket:bank', { ballId: ball.id, bumperId: other.id, deltaSpeed: delta });
        }
      }
      else if (otherId === this._ids.keeper && this._launched && this.state.simTime - this._lastSaveAt > 1.2) {
        this._lastSaveAt = this.state.simTime; this._gesture = 'save'; this._gestureAt = this.state.simTime;
        this._sound('save'); this._say('save');
        this.bus?.emit('bracket:save', { ballId: ball.id, keeperId: otherId });
      }
    },
    _tether(p) {
      if (this._running() && this._phase === 'play' && p?.targetId === this._ids.ball
        && (p.actorId === this.state.playerId || p.controllerId === this.state.playerId)) this._touchAt = this.state.simTime;
    },
    _damage(p) {
      const e = this._entity('keeper'); if (!e || !p) return;
      if ((p.entityId ?? p.targetId ?? p.id) !== e.id || !((p.applied ?? p.amount) > 0)) return;
      this.state.bracket.hull = clamp(e.hull, 0, C.hull);
      this._closedUntil = this.state.simTime + C.retreatSeconds;
      this._cancel(false); this._phase = 'closed'; this._gesture = 'fold'; this._gestureAt = this.state.simTime;
      this._say('hurt', true);
    },
    _killed(p) {
      if (!p || (p.id ?? p.entityId ?? p.targetId) !== this._ids.keeper) return;
      this.state.bracket.destroyed = true; this.state.bracket.hull = 0;
      this._cancel(false); this._removeAll(); this._say('dead', true);
    },
    _cancel(speak) {
      const wasActive = ACTIVE.has(this._phase);
      this._remove('ball'); this._phase = 'idle'; this._keeperPhase = 'watch'; this._targetX = 0;
      this._previousBall = null; this._matchBanks = 0;
      if (speak && wasActive) this._say('cancel', true);
    },
    _finishShot(scored, reason = 'miss') {
      if (this._phase !== 'play') return;
      const m = this.state.bracket, now = this.state.simTime;
      if (scored) {
        this._score++; this._goalAt = now; this._goalX = this._entity('ball')?.pos.x - this._center.x || 0;
        if (this._bank) this._matchBanks = (this._matchBanks || 0) + 1;
        const player = this._player(), reverse = player && Math.cos(player.rot) * player.vel.x + Math.sin(player.rot) * player.vel.z < -5;
        const key = this._bank ? 'bank' : reverse && !m.reverseGoal ? 'trick' : 'goal';
        if (reverse) m.reverseGoal = true;
        this._sound('goal'); this._say(key, true);
        this._gesture = 'concede'; this._gestureAt = now;
      } else { this._sound('save'); this._say(reason, true); }
      this._results.push(scored ? 1 : 0);
      this.bus?.emit('bracket:shotResolved', { round: this._round, goal: scored, bank: this._bank && scored, score: this._score });
      this._remove('ball'); this._phase = 'result'; this._until = now + C.resultSeconds;
    },
    _finishMatch() {
      const m = this.state.bracket;
      m.matches++; m.goals += this._score; m.bankGoals += this._matchBanks || 0; this._matchBanks = 0;
      m.best = Math.max(m.best, this._score); const won = this._score >= 3;
      if (won) m.wins++;
      if (this._score === C.rounds) m.perfect = true;
      this._phase = 'finished'; this._gesture = this._score === C.rounds ? 'no-hands' : won ? 'bow' : 'victory';
      this._gestureAt = this.state.simTime;
      this._say(this._score === C.rounds ? 'perfect' : won ? 'win' : 'lose', true);
      this.bus?.emit('bracket:matchFinished', { score: this._score, rounds: C.rounds, won, best: m.best, title: won ? 'Keeper of the Unreasonable Goal' : null });
    },
    update(dt, state = this.state) {
      if (!state || !Number.isFinite(dt) || dt <= 0 || dt > 0.25 || this._restoring) return;
      if (!this._adventure()) { if (Object.keys(this._ids || {}).length) this._removeAll(); this._cancel(false); return; }
      const player = this._player();
      if (!player?.alive || player.flags?.docked || state.mode !== 'flight') {
        if (state.mode !== 'pause' && state.mode !== 'paused' && state.mode !== 'menu') this._cancel(false);
        return;
      }
      if (!(state.timeScale > 0)) return;
      const now = state.simTime || 0;
      if (now >= this._nextSync) { this._sync(); this._nextSync = now + 2; }
      const keeper = this._entity('keeper'); if (!keeper) return;
      if (!finiteXZ(player.pos) || !finiteXZ(player.vel) || !finiteXZ(keeper.pos) || !finiteXZ(keeper.vel)) return;
      this.state.bracket.hull = clamp(keeper.hull, 0, C.hull);
      const range = distance(player.pos, this._center);
      if (range > C.leaveRadius && ACTIVE.has(this._phase)) this._cancel(true);
      if (range < C.discoverRadius && !this._discovered) {
        this._discovered = true;
        this._say(this.state.bracket.met ? this.state.bracket.wins ? 'champion' : 'welcome' : 'discover');
      }
      if (range > C.leaveRadius + 100) this._discovered = false;
      if (this._phase === 'closed' && now >= this._closedUntil) this._phase = 'idle';
      if (this._phase === 'serve' && now >= this._until) this._startBall();
      else if (this._phase === 'result' && now >= this._until) {
        if (this._round >= C.rounds) this._finishMatch(); else this._serve();
      }
      const ball = this._entity('ball');
      if (this._phase === 'play') {
        if (!ball || !finiteXZ(ball.pos) || !finiteXZ(ball.vel)) this._finishShot(false);
        else {
          const relative = { x: ball.pos.x - this._center.x, z: ball.pos.z - this._center.z };
          const speed = Math.hypot(ball.vel.x, ball.vel.z);
          // Live tether occupancy refreshes the physical player's authorship, not an arbitrary event.
          const tether = state.player?.tether;
          if (tether?.active && tether.targetId === ball.id) this._touchAt = now;
          if (legalShot(this._touchAt, now, distance(ball.pos, this._servePos), speed)) this._launched = true;
          const crossing = goalCrossing(this._previousBall, relative, C.ballRadius, dt);
          if (crossing && this._launched && now - this._touchAt <= C.playerTouchSeconds) this._finishShot(true);
          else if (now >= this._until) this._finishShot(false, 'timeout');
          else if (Math.abs(relative.x) > 158 || relative.z < C.goalZ - 30 || relative.z > 215) this._finishShot(false);
          else this._advanceKeeper({ pos: relative, vel: ball.vel }, now);
          this._previousBall = relative;
        }
      }
      if (this._phase !== 'play') { this._targetX = 0; this._keeperPhase = 'watch'; }
      const target = this._keeperPhase === 'tell' ? keeper.pos.x - this._center.x : this._targetX;
      writePhysicsControl(keeper, keeperControl(keeper, this._center.x + target, this._center.z + C.keeperZ, this._tier || 0));
      this._idleEasterEggs(player, range, dt);
      this._publishPose(now, player);
    },
    _advanceKeeper(ball, now) {
      if (this._keeperPhase === 'tell' && now >= this._keeperUntil) { this._keeperPhase = 'dash'; this._keeperUntil = now + C.dashSeconds; }
      else if (this._keeperPhase === 'dash' && now >= this._keeperUntil) { this._keeperPhase = 'recover'; this._keeperUntil = now + C.recoverSeconds; }
      else if (this._keeperPhase === 'recover' && now >= this._keeperUntil) { this._keeperPhase = 'watch'; this._targetX = 0; }
      if (this._keeperPhase !== 'watch' || !this._launched || now < this._nextRead) return;
      this._nextRead = now + C.reactionSeconds;
      const target = predictKeeperTarget(ball, this._tier);
      if (target === null) return;
      this._targetX = target; this._keeperPhase = 'tell'; this._keeperUntil = now + C.tellSeconds;
      this._sound('tell');
    },
    _idleEasterEggs(player, range, dt) {
      const m = this.state.bracket;
      if (!ACTIVE.has(this._phase) && m.met && range < 130 && Math.hypot(player.vel.x, player.vel.z) < 3) this._quietSeconds += dt;
      else this._quietSeconds = 0;
      if (this._quietSeconds > 18 && !m.quiet) { m.quiet = true; this._say('quiet'); this._gesture = 'shrug'; this._gestureAt = this.state.simTime; }
      if (this._quietSeconds > 42 && !m.tiny) { m.tiny = true; this._say('tiny'); }
    },
    _publishPose(now, player) {
      for (const part of ['keeper', ...STATIC_PARTS, 'ball']) {
        const e = this._entity(part); if (!e) continue;
        const p = e.data.bracketPose;
        p.bumpAt = this._bumps[part] ?? -100;
        p.simTime = now; p.phase = this._phase; p.keeperPhase = this._keeperPhase;
        p.score = this._score; p.round = this._round; p.results = this._results;
        p.tell = this._keeperPhase === 'tell' ? clamp(1 - (this._keeperUntil - now) / C.tellSeconds, 0, 1) : 0;
        p.targetX = this._targetX; p.gesture = this._gesture; p.gestureAt = this._gestureAt;
        p.goalAt = this._goalAt; p.goalX = this._goalX; p.champion = this.state.bracket.perfect;
        p.remaining = this._phase === 'play' ? Math.max(0, this._until - now) / C.shotSeconds : 1;
        p.gaze = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        p.awake = this.state.bracket.met;
      }
    },
  };
}
export const bracket = createBracket();
