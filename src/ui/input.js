// UI key router (ARCHITECTURE §5.6) — a single document keydown listener for UI-OWNED keys.
//
// UI owns: ESC (back/pause), M (star-map), T (tech), J (mission log), F1/H (help),
//          Tab (cycle target), P (pause), Enter (dock when in range), F5/F9 (quick save/load),
//          mouse-wheel (camera zoom passthrough → camera:zoom).
// Flight/input system owns movement+fire keys (W/A/S/D, mouse-aim, Space/LMB, RMB, Q/E, F) — NOT here.
//
// Routing rule: if a modal screen is open and it has a key handler, route there first
// (ESC always = back). Otherwise translate UI-owned keys into intent events / screen pushes.
// The UI never mutates sim state; docking sets ui.docked + emits dock:docked + pushes 'station'.

import { isConfirmOpen } from './confirm.js';

export function createUiInput(ctx, screenManager) {
  const { state, bus } = ctx;
  const gp = ctx.gamepad;
  let dockInRange = false;
  let dockStationId = null;

  // Gamepad UI navigation state.
  const _nav = {
    up: false, down: false, left: false, right: false,
    holdT: 0,
    repeatT: 0,
    initialDelay: 0.36,
    repeatDelay: 0.12,
  };

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

    // If a shared confirm dialog is open (UX-2), let it own ALL keys — its own handler traps
    // Esc/Enter/Tab. Bail here so the modal screen underneath doesn't also react to the keystroke.
    if (isConfirmOpen()) { ev.preventDefault(); return; }

    // --- if a modal is open, route to its handler, ESC = back ---
    if (modalOpen) {
      bus.emit('ui:closeCargo');
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
        ev.preventDefault(); screenManager.pushScreen('missionLog'); return;
      case 'F1': case 'h': case 'H':
        ev.preventDefault(); screenManager.pushScreen('help'); return;
      case 'Tab':
        ev.preventDefault();
        bus.emit('ui:cycleTarget', { dir: ev.shiftKey ? -1 : 1 });
        return;
      case 'Enter':
        if (dockInRange) { ev.preventDefault(); doDock(); }
        return;
      case 'F7': {
        // Collision / socket / landing-contact debug overlay toggle (graphics spec §12.5).
        ev.preventDefault();
        const dbg = state.render && state.render.debug;
        if (dbg) { const on = dbg.toggle(); bus.emit('audio:cue', { id: on ? 'ui_open' : 'ui_back' }); }
        return;
      }
      case 'b': case 'B':
        // Drill lens (V2 §7 / cut-list #27): open the ant-farm mining screen on the targeted
        // asteroid (or the mining system's soft-locked one). Bails with a toast if no asteroid.
        ev.preventDefault();
        openDrill();
        return;
      case 'i': case 'I':
        ev.preventDefault();
        bus.emit('ui:toggleCargo');
        return;
      case 'l': case 'L':
        // Comms log (narrative overlay): open the channel backlog. 'L' for Log. The feed itself
        // streams on the left edge continuously; this opens the full searchable history.
        ev.preventDefault();
        bus.emit('ui:toggleComms');
        return;
      case 'c': case 'C':
        // Claim a body (V2 §6 / M3): claim the nearest claimable POI in range, or open the Base
        // screen for an already-claimed body to build modules / teleport.
        ev.preventDefault();
        claimOrOpenBase();
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

  // V2 §6 / M3: claim the nearest claimable body POI in range, or — if the player is near an
  // already-claimed body — open the Base screen to build modules / teleport. Bails with a toast
  // if no claimable POI is nearby.
  function claimOrOpenBase() {
    const claimsSys = ctx.registry && ctx.registry.get('claims');
    if (!claimsSys) return;
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const RANGE = 220;
    // find claimable POI entities in range
    let nearest = null, bestD = RANGE * RANGE;
    for (const e of state.entityList) {
      if (!e.alive || !e.data || !e.data.poi || !e.data.claimable) continue;
      const d = (e.pos.x - player.pos.x) ** 2 + (e.pos.z - player.pos.z) ** 2;
      if (d < bestD) { bestD = d; nearest = e; }
    }
    if (!nearest) {
      bus.emit('toast', { text: 'No claimable body in range — fly near a colony/moon and press C', kind: 'warn', ttl: 3 });
      return;
    }
    const poiDef = {
      id: nearest.data.poiId,
      name: nearest.data.name,
      size: nearest.data.size || 'M',
      pos: { x: nearest.pos.x, z: nearest.pos.z },
    };
    // already claimed? open the Base screen for it
    if (claimsSys.isClaimed(poiDef.id)) {
      if (!state.ui) state.ui = {};
      state.ui.pendingClaimBodyId = (claimsSys.list().find((b) => b.poiId === poiDef.id) || {}).id;
      if (screenManager.hasScreen && screenManager.hasScreen('base')) {
        screenManager.pushScreen('base');
      } else {
        bus.emit('toast', { text: 'Body claimed. (Base screen coming soon — refinery auto-runs, teleporter ready.)', kind: 'info', ttl: 4 });
      }
      return;
    }
    // claim it (the system validates credits + emits feedback)
    claimsSys.claim(poiDef);
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

  // ---- gamepad UI layer -----------------------------------------------------

  function getGamepadConfig() {
    return (state.settings && state.settings.controls && state.settings.controls.gamepad) || {};
  }

  function focusableInside(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => {
      if (el.disabled) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const t = el.getAttribute('tabindex');
      if (t != null && Number(t) < 0) return false;
      let p = el;
      while (p && p !== root) {
        if (p.style && p.style.display === 'none') return false;
        p = p.parentNode;
      }
      return true;
    });
  }

  function activeScreenEl() {
    const screensRoot = document.getElementById('screens');
    if (!screensRoot) return null;
    for (const el of screensRoot.querySelectorAll('.screen')) {
      if (el.style.display !== 'none') return el;
    }
    return null;
  }

  function moveFocus(dir) {
    const root = activeScreenEl();
    const items = focusableInside(root);
    if (!items.length) return;
    const active = document.activeElement;
    let idx = items.indexOf(active);
    if (idx < 0) idx = 0;
    const delta = dir === 'up' || dir === 'left' ? -1 : 1;
    const next = (idx + delta + items.length) % items.length;
    try { items[next].focus(); } catch (e) {}
  }

  function activateFocused() {
    const root = activeScreenEl();
    const active = document.activeElement;
    if (!active || !root || !root.contains(active)) return;
    if (typeof active.click === 'function') active.click();
    else {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    }
  }

  function handleGamepadUi(dt) {
    if (!gp || !gp.isConnected()) return;
    const cfg = getGamepadConfig();
    if (cfg.enabled === false) return;

    const modalOpen = screenManager.isOpen();
    const top = modalOpen && screenManager.top ? screenManager.top() : null;

    // Navigation: D-pad or left stick. Use a simple repeat timer.
    const dz = typeof cfg.deadzone === 'number' ? cfg.deadzone : 0.12;
    const navNow = {
      up: gp.axes.leftY < -dz,
      down: gp.axes.leftY > dz,
      left: gp.axes.leftX < -dz,
      right: gp.axes.leftX > dz,
    };
    // D-pad overrides / extends stick navigation.
    const dpad = gp.actions || {};
    // d-pad buttons are not in the action map, read raw pad state via getGamepad? We don't expose
    // raw button array, so we expose them as pseudo actions on the gamepad object for convenience.
    // Since gamepad.js does not export dpad actions, read from the connected pad directly.
    const rawPad = getRawPad();
    if (rawPad) {
      if (rawPad.buttons[12] && rawPad.buttons[12].pressed) navNow.up = true;
      if (rawPad.buttons[13] && rawPad.buttons[13].pressed) navNow.down = true;
      if (rawPad.buttons[14] && rawPad.buttons[14].pressed) navNow.left = true;
      if (rawPad.buttons[15] && rawPad.buttons[15].pressed) navNow.right = true;
    }

    if (modalOpen) {
      if (isConfirmOpen()) return; // confirm dialog traps all keys/buttons

      // Accept / Cancel (A / B).
      if (gp.actions.accept && gp.actions.accept.pressed) {
        activateFocused();
        bus.emit('ui:confirm', {});
        bus.emit('audio:cue', { id: 'ui_confirm' });
      }
      if (gp.actions.cancel && gp.actions.cancel.pressed) {
        const def = screenManager.getActiveScreenDef && screenManager.getActiveScreenDef();
        if (def && def.id === 'station') undock();
        else if (!screenManager.locked || !screenManager.locked()) screenManager.popScreen();
        bus.emit('ui:cancel', {});
        bus.emit('audio:cue', { id: 'ui_back' });
      }

      // Direction repeat handling.
      let moved = false;
      for (const d of ['up', 'down', 'left', 'right']) {
        if (navNow[d]) {
          if (!_nav[d]) {
            moveFocus(d);
            moved = true;
            _nav.holdT = 0;
            _nav.repeatT = 0;
          } else {
            _nav.holdT += dt;
            if (_nav.holdT >= _nav.initialDelay + _nav.repeatT) {
              _nav.repeatT += _nav.repeatDelay;
              moveFocus(d);
              moved = true;
            }
          }
        }
        _nav[d] = navNow[d];
      }
      if (moved) {
        bus.emit('ui:navigate', {});
        bus.emit('audio:cue', { id: 'hover' });
      }
    }

    // Global UI actions when no modal is open (mode must be flight).
    if (!modalOpen && state.mode === 'flight') {
      if (gp.actions.pause && gp.actions.pause.pressed) {
        screenManager.pushScreen('pause');
        bus.emit('audio:cue', { id: 'ui_open' });
      }
      if (gp.actions.map && gp.actions.map.pressed) {
        screenManager.pushScreen('starmap');
      }
      if (gp.actions.codex && gp.actions.codex.pressed) {
        screenManager.pushScreen('help');
      }
      if (gp.actions.cycleTarget && gp.actions.cycleTarget.pressed) {
        bus.emit('ui:cycleTarget', { dir: 1 });
      }
    }

    // Start toggles pause even when the pause menu itself is open.
    if (top === 'pause' && gp.actions.pause && gp.actions.pause.pressed) {
      screenManager.popScreen();
      bus.emit('audio:cue', { id: 'ui_back' });
    }
  }

  function getRawPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) return p;
    }
    return null;
  }

  function tick(dt) {
    // Poll the gamepad whenever the sim is not stepping in flight so menus stay navigable.
    if (gp && (state.mode !== 'flight' || state.timeScale === 0)) {
      gp.tick(dt);
    }
    handleGamepadUi(dt);
  }

  return {
    doDock, undock, tick,
    dispose() { document.removeEventListener('keydown', onKeyDown); window.removeEventListener('wheel', onWheel); },
  };
}
