// salvageActions.js - BP-01.1 SALVAGE_DISTINCT_FROM_MINING system.
//
// Annotates existing wreck entities with a distinct salvage verb from the pure catalog. The mining
// beam still drains wreck pools, but the pool/readout/consequence now depends on what kind of wreck
// the player is working on. This system does not edit salvage.js, mining.js, or combat.js.

import { actionForWreck, actionReadoutForWreck, poolForAction } from '../data/salvageActions.js';
import { salvagePoolForWreck } from '../data/salvageLegality.js';
import { entityIndexVersion, entityIndexLaneVersion, indexedTypeScan } from '../world/livingWorldViews.js';
import { hash32 } from '../core/rng.js';

const TETHER_AWAY_DISTANCE = 260;
// INF-U7: the unstable reactor is ordnance, not a cutscene. Damage cooks the fuse
// (seconds per applied point), a cracked containment pops at once, and the burst is
// radial with linear falloff — pirates parked next to it burn with you. Attribution
// follows the last damager so the law reads a deliberate cook-off honestly.
const REACTOR_BURST_RADIUS = 150;
const REACTOR_COOK_S_PER_DMG = 0.15;
const REACTOR_CRACK_DMG = 40;
const REACTOR_CHAIN_DELAY_S = 0.5;
const REACTOR_COOK_TOAST_COOLDOWN_S = 10;
// INF-U13: venting pays a hot core. The careful approach used to end in silence while
// tow-away got the bomb — now the vented core ejects as a scoopable pickup. It stays
// volatile while hot (shooting it pops a small thermal burst that can chain siblings),
// then cools into an ordinary valuable pod. Cooling is timestamp-gated at damage time
// so no per-tick pickup sweep is needed.
const REACTOR_CORE_TTL_S = 60;
const REACTOR_CORE_HOT_S = 25;
const REACTOR_CORE_BURST_RADIUS = 60;
const REACTOR_CORE_BURST_DMG = 8;
const REACTOR_CORE_EJECT_SPEED = 30;
const REACTOR_CORE_WARN_S = 8;
// INF-U19: crews clear a cooking reactor. A live bomb that gunfire has cooked —
// or that is seconds from popping on its own timer — sends nearby working
// ships running. Hostiles hold their attack runs and burn with the wreck,
// which is still the U7 payoff; the player's own wing holds formation.
const COOKER_WARN_S = 8;
const COOKER_FLEE_R = 420;
const COOKER_BOOST_R = 200;
const COOKER_CORE_WARN_S = 6;
const COOKER_CORE_FLEE_R = 220;

/** Bench A/B: production default ON. Quiet latch skips salvage unstable-reactor
 * entities.values() census when no live unstable reactors remain. Soft-GPU fps not
 * claimed. Fresh salvage residual after #146 catch-nets / #147 sanctuary. */
