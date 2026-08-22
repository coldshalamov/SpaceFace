// Combat Lab runtime controls. Pure request builders plus a thin DOM mount.
// Every effect is a request to the owner that already owns the concept — never a raw
// cross-owner write from the UI, and never a write to state.run.
// Speed (timeEffects), clear-enemies (removeEntity + spawnBudget), refill/invulnerable
// (bus intents owned by combat/weapons), and Step (ctx.simStep).

import { createTimeEffects, LAB_SPEED_MAX } from '../../core/timeEffects.js';

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

export function mountCrucibleLabControls(ctx, hostEl) {
  if (!hostEl || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const row = document.createElement('div');
  row.className = 'sf-sandbox-lab-actions';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Combat Lab runtime');
  row.style.fontSize = 'var(--t-sm, 12px)';

  const heading = document.createElement('span');
  heading.textContent = 'Runtime';
  heading.style.fontSize = 'var(--t-sm, 12px)';
  heading.style.color = 'var(--ink-dim, var(--sf-calm, #84a0c8))';
  row.appendChild(heading);

  const stepBtn = makeButton(
    'Step',
    'Advance one 60 Hz tick while this screen holds the sim',
  );
  const refillBtn = makeButton('Refill', 'Restore hull, armor, shields, capacitor, and heat');
  const invulnBtn = makeButton('Invulnerable: off', 'Toggle player invulnerability');
  const clearBtn = makeButton('Clear enemies', 'Remove Lab-spawned enemies without scoring a kill');
  clearBtn.classList.add('sf-btn--danger');

  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed';
  speedLabel.style.fontSize = 'var(--t-sm, 12px)';
  speedLabel.style.color = 'var(--ink-dim, var(--sf-calm, #84a0c8))';
  speedLabel.style.display = 'inline-flex';
  speedLabel.style.alignItems = 'center';
  speedLabel.style.gap = '8px';
  const speedSel = document.createElement('select');
  speedSel.setAttribute('aria-label', 'Simulation speed');
  speedSel.style.fontSize = 'var(--t-sm, 12px)';
  speedSel.style.background = 'var(--panel-2, #111d30)';
  speedSel.style.color = 'var(--ink, var(--sf-paper, #d3e6ff))';
  speedSel.style.border = '1px solid var(--panel-edge, #1d3350)';
  speedSel.style.borderRadius = '4px';
  speedSel.style.padding = '5px 7px';
  speedSel.style.fontFamily = 'var(--mono)';
  for (const scale of LEGAL_TIME_SCALES) {
    const opt = document.createElement('option');
    opt.value = String(scale);
    opt.textContent = scale + '\u00d7';
    speedSel.appendChild(opt);
  }
  speedSel.value = '1';
  const speedText = document.createElement('span');
  speedText.setAttribute('aria-live', 'polite');
  speedText.style.fontFamily = 'var(--mono)';
  speedText.style.color = 'var(--ink, var(--sf-paper, #d3e6ff))';
  speedText.textContent = '1\u00d7';
  speedLabel.appendChild(speedSel);
  speedLabel.appendChild(speedText);

  const hint = document.createElement('div');
  hint.className = 'sf-sandbox-lab-digest';
  hint.style.fontSize = 'var(--t-sm, 12px)';
  hint.setAttribute('role', 'status');

  row.appendChild(speedLabel);
  row.appendChild(stepBtn);
  row.appendChild(refillBtn);
  row.appendChild(invulnBtn);
  row.appendChild(clearBtn);
  hostEl.appendChild(row);
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

  function refresh() {
    const on = live();
    const session = sessionLive();
    const held = isSimHeld(ctx);
    const stepFn = getSimStep(ctx);
    const scale = Number(speedSel.value);
    const shown = LEGAL_TIME_SCALES.includes(scale) ? scale : 1;
    speedText.textContent = shown + '\u00d7';
    const invuln = invulnOn();
    invulnBtn.textContent = invuln ? 'Invulnerable: on' : 'Invulnerable: off';
    invulnBtn.setAttribute('aria-label', invulnBtn.textContent);
    invulnBtn.setAttribute('aria-pressed', invuln ? 'true' : 'false');
    invulnBtn.style.borderColor = invuln ? 'var(--accent, #39d0ff)' : '';

    const launchReason = 'Launch a Combat Lab fight first.';
    const stepReason = !session
      ? launchReason
      : (!held
        ? 'Step advances one 60 Hz tick while this screen holds the sim.'
        : (!stepFn ? 'Step advances one 60 Hz tick while this screen holds the sim.' : ''));
    hint.textContent = !on
      ? 'Launch a Combat Lab fight first. These controls do nothing in Adventure.'
      : ('Speed ' + shown + '\u00d7 — extra fixed 60 Hz steps, not a bigger step. '
        + 'This screen already freezes the world. Step advances one 60 Hz tick while the screen holds the sim. '
        + 'Clear enemies removes Lab-spawned ships without a kill.');

    for (const el of [clearBtn, speedSel]) {
      el.disabled = !on;
      el.title = on ? (el.getAttribute('data-title') || '') : launchReason;
    }
    refillBtn.disabled = !session;
    refillBtn.title = session ? (refillBtn.getAttribute('data-title') || '') : launchReason;
    invulnBtn.disabled = !session;
    invulnBtn.title = session ? (invulnBtn.getAttribute('data-title') || '') : launchReason;
    const stepOn = session && held && !!stepFn;
    stepBtn.disabled = !stepOn;
    stepBtn.title = stepOn ? (stepBtn.getAttribute('data-title') || '') : (stepReason || launchReason);
  }

  stepBtn.setAttribute('data-title', 'Advance one 60 Hz tick while this screen holds the sim');
  refillBtn.setAttribute('data-title', 'Restore hull, armor, shields, capacitor, and heat');
  invulnBtn.setAttribute('data-title', 'Toggle player invulnerability');
  clearBtn.setAttribute('data-title', 'Remove Lab-spawned enemies without scoring a kill');

  speedSel.addEventListener('change', () => {
    const scale = Number(speedSel.value);
    applyCrucibleLabControl(ctx, requestTimeScale(scale));
    refresh();
  });
  clearBtn.addEventListener('click', () => {
    applyCrucibleLabControl(ctx, requestClearEnemies());
    refresh();
  });
  refillBtn.addEventListener('click', () => {
    applyCrucibleLabControl(ctx, requestRefill());
    refresh();
  });
  invulnBtn.addEventListener('click', () => {
    applyCrucibleLabControl(ctx, requestInvulnerable(!invulnOn()));
    refresh();
  });
  stepBtn.addEventListener('click', () => {
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

function makeButton(label, title) {
  const btn = document.createElement('button');
  btn.className = 'sf-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', label);
  btn.style.fontSize = 'var(--t-sm, 12px)';
  return btn;
}
