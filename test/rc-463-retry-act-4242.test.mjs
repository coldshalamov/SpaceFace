// Row 463 RC-BOSS-READ, second slice: "Retry act" + elite intent tells.
//
// The defect this pins: a player death inside an authored capital fight ended the score in
// 'defeat' and the terminal record was never stepped again — a returning player found a
// permanently silent, braked boss that still completed the mission when shot. Recovery now
// rewinds the act (capitalBossEncounters.rewindAct + the player:respawn / save:loaded hooks),
// the after-action screen offers "Retry act" (combat stamps receipt.capitalBossFightId), and
// doctrine-less elites hold their first firing edge behind a 24-tick weapon_charge tell.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { capitalOrderKey } from '../src/ai/capitalBossOrders.js';
import { combat } from '../src/systems/combat.js';
import { applyEliteChargeTell } from '../src/systems/tacticalAI.js';
import { gameOverScreen, capitalBossRetryOffer } from '../src/ui/screens/gameOver.js';

const DT = 1 / 60;
const SEED = 4242;
const TOLLMAN = 'capital_boss_tollman';

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

/**
 * The score-contract harness grown a combat system: the production encounter factory AND the
 * registered combat system share one bus/state so kill→defeat→recovery→rewind runs end to end.
 */
function boot(opts = {}) {
  const sectorId = opts.sectorId || 'contract_room';
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = {
    id: state.nextEntityId++, alive: true, team: 0, type: 'ship',
    pos: vec(0, 0), prevPos: vec(0, 0), vel: vec(0, 0), rot: 0, flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 140, hullMax: 140, armorHp: 30, armorMax: 30, shield: 55, shieldMax: 55, cap: 80, capMax: 80,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const bossPos = opts.bossPos || { x: 300, z: 0 };
  const boss = {
    id: state.nextEntityId++, alive: true, team: 1, type: 'ship',
    pos: vec(bossPos.x, bossPos.z), prevPos: vec(bossPos.x, bossPos.z), vel: vec(0, 0), rot: 0,
    hull: opts.bossHull ?? 100, hullMax: 100, radius: 20, data: {},
  };
  state.entities.set(boss.id, boss);
  state.entityList.push(boss);
  const fightId = `contract:${opts.encounterId || TOLLMAN}`;
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: sectorId });
  state.world.currentSectorId = sectorId;
  state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: opts.stationId || null };
  if (opts.stationPos) {
    state.world.activeSector = { stations: [{ stationId: opts.stationId, pos: { ...opts.stationPos } }] };
  }
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', {
    encounterId: opts.encounterId || TOLLMAN, fightId, bossId: boss.id, targetId: player.id,
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) { state.tick += 1; state.simTime += DT; capSys.update(DT); }
  };
  return { state, bus, emitted, capSys, fightId, boss, player, tick };
}

function fightOf(h) {
  return h.state.capitalBossEncounters.fights[h.fightId];
}

function runUntilStarted(h) {
  const score = requireCapitalBossEncounter(TOLLMAN).score;
  h.tick(score.introTicks + score.transitionTicks + 40);
  assert.equal(fightOf(h).started, true, 'the authored fight is running');
  assert.ok(fightOf(h).actIndex >= 0, 'act entered before the scripted death');
}

test('a lost Tollman fight rewinds its act on recovery instead of leaving a silent braked hulk', () => {
  const h = boot();
  runUntilStarted(h);
  const actIndex = fightOf(h).actIndex;
  const bossHull = h.boss.hull;

  combat.kill(h.player, h.boss.id, { origin: { kind: 'weapon', id: 'wpn_test' } });
  assert.equal(h.player.alive, false);
  h.tick(2);
  const defeated = fightOf(h);
  assert.equal(defeated.terminal, 'defeat', 'player death ends the score in defeat');
  assert.equal(h.state.capitalBossEncounters.orders[capitalOrderKey(h.boss.id)].phase, 'terminal');

  // The ordinary recovery berth now rewinds the act — the silent-hulk bug is dead.
  h.bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(h.player.alive, true, 'recovery revives the hull');
  const rewound = fightOf(h);
  assert.equal(rewound.terminal, null, 'rewind lifts the defeat terminal');
  assert.equal(rewound.suspended, true, 'the fight re-arms suspended until the player returns');
  assert.equal(rewound.actIndex, actIndex, 'the SAME act replays');
  assert.equal(rewound.sequence, 0, 'the act sequence cursor restarted at its opening');
  assert.equal(h.boss.hull, bossHull, 'boss hull damage stays dealt — no heal');
  assert.equal(
    h.state.capitalBossEncounters.orders[capitalOrderKey(h.boss.id)].phase,
    'suspended',
    'the boss order row leaves terminal suppression behind',
  );
  assert.ok(h.emitted.some((e) => e.event === 'capitalBoss:actRetried'
    && e.payload.fightId === h.fightId && e.payload.actIndex === actIndex),
    'actRetried is published for the presenter');

  // Back in range, the act actually restarts: a fresh telegraph names the same act's opening.
  h.player.pos.x = h.boss.pos.x - 400;
  h.player.pos.z = h.boss.pos.z;
  const score = requireCapitalBossEncounter(TOLLMAN).score;
  h.tick(score.resumeTicks + score.transitionTicks + 120);
  const rewoundFight = fightOf(h);
  assert.equal(rewoundFight.suspended, false, 'approach resumes the rewound fight');
  assert.ok(h.emitted.some((e) => e.event === 'capitalBoss:telegraph' && e.payload.clock > 0
    && e.payload.fightId === h.fightId),
    'the rewound act telegraphs again — the boss is no longer silent');
});

