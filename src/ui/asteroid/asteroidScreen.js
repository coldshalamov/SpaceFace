// Asteroid Ops console — the drill lens grown into a machine-design surface
// (design/ASTEROID_SITES_BRIEF.md for the sim, design/ASTEROID_OPS_UI_BRIEF.md for this shell).
// Registered under screen id 'drill': same entry (massline tether → ui:drillFadeStart), same
// pause semantics, superseding src/ui/screens/drill.js as the live module (that file stays for
// its exported input controller / particle / shake helpers and its checks).
//
// Frame: top status strip / full-bleed 3D viewport + manifest rail / bottom command deck
// (site systems · context+contact ring · command card). Styling lives in
// styles/asteroid-ops.css — this module owns structure and wiring only.
//
// Split per brief §2: this shell owns lifecycle + DOM + events; asteroidRenderer3d owns pixels;
// asteroidController owns modes/input; inspector + buildPalette own their bays. Excavation sim
// stays in systems/drill.js; durable structures/production in systems/asteroidSites.js.
import { DRILL_CONST, tileIndex } from '../../systems/drill.js';
import { resolveDrillControlMap } from '../screens/drill.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';
import { MATERIALS, ORE_TINTS, machineName } from './asteroidRenderer2d.js';
import { createAsteroidRenderer3d } from './asteroidRenderer3d.js';
import {
  createAsteroidController,
  MODES,
  routeAsteroidScreenKeyDown,
} from './asteroidController.js';
import { createInspector, placementReason, commodityName, formationLabel } from './inspector.js';
import { createBuildPalette, costText } from './buildPalette.js';

const { COLS, ROWS } = DRILL_CONST;