let SALVAGE_UNSTABLE_QUIET_LATCH = true;
export function setSalvageUnstableQuietLatchForBench(enabled) {
  SALVAGE_UNSTABLE_QUIET_LATCH = enabled !== false;
}
export function getSalvageUnstableQuietLatchForBench() {
  return SALVAGE_UNSTABLE_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const SALVAGE_UNSTABLE_QUIET_RESCAN_TICKS = 30;

/** Membership lanes for the quiet latch — the census discovers wrecks (unstable reactors)
 * and pickups (hot cores); ship/asteroid/projectile churn can't change the result. */
const SALVAGE_UNSTABLE_QUIET_LANES = ['wrecks', 'pickups'];

function publishSalvageUnstableQuiet(state, latched) {
  if (!state) return;
  const rt = state.salvageActionsRuntime || (state.salvageActionsRuntime = {});
  rt.unstableQuietLatched = !!latched;
}

function ensureUi(state) {
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  return state.ui;
}

function isWreck(entity) {
  return !!(entity && entity.type === 'wreck');
}

function playerEntity(state) {
  return state && state.entities && state.entities.get && state.entities.get(state.playerId);
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

function applyAuthoredWreckConfiguration(entity, options, simTime) {
  if (!isWreck(entity)) return null;
  const data = entity.data || (entity.data = {});
  const salvagePool = options && options.salvagePool;
  const scanLabel = options && options.scanLabel;
  const reactorTimerS = options && options.reactorTimerS;

  if (salvagePool && typeof salvagePool === 'object') {
    data.authoredSalvagePool = { ...salvagePool };
    data.salvagePool = salvagePoolForWreck(entity, data.authoredSalvagePool);
  }
  if (typeof scanLabel === 'string' && scanLabel.trim()) {
    data.authoredScanLabel = scanLabel;
    data.scanLabel = scanLabel;
  }
  if (Number.isFinite(reactorTimerS) && reactorTimerS > 0) {
    data.authoredReactorTimerS = reactorTimerS;
    const existing = data.unstableReactor && typeof data.unstableReactor === 'object'
      ? data.unstableReactor
      : {};
    data.unstableReactor = {
      ...existing,
      dueAt: simTime + reactorTimerS,
    };
  }
  return data;
}

export const salvageActions = {
  name: 'salvageActions',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._registry = ctx && ctx.registry;
    this._helpers = (ctx && ctx.helpers) || {};
    this._unstableQuiet = null;
    this._unstableWakeSeq = 0;
    this._onEntitySpawned = (p) => this._annotate(p && p.entity);
    this._onScan = (p) => this._onScanCompleted(p);
    this._onVent = (p) => this._vent(p && (p.wreckId != null ? p.wreckId : p.targetId));
    this._onDamage = (p) => this._onReactorDamaged(p || {});
    this._onBoundaryWake = () => this.noteUnstableWake();
    if (this._bus && this._bus.on) {
      this._bus.on('entity:spawned', this._onEntitySpawned);
      this._bus.on('scan:completed', this._onScan);
      this._bus.on('salvage:ventReactor', this._onVent);
      this._bus.on('combat:damage', this._onDamage);
      // Boundary wakes: this system is not in FRESH_RUN_SYSTEMS — save/run/sector
      // transitions reach it only through the bus.
      this._bus.on('save:loaded', this._onBoundaryWake);
      this._bus.on('game:new', this._onBoundaryWake);
      this._bus.on('game:newGame', this._onBoundaryWake);
      this._bus.on('sector:enter', this._onBoundaryWake);
    }
  },

  /** External wake when a reactor could appear without a spawn/annotate call. */
  noteUnstableWake() {
    this._unstableWakeSeq = (this._unstableWakeSeq | 0) + 1;
    this._unstableQuiet = null;
  },

  configureAuthoredWreck(entity, options = {}) {
    const now = (this._state && this._state.simTime) || 0;
    const data = applyAuthoredWreckConfiguration(entity, options, now);
    if (!data) return null;
    if (data.unstableReactor
      && !data.unstableReactor.vented
      && !data.unstableReactor.burst
      && !data.unstableReactor.towedClear) {
      this.noteUnstableWake();
    }
    this._annotate(entity);
    return data;
  },

  _annotate(entity) {
    if (!isWreck(entity)) return null;
    const data = entity.data || (entity.data = {});
    const action = actionForWreck(entity);
    data.salvageAction = actionReadoutForWreck(entity);
    if (data.authoredSalvagePool) {
      if (!data.salvagePool || typeof data.salvagePool !== 'object') {
        data.salvagePool = salvagePoolForWreck(entity, data.authoredSalvagePool);
      }
    } else if (data.markerId && data.salvagePool && typeof data.salvagePool === 'object'
        && Object.keys(data.salvagePool).length > 0) {
      // The durable aftermath marker owns this pool by reference — overwriting the field would
      // detach live salvage from the persistent record and lose the victim's manifest residue.
      // The only adjustment allowed is the legality remap, and it must land in place.
      const remapped = salvagePoolForWreck(entity, data.salvagePool);
      for (const key of Object.keys(data.salvagePool)) delete data.salvagePool[key];
      Object.assign(data.salvagePool, remapped);
    } else {
      data.salvagePool = salvagePoolForWreck(entity, poolForAction(action));
    }
    data.scanGlyph = action.glyph;
    data.scanLabel = data.authoredScanLabel || action.label;
    if (action.unstable) this._armReactor(entity, action);
    return data.salvageAction;
  },

  _armReactor(entity, action) {
    const data = entity.data || (entity.data = {});
    const now = (this._state && this._state.simTime) || 0;
    const existing = data.unstableReactor && typeof data.unstableReactor === 'object'
      ? data.unstableReactor
      : {};
    const timerS = Number.isFinite(data.authoredReactorTimerS) && data.authoredReactorTimerS > 0
      ? data.authoredReactorTimerS
      : (action.timerS || 8);
    data.unstableReactor = {
      dueAt: existing.dueAt != null ? existing.dueAt : now + timerS,
      damage: action.burstDamage || 18,
      vented: !!existing.vented,
      burst: !!existing.burst,
      towedClear: !!existing.towedClear,
      triggeredBy: existing.triggeredBy != null ? existing.triggeredBy : null,
    };
    // Live unstable reactor: wake quiet latch so the dueAt / tow census resumes.
    this.noteUnstableWake();
  },

  _onScanCompleted(p) {
    const state = this._state;
    if (!state || !p || p.targetId == null || !state.entities || !state.entities.get) return;
    const entity = state.entities.get(p.targetId);
    const readout = this._annotate(entity);
    if (!readout) return;
    ensureUi(state).salvageActionRead = { ...readout, t: state.simTime || 0 };
    if (this._bus && this._bus.emit) this._bus.emit('salvage:actionRead', { ...readout });
  },

  _vent(wreckId) {
    const state = this._state;
    if (wreckId == null || !state || !state.entities || !state.entities.get) return null;
    const wreck = state.entities.get(wreckId);
    if (!isWreck(wreck)) return null;
    const readout = this._annotate(wreck);
    if (!readout || readout.actionId !== 'vent_reactor') return null;
    const unstable = wreck.data && wreck.data.unstableReactor;
    if (!unstable || unstable.burst || unstable.towedClear || unstable.vented) return null;
    unstable.vented = true;
    const now = state.simTime || 0;
    if (this._bus && this._bus.emit) {
      this._bus.emit('salvage:reactorVented', { wreckId, targetId: wreckId, t: now });
      this._ejectCore(wreck, unstable, state, now);
    }
    return unstable;
  },

  // INF-U13 v1: the vented core becomes physical — one scoopable pod kicked clear of
  // the wreck with the wreck's own drift. Eject angle is hashed off the wreck id so
  // the same wreck vents the same way every visit. No second extractor or cargo
  // write: the magnet + cargo owners do the rest.
  _ejectCore(wreck, unstable, state, now) {
    const wpos = wreck.pos || { x: 0, z: 0 };
    const wvel = wreck.vel || { x: 0, z: 0 };
    const ang = ((hash32(wreck.id, 'vent-core') >>> 0) % 360) * Math.PI / 180;
    const edge = (wreck.radius || 10) + 6;
    const spec = {
      type: 'pickup',
      pos: { x: (wpos.x || 0) + Math.cos(ang) * edge, z: (wpos.z || 0) + Math.sin(ang) * edge },
      vel: {
        x: (wvel.x || 0) + Math.cos(ang) * REACTOR_CORE_EJECT_SPEED,
        z: (wvel.z || 0) + Math.sin(ang) * REACTOR_CORE_EJECT_SPEED,
      },
      radius: 3, mass: 0.5, collides: true,
      data: {
        kind: 'cargo',
        commodityId: 'cmdty_salvage_electronics',
        amount: (unstable.damage || 0) >= 22 ? 3 : 2,
        despawnAt: now + REACTOR_CORE_TTL_S,
        ventedCore: true,
        cooledAt: now + REACTOR_CORE_HOT_S,
        scanLabel: 'Reactor core',
      },
    };
    this._bus.emit('entity:spawnRequest', { spec });
    this._bus.emit('salvage:coreEjected', {
      wreckId: wreck.id, targetId: wreck.id, cooledAt: now + REACTOR_CORE_HOT_S, t: now,
    });
    this._bus.emit('toast', {
      text: `Core ejected — critical in ${REACTOR_CORE_HOT_S}s. Scoop it or clear the blast.`,
      kind: 'good', ttl: 5,
    });
    this._hotCoresLive = true;
    this.noteUnstableWake();
  },

  update(_dt, state) {
    if (!state) return;
    // Quiet open flight: no live unstable reactors still paid a full entities.values()
    // walk (isWreck / unstableReactor bag) every tick. Latch when the census stays
    // empty; wake on membership, reactor arm/annotate, or 0.5 s rescan. Soft-GPU fps
    // not claimed. Fresh salvage residual after #146 catch-nets / #147 sanctuary.
    if (SALVAGE_UNSTABLE_QUIET_LATCH !== false) {
      const laneVersion = entityIndexLaneVersion(state, SALVAGE_UNSTABLE_QUIET_LANES);
      const membership = laneVersion === -1 ? entityIndexVersion(state) : laneVersion;
      const tick = state.tick | 0;
      const wakeSeq = this._unstableWakeSeq | 0;
      const quiet = this._unstableQuiet;
      if (quiet
        && membership != null
        && quiet.membership === membership
        && quiet.wakeSeq === wakeSeq
        && ((tick - (quiet.armedTick | 0)) < SALVAGE_UNSTABLE_QUIET_RESCAN_TICKS)) {
        publishSalvageUnstableQuiet(state, true);
        return;
      }
    } else if (this._unstableQuiet) {
      this._unstableQuiet = null;
      publishSalvageUnstableQuiet(state, false);
    }

    const index = state.entityIndex;
    const useWrecks = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
      && Array.isArray(index.wrecks));
    const list = useWrecks
      ? indexedTypeScan(state, 'wrecks')
      : (state.entities && typeof state.entities.values === 'function'
        ? state.entities.values()
        : null);
    if (!list) return;

    let liveUnstable = 0;
    const cookers = [];
    const now = state.simTime || 0;
    for (const entity of list) {
      if (!isWreck(entity) || entity.alive === false) continue;
      const unstable = entity.data && entity.data.unstableReactor;
      if (!unstable || unstable.vented || unstable.burst || unstable.towedClear) continue;
      liveUnstable++;
      if (this._isTowedClear(entity, state)) {
        unstable.towedClear = true;
        if (this._bus && this._bus.emit) {
          this._bus.emit('salvage:reactorTowedClear', { wreckId: entity.id, targetId: entity.id, t: state.simTime || 0 });
        }
        continue;
      }
      if ((state.simTime || 0) >= unstable.dueAt) this._burst(entity, unstable, state);
      // INF-U19 v1: a cooked fuse — or a virgin timer inside the warning window —
      // is a cooker. Towed bombs stay out: the tow is the player's weapon.
      if (!unstable.burst && entity.pos
        && (unstable.triggeredBy != null || (unstable.dueAt - now) <= COOKER_WARN_S)) {
        cookers.push({ id: `wreck:${entity.id}`, x: entity.pos.x, z: entity.pos.z, until: unstable.dueAt, ent: entity });
      }
    }

    // INF-U13 v2: fuse sweep after the wreck census; hot cores hold the latch open.
    const hotCores = this._sweepCoreFuses(state, state.simTime || 0);
    // INF-U19 v3: a hot ejected core inside its own warning window clears ships too.
    if (hotCores > 0) {
      for (const entity of state.entityList || []) {
        if (!entity || entity.alive === false || entity.type !== 'pickup' || !entity.pos) continue;
        const data = entity.data;
        if (!data || data.ventedCore !== true) continue;
        const left = (Number.isFinite(data.cooledAt) ? data.cooledAt : Infinity) - now;
        if (left > 0 && left <= COOKER_CORE_WARN_S) {
          cookers.push({ id: `core:${entity.id}`, x: entity.pos.x, z: entity.pos.z, until: data.cooledAt, ent: entity, core: true });
        }
      }
    }
    if (cookers.length) this._clearCookers(state, cookers, now);
    else this._releaseCookerFlight(state);

    if (SALVAGE_UNSTABLE_QUIET_LATCH !== false) {
      const laneVersion = entityIndexLaneVersion(state, SALVAGE_UNSTABLE_QUIET_LANES);
      const membership = laneVersion === -1 ? entityIndexVersion(state) : laneVersion;
      if (membership != null && liveUnstable === 0 && hotCores === 0) {
        this._unstableQuiet = {
          membership,
          wakeSeq: this._unstableWakeSeq | 0,
          armedTick: state.tick | 0,
        };
        publishSalvageUnstableQuiet(state, true);
      } else {
        this._unstableQuiet = null;
        publishSalvageUnstableQuiet(state, false);
      }
    }
  },

  _isTowedClear(entity, state) {
    const tether = state.player && state.player.tether;
    if (!tether || !tether.active || tether.targetId !== entity.id) return false;
    const player = playerEntity(state);
    return distance(player && player.pos, entity.pos) >= TETHER_AWAY_DISTANCE;
  },

  // INF-U19 v1: steer every non-hostile ship in the flee radius away from the
  // nearest cooker. Runs only on ticks with a live cooker, so quiet flight
  // never pays the ship walk.
  _clearCookers(state, cookers, now) {
    for (const ship of state.entityList || []) {
      if (!ship || ship.alive === false || !ship.pos) continue;
      if (ship.type !== 'ship' && ship.type !== 'drone') continue;
      if (ship.id === state.playerId) continue;
      const data = ship.data || (ship.data = {});
      const ai = data.ai || (data.ai = {});
      const intent = data.intent || (data.intent = {});
      if (this._holdsThroughCooker(ship, ai, intent)) {
        this._releaseCookerShip(ship);
        continue;
      }
      let best = null;
      let bestD2 = Infinity;
      for (const c of cookers) {
        const r = c.core ? COOKER_CORE_FLEE_R : COOKER_FLEE_R;
        const dx = ship.pos.x - c.x;
        const dz = ship.pos.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 < bestD2) { bestD2 = d2; best = c; }
      }
      if (!best) {
        this._releaseCookerShip(ship);
        continue;
      }
      const dist = Math.sqrt(bestD2) || 1;
      if (intent.mode !== 'salvage_cooker_flee') {
        intent.mode = 'salvage_cooker_flee';
        this._squawkCooker(ship, best, now);
      }
      intent.aimAngle = Math.atan2(ship.pos.z - best.z, ship.pos.x - best.x);
      intent.moveZ = 1;
      intent.moveX = 0;
      intent.boost = dist < COOKER_BOOST_R;
      intent.fire = false;
      ai._cookerFlee = { id: best.id, until: (Number.isFinite(best.until) ? best.until : now) + 1.5 };
      this._panicDrop(state, ship, best, now);
    }
  },

  // Hostiles hold their attack runs and burn with the wreck; the bounty chase,
  // the dock queue, and the player's own wing run their own brains.
  _holdsThroughCooker(ship, ai, intent) {
    if (ai.forcePlayerTarget || ai.huntPlayer) return true;
    if (Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(0)) return true;
    if (typeof intent.mode === 'string' && intent.mode.indexOf('bounty_') === 0) return true;
    if (ship.team === 0) return true;
    if (ai.docked || ship.data.docked || (ship.flags && ship.flags.docked)) return true;
    return false;
  },

  _releaseCookerFlight(state) {
    for (const ship of state.entityList || []) {
      if (!ship || !ship.data) continue;
      const ai = ship.data.ai;
      if ((ship.data.intent && ship.data.intent.mode === 'salvage_cooker_flee')
        || (ai && ai._cookerFlee)) {
        this._releaseCookerShip(ship);
      }
    }
  },

  _releaseCookerShip(ship) {
    const data = ship.data || {};
    if (data.ai && data.ai._cookerFlee) delete data.ai._cookerFlee;
    const intent = data.intent;
    if (intent && intent.mode === 'salvage_cooker_flee') {
      intent.mode = 'resume';
      intent.moveX = 0;
      intent.moveZ = 0;
      intent.boost = false;
    }
  },

  // INF-U19 v2: one warning per cooker, out loud, from the first hull that runs.
  _squawkCooker(ship, cooker, now) {
    const bag = cooker.core
      ? (cooker.ent.data || (cooker.ent.data = {}))
      : (cooker.ent.data.unstableReactor || (cooker.ent.data.unstableReactor = {}));
    if (bag.cookerWarned) return;
    bag.cookerWarned = true;
    if (this._bus && this._bus.emit) {
      this._bus.emit('toast', {
        text: "Reactor's cooking — the crew is clearing the wreck!",
        kind: 'warn', ttl: 4,
      });
      this._bus.emit('salvage:cookerFlight', {
        cookerId: cooker.id, shipId: ship.id, core: cooker.core === true, at: now,
      });
    }
    const voice = this._helpers && this._helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        kind: 'salvage_cooker_flee',
        factionId: ship.factionId || null,
        text: "Reactor's going — clear the wreck!",
      });
    }
  },

  // INF-U19 v2: a fleeing working hull shakes one unit loose — warships run clean.
  _panicDrop(state, ship, cooker, now) {
    const ai = ship.data.ai;
    if (!ai || ai._cookerDropped === cooker.id) return;
    ai._cookerDropped = cooker.id;
    const role = String(ai.archetype || ship.data.role || '').toLowerCase();
    if (role && !/miner|hauler|salv|tender|trader|courier|prospect|survey|sweeper|shuttle/.test(role)) return;
    if (!this._bus || typeof this._bus.emit !== 'function') return;
    const edge = (ship.radius || 8) + 4;
    this._bus.emit('entity:spawnRequest', {
      spec: {
        type: 'pickup',
        pos: { x: (ship.pos.x || 0) + edge, z: ship.pos.z || 0 },
        vel: { x: (ship.vel && ship.vel.x) || 0, z: (ship.vel && ship.vel.z) || 0 },
        radius: 2, mass: 0.2, collides: true,
        data: {
          kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 1,
          despawnAt: now + 90,
          scanLabel: 'Shaken loose',
        },
      },
    });
  },

  // INF-U7 v1: gunfire cooks the fuse. Applied damage shortens dueAt; a single
  // containment-cracking hit pops the reactor at once. Vented reactors are inert
  // (the vent meant something); a towed-clear hull still cooks — tow it into the
  // pirate camp and light it. Attribution follows the shooter.
  _onReactorDamaged(p) {
    const state = this._state;
    if (!state || p.targetId == null || !state.entities || !state.entities.get) return;
    const entity = state.entities.get(p.targetId);
    if (!entity || entity.alive === false) return;
    // INF-U13 v2: a hot ejected core is mini-ordnance — gunfire pops it. Cold cores
    // are inert pods; the magnet owns them.
    if (entity.type === 'pickup' && entity.data && entity.data.ventedCore === true) {
      this._onCoreDamaged(entity, p, state);
      return;
    }
    if (!isWreck(entity)) return;
    const unstable = entity.data && entity.data.unstableReactor;
    if (!unstable || unstable.vented || unstable.burst) return;
    const applied = Number(p.applied);
    const amount = Number(p.amount);
    const dmg = (Number.isFinite(applied) && applied > 0 ? applied : 0)
      || (Number.isFinite(amount) && amount > 0 ? amount : 0);
    if (!(dmg > 0)) return;
    if (p.attackerId != null) unstable.triggeredBy = p.attackerId;
    const now = state.simTime || 0;
    unstable.dueAt = (Number.isFinite(unstable.dueAt) ? unstable.dueAt : now + 8)
      - dmg * REACTOR_COOK_S_PER_DMG;
    if (dmg >= REACTOR_CRACK_DMG || now >= unstable.dueAt) {
      this._burst(entity, unstable, state);
      return;
    }
    if (!Number.isFinite(unstable.lastCookToastT)
      || now - unstable.lastCookToastT >= REACTOR_COOK_TOAST_COOLDOWN_S) {
      unstable.lastCookToastT = now;
      if (this._bus && this._bus.emit) {
        this._bus.emit('toast', { text: "The reactor's cooking off — clear it or use it.", kind: 'warn', ttl: 4 });
      }
    }
  },

  // INF-U13 v2: any applied damage inside the hot window detonates the core.
  // (Live today the fuse sweep below is the certain path — weapon routers do not
  // target pickups — but the seam stays so any future splash/damage honors it.)
  _onCoreDamaged(entity, p, state) {
    const now = state.simTime || 0;
    const cooledAt = entity.data && entity.data.cooledAt;
    if (!(Number.isFinite(cooledAt) ? now < cooledAt : false)) return;
    const applied = Number(p.applied);
    const amount = Number(p.amount);
    const dmg = (Number.isFinite(applied) && applied > 0 ? applied : 0)
      || (Number.isFinite(amount) && amount > 0 ? amount : 0);
    if (!(dmg > 0)) return;
    this._detonateCore(entity, p.attackerId != null ? p.attackerId : entity.id, state, now);
  },

  // One shared detonator: small radial thermal pop attributed to the trigger,
  // able to light sibling reactors. Called by the damage seam, the fuse sweep,
  // and sibling bursts.
  _detonateCore(entity, ownerId, state, now) {
    if (!entity || entity.alive === false) return null;
    const pos = entity.pos ? { x: entity.pos.x, z: entity.pos.z } : { x: 0, z: 0 };
    const combat = this._registry && this._registry.get && this._registry.get('combat');
    const hits = [];
    const list = state.entityList || [];
    for (const victim of list) {
      if (!victim || victim.alive === false || victim.id === entity.id) continue;
      if (victim.type !== 'ship' && victim.type !== 'drone') continue;
      if (!victim.pos) continue;
      const dist = Math.hypot(victim.pos.x - pos.x, victim.pos.z - pos.z)
        - (victim.radius || 0);
      const falloff = 1 - dist / REACTOR_CORE_BURST_RADIUS;
      if (!(falloff > 0)) continue;
      const payload = {
        targetId: victim.id,
        ownerId,
        damage: Math.max(1, REACTOR_CORE_BURST_DMG * falloff),
        damageType: 'thermal',
        pos: { x: pos.x, z: pos.z },
        origin: { kind: 'salvage_core', id: entity.id },
      };
      if (combat && typeof combat.onHit === 'function') combat.onHit(payload);
      else if (this._bus && this._bus.emit) this._bus.emit('combat:hit', payload);
      hits.push(victim.id);
    }
    let chained = 0;
    for (const other of list) {
      if (!isWreck(other) || other.alive === false) continue;
      const sib = other.data && other.data.unstableReactor;
      if (!sib || sib.vented || sib.burst || !other.pos) continue;
      const dist = Math.hypot(other.pos.x - pos.x, other.pos.z - pos.z);
      if (dist > REACTOR_CORE_BURST_RADIUS + (other.radius || 0)) continue;
      sib.dueAt = Math.min(Number.isFinite(sib.dueAt) ? sib.dueAt : Infinity, now + REACTOR_CHAIN_DELAY_S);
      sib.triggeredBy = ownerId;
      chained++;
    }
    entity.alive = false;
    if (this._bus && this._bus.emit) {
      this._bus.emit('salvage:coreDetonated', {
        targetId: entity.id, damage: REACTOR_CORE_BURST_DMG, hits, chained,
        triggeredBy: ownerId, t: now,
      });
      if (chained > 0) {
        this._bus.emit('toast', { text: 'The hot core lit the row — chain reaction.', kind: 'warn', ttl: 4 });
      }
    }
    return { hits, chained };
  },

  // INF-U13 v2: the fuse sweep. A hot core nobody scooped cooks off alone at
  // cooledAt; one warning toast beforehand. Indexed pickups when available, the
  // entity list only while a core may be live — never a permanent full walk.
  _sweepCoreFuses(state, now) {
    let hot = 0;
    const index = state.entityIndex;
    const usePickups = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
      && Array.isArray(index.pickups));
    const list = usePickups
      ? indexedTypeScan(state, 'pickups')
      : (this._hotCoresLive === true && state.entityList) || [];
    for (const entity of list) {
      if (!entity || entity.alive === false || entity.type !== 'pickup') continue;
      const data = entity.data;
      if (!data || data.ventedCore !== true) continue;
      const cooledAt = data.cooledAt;
      if (!Number.isFinite(cooledAt) || now >= cooledAt) {
        if (Number.isFinite(cooledAt)) {
          this._detonateCore(entity, entity.id, state, now);
          continue;
        }
        continue;
      }
      hot++;
      if (!data.coreWarned && now >= cooledAt - REACTOR_CORE_WARN_S) {
        data.coreWarned = true;
        if (this._bus && this._bus.emit) {
          this._bus.emit('toast', {
            text: 'The vented core is going critical — scoop it or clear the blast!',
            kind: 'warn', ttl: 4,
          });
        }
      }
    }
    this._hotCoresLive = hot > 0;
    return hot;
  },

  _burst(entity, unstable, state) {
    unstable.burst = true;
    const damage = Math.max(1, Math.min(unstable.damage || 18, 24));
    const ownerId = unstable.triggeredBy != null ? unstable.triggeredBy : entity.id;
    const pos = entity.pos ? { x: entity.pos.x, z: entity.pos.z } : { x: 0, z: 0 };
    // Radial with linear falloff: everything flammable in the fireball burns, not
    // just the player. Same combat.onHit path as before, per victim.
    const combat = this._registry && this._registry.get && this._registry.get('combat');
    const hits = [];
    const list = state.entityList || [];
    for (const victim of list) {
      if (!victim || victim.alive === false || victim.id === entity.id) continue;
      if (victim.type !== 'ship' && victim.type !== 'drone') continue;
      if (!victim.pos) continue;
      const dist = Math.hypot(victim.pos.x - pos.x, victim.pos.z - pos.z)
        - (victim.radius || 0);
      const falloff = 1 - dist / REACTOR_BURST_RADIUS;
      if (!(falloff > 0)) continue;
      const payload = {
        targetId: victim.id,
        ownerId,
        damage: Math.max(1, damage * falloff),
        damageType: 'thermal',
        pos: { x: pos.x, z: pos.z },
        origin: { kind: 'salvage_reactor', id: entity.id },
      };
      if (combat && typeof combat.onHit === 'function') combat.onHit(payload);
      else if (this._bus && this._bus.emit) this._bus.emit('combat:hit', payload);
      hits.push(victim.id);
    }
    // INF-U7 v2: the fireball lights sibling reactors. Chain with a short delay so
    // the room pops in sequence, not one frame — each still bursts radially.
    const now = state.simTime || 0;
    let chained = 0;
    for (const other of list) {
      if (!isWreck(other) || other.alive === false || other.id === entity.id) continue;
      const sib = other.data && other.data.unstableReactor;
      if (!sib || sib.vented || sib.burst || !other.pos) continue;
      const dist = Math.hypot(other.pos.x - pos.x, other.pos.z - pos.z);
      if (dist > REACTOR_BURST_RADIUS + (other.radius || 0)) continue;
      sib.dueAt = Math.min(Number.isFinite(sib.dueAt) ? sib.dueAt : Infinity, now + REACTOR_CHAIN_DELAY_S);
      sib.triggeredBy = ownerId;
      chained++;
    }
    // INF-U13 v3: the fireball also pops hot ejected cores in the blast — venting
    // next to a cooking row is a way to lose the prize. Depth-1: core pops chain
    // siblings through dueAt only, never re-enter the core scan.
    for (const other of list) {
      if (!other || other.alive === false || other.id === entity.id) continue;
      if (other.type !== 'pickup' || !other.data || other.data.ventedCore !== true) continue;
      const cooledAt = other.data.cooledAt;
      if (!(Number.isFinite(cooledAt) && now < cooledAt) || !other.pos) continue;
      const dist = Math.hypot(other.pos.x - pos.x, other.pos.z - pos.z);
      if (dist > REACTOR_BURST_RADIUS + (other.radius || 0)) continue;
      this._detonateCore(other, ownerId, state, now);
    }
    entity.alive = false;
    if (this._bus && this._bus.emit) {
      this._bus.emit('salvage:reactorBurst', {
        wreckId: entity.id, targetId: entity.id, damage, hits, chained,
        triggeredBy: ownerId, t: now,
      });
      if (chained > 0) {
        this._bus.emit('toast', { text: 'Chain reaction — the whole row is going up.', kind: 'warn', ttl: 4 });
      }
    }
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onEntitySpawned) this._bus.off('entity:spawned', this._onEntitySpawned);
      if (this._onScan) this._bus.off('scan:completed', this._onScan);
      if (this._onVent) this._bus.off('salvage:ventReactor', this._onVent);
      if (this._onDamage) this._bus.off('combat:damage', this._onDamage);
      if (this._onBoundaryWake) {
        this._bus.off('save:loaded', this._onBoundaryWake);
        this._bus.off('game:new', this._onBoundaryWake);
        this._bus.off('game:newGame', this._onBoundaryWake);
        this._bus.off('sector:enter', this._onBoundaryWake);
      }
    }
    this._onEntitySpawned = null;
    this._onScan = null;
    this._onVent = null;
    this._onDamage = null;
    this._onBoundaryWake = null;
  },
};

export default salvageActions;
