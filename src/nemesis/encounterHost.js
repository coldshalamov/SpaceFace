// Spawn/lifecycle adapter. Dependency-injected for headless tests; production passes combat's
// makeEnemySpawnSpec. This owner writes ONLY state.nemesisDeployment and new entity specs.
import { NEMESIS_KITS, NEMESIS_RIVAL as RIVAL } from '../data/nemesisRival.js';
import { LIMITS, clone, finite, normalizePlan, keyForId } from './model.js';

const alive = (ship) => ship && ship.alive !== false && ship.dead !== true && finite(ship.hull) > 0;
const sector = (state) => state.world && state.world.currentSectorId || '';
const fresh = () => ({ version: 1, nextCheckAt: 0, reservation: null, retirement: [] });
function normalize(value) {
  const out = fresh();
  out.nextCheckAt = Math.max(0, finite(value && value.nextCheckAt));
  if (value && value.version != null && value.version !== 1) throw new RangeError('Unsupported nemesis deployment version');
  if (value && value.reservation && typeof value.reservation.requestId === 'string') {
    out.reservation = { requestId: value.reservation.requestId.slice(0, 120),
      ids: [...new Set((Array.isArray(value.reservation.ids) ? value.reservation.ids : [])
        .filter((id) => keyForId(id)))].slice(0, LIMITS.maxCrew) };
  }
  out.retirement = (Array.isArray(value && value.retirement) ? value.retirement : [])
    .filter((row) => row && keyForId(row.id) && typeof row.requestId === 'string')
    .slice(0, LIMITS.maxCrew).map((row) => ({ id: row.id, requestId: row.requestId.slice(0, 120) }));
  return out;
}

export function buildNemesisSpawnSpecs(request, state, makeSpawnSpec) {
  if (typeof makeSpawnSpec !== 'function') throw new TypeError('makeEnemySpawnSpec dependency required');
  const plan = normalizePlan(request.plan);
  if (!plan) throw new TypeError('A validated nemesis plan is required');
  const player = state.entities.get(state.playerId);
  if (!alive(player) || !player.pos) throw new Error('No living player anchor');
  const primary = NEMESIS_KITS[plan.primary];
  const angle = finite(player.rot) + plan.side * Math.PI * 0.6;
  const center = { x: player.pos.x + Math.cos(angle) * 1150, z: player.pos.z + Math.sin(angle) * 1150 };
  const specs = [];
  for (let slot = 0; slot <= plan.escortCount; slot++) {
    const escortKit = slot === 2 && plan.secondary ? NEMESIS_KITS[plan.secondary] : primary;
    const kit = slot === 0 ? primary : escortKit;
    const archetype = slot === 0 ? kit.bossArchetype : kit.escortArchetype;
    const pos = slot === 0 ? center : {
      x: center.x - Math.sin(angle) * (slot === 1 ? 1 : -1) * 170,
      z: center.z + Math.cos(angle) * (slot === 1 ? 1 : -1) * 170,
    };
    const spec = makeSpawnSpec(archetype, Math.max(3, plan.level - (slot ? 1 : 0)), pos, {
      factionId: RIVAL.factionId, startedTick: state.tick,
    });
    if (!spec || !spec.data) throw new Error(`Spawn builder did not produce a ship for ${archetype}`);
    spec.data.ai = spec.data.ai || {};
    const ai = spec.data.ai;
    Object.assign(ai, {
      squadId: request.requestId, doctrine: 'balanced', formation: primary.formation,
      combatDoctrineId: slot === 0 ? primary.doctrineId : ai.combatDoctrineId,
      factionPresenceDoctrine: null, forcePlayerTarget: true, hostileTeams: [0], passive: false,
      roe: 'weapons_free', forceFlee: false, encounterKind: 'nemesis',
      spawnContext: 'nemesis', encounterRole: slot ? 'escort' : 'boss',
      activity: { kind: 'attack_run', targetId: state.playerId, reason: 'nemesis_encounter',
        startedTick: state.tick, preferredRange: primary.range },
    });
    if (slot === 0) {
      ai.name = RIVAL.name; spec.data.name = RIVAL.shipName;
      spec.data.aceId = RIVAL.id; spec.data.encounterBoss = true;
    }
    // The selected catalogue hull supplies real guns, armor and specialist verbs. Never append
    // a weapon to an already-full fit or multiply max hull behind the player's back.
    spec.data.nemesis = { aceId: RIVAL.id, encounterId: request.requestId,
      role: slot ? 'escort' : 'boss', slot, kitId: kit.id, egressHeading: angle,
      tell: kit.tell, opening: kit.opening };
    specs.push(spec);
  }
  return specs;
}

