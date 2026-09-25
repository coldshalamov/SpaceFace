// Combat Lab runtime controls. Pure request builders plus a thin DOM mount.
// Every effect is a request to the owner that already owns the concept — never a raw
// cross-owner write from the UI, and never a write to state.run.
// Speed (timeEffects), clear-enemies (removeEntity + spawnBudget), refill/invulnerable
// (bus intents owned by combat/weapons), and Step (ctx.simStep).
// The physics toy (spawn, latch, throw, reset) uses the same owners as flight: spawnEntity,
// the combat attachment service, tetherGameplay, and masslineThrow.
//
// The DOM layer is kit rows (styles/kit.css, src/ui/kit/) — Frontend Task D §1.4. This file owns no
// CSS. The controls are instruments, not a debug dump: one row per concept, the choice as words.

import { createTimeEffects, LAB_SPEED_MAX } from '../../core/timeEffects.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { isAttachable } from '../../systems/tetherGameplay.js';
import { massline2Flag } from '../../data/featureFlags.js';
import { releaseAssistMode } from '../../systems/masslineThrow.js';
import { installSandboxGameStartedHook, spawnTargetsNow } from '../sandbox/sandboxSetup.js';
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

const SPAWN_MIN = 1;
const SPAWN_MAX = 12;
const TOY_REACH = 390;
const TETHER_DEF_ID = 'tether_standard';
const TOY_BUDGET_OWNER = LAB_BUDGET_OWNER_PREFIX + 'toy';

export function requestSpawnBodies(count = 3) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < SPAWN_MIN || n > SPAWN_MAX) {
    return { ok: false, kind: 'spawnBodies', count };
  }
  return { ok: true, kind: 'spawnBodies', count: n };
}

export function requestLatch() {
  return { ok: true, kind: 'latch' };
}

export function requestThrow() {
  return { ok: true, kind: 'throw' };
}

export function requestResetRoom() {
  return { ok: true, kind: 'resetRoom' };
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
    case 'spawnBodies': return applySpawnBodies(ctx, request.count);
    case 'latch': return applyLatch(ctx);
    case 'throw': return applyThrow(ctx);
    case 'resetRoom': return applyResetRoom(ctx);
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
  if (run && (run.kind === 'lab' || run.kind === 'sandbox')) return true;
  if (ctx && ctx.state && (ctx.state.sandbox || ctx.state.mode === 'flight')) return true;
  return hasCombatLabBudgetOwner(ctx);
}