test('a boss KILL stays terminal and is never rewound', () => {
  const h = boot();
  runUntilStarted(h);
  h.boss.alive = false;
  h.boss.hull = 0;
  h.bus.emit('entity:killed', { id: h.boss.id, killerId: h.player.id });
  h.tick(2);
  const finished = fightOf(h);
  assert.ok(finished.terminal === 'victory' || finished.terminal === 'mutual',
    `boss death ends the score, got ${finished.terminal}`);
  assert.equal(h.capSys.rewindAct(h.fightId, 'recovery'), false, 'a kill is not a defeat');
  h.bus.emit('player:respawn', {});
  assert.equal(fightOf(h).terminal, finished.terminal, 'respawn never revives a beaten boss');
});

test('the defeat receipt carries capitalBossFightId and boss_staging places ~1100 WU off the boss', () => {
  const h = boot({
    sectorId: 'sector_helios_prime',
    stationId: 'station_helios',
    stationPos: { x: 1400, z: 0 },
    bossPos: { x: 300, z: 0 },
  });
  h.state.player.credits = 5000;
  runUntilStarted(h);
  combat.kill(h.player, h.boss.id, { origin: { kind: 'weapon', id: 'wpn_test' } });
  const receipt = h.state.combat.lastPlayerDefeat;
  assert.equal(receipt.capitalBossFightId, h.fightId, 'the durable receipt names the fight');
  assert.equal(receipt.capitalBossName, 'THE TOLLMAN');
  assert.ok(receipt.capitalBossActTitle.length > 0, 'the act title rides the receipt copy');
  h.tick(2);
  assert.equal(fightOf(h).terminal, 'defeat');

  h.bus.emit('player:recoveryRequested', { source: 'after_action', plan: 'boss_staging', fightId: h.fightId });
  assert.equal(h.player.alive, true);
  const dist = Math.hypot(h.player.pos.x - h.boss.pos.x, h.player.pos.z - h.boss.pos.z);
  assert.ok(Math.abs(dist - 1100) < 1, `staging sits ~1100 WU off the boss, got ${dist}`);
  // Bearing from the boss toward the sector's lawful station (helios at +x).
  assert.ok(h.player.pos.x > h.boss.pos.x, 'staging lies on the station bearing');
  // Same berth economics: the charge goes out through the ordinary economy intent.
  const charge = h.emitted.find((e) => e.event === 'economy:chargeCredits');
  assert.ok(charge && charge.payload.amount > 0, 'retry is not free — the berth cost still applies');
  assert.equal(fightOf(h).terminal, null, 'the staged return rewound the act');
});