const TICKER_IDLE = 'Systems nominal.';

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

    // ---------- top strip: designation · ticker · session stats · retract ----------
    const top = document.createElement('header');
    top.className = 'ao-top';

    const topId = document.createElement('div');
    topId.className = 'ao-top-id';
    const title = document.createElement('h1');
    title.className = 'ao-top-title';
    title.id = 'ast-screen-title';
    title.textContent = 'Asteroid Works';
    const topSub = document.createElement('span');
    topSub.className = 'ao-top-sub';
    topSub.textContent = 'AST-—';
    const claimChip = document.createElement('span');
    claimChip.className = 'ao-chip';
    claimChip.textContent = 'No claim';
    topId.append(title, topSub, claimChip);
    hudEls.siteSub = topSub;
    hudEls.claim = claimChip;

    const ticker = document.createElement('div');
    ticker.className = 'ao-ticker';
    ticker.setAttribute('role', 'alert');
    ticker.setAttribute('aria-live', 'polite');
    const tickerText = document.createElement('span');
    tickerText.className = 'ao-ticker-text';
    tickerText.textContent = TICKER_IDLE;
    ticker.appendChild(tickerText);

    const topStats = document.createElement('div');
    topStats.className = 'ao-top-stats';
    topStats.innerHTML =
      '<span><span class="lbl">Yield</span><span data-yield>0</span></span>'
      + '<span><span class="lbl">Cargo</span><span data-cargo>0%</span></span>';
    hudEls.yield = topStats.querySelector('[data-yield]');
    hudEls.cargo = topStats.querySelector('[data-cargo]');

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'ao-btn ao-top-exit';
    exitBtn.innerHTML = '<span>Retract rig</span><span class="ao-key-cap">ESC</span>';

    top.append(topId, ticker, topStats, exitBtn);
    wrap.appendChild(top);

    // ---------- main: viewport + manifest rail ----------
    const main = document.createElement('div');
    main.className = 'ao-main';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'ast-canvas-wrap';
    const stage = document.createElement('div');
    stage.className = 'ao-stage';
    const canvas = document.createElement('canvas');
    canvas.className = 'ast-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label',
      `Asteroid cross-section. Hold ${controlMap.movementLabel} to drive or bore. Press B for build mode, ${controlMap.scanLabel} to survey.`);
    stage.appendChild(canvas);
    canvasWrap.appendChild(stage);
    main.appendChild(canvasWrap);

    const rail = document.createElement('aside');
    rail.className = 'ao-rail';
    rail.setAttribute('aria-label', 'Site manifest and strata key');
    const tapeTitle = document.createElement('div');
    tapeTitle.className = 'ao-bay-title';
    tapeTitle.textContent = 'Manifest';
    const ledgerFeed = document.createElement('div');
    ledgerFeed.className = 'ao-tape';
    ledgerFeed.innerHTML = '<div class="ao-tape-empty">Bore and site events print here.</div>';
    const strataTitle = document.createElement('div');
    strataTitle.className = 'ao-bay-title';
    strataTitle.textContent = 'Strata';
    const strata = document.createElement('div');
    strata.className = 'ao-strata';
    rail.append(tapeTitle, ledgerFeed, strataTitle, strata);
    main.appendChild(rail);
    wrap.appendChild(main);

    // ---------- command deck ----------
    const deck = document.createElement('footer');
    deck.className = 'ao-deck';

    // -- site systems bay
    const siteBay = document.createElement('section');
    siteBay.className = 'ao-bay ao-bay-site';
    siteBay.setAttribute('aria-label', 'Site systems and rig telemetry');
    siteBay.innerHTML = `
      <div class="ao-bay-title">Site systems</div>
      <div class="ao-inst"><span class="lbl">Power</span><span class="ao-bar"><span class="fill amber" data-power-fill></span></span><span class="val" data-power>—</span></div>
      <div class="ao-inst"><span class="lbl">Export</span><span class="ao-duo-spacer"></span><span class="val" data-export>—</span></div>
      <div class="ao-inst"><span class="lbl">Couriers</span><span class="ao-pips" data-pod-pips></span><span class="val" data-pods>—</span></div>
      <div class="ao-sep"></div>
      <div class="ao-subhead">Rig</div>
      <div class="ao-inst"><span class="lbl">Temp</span><span class="ao-bar"><span class="fill" data-temp-fill></span></span><span class="val" data-temp>0%</span></div>
      <div class="ao-inst"><span class="lbl">Energy</span><span class="ao-bar"><span class="fill" data-energy-fill></span></span><span class="val" data-energy>100%</span></div>
      <div class="ao-duo"><span><span class="lbl">Rock budget</span><span class="val" data-rock>—</span></span><span><span class="lbl">Gas hits</span><span class="val" data-gas>0</span></span></div>
    `;
    hudEls.powerFill = siteBay.querySelector('[data-power-fill]');
    hudEls.power = siteBay.querySelector('[data-power]');
    hudEls.export = siteBay.querySelector('[data-export]');
    hudEls.podPips = siteBay.querySelector('[data-pod-pips]');
    hudEls.pods = siteBay.querySelector('[data-pods]');
    hudEls.tempFill = siteBay.querySelector('[data-temp-fill]');
    hudEls.temp = siteBay.querySelector('[data-temp]');
    hudEls.energyFill = siteBay.querySelector('[data-energy-fill]');
    hudEls.energy = siteBay.querySelector('[data-energy]');
    hudEls.rock = siteBay.querySelector('[data-rock]');
    hudEls.gas = siteBay.querySelector('[data-gas]');
    deck.appendChild(siteBay);

    // -- context bay (inspector + contact-ring schematic)
    const ctxBay = document.createElement('section');
    ctxBay.className = 'ao-bay ao-bay-context';
    ctxBay.setAttribute('aria-label', 'Inspector');
    const ctxTitle = document.createElement('div');
    ctxTitle.className = 'ao-bay-title';
    ctxTitle.textContent = 'Context';
    const ctxRow = document.createElement('div');
    ctxRow.className = 'ao-context';
    const ringDock = document.createElement('div');
    ringDock.className = 'ao-ring-dock';
    ctxBay.append(ctxTitle, ctxRow);
    deck.appendChild(ctxBay);

    // -- command bay
    const cmdBay = document.createElement('section');
    cmdBay.className = 'ao-bay ao-bay-command';
    cmdBay.setAttribute('aria-label', 'Command card');
    const cmdTitle = document.createElement('div');
    cmdTitle.className = 'ao-bay-title';
    cmdTitle.textContent = 'Command';
    const modeSwitch = document.createElement('div');
    modeSwitch.className = 'ao-switch';
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', 'Console mode');
    const driveBtn = document.createElement('button');
    driveBtn.type = 'button';
    driveBtn.className = 'active';
    driveBtn.textContent = 'Drive';
    const buildBtn = document.createElement('button');
    buildBtn.type = 'button';
    buildBtn.innerHTML = 'Build <span class="ao-key-cap">B</span>';
    modeSwitch.append(driveBtn, buildBtn);
    const cardHost = document.createElement('div');
    const scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'ao-btn ao-survey';
    scanBtn.innerHTML = `<span>Pulse survey <span class="ao-key-cap">${controlMap.scanLabel}</span></span> <span class="st ready" data-scan-state>Ready</span>`;
    hudEls.scanState = scanBtn.querySelector('[data-scan-state]');
    // Claim-survey assay chip (PQ-024): volatile cold-state progress next to the verb that drives
    // it; committed/producing read from the durable record. Ambient status surface, one voice.
    const assayChip = document.createElement('span');
    assayChip.className = 'ao-chip';
    assayChip.style.display = 'none';
    hudEls.assay = assayChip;
    const hints = document.createElement('div');
    hints.className = 'ao-hints';
    hints.innerHTML =
      `<div>${controlMap.movementLabel} — drive · hold to bore</div>`
      + '<div>Enter place · X dismantle · Q/E cycle · Esc retract</div>';
    cmdBay.append(cmdTitle, modeSwitch, cardHost, scanBtn, assayChip, hints);
    deck.appendChild(cmdBay);
    wrap.appendChild(deck);

    const srStatus = document.createElement('div');
    srStatus.className = 'ast-sr-status';
    srStatus.setAttribute('role', 'status');
    srStatus.setAttribute('aria-live', 'polite');
    srStatus.setAttribute('aria-atomic', 'true');
    wrap.appendChild(srStatus);
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
          driveBtn.classList.toggle('active', mode === MODES.DRIVE);
          buildBtn.classList.toggle('active', mode === MODES.BUILD);
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
    driveBtn.addEventListener('click', () => controller.setMode(MODES.DRIVE));
    buildBtn.addEventListener('click', () => controller.setMode(MODES.BUILD));

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
        rebuildStrata();
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
    scanBtn.addEventListener('click', pulseSurvey);

    // ---------- pointer input ----------
    // The 2D path mapped pixels linearly; the 3D renderer raycasts the same rock-face plane the
    // cursor chrome draws on, so what the mouse touches is what highlights.
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
    const onKeyDown = (event) => routeAsteroidScreenKeyDown({ controller, event, exit });
    const onKeyUp = (ev) => { controller.onKeyUp(ev); };
    const onWindowBlur = () => controller.cancel();
    exitBtn.addEventListener('click', () => exit());

    // ---------- manifest tape + alert ticker ----------
    let lastLedgerText = null;
    function pushLedgerLine(kind, text) {
      if (lastLedgerText === text) return;
      lastLedgerText = text;
      const item = document.createElement('div');
      item.className = `ao-tape-row ${kind}`;
      item.textContent = text;
      ledgerFeed.querySelector('.ao-tape-empty')?.remove();
      ledgerFeed.prepend(item);
      while (ledgerFeed.children.length > 12) ledgerFeed.lastElementChild.remove();
    }

    let bannerKind = null;
    function showBanner(kind, text) {
      const cls = (kind === 'cargo' || kind === 'danger') ? 'bad' : 'warn';
      if (bannerKind === kind && hudCache.tickerText === text) return;
      bannerKind = kind;
      hudCache.tickerText = text;
      tickerText.textContent = text;
      ticker.className = `ao-ticker ${cls}`;
    }
    function clearBanner(kind) {
      if (bannerKind !== kind) return;
      bannerKind = null;
      hudCache.tickerText = TICKER_IDLE;
      tickerText.textContent = TICKER_IDLE;
      ticker.className = 'ao-ticker';
    }

    // ---------- bus subscriptions ----------
    // The shell keeps the words (tape, ticker, screen-reader); the renderer gets the pictures.
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
      showBanner('depleted', p?.text || 'This rock is played out — veins break but pay no ore until it recovers.');
    }));
    unsubs.push(ctx.bus.on('drill:cargoFull', () => {
      if (renderer3d) renderer3d.notify('cargoFull');
      showBanner('cargo', 'CARGO HOLDS FULL — mining now wastes ore. Retract the rig to offload.');
    }));
    unsubs.push(ctx.bus.on('drill:scanPulse', (p) => {
      if (renderer3d) renderer3d.notify('scanPulse');
      rebuildStrata();
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
          announce('Massline Core online. This asteroid is now a permanent site.');
        }
      }));
    }

    // Claim-survey milestones (PQ-024). Detection and completion warn about volatility BEFORE the
    // player commits; commitment and first real output are durable site receipts. One voice:
    // everything routes through the screen's single announcer + the ledger tape.
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

    // Re-entering an established site shows its recent history, not an empty feed.
    function seedLedgerFromSite() {
      const s = site();
      if (!s || !s.ledger.length) return;
      for (const entry of s.ledger.slice(0, 8).reverse()) {
        pushLedgerLine(entry.kind === 'bad' ? 'bad' : entry.kind === 'warn' ? 'warn' : entry.kind === 'good' ? 'good' : 'info', entry.text);
      }
    }

    // ---------- strata key ----------
    function rebuildStrata() {
      strata.replaceChildren();
      const rows = [
        [MATERIALS.matrix.base, MATERIALS.matrix.name],
        [MATERIALS.basalt.base, MATERIALS.basalt.name],
        [MATERIALS.gas.glow, 'Gas pocket — tap it, never breach it'],
      ];
      const d = state.drill;
      const seen = new Set();
      if (d && d.field) {
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const t = d.field[c][r];
            if (t && t.type === 'vein' && t.ore && t.surveyed && !seen.has(t.ore)) seen.add(t.ore);
          }
        }
      }
      for (const ore of [...seen].sort()) {
        rows.push([(ORE_TINTS[ore] || {}).vein || '#999', commodityName(ore)]);
      }
      for (const [color, label] of rows) {
        const row = document.createElement('div');
        row.className = 'ao-strata-row';
        const sw = document.createElement('span');
        sw.className = 'ao-strata-swatch';
        sw.style.background = color;
        const tx = document.createElement('span');
        tx.textContent = label;
        row.append(sw, tx);
        strata.appendChild(row);
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
      el.className = `fill ${cls}`.trim();
    }

    function syncPodPips(ready, target, out) {
      const key = `${ready}/${target}/${out}`;
      if (hudCache.pips === key) return;
      hudCache.pips = key;
      hudEls.podPips.replaceChildren();
      const shown = Math.min(10, target);
      for (let i = 0; i < shown; i++) {
        const pip = document.createElement('span');
        pip.className = `ao-pip${i < ready ? ' on' : ''}`;
        hudEls.podPips.appendChild(pip);
      }
      for (let i = 0; i < Math.min(4, out); i++) {
        const pip = document.createElement('span');
        pip.className = 'ao-pip out';
        hudEls.podPips.appendChild(pip);
      }
    }

    function updateHud() {
      const d = state.drill;
      if (!d) return;
      let total = 0;
      for (const k in d.yieldLog) total += d.yieldLog[k] || 0;
      setText(hudEls.yield, 'y', `${total}u`);
      setText(hudEls.gas, 'g', String(d.gasHits));
      const cargo = state.player.cargo;
      const cap = cargo && cargo.capVolume > 0 ? cargo.capVolume : 0;
      const used = cargo ? Number(cargo.usedVolume) || 0 : 0;
      const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
      const full = pct >= 100;
      setText(hudEls.cargo, 'c', full ? 'FULL' : `${pct}%`);
      setCn(hudEls.cargo, 'ccn', full ? 'bad' : '');
      if (full) showBanner('cargo', 'CARGO HOLDS FULL — mining now wastes ore. Retract the rig to offload.');
      else clearBanner('cargo');
      const budget = d.rockBudget;
      const rockText = Number.isFinite(budget) && Number(d.rockBudgetMax) > 0
        ? (budget <= 0 ? 'EMPTY' : String(Math.floor(budget))) : '—';
      setText(hudEls.rock, 'r', rockText);
      setCn(hudEls.rock, 'rcn', rockText === 'EMPTY' ? 'val bad' : 'val');

      const temp = Math.round(d.drillTemp || 0);
      setText(hudEls.temp, 't', `${temp}%`);
      setBar(hudEls.tempFill, 'tb', temp, d.overheated ? 'bad' : (temp > 60 ? 'warn' : ''));
      setCn(hudEls.temp, 'tcn', d.overheated ? 'val bad' : (temp > 60 ? 'val warn' : 'val'));
      const energy = Math.round(d.drillEnergy ?? 100);
      setText(hudEls.energy, 'e', `${energy}%`);
      setBar(hudEls.energyFill, 'eb', energy, d.energyDepleted ? 'bad' : (energy < 25 ? 'warn' : ''));
      setCn(hudEls.energy, 'ecn', d.energyDepleted || energy < 25 ? 'val warn' : 'val');

      if (projection) {
        const gen = projection.power.reduce((s, p) => s + p.gen, 0);
        const draw = projection.power.reduce((s, p) => s + p.draw, 0);
        const worst = projection.power.reduce((w, p) => Math.min(w, p.ratio), 1);
        setText(hudEls.power, 'p', `${Math.round(gen)}/${Math.round(draw)} MW`);
        setCn(hudEls.power, 'pcn', worst < 1 ? 'val warn' : 'val ok');
        const load = gen > 0 ? (draw / gen) * 100 : (draw > 0 ? 100 : 0);
        setBar(hudEls.powerFill, 'pb', load, worst < 1 ? 'bad' : 'amber');
        setText(hudEls.export, 'x', `${projection.exportRatePerMin.toFixed(1)} u/min`);
        const fl = projection.fleet;
        syncPodPips(fl.podsReady, fl.podTarget, fl.inFlightCount);
        setText(hudEls.pods, 'pd', `${fl.podsReady}/${fl.podTarget} · ${fl.inFlightCount} out`);
        setCn(hudEls.pods, 'pdcn', fl.podsReady === 0 && fl.podTarget > 0 ? 'val warn' : 'val');
      } else {
        setText(hudEls.power, 'p', '—');
        setBar(hudEls.powerFill, 'pb', 0, 'amber');
        setText(hudEls.export, 'x', '—');
        syncPodPips(0, 0, 0);
        setText(hudEls.pods, 'pd', '—');
      }
      const remaining = Math.max(0, d.scan?.cooldown || 0);
      setText(hudEls.scanState, 's', remaining > 0 ? `${Math.ceil(remaining)}s` : 'Ready');
      setCn(hudEls.scanState, 'scn', remaining > 0 ? 'st' : 'st ready');
      const disabled = remaining > 0;
      if (hudCache.scanDis !== disabled) { hudCache.scanDis = disabled; scanBtn.disabled = disabled; }

      // claim-survey assay chip + claim chip (PQ-024): cold progress is volatile knowledge and
      // must be visible BEFORE the player commits; committed/producing read the durable record.
      const survey = siteSys ? siteSys.surveyStatusFor(asteroidId()) : null;
      let assayText = '';
      let assayCls = 'ao-chip';
      if (survey && survey.state === 'cold' && survey.material) {
        assayText = `Assay ${survey.revealed}/${survey.cells}`;
        assayCls = 'ao-chip bad'; // volatile — same risk voice as UNANCHORED
      } else if (survey && survey.state === 'cold') {
        assayText = 'No assay';
      } else if (survey && (survey.state === 'committed' || survey.state === 'producing')) {
        assayText = `Assay ${survey.cells} cells`;
        assayCls = 'ao-chip ok';
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
        : (!s.anchored ? 'UNANCHORED' : (survey && survey.state === 'producing' ? 'Producing' : 'Anchored'));
      setText(hudEls.claim, 'dc', claimText);
      setCn(hudEls.claim, 'dccn', !s ? 'ao-chip' : (s.anchored ? 'ao-chip ok' : 'ao-chip bad'));
      if (s && !s.anchored && bannerKind == null) {
        showBanner('unanchored', 'UNANCHORED CLAIM — install a Massline Core or this work is lost when you leave the sector.');
      } else if (s && s.anchored) {
        clearBanner('unanchored');
      }
    }

    // ---------- inspector refresh ----------
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
      if (inspElapsed >= 0.5) {
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
      wrap.classList.toggle('reduce-motion', motionReduce);
      bannerKind = null;
      tickerText.textContent = TICKER_IDLE;
      ticker.className = 'ao-ticker';
      lastLedgerText = null;
      ledgerFeed.innerHTML = '<div class="ao-tape-empty">Bore and site events print here.</div>';

      drillSys.begin(pendingId);
      const astId = asteroidId();
      hudEls.siteSub.textContent = `AST-${astId != null ? String(astId) : '—'}`;
      projDirty = true;
      refreshProjection();
      seedLedgerFromSite();
      // One renderer (one WebGL context) per mounted screen; each session rebuilds its scene
      // from the live field.
      if (!renderer3d) {
        renderer3d = createAsteroidRenderer3d({
          canvas,
          wrapEl: canvasWrap,
          drillSys,
          getDrill: () => state.drill,
          getSite: site,
          getProjection: () => projection,
        });
      }
      renderer3d.begin({ motionReduce });
      rebuildStrata();
      updateHud();
      refreshInspector();
      const s = site();
      if (s && !s.anchored) {
        showBanner('unanchored', 'UNANCHORED CLAIM — install a Massline Core or this work is lost when you leave the sector.');
      }

      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onWindowBlur);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('contextmenu', onContextMenu);

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
      rebuildStrata();
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
