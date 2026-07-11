// M3 shared career-origin authority.
//
// One registry system owns the first-dock offer bundle and every live event adapter. The three
// candidate FSMs remain pure implementation modules; their system objects are never registered.
// Durable state lives only at state.careers.origins.{hauler,hunter,prospector,__meta}.

import { THRESHOLD as WANTED_THRESHOLD, isPlayerWanted } from '../../systems/heat.js';
import {
  buildOriginContractOffer,
  CAREER_ORIGIN_CONTRACTS,
  createOriginRouteState,
  normalizeOriginRouteState,
  ORIGIN_ROLE_KITS,
  ORIGIN_ROUTE_STATUS,
} from './careerOriginContracts.js';
import {
  acceptOrigin as acceptHaulerOrigin,
  declineOrigin as declineHaulerOrigin,
  evaluateStepSignal as evaluateHaulerStepSignal,
  onFirstDock as offerHaulerAtDock,
  recordMarketLeg as recordHaulerMarketLeg,
  tickHaulerOrigin,
} from './haulerOriginChain.js';
import {
  HAULER_CAREER_ID,
  HAULER_COMPLETION_REWARD,
  HAULER_ORIGIN_OFFER_COPY,
} from './haulerOriginData.js';
import {
  applyHaulerOriginSaveBlob,
  createHaulerOriginState,
  ensureHaulerOriginState,
  serializeHaulerOriginState,
} from './haulerOriginSchema.js';
import {
  abandonHunterOrigin,
  acceptHunterOrigin,
  classifyHunterContact,
  confirmHunterMark,
  createHunterOriginState,
  declineHunterOrigin,
  deserializeHunterOrigin,
  ensureHunterOriginState,
  failHunterPursuitLost,
  getHunterOriginState,
  HUNTER_OFFER_STATUS,
  HUNTER_ORIGIN_ID,
  HUNTER_PHASE,
  hunterOriginPresentation,
  noteHunterHeatSpiked,
  noteHunterIllegalFire,
  onHunterFirstDock,
  recoverHunterStep,
  resolveHunterCleanKill,
  resolveHunterCounterplay,
  serializeHunterOrigin,
  tickHunterPursuit,
} from './hunterOrigin.js';
import {
  abandonProspectorOrigin,
  acceptProspectorOrigin,
  createProspectorOriginState,
  declineProspectorOrigin,
  deserializeProspectorOrigin,
  ensureProspectorOriginState,
  getOfferView as getProspectorOfferView,
  handleCargoFull,
  handleMiningYield,
  handleScanCompleted,
  handleTetherBroke,
  handleTetherLatched,
  handleTradeCompleted,
  offerProspectorOrigin,
  progressSnapshot as prospectorProgressSnapshot,
  PROSPECTOR_ORIGIN_ID,
  PROSPECTOR_STATUS,
  serializeProspectorOrigin,
} from './prospectorOrigin.js';

export const CAREER_ORIGINS_SCHEMA_ID = 'spaceface.careerOrigins.v1';
export const CAREER_ORIGINS_SCHEMA_VERSION = 1;
export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

export const CAREER_ORIGINS_EVENTS = Object.freeze({
  OFFERED: 'career:origins:offered',
  ACCEPT: 'career:origin:accept',
  DECLINE: 'career:origin:decline',
  ABANDON: 'career:origin:abandon',
  ACCEPTED: 'career:origins:accepted',
  DECLINED: 'career:origins:declined',
  ABANDONED: 'career:origins:abandoned',
  PROGRESS: 'career:origins:progress',
});

const META_KEY = '__meta';
const HUNTER_PURSUIT_RANGE_SQ = 2200 * 2200;
const HUNTER_LOST_TICKS = 90;

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

function seedOf(state) {
  return ((state && state.meta && state.meta.seed) || (state && state.seed) || 1) >>> 0 || 1;
}

function emit(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

function emitIntents(bus, intents) {
  if (!Array.isArray(intents)) return;
  for (const intent of intents) {
    if (intent && intent.event) emit(bus, intent.event, intent.payload);
  }
}

function createMeta() {
  return {
    schemaId: CAREER_ORIGINS_SCHEMA_ID,
    schemaVersion: CAREER_ORIGINS_SCHEMA_VERSION,
    firstDockAt: null,
    firstDockStationId: null,
    offerNonce: 0,
    lastBundleKey: null,
    routes: {
      hunter: createOriginRouteState('hunter'),
      prospector: createOriginRouteState('prospector'),
    },
    upgradeReceipts: {},
  };
}

function ensureRouteMeta(meta) {
  if (!meta.routes || typeof meta.routes !== 'object') meta.routes = {};
  for (const careerId of Object.keys(CAREER_ORIGIN_CONTRACTS)) {
    const current = meta.routes[careerId];
    const normalized = normalizeOriginRouteState(careerId, current);
    if (current && typeof current === 'object') {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, normalized);
    } else {
      meta.routes[careerId] = normalized;
    }
  }
  if (!meta.upgradeReceipts || typeof meta.upgradeReceipts !== 'object') meta.upgradeReceipts = {};
  return meta.routes;
}

