// Durable navigation save/restore adapter.
//
// Why this lives beside saveSystem instead of in UI/market: `state.nav` is the player-facing promise
// that a plotted course or trade destination is still there after Continue/reload. The route planner,
// HUD, local map, and station departure chips all read this state directly, so the persistence seam
// belongs to save/load, not to any one screen.

const PATCH_FLAG = Symbol.for('spaceface.navContinuity.v1');
const AUTOSAVE_SLOT = 'auto';

export const navContinuity = {
  name: 'navContinuity',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;

    const saveSystem = this._saveSystem();
    installNavContinuity(saveSystem);

    // Station departure is the critical trust seam for the first-hour trading loop: after Load & Nav
    // and before the next interval autosave, the player may quit/reload expecting the cargo + course
    // to be authoritative. Force a quiet autosave instead of relying on the 10s flight debounce.
    this.bus.on('dock:undocked', () => this.saveDepartureSnapshot());
  },

  _saveSystem() {
    return this.registry && this.registry.get && this.registry.get('save');
  },

  saveDepartureSnapshot() {
    const saveSystem = this._saveSystem();
    const state = this.state;
    if (!saveSystem || typeof saveSystem.save !== 'function' || !state) return false;
    if (saveSystem._restoring || saveSystem._playerDead) return false;

    const jumpState = state.jump && state.jump.state;
    if (jumpState === 'CHARGING' || jumpState === 'JUMPING') return false;

    const hasPlayer = typeof saveSystem._hasPlayerEntity === 'function'
      ? saveSystem._hasPlayerEntity.call(saveSystem)
      : !!(state.entities && state.entities.get && state.playerId != null && state.entities.get(state.playerId));
    if (!hasPlayer) return false;

    const ok = saveSystem.save(AUTOSAVE_SLOT);
    if (ok) {
      const t = nowMs();
      saveSystem._lastAutosaveAt = t;
      saveSystem._lastAutosavePlaytime = state.meta && Number.isFinite(state.meta.playtimeS) ? state.meta.playtimeS : 0;
      if (state.save) state.save.lastAutosaveAt = t;
    }
    return ok;
  },
};

export function installNavContinuity(saveSystem) {
  if (!saveSystem || saveSystem[PATCH_FLAG]) return false;
  if (typeof saveSystem.serializeData !== 'function' || typeof saveSystem._restore !== 'function') return false;

  const originalSerializeData = saveSystem.serializeData;
  const originalRestore = saveSystem._restore;

  saveSystem.serializeData = function serializeDataWithNavContinuity() {
    const data = originalSerializeData.call(this);
    data.nav = serializeNavState(this.state && this.state.nav);
    return data;
  };

  saveSystem._restore = function restoreWithNavContinuity(data, slot) {
    const savedNav = data && data.nav;
    const shouldRestoreSavedNav = hasMeaningfulNavRecord(savedNav);

    // Clear stale nav before the destructive restore. If this save has no nav, mission/story systems
    // may still rebuild guidance from active mission state during save:loaded; we do not overwrite it.
    if (this.state) this.state.nav = emptyNavState();

    const result = originalRestore.call(this, data, slot);

    if (this.state && shouldRestoreSavedNav) {
      this.state.nav = normalizeNavState(savedNav, this.state);
      const waypoint = this.state.nav && this.state.nav.waypoint;
      if (this.bus && this.bus.emit) this.bus.emit('nav:waypoint', waypoint || null);
    } else if (this.state && (!this.state.nav || typeof this.state.nav !== 'object')) {
      this.state.nav = emptyNavState();
    }

    return result;
  };

  saveSystem[PATCH_FLAG] = true;
  return true;
}

export function serializeNavState(nav) {
  return normalizeNavState(nav, null);
}

export function normalizeNavState(nav, state = null) {
  const out = emptyNavState();
  if (!nav || typeof nav !== 'object') return out;
  out.autoTravel = nav.autoTravel === true;
  out.route = normalizeRoute(nav.route);
  out.waypoint = normalizeWaypoint(nav.waypoint, state);
  return out;
}

function emptyNavState() {
  return { route: null, autoTravel: false, waypoint: null };
}

function hasMeaningfulNavRecord(nav) {
  return !!(nav && typeof nav === 'object' && (nav.autoTravel === true || nav.route || nav.waypoint));
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') return null;
  const legs = Array.isArray(route.legs) ? route.legs.map(normalizeRouteLeg).filter(Boolean) : [];
  const out = { legs };
  assignString(out, 'destinationSectorId', route.destinationSectorId);
  assignNumber(out, 'totalFuel', route.totalFuel);
  assignNumber(out, 'totalHops', route.totalHops);
  return legs.length || out.destinationSectorId ? out : null;
}

function normalizeRouteLeg(leg) {
  if (!leg || typeof leg !== 'object') return null;
  const out = {};
  assignString(out, 'from', leg.from);
  assignString(out, 'to', leg.to);
  if (!out.from || !out.to) return null;
  assignString(out, 'via', leg.via);
  assignNumber(out, 'fuel', leg.fuel);
  assignNumber(out, 'charge', leg.charge);
  assignNumber(out, 'interdict', leg.interdict);
  return out;
}

function normalizeWaypoint(waypoint, state) {
  if (!waypoint || typeof waypoint !== 'object') return null;
  const out = {};
  for (const key of [
    'kind', 'missionId', 'missionType', 'targetEntityId', 'stationId', 'stationName',
    'commodityId', 'label', 'reason', 'sectorId', 'sectorName',
  ]) {
    assignString(out, key, waypoint[key]);
  }
  assignNumber(out, 'storyBeat', waypoint.storyBeat);
  if (waypoint.onboarding === true) out.onboarding = true;

  const pos = normalizePos(waypoint.pos) || (out.stationId ? liveStationPos(state, out.stationId) : null);
  if (pos) out.pos = pos;

  return Object.keys(out).length ? out : null;
}

function liveStationPos(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  const byStationId = index && index.byStationId;
  const indexed = byStationId && byStationId.get && byStationId.get(stationId);
  if (indexed && indexed.alive !== false && indexed.pos) return normalizePos(indexed.pos);
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.type !== 'station' || !entity.pos) continue;
    const data = entity.data || {};
    if (data.stationId === stationId) return normalizePos(entity.pos);
  }
  return null;
}

function normalizePos(pos) {
  if (!pos || typeof pos !== 'object') return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function assignString(out, key, value) {
  if (value == null) return;
  const text = String(value);
  if (text) out[key] = text;
}

function assignNumber(out, key, value) {
  const n = Number(value);
  if (Number.isFinite(n)) out[key] = n;
}

function nowMs() {
  if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
