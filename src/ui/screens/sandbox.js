// Sandbox testing screen (DEV ONLY — never ships in build/web).
//
// A human-facing dev harness for reaching mid-game features without playing for an hour. Quick-setup
// cards launch a preconfigured game; a fine-tune panel overrides the defaults. Every action drives
// the REAL new-game pipeline then mutates live state through the canonical system writers — see
// src/ui/sandbox/sandboxSetup.js for the contract and writer order.
//
// Three production guards (root AGENTS.md §6 one game path): (1) IS_DEV folds false at build time so
// the module is dead-code-eliminated, (2) the main-menu button is IS_DEV-gated, (3) mount() bails
// if IS_DEV is false. Gameplay itself never forks.

import { IS_DEV } from '../../core/devMode.js';
import { SHIPS } from '../../data/ships.js';
import { SECTORS } from '../../data/sectors.js';
import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import {
  COMBAT_LAB_SURFACE,
  COMBAT_LAB_SURFACE_STARTERS,
  COMBAT_LAB_SURFACE_ENEMIES,
  COMBAT_LAB_SURFACE_ARENAS,
  combatLabHullsForStarter,
  combatLabResolveHullId,
} from '../../data/combatLab.js';
import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
  combatLabSetupDigestInput,
} from '../../contracts/combatLabSetupSchema.js';
import {
  SCENARIO_PRESETS, SANDBOX_CAMERA_CANDIDATES, SANDBOX_PHYSICS_LOADOUTS,
  buildSandboxLaunchConfig, requestSandboxGame, emitSandboxEmbarkSpeculation,
  giveAndEquipItem, spawnEnemyNow, spawnTargetsNow,
} from '../sandbox/sandboxSetup.js';
import { panel, chip, enhanceSelects } from '../uiPrimitives.js';
import { mountCrucibleLabControls } from './crucibleLabControls.js';
import { mountCrucibleLabTelemetry } from './crucibleLabTelemetry.js';
import { injectSandboxLayouts } from '../orrery/sandboxLayouts.js';
import { injectOrrery } from '../orrery/tokens.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { svg as orrSvg, arcD, ticksD } from '../orrery/svg.js';

const COMBAT_LAB_SEED_MAX = 0xffffffff;
const COMBAT_LAB_DIGEST_MAX = 96;
/** The choice dial's geometry: a 270° arc gauge on the library's dial convention — degrees, 0 at
 *  12 o'clock, increasing clockwise (src/ui/orrery/svg.js polar()). It starts at 4:30 (135°) and
 *  sweeps clockwise through 12 o'clock, so the 90° gap sits on the right (45°→135°). */
const CHOICE_DIAL = Object.freeze({ size: 112, c: 56, r: 40, a0: 135, sweep: 270, ticks: 26 });

// Last Combat Lab setup that launched successfully. Module-scoped so Relaunch same seed
// can replay it byte-identically after the screen remounts. Never written to ctx.state.
let lastCombatLabSetup = null;

/** The choice dial: an arc gauge reading the chosen setup index (a quantity is an arc).
 *  Bone light — this screen's amber is spent on the Hand (the chosen row's arm) and the Lamp Key.
 *  Returns { wrap, update } — update(index, total) sweeps the arc, moves the bead, swaps the numeral. */
function buildChoiceDial(total) {
  const { size, c, r, a0, sweep, ticks } = CHOICE_DIAL;
  const wrap = el('div', 'sf-sandbox-dial orr-rise');
  wrap.style.setProperty('--orr-delay', '120ms');
  const node = orrSvg('svg', {
    class: 'orr-svg sf-sandbox-dial__svg', viewBox: '0 0 ' + size + ' ' + size,
    width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
  });
  // the scale: minor ticks round the sweep, every fifth a major
  node.appendChild(orrSvg('path', {
    d: ticksD(c, c, r + 10, ticks, { len: 3, major: 5, majorLen: 6, from: a0, to: a0 + sweep }),
    class: 'orr-tick', 'vector-effect': 'non-scaling-stroke',
  }));
  // the track: band + edge (the WEIGHT system — a luminous band with a crisp edge)
  const d = arcD(c, c, r, a0, a0 + sweep);
  node.appendChild(orrSvg('path', { d, class: 'orr-band' }));
  node.appendChild(orrSvg('path', { d, class: 'orr-edge orr-draw' }));
  // the reading: lit core over bloom, swept by dasharray; the bead rides a rotated group
  const bloom = orrSvg('path', { d, class: 'orr-lit-bloom', pathLength: 1 });
  const fill = orrSvg('path', { d, class: 'orr-lit', pathLength: 1 });
  node.appendChild(bloom);
  node.appendChild(fill);
  const beadG = orrSvg('g', { class: 'sf-sandbox-dial__beadg', 'aria-hidden': 'true' });
  beadG.appendChild(orrSvg('circle', { cx: c, cy: c - r, r: 6, class: 'orr-bead-bloom' }));
  beadG.appendChild(orrSvg('circle', { cx: c, cy: c - r, r: 2.6, class: 'orr-bead' }));
  node.appendChild(beadG);
  wrap.appendChild(node);
  const read = el('div', 'sf-sandbox-dial__read');
  const num = el('span', 'orr-numeral sf-sandbox-dial__num', '01');
  const of = el('span', 'sf-sandbox-dial__of', 'of ' + total);
  read.appendChild(num); read.appendChild(of);
  wrap.appendChild(read);
  function update(index, totalNow) {
    const frac = totalNow > 1 ? index / (totalNow - 1) : 1;
    const dash = (0.04 + frac * 0.96).toFixed(4);
    for (const p of [fill, bloom]) {
      p.style.strokeDasharray = dash + ' 1';
    }
    beadG.style.transform = 'rotate(' + (a0 + sweep * frac) + 'deg)';
    num.textContent = String(index + 1).padStart(2, '0');
    of.textContent = 'of ' + totalNow;
    wrap.setAttribute('aria-label',
      'Chosen setup ' + (index + 1) + ' of ' + totalNow);
  }
  return { wrap, update };
}

