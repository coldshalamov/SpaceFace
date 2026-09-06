// UI key router (ARCHITECTURE §5.6) — a single document keydown listener for UI-OWNED keys.
//
// UI owns: ESC (back/pause), map bindings, T (tech), mission log, K (codex), F1/H (help),
//          Tab (cycle target), P (pause), E (dock in range / undock station hub; Enter secondary dock),
//          F5/F9 (quick save/load), cargo/comms overlays, mouse-wheel (camera zoom passthrough → camera:zoom).
// Flight/input system owns movement+fire keys (W/A/S/D, mouse-aim, Space/LMB, RMB, Q/E, F) — NOT here.
//
// Routing rule: if a modal screen is open and it has a key handler, route there first
// (ESC always = back). Otherwise translate UI-owned keys into intent events / screen pushes.
// The UI never mutates sim state; docking sets ui.docked + emits dock:docked + pushes 'station'.

import { isConfirmOpen, confirmGamepadAccept, confirmGamepadCancel } from './confirm.js';
import { BINDINGS } from './bindings.js';
import { resolveActionLabel, selectedWorldSiteTarget } from '../systems/input.js';
import { MAP_FOCUS, openGalaxyMap, isMapScreenId } from './mapAuthority.js';
import { interactionDisplayName, interactionProfileForEntity } from '../data/entityInteractionProfiles.js';
import { resolveDockDeny } from './dockDenyBanner.js';

const DRILL_MASSLINE_DEF_IDS = new Set(['tether_standard', 'attachment_massline']);

export function isUiInteractionFenced(state) {
  return !!(state && state.ui && state.ui.fulfillmentBlackoutActive === true);
}

