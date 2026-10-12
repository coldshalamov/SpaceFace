// Failure-only, observer-only evidence for station arrival and mission-board handoffs.
// Keep this collector self-contained: Playwright serializes it into the page realm.
export function collectStationHandoffSnapshot() {
  const text = (v, cap = 200) => typeof v === 'string' ? v.slice(0, cap) : null;
  const number = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const bool = (v) => typeof v === 'boolean' ? v : null;
  const id = (v) => typeof v === 'string' ? text(v) : number(v);
  const sf = window.SF;
  const state = sf?.state;
  const ui = sf?.registry?.get?.('ui');
  const player = state?.entities?.get?.(state.playerId);
  const inspect = (el) => {
    if (!el) return { present: false };
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { present: true, connected: bool(el.isConnected), hidden: bool(el.hidden),
      inert: bool(el.inert), ariaHidden: text(el.getAttribute('aria-hidden')),
      display: text(style.display), visibility: text(style.visibility), opacity: text(style.opacity),
      rect: { x: number(rect.x), y: number(rect.y), width: number(rect.width), height: number(rect.height) } };
  };
  const roots = [...document.querySelectorAll('[data-screen="station"]')];
  const root = roots[0];
  const board = state?.missions?.boards?.[state?.ui?.dockedStationId];
  const slots = Array.isArray(board?.slots) ? board.slots : [];
  let lane = null;
  let laneDiagnosticError = null;
  try {
    const d = typeof sf?.simLaneDiag === 'function' ? sf.simLaneDiag() : null;
    if (d) {
      lane = { lane: text(d.lane), closed: bool(d.closed), ready: bool(d.laneReady),
        replyCount: number(d.replyCount), postedDirectives: number(d.postedDirectives),
        inFlight: bool(d.inFlight), pendingRpcs: number(d.pendingRpcs), error: text(d.error, 1000),
        domainAppliedKeys: Object.fromEntries(Object.entries(d.domainAppliedKeys || {})
          .filter(([key]) => /^(missions(?:\.|$)|ui\.(docked|dockedStationId)$)/.test(key))
          .slice(0, 64).map(([key, count]) => [key.slice(0, 200), number(count)])) };
    }
  } catch (error) { laneDiagnosticError = text(error?.message, 300); }
  return {
    mode: text(state?.mode), tick: number(state?.tick), simTime: number(state?.simTime),
    requestedLane: text(sf?.ctx?.simLane), lane, laneDiagnosticError,
    player: player ? { id: id(player.id), alive: bool(player.alive), hull: number(player.hull) } : null,
    docked: bool(state?.ui?.docked), dockedStationId: id(state?.ui?.dockedStationId),
    screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice(0, 16).map(id) : null,
    topScreen: id(ui?.screenManager?.top?.()), stationRegistered: bool(ui?._registeredScreens?.has?.('station')),
    frameErrors: number(ui?._fe), stationRootCount: roots.length,
    stationRoots: roots.slice(0, 4).map(inspect),
    dock: inspect(root?.querySelector('.sx-dock')), contracts: inspect(root?.querySelector('.sx-ct')),
    operation: text(root?.getAttribute('data-operation')), view: text(root?.getAttribute('data-view')),
    boardPresent: Array.isArray(board?.slots), boardCount: slots.length,
    postedIds: slots.slice(0, 64).map((row) => id(row?.id)),
    renderedRows: [...(root?.querySelectorAll('.sx-ct-row') || [])].slice(0, 64)
      .map((row) => ({ missionId: text(row.getAttribute('data-mid')),
        decisionId: text(row.getAttribute('data-adventure-id')), connected: bool(row.isConnected) })),
    recentLaneEvents: Array.isArray(window.__SF_LANE_APPLIED)
      ? window.__SF_LANE_APPLIED.slice(-16).map((row) => text(typeof row === 'string' ? row : row?.type)) : [],
  };
}

export async function reportStationHandoffFailure(page, context, issues, originalError) {
  let timer;
  try {
    const snapshot = await Promise.race([
      page.evaluate(collectStationHandoffSnapshot),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('station handoff snapshot exceeded 2000ms')), 2000);
      }),
    ]);
    // Only bounded existing diagnostic fields, never request headers, bodies, storage or saves.
    const recent = (rows) => (Array.isArray(rows) ? rows : []).slice(-8).map((row) => ({
      type: String(row.type || '').slice(0, 40), text: String(row.text || '').slice(0, 1200),
      at: String(row.at || '').slice(0, 80), method: String(row.method || '').slice(0, 16),
    }));
    console.error('[station-handoff] snapshot:', JSON.stringify({ ...context, ...snapshot,
      pageErrors: recent(issues.errorIssues()), pageWarnings: recent(issues.warningIssues()) }));
  } catch (error) {
    try { console.error('[station-handoff] snapshot unavailable:', error?.message); } catch (_) { /* preserve failure */ }
  } finally { clearTimeout(timer); }
  throw originalError;
}
