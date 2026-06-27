// src/systems/navPersistence.js — save/resume continuity for player navigation.
//
// The save core owns envelopes and validation; this adapter owns the small navigation bridge between
// mission tracking, Market "Load & Nav", starmap routes, HUD arrows, and Departure Check. It is
// deliberately non-visual and installs before save.init(), so the same save/load path works in
// browser, Electron, and packaged builds.

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
      const waypoint = applyRestoredNav(this.state, savedNav);
      if (waypoint && this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('nav:waypoint', waypoint);
      }
    };
  },
};

function serializeNavState(nav) {
  return normalizeNavSaveRecord({
    route: plainJson(nav && nav.route),
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
    route: plainJson(nav.route),
    autoTravel: !!nav.autoTravel,
    waypoint: normalizeWaypoint(nav.waypoint),
  };
}

function normalizeWaypoint(waypoint) {
  const out = plainJson(waypoint);
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
  if (out.pos) {
    const x = Number(out.pos.x);
    const z = Number(out.pos.z);
    if (Number.isFinite(x) && Number.isFinite(z)) out.pos = { x, z };
    else delete out.pos;
  }
  return Object.keys(out).length ? out : null;
}

function plainJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}