test('a save written mid-defeat heals on save:loaded with an alive player', () => {
  const h = boot();
  runUntilStarted(h);
  combat.kill(h.player, h.boss.id, { origin: { kind: 'weapon', id: 'wpn_test' } });
  h.tick(2);
  assert.equal(fightOf(h).terminal, 'defeat');
  const snapshot = h.capSys.serialize();
  h.capSys.destroy();

  // A fresh owner restores the saved fights — the pre-fix bug shape ships in old saves.
  const raw2 = createBus();
  const bus2 = { on: raw2.on.bind(raw2), off: raw2.off.bind(raw2), once: raw2.once.bind(raw2), emit: raw2.emit.bind(raw2) };
  const capSys2 = createProductionCapitalBossEncounters();
  capSys2.init({
    state: h.state, bus: bus2,
    helpers: { routeCombatDamage(p) { return p; }, spawnEntity() { return null; }, getCombatCapabilities() { return null; } },
  });
  capSys2.restore(snapshot);
  assert.equal(h.state.capitalBossEncounters.fights[h.fightId].terminal, 'defeat');

  // Still dead on load: the heal defers until the player is actually back.
  h.player.alive = false;
  bus2.emit('save:loaded', {});
  assert.equal(h.state.capitalBossEncounters.fights[h.fightId].terminal, 'defeat',
    'a dead player on load leaves the hulk terminal');
  h.player.alive = true;
  bus2.emit('save:loaded', {});
  const healed = h.state.capitalBossEncounters.fights[h.fightId];
  assert.equal(healed.terminal, null, 'save:loaded rewinds the restored defeat');
  assert.equal(healed.suspended, true);
  capSys2.destroy();
});

test('swarm champion and Last Argument records never rewind', () => {
  const h = boot();
  runUntilStarted(h);
  combat.kill(h.player, h.boss.id, { origin: { kind: 'weapon', id: 'wpn_test' } });
  h.tick(2);
  const defeated = fightOf(h);
  assert.equal(defeated.terminal, 'defeat');
  const store = h.state.capitalBossEncounters.fights;
  store['swarm:w1'] = { ...defeated, fightId: 'swarm:w1' };
  store['contract:capital_boss_last_argument'] = { ...defeated, fightId: 'contract:capital_boss_last_argument', encounterId: 'capital_boss_last_argument' };
  assert.equal(h.capSys.rewindAct('swarm:w1', 'recovery'), false, 'swarm champions own their lifecycle');
  assert.equal(h.capSys.rewindAct('contract:capital_boss_last_argument', 'recovery'), false,
    'Last Argument owns its defeat');
  assert.equal(h.capSys.rewindAct(h.fightId, 'recovery'), true, 'the real defeat still rewinds');
});

test('elite with no doctrine telegraphs weapon_charge and holds its first firing edge 24 ticks', () => {
  const emitted = [];
  const bus = { emit(event, payload) { emitted.push({ event, payload }); } };
  const elite = {
    id: 42, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { isBoss: true, intent: { fire: true }, ai: { combatDoctrineId: null } },
  };
  const state = { tick: 100, entities: new Map([[42, elite]]) };
  const decision = { entityId: 42, directive: { objective: { targetId: 1 } }, combatDoctrine: null };

  applyEliteChargeTell(elite, decision, state, 100, bus);
  assert.equal(elite.data.intent.fire, false, 'the firing edge is held');
  const tell = emitted.find((e) => e.event === 'ai:telegraph');
  assert.ok(tell, 'weapon_charge telegraph emitted on the firing edge');
  assert.equal(tell.payload.kind, 'weapon_charge');
  assert.equal(tell.payload.entityId, 42);
  assert.equal(tell.payload.durationTicks, 24);
  assert.equal(tell.payload.tick, 100);

  // Held through the window; only the tick after the 24-tick lead releases the shot.
  emitted.length = 0;
  elite.data.intent.fire = true;
  applyEliteChargeTell(elite, decision, state, 123, bus);
  assert.equal(elite.data.intent.fire, false, 'the hold runs the full tell');
  assert.equal(emitted.length, 0, 'no duplicate tell inside the window');
  elite.data.intent.fire = true;
  applyEliteChargeTell(elite, decision, state, 124, bus);
  assert.equal(elite.data.intent.fire, true, 'first combat:fire comes ≥24 ticks after the tell');

  // Sustained fire is never re-held.
  applyEliteChargeTell(elite, decision, state, 125, bus);
  assert.equal(elite.data.intent.fire, true);
});

