// Live circuit on the existing entity/physics/flight owners. Exhibit tapes are never executed here.
import { createPhysicalVenue } from '../../gallery/orbital/venue.js';
import { EVENTS, eventById } from './circuit.js';
import { noteBracketDiscovery, nextUnlockedEvent } from './discover.js';
import { createSession, judgeAuthoritativeSession, resultView,
  serializeSession, deserializeSession } from './session.js';
import { freshLeagueMemory, normalizeLeagueMemory, claimPurse, tierUnlocked, noteAttempt } from './memory.js';
import { ARENAS } from './arenas.js';

const INSTRUCTIONS = Object.freeze({
  keeper: 'Push or tow the ball through the goal. Read the keeper, then take the open side.',
  bank: 'Rebound the ball from a marked rail before sending it through the goal.',
  curl: 'Deliver the stone wholly inside the marked pad and let it settle.',
  relay: 'Hold a real Massline, then cut inside each handoff zone before crossing the goal.',
  magnet: 'Touch the ball and let the field bend its path into the marked pocket.',
  contain: 'Use your hull or Massline to keep every puck inside the moving pen.',
});
const PUBLIC_EVENTS = EVENTS.map(({ id, title, sport, tier, shots, need, purse }) => ({ id, title, sport, tier, shots, need, purse }));