export function ensureCareerOriginsState(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  if (!state.careers.origins || typeof state.careers.origins !== 'object') state.careers.origins = {};
  const origins = state.careers.origins;
  if (!origins[META_KEY] || typeof origins[META_KEY] !== 'object') origins[META_KEY] = createMeta();
  ensureRouteMeta(origins[META_KEY]);
  ensureHaulerOriginState(state);
  ensureHunterOriginState(state, seedOf(state));
  ensureProspectorOriginState(state, simTimeOf(state));
  return origins;
}

export function getCareerOfferView(state, careerId = null) {
  const origins = ensureCareerOriginsState(state);
  const routes = origins[META_KEY].routes;
  const views = {
    hauler: (() => {
      const own = ensureHaulerOriginState(state);
      return {
        careerId: HAULER_CAREER_ID,
        title: 'Hauler',
        line: 'Real bid and ask. The bond can burn.',
        acceptLabel: HAULER_ORIGIN_OFFER_COPY.acceptLabel,
        declineLabel: 'Decline',
        status: own.status,
        canAccept: own.status === 'offered',
        canDecline: own.status === 'offered',
        nonBinding: true,
        rewardCredits: HAULER_COMPLETION_REWARD.credits,
        upgradeKit: ORIGIN_ROLE_KITS.hauler,
      };
    })(),
    hunter: (() => {
      const own = getHunterOriginState(state);
      return {
        careerId: HUNTER_ORIGIN_ID,
        title: 'Hunter',
        line: 'Legal HOSTILE marks only. Heat voids the bag.',
        acceptLabel: 'Take hunter path',
        declineLabel: 'Decline',
        status: routes.hunter.status === ORIGIN_ROUTE_STATUS.IDLE
          ? own.offer.status : routes.hunter.status,
        canAccept: routes.hunter.status === ORIGIN_ROUTE_STATUS.IDLE
          && own.offer.status === HUNTER_OFFER_STATUS.OFFERED,
        canDecline: routes.hunter.status === ORIGIN_ROUTE_STATUS.IDLE
          && own.offer.status === HUNTER_OFFER_STATUS.OFFERED,
        nonBinding: true,
        rewardCredits: own.reward.credits,
        contractCount: CAREER_ORIGIN_CONTRACTS.hunter.length,
        upgradeKit: ORIGIN_ROLE_KITS.hunter,
      };
    })(),
    prospector: (() => {
      const view = getProspectorOfferView(state);
      return {
        careerId: PROSPECTOR_ORIGIN_ID,
        title: 'Prospector',
        line: 'Scan, crack, sell. A full hold jams you.',
        acceptLabel: view.acceptLabel || 'Take the kit',
        declineLabel: 'Decline',
        status: routes.prospector.status === ORIGIN_ROUTE_STATUS.IDLE
          ? view.status : routes.prospector.status,
        canAccept: routes.prospector.status === ORIGIN_ROUTE_STATUS.IDLE && !!view.canAccept,
        canDecline: routes.prospector.status === ORIGIN_ROUTE_STATUS.IDLE && !!view.canDecline,
        nonBinding: true,
        rewardCredits: view.rewardPreview && view.rewardPreview.credits,
        contractCount: CAREER_ORIGIN_CONTRACTS.prospector.length,
        upgradeKit: ORIGIN_ROLE_KITS.prospector,
      };
    })(),
  };
  if (careerId) return views[careerId] || null;
  return {
    nonBinding: true,
    offers: CAREER_IDS.map((id) => views[id]),
  };
}

export function getCareerProgress(state, careerId = null) {
  const origins = ensureCareerOriginsState(state);
  const routes = origins[META_KEY].routes;
  const views = {
    hauler: JSON.parse(JSON.stringify(ensureHaulerOriginState(state))),
    hunter: { ...hunterOriginPresentation(state), contractRoute: JSON.parse(JSON.stringify(routes.hunter)) },
    prospector: {
      ...prospectorProgressSnapshot(
        ensureProspectorOriginState(state, simTimeOf(state)), simTimeOf(state),
      ),
      contractRoute: JSON.parse(JSON.stringify(routes.prospector)),
    },
  };
  return careerId ? (views[careerId] || null) : views;
}