test('non-elites, doctrine combatants and score-owned capitals are untouched by the tell gate', () => {
  const emitted = [];
  const bus = { emit(event, payload) { emitted.push({ event, payload }); } };
  const plain = {
    id: 7, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { intent: { fire: true }, ai: {} },
  };
  const doctrineElite = {
    id: 8, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { isBoss: true, intent: { fire: true }, ai: { combatDoctrineId: 'iron_maw' } },
  };
  const scoreBoss = {
    id: 9, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { isBoss: true, intent: { fire: true }, ai: {} },
  };
  const state = {
    tick: 200,
    entities: new Map([[7, plain], [8, doctrineElite], [9, scoreBoss]]),
    capitalBossEncounters: { fights: {}, orders: { [capitalOrderKey(9)]: { scoreOwnsAttacks: true } } },
  };
  applyEliteChargeTell(plain, { entityId: 7 }, state, 200, bus);
  applyEliteChargeTell(doctrineElite, { entityId: 8, combatDoctrine: { doctrineId: 'x' } }, state, 200, bus);
  applyEliteChargeTell(scoreBoss, { entityId: 9 }, state, 200, bus);
  assert.equal(plain.data.intent.fire, true, 'a non-elite fires the same tick as before');
  assert.equal(doctrineElite.data.intent.fire, true, 'doctrine tells already cover this elite');
  assert.equal(scoreBoss.data.intent.fire, true, 'the capital score owns its own telegraphs');
  assert.equal(emitted.length, 0, 'no extra ai:telegraph traffic');
});

test('the after-action screen offers Retry act only for an active boss-fight defeat', () => {
  const receipt = {
    fatalSummary: 'x', cause: 'x', capitalBossFightId: 'contract:capital_boss_tollman',
    capitalBossName: 'The Tollman', capitalBossActTitle: 'I · THE OFFER',
  };
  const active = { missions: { active: [{ id: 'contract:capital_boss_tollman', status: 'active' }] } };
  const ctx = (over = {}) => ({
    state: {
      combat: { lastPlayerDefeat: receipt },
      settings: { gameplay: { difficulty: 'standard' } },
      ...over,
    },
  });
  const offer = capitalBossRetryOffer(ctx({ ...active }));
  assert.ok(offer, 'the offer exists for an active capital-fight defeat');
  assert.equal(offer.fightId, 'contract:capital_boss_tollman');
  assert.ok(offer.caption.includes('The Tollman') && offer.caption.includes('I · THE OFFER'));
  assert.equal(capitalBossRetryOffer(ctx({ ...active, missions: { active: [] } })), null,
    'a settled/missing mission withdraws the verb');
  const ironmanCtx = ctx({ ...active });
  ironmanCtx.state.settings.gameplay.difficulty = 'ironman';
  assert.equal(capitalBossRetryOffer(ironmanCtx), null, 'Ironman never offers retry');
});

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.style = {};
    this.classList = {
      add: (c) => { this._cls = this._cls || {}; this._cls[c] = true; },
      remove: (c) => { if (this._cls) delete this._cls[c]; },
      contains: (c) => !!(this._cls && this._cls[c]),
    };
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
}

class FakeDocument {
  constructor() { this.activeElement = null; this.head = new FakeElement(this, 'head'); }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

test('mounted gameOver mounts the Retry act verb only with a live offer and sends boss_staging', () => {
  const previous = globalThis.document;
  const document = new FakeDocument();
  globalThis.document = document;
  const emitted = [];
  try {
    const state = {
      combat: {
        lastPlayerDefeat: {
          fatalSummary: 'Hull breached under fire', cause: 'Hull breached under fire',
          direction: 'AFT', dominantLayer: 'hull', vitalsPct: { shield: 0, armor: 0, hull: 0 },
          capitalBossFightId: 'contract:capital_boss_tollman',
          capitalBossName: 'The Tollman', capitalBossActTitle: 'I · THE OFFER',
          recovery: { schemaVersion: 1 },
        },
      },
      missions: { active: [{ id: 'contract:capital_boss_tollman', status: 'active' }] },
      settings: { gameplay: { difficulty: 'standard' } },
      save: { slots: {} },
      entities: new Map(),
    };
    const ctx = {
      state,
      bus: { on() { return () => {}; }, emit(event, payload) { emitted.push({ event, payload }); } },
      screenManager: { top() { return 'gameOver'; }, popScreen() {}, pushScreen() {} },
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };
    const root = document.createElement('div');
    gameOverScreen.mount(root, ctx);
    gameOverScreen.onShow(ctx);
    const button = gameOverScreen._bossRetryButton;
    assert.ok(button, 'the Retry act verb is mounted');
    assert.equal(button.hidden, false, 'a live offer keeps the verb visible');
    button.listeners.get('click')();
    const req = emitted.find((e) => e.event === 'player:recoveryRequested');
    assert.ok(req, 'click emits the existing recovery intent');
    assert.equal(req.payload.plan, 'boss_staging');
    assert.equal(req.payload.fightId, 'contract:capital_boss_tollman');
  } finally {
    globalThis.document = previous;
  }
});