function isLiveLabSession(ctx) {
  const run = ctx && ctx.state && ctx.state.run;
  if (run && (run.kind === 'lab' || run.kind === 'sandbox') && run.phase !== 'inactive') return true;
  if (ctx && ctx.state && (ctx.state.sandbox || ctx.state.mode === 'flight')) return true;
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

function physicsToySession(ctx) {
  const state = ctx && ctx.state;
  if (!state) return false;
  if (state.sandbox) return true;
  const run = state.run;
  return !!(run && (run.kind === 'lab' || run.kind === 'sandbox') && run.phase !== 'inactive');
}

const spawnedByState = new WeakMap();

function noteSpawned(state, ids) {
  if (!state || !ids || ids.length === 0) return;
  let known = spawnedByState.get(state);
  if (!known) {
    known = new Set();
    spawnedByState.set(state, known);
  }
  for (const id of ids) known.add(id);
}

function applySpawnBodies(ctx, count) {
  if (!physicsToySession(ctx)) return false;
  const helpers = ctx && ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return false;
  const before = new Set();
  for (const entity of listEntities(ctx.state)) {
    if (entity && entity.id != null) before.add(entity.id);
  }
  spawnTargetsNow(ctx, count);
  const spawned = [];
  for (const entity of listEntities(ctx.state)) {
    if (!entity || entity.id == null || before.has(entity.id)) continue;
    spawned.push(entity);
  }
  if (spawned.length === 0) return false;
  noteSpawned(ctx.state, spawned.map((entity) => entity.id));
  const budget = spawnBudgetApi(ctx);
  if (budget && typeof budget.request === 'function' && typeof budget.bindEntity === 'function') {
    const granted = budget.request(spawned.length, TOY_BUDGET_OWNER) | 0;
    let bound = 0;
    for (const entity of spawned) {
      if (bound >= granted) break;
      if (budget.bindEntity(entity.id, TOY_BUDGET_OWNER)) bound += 1;
    }
  }
  return { kind: 'spawnBodies', spawned: spawned.length };
}

function kernelFor(ctx) {
  const registry = ctx && ctx.registry;
  const actions = registry && typeof registry.get === 'function' ? registry.get('actions') : null;
  if (actions && actions.kernel) return actions.kernel;
  const combat = registry && typeof registry.get === 'function' ? registry.get('combat') : null;
  if (combat && combat.kernel) return combat.kernel;
  return getCombatKernel(ctx);
}

function nearestToyBody(ctx, player) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of listEntities(ctx.state)) {
    if (!isAttachable(entity, player.id, ctx.state)) continue;
    if (entity.type === 'station') continue;
    const distance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
    const reach = TOY_REACH + Math.max(0, Number(entity.radius) || 0);
    if (distance > reach) continue;
    if (distance < bestDistance
      || (distance === bestDistance && String(entity.id) < String(best.id))) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

function playerAttachment(attachments, playerId) {
  if (!attachments || typeof attachments.listForEntity !== 'function') return null;
  const owned = attachments.listForEntity(playerId, true) || [];
  for (const attachment of owned) {
    if (attachment && attachment.ownerId === playerId && attachment.state === 'active') return attachment;
  }
  return null;
}

function adoptTether(ctx) {
  const registry = ctx && ctx.registry;
  const system = registry && typeof registry.get === 'function' ? registry.get('tetherGameplay') : null;
  if (!system || typeof system.update !== 'function') return false;
  const state = ctx.state;
  if (!state || state.mode !== 'flight') return false;
  system.update(1 / 60, state);
  return true;
}

function applyLatch(ctx) {
  if (!physicsToySession(ctx)) return false;
  const player = getPlayerEntity(ctx);
  if (!player || !player.pos || player.alive === false) return false;
  let kernel = null;
  try { kernel = kernelFor(ctx); } catch { return false; }
  const attachments = kernel && kernel.attachments;
  if (!attachments || typeof attachments.create !== 'function') return false;
  const existing = playerAttachment(attachments, player.id);
  if (existing) {
    adoptTether(ctx);
    return { kind: 'latch', targetId: existing.targetId, attachmentId: existing.id, already: true };
  }
  const target = nearestToyBody(ctx, player);
  if (!target) return false;
  const created = attachments.create({
    defId: TETHER_DEF_ID,
    ownerId: player.id,
    targetId: target.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
  });
  if (!created || !created.ok || !created.attachment) {
    return { kind: 'latch', attached: false, reason: 'rope' };
  }
  adoptTether(ctx);
  return { kind: 'latch', targetId: target.id, attachmentId: created.attachment.id };
}

function ensureActions(state) {
  state.input = state.input || {};
  state.input.actions = state.input.actions || {};
  return state.input.actions;
}

function applyThrow(ctx) {
  if (!physicsToySession(ctx)) return false;
  const state = ctx.state;
  const tether = state && state.player && state.player.tether;
  if (!tether || !tether.active || tether.targetId == null) return false;
  if (!massline2Flag('throw')) return { kind: 'throw', released: false, reason: 'unavailable' };
  const registry = ctx && ctx.registry;
  const system = registry && typeof registry.get === 'function' ? registry.get('masslineThrow') : null;
  if (!system || typeof system.update !== 'function' || state.mode !== 'flight') return false;
  const actions = ensureActions(state);
  actions.throwArm = false;
  system.update(1 / 60, state);
  if (!state.player || !state.player.tether || !state.player.tether.active) return false;
  actions.throwArm = true;
  system.update(1 / 60, state);
  actions.throwArm = false;
  const last = state.massline2 && state.massline2.throw && state.massline2.throw.lastThrow;
  if (last && last.tick === state.tick) {
    return { kind: 'throw', released: true, releaseId: last.releaseId, payloadId: last.payloadId };
  }
  if (system._pendingSnap) return { kind: 'throw', released: false, queued: true, payloadId: tether.targetId };
  return { kind: 'throw', released: false, reason: releaseAssistMode(state) };
}

function removeNotedBodies(ctx) {
  const known = ctx && ctx.state ? spawnedByState.get(ctx.state) : null;
  const helpers = ctx && ctx.helpers;
  if (!known || !helpers || typeof helpers.removeEntity !== 'function') return 0;
  let removed = 0;
  for (const id of [...known]) {
    const entity = ctx.state.entities && typeof ctx.state.entities.get === 'function'
      ? ctx.state.entities.get(id)
      : null;
    if (!entity) {
      known.delete(id);
      continue;
    }
    helpers.removeEntity(id, { immediate: true });
    known.delete(id);
    removed += 1;
  }
  return removed;
}

function cutPlayerLine(ctx) {
  const player = getPlayerEntity(ctx);
  if (!player) return 0;
  let kernel = null;
  try { kernel = kernelFor(ctx); } catch { return 0; }
  const attachments = kernel && kernel.attachments;
  if (!attachments || typeof attachments.cut !== 'function') return 0;
  const owned = typeof attachments.listForEntity === 'function'
    ? (attachments.listForEntity(player.id, true) || [])
    : [];
  let cut = 0;
  for (const attachment of owned) {
    if (!attachment || attachment.ownerId !== player.id || attachment.state !== 'active') continue;
    const result = attachments.cut(attachment.id, player.id, 'tether_cut');
    if (result && result.ok) cut += 1;
  }
  if (cut > 0) adoptTether(ctx);
  return cut;
}

function applyResetRoom(ctx) {
  if (!physicsToySession(ctx)) return false;
  applyTimeScale(ctx, 1);
  const cleared = applyClearEnemies(ctx);
  const removedNoted = removeNotedBodies(ctx);
  const cut = cutPlayerLine(ctx);
  return {
    kind: 'resetRoom',
    removed: (cleared && cleared.removed ? cleared.removed : 0) + removedNoted,
    cut,
    scale: 1,
  };
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

let screenMounts = 0;
let practiceArmed = false;
let pendingToy = false;
let liveCtx = null;
let flightHost = null;
let flightControls = null;
const wiredBuses = new WeakSet();

function flightParent() {
  if (typeof document === 'undefined') return null;
  const root = typeof document.getElementById === 'function' ? document.getElementById('ui-root') : null;
  if (root && typeof root.appendChild === 'function') return root;
  if (document.body && typeof document.body.appendChild === 'function') return document.body;
  return null;
}

function hideFlightToy() {
  if (flightControls && typeof flightControls.dispose === 'function') flightControls.dispose();
  flightControls = null;
  const host = flightHost;
  flightHost = null;
  if (!host) return;
  const parent = host.parentNode;
  if (parent && Array.isArray(parent.children)) {
    const index = parent.children.indexOf(host);
    if (index >= 0) parent.children.splice(index, 1);
  }
  if (typeof host.remove === 'function') {
    try { host.remove(); } catch { /* the parent splice already detached a stub node */ }
  }
}

function showFlightToy(ctx) {
  if (!ctx) return;
  hideFlightToy();
  const parent = flightParent();
  if (!parent || typeof document.createElement !== 'function') return;
  const host = document.createElement('div');
  host.className = 'k-span sf-lab-flight';
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Physics lab');
  if (host.style) {
    host.style.position = 'fixed';
    host.style.left = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '20';
    host.style.maxWidth = '440px';
    host.style.pointerEvents = 'auto';
  }
  parent.appendChild(host);
  flightHost = host;
  flightControls = mountCrucibleLabControls(ctx, host, { flight: true });
}

function onGameNew() {
  if (screenMounts > 0 || practiceArmed) {
    practiceArmed = false;
    pendingToy = true;
    return;
  }
  pendingToy = false;
  const state = liveCtx && liveCtx.state;
  if (state && state.sandbox) state.sandbox = false;
  hideFlightToy();
}

function onGameStarted() {
  const state = liveCtx && liveCtx.state;
  if (!pendingToy) {
    if (state && state.sandbox) state.sandbox = false;
    hideFlightToy();
    return;
  }
  pendingToy = false;
  if (state) state.sandbox = true;
  showFlightToy(liveCtx);
}

export function ensurePhysicsLabRoute(ctx) {
  if (!ctx || !ctx.registry || !ctx.bus || typeof ctx.bus.on !== 'function') return false;
  liveCtx = ctx;
  installSandboxGameStartedHook(ctx.bus, () => liveCtx);
  if (!wiredBuses.has(ctx.bus)) {
    wiredBuses.add(ctx.bus);
    ctx.bus.on('game:new', onGameNew);
    ctx.bus.on('game:started', onGameStarted);
    ctx.bus.on('game:startFailed', () => {
      pendingToy = false;
      practiceArmed = false;
    });
    ctx.bus.on('game:exitToMenu', () => {
      pendingToy = false;
      practiceArmed = false;
      hideFlightToy();
    });
  }
  return true;
}

/** The practice-room button arms the next new game as the physics toy. */
export function notePracticeLaunch(ctx) {
  if (!ensurePhysicsLabRoute(ctx)) return false;
  practiceArmed = true;
  return true;
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

export function mountCrucibleLabControls(ctx, hostEl, options = {}) {
  if (!hostEl || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const flightPanel = !!(options && options.flight);
  const countedScreen = !flightPanel && ensurePhysicsLabRoute(ctx);
  if (countedScreen) screenMounts += 1;

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
  let outcome = '';

  // Bodies — spawn, rope, throw, and put the room back. These are the physics toy.
  const bodyWords = controlRow(rows, 'Bodies');
  bodyWords.setAttribute('aria-label', 'Physics lab');
  const spawnBtn = addWord(bodyWords, 'Spawn bodies', 'k-word--body',
    'Put three practice targets in reach of the rope');
  const latchBtn = addWord(bodyWords, 'Latch', 'k-word--body',
    'Grab the nearest body with the rope');
  const throwBtn = addWord(bodyWords, 'Throw', 'k-word--body',
    'Let the roped body go, using your release setting');
  const resetBtn = addWord(bodyWords, 'Reset room', 'k-word--body',
    'Remove bodies you spawned, cut the rope, and restore normal time');

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
    const toyReason = 'Open the practice room or the physics lab first.';
    const stepReason = !session
      ? launchReason
      : (!held || !stepFn ? 'Step advances one 60 Hz tick while this screen holds the sim.' : '');
    const toy = physicsToySession(ctx);
    const guide = !on
      ? 'Launch a Combat Lab fight first. These controls do nothing in Adventure.'
      : toy
        ? ('Speed ' + formatScale(shown) + '. Spawn bodies, latch the rope, then throw. '
          + 'Reset puts time back to 1× and clears bodies you spawned. '
          + 'Slow time is extra fixed steps, not a bigger step.')
        : ('Speed ' + formatScale(shown) + ' — extra fixed 60 Hz steps, not a bigger step. '
          + 'This screen already freezes the world. Step advances one 60 Hz tick while the screen holds the sim. '
          + 'Clear enemies removes Lab-spawned ships without a kill.');
    hint.textContent = outcome ? (outcome + ' ' + guide) : guide;

    setWhy(spawnBtn, on && toy, toy ? launchReason : toyReason);
    setWhy(latchBtn, on && toy, toy ? launchReason : toyReason);
    setWhy(throwBtn, on && toy, toy ? launchReason : toyReason);
    setWhy(resetBtn, on && toy, toy ? launchReason : toyReason);
    setWhy(clearBtn, on, launchReason);
    for (const { button } of speedButtons) setWhy(button, on, launchReason);
    setWhy(refillBtn, session, launchReason);
    setWhy(invulnBtn, session, launchReason);
    setWhy(vulnBtn, session, launchReason);
    setWhy(stepBtn, session && held && !!stepFn, stepReason || launchReason);
  }

  function say(text) {
    outcome = text || '';
    refresh();
  }

  for (const { scale, button } of speedButtons) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const result = applyCrucibleLabControl(ctx, requestTimeScale(scale));
      if (result) {
        chosenScale = scale;
        say('Time is ' + formatScale(scale) + '.');
      }
    });
  }
  spawnBtn.addEventListener('click', () => {
    if (spawnBtn.disabled) return;
    const result = applyCrucibleLabControl(ctx, requestSpawnBodies(3));
    say(result && result.spawned
      ? ('Spawned ' + result.spawned + (result.spawned === 1 ? ' body.' : ' bodies.'))
      : 'No bodies spawned.');
  });
  latchBtn.addEventListener('click', () => {
    if (latchBtn.disabled) return;
    const result = applyCrucibleLabControl(ctx, requestLatch());
    if (result && result.attachmentId) {
      say(result.already ? 'The rope is already on a body.' : 'Latched. The rope is on the nearest body.');
    } else if (result && result.reason === 'rope') {
      say('The rope could not catch.');
    } else {
      say('Nothing in reach to latch. Spawn a body first.');
    }
  });
  throwBtn.addEventListener('click', () => {
    if (throwBtn.disabled) return;
    const result = applyCrucibleLabControl(ctx, requestThrow());
    if (!result) say('Nothing is on the rope.');
    else if (result.released) say('Thrown. The rope let go. The body keeps the speed it already had.');
    else if (result.queued) say('Throw is waiting for the release window.');
    else if (result.reason === 'unavailable') say('Throw is not available in this flight.');
    else if (result.reason === 'arm') say('Armed release did not let go. The body has to be moving and on the window.');
    else say('The throw did not let go.');
  });
  resetBtn.addEventListener('click', () => {
    if (resetBtn.disabled) return;
    const result = applyCrucibleLabControl(ctx, requestResetRoom());
    if (result) {
      chosenScale = 1;
      say('Room reset. Time is 1×.');
    }
  });
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
    if (countedScreen && screenMounts > 0) screenMounts -= 1;
    for (const off of unsubs) off();
    unsubs.length = 0;
  }

  refresh();
  return { refresh, dispose };
}
