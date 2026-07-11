// src/ui/mapAuthority.js — single normal-player map open path.
//
// All player-facing map openers (keyboard N/M, gamepad View, touch Local/Star, Mission Log,
// station route CTAs, legacy starmap objective CTAs) route through openGalaxyMap(). Semantic
// LOCAL vs STAR/GALAXY intent is preserved as explicit focus/zoom data consumed by galaxyMap
// onShow — legacy localmap/starmap screens stay registered for tools/checks but are not the
// normal-player surface.

export const MAP_SCREEN_ID = 'galaxyMap';

/** Discrete initial focus levels consumed by galaxyMap (see levelForZoom thresholds). */
export const MAP_FOCUS = Object.freeze({
  LOCAL: 'local',
  SYSTEM: 'system',
  GALAXY: 'galaxy',
});

/**
 * Normalize a free-form focus token to MAP_FOCUS.
 * Accepts product vocabulary: local / localmap, system, galaxy / star / starmap / nav.
 */
export function normalizeMapFocus(focus) {
  const f = String(focus || '').toLowerCase().trim();
  if (f === MAP_FOCUS.LOCAL || f === 'localmap' || f === 'near' || f === 'sector-local') {
    return MAP_FOCUS.LOCAL;
  }
  if (f === MAP_FOCUS.SYSTEM || f === 'sector') {
    return MAP_FOCUS.SYSTEM;
  }
  if (
    f === MAP_FOCUS.GALAXY
    || f === 'star'
    || f === 'starmap'
    || f === 'nav'
    || f === 'chart'
    || f === 'sector-graph'
  ) {
    return MAP_FOCUS.GALAXY;
  }
  return MAP_FOCUS.SYSTEM;
}

/** Map legacy screen ids (localmap/starmap) onto the unified focus vocabulary. */
export function focusFromLegacyScreenId(screenId) {
  const id = String(screenId || '');
  if (id === 'localmap') return MAP_FOCUS.LOCAL;
  if (id === 'starmap') return MAP_FOCUS.GALAXY;
  if (id === MAP_SCREEN_ID || id === 'galaxyMap') return MAP_FOCUS.SYSTEM;
  return MAP_FOCUS.SYSTEM;
}

function copyPos(pos) {
  if (!pos || typeof pos !== 'object') return null;
  const x = Number(pos.x);
  const z = Number(pos.z != null ? pos.z : pos.y);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

/**
 * Normalize an open-intent payload. If `screenId` is a legacy map id and focus is omitted,
 * focus is derived from that id so older call sites keep semantic meaning.
 */
export function normalizeMapOpenIntent(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let focus = src.focus;
  if (focus == null && src.screenId) focus = focusFromLegacyScreenId(src.screenId);
  return {
    focus: normalizeMapFocus(focus),
    sectorId: src.sectorId != null ? String(src.sectorId) : null,
    missionId: src.missionId != null ? String(src.missionId) : null,
    stationId: src.stationId != null ? String(src.stationId) : null,
    pos: copyPos(src.pos),
    label: src.label != null ? String(src.label) : null,
    source: src.source != null ? String(src.source) : null,
  };
}

/** Write intent onto state.ui for galaxyMap.onShow to consume (one-shot). */
export function setMapOpenIntent(state, intent) {
  if (!state) return null;
  if (!state.ui) state.ui = {};
  const normalized = normalizeMapOpenIntent(intent || {});
  state.ui.mapOpenIntent = normalized;
  return normalized;
}

/** Read and clear the pending open intent. */
export function takeMapOpenIntent(state) {
  if (!state || !state.ui) return null;
  const intent = state.ui.mapOpenIntent || null;
  state.ui.mapOpenIntent = null;
  return intent ? normalizeMapOpenIntent(intent) : null;
}

/** Peek without clearing (tests / debug). */
export function peekMapOpenIntent(state) {
  if (!state || !state.ui || !state.ui.mapOpenIntent) return null;
  return normalizeMapOpenIntent(state.ui.mapOpenIntent);
}

function resolveScreenManager(ctx) {
  if (!ctx) return null;
  if (ctx.screenManager && typeof ctx.screenManager.pushScreen === 'function') return ctx.screenManager;
  if (ctx.screens && typeof ctx.screens.pushScreen === 'function') return ctx.screens;
  return null;
}

/**
 * Open the single normal-player map surface with optional focus/target intent.
 * Does not mutate sim owners — only writes transient ui.mapOpenIntent + pushes the screen.
 */
export function openGalaxyMap(ctx, intent = {}) {
  if (!ctx) return false;
  setMapOpenIntent(ctx.state, { source: intent && intent.source, ...intent });
  const mgr = resolveScreenManager(ctx);
  if (mgr) {
    if (typeof mgr.top === 'function' && mgr.top() === MAP_SCREEN_ID) {
      // Re-apply focus when the map is already topmost (e.g. Mission Log CTA while map is open).
      const def = typeof mgr.getActiveScreenDef === 'function' ? mgr.getActiveScreenDef() : null;
      if (def && typeof def.onShow === 'function') {
        try { def.onShow(ctx); } catch (e) { console.error('[mapAuthority] re-show galaxyMap', e); }
      }
      if (def && typeof def.refresh === 'function') {
        try { def.refresh(ctx); } catch (e) { console.error('[mapAuthority] refresh galaxyMap', e); }
      }
      return true;
    }
    mgr.pushScreen(MAP_SCREEN_ID);
    return true;
  }
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('ui:pushScreen', { id: MAP_SCREEN_ID });
    return true;
  }
  return false;
}

/**
 * Build a player-facing map handoff action that always targets galaxyMap while retaining
 * LOCAL MAP / STAR MAP labels from the existing product vocabulary.
 */
export function mapHandoffAction({
  focus,
  label,
  title,
  body,
  missionId = null,
  sectorId = null,
  stationId = null,
  pos = null,
  source = null,
} = {}) {
  const f = normalizeMapFocus(focus);
  const isLocal = f === MAP_FOCUS.LOCAL;
  return {
    screenId: MAP_SCREEN_ID,
    focus: f,
    label: label || (isLocal ? 'LOCAL MAP' : 'STAR MAP'),
    title: title || (isLocal ? 'Open Local Map' : 'Open Star Map'),
    body: body || (isLocal
      ? 'Show the live objective marker and nearby contacts.'
      : 'Plot or review the jump route to this objective.'),
    missionId: missionId != null ? String(missionId) : null,
    sectorId: sectorId != null ? String(sectorId) : null,
    stationId: stationId != null ? String(stationId) : null,
    pos: copyPos(pos),
    source: source || null,
  };
}

/** True when a screen id is any map surface (unified or legacy). */
export function isMapScreenId(id) {
  return id === MAP_SCREEN_ID || id === 'localmap' || id === 'starmap';
}
