// The sole writer of state.nemesis. Entity, damage, budget, UI and faction owners remain separate.
import { NEMESIS_RIVAL as RIVAL, NEMESIS_KITS, NEMESIS_CHAPTERS, NEMESIS_LINES,
  NEMESIS_STYLES } from '../data/nemesisRival.js';
import { LIMITS, clone, finite, integer, freshNemesis, freshEpisode, normalizeNemesis,
  boundedPush, keyForId } from '../nemesis/model.js';
import { admitEvidence, classifyPlayerKill, prepareNemesisPlan,
  predictionWasWrong } from '../nemesis/learning.js';

const TERMINAL = new Set(['spared', 'destroyed', 'lost']);
const entity = (state, id) => state && state.entities && state.entities.get(id);
const alive = (ship) => !!ship && Number.isFinite(ship.hull) && ship.hull > 0 && ship.alive !== false && ship.dead !== true;
const sector = (state) => state.world && state.world.currentSectorId || '';
const nowOf = (state) => Math.max(0, finite(state.simTime));
const localTag = (ship, encounterId) => ship && ship.data && ship.data.nemesis
  && ship.data.nemesis.encounterId === encounterId;

export function createNemesisSystem() {
  // No closure-owned runtime fields: createSimulation's Object.create system forks stay isolated.
  return {
    name: 'nemesis',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._offs = [];
      this.state.nemesis = normalizeNemesis(this.state.nemesis, nowOf(this.state));
      const on = (event, fn) => this._offs.push(this.bus.on(event, fn));
      on('entity:killed', (p) => this._killed(p));
      on('combat:kill', (p) => this._killed(p));
      on('massline:tumbled', (p) => this._tumbled(p));
      on('nemesis:observation', (p) => this._observation(p));
      on('nemesis:encounterStarted', (p) => this._started(p));
      on('nemesis:encounterRejected', (p) => this._rejected(p));
      on('nemesis:escaped', (p) => this._escaped(p));
      on('nemesis:spare', (p) => this._spare(p));
      on('sector:enter', () => this._sectorChanged());
      on('save:loaded', () => this._reconcile());
      // New Game must clear the arc (integration notes §4). The canonical FRESH_RUN_SYSTEMS reset
      // list lives in another lane's file; game:newGame fires inside the same new-game transition
      // (after resetFreshRunSystems), so clearing here keeps the contract without editing it.
      on('game:newGame', () => this.newGame());
    },
    destroy() {
      // Guard hasOwn: an uninitialized prototype fork must not detach its parent's listeners.
      if (Object.hasOwn(this, '_offs')) for (const off of this._offs || []) if (typeof off === 'function') off();
      this._offs = [];
    },
    newGame() { this.state.nemesis = freshNemesis(nowOf(this.state)); },
    serialize() { return clone(this.state.nemesis); },
    deserialize(data) { this.state.nemesis = normalizeNemesis(data, nowOf(this.state)); },
    inspect() { return this.serialize(); },
    _emit(event, payload) { this.bus.emit(event, clone(payload)); },
    _log(kind, detail, encounterId = '') {
      boundedPush(this.state.nemesis.log, { kind, detail, encounterId, at: nowOf(this.state) }, LIMITS.log);
    },
    _voice(situation, text, evidence = null, encounterId = null) {
      const m = this.state.nemesis;
      this._emit('nemesis:voice', { aceId: RIVAL.id, aceName: RIVAL.name, shipName: RIVAL.shipName,
        encounterId: encounterId ?? (m.active && m.active.id || m.pending && m.pending.id || ''),
        situation, text, evidence, t: nowOf(this.state) });
    },
    _flight() { return this.state.mode === 'flight' && alive(entity(this.state, this.state.playerId)); },
    _sensorFrame() {
      const a = this.state.nemesis.active;
      const sensors = this.helpers.aiSensors;
      return a && sensors && typeof sensors.frameFor === 'function'
        ? sensors.frameFor(a.bossId, this.state.tick) : null;
    },
    _witnessed(payload, targetId) {
      const a = this.state.nemesis.active;
      if (!a || !this._flight()) return false;
      // Explicit, trusted emitter provenance. A generic witnessed:true is NOT Orra's omniscience.
      if (Array.isArray(payload && payload.witnessIds)
          && (payload.witnessIds.includes(a.bossId) || payload.witnessIds.includes(RIVAL.id))) return true;
      const frame = this._sensorFrame();
      const contact = frame && Array.isArray(frame.contacts) && frame.contacts.find((c) => c.id === targetId);
      // A current explicit occlusion overrides a prior sighting. A kill can remove the entity
      // before the receipt reaches this listener, so remember only 0.75s of confirmed sightings.
      if (contact) return contact.visible === true && contact.valid !== false && finite(contact.confidence, 1) >= 0.55;
      const now = nowOf(this.state);
      return a.witnesses.some((row) => row.id === targetId && row.at <= now && now - row.at <= LIMITS.witnessMemoryS);
    },
    _admit({ style, key, source = 'direct' }) {
      const a = this.state.nemesis.active;
      if (!a || this.state.nemesis.ending) return false;
      return admitEvidence(this.state.nemesis, a.episode, { style, key, source });
    },
    _tumbled(p) {
      const m = this.state.nemesis;
      if (!m.active || !p || keyForId(p.victimId) == null) return;
      // Older tumble receipts lack an actor. Those may mark geometry but cannot prove player causality.
      if (p.playerCaused !== true && p.ownerId !== this.state.playerId && p.sourceId !== this.state.playerId
          && p.attackerId !== this.state.playerId) return;
      const now = nowOf(this.state);
      m.tumbles = m.tumbles.filter((row) => row.id !== p.victimId && now - row.at <= LIMITS.tumbleWindowS);
      boundedPush(m.tumbles, { id: p.victimId, at: now }, LIMITS.recentTumbles);
    },
    _killed(p) {
      const m = this.state.nemesis, a = m.active;
      if (!a || !p || m.ending) return;
      const id = p.id ?? p.victimId;
      const kill = classifyPlayerKill(p, this.state.playerId, m.tumbles, nowOf(this.state));
      // Orra directly experiences their own hull's final hit, even after the sensor drops it.
      if (kill && (id === a.bossId || this._witnessed(p, id))) {
        this._admit({ key: `kill:${keyForId(id)}`, style: kill.style });
      }
      if (id === a.bossId) {
        const caused = p.presentation && typeof p.presentation.playerCaused === 'boolean'
          ? p.presentation.playerCaused : p.killerId === this.state.playerId;
        this._finish(caused ? 'destroyed' : 'lost');
      } else if (id === this.state.playerId) this._finish('player_defeated');
    },
    _observation(p) {
      const a = this.state.nemesis.active;
      if (!a || !p || p.encounterId !== a.id || !NEMESIS_STYLES.includes(p.style)) return;
      if (p.actorId !== this.state.playerId || !this._flight()) return;
      if (p.source === 'crew_report') {
        // A live, present crew member can report, not arbitrary NPCs or a destroyed wing.
        const witness = entity(this.state, p.witnessId);
        if (!a.crewIds.includes(p.witnessId) || !alive(witness) || !localTag(witness, a.id)) return;
      } else if (!this._witnessed(p, this.state.playerId)) return;
      // At most one observation/style/5 seconds, regardless of weapon or event rate.
      const window = Math.floor(nowOf(this.state) / LIMITS.evidenceWindowS);
      this._admit({ key: `sample:${a.id}:${p.style}:${window}`, style: p.style,
        source: p.source === 'crew_report' ? 'report' : 'direct' });
    },
    update(dt, state) {
      this.state = state;
      const m = state.nemesis, now = nowOf(state);
      if (!m || m.ending || state.mode !== 'flight' || !(Number.isFinite(dt) && dt > 0)) return;
      if (now < m.nextCheckAt) return;
      m.nextCheckAt = now + LIMITS.checkS;
      if (m.active) { this._updateActive(now); return; }
      if (!this._flight() || !sector(state)) return;
      if (m.pending) {
        if (m.pending.sectorId !== sector(state)) { this._cancelPending('sector changed'); return; }
        if (m.pending.dispatched) {
          if (now - m.pending.requestedAt > LIMITS.retryS) this._cancelPending('deployment acknowledgement timed out');
          return;
        }
        if (now < m.pending.notBefore) return;
        // Mark in-flight before dispatch; the bus and host acknowledgement are synchronous.
        m.pending.dispatched = true; m.pending.requestedAt = now;
        this._emit('nemesis:encounterRequested', { requestId: m.pending.id,
          sectorId: m.pending.sectorId, plan: m.pending.plan, aceId: RIVAL.id });
        return;
      }
      if (now < m.nextContactAt) return;
      // No RNG consumed. Alternating handedness is deliberate choreography, not random sampling.
      const plan = prepareNemesisPlan(m, m.completed % 2 ? -1 : 1);
      m.requestSerial += 1;
      const id = `nemesis:${RIVAL.id}:${m.requestSerial}`;
      m.pending = { id, sectorId: sector(state), plan, requestedAt: now,
        warningAt: now, notBefore: now + LIMITS.warningS, dispatched: false };
      m.phase = 'announced';
      this._log('announced', plan.reason, id);
      this._emit('nemesis:announced', { requestId: id, aceId: RIVAL.id, sectorId: sector(state),
        notBefore: m.pending.notBefore, chapter: plan.chapter, kit: plan.primary,
        tell: NEMESIS_KITS[plan.primary].tell, opening: NEMESIS_KITS[plan.primary].opening });
    },
    _started(p) {
      const m = this.state.nemesis, pending = m.pending;
      if (!pending || !pending.dispatched || !p || p.requestId !== pending.id) return;
      const boss = entity(this.state, p.bossId), now = nowOf(this.state);
      if (!alive(boss) || !localTag(boss, pending.id) || sector(this.state) !== pending.sectorId) {
        this._cancelPending('invalid deployment acknowledgement'); return;
      }
      const crew = Array.isArray(p.crewIds) ? p.crewIds.filter((id) => id !== p.bossId
        && alive(entity(this.state, id)) && localTag(entity(this.state, id), pending.id)).slice(0, 2) : [];
      m.active = { id: pending.id, sectorId: pending.sectorId, bossId: p.bossId,
        crewIds: [p.bossId, ...new Set(crew)], startedAt: now, plan: clone(pending.plan),
        episode: freshEpisode(pending.id, now), retreatAt: null, surrenderedAt: null,
        act: 0, actChangedAt: now, geometryAt: now, geometrySamples: 0, farSamples: 0, witnesses: [] };
      m.lastPrimary = pending.plan.primary; m.pending = null; m.phase = 'encounter';
      const a = m.active, kit = NEMESIS_KITS[a.plan.primary];
      this._emit('namedAce:appeared', { aceId: RIVAL.id, entityId: a.bossId,
        signatureSpoken: true, sectorId: a.sectorId, t: now });
      this._voice('arrival', NEMESIS_CHAPTERS[a.plan.chapter].arrival);
      if (a.plan.primary !== 'open') this._voice('prediction', `ORRA: ${kit.response}`, {
        primary: a.plan.primary, units: a.plan.evidenceUnits, episodes: a.plan.evidenceEpisodes,
        confidence: a.plan.confidence, tell: kit.tell, opening: kit.opening,
      });
      this._emit('nemesis:engaged', { encounterId: a.id, aceId: RIVAL.id, bossId: a.bossId,
        plan: a.plan, crewIds: a.crewIds, t: now });
    },
    _rejected(p) {
      if (p && this.state.nemesis.pending && p.requestId === this.state.nemesis.pending.id) {
        this._cancelPending(typeof p.reason === 'string' ? p.reason.slice(0, 120) : 'host rejected');
      }
    },
    _cancelPending(reason) {
      const m = this.state.nemesis, id = m.pending && m.pending.id;
      m.pending = null; m.phase = 'waiting'; m.nextContactAt = nowOf(this.state) + LIMITS.retryS;
      if (id) this._emit('nemesis:requestCancelled', { requestId: id, reason });
    },
    _updateActive(now) {
      const m = this.state.nemesis, a = m.active, boss = entity(this.state, a.bossId);
      if (a.sectorId !== sector(this.state)) { this._finish('player_escaped'); return; }
      if (!boss || !localTag(boss, a.id)) { this._finish('interrupted'); return; }
      if (!alive(boss)) { this._finish('lost'); return; } // A missing kill receipt is never invented player credit.
      if (!alive(entity(this.state, this.state.playerId))) { this._finish('player_defeated'); return; }
      const hull = boss.hull / Math.max(1, finite(boss.hullMax, boss.hull));
      if (a.plan.chapter === 3) {
        const act = hull <= 0.35 ? 2 : hull <= 0.65 ? 1 : 0;
        if (act > a.act) {
          a.act = act; a.actChangedAt = now;
          this._voice('act', act === 1 ? NEMESIS_LINES.act2 : NEMESIS_LINES.act3);
          this._emit('nemesis:actChanged', { encounterId: a.id, act,
            tactic: a.plan.acts[act], telegraphS: 2, t: now });
        }
        if (hull <= LIMITS.surrenderHull && a.surrenderedAt == null) {
          a.surrenderedAt = now;
          this._voice('surrender', NEMESIS_LINES.surrendered);
          this._emit('nemesis:surrenderOffered', { encounterId: a.id, bossId: a.bossId, aceId: RIVAL.id });
        }
      } else if (a.retreatAt == null && now - a.startedAt >= LIMITS.minEncounterS
          && (hull <= LIMITS.retreatHull || now - a.startedAt >= LIMITS.maxEncounterS)) {
        a.retreatAt = now;
        this._voice('retreat', NEMESIS_LINES.retreat);
        this._emit('nemesis:retreatRequested', { encounterId: a.id, bossId: a.bossId, t: now });
      }
      // Cache a small, short-lived visible contact set. Production death processing can remove
      // a victim from sensors before entity:killed; the receipt alone never proves visibility.
      const frame = this._sensorFrame();
      a.witnesses = a.witnesses.filter((row) => now >= row.at && now - row.at <= LIMITS.witnessMemoryS);
      if (frame && Array.isArray(frame.contacts)) {
        for (const c of frame.contacts) {
          if (keyForId(c.id) == null) continue;
          const previous = a.witnesses.findIndex((row) => row.id === c.id);
          if (previous >= 0) a.witnesses.splice(previous, 1);
          if (c.visible === true && c.valid !== false && c.alive !== false && finite(c.confidence, 1) >= 0.55) {
            boundedPush(a.witnesses, { id: c.id, at: now }, LIMITS.witnesses);
          }
        }
      }
      // Optional real sensor geometry, sampled once per 5 simulation seconds, not each frame.
      if (now - a.geometryAt >= LIMITS.evidenceWindowS) {
        a.geometryAt = now;
        const contact = frame && Array.isArray(frame.contacts) && frame.contacts.find((c) => c.id === this.state.playerId
          && c.visible === true && c.valid !== false && finite(c.confidence, 1) >= 0.55);
        if (contact && contact.pos && boss.pos) {
          a.geometrySamples = Math.min(1000, a.geometrySamples + 1);
          const dx = contact.pos.x - boss.pos.x, dz = contact.pos.z - boss.pos.z;
          const distance = Math.hypot(dx, dz);
          const velocity = contact.vel || {};
          const outward = (finite(velocity.x) * dx + finite(velocity.z) * dz) / Math.max(1, distance);
          // Orra's own ranged doctrine is NOT evidence that the player is kiting. The visible
          // pilot must repeatedly move outward under their own power, not merely be far away.
          const far = distance >= 850 && outward > 40
            && Math.hypot(finite(velocity.x), finite(velocity.z)) > 60
            && a.retreatAt == null && a.surrenderedAt == null;
          a.farSamples = far ? Math.min(3, a.farSamples + 1) : 0;
          if (a.farSamples >= 3) this._admit({ key: `kite:${a.id}:${Math.floor(now / 5)}`, style: 'kite' });
        } else a.farSamples = 0;
      }
    },
    _escaped(p) {
      const a = this.state.nemesis.active;
      if (!a || !p || p.encounterId !== a.id || p.bossId !== a.bossId || a.retreatAt == null) return;
      // Trusted lifecycle receipt is also checked against geometry; an early callback cannot teleport the rival away.
      const boss = entity(this.state, a.bossId), player = entity(this.state, this.state.playerId);
      if (!alive(boss) || !player || !boss.pos || !player.pos || nowOf(this.state) - a.retreatAt < 6) return;
      if (Math.hypot(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z) < 1800) return;
      this._finish('rival_escaped');
    },
    _spare(p) {
      const a = this.state.nemesis.active;
      if (!a || !p || p.encounterId !== a.id || a.surrenderedAt == null || !this._flight()) return;
      const boss = entity(this.state, a.bossId);
      if (!alive(boss)) return; // No resurrection through a late UI choice.
      this._finish('spared');
    },
    _sectorChanged() {
      const m = this.state.nemesis;
      if (m.active && m.active.sectorId !== sector(this.state)) this._finish('player_escaped');
      if (m.pending && m.pending.sectorId !== sector(this.state)) this._cancelPending('sector changed');
    },
    _reconcile() {
      const m = this.state.nemesis;
      if (m.pending) {
        // A saved emitted request may have lost its deferred host callback. Invalidate its token.
        this._cancelPending('save load invalidated in-flight deployment');
      }
      if (m.active) {
        const boss = entity(this.state, m.active.bossId);
        if (!alive(boss) || !localTag(boss, m.active.id) || sector(this.state) !== m.active.sectorId) {
          this._finish('interrupted');
        }
      }
    },
    _finish(outcome) {
      const m = this.state.nemesis, a = m.active;
      if (!a) return;
      const now = nowOf(this.state), interrupted = outcome === 'interrupted';
      a.episode.outcome = outcome;
      a.episode.contradicted = predictionWasWrong(a.plan, a.episode);
      const receipt = { encounterId: a.id, bossId: a.bossId, crewIds: a.crewIds.slice(),
        aceId: RIVAL.id, outcome, chapter: a.plan.chapter, kit: a.plan.primary,
        counts: clone(a.episode.counts), contradicted: a.episode.contradicted, t: now };
      if (!interrupted) {
        boundedPush(m.episodes, clone(a.episode), LIMITS.episodes);
        m.completed = integer(m.completed + 1);
        // Do not march a struggling player toward a stronger finale for repeatedly losing.
        // A meaningful challenge advances the arc; empty sector-hopping does not.
        if (outcome === 'rival_escaped' || (outcome === 'player_escaped' && a.episode.total >= 6)) {
          m.progress = Math.min(3, m.progress + 1);
        }
        if (outcome === 'rival_escaped') { m.grudge = Math.min(LIMITS.grudge, m.grudge + 2); m.respect = Math.min(LIMITS.grudge, m.respect + 1); }
        if (outcome === 'player_escaped') m.grudge = Math.min(LIMITS.grudge, m.grudge + 1);
      }
      // Commit terminal state before emitting: reentrant/delayed kill and choice events are idempotent.
      m.active = null; m.pending = null; m.tumbles = [];
      m.ending = TERMINAL.has(outcome) ? outcome : null;
      m.phase = m.ending ? 'resolved' : 'waiting';
      m.nextContactAt = now + (interrupted ? LIMITS.retryS
        : Math.max(LIMITS.returnMinS, LIMITS.returnMaxS - m.grudge * 20));
      if (outcome === 'player_defeated') m.nextContactAt = now + LIMITS.returnMaxS;
      this._log('outcome', `${outcome}; ${a.plan.primary}; prediction contradicted=${receipt.contradicted}`, a.id);
      if (receipt.contradicted) this._voice('contradicted', NEMESIS_LINES.contradicted, receipt.counts, a.id);
      const lineKey = { rival_escaped: 'escaped', player_escaped: 'playerEscaped',
        player_defeated: 'victory', spared: 'spared', destroyed: 'destroyed', lost: 'lost' }[outcome];
      if (lineKey) this._voice(outcome, NEMESIS_LINES[lineKey], null, a.id);
      this._emit('nemesis:encounterEnded', receipt);
      if (outcome === 'rival_escaped') this._emit('namedAce:fled', { aceId: RIVAL.id, entityId: a.bossId, t: now });
      if (outcome === 'destroyed' || outcome === 'lost') this._emit('namedAce:defeated', { aceId: RIVAL.id, entityId: a.bossId, t: now });
      if (m.ending) this._emit('nemesis:resolved', { ...receipt, ending: m.ending });
    },
  };
}

export const nemesis = createNemesisSystem();
export default nemesis;
