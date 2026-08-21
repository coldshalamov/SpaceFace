// Asteroid Works — the mine is the screen (design/ASTEROID_WORKS_DESIGN_LAW.md).
// Registered under screen id 'drill': same entry (massline tether → drill:approachRequested →
// completion), same pause semantics, superseding src/ui/screens/drill.js as the live module (that
// file stays for its exported input controller / particle / shake helpers and its checks).
//
// Chrome is law §6.1 + §6.2 only: a thin crest (name, claim, one alert slot, yield, hold gauge,
// leave) and the rig cluster (heat + charge). The board owns ≥88% of the glass; events happen on
// the board, never as a permanently visible text log. The inspector/palette wiring survives in a
// display:none transitional container until the cursor lens (.06) and build keys (.09) land.
// Styling lives in styles/asteroid-ops.css — this module owns structure and wiring only.
//
// Split per law: this shell owns lifecycle + DOM + events; asteroidRenderer3d owns pixels;
// asteroidController owns modes/input. Excavation sim stays in systems/drill.js; durable
// structures/production in systems/asteroidSites.js.
import { DRILL_CONST, tileIndex } from '../../systems/drill.js';
import { resolveDrillControlMap } from '../screens/drill.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';
import { machineName } from './asteroidRenderer2d.js';
import { createAsteroidRenderer3d } from './asteroidRenderer3d.js';
import {
  createAsteroidController,
  MODES,
  routeAsteroidScreenKeyDown,
} from './asteroidController.js';
import { createInspector, placementReason, commodityName, formationLabel } from './inspector.js';
import { createBuildPalette, costText } from './buildPalette.js';

// The cursor lens (design law §6.4) replaces the old context-bay inspector in PQ-130.06. Until then the
// inspector instance stays mounted in the hidden transitional container for its seam and its test
// contracts, but nothing rebuilds its DOM for pixels nobody can see.
const LENS_ENABLED = false;

const { COLS, ROWS } = DRILL_CONST;

export function syncAsteroidConsoleModeButtons(driveButton, buildButton, mode) {
  const buildSelected = mode === MODES.BUILD;
  driveButton?.classList?.toggle?.('active', !buildSelected);
  buildButton?.classList?.toggle?.('active', buildSelected);
  driveButton?.setAttribute?.('aria-pressed', String(!buildSelected));
  buildButton?.setAttribute?.('aria-pressed', String(buildSelected));
}

export function anchoredClaimAnnouncement(claim) {
  const survey = claim && claim.survey;
  const committed = survey && (survey.lifecycle === 'committed' || survey.lifecycle === 'producing');
  if (!committed) return 'Massline Core online. This asteroid is now a permanent site.';
  const cells = Array.isArray(survey.cells)
    ? survey.cells.length : Math.max(0, Math.trunc(Number(survey.cells) || 0));
  const count = cells > 0 ? `${cells} formation ${cells === 1 ? 'cell' : 'cells'} are` : 'the formation is';
  return `Massline Core online. Survey committed: ${count} now part of this permanent site.`;
}

