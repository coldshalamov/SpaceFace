// UI key router (ARCHITECTURE §5.6) — a single document keydown listener for UI-OWNED keys.
//
// UI owns: ESC (back/pause), M (star-map), T (tech), J (missions journal), F1/H (help),
//          Tab (cycle target), P (pause), Enter (dock when in range), F5/F9 (quick save/load),
//          mouse-wheel (camera zoom passthrough → camera:zoom).
// Flight/input system owns movement+fire keys (W/A/S/D, mouse-aim, Space/LMB, RMB, Q/E, F) — NOT here.
//
// Routing rule: if a modal screen is open and it has a key handler, route there first
// (ESC always = back). Otherwise translate UI-owned keys into intent events / screen pushes.
// The UI never mutates sim state; docking sets ui.docked + emits dock:docked + pushes 'station'.

export function createUiInput(ctx, screenManager) {
  const { state, bus } = ctx;
  let dockInRange = false;
  let dockStationId = null;

  // physics emits dock:range while the player is near a station
  bus.on('dock:range', ({ stationId, inRange }) => {
    dockInRange = !!inRange;
    dockStationId = inRange ? stationId : null;
  });
  bus.on('dock:undocked', () => { /* HUD restoration handled in uiRoot */ });

  // Emit the dock intent; uiRoot's dock:docked handler owns setting ui.docked + pushing the
  // station hub (single owner of the flight→dock transition, avoids a double-push).
  function doDock() {
    if (!dockInRange || state.ui.docked) return;
    state.ui.activeStationTab = state.ui.activeStationTab || 'market';
    bus.emit('dock:docked', { stationId: dockStationId });
    bus.emit('audio:cue', { id: 'ui_dock' });
  }

  function onKeyDown(ev) {
    // never intercept typing into inputs/textareas
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    const key = ev.key;
    const code = ev.code;
    const modalOpen = screenManager.isOpen();

    // --- if a modal is open, route to its handler, ESC = back ---
    if (modalOpen) {
      const def = screenManager.getActiveScreenDef();
      if (key === 'Escape') {
        ev.preventDefault();
        if (def && def.data && def.data.locked) return; // mid-transaction confirm traps ESC
        // Undock if leaving the station hub
        if (def && def.id === 'station') undock();
        else screenManager.popScreen();
        bus.emit('audio:cue', { id: 'ui_back' });
        return;
      }
      if (def && typeof def.onKey === 'function') {
        try { if (def.onKey(ev, ctx) === true) { ev.preventDefault(); return; } }
        catch (e) { console.error('[uiInput] screen onKey error:', e); }
      }
      // global quick-save/load still work over a modal
      if (key === 'F5') { ev.preventDefault(); bus.emit('game:save', { slot: 'quick' }); return; }
      if (key === 'F9') { ev.preventDefault(); bus.emit('game:load', { slot: 'quick' }); return; }
      return;
    }

    // --- pure flight: UI-owned global keys only (mode must be flight) ---
    if (state.mode !== 'flight') return;

    switch (key) {
      case 'Escape':
      case 'p': case 'P':
        ev.preventDefault();
        screenManager.pushScreen('pause');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      case 'm': case 'M':
        ev.preventDefault(); screenManager.pushScreen('starmap'); return;
      case 't': case 'T':
        ev.preventDefault(); screenManager.pushScreen('techTree'); return;
      case 'j': case 'J':
        ev.preventDefault(); screenManager.pushScreen('automation'); return;
      case 'F1': case 'h': case 'H':
        ev.preventDefault(); screenManager.pushScreen('help'); return;
      case 'Tab':
        ev.preventDefault();
        bus.emit('ui:cycleTarget', { dir: ev.shiftKey ? -1 : 1 });
        return;
      case 'Enter':
        if (dockInRange) { ev.preventDefault(); doDock(); }
        return;
      case 'b': case 'B':
        // Drill lens (V2 §7 / cut-list #27): open the ant-farm mining screen on the targeted
        // asteroid (or the mining system's soft-locked one). Bails with a toast if no asteroid.
        ev.preventDefault();
        openDrill();
        return;
      case 'F5':
        ev.preventDefault(); bus.emit('game:save', { slot: 'quick' }); return;
      case 'F9':
        ev.preventDefault(); bus.emit('game:load', { slot: 'quick' }); return;
      default:
        // '+'/'-' zoom shortcuts (camera passthrough)
        if (code === 'Equal' || code === 'NumpadAdd') { bus.emit('camera:zoom', { delta: -8 }); }
        else if (code === 'Minus' || code === 'NumpadSubtract') { bus.emit('camera:zoom', { delta: 8 }); }
        return;
    }
  }

  // Resolve a drillable asteroid: player's selected target (if it's an asteroid), else the mining
  // system's soft-locked asteroid. Sets the pending id and pushes the drill screen.
  function openDrill() {
    let astId = null;
    const tid = state.player.targetId;
    if (tid != null) {
      const t = state.entities.get(tid);
      if (t && t.type === 'asteroid' && t.alive) astId = t.id;
    }
    if (astId == null) {
      // fall back to the mining system's soft-lock
      const mining = ctx.registry && ctx.registry.get('mining');
      if (mining && mining._lockTargetId) {
        const t = state.entities.get(mining._lockTargetId);
        if (t && t.type === 'asteroid' && t.alive) astId = t.id;
      }
    }
    if (astId == null) {
      bus.emit('toast', { text: 'No asteroid targeted — target a rock and press B to drill', kind: 'warn', ttl: 3 });
      return;
    }
    if (!state.ui) state.ui = {};
    state.ui.pendingDrillAsteroidId = astId;
    screenManager.pushScreen('drill');
    bus.emit('audio:cue', { id: 'ui_open' });
  }

  // Emit the intent only; uiRoot's dock:undocked handler owns clearing ui.docked and popping
  // the station hub (single owner of the dock→HUD transition, avoids a double-pop).
  function undock() {
    if (!state.ui.docked) { screenManager.popScreen(); return; }
    bus.emit('dock:undocked', {});
  }

  // mouse-wheel zoom passthrough (only in flight, not over a modal)
  function onWheel(ev) {
    if (screenManager.isOpen() || state.ui.docked || state.mode !== 'flight') return;
    bus.emit('camera:zoom', { delta: Math.sign(ev.deltaY) * 8 });
  }

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('wheel', onWheel, { passive: true });

  // let other modules (uiRoot Undock button) trigger an undock
  bus.on('ui:undock', undock);

  return {
    doDock, undock,
    dispose() { document.removeEventListener('keydown', onKeyDown); window.removeEventListener('wheel', onWheel); },
  };
}
