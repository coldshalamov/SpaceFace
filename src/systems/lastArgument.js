import { LAST_ARGUMENT as C, freshLastArgumentState, normalizeLastArgumentState,
  lastArgumentEligibility, lastArgumentHash, commitLastArgumentArrival, settleLastArgument } from '../data/lastArgument.js';
import { LAST_ARGUMENT_CAPABILITY_TO_REQUIREMENT } from '../data/lastArgumentCombat.js';
import { isLastArgument } from '../data/lastArgumentBody.js';
import { observeCapitalBody, capitalBossInRange } from './capitalBossEncounters.js';
import { authorizeAIEngagement } from '../ai/engagementAuthority.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';

const hosts = new WeakMap();
const seedOf = s => s.meta?.seed ?? 1;
const entitiesOf = s => s.entityList || [...s.entities.values()];
const alive = e => e && e.alive !== false && e.hull > 0;
export const isLastArgumentFight = record => record?.encounterId === C.scoreId;

/** Read-only observation: cover and escalation permission are checked at the firing tick. */
export function observeLastArgument(record, state, helpers) {
  const source = state.entities.get(record.bossId), target = state.entities.get(state.playerId);
  const view = source && helpers.getCombatCapabilities?.(source.id);
  const boss = observeCapitalBody(source, view, source?.prevPos);
  if (boss) {
    for (const [capability, requirement] of Object.entries(LAST_ARGUMENT_CAPABILITY_TO_REQUIREMENT))
      if (view?.capabilities?.[capability] === false) boss.disabled.push(`subsystem_${requirement}`);
  }
  const player = observeCapitalBody(target, null, target?.prevPos);
  const own = state.capitalBossEncounters?.lastArgument, a = own?.active;
  const notDocked = !state.ui?.docked && state.ui?.dockedStationId == null;
  const active = !!(!hosts.get(state)?.restoring && a && a.key === record.fightId && a.sectorId === state.world?.currentSectorId
    && state.mode === 'flight' && notDocked && !(state.run?.kind === 'survival' && state.run.phase !== 'inactive')
    && alive(source) && alive(target) && state.simTime < a.deadlineAt && capitalBossInRange(record, boss, player));
  const targets = [];
  if (active) {
    // No blind scripted damage through a station/rock, no neutral-traffic collateral shortcut.
    // Include player wingmen only when the shared hostility owner authorizes the attack.
    for (const e of entitiesOf(state)) {
      if (!alive(e) || (e.id !== state.playerId && e.data?.isWingman !== true)) continue;
      if (Math.hypot(e.pos.x-source.pos.x,e.pos.z-source.pos.z) > C.suspendRadius) continue;
      if (!witnessLineOfSight(state, source, e.pos, [e.id])) continue;
      if (!authorizeAIEngagement({ state, self: source, target: e,
        objectiveReason: 'combat_doctrine:capital_broadside:commit' }).ok) continue;
      targets.push(observeCapitalBody(e, null, e.prevPos));
    }
  }
  return { boss, target: player, active, targets };
}

/** Bounded candidate search. Never erase terrain or move another body to admit a capital. */
export function chooseLastArgumentPlacement(state, ordinal = 0) {
  const player = state.entities.get(state.playerId);
  if (!player?.pos) return null;
  const phase = (lastArgumentHash(seedOf(state), ordinal, 'bearing') / 4294967296) * Math.PI * 2;
  for (let i=0; i<16; i++) {
    const angle = phase + i*Math.PI/8;
    const p = { x: player.pos.x + Math.cos(angle)*C.placementRadius,
      z: player.pos.z + Math.sin(angle)*C.placementRadius };
    let safe = true;
    for (const e of entitiesOf(state)) {
      if (e.alive === false || !e.pos || e.id === player.id || !['ship','station','planet','gate','asteroid','wreck'].includes(e.type)) continue;
      const protectedPlace = ['station','planet','gate'].includes(e.type);
      const clearance = C.radius + Math.max(0, e.radius || 0) + (protectedPlace ? C.stationClearance : C.bodyClearance);
      if (Math.hypot(p.x-e.pos.x,p.z-e.pos.z) < clearance) { safe = false; break; }
    }
    if (safe) return p;
  }
  return null;
}