export const asteroidScreen = {
  id: 'drill',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    this._ctx = ctx;
    const state = ctx.state;
    const controlMap = resolveDrillControlMap(state);
    const drillSys = ctx.drill || (ctx.registry && ctx.registry.get('drill'));
    const siteSys = ctx.asteroidSites || (ctx.registry && ctx.registry.get('asteroidSites'));

    const wrap = document.createElement('div');
    wrap.className = 'ast-screen';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-labelledby', 'ast-screen-title');

    const hudEls = {};

    // ---------- crest (law §6.1): name · claim · one alert slot · yield · hold · leave ----------
    const crest = document.createElement('header');
    crest.className = 'aw-crest';

    const nameEl = document.createElement('div');
    nameEl.className = 'aw-crest-name';
    nameEl.id = 'ast-screen-title';
    nameEl.textContent = 'Asteroid Works';

    const claimChip = document.createElement('span');
    claimChip.className = 'aw-chip';
    claimChip.dataset.chip = 'claim';
    claimChip.textContent = 'No claim';
    hudEls.claim = claimChip;

    // Claim-survey assay chip (PQ-024): volatile cold-state progress beside the claim it threatens;
    // committed/producing read from the durable record.
    const assayChip = document.createElement('span');
    assayChip.className = 'aw-chip';
    assayChip.dataset.chip = 'assay';
    assayChip.style.display = 'none';
    hudEls.assay = assayChip;

    // One alert slot, sentence case, severity-colored; empty and invisible by default.
    const alertEl = document.createElement('div');
    alertEl.className = 'aw-alert';
    alertEl.setAttribute('role', 'status');
    alertEl.setAttribute('aria-live', 'polite');
    hudEls.alert = alertEl;

    const crestRight = document.createElement('div');
    crestRight.className = 'aw-crest-right';
    const creditsEl = document.createElement('span');
    creditsEl.className = 'aw-credits';
    creditsEl.textContent = '0u';
    hudEls.yield = creditsEl;
    const hold = document.createElement('div');
    hold.className = 'aw-hold';
    hold.setAttribute('aria-hidden', 'true');
    const holdTrack = document.createElement('div');
    holdTrack.className = 'aw-hold-track';
    const holdTicks = document.createElement('div');
    holdTicks.className = 'ticks';
    const holdFill = document.createElement('div');
    holdFill.className = 'aw-hold-fill';
    holdTrack.append(holdTicks, holdFill);
    hold.appendChild(holdTrack);
    hudEls.holdFill = holdFill;
    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'aw-leave';
    const leaveLabel = document.createElement('span');
    leaveLabel.textContent = 'Leave';
    const leaveKey = document.createElement('span');
    leaveKey.className = 'aw-key';
    leaveKey.textContent = 'Esc';
    leaveBtn.append(leaveLabel, leaveKey);
    crestRight.append(creditsEl, hold, leaveBtn);

    crest.append(nameEl, claimChip, assayChip, alertEl, crestRight);
    wrap.appendChild(crest);

    // ---------- the board (law §4): sovereign stage + rig cluster ----------
    const stage = document.createElement('div');
    stage.className = 'aw-stage';
    const canvas = document.createElement('canvas');
    canvas.className = 'ast-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label',
      `Asteroid cross-section. Hold ${controlMap.movementLabel} to drive or bore. Press B for build mode, ${controlMap.scanLabel} to survey.`);
    stage.appendChild(canvas);

    const rig = document.createElement('div');
    rig.className = 'aw-rig';
    rig.setAttribute('aria-label', 'Rig instruments');
    function buildGauge(kind, label) {
      const row = document.createElement('div');
      row.className = `aw-gauge aw-gauge-${kind}`;
      const lbl = document.createElement('span');
      lbl.className = 'aw-gauge-label';
      lbl.textContent = label;
      const track = document.createElement('div');
      track.className = 'aw-gauge-track';
      const ticks = document.createElement('div');
      ticks.className = 'ticks';
      const fill = document.createElement('div');
      fill.className = 'aw-gauge-fill';
      track.append(ticks, fill);
      const val = document.createElement('span');
      val.className = 'aw-gauge-val';
      val.textContent = '0%';
      row.append(lbl, track, val);
      rig.appendChild(row);
      return { fill, val };
    }
    const heat = buildGauge('heat', 'Heat');
    const charge = buildGauge('charge', 'Charge');
    hudEls.tempFill = heat.fill;
    hudEls.temp = heat.val;
    hudEls.energyFill = charge.fill;
    hudEls.energy = charge.val;
    stage.appendChild(rig);

    // ---------- hidden transitionals (inspector + palette wiring; no glass until .06/.09) ----------
    const hidden = document.createElement('div');
    hidden.className = 'aw-hidden';
    hidden.setAttribute('aria-hidden', 'true');
    const cardHost = document.createElement('div');
    const ctxRow = document.createElement('div');
    const ringDock = document.createElement('div');
    ringDock.className = 'ao-ring-dock';
    hidden.append(cardHost, ctxRow, ringDock);
    stage.appendChild(hidden);

    const srStatus = document.createElement('div');
    srStatus.className = 'ast-sr-status';
    srStatus.setAttribute('role', 'status');
    srStatus.setAttribute('aria-live', 'polite');
    srStatus.setAttribute('aria-atomic', 'true');
    stage.appendChild(srStatus);
    wrap.appendChild(stage);
    rootEl.appendChild(wrap);

    function announce(text) {
      srStatus.textContent = '';
      requestAnimationFrame(() => { srStatus.textContent = text; });
    }

    // ---------- session + render state ----------
    let renderer3d = null;         // created lazily on first session (owns the WebGL context)
    let rafId = 0;
    let last = 0;
    let hudElapsed = 0;
    let inspElapsed = 0;
    let hover = null;              // { col, row }
    let currentSiteId = null;
    let projection = null;
    let projDirty = true;
    let motionReduce = prefersReducedMotion({
      motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
    });
    const hudCache = {};
    const unsubs = [];

    const asteroidId = () => (state.drill ? state.drill.asteroidId : null);
    const site = () => (currentSiteId && siteSys ? siteSys.getSite(currentSiteId) : null);

    function refreshProjection() {
      if (!siteSys) { projection = null; return; }
      const s = siteSys.siteForAsteroid(asteroidId());
      currentSiteId = s ? s.id : null;
      projection = currentSiteId ? siteSys.projection(currentSiteId) : null;
      projDirty = false;
    }

    // ---------- controller + palette + inspector ----------
    const controller = createAsteroidController({
      drillSys,
      getDrillState: () => state.drill,
      controlMap,
      hooks: {
        onModeChanged(mode) {
          wrap.dataset.mode = mode === MODES.BUILD ? 'build' : 'drive';
          palette.setVisible(mode === MODES.BUILD);
          inspElapsed = 10;
          announce(mode === MODES.BUILD
            ? 'Build mode. Arrows move the cursor, Enter places, X dismantles, Q and E cycle structures.'
            : 'Drive mode.');
        },
        onCursorMoved() { inspElapsed = 10; },
        onScan: () => pulseSurvey(),
        onPlace: (cursor) => commitPlacement(cursor),
        onRemove: (cursor) => commitRemoval(cursor),
        onCyclePalette: (dir) => palette.cycle(dir),
        onSelectPalette: (i) => palette.select(i),
      },
    });

    const palette = createBuildPalette(cardHost, {
      onSelect() { inspElapsed = 10; },
      // A clicked command key is an intent to build — arm BUILD from DRIVE (StarCraft law).
      onUserSelect() {
        if (controller.state.mode !== MODES.BUILD) controller.setMode(MODES.BUILD);
      },
    });
    palette.setVisible(false);

    const inspectorActions = {
      setMode: (machineId, mode) => {
        if (!siteSys || !currentSiteId) return;
        siteSys.setMachineMode(currentSiteId, machineId, mode);
        projDirty = true;
        inspElapsed = 10;
      },
      remove: (machineId) => {
        if (!siteSys || !currentSiteId) return;
        const res = siteSys.removeMachine(currentSiteId, machineId);
        if (res.ok) announce('Machine dismantled. Control unit recovered.');
        projDirty = true;
        inspElapsed = 10;
      },
      setExport: (goodId, exported) => {
        if (!siteSys || !currentSiteId) return;
        siteSys.setExportFlag(currentSiteId, goodId, exported);
        projDirty = true;
        inspElapsed = 10;
      },
      setPodTarget: (target) => {
        if (!siteSys || !currentSiteId) return;
        siteSys.setPodTarget(currentSiteId, target);
        projDirty = true;
        inspElapsed = 10;
      },
      canTransfer: () => !!(state.drill && state.drill.active),
      openTransfer: (machineId, dir) => quickTransfer(machineId, dir),
    };
    const inspector = createInspector(ctxRow, inspectorActions, { ringDock });
    ctxRow.appendChild(ringDock); // inspector root first, schematic dock beside it

    // Rover-carried bulk transfer: move everything sensible in one press (v1 — no quantity modal).
    function quickTransfer(machineId, dir) {
      if (!siteSys || !currentSiteId) return;
      const goods = new Set();
      if (dir === 'deposit') {
        const items = (state.player.cargo && state.player.cargo.items) || {};
        for (const g of Object.keys(items)) goods.add(g);
      } else if (projection) {
        for (const lane of projection.lanes) for (const g of Object.keys(lane.store || {})) goods.add(g);
      }
      let moved = 0;
      for (const g of [...goods].sort()) {
        const res = siteSys.transferGoods(currentSiteId, machineId, g, 999, dir);
        if (res.ok) moved += res.moved;
      }
      announce(moved > 0
        ? `${moved} units ${dir === 'deposit' ? 'loaded onto the site lane' : 'taken into the hold'}.`
        : 'Nothing to transfer.');
      projDirty = true;
      inspElapsed = 10;
      updateHud();
    }

    // A10 spill confirmation. The system REFUSES to clear a lane cell whose removal would spill
    // network stock; the first attempt announces the exact amount and ARMS the cell, and a second
    // clear on the same cell confirms the loss (the deterministic receipt lands in the site
    // ledger via site:laneSpilled). Arming resets on any other action.
    let armedSpill = null; // { kind, idx }
    function attemptOverlayChange(kind, cursor, on) {
      const idx = tileIndex(cursor.col, cursor.row);
      const confirmed = !on && armedSpill && armedSpill.kind === kind && armedSpill.idx === idx;
      const res = siteSys.setOverlay(currentSiteId, kind, cursor.col, cursor.row, on,
        confirmed ? { confirmSpill: true } : undefined);
      if (!res.ok && res.reason === 'would-spill') {
        armedSpill = { kind, idx };
        const total = res.spill ? Math.floor(res.spill.spilledTotal) : 0;
        announce(`Clearing this lane would spill ${total}u of stored goods — clear it again to confirm the loss.`);
        return res;
      }
      armedSpill = null;
      return res;
    }

    function commitPlacement(cursor) {
      const item = palette.selected;
      const astId = asteroidId();
      if (!item || astId == null) return;
      if (item.kind === 'overlay') {
        if (!siteSys) return;
        if (!currentSiteId) {
          announce('Paint follows machines — install the first machine to open the claim.');
          return;
        }
        const on = !overlaySetFor(item.id).has(tileIndex(cursor.col, cursor.row));
        const res = attemptOverlayChange(item.id, cursor, on);
        if (res.ok) {
          projDirty = true;
          announce(`${item.name} ${on ? 'laid' : 'cleared'} at ${cursor.col},${cursor.row}.`
            + (res.spilled > 0 ? ` Spilled ${Math.floor(res.spilled)}u.` : ''));
        } else if (res.reason !== 'would-spill') {
          announce(placementReason({ reason: res.reason }));
        }
        return;
      }
      if (item.kind === 'remove') { commitRemoval(cursor); return; }
      if (!siteSys) return;
      armedSpill = null; // any non-overlay action disarms a pending spill confirmation
      const res = siteSys.installMachine({ asteroidId: astId, defId: item.id, col: cursor.col, row: cursor.row });
      if (res.ok) {
        if (renderer3d) renderer3d.notify('install', { col: cursor.col, row: cursor.row });
        projDirty = true;
        announce(`${item.name} installed at ${cursor.col},${cursor.row}.`);
        pushLedgerLine('good', `${item.name} installed at ${cursor.col},${cursor.row}.`);
      } else {
        announce(placementReason(res));
      }
      inspElapsed = 10;
    }

    function commitRemoval(cursor) {
      if (!siteSys || !currentSiteId) return;
      const s = site();
      const m = s && siteSys.machineAt(s, cursor.col, cursor.row);
      if (m) {
        // Same refuse-then-confirm arming as lane clears: machines conduct, so dismantling one
        // can orphan a loaded store. kind 'machine' keeps the two confirmations distinct.
        const idx = tileIndex(cursor.col, cursor.row);
        const confirmed = armedSpill && armedSpill.kind === 'machine' && armedSpill.idx === idx;
        const res = siteSys.removeMachine(currentSiteId, m.id,
          confirmed ? { confirmSpill: true } : undefined);
        if (!res.ok && res.reason === 'would-spill') {
          armedSpill = { kind: 'machine', idx };
          const total = res.spill ? Math.floor(res.spill.spilledTotal) : 0;
          announce(`Dismantling this machine would spill ${total}u of stored goods — dismantle it again to confirm the loss.`);
          return;
        }
        armedSpill = null;
        announce(res.ok ? `${machineName(m.defId)} dismantled.` : placementReason(res));
        projDirty = true;
        return;
      }
      // No machine: clear whichever overlay is present (lane first, then cable).
      for (const kind of ['lane', 'power']) {
        if (overlaySetFor(kind).has(tileIndex(cursor.col, cursor.row))) {
          const res = attemptOverlayChange(kind, cursor, false);
          if (res.ok) {
            announce(`${kind === 'lane' ? 'Material lane' : 'Power cable'} cleared.`
              + (res.spilled > 0 ? ` Spilled ${Math.floor(res.spilled)}u.` : ''));
            projDirty = true;
          }
          return;
        }
      }
      announce('Nothing to dismantle there.');
    }

    function overlaySetFor(kind) {
      const s = site();
      return new Set(s ? s.overlays[kind] : []);
    }

    const pulseSurvey = () => {
      if (!drillSys || !state.drill) return;
      if (drillSys.pulseScan()) return;
      const remain = Math.max(0, state.drill.scan?.cooldown || 0);
      announce(`Survey recharging. ${Math.ceil(remain)} seconds remaining.`);
    };

    // ---------- pointer input ----------
    // The renderer raycasts the same rock-face plane the cursor chrome draws on, so what the
    // mouse touches is what highlights.
    const canvasCell = (ev) => (renderer3d ? renderer3d.pickCell(ev.clientX, ev.clientY) : null);
    const onMouseMove = (ev) => {
      const cell = canvasCell(ev);
      const changed = !!cell !== !!hover || (cell && hover && (cell.col !== hover.col || cell.row !== hover.row));
      hover = cell;
      if (changed) inspElapsed = 10;
      if (cell && controller.state.mode === MODES.BUILD) {
        controller.state.cursor.col = cell.col;
        controller.state.cursor.row = cell.row;
        if (controller.state.dragPaint && palette.selected.kind === 'overlay' && siteSys && currentSiteId) {
          siteSys.setOverlay(currentSiteId, palette.selected.id, cell.col, cell.row, controller.state.dragPaint === 'on');
          projDirty = true;
        }
      }
    };
    const onMouseLeave = () => { hover = null; };
    const onMouseDown = (ev) => {
      if (ev.button !== 0) return;
      const cell = canvasCell(ev);
      if (!cell) return;
      canvas.focus({ preventScroll: true });
      if (controller.state.mode !== MODES.BUILD) return;
      controller.state.cursor.col = cell.col;
      controller.state.cursor.row = cell.row;
      if (palette.selected.kind === 'overlay' && currentSiteId) {
        const on = !overlaySetFor(palette.selected.id).has(tileIndex(cell.col, cell.row));
        controller.state.dragPaint = on ? 'on' : 'off';
      }
      commitPlacement(cell);
      ev.preventDefault();
    };
    const onMouseUp = () => { controller.state.dragPaint = null; };
    const onContextMenu = (ev) => {
      if (controller.state.mode !== MODES.BUILD) return;
      const cell = canvasCell(ev);
      if (cell) { commitRemoval(cell); ev.preventDefault(); }
    };
    // Two zoom registers (law §4): wheel or Z snaps work ↔ site with a 180ms eased zoom.
    const onWheel = (ev) => {
      ev.preventDefault();
      if (renderer3d) renderer3d.inputZoom(ev.deltaY);
    };
    const onKeyDown = (event) => {
      if (event.code === 'KeyZ' && !event.repeat && renderer3d) {
        renderer3d.toggleZoomRegister();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      routeAsteroidScreenKeyDown({ controller, event, exit });
    };
    const onKeyUp = (ev) => { controller.onKeyUp(ev); };
    const onWindowBlur = () => controller.cancel();
    leaveBtn.addEventListener('click', () => exit());

    // ---------- silent ledger buffer (law §2.6: events happen on the board, not a text log) ----------
    // The manifest tape is gone from the glass; history waits here for the ledger drawer (.07).
    const ledgerBuffer = [];
    let lastLedgerText = null;
    function pushLedgerLine(kind, text) {
      if (lastLedgerText === text) return;
      lastLedgerText = text;
      ledgerBuffer.unshift({ kind, text });
      if (ledgerBuffer.length > 24) ledgerBuffer.length = 24;
    }

    // ---------- crest alert slot (one line, severity-colored) ----------
    let bannerKind = null;
    function showBanner(kind, text, severity = 'warn') {
      if (bannerKind === kind && hudCache.alertText === text) return;
      bannerKind = kind;
      hudCache.alertText = text;
      alertEl.textContent = text;
      alertEl.className = `aw-alert live ${severity}`;
    }
    function clearBanner(kind) {
      if (bannerKind !== kind) return;
      bannerKind = null;
      hudCache.alertText = '';
      alertEl.textContent = '';
      alertEl.className = 'aw-alert';
    }

    // ---------- bus subscriptions ----------
    // The shell keeps the words (alert slot, screen-reader, ledger buffer); the renderer gets
    // the pictures.
    unsubs.push(ctx.bus.on('drill:yield', (p) => {
      const name = commodityName(p.commodityId);
      if (renderer3d) {
        renderer3d.notify('yield', { col: p.pos?.col ?? 0, row: p.pos?.row ?? 0, ore: p.commodityId, qty: p.qty });
      }
      pushLedgerLine('good', `+${p.qty} ${name} extracted.`);
      announce(`${p.qty} units of ${name} extracted.`);
    }));
    unsubs.push(ctx.bus.on('drill:gasHit', (p) => {
      if (renderer3d) renderer3d.notify('gasHit', { col: p.pos?.col ?? 0, row: p.pos?.row ?? 0 });
      pushLedgerLine('bad', 'Gas pocket breached — hull damaged.');
      announce(`Gas pocket breached. Hull damage ${p.dmg}.`);
      projDirty = true; // a breached pocket is a lost gas contact
    }));
    unsubs.push(ctx.bus.on('drill:warn', (p) => {
      pushLedgerLine(p.reason === 'cargoFull' ? 'bad' : 'warn', p.text);
      announce(p.text);
    }));
    unsubs.push(ctx.bus.on('drill:rockDepleted', (p) => {
      showBanner('depleted', 'Played out — no ore until it recovers', 'warn');
    }));
    unsubs.push(ctx.bus.on('drill:cargoFull', () => {
      if (renderer3d) renderer3d.notify('cargoFull');
      showBanner('cargo', 'Hold full — leave to offload', 'bad');
    }));
    unsubs.push(ctx.bus.on('drill:scanPulse', (p) => {
      if (renderer3d) renderer3d.notify('scanPulse');
      const result = p.contacts === 1 ? '1 contact' : `${p.contacts} contacts`;
      pushLedgerLine('info', `Survey resolved ${result}.`);
      announce(`Survey resolved ${result} within ${p.radius} cells.`);
    }));
    unsubs.push(ctx.bus.on('drill:break', (p) => {
      if (!state.drill) return;
      if (renderer3d) renderer3d.notify('break', { col: p.col, row: p.row });
      projDirty = true; // excavation changes contact rings
    }));
    unsubs.push(ctx.bus.on('drill:spark', (p) => {
      if (!state.drill) return;
      if (renderer3d) renderer3d.notify('spark', { col: p.col, row: p.row, type: p.type, ore: p.ore });
    }));
    for (const event of [
      'site:courierLaunched', 'site:courierDelivered',
      'site:courierLost', 'site:podBuilt', 'site:anchored',
    ]) {
      unsubs.push(ctx.bus.on(event, (p) => {
        // The claim can be created mid-session (first install) before a projection refresh has
        // resolved currentSiteId — re-resolve lazily so no receipt is dropped.
        if (!currentSiteId || p.siteId !== currentSiteId) refreshProjection();
        if (!currentSiteId || p.siteId !== currentSiteId) return;
        projDirty = true;
        inspElapsed = 10;
        syncLedgerFromSite();
        if (event === 'site:anchored') {
          clearBanner('unanchored');
          announce(anchoredClaimAnnouncement(site()));
        }
      }));
    }

    // Claim-survey milestones (PQ-024). Detection and completion warn about volatility BEFORE the
    // player commits; commitment and first real output are durable site receipts. One voice:
    // everything routes through the screen's single announcer + the ledger buffer.
    unsubs.push(ctx.bus.on('site:surveyDetected', (p) => {
      if (!p || p.asteroidId !== asteroidId()) return;
      const label = formationLabel(p.material);
      pushLedgerLine('info', `Survey: ${label} detected — assaying ${p.cellsTotal} cells.`);
      announce(`Survey detected a ${label}. Assay is volatile — install a Massline Core before leaving this rock to commit it.`);
      inspElapsed = 10;
    }));
    unsubs.push(ctx.bus.on('site:surveyComplete', (p) => {
      if (!p || p.asteroidId !== asteroidId()) return;
      pushLedgerLine('good', `Survey complete — ${p.cellsTotal} cells assayed. Commit a Core to keep this record.`);
      announce('Formation fully assayed. Install a Massline Core to commit the survey record.');
      inspElapsed = 10;
    }));
    unsubs.push(ctx.bus.on('site:surveyCommitted', (p) => {
      if (!p) return;
      // A Core can be the first machine on this rock. In that path the owner emits the committed
      // survey before site:anchored, so currentSiteId has not been resolved by the screen yet.
      // Resolve through the live owner just like the general site event path above rather than
      // dropping the player-visible commitment receipt.
      if (!currentSiteId || p.siteId !== currentSiteId) refreshProjection();
      if (!currentSiteId || p.siteId !== currentSiteId) return;
      pushLedgerLine('good', `Survey committed — ${p.cellsTotal} formation cells recorded to the claim.`);
      projDirty = true;
      // Preserve the existing frame-batched DOM owners while forcing both surfaces on the next
      // screen frame instead of leaving the cold chips behind for their ordinary cadences.
      hudElapsed = 10;
      inspElapsed = 10;
    }));
    unsubs.push(ctx.bus.on('site:producing', (p) => {
      if (!p || p.siteId !== currentSiteId) return;
      pushLedgerLine('good', 'First real output — the site is producing. Exterior relay online.');
      announce('First real output recorded. The site is producing — exterior relay online.');
      projDirty = true;
      inspElapsed = 10;
    }));

    function syncLedgerFromSite() {
      const s = site();
      if (!s || !s.ledger.length) return;
      const latest = s.ledger[0];
      pushLedgerLine(latest.kind === 'bad' ? 'bad' : latest.kind === 'warn' ? 'warn' : latest.kind === 'good' ? 'good' : 'info', latest.text);
    }

    // Re-entering an established site seeds its recent history for the ledger drawer (.07).
    function seedLedgerFromSite() {
      const s = site();
      if (!s || !s.ledger.length) return;
      for (const entry of s.ledger.slice(0, 8).reverse()) {
        pushLedgerLine(entry.kind === 'bad' ? 'bad' : entry.kind === 'warn' ? 'warn' : entry.kind === 'good' ? 'good' : 'info', entry.text);
      }
    }

    // ---------- instruments ----------
    function setText(el, key, text) {
      if (!el || hudCache[key] === text) return;
      hudCache[key] = text;
      el.textContent = text;
    }
    function setCn(el, key, cn) {
      if (!el || hudCache[key] === cn) return;
      hudCache[key] = cn;
      el.className = cn;
    }
    function setBar(el, key, pct, cls) {
      if (!el) return;
      const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}|${cls}`;
      if (hudCache[key] === v) return;
      hudCache[key] = v;
      el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      el.className = `aw-gauge-fill ${cls}`.trim();
    }

    function updateHud() {
      const d = state.drill;
      if (!d) return;
      let total = 0;
      for (const k in d.yieldLog) total += d.yieldLog[k] || 0;
      setText(hudEls.yield, 'y', `${total}u`);

      // hold gauge — mint → gold → coral as it fills (crest, law §6.1)
      const cargo = state.player.cargo;
      const cap = cargo && cargo.capVolume > 0 ? cargo.capVolume : 0;
      const used = cargo ? Number(cargo.usedVolume) || 0 : 0;
      const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
      const full = pct >= 100;
      setBar(hudEls.holdFill, 'hb', pct, full ? 'full' : (pct >= 75 ? 'hot' : ''));
      if (full) showBanner('cargo', 'Hold full — leave to offload', 'bad');
      else clearBanner('cargo');

      // rig cluster — gauges confirm what the rover's body already shows (law §6.2)
      const temp = Math.round(d.drillTemp || 0);
      setText(hudEls.temp, 't', `${temp}%`);
      setBar(hudEls.tempFill, 'tb', temp, d.overheated ? 'bad' : (temp > 60 ? 'warn' : ''));
      setCn(hudEls.temp, 'tcn', d.overheated ? 'aw-gauge-val bad' : 'aw-gauge-val');
      const energy = Math.round(d.drillEnergy ?? 100);
      setText(hudEls.energy, 'e', `${energy}%`);
      setBar(hudEls.energyFill, 'eb', energy, d.energyDepleted ? 'bad' : (energy < 25 ? 'bad' : ''));
      setCn(hudEls.energy, 'ecn', d.energyDepleted || energy < 25 ? 'aw-gauge-val bad' : 'aw-gauge-val');

      // claim-survey assay chip + claim chip (PQ-024): cold progress is volatile knowledge and
      // must be visible BEFORE the player commits; committed/producing read the durable record.
      const survey = siteSys ? siteSys.surveyStatusFor(asteroidId()) : null;
      let assayText = '';
      let assayCls = 'aw-chip';
      if (survey && survey.state === 'cold' && survey.material) {
        assayText = `Assay ${survey.revealed}/${survey.cells}`;
        assayCls = 'aw-chip bad'; // volatile — same risk voice as an unanchored claim
      } else if (survey && survey.state === 'cold') {
        assayText = 'No assay';
      } else if (survey && (survey.state === 'committed' || survey.state === 'producing')) {
        assayText = `Assay ${survey.cells} cells`;
        assayCls = 'aw-chip ok';
      }
      setText(hudEls.assay, 'as', assayText);
      setCn(hudEls.assay, 'ascn', assayCls);
      const assayHidden = !assayText;
      if (hudCache.assayHide !== assayHidden) {
        hudCache.assayHide = assayHidden;
        hudEls.assay.style.display = assayHidden ? 'none' : '';
      }

      // claim chip
      const s = site();
      const claimText = !s ? 'No claim'
        : (!s.anchored ? 'Unanchored' : (survey && survey.state === 'producing' ? 'Producing' : 'Anchored'));
      setText(hudEls.claim, 'dc', claimText);
      setCn(hudEls.claim, 'dccn', !s ? 'aw-chip' : (s.anchored ? 'aw-chip ok' : 'aw-chip bad'));
      if (s && !s.anchored && bannerKind == null) {
        showBanner('unanchored', 'Unanchored — install a Core before leaving', 'warn');
      } else if (s && s.anchored) {
        clearBanner('unanchored');
      }
    }

    // ---------- inspector refresh (transitional: hidden container until the .06 lens) ----------
    function refreshInspector() {
      const d = state.drill;
      if (!d) return;
      if (projDirty) refreshProjection();
      const cursor = controller.state.mode === MODES.BUILD ? controller.state.cursor : hover;
      const s = site();

      if (controller.state.mode === MODES.BUILD && palette.selected.kind === 'machine') {
        const check = siteSys ? siteSys.canInstall({
          asteroidId: asteroidId(), defId: palette.selected.id,
          col: controller.state.cursor.col, row: controller.state.cursor.row,
        }) : null;
        inspector.showGhost(palette.selected.id, check, costText(palette.selected.cost));
        return;
      }
      if (cursor && s && projection) {
        const m = siteSys.machineAt(s, cursor.col, cursor.row);
        if (m) {
          const pm = projection.machines.find((x) => x.id === m.id);
          if (pm) { inspector.showMachine(pm, projection); return; }
        }
        const idx = tileIndex(cursor.col, cursor.row);
        if (s.overlays.power.includes(idx) || s.overlays.lane.includes(idx)) {
          const laneNet = projection.lanes.find((l) => l.cells.includes(idx));
          const powerNet = projection.power.find((p) => p.cells.includes(idx));
          if (laneNet && s.overlays.lane.includes(idx)) { inspector.showNetwork('lane', laneNet); return; }
          if (powerNet) { inspector.showNetwork('power', powerNet); return; }
        }
      }
      if (cursor && d.field) {
        const t = d.field[cursor.col] && d.field[cursor.col][cursor.row];
        if (t && !(t.type === 'empty' && !t.structure && projection)) {
          inspector.showTile({
            tile: t,
            col: cursor.col,
            row: cursor.row,
            surveyed: drillSys.isTileSurveyed(cursor.col, cursor.row),
            telemetry: t.type !== 'empty' ? drillSys.getTargetTelemetry(cursor.col, cursor.row) : null,
            drillTier: drillSys.getDrillTier(),
            formation: siteSys ? siteSys.surveyCellRole(asteroidId(), tileIndex(cursor.col, cursor.row)) : null,
          });
          return;
        }
      }
      if (projection) inspector.showSite(projection, { paused: true, survey: siteSys ? siteSys.surveyStatusFor(asteroidId()) : null });
      else if (cursor && d.field) {
        const t = d.field[cursor.col] && d.field[cursor.col][cursor.row];
        inspector.showTile({
          tile: t || null, col: cursor ? cursor.col : 0, row: cursor ? cursor.row : 0,
          surveyed: cursor ? drillSys.isTileSurveyed(cursor.col, cursor.row) : false,
          telemetry: null, drillTier: drillSys.getDrillTier(),
          formation: (cursor && siteSys) ? siteSys.surveyCellRole(asteroidId(), tileIndex(cursor.col, cursor.row)) : null,
        });
      } else {
        inspector.showTile({ tile: null, col: 0, row: 0, surveyed: false, telemetry: null, drillTier: 1 });
      }
    }

    // ---------- per-frame UI info handed to the 3D renderer ----------
    // Cursor + ghost validity are recomputed here (the shell owns siteSys) exactly as the 2D
    // render pass did per repaint; the renderer just draws what it is told.
    function buildUiFrame() {
      const mode = controller.state.mode;
      const cursor = mode === MODES.BUILD ? controller.state.cursor : hover;
      let buildKind = null;
      let buildDefId = null;
      let canOk = false;
      if (mode === MODES.BUILD && palette.selected) {
        buildKind = palette.selected.kind;
        if (buildKind === 'machine') {
          buildDefId = palette.selected.id;
          const check = siteSys ? siteSys.canInstall({
            asteroidId: asteroidId(), defId: buildDefId,
            col: controller.state.cursor.col, row: controller.state.cursor.row,
          }) : null;
          canOk = !!(check && check.ok);
        }
      }
      return { mode, cursor, buildKind, buildDefId, canOk };
    }

    // ---------- frame loop ----------
    // The 3D scene is continuously lit (emissive pulses, headlight, camera settle), so it renders
    // every frame while the screen is up.
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const d = state.drill;
      if (!d) return;

      controller.tick(dt);
      if (renderer3d) renderer3d.render(dt, now / 1000, buildUiFrame());
      hudElapsed += dt;
      if (hudElapsed >= 0.15) {
        if (projDirty) refreshProjection();
        updateHud();
        hudElapsed = 0;
      }
      inspElapsed += dt;
      if (LENS_ENABLED && inspElapsed >= 0.5) {
        refreshInspector();
        inspElapsed = 0;
      }
    }

    // ---------- lifecycle ----------
    const startSession = () => {
      const pendingId = (state.ui && state.ui.pendingDrillAsteroidId) || null;
      if (state.ui) state.ui.pendingDrillAsteroidId = null;
      if (!pendingId || !drillSys) return;

      controller.cancel();
      controller.setMode(MODES.DRIVE);
      hudElapsed = 0;
      inspElapsed = 0;
      for (const k of Object.keys(hudCache)) delete hudCache[k];
      motionReduce = prefersReducedMotion({
        motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
      });
      bannerKind = null;
      alertEl.textContent = '';
      alertEl.className = 'aw-alert';
      lastLedgerText = null;
      ledgerBuffer.length = 0;

      drillSys.begin(pendingId);
      const astId = asteroidId();
      hudEls.siteName = nameEl;
      nameEl.textContent = `AST-${astId != null ? String(astId) : '—'}`;
      projDirty = true;
      refreshProjection();
      seedLedgerFromSite();
      // Fresh rock: the scene shows the loop (rig on a tether, veins, pockets); the announcer
      // names it once for screen readers — no visible tutorial text on the glass.
      if ((state.drill.tilesCleared || 0) <= 1) {
        announce('Rig tethered to the surface winch — hold a direction to drive, keep holding to bore through rock.');
      }
      // One renderer (one WebGL context) per mounted screen; each session rebuilds its scene
      // from the live field.
      if (!renderer3d) {
        renderer3d = createAsteroidRenderer3d({
          canvas,
          wrapEl: stage,
          drillSys,
          getDrill: () => state.drill,
          getSite: site,
          getProjection: () => projection,
        });
      }
      renderer3d.begin({ motionReduce });
      updateHud();
      refreshInspector();
      const s = site();
      if (s && !s.anchored) {
        showBanner('unanchored', 'Unanchored — install a Core before leaving', 'warn');
      }

      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onWindowBlur);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      last = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
      requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
      this._active = true;
    };

    const stopSession = () => {
      if (!this._active) return;
      this._active = false;
      cancelAnimationFrame(rafId);
      controller.cancel();
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      if (state.drill && drillSys) drillSys.end();
    };

    function exit(reason = 'retracted') {
      const d = state.drill;
      const yields = d ? { ...d.yieldLog } : {};
      const total = Object.values(yields).reduce((a, b) => a + b, 0);
      if (d && drillSys) drillSys.end({ reason });
      const fade = document.getElementById('sf-dock-overlay');
      if (fade) {
        fade.hidden = false;
        fade.setAttribute('aria-hidden', 'false');
        fade.style.pointerEvents = 'auto';
        requestAnimationFrame(() => fade.classList.add('active'));
      }
      const camCtrl = state.render && state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') camCtrl.pushZoom(0.18, 0.7);
      setTimeout(() => {
        if (ctx.screenManager) ctx.screenManager.popScreen();
        if (total > 0) showSummary(yields);
        setTimeout(() => {
          if (fade) {
            fade.classList.remove('active');
            setTimeout(() => {
              if (!fade.classList.contains('active')) {
                fade.style.pointerEvents = 'none';
                fade.setAttribute('aria-hidden', 'true');
                fade.hidden = true;
              }
            }, 420);
          }
        }, 50);
      }, 400);
    }

    function showSummary(yields) {
      const root = document.getElementById('ui-root');
      if (!root) return;
      const modal = document.createElement('div');
      modal.className = 'ast-summary-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Extraction report');
      const box = document.createElement('div');
      box.className = 'ast-summary-box';
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = 'Extraction report';
      box.appendChild(t);
      for (const [goodId, qty] of Object.entries(yields).filter(([, q]) => q > 0)) {
        const row = document.createElement('div');
        row.className = 'row';
        const name = document.createElement('span');
        name.textContent = `${commodityName(goodId)} × ${qty}`;
        const val = document.createElement('span');
        val.className = 'val';
        val.textContent = `+${qty}u`;
        row.append(name, val);
        box.appendChild(row);
      }
      const closeBtn = document.createElement('button');
      closeBtn.className = 'sf-btn';
      closeBtn.textContent = 'Acknowledge';
      const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 250);
      };
      closeBtn.addEventListener('click', close);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
      });
      box.appendChild(closeBtn);
      modal.appendChild(box);
      root.appendChild(modal);
      setTimeout(() => modal.classList.add('active'), 20);
      requestAnimationFrame(() => closeBtn.focus());
    }

    this._startSession = startSession;
    this._cleanup = () => {
      stopSession();
      if (renderer3d) {
        try { renderer3d.dispose(); } catch (_) { /* GL teardown is best-effort */ }
        renderer3d = null;
      }
      for (const un of unsubs.splice(0)) { try { un(); } catch (_) { /* listener already gone */ } }
    };
    this._stopOnly = stopSession;
    this._refresh = () => {
      projDirty = true;
      updateHud();
      refreshInspector();
    };
  },

  onShow() {
    if (this._active) return;
    const st = this._ctx && this._ctx.state;
    const pending = st && st.ui && st.ui.pendingDrillAsteroidId;
    if (!pending && this._ctx && this._ctx.screenManager) {
      // Session torn down underneath us (death → gameOver over the top). Same recovery as the
      // shipped drill screen: pop back to flight rather than freezing on a dead frame.
      this._ctx.screenManager.popScreen();
      return;
    }
    if (this._startSession) this._startSession();
  },
  onHide() { if (this._stopOnly) this._stopOnly(); },
  refresh() { if (this._refresh) this._refresh(); },
};
