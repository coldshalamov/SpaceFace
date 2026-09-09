// Combat Lab runtime controls. Pure request builders plus a thin DOM mount.
// Every effect is a request to the owner that already owns the concept — never a raw
// cross-owner write from the UI, and never a write to state.run.
// Speed (timeEffects), clear-enemies (removeEntity + spawnBudget), refill/invulnerable
// (bus intents owned by combat/weapons), and Step (ctx.simStep).
//
// The DOM layer is kit rows (styles/kit.css, src/ui/kit/) — Frontend Task D §1.4. This file owns no
// CSS. The controls are instruments, not a debug dump: one row per concept, the choice as words.

import { createTimeEffects, LAB_SPEED_MAX } from '../../core/timeEffects.js';
import { el } from '../kit/index.js';

export const CRUCIBLE_LAB_SPEED_SOURCE = 'crucible-lab:speed';
export const LAB_BUDGET_OWNER_PREFIX = 'combat-lab:';
export const CLEAR_HARD_MAX = 40;
export const LEGAL_TIME_SCALES = Object.freeze([0.25, 0.5, 1, 2, LAB_SPEED_MAX]);

export function requestTimeScale(scale) {
  const allowed = LEGAL_TIME_SCALES.includes(scale);
  return allowed
    ? { ok: true, kind: 'timeScale', scale }
    : { ok: false, kind: 'timeScale', scale };
}

export function requestClearEnemies() {
  return { ok: true, kind: 'clearEnemies' };
}

export function requestRefill() {
  return { ok: true, kind: 'refill' };
}

export function requestInvulnerable(on) {
  return typeof on === 'boolean'
    ? { ok: true, kind: 'invulnerable', on }
    : { ok: false, kind: 'invulnerable', on };
}

export function requestStep() {
  return { ok: true, kind: 'step' };
}

export function applyCrucibleLabControl(ctx, request) {
  try {
    return applyInner(ctx, request) || false;
  } catch {
    return false;
  }
}

function applyInner(ctx, request) {
  if (!request || request.ok === false || typeof request.kind !== 'string') return false;
  if (!getPlayerEntity(ctx)) return false;
  if (!isLiveCombatLab(ctx)) return false;

  switch (request.kind) {
    case 'timeScale': return applyTimeScale(ctx, request.scale);
    case 'clearEnemies': return applyClearEnemies(ctx);
    case 'refill': return applyRefill(ctx);
    case 'invulnerable': return applyInvulnerable(ctx, request);
    case 'step': return applyStep(ctx);
    default: return false;
  }
}

function getPlayerEntity(ctx) {
  const state = ctx && ctx.state;
  if (!state || state.playerId == null || !state.entities || typeof state.entities.get !== 'function') {
    return null;
  }
  const entity = state.entities.get(state.playerId);
  return entity || null;
}

function isLiveCombatLab(ctx) {
  const run = ctx && ctx.state && ctx.state.run;
  if (run && run.kind === 'lab') return true;
  return hasCombatLabBudgetOwner(ctx);
}

function isLiveLabSession(ctx) {
  const run = ctx && ctx.state && ctx.state.run;
  return !!(run && run.kind === 'lab' && run.phase !== 'inactive');
}

function spawnBudgetApi(ctx) {
  const budget = ctx && ctx.helpers && ctx.helpers.spawnBudget;
  return budget && typeof budget.ownerForEntity === 'function' ? budget : null;
}

function hasCombatLabBudgetOwner(ctx) {
  const budget = spawnBudgetApi(ctx);
  if (!budget) return false;
  for (const entity of listEntities(ctx.state)) {
    const owner = budget.ownerForEntity(entity && entity.id);
    if (isLabBudgetOwner(owner)) return true;
  }
  return false;
}

function isLabBudgetOwner(owner) {
  return typeof owner === 'string' && owner.startsWith(LAB_BUDGET_OWNER_PREFIX);
}

