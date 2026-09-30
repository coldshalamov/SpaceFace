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
  buildSandboxLaunchConfig, requestSandboxGame,
  giveAndEquipItem, spawnEnemyNow, spawnTargetsNow,
} from '../sandbox/sandboxSetup.js';
import { panel, chip, enhanceSelects } from '../uiPrimitives.js';
import { mountCrucibleLabControls } from './crucibleLabControls.js';
import { mountCrucibleLabTelemetry } from './crucibleLabTelemetry.js';

const STYLE_ID = 'sf-sandbox-style';
const COMBAT_LAB_SEED_MAX = 0xffffffff;
const COMBAT_LAB_DIGEST_MAX = 96;

// Last Combat Lab setup that launched successfully. Module-scoped so Relaunch same seed
// can replay it byte-identically after the screen remounts. Never written to ctx.state.
let lastCombatLabSetup = null;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Sandbox-specific layout only. The shared menu fascia (plate, headings, ledger buttons) lives
  // in styles/menu.css. We deliberately use the same .sf-menu tokens so the testing screen reads as
  // part of the game's instrument language rather than a foreign devtools panel.
  s.textContent = `
  .screen.sf-sandbox { max-width: 760px; color: var(--sf-paper); font-family: var(--sf-body-face); }
  /* F2 seam dissolve: the plate's own fill melts into the hero art over its last 120px. Only the
     background fades — the type on it stays at full weight. */
  .screen.sf-sandbox.dp-frame--screen {
    background: linear-gradient(90deg, var(--dp-metal-0) 0, var(--dp-metal-0) calc(100% - 120px), rgb(11 13 16 / 0) 100%);
  }
  /* The stage must be the scroller: as a plain flex child it shrank to the leftover space and its
     overflow painted UNDER the apron, so the launch bar sliced the scenario cards mid-row and the
     fine-tune section below the tiles was unreachable. */
  /* The root already carries the 64px deckplate margin: the stage adds no left gutter of its
     own, so the ladder rail lands exactly on x64 with the Lamp Key below it. */
  .sf-sandbox .sf-stage { overflow-y: auto; overflow-x: hidden; padding: 8px 40px 140px 0; }
  /* F6/F7: the crest stacks title, status tick, sub — one head, not three. Section labels are major
     ticks on the ladder's scale, not ruled web headings. */
  .sf-sandbox .sf-crest {
    display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start;
    gap: 6px; padding: 28px 40px 12px 0;
  }
  /* The one DISPLAY block on this screen. It names .sf-sandbox-now for the hierarchy contract;
     the live status itself is overridden to a 12px tick below, so the rendered eye-winner is the
     Sandbox title alone. */
  .sf-sandbox-title, .sf-sandbox-now {
    font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 125%;
    font-weight: 800; font-size: 28px; letter-spacing: -0.01em; text-transform: none;
    line-height: 1.1; margin: 0; color: rgb(236 230 216);
  }
  .sf-sandbox .sf-crest .sf-sandbox-now {
    font-size: 12px; font-weight: 600; font-stretch: 112%; letter-spacing: .1em;
    text-transform: uppercase; display: inline-flex; align-items: center; gap: 8px;
    color: rgb(236 230 216);
  }
  /* F8: the READY dot is the READY text's bone — one bone, not a dimmer second state. */
  .sf-sandbox-now::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%; flex: none;
    background: rgb(236 230 216);
  }
  /* F10: Ready rests bone. The grammar's 'you' token stays referenced for the role contract at
     zero weight — mint never reaches the glass. Invalid keeps the foe channel: it is the form's
     error state, and the word beside it (never hue alone) carries the meaning. */
  .sf-sandbox-now.is-you { color: color-mix(in srgb, var(--sf-you) 0%, rgb(236 230 216)); }
  .sf-sandbox-now.is-you::before { background: rgb(236 230 216); }
  .sf-sandbox-now.is-foe { color: var(--sf-foe); }
  .sf-sandbox-now.is-foe::before { background: var(--sf-foe); }
  .sf-sandbox .sf-menu-save-summary {
    display: block; font-size: 14px; line-height: 1.45; color: var(--sf-calm); max-width: 60ch;
  }
  .sf-sandbox .sf-section-h {
    margin: 28px 0 12px; color: var(--sf-calm);
    font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 112%;
    font-weight: 600; font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
    display: flex; align-items: center; gap: 12px;
  }
  .sf-sandbox .sf-section-h::after { content: none; }
  .sf-sandbox .sf-section-h::before { content: none; }
  /* F3: group labels are major ticks ON the rail, not dashed web rules. The tick straddles the
     spine (x52-90 at the 64px gutter) and the label starts where the tick ends. Sibling form
     headers (fine-tune, live tools) keep the bare label: they hang off no rail. */
  .sf-sandbox .sf-section-h--rail { position: relative; padding-left: 26px; }
  .sf-sandbox .sf-section-h--rail::before {
    content: ""; position: absolute; left: -12px; top: 50%; width: 38px; height: 2px;
    transform: translateY(-50%); background: rgb(236 230 216 / .4);
  }
  .sf-sandbox-tiles__group { margin: 16px 0 2px -28px; }
  .sf-sandbox-tiles__group:first-child { margin-top: 2px; }
  .sf-sandbox .sf-fig,
  .sf-sandbox-finetune input[type=number],
  .sf-sandbox-lab-form input[type=text],
  .sf-sandbox-lab-form input[type=number] {
    font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0;
  }
  /* F1: the thirteen boxes are one Ladder — rows hang off a single vertical scale. The rail
     sits at the stage's 64px gutter; every row carries its own tick. The ladder is its own scroll
     region ending at y940 with a 60px void fade, so the list clips at the fold and the Launch dock
     below stays clear at every scroll offset. */
  .sf-sandbox-tiles {
    display: flex; flex-direction: column; position: relative; margin: 24px 0 0 -14px; padding: 0 0 0 42px;
    max-height: calc(100vh - 352px); min-height: 200px; overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin; scrollbar-color: rgb(236 230 216 / .25) transparent;
    -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 60px), transparent 100%);
    mask-image: linear-gradient(180deg, #000 calc(100% - 60px), transparent 100%);
  }
  /* F5: the rest spine at ~3:1 — an instrument rail, not a wire at the limit. The box overhangs
     the gutter by 14px so the scroller never clips the bead or the major ticks' left reach; the
     spine itself stays exactly on x64. */
  .sf-sandbox-tiles::before {
    content: ""; position: absolute; left: 14px; top: 14px; bottom: 14px; width: 2px;
    background: rgb(236 230 216 / .4);
  }
  .sf-sandbox-tile {
    position: relative; text-align: left; cursor: pointer; border: none; border-radius: 0;
    background: transparent; color: rgb(236 230 216); padding: 20px 8px 12px 0;
    font-family: var(--sf-body-face);
  }
  .sf-sandbox-tile::before {
    content: ""; position: absolute; left: -28px; top: 50%; width: 12px; height: 2px;
    transform: translateY(-50%); background: rgb(236 230 216 / .3);
  }
  .sf-sandbox-tile:hover::before, .sf-sandbox-tile:focus::before {
    background: rgb(236 230 216 / .75);
  }
  /* F2/F6: the armed row wears a 7px bone bead on the title centerline plus a 24px amber arm on
     the title cap line — bead+arm, the Hand of this screen. F7: 8px air above each title, so the
     title belongs to its body. */
  .sf-sandbox-tile[aria-pressed="true"]::before {
    width: 7px; height: 7px; border-radius: 50%; left: -31px; top: 25px; transform: none;
    background: rgb(236 230 216); box-shadow: 0 0 8px rgb(236 230 216 / .5);
  }
  .sf-sandbox-tile[aria-pressed="true"]::after {
    content: ""; position: absolute; left: -28px; top: 16px; height: 24px; width: 3px;
    background: rgb(242 185 80); box-shadow: 0 0 12px rgb(242 185 80 / .5);
  }
  .sf-sandbox-tile:focus { outline: none; }
  /* F9: focus is a vertical bone light segment on the title, never a box. Scripted focus matches
     :focus even where :focus-visible does not, so the walk can prove it. */
  .sf-sandbox-tile:focus:not([aria-pressed="true"])::after {
    content: ""; position: absolute; left: -28px; top: 16px; height: 24px; width: 3px;
    background: rgb(236 230 216); box-shadow: 0 0 12px rgb(236 230 216 / .5);
  }
  .sf-sandbox-tile__title {
    font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 112%;
    font-weight: 600; font-size: 15px; letter-spacing: .06em; text-transform: uppercase;
    margin-bottom: 4px; color: rgb(236 230 216);
  }
  .sf-sandbox-tile__desc {
    font-family: "Instrument Sans", "Segoe UI", sans-serif; font-size: 14px; line-height: 1.45;
    text-transform: none; letter-spacing: 0; color: var(--sf-calm);
  }
  /* F4: the rail foot sits below the fold-limited ladder — a counter tick with the setup count
     and a bone position bead riding a short scale, so the fold is never a silent cut. The bead
     follows the chosen row. */
  .sf-sandbox-railfoot {
    position: relative; display: flex; align-items: center; gap: 12px;
    margin: 12px 0 0; padding-left: 26px;
    font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 112%;
    font-weight: 600; font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--sf-calm);
  }
  .sf-sandbox-railfoot::before {
    content: ""; position: absolute; left: -12px; top: 50%; width: 38px; height: 2px;
    transform: translateY(-50%); background: rgb(236 230 216 / .4);
  }
  .sf-sandbox-railfoot__track {
    position: relative; width: 64px; height: 2px; flex: none;
    background: rgb(236 230 216 / .3);
  }
  .sf-sandbox-railfoot__bead {
    position: absolute; top: 50%; left: 0; width: 5px; height: 5px; border-radius: 50%;
    background: rgb(236 230 216); transform: translate(-50%, -50%);
  }
  .sf-sandbox-finetune { display: grid; grid-template-columns: max-content 1fr; gap: var(--sp-2) var(--sp-3); align-items: center; }
  .sf-sandbox-finetune label { color: var(--sf-calm); font-size: 12px; }
  .sf-sandbox-finetune select, .sf-sandbox-finetune input[type=number] {
    background: color-mix(in srgb, var(--sf-surface) 72%, transparent); color: var(--sf-paper);
    border: 1px solid var(--sf-edge); border-radius: 2px; padding: var(--sp-1) var(--sp-2);
    font-family: var(--sf-data-face); font-size: 13px; width: 100%;
  }
  .sf-sandbox-checks { display: flex; flex-wrap: wrap; gap: var(--sp-3) var(--sp-4); margin: var(--sp-1) 0 0; }
  .sf-sandbox-checks label {
    display: inline-flex; align-items: center; gap: var(--sp-2); cursor: pointer;
    color: var(--sf-paper); font-size: 13px;
  }
  /* F5: the one Lamp Key — amber field, dark ink, one 45° cut, pinned to the gutter.
     The doubled class outranks the kit's k-word chrome; the goal token seasons the hover.
     F1: docked in the reserved y985-1055 zone the ladder can never enter. */
  .sf-sandbox-launch.sf-sandbox-launch {
    position: fixed; left: var(--dp-margin); bottom: 25px; z-index: 5;
    width: 200px; min-height: 56px; margin: 0; padding: 0 20px;
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    background: rgb(242 185 80); color: rgb(5 7 10);
    font-family: "Archivo", "Instrument Sans", system-ui, sans-serif; font-stretch: 112%;
    font-weight: 800; font-size: 15px; letter-spacing: .08em; text-transform: uppercase;
    text-decoration: none; border: none; border-radius: 0;
    clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
    cursor: pointer;
  }
  .sf-sandbox-launch.sf-sandbox-launch:hover {
    background: color-mix(in srgb, rgb(242 185 80) 82%, var(--sf-goal));
  }
  .sf-sandbox-launch.sf-sandbox-launch:focus-visible {
    outline: 2px solid rgb(236 230 216); outline-offset: 3px;
  }
  .sf-sandbox-launch.sf-sandbox-launch:active { transform: translateY(1px); }
  /* The kit k-word underline would surface on hover/focus: the Key carries no chrome. */
  .sf-sandbox-launch.sf-sandbox-launch::after { content: none; }
  .sf-sandbox-launch.sf-sandbox-launch:disabled { opacity: .45; cursor: not-allowed; }
  /* The lab status chip rests bone like the crest tick — no mint anywhere. Danger keeps foe. */
  .sf-sandbox .sf-chip--good {
    color: rgb(236 230 216); background: transparent;
    border-color: rgb(236 230 216 / .25);
  }
  .sf-sandbox .sf-chip--good .sf-chip__dot { background: rgb(236 230 216); box-shadow: none; }
  /* The apron is the grid pinned foot: its rows start on x64 with the rail and stop above
     the pinned Key, so the last row (Back) is never under it. */
  .sf-sandbox .sf-apron { padding: 0 40px 40px 0; }
  .sf-sandbox-livehint {
    font-size: 12px; color: var(--sf-calm);
    font-style: italic; margin-bottom: var(--sp-2);
  }
  .sf-sandbox-live { display: flex; flex-direction: column; gap: var(--sp-2); }
  .sf-sandbox-picker { display: grid; grid-template-columns: 70px 1fr max-content; gap: var(--sp-2); align-items: center; }
  .sf-sandbox-picker__label { color: var(--sf-calm); font-size: 12px; }
  .sf-sandbox-picker select {
    background: color-mix(in srgb, var(--sf-surface) 72%, transparent); color: var(--sf-paper);
    border: 1px solid var(--sf-edge); border-radius: 2px;
    padding: var(--sp-1) var(--sp-2); font-family: var(--sf-data-face); font-size: 13px; min-width: 0;
  }
  .sf-sandbox-picker button:disabled { opacity: .45; cursor: not-allowed; }
  .sf-sandbox-lab {
    position: relative; margin: 0 0 var(--sp-2); padding: 4px 0 0 28px;
    border: none; background: transparent;
  }
  .sf-sandbox-lab::before {
    content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px;
    background: rgb(236 230 216 / .18);
  }
  .sf-sandbox-lab-form {
    display: grid; grid-template-columns: max-content 1fr; gap: var(--sp-2) var(--sp-3); align-items: center;
  }
  .sf-sandbox-lab-form label { color: var(--sf-calm); font-size: 12px; }
  .sf-sandbox-lab-form select,
  .sf-sandbox-lab-form input[type=text],
  .sf-sandbox-lab-form input[type=number] {
    background: color-mix(in srgb, var(--sf-surface) 72%, transparent); color: var(--sf-paper);
    border: 1px solid var(--sf-edge); border-radius: 2px;
    padding: var(--sp-1) var(--sp-2); font-family: var(--sf-data-face); font-size: 13px; width: 100%;
  }
  .sf-sandbox-lab-seed { display: flex; gap: var(--sp-2); align-items: center; min-width: 0; }
  .sf-sandbox-lab-seed input { flex: 1; min-width: 0; }
  .sf-sandbox-lab-status {
    font-size: 12px; grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center;
  }
  .sf-sandbox-lab-status .sf-chip { font-size: 12px; }
  .sf-sandbox-lab-issues { font-size: 12px; color: var(--sf-foe); line-height: 1.4; }
  .sf-sandbox-lab-digest {
    font-size: 12px; color: var(--sf-calm); font-family: var(--sf-data-face);
    grid-column: 1 / -1; line-height: 1.4; word-break: break-all;
  }
  .sf-sandbox-lab-actions {
    display: flex; flex-wrap: wrap; gap: var(--sp-2); grid-column: 1 / -1; margin-top: var(--sp-1);
  }
  .sf-sandbox-lab-actions button:disabled { opacity: .45; cursor: not-allowed; }
  /* F9: at narrow widths the plate yields to the art — the ladder is already single-column,
     so the plate narrows and the ship clears it. */
  @media (max-width: 1366px) {
    .screen.sf-sandbox { max-width: 600px; }
  }
  @media (max-width: 560px) {
    .sf-sandbox-finetune { grid-template-columns: 1fr; }
    .sf-sandbox-picker { grid-template-columns: 1fr; }
    .sf-sandbox-lab-form { grid-template-columns: 1fr; }
  }
  @media (forced-colors: active) {
    .sf-sandbox-tile, .sf-sandbox-lab {
      background: Canvas; color: CanvasText; border: 1px solid CanvasText;
    }
    .sf-sandbox-launch.sf-sandbox-launch {
      background: ButtonFace; color: ButtonText; clip-path: none; border: 2px solid ButtonText;
    }
    .sf-sandbox-tiles::before, .sf-sandbox-tile::before, .sf-sandbox-lab::before,
    .sf-sandbox .sf-section-h--rail::before, .sf-sandbox-railfoot::before,
    .sf-sandbox-railfoot__track { background: CanvasText; }
    .sf-sandbox-tile[aria-pressed="true"]::before, .sf-sandbox-tile[aria-pressed="true"]::after,
    .sf-sandbox-tile:focus:not([aria-pressed="true"])::after,
    .sf-sandbox-railfoot__bead { background: Highlight; box-shadow: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sf-sandbox, .sf-sandbox * { animation: none !important; transition: none !important; }
  }
  html.sf-reduce-motion .sf-sandbox, html.sf-reduce-motion .sf-sandbox * {
    animation: none !important; transition: none !important;
  }
  `;
  document.head.appendChild(s);
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
    injectStyle();
    rootEl.innerHTML = '';
    // A dev harness is still a screen. It was a bare `.panel` taller than the viewport with nothing
    // to scroll it, so the top and bottom of the form -- including four of its six setup tiles --
    // were simply off the frame. The frame gives it the same margin as everything else and a body
    // that scrolls.
    rootEl.classList.add('screen', 'sf-sandbox', 'dp-frame', 'dp-frame--screen', 'dp-frame__scroll');
    rootEl.dataset.stamp = 'SANDBOX / TEST HARNESS';

    const crest = el('div', 'sf-crest');
    crest.appendChild(el('h1', 'sf-sandbox-title', 'Sandbox'));
    const nowEl = el('div', 'sf-sandbox-now', 'Ready');
    nowEl.setAttribute('role', 'status');
    crest.appendChild(nowEl);
    crest.appendChild(el('div', 'sf-menu-save-summary',
      'Dev testing harness. Pick a scenario or fine-tune below, then launch.'));
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
      tile.addEventListener('click', () => {
        chooseScenario(presetIndex);
        requestSandboxGame(ctx.bus, buildSandboxLaunchConfig(preset.config, readOverrides()));
      });
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
    stage.appendChild(railFoot);
    chooseScenario(0);
    cardGrid.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      chooseScenario(chosenScenario + (event.key === 'ArrowDown' ? 1 : -1), { focus: true });
    });

    // --- Combat Lab ---
    // F3: the lab header ticks on its own panel rail, the same grammar as the ladder groups.
    stage.appendChild(el('div', 'sf-section-h sf-section-h--rail', COMBAT_LAB_SURFACE.title.toUpperCase()));
    const labPanel = panel({ cut: true });
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
    stage.appendChild(el('div', 'sf-section-h', 'FINE-TUNE (applies on launch)'));
    const fine = el('div', 'sf-sandbox-finetune');

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

    const lineLengthLabel = el('label', null, 'Massline length (WU)');
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
    const launch = el('button', 'k-word k-word--emph k-word--primary sf-sandbox-launch', 'Launch');
    launch.type = 'button';
    launchBtn = launch;
    chooseScenario(chosenScenario);
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
    apron.appendChild(el('div', 'sf-section-h', 'LIVE TOOLS (use during flight)'));
    const liveHint = el('div', 'sf-sandbox-livehint',
      'Launch a game first, then re-open this screen (Esc → Sandbox) to use these.');
    apron.appendChild(liveHint);
    sandboxScreen._liveHintEl = liveHint;

    const live = el('div', 'sf-sandbox-live');

    // Weapon picker + Give & Equip
    let weaponSel = document.createElement('select');
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
    rootEl.appendChild(apron);

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