export function offerCareerOriginsAtDock(state, payload = {}, bus = null) {
  const origins = ensureCareerOriginsState(state);
  const meta = origins[META_KEY];
  const t = simTimeOf(state);
  if (meta.firstDockAt == null) {
    meta.firstDockAt = t;
    meta.firstDockStationId = payload.stationId == null ? null : String(payload.stationId);
  }

  offerHaulerAtDock(state, payload.stationId, t);
  onHunterFirstDock(state, { stationId: payload.stationId, simTime: t }, null);
  offerProspectorOrigin(state, payload, null);

  const view = getCareerOfferView(state);
  const key = view.offers.map((offer) => `${offer.careerId}:${offer.status}`).join('|');
  if (view.offers.some((offer) => offer.canAccept) && meta.lastBundleKey !== key) {
    meta.lastBundleKey = key;
    meta.offerNonce += 1;
    emit(bus, CAREER_ORIGINS_EVENTS.OFFERED, {
      stationId: payload.stationId || meta.firstDockStationId,
      nonce: meta.offerNonce,
      nonBinding: true,
      offers: view.offers,
    });
  }
  return view;
}

export function serializeCareerOrigins(state) {
  const origins = ensureCareerOriginsState(state);
  return {
    schemaId: CAREER_ORIGINS_SCHEMA_ID,
    schemaVersion: CAREER_ORIGINS_SCHEMA_VERSION,
    origins: {
      [META_KEY]: JSON.parse(JSON.stringify(origins[META_KEY])),
      hauler: serializeHaulerOriginState(state),
      hunter: serializeHunterOrigin(state),
      prospector: serializeProspectorOrigin(state),
    },
  };
}

export function deserializeCareerOrigins(state, blob) {
  if (!state || typeof state !== 'object') return null;
  if (!state.careers || typeof state.careers !== 'object') state.careers = {};
  const src = blob && blob.origins && typeof blob.origins === 'object'
    ? blob.origins
    : (blob && typeof blob === 'object' ? blob : {});
  state.careers.origins = {
    [META_KEY]: src[META_KEY] && typeof src[META_KEY] === 'object'
      ? { ...createMeta(), ...src[META_KEY] }
      : createMeta(),
  };
  applyHaulerOriginSaveBlob(state, src.hauler || null);
  deserializeHunterOrigin(src.hunter || null, state, seedOf(state));
  deserializeProspectorOrigin(state, src.prospector || null);
  return ensureCareerOriginsState(state);
}