/** Decorates the same production singleton/factory used by browser AND Node simulation. */
export function withLastArgument(system) {
  let ctx = null, retryAt = 0, restoring = false, bound = null, directorLive = null, pending = null;
  const subscriptions = [];
  const root = () => ctx.state.capitalBossEncounters;
  // Do not alter early-game saves/hashes merely by enabling this late, rare feature.
  const own = () => root().lastArgument || (pending ||= freshLastArgumentState(seedOf(ctx.state)));
  const find = () => {
    const a = own().active; if (!a) return null;
    if (bound && ctx.state.entities.get(bound.entity.id) === bound.entity
        && bound.entity.occupantGeneration === bound.life && bound.entity.data?.lastArgumentKey === a.key) return bound.entity;
    let found = null;
    for (const e of entitiesOf(ctx.state)) if (isLastArgument(e) && e.data.lastArgumentKey === a.key) {
      if (found) return null; // A duplicated identity is not permission to bind a different body.
      found = e;
    }
    if (found) bound = { entity: found, life: found.occupantGeneration };
    return found;
  };
  const eligibility = () => {
    const s = ctx.state;
    if (own().active) return 'already-active';
    if (!Number.isFinite(s.simTime) || s.simTime < own().nextAt) return 'cooldown';
    return lastArgumentEligibility(own(), { now: s.simTime, alive: alive(s.entities.get(s.playerId)),
      flight: s.mode === 'flight', docked: !!s.ui?.docked || s.ui?.dockedStationId != null,
      survival: s.run?.kind === 'survival' && s.run.phase !== 'inactive', sectorId: s.world?.currentSectorId,
      otherCapital: Object.values(root().fights || {}).some(r => !r.terminal && !isLastArgumentFight(r)) });
  };
  const finish = (outcome, d = directorLive?.d, live = directorLive?.live) => {
    const a = own().active; if (!a) return;
    const e = find(), killed = a.killed === true, key = a.key;
    // Settle before emitting a resolution; director callbacks are synchronous and may reenter.
    settleLastArgument(own(), key, outcome);
    // The actor is explicitly pinned while this encounter is alive. This owner may retire it;
    // generic director cleanup correctly refuses to delete foreign/persistent actors.
    if (!killed && e && ctx.state.entities.get(e.id) === e) ctx.helpers.removeEntity(e.id);
    system.detach(key);
    bound = null; directorLive = null;
    if (d && live) d.resolve(live, killed ? 'cleared' : 'escaped', { speak: false });
  };
  const host = {
    eligibility, find, get restoring() { return restoring; },
    bind(e, d, live) {
      if (!isLastArgument(e) || !alive(e) || eligibility()) return false;
      const s = ctx.state, a = commitLastArgumentArrival(own(), seedOf(s), s.simTime, s.world.currentSectorId, e.id);
      if (!a) return false;
      root().lastArgument = own(); pending = null;
      e.data.lastArgumentKey = a.key; e.data.homeSectorId = a.sectorId;
      e.data.persistenceOwner = 'capitalBossEncounters';
      e.data.identityKey = a.key;
      // It stays an encounter-local actor, not a duplicate entry in the distant world ledger.
      e.flags = { ...e.flags, persistent: true };
      e.data.ai.spawnContext = 'encounter';
      e.data.ai.motive = 'siege_interdiction'; e.data.ai.engagementTrigger = 'authorized_hostile_spawn';
      // Losing ordinary morale must not bypass the authored warning with a second behavior.
      e.data.ai.moraleImmune = true;
      bound = { entity: e, life: e.occupantGeneration }; directorLive = { d, live };
      live.lastArgumentKey = a.key; live.deadlineAt = a.deadlineAt;
      system.start({ encounterId: C.scoreId, fightId: a.key, bossId: e.id, targetId: s.playerId, mirror: 1 });
      return true;
    },
    tickEncounter(d, live) {
      const a = own().active;
      if (!a || a.key !== live.lastArgumentKey) return d.resolve(live, 'escaped', { speak: false });
      directorLive = { d, live };
      if (a.killed) return; // Let the capital owner emit its real victory first.
      if (!a.warningSent && ctx.state.simTime >= a.deadlineAt-C.retreatWarningSeconds) {
        a.warningSent = true;
        d.say(live, 'alert', 'THE LAST ARGUMENT: Jump capacitors charged. This lane is no longer worth the ammunition.', null,
          { literal: true, primary: true });
      }
      if (ctx.state.simTime >= a.deadlineAt) finish('departed', d, live);
    },
  };
  const original = { init: system.init, update: system.update, restore: system.restore,
    serialize: system.serialize, destroy: system.destroy };
  system.init = function(context) {
    original.init.call(system, context); ctx = context; own(); hosts.set(ctx.state, host);
    const on = (event, fn) => {
      const off = ctx.bus.on(event, fn);
      subscriptions.push(typeof off === 'function' ? off : () => ctx.bus.off?.(event,fn));
    };
    on('entity:killed', p => {
      const a = own().active, e = find(), id = p?.id ?? p?.targetId ?? p?.entityId;
      if (a && e && id === e.id && e.data.lastArgumentKey === a.key) {
        a.killed = true;
        const fight = root().fights?.[a.key]; if (fight) fight.bossKilled = true;
      }
    });
    on('encounter:resolved', p => {
      if (own().active && p?.shape === C.encounterId && directorLive?.live?.id === p.encounterId)
        finish('escaped', null, null);
    });
    on('save:restoring', () => { restoring = true; bound = null; directorLive = null; });
    on('save:loaded', () => { restoring = false; bound = null; retryAt = 0; });
    on('game:new', () => {
      if (own().active) system.detach(own().active.key);
      delete root().lastArgument; pending = null; bound = null; directorLive = null; retryAt = 0;
    });
  };
  system.update = function(dt, state = ctx?.state) {
    if (!restoring && ctx) {
      const a = own().active;
      if (a) {
        const e = find(), r = root().fights?.[a.key];
        // A restored director has no transient live record. Keep the departure notice causal.
        if (!directorLive && !a.warningSent && state.simTime >= a.deadlineAt-C.retreatWarningSeconds) {
          a.warningSent = true;
          ctx.bus.emit('toast', { text: 'THE LAST ARGUMENT — jump capacitors charged. Departure in fifteen seconds.', kind: 'info', ttl: 5 });
        }
        // Save restoration may allocate different live IDs; identity, not the old integer, binds.
        if (e && r && (r.bossId !== e.id || r.targetId !== state.playerId)) {
          system.rebind(a.key, { bossId: e.id, targetId: state.playerId });
          a.bossId = e.id;
        }
        if (!a.killed && a.sectorId !== state.world?.currentSectorId) finish('escaped');
        else if (!a.killed && state.simTime >= a.deadlineAt) finish('departed');
      } else if (state.simTime >= retryAt && !eligibility()) {
        retryAt = state.simTime + C.retrySeconds;
        const anchor = chooseLastArgumentPlacement(state, own().ordinal + 1);
        if (anchor) ctx.registry?.get('encounterDirector')?.requestAuthoredEncounter({
          shapeId: C.encounterId, encounterId: `last-argument-request:${Number(seedOf(state))>>>0}:${own().ordinal+1}`,
          sectorId: state.world.currentSectorId, anchor, respectPacing: true,
        });
      }
    }
    const result = original.update.call(system, dt, state);
    if (!restoring && own().active) {
      const a = own().active, r = root().fights?.[a.key];
      if (r?.terminal === 'victory' || r?.terminal === 'mutual') { a.killed = true; finish('destroyed'); }
      else if (r?.terminal === 'defeat') finish('escaped');
    }
    return result;
  };
  system.restore = function(data) {
    original.restore.call(system, data);
    if (data?.lastArgument) root().lastArgument = normalizeLastArgumentState(data.lastArgument, seedOf(ctx.state));
    else delete root().lastArgument;
    pending = null;
    bound = null; directorLive = null; retryAt = 0;
  };
  system.serialize = function() { return original.serialize.call(system); };
  system.destroy = function() {
    for (const off of subscriptions.splice(0)) off();
    if (ctx) hosts.delete(ctx.state);
    bound = null; directorLive = null; ctx = null;
    return original.destroy.call(system);
  };
  return system;
}

export const lastArgumentEncounter = Object.freeze({
  fire(d, live, state) {
    const host = hosts.get(state);
    if (!host || host.eligibility()) return d.abort(live, 'last_argument_not_eligible');
    // d owns the real spawn budget and collision-safe placement; this is not an off-ledger spawn.
    const ids = d.spawnShips(live, live.plan.ships);
    const body = ids.map(id => state.entities.get(id)).find(isLastArgument);
    if (!body || !host.bind(body,d,live)) {
      d.despawnAll(live,0.01); return d.abort(live, 'last_argument_admission_failed');
    }
    live.phase = 'conflict';
    d.say(live, 'alert', 'THE LAST ARGUMENT — siege ark. Heavy mass signature. Its guns need a bearing; you do not need to stay.', null,
      { literal: true, primary: true });
  },
  tick(d, live, state) {
    const host = hosts.get(d.state) || (state && typeof state === 'object' ? hosts.get(state) : null);
    if (host) host.tickEncounter(d,live);
    else d.abort(live,'last_argument_owner_absent');
  },
});