// Controller focus follows the composed screen, not incidental DOM order. A directional move ranks
// only candidates that are physically in that direction, then prefers the shortest travel with a
// penalty for cross-axis drift.
export function spatialFocusTarget(items, active, dir) {
  if (!active || !items.includes(active) || typeof active.getBoundingClientRect !== 'function') return null;
  const origin = active.getBoundingClientRect();
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'left' || dir === 'up' ? -1 : 1;
  let best = null;
  let bestScore = Infinity;
  for (const candidate of items) {
    if (candidate === active || typeof candidate.getBoundingClientRect !== 'function') continue;
    const rect = candidate.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const dx = rect.left + rect.width / 2 - ox;
    const dy = rect.top + rect.height / 2 - oy;
    const primary = (horizontal ? dx : dy) * sign;
    if (primary <= 1) continue;
    const cross = Math.abs(horizontal ? dy : dx);
    const overlap = horizontal
      ? Math.max(0, Math.min(origin.bottom, rect.bottom) - Math.max(origin.top, rect.top))
      : Math.max(0, Math.min(origin.right, rect.right) - Math.max(origin.left, rect.left));
    const overlapBonus = overlap > 0 ? Math.min(42, overlap * 0.7) : 0;
    const score = primary + cross * 2.35 - overlapBonus;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

export function createUiInput(ctx, screenManager) {
  const { state, bus } = ctx;
  const gp = ctx.gamepad;
  let dockInRange = false;
  let dockStationId = null;
  const unsubscribers = [];

  // Gamepad UI navigation state.
  const _nav = {
    up: false, down: false, left: false, right: false,
    holdT: 0,
    repeatT: 0,
    initialDelay: 0.36,
    repeatDelay: 0.12,
  };

  // physics emits dock:range while the player is near a station
  unsubscribers.push(bus.on('dock:range', ({ stationId, inRange }) => {
    dockInRange = !!inRange;
    dockStationId = inRange ? stationId : null;
    // PQ-003 contextual A/Cross arbitration: UI owns docking when the prompt is live; the flight
    // input owner reads this UI-owned fact so the same press cannot also latch the Massline.
    if (!state.ui) state.ui = {};
    state.ui.dockInRange = dockInRange;
  }));
  unsubscribers.push(bus.on('dock:undocked', () => { /* HUD restoration handled in uiRoot */ }));

  // Emit the dock intent; uiRoot's dock:docked handler owns setting ui.docked + pushing the
  // station hub (single owner of the flight→dock transition, avoids a double-push).
  function doDock() {
    if (isUiInteractionFenced(state) || !dockInRange || (state.ui && state.ui.docked)) return;
    const attempt = { stationId: dockStationId };
    // Publish the attempt before deciding so the existing faction-voiced denial surface can explain
    // a refusal. The same pure selector is the command gate; a banner can never be the authority.
    bus.emit('dock:attempt', attempt);
    if (resolveDockDeny(state, dockStationId)) return;
    if (!state.ui) state.ui = {};
    state.ui.activeStationTab = state.ui.activeStationTab || 'market';
    bus.emit('dock:docked', attempt);
    bus.emit('audio:cue', { id: 'ui_dock' });
  }

  function matchesBinding(ev, binding) {
    const k = ev && ev.key;
    const code = ev && ev.code;
    const shiftMatches = !binding || binding.shift == null || !!(ev && ev.shiftKey) === !!binding.shift;
    return !!binding && shiftMatches && (k === binding.key || k === binding.label || code === binding.code);
  }

  function allowsMissionLogShortcut(def) {
    return !!def && (def.id === 'station' || def.id === 'pause');
  }

  function isTextEntryTarget(t) {
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  }

  function closeActiveModal(def) {
    const locked = (screenManager.locked && screenManager.locked()) || (def && def.data && def.data.locked);
    if (locked) return false; // root title / mid-transaction screens trap ESC
    if (def && def.id === 'station') undock();
    else screenManager.popScreen();
    bus.emit('audio:cue', { id: 'ui_back' });
    return true;
  }

  function onKeyDown(ev) {
    // Let text fields keep ordinary typing, but still honor universal modal escape below.
    const t = ev.target;
    const textEntry = isTextEntryTarget(t);

    const key = ev.key;
    const code = ev.code;
    const modalOpen = screenManager.isOpen();

    // Fulfillment transit is a deterministic simulation event, not a paused screen. It still owns
    // every player-facing command surface until the boarding FSM releases the wake_pending phase.
    if (isUiInteractionFenced(state)) { ev.preventDefault(); return; }

    // If a shared confirm dialog is open (UX-2), let it own ALL keys — its own handler traps
    // Esc/Enter/Tab. Bail here so the modal screen underneath doesn't also react to the keystroke.
    if (isConfirmOpen()) { ev.preventDefault(); return; }

    // --- if a modal is open, route to its handler, ESC = back ---
    if (modalOpen) {
      bus.emit('ui:closeCargo');
      const def = screenManager.getActiveScreenDef();
      if (key === 'Escape') {
        ev.preventDefault();
        closeActiveModal(def);
        return;
      }
      // Map toggle (M/N) must still close the map when search (or any text field) is focused.
      // Without this, open → autofocus/search → second M types "m" instead of toggling closed.
      // Escape already bypasses textEntry above; treat map bindings the same on map surfaces.
      const mapToggleWhileTyping = !!(
        textEntry
        && def
        && isMapScreenId(def.id)
        && (matchesBinding(ev, BINDINGS.starmap) || matchesBinding(ev, BINDINGS.localmap))
      );
      // F1 is not a text character; keep Help toggleable even from a search field.
      const helpToggleWhileTyping = !!(textEntry && def && def.id === 'help' && key === 'F1');
      if (textEntry && !mapToggleWhileTyping && !helpToggleWhileTyping) return;
      // Mirror the live interact binding while docked: E docks from flight and undocks from the
      // station hub, preserving one airlock muscle-memory action. Leave Enter alone here so focused
      // station buttons and rail tabs keep normal keyboard activation.
      if (def && def.id === 'station' && matchesBinding(ev, BINDINGS.dock)) {
        ev.preventDefault();
        undock();
        bus.emit('audio:cue', { id: 'ui_back' });
        return;
      }
      if (def && typeof def.onKey === 'function') {
        try { if (def.onKey(ev, ctx) === true) { ev.preventDefault(); return; } }
        catch (e) { console.error('[uiInput] screen onKey error:', e); }
      }
      // Repeat the open binding to close the same instrument (mission log already does this in
      // onKey; maps do it above). Without this, T/K/F1 open a screen they cannot close.
      if (def && def.id === 'techTree' && matchesBinding(ev, BINDINGS.techTree)) {
        ev.preventDefault();
        closeActiveModal(def);
        return;
      }
      if (def && def.id === 'codex' && matchesBinding(ev, BINDINGS.codex)) {
        ev.preventDefault();
        closeActiveModal(def);
        return;
      }
      if (def && def.id === 'help' && (key === 'F1' || key === 'h' || key === 'H')) {
        ev.preventDefault();
        closeActiveModal(def);
        return;
      }
      // The Pause menu labels Mission Log with the live binding. Keep that promise there and in
      // the station hub, without teaching root/title/setup modals to open an in-run objective log.
      if (allowsMissionLogShortcut(def) && matchesBinding(ev, BINDINGS.missionLog)) {
        ev.preventDefault();
        screenManager.pushScreen('missionLog');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      }
      if (def && def.id === 'station' && matchesBinding(ev, BINDINGS.codex)) {
        ev.preventDefault();
        screenManager.pushScreen('codex');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      }
      // global quick-save/load still work over a modal
      if (key === 'F5') { ev.preventDefault(); bus.emit('game:save', { slot: 'quick' }); return; }
      if (key === 'F9') { ev.preventDefault(); bus.emit('game:load', { slot: 'quick' }); return; }
      return;
    }

    if (textEntry) return;

    // --- pure flight: UI-owned global keys only (mode must be flight) ---
    if (state.mode !== 'flight') return;

    if (matchesBinding(ev, BINDINGS.band)) {
      ev.preventDefault();
      bus.emit('band:cycle', { source: 'keyboard' });
      return;
    }

    switch (key) {
      case 'Escape':
        if (state.ui && state.ui.commsBacklogOpen) {
          ev.preventDefault();
          bus.emit('ui:closeComms');
          return;
        }
        if (state.ui && state.ui.cargoPanelOpen) {
          ev.preventDefault();
          bus.emit('ui:closeCargo');
          return;
        }
        // fall through to Pause when no flight overlay owns Escape
      case 'p': case 'P':
        ev.preventDefault();
        screenManager.pushScreen('pause');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      // Map authority: M → galaxyMap LOCAL (near-field first); N → galaxyMap GALAXY (star chart).
      // Legacy localmap/starmap screens remain registered for tools/checks only.
      case BINDINGS.localmap.key:
      case BINDINGS.localmap.label:
        ev.preventDefault();
        openGalaxyMap({ state, bus, screenManager }, { focus: MAP_FOCUS.LOCAL, source: 'keyboard' });
        return;
      case BINDINGS.starmap.key:
      case BINDINGS.starmap.label:
        ev.preventDefault();
        openGalaxyMap({ state, bus, screenManager }, { focus: MAP_FOCUS.GALAXY, source: 'keyboard' });
        return;
      case BINDINGS.techTree.key:
      case BINDINGS.techTree.label:
        ev.preventDefault(); screenManager.pushScreen('techTree'); return;
      case BINDINGS.missionLog.key:
      case BINDINGS.missionLog.label:
        ev.preventDefault(); screenManager.pushScreen('missionLog'); return;
      case BINDINGS.codex.key:
      case 'K':
        ev.preventDefault(); screenManager.pushScreen('codex'); return;
      case 'F1': case 'h': case 'H':
        ev.preventDefault(); screenManager.pushScreen('help'); return;
      case 'Tab':
        ev.preventDefault();
        bus.emit('ui:cycleTarget', { dir: ev.shiftKey ? -1 : 1 });
        return;
      // Dock / interact: default binding is `E` (spec §15.4), sourced from the live binding
      // registry so the prompt and handler can never drift. Enter remains a secondary trigger.
      case BINDINGS.dock.key:
      case BINDINGS.dock.label:
      case 'Enter':
        if (dockInRange) {
          ev.preventDefault();
          // preventDefault() is NOT suppression in this codebase: the window-level flight adapter
          // (src/systems/input.js) never inspects defaultPrevented — its only gates are
          // modalInputActive / text-entry / ui-command targets. So the dock key also reached the
          // flight verbs, and since `strafeRight` is KeyE in both the pilot (default) and classic
          // schemes, pressing E to dock ALSO strafed the ship right, exactly while the player was
          // trying to hold a docking line. stopPropagation() from this document-level listener is
          // what actually keeps the window-level one from seeing it — the same idiom claimBase uses
          // a few cases above. No stuck-key risk: the flight adapter never sets KeyE down, so there
          // is nothing for keyup to clear, and out of dock range this case falls through untouched
          // so ordinary strafing is unaffected.
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
          doDock();
        }
        return;
      case 'F2':
        // THE SHIP (grammar §10.5 canonical key table; build map §11.3). Pausing by owner ruling —
        // full-depth strategic screen. F1 (help) and F7 (debug) are the adjacent literal precedents.
        ev.preventDefault();
        screenManager.pushScreen('ship');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      case 'F3':
        // THE FOOTPRINT (grammar §10.5; build map §11.12 J10). Pausing instrument, same ruling.
        ev.preventDefault();
        screenManager.pushScreen('footprint');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      case 'F4':
        // THE RANGE (grammar §10.5 / SCREENS_B §2): pausing playable teaching box.
        ev.preventDefault();
        screenManager.pushScreen('range');
        bus.emit('audio:cue', { id: 'ui_open' });
        return;
      case 'F7': {
        // Collision / socket / landing-contact debug overlay toggle (graphics spec §12.5).
        ev.preventDefault();
        const dbg = state.render && state.render.debug;
        if (dbg) { const on = dbg.toggle(); bus.emit('audio:cue', { id: on ? 'ui_open' : 'ui_back' }); }
        return;
      }
      case BINDINGS.drill.key:
      case BINDINGS.drill.label:
        // B is the rebindable contextual World Site beam while a site proxy is explicitly selected.
        // Leave the event unconsumed for the simulation input owner; ordinary asteroid B retains
        // the established drill-view behavior below.
        if (selectedWorldSiteTarget(state)) return;
        // Drill lens (V2 §7 / cut-list #27): open the ant-farm mining screen on the targeted
        // asteroid (or the mining system's soft-locked one). Bails with a toast if no asteroid.
        ev.preventDefault();
        openDrill();
        return;
      case BINDINGS.cargo.key:
      case BINDINGS.cargo.label:
        ev.preventDefault();
        bus.emit('ui:toggleCargo');
        return;
      case 'o': case 'O':
        ev.preventDefault();
        bus.emit('ui:toggleOverview');
        return;
      case BINDINGS.fleetCommand.key:
      case BINDINGS.fleetCommand.label:
        // Wingman command radial (Micro-Loops): pop the quick fleet-command wheel.
        ev.preventDefault();
        bus.emit('ui:wingmanRadial');
        return;
      case BINDINGS.comms.key:
      case BINDINGS.comms.label:
        // Comms log (narrative overlay): open the channel backlog. The feed itself
        // streams on the left edge continuously; this opens the full searchable history.
        ev.preventDefault();
        bus.emit('ui:toggleComms');
        return;
      case BINDINGS.claimBase.key:
      case BINDINGS.claimBase.label:
        // Claim a body (V2 §6 / M3): claim the nearest claimable POI in range, or open the Base
        // screen for an already-claimed body to build modules / teleport. In OPEN SPACE (no claimable
        // body) the UI router does NOT own the key — it falls through so the flight-input verb
        // `deployBeacon` (KeyU) drops a claim beacon. Keeps the claim shortcut from firing an accidental
        // action away from bodies (see check-claim-base-input) while preserving the beacon micro-loop.
        if (claimOrOpenBase()) {
          ev.preventDefault();
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        }
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

  function onBlackoutKeyDown(ev) {
    if (!isUiInteractionFenced(state)) return;
    ev.preventDefault();
    // Capture-phase ownership is required: ScreenManager's Tab trap is registered earlier on the
    // document bubble path, and preventDefault alone cannot stop focus or later UI command handlers.
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    else if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
  }

  function onBlackoutPointerEvent(ev) {
    if (!isUiInteractionFenced(state)) return;
    // The opaque overlay prevents ordinary hit-testing, but global/document listeners and the
    // native context menu still observe the event path. Own it in capture phase just like keys.
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    else if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
  }

  // Resolve a drillable asteroid: player's selected target (if it's an asteroid), else the mining
  // system's soft-locked asteroid. Checks range and triggers transition.
  function openDrill() {
    let astId = null;
    let activeTether = activeAsteroidDrillTether();
    if (activeTether) {
      const t = state.entities && state.entities.get ? state.entities.get(activeTether.targetId) : null;
      if (t && t.type === 'asteroid' && t.alive) astId = t.id;
    }

    // A live asteroid massline is the drill authority. Selection may change while latched, but it
    // must not redirect B into a wreck-help toast and steal the established drill action.
    const wreck = astId == null ? drillGuidanceWreck() : null;
    if (wreck) {
      const interaction = interactionProfileForEntity(wreck);
      if (interaction.hazardous) {
        bus.emit('toast', {
          text: 'Hazardous reactor wreck — it can explode if its reactor timer expires. '
            + `${BINDINGS.drill.label} drills asteroids; hold the mining control to salvage this wreck or tow it clear.`,
          kind: 'warn',
          ttl: 5,
        });
      } else {
        bus.emit('toast', {
          text: `${interactionDisplayName(wreck)} is salvage, not an asteroid. `
            + `${BINDINGS.drill.label} drills asteroids; hold the mining control to salvage this wreck.`,
          kind: 'info',
          ttl: 4,
        });
      }
      return;
    }

    const tid = state.player && state.player.targetId;
    if (astId == null && tid != null) {
      const t = state.entities && state.entities.get ? state.entities.get(tid) : null;
      if (t && t.type === 'asteroid' && t.alive) astId = t.id;
    }
    if (astId == null) {
      // fall back to the mining system's soft-lock
      const mining = ctx.registry && ctx.registry.get('mining');
      if (mining && mining._lockTargetId) {
        const t = state.entities && state.entities.get ? state.entities.get(mining._lockTargetId) : null;
        if (t && t.type === 'asteroid' && t.alive) astId = t.id;
      }
    }
    if (astId == null) {
      bus.emit('toast', { text: 'No asteroid targeted — target a rock and press ' + BINDINGS.drill.label + ' to drill', kind: 'warn', ttl: 3 });
      return;
    }

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const ast = state.entities && state.entities.get ? state.entities.get(astId) : null;
    if (player && player.pos && ast && ast.pos) {
      const dx = ast.pos.x - player.pos.x;
      const dz = ast.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const surfaceDist = Math.max(0, dist - (ast.radius || 0) - (player.radius || 0));
      if (surfaceDist > 220) {
        bus.emit('toast', { text: 'Too far to establish drill link! Fly closer to the asteroid.', kind: 'warn', ttl: 3 });
        return;
      }
    }

    // --- Massline Latch Check ---
    activeTether = activeTether && activeTether.targetId === astId ? activeTether : Object.values(state.combat?.attachments?.byId || {}).find(
      (att) => att.state === 'active' && att.ownerId === state.playerId && att.targetId === astId && DRILL_MASSLINE_DEF_IDS.has(att.defId)
    );
    if (!activeTether) {
      // Live tether binding label — never hard-code a latch key (rebinds / empty must not lie).
      const tetherKey = resolveActionLabel(state, 'tether');
      const latchHint = tetherKey
        ? `Launch a tether (${tetherKey}) to lock onto the asteroid first.`
        : 'Launch a tether to lock onto the asteroid first.';
      bus.emit('toast', { text: `No massline link! ${latchHint}`, kind: 'warn', ttl: 3.5 });
      return;
    }
    if (activeTether.defId !== 'tether_standard') {
      bus.emit('toast', {
        text: 'This legacy Massline has no drill winch. Relatch with the standard Massline to drill.',
        kind: 'warn',
        ttl: 4,
      });
      return;
    }

    // Request the fixed-tick tether owner to reel and settle the approach. UI observes the owner's
    // started/completed events for fade and screen presentation; it never moves the ship or line.
    bus.emit('drill:approachRequested', { asteroidId: astId, attachmentId: activeTether.id });
  }

  function drillGuidanceWreck() {
    const tid = state.player && state.player.targetId;
    if (tid != null) {
      const selected = state.entities && state.entities.get ? state.entities.get(tid) : null;
      if (selected && selected.alive) {
        const interaction = interactionProfileForEntity(selected);
        if (interaction.salvageable) return selected;
        if (interaction.drillable) return null;
      }
    }
    for (const attachment of Object.values(state.combat?.attachments?.byId || {})) {
      if (!attachment || attachment.state !== 'active' || attachment.ownerId !== state.playerId
        || !DRILL_MASSLINE_DEF_IDS.has(attachment.defId)) continue;
      const attached = state.entities && state.entities.get ? state.entities.get(attachment.targetId) : null;
      if (attached && attached.alive && interactionProfileForEntity(attached).salvageable) return attached;
    }
    return null;
  }

  function activeAsteroidDrillTether() {
    return Object.values(state.combat?.attachments?.byId || {}).find((att) => {
      if (!att || att.state !== 'active' || att.ownerId !== state.playerId || !DRILL_MASSLINE_DEF_IDS.has(att.defId)) return false;
      const target = state.entities && state.entities.get ? state.entities.get(att.targetId) : null;
      return !!(target && target.type === 'asteroid' && target.alive);
    }) || null;
  }

  // V2 §6 / M3: claim the nearest claimable body POI in range, or — if the player is near an
  // already-claimed body — open the Base screen to build modules / teleport. Bails with a toast
  // if no claimable POI is nearby.
  function openClaimedBase(body, opts = {}) {
    if (!body || !body.id) {
      bus.emit('toast', { text: 'Claim record not ready — try again in a moment', kind: 'warn', ttl: 3 });
      return true;
    }
    if (!state.ui) state.ui = {};
    state.ui.pendingClaimBodyId = body.id;
    if (screenManager.hasScreen && !screenManager.hasScreen('base')) {
      bus.emit('toast', { text: 'Base interface initializing — press ' + BINDINGS.claimBase.label + ' again in a moment', kind: 'info', ttl: 3 });
      return true;
    }
    screenManager.pushScreen('base');
    if (opts.audio !== false) bus.emit('audio:cue', { id: 'ui_open' });
    return true;
  }

  function claimOrOpenBase() {
    const claimsSys = ctx.registry && ctx.registry.get('claims');
    if (!claimsSys) return false;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos) return false;
    const RANGE = 220;
    // find claimable POI entities in range
    let nearest = null, bestD = RANGE * RANGE;
    for (const e of state.entityList || []) {
      if (!e || !e.alive || !e.data || !e.data.poi || !e.data.claimable || !e.pos) continue;
      const d = (e.pos.x - player.pos.x) ** 2 + (e.pos.z - player.pos.z) ** 2;
      if (d < bestD) { bestD = d; nearest = e; }
    }
    if (!nearest) return false;
    const poiDef = {
      id: nearest.data.poiId,
      name: nearest.data.name,
      size: nearest.data.size || 'M',
      pos: { x: nearest.pos.x, z: nearest.pos.z },
    };
    // already claimed? open the Base screen for it
    if (claimsSys.isClaimed(poiDef.id)) {
      return openClaimedBase(claimsSys.list().find((b) => b.poiId === poiDef.id));
    }
    // claim it (the system validates credits + emits feedback)
    if (claimsSys.claim(poiDef)) {
      return openClaimedBase(claimsSys.list().find((b) => b.poiId === poiDef.id), { audio: false });
    }
    return true;
  }

  // Emit the intent only; uiRoot's dock:undocked handler owns clearing ui.docked and popping
  // the station hub (single owner of the dock→HUD transition, avoids a double-pop).
  function undock() {
    if (isUiInteractionFenced(state)) return;
    if (!(state.ui && state.ui.docked)) { screenManager.popScreen(); return; }
    bus.emit('dock:undocked', {});
  }

  // mouse-wheel zoom passthrough (only in flight, not over a modal)
  function onWheel(ev) {
    // Chrome reports a trackpad pinch as a Ctrl/Cmd-modified wheel. Cancel the browser's page-zoom
    // default before the mode gates so the DOM HUD stays at its fixed viewport scale.
    if ((ev.ctrlKey || ev.metaKey) && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (isUiInteractionFenced(state) || screenManager.isOpen() || (state.ui && state.ui.docked) || state.mode !== 'flight') return;
    bus.emit('camera:zoom', { delta: Math.sign(ev.deltaY) * 8 });
  }

  const blackoutPointerEvents = [
    'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'click', 'dblclick', 'auxclick', 'contextmenu',
    'touchstart', 'touchend', 'wheel',
  ];
  document.addEventListener('keydown', onBlackoutKeyDown, true);
  for (const type of blackoutPointerEvents) {
    document.addEventListener(type, onBlackoutPointerEvent, { capture: true, passive: false });
  }
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('wheel', onWheel, { passive: false });
  const clearGamepadFocus = () => document.documentElement.classList.remove('sf-gamepad-focus');
  document.addEventListener('pointerdown', clearGamepadFocus, true);

  // let other modules (uiRoot Undock button) trigger an undock
  unsubscribers.push(bus.on('ui:undock', undock));
  unsubscribers.push(bus.on('touch:uiAction', ({ action } = {}) => { routeTouchUiAction(action); }));

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

  function stationTabButtons() {
    const root = activeScreenEl();
    if (!root || root.dataset.screen !== 'station') return [];
    return Array.from(root.querySelectorAll('[role="tab"][data-nav], [role="tab"][data-tab], .st-rail [data-tab]')).filter((el) => {
      if (!el || el.disabled) return false;
      let p = el;
      while (p && p !== root) {
        if (p.style && p.style.display === 'none') return false;
        p = p.parentNode;
      }
      return true;
    });
  }

  function clickStationTab(btn) {
    if (!btn || btn.disabled) return false;
    if (typeof btn.click === 'function') btn.click();
    else if (typeof MouseEvent !== 'undefined') btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else return false;
    try { btn.focus(); } catch (e) {}
    return true;
  }

  function cycleStationTab(dir) {
    const tabs = stationTabButtons();
    if (!tabs.length) return false;
    let idx = tabs.findIndex((el) => el.classList && el.classList.contains('active'));
    if (idx < 0) idx = tabs.findIndex((el) => el.getAttribute('aria-selected') === 'true');
    if (idx < 0) idx = 0;
    const next = (idx + dir + tabs.length) % tabs.length;
    return clickStationTab(tabs[next]);
  }

  function moveFocus(dir) {
    const root = activeScreenEl();
    const items = focusableInside(root);
    if (!items.length) return;
    const active = document.activeElement;
    document.documentElement.classList.add('sf-gamepad-focus');
    // Tabs use roving tabindex, so inactive siblings are intentionally absent from `items`.
    // When a pad moves horizontally from a tab, traverse its tablist directly and activate the
    // destination; this matches keyboard ArrowLeft/ArrowRight behavior and keeps focus visible.
    if ((dir === 'left' || dir === 'right') && active && active.getAttribute('role') === 'tab') {
      const tablist = active.closest('[role="tablist"]');
      const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')).filter((el) => !el.disabled) : [];
      const tabIndex = tabs.indexOf(active);
      if (tabIndex >= 0 && tabs.length) {
        const delta = dir === 'left' ? -1 : 1;
        const nextTab = tabs[(tabIndex + delta + tabs.length) % tabs.length];
        try { nextTab.focus(); } catch (e) {}
        if (typeof nextTab.click === 'function') nextTab.click();
        return;
      }
    }
    if (!items.includes(active)) {
      try { items[0].focus(); } catch (e) {}
      return;
    }
    const next = spatialFocusTarget(items, active, dir);
    if (next) { try { next.focus(); } catch (e) {} }
  }

  function activateFocused() {
    const root = activeScreenEl();
    const active = document.activeElement;
    if (!active || !root || !root.contains(active)) return;
    document.documentElement.classList.add('sf-gamepad-focus');
    if (typeof active.click === 'function') active.click();
    else {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    }
  }

  function touchActionPressed(name) {
    const tp = ctx.touch;
    return !!(tp && tp.isConnected && tp.isConnected() && tp.actions && tp.actions[name] && tp.actions[name].pressed);
  }

  function openScreenFromTouch(id) {
    screenManager.pushScreen(id);
    bus.emit('audio:cue', { id: 'ui_open' });
  }

  function openMapFromTouch(focus) {
    openGalaxyMap({ state, bus, screenManager }, { focus, source: 'touch' });
    bus.emit('audio:cue', { id: 'ui_open' });
  }

  function handleTouchUi() {
    if (isUiInteractionFenced(state) || isConfirmOpen()) return;
    if (touchActionPressed('dock')) { routeTouchUiAction('dock'); return; }
    if (touchActionPressed('missionLog')) { routeTouchUiAction('missionLog'); return; }
    if (touchActionPressed('localmap')) { routeTouchUiAction('localmap'); return; }
    if (touchActionPressed('starmap')) { routeTouchUiAction('starmap'); }
    if (touchActionPressed('pause')) { routeTouchUiAction('pause'); }
  }

  function routeTouchUiAction(action) {
    if (isUiInteractionFenced(state) || isConfirmOpen()) return false;
    const top = screenManager.top ? screenManager.top() : null;
    if (screenManager.isOpen()) {
      if (action === 'pause' && top === 'pause') {
        screenManager.popScreen();
        bus.emit('audio:cue', { id: 'ui_back' });
        return true;
      }
      if ((action === 'starmap' || action === 'localmap') && isMapScreenId(top)) {
        screenManager.popScreen();
        bus.emit('audio:cue', { id: 'ui_back' });
        return true;
      }
      return false;
    }
    if (state.mode !== 'flight') return false;
    if (action === 'dock') {
      if (dockInRange && !state.ui.docked) {
        doDock();
        return true;
      }
      bus.emit('toast', { text: 'No dock prompt active', kind: 'info', ttl: 2 });
      return false;
    }
    if (action === 'missionLog') { openScreenFromTouch('missionLog'); return true; }
    // Touch Local / Star keep product labels on the overlay but open the unified map with focus.
    if (action === 'localmap') { openMapFromTouch(MAP_FOCUS.LOCAL); return true; }
    if (action === 'starmap') { openMapFromTouch(MAP_FOCUS.GALAXY); return true; }
    if (action === 'pause') { openScreenFromTouch('pause'); return true; }
    return false;
  }

  function handleGamepadUi(dt) {
    if (!gp || !gp.isConnected()) return;
    const cfg = getGamepadConfig();
    if (cfg.enabled === false) return;
    if (isUiInteractionFenced(state)) {
      _nav.up = _nav.down = _nav.left = _nav.right = false;
      _nav.holdT = 0;
      _nav.repeatT = 0;
      return;
    }

    if (isConfirmOpen()) {
      if (gp.actions.accept && gp.actions.accept.pressed) confirmGamepadAccept();
      if (gp.actions.cancel && gp.actions.cancel.pressed) confirmGamepadCancel();
      return;
    }

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
      const def = screenManager.getActiveScreenDef && screenManager.getActiveScreenDef();
      if (def && def.id === 'station') {
        if (gp.actions.tabPrev && gp.actions.tabPrev.pressed && cycleStationTab(-1)) {
          bus.emit('ui:navigate', {});
          return;
        }
        if (gp.actions.tabNext && gp.actions.tabNext.pressed && cycleStationTab(1)) {
          bus.emit('ui:navigate', {});
          return;
        }
      }

      // View/Select toggles the unified map closed when it (or a legacy map surface) is topmost.
      if (isMapScreenId(top) && gp.actions.map && gp.actions.map.pressed) {
        screenManager.popScreen();
        bus.emit('ui:cancel', {});
        bus.emit('audio:cue', { id: 'ui_back' });
        return;
      }

      // Accept / Cancel (A / B).
      if (gp.actions.accept && gp.actions.accept.pressed) {
        activateFocused();
        bus.emit('ui:confirm', {});
        bus.emit('audio:cue', { id: 'ui_confirm' });
      }
      if (gp.actions.cancel && gp.actions.cancel.pressed) {
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
      if (gp.actions.accept && gp.actions.accept.pressed && dockInRange) {
        doDock();
      }
      if (gp.actions.pause && gp.actions.pause.pressed) {
        screenManager.pushScreen('pause');
        bus.emit('audio:cue', { id: 'ui_open' });
      }
      if (gp.actions.map && gp.actions.map.pressed) {
        openGalaxyMap({ state, bus, screenManager }, { focus: MAP_FOCUS.GALAXY, source: 'gamepad' });
        bus.emit('audio:cue', { id: 'ui_open' });
      }
      if (gp.actions.codex && gp.actions.codex.pressed) {
        screenManager.pushScreen('codex');
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
    if (ctx.touch && (state.mode !== 'flight' || state.timeScale === 0)) {
      ctx.touch.tick(dt);
    }
    handleTouchUi();
    handleGamepadUi(dt);
  }

  return {
    doDock, undock, tick,
    dispose() {
      document.removeEventListener('keydown', onBlackoutKeyDown, true);
      for (const type of blackoutPointerEvents) {
        document.removeEventListener(type, onBlackoutPointerEvent, true);
      }
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerdown', clearGamepadFocus, true);
      for (const unsubscribe of unsubscribers.splice(0)) {
        try { unsubscribe(); } catch (_) {}
      }
    },
  };
}