function listEntities(state) {
  if (!state) return [];
  if (state.entities && typeof state.entities.values === 'function') {
    return [...state.entities.values()];
  }
  return Array.isArray(state.entityList) ? state.entityList : [];
}

function getTimeEffects(ctx) {
  if (ctx && ctx.timeEffects && typeof ctx.timeEffects.set === 'function') return ctx.timeEffects;
  if (ctx && ctx.state) return createTimeEffects(ctx.state);
  return null;
}

function isSimHeld(ctx) {
  if (ctx && ctx.timeEffects && typeof ctx.timeEffects.getEffectiveScale === 'function') {
    return ctx.timeEffects.getEffectiveScale() === 0;
  }
  return !!(ctx && ctx.state && ctx.state.timeScale === 0);
}

function getSimStep(ctx) {
  return ctx && typeof ctx.simStep === 'function' ? ctx.simStep : null;
}

function applyTimeScale(ctx, scale) {
  if (!LEGAL_TIME_SCALES.includes(scale)) return false;
  const effects = getTimeEffects(ctx);
  if (!effects) return false;
  if (scale === 1) {
    if (typeof effects.clear === 'function') effects.clear(CRUCIBLE_LAB_SPEED_SOURCE);
    return { kind: 'timeScale', scale: 1 };
  }
  if (scale > 1) {
    effects.set(CRUCIBLE_LAB_SPEED_SOURCE, { labSpeed: scale });
    return { kind: 'timeScale', scale };
  }
  effects.set(CRUCIBLE_LAB_SPEED_SOURCE, { scale });
  return { kind: 'timeScale', scale };
}

function applyClearEnemies(ctx) {
  const budget = spawnBudgetApi(ctx);
  const helpers = ctx && ctx.helpers;
  if (!budget || !helpers || typeof helpers.removeEntity !== 'function') return false;
  const playerId = ctx.state && ctx.state.playerId;
  const targets = [];
  for (const entity of listEntities(ctx.state)) {
    if (!entity || entity.id === playerId) continue;
    if (entity.type === 'station') continue;
    if (!isLabBudgetOwner(budget.ownerForEntity(entity.id))) continue;
    targets.push(entity);
  }
  targets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cap = Math.min(targets.length, CLEAR_HARD_MAX);
  let removed = 0;
  let released = 0;
  for (let i = 0; i < cap; i++) {
    const id = targets[i].id;
    helpers.removeEntity(id);
    removed += 1;
    if (typeof budget.releaseEntity === 'function') {
      released += budget.releaseEntity(id) | 0;
    }
  }
  return { kind: 'clearEnemies', removed, released };
}

function applyRefill(ctx) {
  if (!isLiveLabSession(ctx)) return false;
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.emit !== 'function') return false;
  bus.emit('debug:refillPlayer', {});
  return { kind: 'refill' };
}

function applyInvulnerable(ctx, request) {
  if (!isLiveLabSession(ctx)) return false;
  if (!request || typeof request.on !== 'boolean') return false;
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.emit !== 'function') return false;
  bus.emit('debug:invulnerable', { on: request.on });
  return { kind: 'invulnerable', on: request.on };
}

function applyStep(ctx) {
  if (!isLiveLabSession(ctx)) return false;
  if (!isSimHeld(ctx)) return false;
  const step = getSimStep(ctx);
  if (!step) return false;
  const happened = step();
  return happened ? { kind: 'step' } : false;
}

// --- DOM layer ----------------------------------------------------------------

/** The speed's meaning role: faster than real time is "you", slower is "goal", real time is calm. */
export function labSpeedRole(scale) {
  if (scale > 1) return 'you';
  if (scale < 1) return 'goal';
  return 'calm';
}

function formatScale(scale) {
  return scale + '\u00d7';
}

/** A kit word (`button.k-word`), appended to a `.k-words` list inside its `li`. */
function addWord(list, label, className, why) {
  const button = el('button', 'k-word ' + className, label);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  if (why) {
    button.setAttribute('data-why', why);
    button.setAttribute('data-why-ready', why);
  }
  const li = el('li');
  li.appendChild(button);
  list.appendChild(li);
  return button;
}