export function createCareerOriginsSystem() {
  return {
    name: 'careerOrigins',
    state: null,
    bus: null,
    registry: null,
    _subs: null,
    _hunterLastTargetId: null,
    _hunterLostTicks: 0,
    _hunterTelegraphTargetId: null,
    _hunterTelegraphUntilTick: -1,

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.registry = ctx.registry || null;
      this._subs = [];
      ensureCareerOriginsState(this.state);
      this._listen('dock:docked', (payload) => {
        offerCareerOriginsAtDock(this.state, payload || {}, this.bus);
        this._resumeRoutesAtDock(payload || {});
      });
      this._listen(CAREER_ORIGINS_EVENTS.ACCEPT, (payload) => {
        if (payload && payload.careerId) this.accept(payload.careerId);
      });
      this._listen(CAREER_ORIGINS_EVENTS.DECLINE, (payload) => {
        if (payload && payload.careerId) this.decline(payload.careerId);
      });
      this._listen(CAREER_ORIGINS_EVENTS.ABANDON, (payload) => {
        if (payload && payload.careerId) this.abandon(payload.careerId);
      });
      this._listen('mission:completed', (payload) => this._onMissionCompleted(payload || {}));
      this._listen('mission:failed', (payload) => this._onMissionFailed(payload || {}));
      this._listen('economy:tradeCompleted', (payload) => this._onTradeCompleted(payload || {}));
      this._listen('scan:completed', (payload) => handleScanCompleted(this.state, payload || {}, this.bus));
      this._listen('mining:yield', (payload) => handleMiningYield(this.state, payload || {}, this.bus));
      this._listen('cargo:full', (payload) => handleCargoFull(this.state, payload || {}, this.bus));
      this._listen('tether:latched', (payload) => handleTetherLatched(this.state, payload || {}, this.bus));
      this._listen('tether:broke', (payload) => handleTetherBroke(this.state, payload || {}, this.bus));
      this._listen('combat:damage', (payload) => this._onCombatDamage(payload || {}));
      this._listen('heat:changed', (payload) => this._onHeatChanged(payload || {}));
      this._listen('ai:telegraph', (payload) => this._onAiTelegraph(payload || {}));
      this._listen('entity:killed', (payload) => this._onEntityKilled(payload || {}));
      this._listen('career:origin:completed', (payload) => {
        if (payload && payload.careerId) this._grantOriginUpgrade(payload.careerId);
      });
    },

    newGame() {
      if (!this.state) return;
      if (!this.state.careers || typeof this.state.careers !== 'object') this.state.careers = {};
      this.state.careers.origins = {
        [META_KEY]: createMeta(),
        hauler: createHaulerOriginState(),
        hunter: createHunterOriginState(seedOf(this.state)),
        prospector: createProspectorOriginState(0),
      };
      this._resetScratch();
    },

    update(_dt, state) {
      if (state) this.state = state;
      if (!this.state) return;
      const haulerTick = tickHaulerOrigin(this.state, simTimeOf(this.state));
      if (haulerTick && haulerTick.ok) emitIntents(this.bus, haulerTick.intents);
      this._updateHunter();
    },

    serialize() { return serializeCareerOrigins(this.state); },
    deserialize(blob) {
      const result = deserializeCareerOrigins(this.state, blob);
      this._resetScratch();
      this._restoreRouteMarkers();
      return result;
    },
    getOfferView(careerId) { return getCareerOfferView(this.state, careerId); },
    getProgress(careerId) { return getCareerProgress(this.state, careerId); },
    offerAtDock(payload) { return offerCareerOriginsAtDock(this.state, payload || {}, this.bus); },

    accept(careerId) {
      const id = String(careerId || '');
      const t = simTimeOf(this.state);
      let result;
      if (id === 'hauler') {
        const before = serializeHaulerOriginState(this.state);
        result = acceptHaulerOrigin(this.state, t, { allowSyntheticMarkets: false });
        if (result && result.ok) {
          const missions = this.registry && this.registry.get && this.registry.get('missions');
          const posted = missions && typeof missions.postAndAcceptAuthoredOffer === 'function'
            ? missions.postAndAcceptAuthoredOffer(result.missionOffer)
            : { ok: false, reason: 'missions_unavailable' };
          if (!posted.ok) {
            applyHaulerOriginSaveBlob(this.state, before);
            return { ok: false, reason: posted.reason || 'mission_post_failed' };
          }
          const own = ensureHaulerOriginState(this.state);
          own.activeContract.offerId = posted.offerId || result.missionOffer.id;
          own.activeContract.missionId = posted.missionId;
          this._stampMissionMarker(id, posted.missionId, result.missionOffer);
          emitIntents(this.bus, result.intents);
        }
      } else if (id === 'hunter') {
        const before = serializeHunterOrigin(this.state);
        const beforeRoute = JSON.parse(JSON.stringify(this._route(id)));
        // Defer public acceptance signals until missions has accepted the authored contract.
        result = acceptHunterOrigin(this.state, { simTime: t }, null);
        if (result && result.ok) {
          const posted = this._startMissionRoute(id);
          if (!posted.ok) {
            deserializeHunterOrigin(before, this.state, seedOf(this.state));
            ensureCareerOriginsState(this.state)[META_KEY].routes[id] = beforeRoute;
            return posted;
          }
          result = { ...result, missionId: posted.missionId, offerId: posted.offerId };
        }
      } else if (id === 'prospector') {
        const before = serializeProspectorOrigin(this.state);
        const beforeRoute = JSON.parse(JSON.stringify(this._route(id)));
        // Defer public acceptance signals until missions has accepted the authored contract.
        result = acceptProspectorOrigin(this.state, null);
        if (result && result.ok) {
          const posted = this._startMissionRoute(id);
          if (!posted.ok) {
            deserializeProspectorOrigin(this.state, before);
            ensureCareerOriginsState(this.state)[META_KEY].routes[id] = beforeRoute;
            return posted;
          }
          result = { ...result, missionId: posted.missionId, offerId: posted.offerId };
        }
      } else {
        return { ok: false, reason: 'unknown_career' };
      }
      if (result && result.ok) {
        emit(this.bus, CAREER_ORIGINS_EVENTS.ACCEPTED, { careerId: id, nonBinding: true, simTime: t });
      }
      return result;
    },

    decline(careerId) {
      const id = String(careerId || '');
      const t = simTimeOf(this.state);
      let result;
      if (id === 'hauler') result = declineHaulerOrigin(this.state, t);
      else if (id === 'hunter') result = declineHunterOrigin(this.state, { simTime: t }, this.bus);
      else if (id === 'prospector') result = declineProspectorOrigin(this.state, this.bus);
      else return { ok: false, reason: 'unknown_career' };
      if (result && result.ok) emit(this.bus, CAREER_ORIGINS_EVENTS.DECLINED, { careerId: id, nonBinding: true });
      return result;
    },

    abandon(careerId) {
      const id = String(careerId || '');
      const t = simTimeOf(this.state);
      let result;
      if (id === 'hauler') {
        const own = ensureHaulerOriginState(this.state);
        result = own.status === 'active'
          ? evaluateHaulerStepSignal(this.state, { kind: 'mission_failed', reason: 'abandoned' }, t)
          : declineHaulerOrigin(this.state, t);
        if (result && result.ok) emitIntents(this.bus, result.intents);
      } else if (id === 'hunter') result = abandonHunterOrigin(this.state, { simTime: t }, this.bus);
      else if (id === 'prospector') result = abandonProspectorOrigin(this.state, this.bus);
      else return { ok: false, reason: 'unknown_career' };
      if (result && result.ok) {
        const route = this._route(id);
        if (route && route.status !== ORIGIN_ROUTE_STATUS.COMPLETED) {
          const missions = this._missionAuthority();
          if (route.activeMissionId && missions && typeof missions.abandonMission === 'function') {
            missions.abandonMission(route.activeMissionId);
          }
          route.status = ORIGIN_ROUTE_STATUS.ABANDONED;
          route.activeMissionId = null;
          route.activeOfferId = null;
        }
        emit(this.bus, CAREER_ORIGINS_EVENTS.ABANDONED, { careerId: id, nonBinding: true });
      }
      return result;
    },

    destroy() {
      for (const off of this._subs || []) {
        try { off(); } catch (_) { /* cleanup is best-effort */ }
      }
      this._subs = [];
    },

    _listen(event, handler) {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, handler);
      if (typeof off === 'function') this._subs.push(off);
    },

    _resetScratch() {
      this._hunterLastTargetId = null;
      this._hunterLostTicks = 0;
      this._hunterTelegraphTargetId = null;
      this._hunterTelegraphUntilTick = -1;
    },

    _onMissionCompleted(payload) {
      const own = ensureHaulerOriginState(this.state);
      if (own.status === 'active' && own.activeContract
        && payload.missionId === own.activeContract.missionId) {
        const result = evaluateHaulerStepSignal(this.state, own.activeContract.stepId === 'market_spread'
          ? { kind: 'market_spread', missionId: payload.missionId, missionPaid: true }
          : { kind: 'mission_completed', missionId: payload.missionId, missionPaid: true },
        simTimeOf(this.state));
        if (result && result.ok) emitIntents(this.bus, result.intents);
      }
      this._completeMissionRouteLink(payload);
    },

    _onMissionFailed(payload) {
      const own = ensureHaulerOriginState(this.state);
      if (own.status === 'active' && own.activeContract
        && payload.missionId === own.activeContract.missionId) {
        const result = evaluateHaulerStepSignal(this.state, {
          kind: 'mission_failed', missionId: payload.missionId, reason: payload.reason || 'mission_failed',
        }, simTimeOf(this.state));
        if (result && result.ok) emitIntents(this.bus, result.intents);
      }
      this._failMissionRouteLink(payload);
    },

    _onTradeCompleted(payload) {
      const own = ensureHaulerOriginState(this.state);
      if (own.status === 'active' && own.activeContract
        && own.activeContract.stepId === 'market_spread'
        && payload.commodityId === own.activeContract.commodityId
        && (payload.side === 'buy' || payload.side === 'sell')) {
        recordHaulerMarketLeg(this.state, payload.side, {
          stationId: payload.stationId,
          commodityId: payload.commodityId,
          qty: payload.qty,
          unitPrice: payload.unitAvg,
          total: payload.total,
          source: 'economy:tradeCompleted',
        }, simTimeOf(this.state));
      }
      handleTradeCompleted(this.state, payload, this.bus);
    },

    _missionAuthority() {
      return this.registry && typeof this.registry.get === 'function'
        ? this.registry.get('missions') : null;
    },

    _route(careerId) {
      const origins = ensureCareerOriginsState(this.state);
      return origins && origins[META_KEY] && origins[META_KEY].routes[careerId] || null;
    },

    _startMissionRoute(careerId) {
      const route = this._route(careerId);
      if (!route) return { ok: false, reason: 'route_unavailable' };
      route.status = ORIGIN_ROUTE_STATUS.ACTIVE;
      route.contractIndex = 0;
      route.activeMissionId = null;
      route.activeOfferId = null;
      route.attempt = 0;
      route.completedContractIds = [];
      route.startedAtS = simTimeOf(this.state);
      route.completedAtS = null;
      route.lastFailure = null;
      return this._postRouteContract(careerId);
    },

    _postRouteContract(careerId) {
      const route = this._route(careerId);
      const missions = this._missionAuthority();
      if (!route || !missions || typeof missions.postAndAcceptAuthoredOffer !== 'function') {
        return { ok: false, reason: 'missions_unavailable' };
      }
      const offer = buildOriginContractOffer(this.state, careerId, route.contractIndex, route.attempt);
      if (!offer) return { ok: false, reason: 'contract_missing' };
      const posted = missions.postAndAcceptAuthoredOffer(offer);
      if (!posted || !posted.ok) {
        return { ok: false, reason: posted && posted.reason || 'mission_post_failed' };
      }
      route.status = ORIGIN_ROUTE_STATUS.ACTIVE;
      route.activeMissionId = posted.missionId;
      route.activeOfferId = posted.offerId || offer.id;
      route.lastFailure = null;
      this._stampMissionMarker(careerId, posted.missionId, offer);
      emit(this.bus, CAREER_ORIGINS_EVENTS.PROGRESS, {
        careerId,
        contractId: offer.originContractId,
        contractIndex: route.contractIndex,
        contractCount: CAREER_ORIGIN_CONTRACTS[careerId].length,
        missionId: posted.missionId,
        markerId: offer.markerId,
        destinationSectorId: offer.destSectorId,
        destinationStationId: offer.destStationId,
      });
      return { ok: true, missionId: posted.missionId, offerId: route.activeOfferId, offer };
    },

    _stampMissionMarker(careerId, missionId, offer) {
      if (!missionId || !offer) return false;
      const marker = {
        markerId: offer.markerId || `origin:${careerId}:${offer.originContractId || offer.originStepId || 'active'}`,
        markerKind: 'mission-objective',
        mapLabel: offer.mapLabel || offer.description || offer.title || 'Career objective',
        originCareer: careerId,
        originContractId: offer.originContractId || offer.originStepId || null,
        originContractIndex: Number.isInteger(offer.originContractIndex) ? offer.originContractIndex : null,
      };
      const active = this.state.missions && this.state.missions.active;
      const mission = Array.isArray(active) ? active.find((candidate) => candidate.id === missionId) : null;
      if (mission) Object.assign(mission, marker);
      const waypoint = this.state.nav && this.state.nav.waypoint;
      if (waypoint && waypoint.missionId === missionId) {
        Object.assign(waypoint, marker);
        emit(this.bus, 'nav:waypoint', { ...waypoint });
      }
      return !!mission;
    },

    _restoreRouteMarkers() {
      const hauler = ensureHaulerOriginState(this.state);
      if (hauler.status === 'active' && hauler.activeContract) {
        this._stampMissionMarker('hauler', hauler.activeContract.missionId, {
          markerId: `origin:hauler:${hauler.activeContract.stepId}`,
          originStepId: hauler.activeContract.stepId,
          mapLabel: 'Complete the active freight contract',
        });
      }
      for (const careerId of Object.keys(CAREER_ORIGIN_CONTRACTS)) {
        const route = this._route(careerId);
        if (!route || !route.activeMissionId) continue;
        const offer = buildOriginContractOffer(this.state, careerId, route.contractIndex, route.attempt);
        this._stampMissionMarker(careerId, route.activeMissionId, offer);
      }
    },

    _completeMissionRouteLink(payload) {
      const missionId = payload && payload.missionId;
      if (!missionId) return false;
      for (const careerId of Object.keys(CAREER_ORIGIN_CONTRACTS)) {
        const route = this._route(careerId);
        if (!route || route.status !== ORIGIN_ROUTE_STATUS.ACTIVE
          || route.activeMissionId !== missionId) continue;
        const def = CAREER_ORIGIN_CONTRACTS[careerId][route.contractIndex];
        if (!def) return false;
        if (!route.completedContractIds.includes(def.id)) route.completedContractIds.push(def.id);
        route.contractIndex += 1;
        route.activeMissionId = null;
        route.activeOfferId = null;
        route.attempt = 0;
        if (route.contractIndex >= CAREER_ORIGIN_CONTRACTS[careerId].length) {
          this._finishMissionRoute(careerId);
          return true;
        }
        const next = this._postRouteContract(careerId);
        if (!next.ok) {
          route.status = ORIGIN_ROUTE_STATUS.RECOVERING;
          route.lastFailure = { reason: next.reason, atS: simTimeOf(this.state) };
        }
        return true;
      }
      return false;
    },

    _failMissionRouteLink(payload) {
      const missionId = payload && payload.missionId;
      if (!missionId) return false;
      for (const careerId of Object.keys(CAREER_ORIGIN_CONTRACTS)) {
        const route = this._route(careerId);
        if (!route || route.activeMissionId !== missionId) continue;
        route.status = ORIGIN_ROUTE_STATUS.RECOVERING;
        route.activeMissionId = null;
        route.activeOfferId = null;
        route.attempt += 1;
        route.lastFailure = {
          reason: String(payload.reason || 'mission_failed'),
          atS: simTimeOf(this.state),
          recovery: 'dock_to_reissue',
        };
        emit(this.bus, CAREER_ORIGINS_EVENTS.PROGRESS, {
          careerId,
          recovering: true,
          contractIndex: route.contractIndex,
          attempt: route.attempt,
          recovery: 'Dock to reissue the writ.',
        });
        return true;
      }
      return false;
    },

    _resumeRoutesAtDock() {
      for (const careerId of Object.keys(CAREER_ORIGIN_CONTRACTS)) {
        const route = this._route(careerId);
        if (!route || route.status !== ORIGIN_ROUTE_STATUS.RECOVERING
          || route.activeMissionId) continue;
        this._postRouteContract(careerId);
      }
      for (const careerId of CAREER_IDS) this._grantOriginUpgrade(careerId);
    },

    _finishMissionRoute(careerId) {
      const route = this._route(careerId);
      if (!route || route.status === ORIGIN_ROUTE_STATUS.COMPLETED) return false;
      route.status = ORIGIN_ROUTE_STATUS.COMPLETED;
      route.completedAtS = simTimeOf(this.state);
      route.activeMissionId = null;
      route.activeOfferId = null;
      if (careerId === 'hunter') {
        const own = getHunterOriginState(this.state);
        if (own && own.offer.status !== HUNTER_OFFER_STATUS.COMPLETED) {
          own.offer.status = HUNTER_OFFER_STATUS.COMPLETED;
          own.phase = HUNTER_PHASE.COMPLETE;
          own.stepIndex = CAREER_ORIGIN_CONTRACTS.hunter.length;
          own.stepId = null;
          if (!own.reward.granted) {
            own.reward.granted = true;
            own.reward.grantedAtSimTime = simTimeOf(this.state);
            emit(this.bus, 'economy:grantCredits', {
              amount: own.reward.credits, reason: 'origin:hunter:complete',
            });
          }
          emit(this.bus, 'hunterOrigin:completed', {
            careerId, reward: { ...own.reward }, simTime: simTimeOf(this.state),
          });
        }
      } else if (careerId === 'prospector') {
        const own = ensureProspectorOriginState(this.state, simTimeOf(this.state));
        if (own.status !== PROSPECTOR_STATUS.COMPLETED) {
          own.status = PROSPECTOR_STATUS.COMPLETED;
          own.completedAt = simTimeOf(this.state);
          own.activeStepId = null;
          own.stepIndex = CAREER_ORIGIN_CONTRACTS.prospector.length - 1;
          if (!own.rewardGranted) {
            own.rewardGranted = true;
            own.reward.grantedAt = simTimeOf(this.state);
            emit(this.bus, 'economy:grantCredits', {
              amount: own.reward.credits, reason: 'origin:prospector:complete',
            });
          }
          emit(this.bus, 'origin:prospector:completed', {
            originId: careerId, binding: false, reward: { ...own.reward, granted: true },
            simTime: simTimeOf(this.state),
          });
        }
      }
      emit(this.bus, 'career:origin:completed', {
        careerId,
        nonBinding: true,
        contractCount: route.completedContractIds.length,
        upgradeKit: ORIGIN_ROLE_KITS[careerId],
      });
      this._grantOriginUpgrade(careerId);
      return true;
    },

    _grantOriginUpgrade(careerId) {
      const origins = ensureCareerOriginsState(this.state);
      const meta = origins && origins[META_KEY];
      const kit = ORIGIN_ROLE_KITS[careerId];
      if (!meta || !kit || meta.upgradeReceipts[careerId]) return false;
      if (careerId === 'hauler') {
        if (ensureHaulerOriginState(this.state).status !== 'completed') return false;
      } else {
        const route = meta.routes[careerId];
        if (!route || route.status !== ORIGIN_ROUTE_STATUS.COMPLETED) return false;
      }
      const ships = this.registry && typeof this.registry.get === 'function'
        ? this.registry.get('ships') : null;
      if (!ships || typeof ships.grantModule !== 'function') return false;
      const granted = ships.grantModule({
        defId: kit.defId,
        reason: `career_origin:${careerId}:complete`,
      });
      if (!granted) return false;
      meta.upgradeReceipts[careerId] = {
        defId: kit.defId,
        label: kit.label,
        grantedAtS: simTimeOf(this.state),
      };
      if (meta.routes[careerId]) meta.routes[careerId].upgradeGranted = true;
      emit(this.bus, 'toast', {
        text: `${kit.label} issued. Fit it at Outfitting.`, kind: 'success', ttl: 5,
      });
      return true;
    },

    _updateHunter() {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED) return;
      const targetId = this.state.player && this.state.player.targetId;

      if (own.phase === HUNTER_PHASE.RECOVERING) {
        const canRetryMark = own.stepId === 'identify' && targetId != null
          && targetId !== this._hunterLastTargetId;
        const canRetryPursuit = own.stepId === 'pursuit' && targetId === own.target.entityId;
        if (!isPlayerWanted(this.state) && (canRetryMark || canRetryPursuit)) {
          recoverHunterStep(this.state, { simTime: simTimeOf(this.state) }, this.bus);
          this._hunterLostTicks = 0;
          if (canRetryMark) this._hunterLastTargetId = null;
        }
        return;
      }
      if (own.phase !== HUNTER_PHASE.ACTIVE) return;

      if (own.stepId === 'identify') {
        if (targetId == null) { this._hunterLastTargetId = null; return; }
        if (targetId === this._hunterLastTargetId) return;
        this._hunterLastTargetId = targetId;
        const entity = this.state.entities && this.state.entities.get(targetId);
        confirmHunterMark(this.state, entity, { simTime: simTimeOf(this.state) }, this.bus);
        return;
      }

      if (own.stepId === 'pursuit') {
        const mark = this.state.entities && this.state.entities.get(own.target.entityId);
        const player = this.state.entities && this.state.entities.get(this.state.playerId);
        let inContact = false;
        if (mark && player && mark.alive !== false && mark.pos && player.pos
          && targetId === own.target.entityId && own.target.legalBounty) {
          const dx = mark.pos.x - player.pos.x;
          const dz = mark.pos.z - player.pos.z;
          inContact = dx * dx + dz * dz <= HUNTER_PURSUIT_RANGE_SQ;
        }
        if (inContact) {
          this._hunterLostTicks = 0;
          tickHunterPursuit(this.state, {
            inContact: true, dtTicks: 1, simTime: simTimeOf(this.state),
          }, this.bus);
        } else {
          this._hunterLostTicks += 1;
          if (this._hunterLostTicks >= HUNTER_LOST_TICKS) {
            this._hunterLostTicks = 0;
            failHunterPursuitLost(this.state, { simTime: simTimeOf(this.state) }, this.bus);
          }
        }
        return;
      }

      if (own.stepId === 'counterplay' && this._hunterTelegraphTargetId === own.target.entityId
        && this.state.tick >= this._hunterTelegraphUntilTick) {
        this._hunterTelegraphTargetId = null;
        this._hunterTelegraphUntilTick = -1;
        if (!isPlayerWanted(this.state)) {
          resolveHunterCounterplay(this.state, { simTime: simTimeOf(this.state), success: true }, this.bus);
        }
      }
    },

    _onCombatDamage(payload) {
      if (payload.attackerId !== this.state.playerId) return;
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED
        || own.phase !== HUNTER_PHASE.ACTIVE) return;
      if (payload.targetId === own.target.entityId) return;
      const victim = this.state.entities && this.state.entities.get(payload.targetId);
      const contact = victim ? classifyHunterContact(this.state, victim) : null;
      if (!contact || contact.lawful || contact.civilian || !contact.legalBounty) {
        noteHunterIllegalFire(this.state, { simTime: simTimeOf(this.state) }, this.bus);
      }
    },

    _onHeatChanged(payload) {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED
        || own.phase !== HUNTER_PHASE.ACTIVE) return;
      if (Number.isFinite(payload.value) && payload.value >= WANTED_THRESHOLD) {
        noteHunterHeatSpiked(this.state, { simTime: simTimeOf(this.state) }, this.bus);
      }
    },

    _onAiTelegraph(payload) {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED
        || own.phase !== HUNTER_PHASE.ACTIVE || own.stepId !== 'counterplay') return;
      if (payload.entityId !== own.target.entityId) return;
      this._hunterTelegraphTargetId = payload.entityId;
      this._hunterTelegraphUntilTick = (Number.isFinite(payload.tick) ? payload.tick : this.state.tick)
        + Math.max(1, Number.isFinite(payload.durationTicks) ? payload.durationTicks : 30);
    },

    _onEntityKilled(payload) {
      const own = getHunterOriginState(this.state);
      if (!own || own.offer.status !== HUNTER_OFFER_STATUS.ACCEPTED
        || own.phase !== HUNTER_PHASE.ACTIVE || own.stepId !== 'counterplay') return;
      const victim = this.state.entities && this.state.entities.get(payload.id);
      const contact = victim ? classifyHunterContact(this.state, victim) : null;
      resolveHunterCleanKill(this.state, {
        ...payload,
        factionId: payload.factionId || (victim && victim.factionId) || null,
        factionLawful: payload.factionLawful != null
          ? payload.factionLawful : !!(contact && contact.lawful),
        illegalToKill: payload.illegalToKill != null
          ? payload.illegalToKill : !!(contact && contact.illegalToKill),
      }, { simTime: simTimeOf(this.state) }, this.bus);
    },
  };
}

export const careerOrigins = createCareerOriginsSystem();

export const CAREER_ORIGINS_CONTRACT = Object.freeze({
  schemaId: CAREER_ORIGINS_SCHEMA_ID,
  schemaVersion: CAREER_ORIGINS_SCHEMA_VERSION,
  careerIds: CAREER_IDS,
  nonBinding: true,
  statePath: 'careers.origins',
  system: careerOrigins,
});

export default careerOrigins;
