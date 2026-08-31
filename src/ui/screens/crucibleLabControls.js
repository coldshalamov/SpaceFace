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

const STYLE_ID = 'sf-lab-controls-style';
const CSS = `
.sf-lab-runtime { color: var(--sf-paper); font-family: var(--sf-body-face); font-size: 12px; }
.sf-lab-runtime .sf-fig, .sf-lab-speed-now {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0;
}
.sf-lab-runtime .sf-crest {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
}
.sf-lab-speed-now {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  color: var(--sf-paper); letter-spacing: 0; text-transform: none;
}
.sf-lab-speed-now.is-you { color: var(--sf-you); }
.sf-lab-speed-now.is-goal { color: var(--sf-goal); }
.sf-lab-invuln.is-you { border-color: var(--sf-you); color: var(--sf-you); }
.sf-lab-runtime select {
  background: color-mix(in srgb, var(--sf-surface) 72%, transparent); color: var(--sf-paper);
  border: 1px solid var(--sf-edge); border-radius: 2px; padding: var(--sp-1) var(--sp-2);
  font-family: var(--sf-data-face); font-size: 13px;
}
.sf-lab-runtime .sf-apron { color: var(--sf-calm); font-size: 12px; line-height: 1.4; }
.sf-lab-runtime-hint {
  color: var(--sf-calm); font-size: 12px; line-height: 1.4;
  word-break: normal; overflow-wrap: normal;
}
.sf-lab-runtime .sf-btn--danger { color: var(--sf-foe); }
@media (forced-colors: active) {
  .sf-lab-runtime select, .sf-lab-invuln.is-you { background: Canvas; color: CanvasText; border-color: CanvasText; }
}
@media (prefers-reduced-motion: reduce) {
  .sf-lab-runtime, .sf-lab-runtime * { animation: none !important; transition: none !important; }
}
`;

function injectStyle() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById !== 'function') return;
  if (document.getElementById(STYLE_ID)) return;
  if (!document.head || typeof document.head.appendChild !== 'function') return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function labSpeedRole(scale) {
  if (scale > 1) return 'you';
  if (scale < 1) return 'goal';
  return 'calm';
}

export function mountCrucibleLabControls(ctx, hostEl) {
  if (!hostEl || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  injectStyle();

  const row = document.createElement('div');
  row.className = 'sf-sandbox-lab-actions sf-lab-runtime sf-stage';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Combat Lab runtime');

  const heading = document.createElement('span');
  heading.className = 'sf-crest';
  heading.textContent = 'Runtime';
  row.appendChild(heading);

  const stepBtn = makeButton(
    'Step',
    'Advance one 60 Hz tick while this screen holds the sim',
  );
  const refillBtn = makeButton('Refill', 'Restore hull, armor, shields, capacitor, and heat');
  const invulnBtn = makeButton('Invulnerable: off', 'Toggle player invulnerability');
  invulnBtn.classList.add('sf-lab-invuln');
  const clearBtn = makeButton('Clear enemies', 'Remove Lab-spawned enemies without scoring a kill');
  clearBtn.classList.add('sf-btn--danger');

  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed';
  speedLabel.style.display = 'inline-flex';
  speedLabel.style.alignItems = 'center';
  speedLabel.style.gap = '8px';
  const speedSel = document.createElement('select');
  speedSel.setAttribute('aria-label', 'Simulation speed');
  speedSel.className = 'sf-fig';
  for (const scale of LEGAL_TIME_SCALES) {
    const opt = document.createElement('option');
    opt.value = String(scale);
    opt.textContent = scale + '\u00d7';
    speedSel.appendChild(opt);
  }
  speedSel.value = '1';
  const speedText = document.createElement('span');
  speedText.className = 'sf-lab-speed-now sf-fig';
  speedText.setAttribute('aria-live', 'polite');
  speedText.textContent = '1\u00d7';
  speedLabel.appendChild(speedSel);
  speedLabel.appendChild(speedText);

  const hint = document.createElement('div');
  hint.className = 'sf-sandbox-lab-digest sf-apron sf-lab-runtime-hint';
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
    const speedRole = labSpeedRole(shown);
    speedText.className = 'sf-lab-speed-now sf-fig'
      + (speedRole === 'you' ? ' is-you' : '')
      + (speedRole === 'goal' ? ' is-goal' : '');
    const invuln = invulnOn();
    invulnBtn.textContent = invuln ? 'Invulnerable: on' : 'Invulnerable: off';
    invulnBtn.setAttribute('aria-label', invulnBtn.textContent);
    invulnBtn.setAttribute('aria-pressed', invuln ? 'true' : 'false');
    invulnBtn.className = 'sf-btn sf-lab-invuln' + (invuln ? ' is-you' : '');

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
      el.setAttribute('data-why', on ? (el.getAttribute('data-why-ready') || '') : launchReason);
    }
    refillBtn.disabled = !session;
    refillBtn.setAttribute('data-why', session ? (refillBtn.getAttribute('data-why-ready') || '') : launchReason);
    invulnBtn.disabled = !session;
    invulnBtn.setAttribute('data-why', session ? (invulnBtn.getAttribute('data-why-ready') || '') : launchReason);
    const stepOn = session && held && !!stepFn;
    stepBtn.disabled = !stepOn;
    stepBtn.setAttribute('data-why', stepOn ? (stepBtn.getAttribute('data-why-ready') || '') : (stepReason || launchReason));
  }

  stepBtn.setAttribute('data-why-ready', 'Advance one 60 Hz tick while this screen holds the sim');
  refillBtn.setAttribute('data-why-ready', 'Restore hull, armor, shields, capacitor, and heat');
  invulnBtn.setAttribute('data-why-ready', 'Toggle player invulnerability');
  clearBtn.setAttribute('data-why-ready', 'Remove Lab-spawned enemies without scoring a kill');

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

function makeButton(label, why) {
  const btn = document.createElement('button');
  btn.className = 'sf-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
  if (why) btn.setAttribute('data-why', why);
  return btn;
}