export function createNemesisEncounterHost({ makeSpawnSpec, approveEncounter = null } = {}) {
  return {
    name: 'nemesisEncounter',
    init(ctx) {
      this.destroy(); this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.nemesisDeployment = normalize(this.state.nemesisDeployment);
      this._queued = null; this._offs = [];
      const on = (name, fn) => this._offs.push(this.bus.on(name, fn));
      on('nemesis:encounterRequested', (p) => { this._queued = clone(p); });
      on('nemesis:requestCancelled', (p) => { if (this._queued && this._queued.requestId === p.requestId) this._queued = null; });
      on('nemesis:encounterEnded', (p) => this._end(p));
      on('entity:destroyed', (p) => this._releaseId(p && p.id));
      on('save:loaded', () => { this._queued = null; this._reconcile(); });
      // New Game clears the deployment ledger with the arc (integration notes §4); see the
      // matching game:newGame subscription note in systems/nemesis.js init.
      on('game:newGame', () => this.newGame());
    },
    destroy() {
      if (Object.hasOwn(this, '_offs')) for (const off of this._offs || []) if (typeof off === 'function') off();
      this._offs = []; this._queued = null;
    },
    newGame() { this.state.nemesisDeployment = fresh(); this._queued = null; },
    serialize() { return clone(this.state.nemesisDeployment); },
    deserialize(value) { this.state.nemesisDeployment = normalize(value); this._queued = null; },
    update(dt, state) {
      this.state = state;
      if (state.mode !== 'flight' || !(dt > 0)) return;
      this._retire(); // Bounded lifecycle work at a system boundary, never inside combat iteration.
      if (this._queued) { const request = this._queued; this._queued = null; this._deploy(request); }
      if (finite(state.simTime) < state.nemesisDeployment.nextCheckAt) return;
      state.nemesisDeployment.nextCheckAt = finite(state.simTime) + LIMITS.checkS;
      const a = state.nemesis && state.nemesis.active;
      if (!a || a.retreatAt == null || finite(state.simTime) - a.retreatAt < 6) return;
      const boss = state.entities.get(a.bossId), player = state.entities.get(state.playerId);
      if (!alive(boss) || !alive(player) || !boss.pos || !player.pos) return;
      if (Math.hypot(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z) >= 1800) {
        this.bus.emit('nemesis:escaped', { encounterId: a.id, bossId: a.bossId });
      }
    },
    _reject(request, reason) {
      this.bus.emit('nemesis:encounterRejected', { requestId: request.requestId, reason });
    },
    _deploy(request) {
      const state = this.state, pending = state.nemesis && state.nemesis.pending;
      if (!pending || pending.id !== request.requestId || !pending.dispatched || state.nemesis.active) return;
      // Treat the bus payload as a request token, not as authority to change a locked fit.
      request = { requestId: pending.id, sectorId: pending.sectorId, plan: clone(pending.plan), aceId: RIVAL.id };
      if (state.mode !== 'flight' || request.sectorId !== sector(state)) { this._reject(request, 'sector or mode changed'); return; }
      const player = state.entities.get(state.playerId);
      if (!alive(player) || finite(player.hull) / Math.max(1, finite(player.hullMax, player.hull)) < 0.45) {
        this._reject(request, 'player recovery window'); return;
      }
      const approve = approveEncounter || this.helpers.canStartNemesisEncounter;
      // Pacing is a real host decision. Missing integration does not silently become permission.
      if (typeof approve !== 'function') { this._reject(request, 'missing pacing approval'); return; }
      let approved;
      try { approved = approve(clone(request), state); }
      catch (_) { this._reject(request, 'pacing approval failed'); return; }
      if (approved !== true) { this._reject(request, 'pacing refused'); return; }
      const budget = this.helpers.spawnBudget;
      if (!budget || typeof budget.request !== 'function' || typeof budget.release !== 'function'
          || typeof budget.releaseSome !== 'function' || typeof this.helpers.spawnEntity !== 'function'
          || typeof this.helpers.removeEntity !== 'function') {
        this._reject(request, 'missing spawn/lifecycle/budget owner'); return;
      }
      if (state.nemesisDeployment.reservation) { this._reject(request, 'previous crew has not retired'); return; }
      let specs;
      try { specs = buildNemesisSpawnSpecs(request, state, makeSpawnSpec); }
      catch (_) { this._reject(request, 'spawn-spec construction failed'); return; }
      // Check physical placement through core's collision query. This is once per deployment.
      if (typeof this.helpers.queryRadius === 'function') {
        for (const spec of specs) {
          // Core's query filters by center distance, not obstacle surface. Query a broad local
          // region, then include obstacle radii. Exceptional >2km world bodies need the host's
          // approval policy to reject the deployment region as documented in integration notes.
          const nearby = this.helpers.queryRadius(spec.pos, 2000, []);
          if (nearby.some((obstacle) => !obstacle.pos || Math.hypot(
            obstacle.pos.x - spec.pos.x, obstacle.pos.z - spec.pos.z)
            < Math.max(90, finite(spec.radius) + finite(obstacle.radius) + 40))) {
            this._reject(request, 'spawn location obstructed'); return;
          }
        }
      } else { this._reject(request, 'missing safe-placement query'); return; }
      let grant;
      try { grant = budget.request(specs.length, request.requestId); }
      catch (_) { this._reject(request, 'budget request failed'); return; }
      // No partial encounter that turns the boss's counter-kit into an empty promise.
      if (!Number.isFinite(grant) || grant < specs.length) {
        budget.release(request.requestId); this._reject(request, 'insufficient complete-wing budget'); return;
      }
      if (grant > specs.length) budget.releaseSome(request.requestId, grant - specs.length);
      const ids = [];
      state.nemesisDeployment.reservation = { requestId: request.requestId, ids };
      try {
        for (const spec of specs) {
          const ship = this.helpers.spawnEntity(spec);
          if (ship && keyForId(ship.id) != null) ids.push(ship.id);
          if (!alive(ship) || keyForId(ship.id) == null) throw new Error('spawn failed');
        }
      } catch (_) {
        // Allocation and already-created hulls are unwound without kill/reward receipts.
        for (const id of ids) this.helpers.removeEntity(id);
        budget.release(request.requestId); state.nemesisDeployment.reservation = null;
        this._reject(request, 'partial spawn rolled back'); return;
      }
      this.bus.emit('nemesis:encounterStarted', { requestId: request.requestId, bossId: ids[0], crewIds: ids.slice(1) });
      // A listener may reject an obsolete acknowledgement after spawn; never orphan its crew.
      if (!state.nemesis.active || state.nemesis.active.id !== request.requestId) {
        this._end({ encounterId: request.requestId, bossId: ids[0], crewIds: ids, outcome: 'interrupted' });
      }
    },
    _end(p) {
      const deployment = this.state.nemesisDeployment, reservation = deployment.reservation;
      if (!p || !reservation || reservation.requestId !== p.encounterId) return;
      // The boss rides reservation slot zero by construction (see _deploy); the ended
      // event does not always repeat it, so fall back to the slot rather than undefined.
      const bossId = p.bossId != null ? p.bossId : reservation.ids[0];
      const flown = p.outcome === 'rival_escaped';
      // Combat owns a destroyed captain until rewards/death processing has completed.
      deployment.retirement = reservation.ids.filter((id) =>
        !(id === bossId && ['destroyed', 'lost'].includes(p.outcome))
        // An earned escape leaves a live hull behind. The rival opened 1800 WU of real
        // distance to confirm the escape; sector cleanup must not despawn the flight it
        // just verified. Bookkeeping is released below without removing the hull.
        && !(flown && id === bossId))
        .map((id) => ({ id, requestId: p.encounterId }));
      if (flown) this._releaseId(bossId);
    },
    _retire() {
      const d = this.state.nemesisDeployment;
      if (typeof this.helpers.removeEntity !== 'function') return;
      const rows = d.retirement.splice(0, LIMITS.maxCrew);
      for (const row of rows) {
        const ship = this.state.entities.get(row.id);
        if (ship && ship.data && ship.data.nemesis && ship.data.nemesis.encounterId === row.requestId) {
          this.helpers.removeEntity(row.id);
        }
        this._releaseId(row.id);
      }
    },
    _releaseId(id) {
      const d = this.state.nemesisDeployment, r = d && d.reservation;
      if (!r || !r.ids.includes(id)) return;
      r.ids = r.ids.filter((value) => value !== id);
      const budget = this.helpers.spawnBudget;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(r.requestId, 1);
      if (!r.ids.length) {
        if (budget && typeof budget.release === 'function') budget.release(r.requestId);
        d.reservation = null;
      }
    },
    _reconcile() {
      const d = this.state.nemesisDeployment, r = d.reservation;
      if (!r) return;
      for (const id of r.ids.slice()) {
        const ship = this.state.entities.get(id);
        if (!ship || !ship.data || !ship.data.nemesis || ship.data.nemesis.encounterId !== r.requestId) this._releaseId(id);
      }
      const a = this.state.nemesis && this.state.nemesis.active;
      if (d.reservation && (!a || a.id !== d.reservation.requestId)) {
        this._end({ encounterId: d.reservation.requestId, crewIds: d.reservation.ids, outcome: 'interrupted' });
      }
    },
  };
}
