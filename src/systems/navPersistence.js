// src/systems/navPersistence.js — save/resume continuity for player navigation.
//
// The save core owns envelopes and validation; this small adapter owns the navigation edge that sits
// between mission tracking, Market "Load & Nav", starmap routes, HUD arrows, and Departure Check.
// It is deliberately non-visual and patches the save system at init time so route guidance survives
// quick-save/Continue without touching the graphics lane or branching browser/Electron/package paths.

export const navPersistence = {
  name: 'navPersistence',

  init(ctx) {
    const save = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('save');
    if (!save || save._navPersistencePatched) return;
    const originalSerializeData = save.serializeData;
    const originalRestore = save._restore;
    if (typeof originalSerializeData !== 'function' || typeof originalRestore !== 'function') return;

    save._navPersistencePatched = true;

    save.serializeData = function serializeDataWithNav() {
      const data = originalSerializeData.call(this);
      data.nav = serializeNavState(this.state && this.state.nav);
      return data;
    };

    save._restore = function restoreWithNav(data, slot) {
      const savedNav = data && typeof data === 'object' && 'nav' in data
        ? normalizeNavSaveRecord(data.nav)
        : null;
      originalRestore.call(this, data, slot);
      const restoredWaypoint = applyRestoredNav(this.state, savedNav);
      if (restoredWaypoint && this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('nav:waypoint', restoredWaypoint);
      }
    };
  },
};

function serializeNavState(nav) {
  return normalizeNavSaveRecord({
    route: clonePlain(nav && nav.route) || null,
    autoTravel: !!(nav && nav.autoTravel),
    waypoint: normalizeWaypoint(nav && nav.waypoint),
  });
}

function applyRestoredNav(state, savedNav) {
  if (!state || !savedNav) return null;
  state.nav = Object.assign({ route: null, autoTravel: false, waypoint: null }, state.nav || {});
  state.nav.route = savedNav.route || null;
  state.nav.autoTravel = !!savedNav.autoTravel;
  if (savedNav.waypoint) {
    state.nav.waypoint = savedNav.waypoint;
    return savedNav.waypoint;
  }
  return null;
}

function normalizeNavSaveRecord(nav) {
  if (!nav || typeof nav !== 'object' || Array.isArray(nav)) {
    return { route: null, autoTravel: false, waypoint: null };
  }
  return {
    route: clonePlain(nav.route) || null,
    autoTravel: !!nav.autoTravel,
    waypoint: normalizeWaypoint(nav.waypoint),
  };
}

function normalizeWaypoint(waypoint) {
  if (!waypoint || typeof waypoint !== 'object' || Array.isArray(waypoint)) return null;
  const out = clonePlain(waypoint);
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
  if (out.pos) {
    const pos = normalizePos(out.pos);
    if (pos) out.pos = pos;
    else delete out.pos;
  }
  return Object.keys(out).length ? out : null;
}

function normalizePos(pos) {
  if (!pos || typeof pos !== 'object') return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function clonePlain(value) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'function') return undefined;
  if (Array.isArray(value)) return value.map(clonePlain).filter((v) => v !== undefined);
  if (t === 'object') {
    if (value.isVector3) return normalizePos(value);
    if (value.isObject3D || value.isMesh || value instanceof Map || value instanceof Set) return undefined;
    const out = {};
    for (const key of Object.keys(value)) {
      const cloned = clonePlain(value[key]);
      if (cloned !== undefined) out[key] = cloned;
    }
    return out;
  }
  return undefined;
}
