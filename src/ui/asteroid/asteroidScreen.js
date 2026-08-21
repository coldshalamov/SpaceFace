// Asteroid Works — the mine is the screen (design/ASTEROID_WORKS_DESIGN_LAW.md).
// Registered under screen id 'drill': same entry (massline tether → drill:approachRequested →
// completion), same pause semantics, superseding src/ui/screens/drill.js as the live module (that
// file stays for its exported input controller / particle / shake helpers and its checks).
//
// Chrome is law §6.1 + §6.2 + §6.3 + §6.4: a thin crest (name, claim, one alert slot, yield, hold
// gauge, leave), the rig cluster (heat + charge), the cursor lens that rides beside the pointer,
// and — once a Core is owned — the earned build palette on the bottom edge. The board owns ≥88% of
// the glass; events happen on the board, never as a permanently visible text log. There are no
// transitional containers left on this screen: the palette is either a real object or absent.
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
import {
  createCursorLens, tileLensModel, machineLensModel, ghostLensModel, seamSplits,
  placementReason, commodityName, formationLabel,
} from './inspector.js';
import { createBuildPalette, PALETTE_ITEMS, CORE_ID } from './buildPalette.js';

// PQ-130.06 — the cursor lens (law §6.4) landed and the context bay is gone (law §10). Timings
// here are law: the card appears after LENS_DELAY_S of hover while driving, instantly in build
// mode, and vanishes on pointer-leave, on any drive keypress, and whenever the pointer is over
// chrome (the crest/rig are siblings of the canvas, so leaving the canvas covers that).
const LENS_DELAY_S = 0.15;

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
    // The public mode is published from the first frame, not from the first toggle. It used to be
    // written only inside onModeChanged, so a session that never left DRIVE reported `undefined`
    // to every reader — and the acceptance actors that ask "Build or Drive?" before pressing
    // Escape got neither answer.
    wrap.dataset.mode = 'drive';

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

    // The last transitional container is gone with PQ-130.09 — the build palette below is a real
    // object mounted onto the stage the moment it is earned, or it is not in the DOM at all.

    // ---------- §6.4 cursor lens: the only readout that ever names a cell ----------
    // Mounted on the stage (a positioned element) so the card places in stage coordinates and a
    // transformed screen stack cannot shift it. It is pointer-transparent by stylesheet.
    const lens = createCursorLens(stage);

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
    let inspElapsed = 0;           // seconds since the lens last rebuilt (handlers force it to 10)
    let hover = null;              // { col, row }
    // ---- cursor lens state (law §6.4) ----
    let lensPointer = null;        // { x, y } client coords of the live pointer, null if keyboard
    let lensDelay = -1;            // seconds left before the card may appear; < 0 = disarmed
    let lensDirty = true;          // the subject changed, rebuild the model on the next tick
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

    // ---------- controller + palette ----------
    const controller = createAsteroidController({
      drillSys,
      getDrillState: () => state.drill,
      controlMap,
      hooks: {
        onModeChanged(mode) {
          wrap.dataset.mode = mode === MODES.BUILD ? 'build' : 'drive';
          palette.setBuildActive(mode === MODES.BUILD);
          inspElapsed = 10;
          // Law §6.4: instant in build mode, 150ms of hover in drive. Leaving build closes the
          // card — the next hover re-earns it.
          if (mode === MODES.BUILD) armLens(0);
          else hideLens();
          announce(mode === MODES.BUILD
            ? 'Build mode. Arrows move the cursor, Enter places, X dismantles, Q and E cycle structures.'
            : 'Drive mode.');
        },
        onCursorMoved(cursor) {
          // Publish the build cursor the same way data-mode is published: the cell the player is
          // aiming at is public truth, and it is the only way a headless check can measure the
          // §11.7 cadence (one press = one cell) on the build cursor rather than just the rig.
          wrap.dataset.cursor = `${cursor.col},${cursor.row}`;
          inspElapsed = 10;
          lensDirty = true;
          // A keyboard-driven cursor has no pointer to hang the card on: anchor it to the cell.
          lensPointer = null;
          armLens(0);
        },
        onScan: () => pulseSurvey(),
        onPlace: (cursor) => commitPlacement(cursor),
        onRemove: (cursor) => commitRemoval(cursor),
        onCyclePalette: (dir) => palette.cycle(dir),
        // Answers false when no key owns that index — before the first Core there is no palette,
        // so the digit is left to whatever else on the page wants it.
        onSelectPalette: (i) => palette.select(i),
      },
    });

    const palette = createBuildPalette(stage, {
      onSelect() { inspElapsed = 10; lensDirty = true; },
      // A pressed key is an intent to build — arm BUILD from DRIVE (law §6.7).
      onUserSelect() {
        if (controller.state.mode !== MODES.BUILD) controller.setMode(MODES.BUILD);
      },
      motionReduce,
    });

    // ---------- §6.3 the earned palette: what exists, and what it costs ----------
    //
    // EXISTENCE, in two tiers:
    //   • the palette itself — only once this rock carries a Massline Core. Before that a rock has
    //     exactly one legal build, so BUILD arms it implicitly (palette.selected answers the Core
    //     while unmounted) and no chrome is spent on a choice that does not exist.
    //   • each key — a machine gets a key when it could be installed on this rock at all. A unique
    //     machine that already stands here is ABSENT, not disabled: law §6.3 bans the gray
    //     placeholder. Cable/Lane are meaningful once a Core exists; Dismantle once anything does.
    //     (`data/sites.js` carries no research/tier gate today; when one lands it filters here.)
    function coreOwned(s) {
      return !!(s && (s.machines.some((m) => m.defId === CORE_ID) || s.anchored));
    }

    /**
     * What `def.cost` cannot be paid from right now. The owner already answers this exactly —
     * eligible lane stores first, then the ship hold — so the palette asks it rather than
     * re-deriving an economy rule in the UI. `canInstall` is the public fallback, but it reports
     * materials only after the seat itself passes, which is why the private read is preferred:
     * a key's affordability must not depend on where the cursor happens to be sitting.
     */
    function shortfallMap(s, present) {
      const out = {};
      if (!siteSys) return out;
      const cur = controller.state.cursor;
      const canReadStores = typeof siteSys._missingMaterials === 'function'
        && typeof siteSys._fundingStoresFor === 'function';
      const stores = canReadStores ? siteSys._fundingStoresFor(s, cur.col, cur.row) : null;
      for (const id of present) {
        const item = PALETTE_ITEMS.find((it) => it.id === id);
        if (!item || item.kind !== 'machine' || !item.cost) continue;
        if (canReadStores) {
          const miss = siteSys._missingMaterials(s, item.cost, stores);
          if (Object.keys(miss).length) out[id] = miss;
          continue;
        }
        const check = siteSys.canInstall({
          asteroidId: asteroidId(), defId: id, col: cur.col, row: cur.row,
        });
        if (check && check.reason === 'materials') out[id] = check.missing || {};
      }
      return out;
    }

    let paletteSettleAllowed = false; // a cold session start must not replay the §9 birth beat
    function syncPalette() {
      // Resolve the owner first, exactly as lensModel() does. Callers happen to refresh before
      // this today; a palette that only tells the truth when someone else refreshed first is one
      // reordering away from showing a stale row.
      if (projDirty) refreshProjection();
      const s = site();
      if (!coreOwned(s)) { palette.unmount(); return; }
      const present = [];
      for (const item of PALETTE_ITEMS) {
        if (item.kind === 'machine') {
          if (item.unique && s.machines.some((m) => m.defId === item.id)) continue;
          present.push(item.id);
        } else if (item.kind === 'overlay') {
          present.push(item.id); // cable + lane are meaningful the moment a Core can power them
        } else if (s.machines.length) {
          present.push(item.id); // dismantle, once there is something to take apart
        }
      }
      palette.sync({ present, shortfall: shortfallMap(s, present), settle: paletteSettleAllowed });
      palette.setBuildActive(controller.state.mode === MODES.BUILD);
    }

    // The old context bay carried four operator affordances as buttons inside its cards — export
    // Hold/Ship per good, the courier pod target, a machine's recipe/mode switch, and rover bulk
    // transfer. All four went unreachable in .01 (the transitional container is
    // `display:none !important`, so no click ever landed on them) and the bay itself is deleted by
    // law §10. Their owner APIs are untouched — siteSys.setExportFlag / setPodTarget /
    // setMachineMode / transferGoods — and the §6.6 `Site` drawer (.07/.10) is where they re-bind.
    // The lens is hover-only and never hosts a control.

    // ---------- lens plumbing (law §6.4) ----------
    function armLens(delayS) {
      lensDelay = Math.max(0, delayS);
      lensDirty = true;
    }

    function hideLens() {
      lensDelay = -1;
      lens.hide();
    }

    // The subject cell's box in client space, straight off the renderer's own projection. The lens
    // treats it as a keep-out so the card can never sit on the cell it is naming — at work zoom a
    // cell is 120px wide, so a bare +18/+18 from a cursor in its middle lands right on top of it.
    function cellRect(col, row) {
      const hook = canvas.__ast3d;
      if (!hook || typeof hook.projectCell !== 'function') return null;
      const corners = hook.projectCell(col, row);
      if (!corners || !corners.length) return null;
      const r = canvas.getBoundingClientRect();
      const xs = corners.map((q) => q.x);
      const ys = corners.map((q) => q.y);
      return {
        left: r.left + Math.min(...xs), right: r.left + Math.max(...xs),
        top: r.top + Math.min(...ys), bottom: r.top + Math.max(...ys),
      };
    }

    // Where the card hangs: the pointer when there is one, otherwise the keyboard-driven build
    // cursor's own cell corner.
    function lensAnchor(subject) {
      if (lensPointer) return lensPointer;
      if (!subject) return null;
      return { x: subject.right, y: subject.bottom };
    }

    function lensSubject() {
      const cursor = controller.state.mode === MODES.BUILD ? controller.state.cursor : hover;
      return cursor ? cellRect(cursor.col, cursor.row) : null;
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
        // Law §9 first-Core beat: the palette grows on the frame the site grew, not 150ms later
        // on the next HUD tick. A unique machine also drops its own key here.
        refreshProjection();
        syncPalette();
      } else {
        // Law §6.7: placement never fails silently. The key stays armed and the lens ghost card
        // is already showing `Blocked` + the enumerated reason for this exact cell — forcing a
        // rebuild keeps that card honest the instant the refusal happens.
        announce(placementReason(res));
        lensDirty = true;
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
      lensPointer = { x: ev.clientX, y: ev.clientY };
      if (changed) { inspElapsed = 10; lensDirty = true; }
      // Law §6.4: 150ms of hover while driving earns the card; build mode gets it instantly. An
      // already-open card follows the pointer without re-serving the delay.
      if (!cell) hideLens();
      else if (lens.visible) lens.showAt(ev.clientX, ev.clientY, lensSubject());
      else if (lensDelay < 0 || changed) armLens(controller.state.mode === MODES.BUILD ? 0 : LENS_DELAY_S);
      if (cell && controller.state.mode === MODES.BUILD) {
        controller.state.cursor.col = cell.col;
        controller.state.cursor.row = cell.row;
        if (controller.state.dragPaint && palette.selected.kind === 'overlay' && siteSys && currentSiteId) {
          siteSys.setOverlay(currentSiteId, palette.selected.id, cell.col, cell.row, controller.state.dragPaint === 'on');
          projDirty = true;
        }
      }
    };
    // Pointer off the board — including onto the crest or the rig cluster, which are siblings of
    // the canvas — closes the card (law §6.4: "hides when the pointer is over chrome").
    const onMouseLeave = () => { hover = null; lensPointer = null; hideLens(); };
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
      hideLens(); // the board is about to move under a card pinned to the old projection
      if (renderer3d) renderer3d.inputZoom(ev.deltaY);
    };
    const onKeyDown = (event) => {
      // Law §6.4: any DRIVE keypress closes the card. A zoom-register change closes it in EITHER
      // mode: the 180ms ease re-projects the whole board, and the card only re-places when its
      // subject changes — so a card left open would float away from the cell it names for the
      // whole ease. This sits above the KeyZ branch so it applies before the early return.
      if (controller.state.mode !== MODES.BUILD || event.code === 'KeyZ') hideLens();
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
      if (renderer3d) renderer3d.notify('spark', { col: p.col, row: p.row, type: p.type, ore: p.ore, bore: p.bore, bite: p.bite });
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

      // §6.3: the palette earns, loses and re-prices its keys on the HUD's own cadence. Cheap —
      // the owner's runtime reconcile is dirty-flag guarded and the funding stores are read once.
      syncPalette();
    }

    // ---------- the lens model (law §6.4) ----------
    // One subject, in this precedence: placement ghost > machine > tile. Networks lost their card
    // with the context bay — a lane/cable is drawn ON the board (law §7), and naming it beside the
    // cursor would be the old bay in miniature.
    //
    // NOTE ON DATA: everything here is the plumbing the old inspector already used —
    // siteSys.machineAt / canInstall / surveyCellRole, drillSys.getTargetTelemetry /
    // getDrillTier, and the renderer's own cellAppearance so the swatch can never disagree with
    // the rock. Only the prose was deleted.
    function lensModel() {
      const d = state.drill;
      if (!d) return null;
      if (projDirty) refreshProjection();
      const build = controller.state.mode === MODES.BUILD;
      const cursor = build ? controller.state.cursor : hover;
      if (!cursor) return null;
      const s = site();

      if (build && palette.selected && palette.selected.kind === 'machine') {
        const check = siteSys ? siteSys.canInstall({
          asteroidId: asteroidId(), defId: palette.selected.id,
          col: cursor.col, row: cursor.row,
        }) : null;
        return ghostLensModel(palette.selected.id, check);
      }

      if (s && projection && siteSys) {
        const m = siteSys.machineAt(s, cursor.col, cursor.row);
        if (m) {
          const pm = projection.machines.find((x) => x.id === m.id);
          if (pm) return machineLensModel(pm);
        }
      }

      if (!d.field) return null;
      const tile = d.field[cursor.col] && d.field[cursor.col][cursor.row];
      if (!tile) return null;
      const hook = canvas.__ast3d;
      // The renderer is the single source of truth for material identity and seam SIZE; the
      // articulation boolean it does not publish is probed against the live field with the
      // renderer's own body definition. No appearance hook (first frame) => classify from the tile.
      const appearance = hook && typeof hook.cellAppearance === 'function'
        ? hook.cellAppearance(cursor.col, cursor.row) : null;
      const splits = tile.type === 'vein' && tile.ore
        ? seamSplits(d.field, COLS, ROWS, cursor.col, cursor.row) : false;
      return tileLensModel({
        tile,
        appearance,
        telemetry: tile.type !== 'empty' ? drillSys.getTargetTelemetry(cursor.col, cursor.row) : null,
        drillTier: drillSys.getDrillTier(),
        splits,
        // Claim-formation membership (PQ-024) survives the context bay as a ring on the swatch,
        // not as a sentence. This is the lens's only reader of the survey record.
        formation: siteSys
          ? siteSys.surveyCellRole(asteroidId(), tileIndex(cursor.col, cursor.row)) : null,
      });
    }

    // Rebuild + place. Returns false when there is nothing to describe, which closes the card.
    function renderLens() {
      const model = lensModel();
      if (!model) { hideLens(); return false; }
      const subject = lensSubject();
      const anchor = lensAnchor(subject);
      if (!anchor) { hideLens(); return false; }
      lens.render(model);
      lens.showAt(anchor.x, anchor.y, subject);
      lensDirty = false;
      return true;
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
      // ---- cursor lens (law §6.4) ----
      // The hover delay is spent here rather than on a timer, so it pauses with the screen and
      // cannot fire a card into a torn-down session.
      inspElapsed += dt;
      if (lensDelay >= 0 && !lens.visible) {
        lensDelay -= dt;
        if (lensDelay <= 0) { lensDelay = -1; renderLens(); }
      } else if (lens.visible && (lensDirty || inspElapsed >= 0.5)) {
        // Live values (bore progress, machine status) keep the open card honest.
        renderLens();
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
      wrap.dataset.mode = 'drive'; // setMode is a no-op when it is already DRIVE
      delete wrap.dataset.cursor;    // a new session has aimed at nothing yet
      hudElapsed = 0;
      inspElapsed = 0;
      // A fresh session has no pointer on the board yet, and law §2.5 counts the default drive
      // view with no hover: the lens starts closed and stays closed until someone hovers.
      lensPointer = null;
      lensDelay = -1;
      lensDirty = true;
      lens.hide();
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
      // INPUT FIRST, PIXELS SECOND. These used to be registered after the renderer was built, so
      // any throw inside scene construction left a screen with no keys at all — not even Escape,
      // which is the difference between "the mine looks wrong" and "the game is stuck". Every
      // handler below already null-guards `renderer3d`, so binding early is free.
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onWindowBlur);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('wheel', onWheel, { passive: false });

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
      // Re-entering an already-built site must not replay the §9 first-Core settle: the palette is
      // simply there, the way it was when you left. Only a Core landing DURING a session animates.
      paletteSettleAllowed = false;
      palette.setMotionReduce(motionReduce);
      updateHud();
      paletteSettleAllowed = true;
      const s = site();
      if (s && !s.anchored) {
        showBanner('unanchored', 'Unanchored — install a Core before leaving', 'warn');
      }

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
      hideLens();
      palette.unmount();
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
      lens.destroy();
      palette.destroy();
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
      // uiRoot.frame() calls refresh() ~3x/sec on the open screen. The old inspector rebuilt its
      // whole (invisible) card every time; the lens only marks itself stale — the frame loop
      // rebuilds it if and only if it is actually on the glass.
      lensDirty = true;
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