/** Set a block's arrival slot (ORRERY.md §3.5): rows tick in on a 28ms stagger. */
function rise(elm, delayMs) {
  if (!elm) return;
  elm.classList.add('orr-rise');
  if (elm.style && typeof elm.style.setProperty === 'function') {
    elm.style.setProperty('--orr-delay', delayMs + 'ms');
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Build a labeled picker row: [label] [select?] [action button]. select may be null (button-only). */
function pickerRow(labelText, select, actionBtn) {
  const row = document.createElement('div');
  row.className = 'sf-sandbox-picker';
  const lbl = el('span', 'sf-sandbox-picker__label', labelText);
  row.appendChild(lbl);
  if (select) row.appendChild(select);
  if (actionBtn) row.appendChild(actionBtn);
  return row;
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

function fillSelect(sel, options, value) {
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    sel.appendChild(o);
  }
  if (value != null) sel.value = value;
  return sel;
}

function parseCombatLabSeed(text, rollSource) {
  const trimmed = text == null ? '' : String(text).trim();
  if (trimmed === '') {
    return typeof rollSource === 'function' ? rollCombatLabSeed(rollSource) : Number.NaN;
  }
  if (!/^[0-9]+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

function parseCombatLabWave(text) {
  const trimmed = text == null ? '' : String(text).trim();
  if (trimmed === '') return 1;
  if (!/^[0-9]+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

function formatCombatLabDigest(setup) {
  if (!setup) return '';
  const text = combatLabSetupDigestInput(setup).join(' ');
  if (text.length <= COMBAT_LAB_DIGEST_MAX) return text;
  return text.slice(0, COMBAT_LAB_DIGEST_MAX - 1) + '\u2026';
}

function formatCombatLabIssuePaths(issues) {
  const paths = [];
  for (const issue of issues || []) {
    const path = issue && issue.path;
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths.join(', ');
}

/** Map any numeric roll source into the v1 seed range 1..0xffffffff. Zero is invalid. */
export function rollCombatLabSeed(source) {
  const raw = typeof source === 'function' ? source() : 0;
  let n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) n = 1;
  if (n < 1) n = 1;
  if (n > COMBAT_LAB_SEED_MAX) n = COMBAT_LAB_SEED_MAX;
  return n;
}

/** Pure form reader. All `values` are strings (as from <select>/<input>). No Math.random. */
export function readCombatLabForm(values, rollSource) {
  const src = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const starterId = src.starterPackageId == null ? '' : String(src.starterPackageId);
  const pkg = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterId);
  const hullText = src.hullId == null ? '' : String(src.hullId).trim();
  const hullId = hullText || (pkg && pkg.hullId) || '';
  const loadout = pkg && Array.isArray(pkg.loadout)
    ? pkg.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }))
    : [];
  const candidate = {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId,
    loadout,
    enemyPackageId: src.enemyPackageId == null ? '' : String(src.enemyPackageId),
    arenaId: src.arenaId == null ? '' : String(src.arenaId),
    seed: parseCombatLabSeed(src.seed, rollSource),
    wave: parseCombatLabWave(src.wave),
  };
  return validateCombatLabSetup(candidate);
}

/** Same-seed restart: relaunch reuses the stored normalized setup, not live form values. */
export function combatLabRelaunchConfig(lastSetup) {
  return buildSandboxLaunchConfig({}, { combatLabSetup: lastSetup });
}

/** Stored setup changes only on a successful launch. Failed attempts and form edits leave it. */
export function nextCombatLabStoredSetup(stored, result) {
  if (result && result.ok && result.value) return result.value;
  return stored || null;
}

/** Emit game:new for a stored/normalized setup. No-op when there is nothing to launch. */
export function emitCombatLabLaunch(bus, setup) {
  if (!setup) return false;
  requestSandboxGame(bus, combatLabRelaunchConfig(setup));
  return true;
}

export const sandboxScreen = {
  id: 'sandbox',

  mount(rootEl, ctx) {
    const doc = rootEl.ownerDocument || document;
    injectOrrery(doc);
    injectSandboxLayouts(doc);
    rootEl.innerHTML = '';
    // A dev harness is still a screen. It was a bare `.panel` taller than the viewport with nothing
    // to scroll it, so the top and bottom of the form -- including four of its six setup tiles --
    // were simply off the frame. The frame gives it the same margin as everything else and a body
    // that scrolls.
    rootEl.classList.add('screen', 'sf-sandbox', 'dp-frame', 'dp-frame--screen', 'dp-frame__scroll');
    rootEl.dataset.stamp = 'SANDBOX / TEST HARNESS';

    // The crest: the deckplate nameplate (eyebrow / display name) with the choice dial — the
    // screen's instrument — riding the name row's right end. One display element, one reading.
    const crest = el('div', 'sf-crest');
    rise(crest, 0);
    crest.appendChild(el('div', 'dp-title__eyebrow', 'DEV HARNESS · TEST ROUTES'));
    const nameBar = el('div', 'sf-sandbox-namebar');
    nameBar.appendChild(el('h1', 'sf-sandbox-name', 'Sandbox'));
    const choiceDial = buildChoiceDial(SCENARIO_PRESETS.length);
    nameBar.appendChild(choiceDial.wrap);
    crest.appendChild(nameBar);
    const nowEl = el('div', 'sf-sandbox-now', 'Ready');
    nowEl.setAttribute('role', 'status');
    crest.appendChild(nowEl);
    crest.appendChild(el('div', 'sf-menu-save-summary',
      'Dev testing harness. Pick a scenario or fine-tune below, then launch.'));
    crest.appendChild(el('div', 'dp-title__rule'));
    rootEl.appendChild(crest);

    const stage = el('div', 'sf-stage');
    const apron = el('div', 'sf-apron');

    // --- Quick-setup tiles ---
    // F3: the ladder carries its own group rhythm — both headers ride INSIDE the rail as major
    // ticks, so the spine runs through them. Plain presets group first, staged scenarios second.
    const cardGrid = el('div', 'sf-sandbox-tiles');
    cardGrid.setAttribute('role', 'group');
    cardGrid.setAttribute('aria-label', 'Scenarios');
    stage.appendChild(cardGrid);
    const groupHead = (text) => el('div', 'sf-section-h sf-section-h--rail sf-sandbox-tiles__group', text);
    let readOverrides = () => ({});
    // F1/F5: the ladder holds one chosen scenario (the bead + amber arm). A tile click chooses
    // the row and fires it — the playtest probe's contract — while the Launch key fires whatever
    // row is chosen. Arrow keys walk the choice without firing.
    let chosenScenario = 0;
    let launchBtn = null;
    let railBead = null;
    const tileBtns = [];
    const chooseScenario = (index, { focus = false } = {}) => {
      const next = Math.max(0, Math.min(SCENARIO_PRESETS.length - 1, index));
      chosenScenario = next;
      if (railBead) {
        const span = Math.max(1, SCENARIO_PRESETS.length - 1);
        railBead.style.left = ((next / span) * 100).toFixed(1) + '%';
      }
      if (choiceDial) choiceDial.update(next, SCENARIO_PRESETS.length);
      tileBtns.forEach((btn, i) => btn.setAttribute('aria-pressed', i === next ? 'true' : 'false'));
      const preset = SCENARIO_PRESETS[next];
      if (launchBtn && preset) {
        launchBtn.setAttribute('aria-label', 'Launch with these settings: ' + preset.title);
      }
      if (focus && tileBtns[next] && typeof tileBtns[next].focus === 'function') tileBtns[next].focus();
    };
    cardGrid.appendChild(groupHead('QUICK SETUPS'));
    let stagedHeadAdded = false;
    SCENARIO_PRESETS.forEach((preset, presetIndex) => {
      if (!stagedHeadAdded && preset.config && preset.config.scenarioId) {
        cardGrid.appendChild(groupHead('STAGED SCENARIOS'));
        stagedHeadAdded = true;
      }
      const tile = el('button', 'sf-sandbox-tile');
      tile.type = 'button';
      tile.setAttribute('aria-pressed', 'false');
      tile.appendChild(el('div', 'sf-sandbox-tile__title', preset.title));
      tile.appendChild(el('div', 'sf-sandbox-tile__desc', preset.description));
      // Arrival: rows tick in on the 28ms stagger (ORRERY.md §3.5), capped so thirteen rows
      // finish inside the first second.
      rise(tile, Math.min(180 + presetIndex * 28, 520));
      tile.addEventListener('click', () => {
        chooseScenario(presetIndex);
        requestSandboxGame(ctx.bus, buildSandboxLaunchConfig(preset.config, readOverrides()));
      });
      // Picker dwell is real warm lead: arm the embark warm for the hovered/focused
      // scenario's sector + hull so launch doesn't decode the scenario inside the window.
      const armPreset = () => emitSandboxEmbarkSpeculation(ctx.bus, preset.config);
      tile.addEventListener('pointerenter', armPreset);
      tile.addEventListener('focusin', armPreset);
      tileBtns.push(tile);
      cardGrid.appendChild(tile);
    });
    // F4: the rail foot lands right below the fold-limited ladder — count plus position bead.
    const railFoot = el('div', 'sf-sandbox-railfoot');
    railFoot.setAttribute('aria-hidden', 'true');
    railFoot.appendChild(el('span', 'sf-sandbox-railfoot__label', SCENARIO_PRESETS.length + ' SETUPS'));
    const railTrack = el('div', 'sf-sandbox-railfoot__track');
    railBead = el('div', 'sf-sandbox-railfoot__bead');
    railTrack.appendChild(railBead);
    railFoot.appendChild(railTrack);
    rise(railFoot, 140);
    stage.appendChild(railFoot);
    chooseScenario(0);
    cardGrid.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      chooseScenario(chosenScenario + (event.key === 'ArrowDown' ? 1 : -1), { focus: true });
    });

    // --- Combat Lab ---
    // F3: the lab header ticks on its own panel rail, the same grammar as the ladder groups.
    const labHead = el('div', 'sf-section-h sf-section-h--rail', COMBAT_LAB_SURFACE.title.toUpperCase());
    rise(labHead, 240);
    stage.appendChild(labHead);
    const labPanel = panel({ cut: true });
    rise(labPanel, 280);
    labPanel.classList.add('sf-sandbox-lab');
    const labForm = el('div', 'sf-sandbox-lab-form');

    const defaultStarterId = COMBAT_LAB_SURFACE_STARTERS[0] && COMBAT_LAB_SURFACE_STARTERS[0].id;
    const initialHulls = combatLabHullsForStarter(defaultStarterId);
    const initialHullId = combatLabResolveHullId(defaultStarterId, initialHulls[0] && initialHulls[0].id);

    const hullLabel = el('label', null, COMBAT_LAB_SURFACE.fields[0].label);
    hullLabel.htmlFor = 'sf-sandbox-lab-hull';
    const hullSel = document.createElement('select');
    hullSel.id = 'sf-sandbox-lab-hull';
    hullSel.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[0].label);
    fillSelect(hullSel, initialHulls, initialHullId);
    labForm.appendChild(hullLabel);
    labForm.appendChild(hullSel);

    const starterLabel = el('label', null, COMBAT_LAB_SURFACE.fields[1].label);
    starterLabel.htmlFor = 'sf-sandbox-lab-starter';
    const starterSel = document.createElement('select');
    starterSel.id = 'sf-sandbox-lab-starter';
    starterSel.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[1].label);
    fillSelect(starterSel, COMBAT_LAB_SURFACE_STARTERS, defaultStarterId);
    labForm.appendChild(starterLabel);
    labForm.appendChild(starterSel);

    const enemyLabel = el('label', null, COMBAT_LAB_SURFACE.fields[2].label);
    enemyLabel.htmlFor = 'sf-sandbox-lab-enemy';
    const enemySelLab = document.createElement('select');
    enemySelLab.id = 'sf-sandbox-lab-enemy';
    enemySelLab.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[2].label);
    fillSelect(enemySelLab, COMBAT_LAB_SURFACE_ENEMIES, COMBAT_LAB_SURFACE_ENEMIES[0] && COMBAT_LAB_SURFACE_ENEMIES[0].id);
    labForm.appendChild(enemyLabel);
    labForm.appendChild(enemySelLab);

    const arenaLabel = el('label', null, COMBAT_LAB_SURFACE.fields[3].label);
    arenaLabel.htmlFor = 'sf-sandbox-lab-arena';
    const arenaSel = document.createElement('select');
    arenaSel.id = 'sf-sandbox-lab-arena';
    arenaSel.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[3].label);
    fillSelect(arenaSel, COMBAT_LAB_SURFACE_ARENAS, COMBAT_LAB_SURFACE_ARENAS[0] && COMBAT_LAB_SURFACE_ARENAS[0].id);
    labForm.appendChild(arenaLabel);
    labForm.appendChild(arenaSel);

    const seedLabel = el('label', null, COMBAT_LAB_SURFACE.fields[4].label);
    seedLabel.htmlFor = 'sf-sandbox-lab-seed';
    const seedRow = el('div', 'sf-sandbox-lab-seed');
    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.id = 'sf-sandbox-lab-seed';
    seedInput.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[4].label);
    seedInput.inputMode = 'numeric';
    seedInput.autocomplete = 'off';
    seedInput.spellcheck = false;
    seedInput.value = '1';
    seedInput.className = 'sf-fig';
    const rollBtn = el('button', 'k-word k-word--emph', COMBAT_LAB_SURFACE.rollLabel);
    rollBtn.type = 'button';
    rollBtn.setAttribute('aria-label', COMBAT_LAB_SURFACE.rollLabel + ' seed');
    seedRow.appendChild(seedInput);
    seedRow.appendChild(rollBtn);
    labForm.appendChild(seedLabel);
    labForm.appendChild(seedRow);

    const waveLabel = el('label', null, COMBAT_LAB_SURFACE.fields[5].label);
    waveLabel.htmlFor = 'sf-sandbox-lab-wave';
    const waveInput = document.createElement('input');
    waveInput.type = 'number';
    waveInput.id = 'sf-sandbox-lab-wave';
    waveInput.setAttribute('aria-label', COMBAT_LAB_SURFACE.fields[5].label);
    waveInput.min = '1';
    waveInput.step = '1';
    waveInput.value = '1';
    waveInput.className = 'sf-fig';
    labForm.appendChild(waveLabel);
    labForm.appendChild(waveInput);

    enhanceSelects(labForm);
    const hullWidget = labForm.querySelector('#sf-sandbox-lab-hull');
    const starterWidget = labForm.querySelector('#sf-sandbox-lab-starter');
    const enemyWidget = labForm.querySelector('#sf-sandbox-lab-enemy');
    const arenaWidget = labForm.querySelector('#sf-sandbox-lab-arena');

    const statusRow = el('div', 'sf-sandbox-lab-status');
    statusRow.setAttribute('role', 'status');
    statusRow.setAttribute('aria-live', 'polite');
    let statusChip = chip('Ready', { tone: 'good', dot: true });
    const issueLine = el('span', 'sf-sandbox-lab-issues', '');
    statusRow.appendChild(statusChip);
    statusRow.appendChild(issueLine);
    labForm.appendChild(statusRow);

    const digestLine = el('div', 'sf-sandbox-lab-digest sf-fig', '');
    digestLine.setAttribute('aria-label', 'Combat Lab setup summary');
    labForm.appendChild(digestLine);

    const labActions = el('div', 'sf-sandbox-lab-actions');
    // Bone word, not the primary: this screen already has its one amber verb, the Launch Lamp Key.
    const labLaunch = el('button', 'k-word k-word--emph', COMBAT_LAB_SURFACE.launchLabel);
    labLaunch.type = 'button';
    const labRelaunch = el('button', 'k-word k-word--emph', COMBAT_LAB_SURFACE.relaunchLabel);
    labRelaunch.type = 'button';
    labRelaunch.disabled = !lastCombatLabSetup;
    labActions.appendChild(labLaunch);
    labActions.appendChild(labRelaunch);
    labForm.appendChild(labActions);
    // Dispose a previous mount before re-mounting: the screen can be rebuilt without an onHide,
    // and the controls hold bus listeners that would otherwise survive with a detached DOM node.
    if (sandboxScreen._labControls && typeof sandboxScreen._labControls.dispose === 'function') {
      sandboxScreen._labControls.dispose();
    }
    sandboxScreen._labControls = mountCrucibleLabControls(ctx, labForm);

    labPanel.appendChild(labForm);
    if (typeof sandboxScreen._telemetryDispose === 'function') {
      sandboxScreen._telemetryDispose();
      sandboxScreen._telemetryDispose = null;
    }
    sandboxScreen._telemetryDispose = mountCrucibleLabTelemetry(ctx, labPanel);
    // uiRoot prewarms hidden screens without onHide; only onShow starts live refresh.
    sandboxScreen._telemetryDispose();
    stage.appendChild(labPanel);

    function readLabValues() {
      return {
        hullId: String((hullWidget && hullWidget.value) || ''),
        starterPackageId: String((starterWidget && starterWidget.value) || ''),
        enemyPackageId: String((enemyWidget && enemyWidget.value) || ''),
        arenaId: String((arenaWidget && arenaWidget.value) || ''),
        seed: String(seedInput.value || ''),
        wave: String(waveInput.value || ''),
      };
    }

    function setHullOffer(starterId, currentHullId) {
      const hulls = combatLabHullsForStarter(starterId);
      const nextId = combatLabResolveHullId(starterId, currentHullId);
      if (hullWidget && typeof hullWidget.sfSetOptions === 'function') {
        hullWidget.sfSetOptions(hulls.map((hull) => ({ value: hull.id, label: hull.label })), nextId);
        return;
      }
      if (!hullWidget) return;
      hullWidget.textContent = '';
      fillSelect(hullWidget, hulls, nextId);
    }

    function refreshLabSurface() {
      const result = readCombatLabForm(readLabValues());
      const nextChip = chip(result.ok ? 'Ready' : 'Invalid', {
        tone: result.ok ? 'good' : 'danger',
        dot: true,
      });
      statusChip.replaceWith(nextChip);
      statusChip = nextChip;
      nowEl.textContent = result.ok ? 'Ready' : 'Invalid';
      nowEl.classList.toggle('is-you', result.ok);
      nowEl.classList.toggle('is-foe', !result.ok);
      issueLine.textContent = result.ok ? '' : formatCombatLabIssuePaths(result.issues);
      digestLine.textContent = result.ok ? formatCombatLabDigest(result.value) : 'Setup invalid';
      labLaunch.disabled = !result.ok;
      return result;
    }

    rollBtn.addEventListener('click', () => {
      seedInput.value = String(rollCombatLabSeed(() => 1 + Math.floor(Math.random() * COMBAT_LAB_SEED_MAX)));
      refreshLabSurface();
    });

    let lastStarterId = String((starterWidget && starterWidget.value) || '');
    labForm.addEventListener('change', () => {
      const starterId = String((starterWidget && starterWidget.value) || '');
      if (starterId !== lastStarterId) {
        const currentHull = String((hullWidget && hullWidget.value) || '');
        lastStarterId = starterId;
        setHullOffer(starterId, currentHull);
      }
      refreshLabSurface();
    });
    seedInput.addEventListener('input', () => { refreshLabSurface(); });
    waveInput.addEventListener('input', () => { refreshLabSurface(); });

    labLaunch.addEventListener('click', () => {
      const result = refreshLabSurface();
      lastCombatLabSetup = nextCombatLabStoredSetup(lastCombatLabSetup, result);
      if (!result.ok || !result.value) return;
      labRelaunch.disabled = false;
      emitCombatLabLaunch(ctx.bus, lastCombatLabSetup);
    });

    labRelaunch.addEventListener('click', () => {
      emitCombatLabLaunch(ctx.bus, lastCombatLabSetup);
    });

    refreshLabSurface();

    // --- Fine-tune ---
    const fineHead = el('div', 'sf-section-h', 'FINE-TUNE (applies on launch)');
    rise(fineHead, 320);
    stage.appendChild(fineHead);
    const fine = el('div', 'sf-sandbox-finetune');
    rise(fine, 360);

    const shipLabel = el('label', null, 'Starting ship');
    shipLabel.htmlFor = 'sf-sandbox-ship';
    let shipSel = document.createElement('select');
    shipSel.id = 'sf-sandbox-ship';
    for (const ship of SHIPS) {
      const o = document.createElement('option');
      o.value = ship.id;
      o.textContent = ship.name + ' (tier ' + ship.tier + ')';
      shipSel.appendChild(o);
    }
    shipSel.value = 'ship_kestrel';
    fine.appendChild(shipLabel); fine.appendChild(shipSel);

    const sectorLabel = el('label', null, 'Start sector');
    sectorLabel.htmlFor = 'sf-sandbox-sector';
    let sectorSel = document.createElement('select');
    sectorSel.id = 'sf-sandbox-sector';
    for (const sec of SECTORS) {
      const o = document.createElement('option');
      o.value = sec.id;
      o.textContent = sec.name + ' (tier ' + sec.tier + ')';
      sectorSel.appendChild(o);
    }
    sectorSel.value = 'sector_helios_prime';
    fine.appendChild(sectorLabel); fine.appendChild(sectorSel);

    // Form edits are dwell time too: the ship/sector the launch button will use is knowable
    // before the click, so arm the same embark warm the preset tiles get on hover.
    const armFineTune = () => emitSandboxEmbarkSpeculation(ctx.bus, {
      sectorId: sectorSel.value || undefined,
      shipId: shipSel.value || undefined,
    });
    shipSel.addEventListener('change', armFineTune);
    sectorSel.addEventListener('change', armFineTune);

    const cameraLabel = el('label', null, 'Camera candidate');
    cameraLabel.htmlFor = 'sf-sandbox-camera';
    let cameraSel = document.createElement('select');
    cameraSel.id = 'sf-sandbox-camera';
    const cameraDefault = document.createElement('option');
    cameraDefault.value = '';
    cameraDefault.textContent = 'Use preset / current';
    cameraSel.appendChild(cameraDefault);
    for (const candidate of SANDBOX_CAMERA_CANDIDATES) {
      const o = document.createElement('option');
      o.value = candidate.id;
      o.textContent = candidate.label;
      cameraSel.appendChild(o);
    }
    fine.appendChild(cameraLabel); fine.appendChild(cameraSel);

    const loadoutLabel = el('label', null, 'Physics loadout');
    loadoutLabel.htmlFor = 'sf-sandbox-physics-loadout';
    let loadoutSel = document.createElement('select');
    loadoutSel.id = 'sf-sandbox-physics-loadout';
    const loadoutDefault = document.createElement('option');
    loadoutDefault.value = '';
    loadoutDefault.textContent = 'Use preset / current';
    loadoutSel.appendChild(loadoutDefault);
    for (const loadout of SANDBOX_PHYSICS_LOADOUTS) {
      const o = document.createElement('option');
      o.value = loadout.id;
      o.textContent = loadout.label;
      loadoutSel.appendChild(o);
    }
    fine.appendChild(loadoutLabel); fine.appendChild(loadoutSel);

    const enemyCountLabel = el('label', null, 'Enemy count override');
    enemyCountLabel.htmlFor = 'sf-sandbox-enemy-count';
    const enemyCountInput = document.createElement('input');
    enemyCountInput.type = 'number';
    enemyCountInput.id = 'sf-sandbox-enemy-count';
    enemyCountInput.min = '0';
    enemyCountInput.max = '20';
    enemyCountInput.placeholder = 'Preset';
    enemyCountInput.value = '';
    fine.appendChild(enemyCountLabel); fine.appendChild(enemyCountInput);

    const lineLengthLabel = el('label', null, 'Massline length (u)');
    lineLengthLabel.htmlFor = 'sf-sandbox-line-length';
    const lineLengthInput = document.createElement('input');
    lineLengthInput.type = 'number';
    lineLengthInput.id = 'sf-sandbox-line-length';
    lineLengthInput.min = '60';
    lineLengthInput.max = '600';
    lineLengthInput.step = '10';
    lineLengthInput.placeholder = 'Preset / 140';
    lineLengthInput.value = '';
    fine.appendChild(lineLengthLabel); fine.appendChild(lineLengthInput);

    const anchorMassLabel = el('label', null, 'Anchor mass');
    anchorMassLabel.htmlFor = 'sf-sandbox-anchor-mass';
    const anchorMassInput = document.createElement('input');
    anchorMassInput.type = 'number';
    anchorMassInput.id = 'sf-sandbox-anchor-mass';
    anchorMassInput.min = '1';
    anchorMassInput.max = '1000000';
    anchorMassInput.step = '100';
    anchorMassInput.placeholder = 'Preset / 400';
    anchorMassInput.value = '';
    fine.appendChild(anchorMassLabel); fine.appendChild(anchorMassInput);

    const creditsLabel = el('label', null, 'Credits');
    creditsLabel.htmlFor = 'sf-sandbox-credits';
    const creditsInput = document.createElement('input');
    creditsInput.type = 'number';
    creditsInput.id = 'sf-sandbox-credits';
    creditsInput.min = '0';
    creditsInput.step = '1000';
    creditsInput.value = '500000';
    creditsInput.className = 'sf-fig';
    fine.appendChild(creditsLabel); fine.appendChild(creditsInput);

    // Swap the native <select>s for the Deckplate widget — the lab form above is enhanced but
    // these were not, so the same screen rendered two different dropdown styles. The widgets
    // expose .value, so the launch readers below keep working unchanged.
    [shipSel, sectorSel, cameraSel, loadoutSel] = enhanceSelects(fine);
    stage.appendChild(fine);

    // Toggles row
    const checks = el('div', 'sf-sandbox-checks');
    const toggles = [
      ['unlockAllTech', 'Unlock all tech', true],
      ['grantAllModules', 'Grant all weapons & modules', true],
      ['maxReputation', 'Max reputation (all factions)', false],
      ['masslineEnabled', 'Spawn a Massline test anchor', false],
    ];
    const checkboxes = {};
    for (const [key, label, def] of toggles) {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = def;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(label));
      checks.appendChild(lbl);
      checkboxes[key] = cb;
    }
    stage.appendChild(checks);
    rootEl.appendChild(stage);

    readOverrides = () => {
      const enemyRaw = enemyCountInput.value.trim();
      return {
        cameraCandidate: cameraSel.value || undefined,
        physicsLoadout: loadoutSel.value || undefined,
        enemyCount: enemyRaw === '' ? undefined : Number(enemyRaw),
        masslineEnabled: checkboxes.masslineEnabled.checked,
        lineLength: lineLengthInput.value.trim() === '' ? undefined : Number(lineLengthInput.value),
        anchorMass: anchorMassInput.value.trim() === '' ? undefined : Number(anchorMassInput.value),
      };
    };

    // --- Launch ---
    // F5: the Lamp Key fires the ladder's chosen scenario. The fine-tune panel overrides it only
    // where the tester moved a control off its default — so a zero-grant room like Sling Practice
    // stays zero-grant until someone actually edits the form.
    const launch = el('button', 'sf-sandbox-launch', 'Launch');
    launch.type = 'button';
    launchBtn = launch;
    chooseScenario(chosenScenario);
    // The library's Lamp Key dresses the screen's one primary verb: amber field, 45° cut, sheen,
    // hot hover, and a rim instead of a field when a state ever disables it.
    dressLampKey(launch);
    rise(launch, 420);
    launch.addEventListener('click', () => {
      const preset = SCENARIO_PRESETS[chosenScenario] || SCENARIO_PRESETS[0];
      const config = { ...preset.config };
      if (shipSel.value && shipSel.value !== 'ship_kestrel') config.shipId = shipSel.value;
      if (sectorSel.value && sectorSel.value !== 'sector_helios_prime') config.sectorId = sectorSel.value;
      const credits = parseInt(creditsInput.value, 10);
      if (Number.isFinite(credits) && credits !== 500000) config.credits = Math.max(0, credits);
      if (!checkboxes.unlockAllTech.checked) config.unlockAllTech = false;
      if (!checkboxes.grantAllModules.checked) config.grantAllModules = false;
      if (checkboxes.maxReputation.checked) config.maxReputation = true;
      requestSandboxGame(ctx.bus, buildSandboxLaunchConfig(config, readOverrides()));
    });
    apron.appendChild(launch);

    // --- Live Tools (in-flight only) ---
    // These mutate the RUNNING game directly via system writers — they don't relaunch. Disabled
    // until a game is in flight; onShow() re-checks the mode and enables them.
    const liveHead = el('div', 'sf-section-h', 'LIVE TOOLS (use during flight)');
    rise(liveHead, 460);
    apron.appendChild(liveHead);
    const liveHint = el('div', 'sf-sandbox-livehint',
      'Launch a game first, then re-open this screen (Esc → Sandbox) to use these.');
    rise(liveHint, 480);
    apron.appendChild(liveHint);
    sandboxScreen._liveHintEl = liveHint;

    const live = el('div', 'sf-sandbox-live');
    rise(live, 500);

    // Weapon picker + Give & Equip
    let weaponSel = document.createElement('select');
    weaponSel.setAttribute('aria-label', 'Weapon');
    for (const w of WEAPONS) {
      const o = document.createElement('option');
      o.value = w.id;
      o.textContent = w.name + ' — ' + w.size + ' ' + w.damageType + ' (dps ' + (w.dps || '?') + ')';
      weaponSel.appendChild(o);
    }
    const giveWeaponBtn = el('button', 'k-word k-word--emph', 'Give & Equip');
    giveWeaponBtn.type = 'button';
    giveWeaponBtn.addEventListener('click', () => {
      if (weaponSel.value) giveAndEquipItem(sandboxScreen._ctx, weaponSel.value);
    });

    // Module picker + Give & Equip
    let moduleSel = document.createElement('select');
    moduleSel.setAttribute('aria-label', 'Module');
    for (const m of MODULES) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name + ' — ' + m.slotType + ' ' + m.size;
      moduleSel.appendChild(o);
    }
    const giveModuleBtn = el('button', 'k-word k-word--emph', 'Give & Equip');
    giveModuleBtn.type = 'button';
    giveModuleBtn.addEventListener('click', () => {
      if (moduleSel.value) giveAndEquipItem(sandboxScreen._ctx, moduleSel.value);
    });

    // Enemy picker + Spawn
    let enemySel = document.createElement('select');
    enemySel.setAttribute('aria-label', 'Enemy type');
    for (const e of ENEMY_TYPES) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.name + (e.aiArchetype ? ' (' + e.aiArchetype + ')' : '');
      enemySel.appendChild(o);
    }
    enemySel.value = 'wasp_swarmer';
    const spawnEnemyBtn = el('button', 'k-word k-word--emph', 'Spawn 1');
    spawnEnemyBtn.type = 'button';
    spawnEnemyBtn.addEventListener('click', () => {
      if (enemySel.value) spawnEnemyNow(sandboxScreen._ctx, enemySel.value, 1);
    });

    // Target drones button (no picker — fixed inert drone)
    const spawnTargetsBtn = el('button', 'k-word k-word--emph', 'Spawn 3 target drones');
    spawnTargetsBtn.type = 'button';
    spawnTargetsBtn.addEventListener('click', () => {
      spawnTargetsNow(sandboxScreen._ctx, 3);
    });

    live.appendChild(pickerRow('Weapon', weaponSel, giveWeaponBtn));
    live.appendChild(pickerRow('Module', moduleSel, giveModuleBtn));
    live.appendChild(pickerRow('Enemy', enemySel, spawnEnemyBtn));
    live.appendChild(pickerRow('Targets', null, spawnTargetsBtn));
    // Same Deckplate swap as the fine-tune panel; the widgets carry .value/.disabled so the
    // button closures and the in-flight disable toggle below keep working unchanged.
    [weaponSel, moduleSel, enemySel] = enhanceSelects(live);
    apron.appendChild(live);

    // Stash refs for onShow to enable/disable based on flight mode.
    sandboxScreen._liveEls = [weaponSel, moduleSel, enemySel, giveWeaponBtn, giveModuleBtn, spawnEnemyBtn, spawnTargetsBtn];

    // --- Back ---
    const back = el('button', 'k-word k-word--emph', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
    });
    apron.appendChild(back);
    // In the stage's flow, after fine-tune: see the .sf-apron rule in injectStyle.
    stage.appendChild(apron);

    sandboxScreen._ctx = ctx;
  },

  onShow(ctx) {
    // Live tools need a running game (a player entity exists). Both 'flight' and 'paused' count —
    // the sandbox is reachable from the pause menu, where mode is 'paused' but the game is live.
    // Mode flips to 'menu' only on the title screen / game-over, where no player entity exists.
    const c = ctx || sandboxScreen._ctx;
    const inGame = !!(c && c.state && c.state.playerId && c.state.entities.get(c.state.playerId));
    if (sandboxScreen._liveEls) {
      for (const elx of sandboxScreen._liveEls) { elx.disabled = !inGame; }
    }
    if (sandboxScreen._liveHintEl) {
      sandboxScreen._liveHintEl.style.display = inGame ? 'none' : '';
    }
    const telemetry = sandboxScreen._telemetryDispose;
    if (telemetry && typeof telemetry.resume === 'function') telemetry.resume();
  },
  onHide() {
    if (typeof sandboxScreen._telemetryDispose === 'function') {
      sandboxScreen._telemetryDispose();
    }
    if (sandboxScreen._labControls && typeof sandboxScreen._labControls.dispose === 'function') {
      sandboxScreen._labControls.dispose();
      sandboxScreen._labControls = null;
    }
  },
  refresh() {},
};

export default sandboxScreen;