export function createLiveKineticLeague() {
  return {
    name: 'kineticLeague',
    init(ctx) {
      this.destroy(); this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus;
      this.helpers = ctx.helpers || {}; this.session = null; this._venue = null;
      this.state.kineticLeague = normalizeLeagueMemory(this.state.kineticLeague);
      this._unsubs = [];
      const on = (name, fn) => { const off = this.bus?.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('bracket:matchStarted', () => this._discover('match-started'));
      on('bracket:matchFinished', () => this._discover('match-finished'));
      on('kinetic-league:enter', payload => this.beginMatch(payload?.eventId));
      on('kinetic-league:retry', () => this.retry());
      on('kinetic-league:next', () => this.next());
      on('kinetic-league:leave', () => this.leave());
      on('physics-venues:records', payload => {
        this.state.kineticLeague = normalizeLeagueMemory(payload?.league);
        if (this.session) this.session.memory = this.state.kineticLeague;
      });
      on('collision', payload => this._contact(payload));
      on('physics:impact', payload => this._contact(payload));
      on('tether:attached', payload => this._line(payload, false));
      on('tether:broken', payload => this._line(payload, true));
      for (const name of ['sector:exit', 'game:exitToMenu', 'save:restoring']) on(name, () => this.leave());
      on('game:newGame', () => this.newGame());
    },
    _discover(via) {
      const result = noteBracketDiscovery(this.state, { via });
      if (result.ok) this.bus?.emit('kinetic-league:discovered', result);
      return result;
    },
    _enterNext() { return this.beginMatch(); },
    beginMatch(eventId, opts = {}) {
      const event = eventById(eventId || nextUnlockedEvent(this.state.kineticLeague)?.id || EVENTS[0].id);
      if (!event) return { ok: false, reason: 'unknown-event' };
      if (this.state.mode !== 'flight') return { ok: false, reason: 'launch-flight-first' };
      // Choosing the circuit from the public venue board is an explicit discovery too.
      if (event.tier === 'qualification') this.state.kineticLeague.discovered = true;
      if (!opts.practice && !tierUnlocked(this.state.kineticLeague, event.tier, EVENTS)) {
        return { ok: false, reason: 'tier-locked', eventId: event.id };
      }
      const session = createSession(event.id, { seed: opts.seed, memory: this.state.kineticLeague,
        shipId: this.state.playerId, practice: true,
        solution: { shipAt: { ...eventByArenaShip(event) } } });
      if (!session.ok) return session;
      this.ctx.registry?.get('orbitalGallery')?.leave();
      this.leave(); this.session = session;
      const mounted = this._mount(session);
      if (!mounted.ok) { this.session = null; return mounted; }
      session.practice = opts.practice === true;
      if (!session.practice) noteAttempt(this.state.kineticLeague, event.id);
      this._publish();
      this.bus?.emit('kinetic-league:started', this.status());
      return session;
    },
    enterMatch(eventId, opts) { return this.beginMatch(eventId, opts); },
    _mount(session) {
      const ship = session.bodies.find(body => body.role === 'ship');
      const arena = session.arena;
      const markers = session.event.sport === 'curl' ? arena.pads
        : session.event.sport === 'magnet' ? [{ id: 'pocket', ...arena.pocket }]
          : session.event.sport === 'contain' ? [{ id: 'pen', ...arena.pen }]
            : [{ id: 'goal', x: arena.goal.center || 0, z: arena.goal.plane,
              radius: arena.goal.aperture }, ...(arena.zones || [])];
      this._venue = createPhysicalVenue(this.ctx, { id: 'kinetic-league', bodies: session.bodies,
        solids: session.solids, fields: session.fields, shipAt: ship, markers });
      if (!this._venue.ok) { const fail = this._venue; this._venue = null; return fail; }
      session.authoritative = true; session.liveInput = true;
      this._contacts = []; this._contactAt = new Map(); this._notified = false;
      this._venue.read(session.bodies);
      return { ok: true };
    },
    _contact(hit) {
      const session = this.session, venue = this._venue;
      if (!venue || session?.phase !== 'play' || !hit) return;
      const a = venue.key(hit.aId), b = venue.key(hit.bId);
      if (!a || !b) return;
      const bodies = session.bodies;
      const first = bodies.find(body => body.id === a), second = bodies.find(body => body.id === b);
      const scoring = body => body && ['ball', 'payload', 'stone', 'puck'].includes(body.role);
      if ((a === 'ship' && scoring(second)) || (b === 'ship' && scoring(first))) {
        session.playerTouched = true; session.lastTouch = 'player'; session.touchAt = session.simTime;
      }
      const solid = session.solids.find(row => row.id === a || row.id === b);
      if (solid && (scoring(first) || scoring(second))) {
        const now = session.simTime, last = this._contactAt.get(solid.id) ?? -100;
        if (now - last < 0.15) return;
        this._contactAt.set(solid.id, now);
        if (solid.railId) {
          if (!session.railsHit.includes(solid.railId)) session.railsHit.push(solid.railId);
          session.bankContacts += 1;
        }
        if (solid.tag === 'post') session.postHits += 1;
        if (solid.tag === 'bumper') session.bumperHits += 1;
        if (solid.tag === 'guard') session.guardHits += 1;
      }
      if ((first?.role === 'keeper' && scoring(second)) || (second?.role === 'keeper' && scoring(first))) {
        session.lastTouch = 'keeper'; session.keeperTouches += 1;
      }
      if ((first?.role === 'charge' && scoring(second)) || (second?.role === 'charge' && scoring(first))) {
        session.stolen = true; session.legalTransfers = 0;
      }
    },
    _line(payload, cut) {
      const session = this.session, venue = this._venue;
      // The authority may break a line while its ball is being retired between serves.
      if (cut && payload?.attachmentId && payload.attachmentId === session?.masslineAttachmentId) {
        session.masslineLatched = false;
        session.masslineAttachmentId = null;
      }
      if (!venue || session?.phase !== 'play' || !payload || !venue.owned.has(payload.targetId)
          || ![payload.actorId, payload.ownerId, payload.controllerId].includes(this.state.playerId)) return;
      session.playerTouched = true; session.lastTouch = 'player'; session.touchAt = session.simTime;
      if (!cut) {
        session.lastAttachAt = session.simTime;
        if (payload.attachmentId) {
          session.masslineAttachmentId = payload.attachmentId;
          session.masslineLatched = true;
          session.masslineArmed = false;
        }
        return;
      }
      if (!['cut', 'pilot', 'throw_release', 'action_cut', 'tether_cut'].includes(payload.reason)) return;
      this._contacts.push({ kind: 'tether-cut', a: 'ship', b: venue.key(payload.targetId) });
    },
    update(dt) {
      if (!(dt > 0) || this.state?.mode !== 'flight') return;
      if (this._pending) {
        const raw = this._pending; this._pending = null;
        const resumed = deserializeSession(raw, {});
        if (resumed.ok) {
          resumed.memory = this.state.kineticLeague; this.session = resumed;
          this._mount(resumed);
        }
      }
      const session = this.session, venue = this._venue;
      if (!venue || !session?.liveInput) return;
      if (session.phase === 'play') this._consumeMassline();
      if (!['play', 'result'].includes(session.phase)) return;
      const poses = venue.snapshot(session.bodies);
      const previousPhase = session.phase;
      judgeAuthoritativeSession(session, poses, dt, this._contacts.splice(0));
      venue.reconcile(session.bodies);
      if (previousPhase === 'result' && session.phase === 'play') {
        this.ctx.registry?.get('world')?.relocatePlayerInSector?.({
          x: venue.center.x + session.arena.ship.x, z: venue.center.z + session.arena.ship.z,
        }, { reason: 'kinetic-league:serve' });
      }
      if (session.phase === 'play') venue.drive(session.bodies, dt, session.rivalForce, session);
      if (!['play', 'result'].includes(session.phase) && !this._notified) {
        this._notified = true;
        if (session.won && !session.practice) claimPurse(this.state.kineticLeague, session.event);
        this.bus?.emit('kinetic-league:finished', this.status());
      }
      this._publish();
    },
    retry(opts = {}) {
      if (!this.session?.event) return { ok: false, reason: 'no-session' };
      return this.beginMatch(this.session.event.id, { seed: this.session.seed,
        practice: opts.practice ?? this.session.practice });
    },
    next() { return this.beginMatch(); },
    leave() {
      this._venue?.close(); this._venue = null; this._pending = null;
      if (this.session && ['play', 'result'].includes(this.session.phase)) {
        this.session.phase = 'cancelled'; this.session.reason = 'left';
      }
      if (this.state?.physicsVenuePublic?.kind === 'league') {
        this.state.physicsVenuePublic = { kind: 'league', active: false, memory: this.state.kineticLeague };
      }
      return this.session;
    },
    status() {
      const session = this.session;
      return { active: !!this._venue, events: PUBLIC_EVENTS, memory: this.state.kineticLeague,
        id: session?.event?.id || null, title: session?.event?.title || 'Kinetic League',
        instruction: INSTRUCTIONS[session?.event?.sport] || 'Choose an event. Your flight controls and Massline remain active.',
        phase: session?.phase || 'idle', remainingSeconds: session ? Math.max(0, session.event.shotSeconds - session.shotTime) : 0,
        progress: session ? resultView(session) : null,
        shots: session?.shots || 0, target: session?.event?.need || 0,
        center: this._venue?.center || null, arena: session?.arena || null,
        result: session && !['play', 'result'].includes(session.phase) ? resultView(session) : null };
    },
    _publish() { this.state.physicsVenuePublic = { kind: 'league', ...this.status() }; },
    _consumeMassline() {
      const session = this.session;
      const command = this.state.input?.actions?.massline;
      const attachments = this._venue?.kernel?.attachments;
      if (session.masslineAttachmentId && typeof attachments?.get === 'function'
          && attachments.get(session.masslineAttachmentId)?.state !== 'active') {
        session.masslineLatched = false;
        session.masslineAttachmentId = null;
      }
      // The command object stays the caller's. A latch press is remembered until the hull is in reach.
      if (command?.latch === true && !session.masslineLatched) session.masslineArmed = true;
      if (command?.cut === true) {
        session.masslineArmed = false;
        const id = session.masslineAttachmentId;
        if (id && attachments?.cut(id, this.state.playerId, 'action_cut')?.ok) {
          session.masslineLatched = false;
          session.masslineAttachmentId = null;
        }
        return;
      }
      if (!session.masslineArmed || session.masslineLatched) return;
      const venue = this._venue;
      const player = this.state.entities.get(this.state.playerId);
      if (!attachments || !player?.pos) return;
      let target = null;
      let best = (session.tetherReach ?? 20) ** 2;
      for (const body of session.bodies) {
        if (!body.alive || !['ball', 'payload', 'stone', 'puck'].includes(body.role)) continue;
        const entity = venue.entity(body.id);
        if (!entity?.alive || !entity.pos) continue;
        const dx = entity.pos.x - player.pos.x, dz = entity.pos.z - player.pos.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 <= best && dist2 > 0.25) { best = dist2; target = entity; }
      }
      if (!target) return;
      const created = attachments.create({
        defId: 'tether_standard', ownerId: player.id, targetId: target.id, restLength: 18,
        sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
        targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
      });
      if (created?.ok) {
        session.masslineArmed = false;
        session.masslineLatched = true;
        session.masslineAttachmentId = created.attachment?.id || null;
        session.playerTouched = true;
        session.lastTouch = 'player';
        session.touchAt = session.simTime;
      }
    },
    footprint() { return this._venue ? this._venue.owned.size : 0; },
    newGame() { this.leave(); this.session = null; this.state.kineticLeague = freshLeagueMemory(); },
    serialize() {
      return { memory: normalizeLeagueMemory(this.state.kineticLeague),
        session: this._venue && ['play', 'result'].includes(this.session.phase)
          ? { ...serializeSession(this.session), authoritative: true,
            sectorId: this.state.world?.currentSectorId } : null };
    },
    deserialize(raw) {
      this.leave(); this.session = null;
      this.state.kineticLeague = normalizeLeagueMemory(raw?.memory || raw);
      const saved = raw?.session;
      if (saved?.authoritative === true && eventById(saved.eventId)
          && [saved.simTime, saved.shotTime, saved.tick].every(Number.isFinite)
          && ['play', 'result'].includes(saved.phase)
          && Array.isArray(saved.bodies) && saved.bodies.length <= 64
          && saved.bodies.every(body => [body.x, body.z, body.vx, body.vz].every(Number.isFinite))
          && (!saved.sectorId || saved.sectorId === this.state.world?.currentSectorId)) this._pending = saved;
    },
    destroy() { for (const off of this._unsubs || []) off(); this._unsubs = []; this.leave(); this.session = null; },
  };
}

function eventByArenaShip(event) { return ARENAS[event.arena].ship; }