/** One static kit row: the concept's name on the left, its words on the right. */
function controlRow(list, name) {
  const row = el('li', 'k-row k-row--static');
  row.appendChild(el('span', 'k-row__name k-62', name));
  const words = el('ul', 'k-words k-words--row');
  words.setAttribute('aria-label', name);
  row.appendChild(words);
  list.appendChild(row);
  return words;
}

export function mountCrucibleLabControls(ctx, hostEl) {
  if (!hostEl || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  // The runtime as a column of rows (Speed · Sim · Hull · Arena); `k-span` fills the host's grid.
  const rows = el('ul', 'k-rows k-span sf-lab-runtime');
  // (The unit tests mount this under a fake document whose style object has no setProperty.)
  if (rows.style && typeof rows.style.setProperty === 'function') {
    rows.style.setProperty('--k-row-cols', 'auto minmax(0, 1fr)');
  }
  rows.setAttribute('role', 'group');
  rows.setAttribute('aria-label', 'Combat Lab runtime');

  // Speed — the legal time scales as a row of words, the live one pressed, and the live figure.
  const speedWords = controlRow(rows, 'Speed');
  speedWords.setAttribute('aria-label', 'Simulation speed');
  const speedButtons = [];
  for (const scale of LEGAL_TIME_SCALES) {
    const button = addWord(speedWords, formatScale(scale), 'k-word--body',
      'Extra fixed 60 Hz steps, not a bigger step');
    button.setAttribute('data-scale', String(scale));
    button.setAttribute('aria-pressed', scale === 1 ? 'true' : 'false');
    speedButtons.push({ scale, button });
  }
  const speedText = el('span', 'sf-lab-speed-now sf-fig k-t-emph', formatScale(1));
  speedText.setAttribute('aria-live', 'polite');
  const speedLi = el('li');
  speedLi.appendChild(speedText);
  speedWords.appendChild(speedLi);
  let chosenScale = 1;

  // Sim — Step, live only while this screen holds the sim.
  const simWords = controlRow(rows, 'Sim');
  const stepBtn = addWord(simWords, 'Step', 'k-word--body',
    'Advance one 60 Hz tick while this screen holds the sim');

  // Hull — Refill, and invulnerability as a two-word toggle (the live word pressed).
  const hullWords = controlRow(rows, 'Hull');
  const refillBtn = addWord(hullWords, 'Refill', 'k-word--body',
    'Restore hull, armor, shields, capacitor, and heat');
  const vulnBtn = addWord(hullWords, 'Vulnerable', 'k-word--body sf-lab-vuln', 'Toggle player invulnerability');
  const invulnBtn = addWord(hullWords, 'Invulnerable', 'k-word--body sf-lab-invuln', 'Toggle player invulnerability');

  // Arena — the destructive one, in the danger colour.
  const arenaWords = controlRow(rows, 'Arena');
  const clearBtn = addWord(arenaWords, 'Clear enemies', 'k-word--body k-word--danger',
    'Remove Lab-spawned enemies without scoring a kill');

  // One status line in fine print under the rows.
  const hint = el('p', 'k-span k-t-fine k-38 sf-lab-runtime__hint');
  hint.setAttribute('role', 'status');

  hostEl.appendChild(rows);
  hostEl.appendChild(hint);

  function live() {
    return !!(getPlayerEntity(ctx) && isLiveCombatLab(ctx));
  }

  function sessionLive() {
    return !!(getPlayerEntity(ctx) && isLiveLabSession(ctx));
  }

  function invulnOn() {
    const player = getPlayerEntity(ctx);
    return !!(player && player.flags && player.flags.invuln);
  }

  function setWhy(button, on, offReason) {
    button.disabled = !on;
    button.setAttribute('aria-disabled', on ? 'false' : 'true');
    button.setAttribute('data-why', on ? (button.getAttribute('data-why-ready') || '') : offReason);
  }

  function refresh() {
    const on = live();
    const session = sessionLive();
    const held = isSimHeld(ctx);
    const stepFn = getSimStep(ctx);
    const shown = LEGAL_TIME_SCALES.includes(chosenScale) ? chosenScale : 1;
    speedText.textContent = formatScale(shown);
    const speedRole = labSpeedRole(shown);
    speedText.className = 'sf-lab-speed-now sf-fig k-t-emph'
      + (speedRole === 'you' ? ' is-you k-good' : '')
      + (speedRole === 'goal' ? ' is-goal k-62' : '');
    for (const { scale, button } of speedButtons) {
      button.setAttribute('aria-pressed', scale === shown ? 'true' : 'false');
    }

    // The state is said in words, not only pressed: the row reads "Invulnerable: on" to a reader.
    const invuln = invulnOn();
    vulnBtn.setAttribute('aria-pressed', invuln ? 'false' : 'true');
    invulnBtn.setAttribute('aria-pressed', invuln ? 'true' : 'false');
    invulnBtn.setAttribute('aria-label', invuln ? 'Invulnerable: on' : 'Invulnerable: off');
    vulnBtn.setAttribute('aria-label', invuln ? 'Vulnerable: off' : 'Vulnerable: on');

    const launchReason = 'Launch a Combat Lab fight first.';
    const stepReason = !session
      ? launchReason
      : (!held || !stepFn ? 'Step advances one 60 Hz tick while this screen holds the sim.' : '');
    hint.textContent = !on
      ? 'Launch a Combat Lab fight first. These controls do nothing in Adventure.'
      : ('Speed ' + formatScale(shown) + ' — extra fixed 60 Hz steps, not a bigger step. '
        + 'This screen already freezes the world. Step advances one 60 Hz tick while the screen holds the sim. '
        + 'Clear enemies removes Lab-spawned ships without a kill.');

    setWhy(clearBtn, on, launchReason);
    for (const { button } of speedButtons) setWhy(button, on, launchReason);
    setWhy(refillBtn, session, launchReason);
    setWhy(invulnBtn, session, launchReason);
    setWhy(vulnBtn, session, launchReason);
    setWhy(stepBtn, session && held && !!stepFn, stepReason || launchReason);
  }

  for (const { scale, button } of speedButtons) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const result = applyCrucibleLabControl(ctx, requestTimeScale(scale));
      if (result) chosenScale = scale;
      refresh();
    });
  }
  clearBtn.addEventListener('click', () => {
    if (clearBtn.disabled) return;
    applyCrucibleLabControl(ctx, requestClearEnemies());
    refresh();
  });
  refillBtn.addEventListener('click', () => {
    if (refillBtn.disabled) return;
    applyCrucibleLabControl(ctx, requestRefill());
    refresh();
  });
  invulnBtn.addEventListener('click', () => {
    if (invulnBtn.disabled) return;
    applyCrucibleLabControl(ctx, requestInvulnerable(true));
    refresh();
  });
  vulnBtn.addEventListener('click', () => {
    if (vulnBtn.disabled) return;
    applyCrucibleLabControl(ctx, requestInvulnerable(false));
    refresh();
  });
  stepBtn.addEventListener('click', () => {
    if (stepBtn.disabled) return;
    applyCrucibleLabControl(ctx, requestStep());
    refresh();
  });

  const unsubs = [];
  const bus = ctx && ctx.bus;
  if (bus && typeof bus.on === 'function') {
    for (const event of ['game:started', 'game:exitToMenu', 'sim:pause', 'sim:resume']) {
      const off = bus.on(event, refresh);
      if (typeof off === 'function') unsubs.push(off);
    }
  }

  function dispose() {
    for (const off of unsubs) off();
    unsubs.length = 0;
  }

  refresh();
  return { refresh, dispose };
}
