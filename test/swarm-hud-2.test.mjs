// DEMO-SWARM-HUD-2 — focused verification of Swarm's arcade HUD layer (items 1-11).
// Swarm arcade HUD, owner 2026-11-23.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runXpForLevel } from '../src/core/runState.js';
import { isSwarmHudActive } from '../src/ui/swarmGlass.js';
import { survivalHud, swarmChainBridge } from '../src/ui/survivalHud.js';
import { swarmJuiceHud } from '../src/ui/swarmJuiceHud.js';
import { contactDisplayName } from '../src/ui/map/flightMinimap.js';
import {
  SWARM_HUD_BODY_CLASS,
  SWARM_HUD_LAYER_CSS,
  SWARM_PICK_PULSE_S,
  SWARM_ROOM_KILL_FLASH_S,
  formatRoomMultiplier,
  formatSwarmPickLabel,
  formatSwarmRoundKicker,
  formatSwarmRoundName,
  isRoomKillCausePhrase,
} from '../src/ui/swarmHudLayer.js';

const DT = 1 / 60;

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.className = '';
    this.id = '';
    this.hidden = false;
    this.dataset = {};
    this.attrs = {};
    this._text = '';
    this._html = '';
    this._classes = new Set();
    this.style = { transform: '', width: '', display: '' };
    this.classList = {
      add: (...names) => { for (const n of names) this._classes.add(n); },
      remove: (...names) => { for (const n of names) this._classes.delete(n); },
      toggle: (n, force) => {
        const on = force === undefined ? !this._classes.has(n) : !!force;
        if (on) this._classes.add(n); else this._classes.delete(n);
        return on;
      },
      contains: (n) => this._classes.has(n),
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  appendChild(c) { c.parentNode = this; c.isConnected = true; this.children.push(c); return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    c.isConnected = false;
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
}

function withFakeDoc(fn) {
  const prev = globalThis.document;
  const html = new FakeEl('html');
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  const hud = new FakeEl('div');
  hud.id = 'hud';
  body.appendChild(hud);
  globalThis.document = {
    documentElement: html,
    head,
    body,
    createElement: (t) => new FakeEl(t),
    getElementById: (id) => (id === 'hud' ? hud : head.children.find((c) => c.id === id) || null),
    querySelector: () => null,
  };
  try { return fn({ html, head, body, hud }); }
  finally {
    survivalHud.destroy();
    swarmJuiceHud.destroy();
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

function makeSwarmState(overrides = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 10;
  state.ui = {};
  state.entities = new Map();
  state.entityList = [];
  state.run = {
    kind: 'survival',
    ruleset: 'swarm',
    phase: 'active',
    arenaId: 'helios_core',
    wave: 6,
    level: 4,
    xp: Math.round((runXpForLevel(4) + runXpForLevel(5)) / 2),
    credits: 420,
    score: 3850,
    threatBudget: 16,
    spawnedThreat: 16,
    resolvedThreat: 4,
    pilot: { nodes: [], points: {}, banked: 0, offer: null },
    ...overrides,
  };
  return state;
}

test('Item 1: top-edge XP bar uses scaleX, LV N left, LEVEL N centre ride ~1.2 s, +1 pick pulse -> quiet N picks', () => {
  withFakeDoc(() => {
    const state = makeSwarmState();
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    const d = survivalHud._swarmLayer.dom;

    assert.equal(d.lvN.textContent, '4');
    assert.match(d.xpFill.style.transform, /^scaleX\(0\.\d+\)$/, 'XP bar fills by transform scaleX, never width');
    assert.equal(d.xpFill.style.width, '', 'XP bar never sets style.width');
    assert.match(d.xpTipRail.style.transform, /^translateX\(\d+\.\d+%\)$/, 'white-hot leading tip tracks fill');
    assert.equal(d.lvRide.hidden, true);
    assert.equal(d.picks.hidden, true);

    // Level-up to 5 with 1 pick banked.
    state.run.level = 5;
    state.run.xp = runXpForLevel(5);
    state.run.pilot.banked = 1;
    bus.emit('run:levelUp', { level: 5, previousLevel: 4, xp: state.run.xp, banked: 1 });
    survivalHud.update(DT, state);
    assert.equal(d.lvN.textContent, '5');
    assert.equal(d.lvRide.hidden, false);
    assert.equal(d.lvRide.textContent, 'LEVEL 5');
    assert.equal(d.picks.hidden, false);
    assert.equal(d.picks.textContent, '+1 pick');
    assert.equal(d.picks.dataset.fresh, '1');
    assert.ok(d.xpFlash.dataset.flash === 'a' || d.xpFlash.dataset.flash === 'b');

    // After ~1.2 s, LEVEL 5 clears and banked picks settle to a small quiet count.
    state.run.pilot.banked = 2;
    state.simTime += SWARM_PICK_PULSE_S + 0.1;
    survivalHud.update(DT, state);
    assert.equal(d.lvRide.hidden, true);
    assert.equal(d.picks.hidden, false);
    assert.equal(d.picks.textContent, '2 picks');
    assert.equal(d.picks.dataset.fresh, undefined);
  });
});

test('Item 2: top-centre Round Plate, between-round countdown, Boss Machine-Plate, and Stage round banner coordination', () => {
  withFakeDoc(() => {
    const state = makeSwarmState({ wave: 6, threatBudget: 16, spawnedThreat: 16, resolvedThreat: 4 });
    const bus = createBus();
    survivalHud.init({ state, bus });
    swarmJuiceHud.init({ state, bus, helpers: {} });
    survivalHud.update(DT, state);
    const d = survivalHud._swarmLayer.dom;

    // Active combat round: ROUND 6 / The Charge | 12 left
    assert.equal(d.round.hidden, false);
    assert.equal(d.boss.hidden, true);
    assert.equal(d.roundKicker.textContent, 'ROUND 6');
    assert.equal(d.roundName.textContent, 'The Charge');
    assert.equal(d.roundNum.textContent, '12');
    assert.equal(d.roundUnit.textContent, 'left');

    // Between rounds (cleanup): same plate shows NEXT ROUND countdown
    state.run.phase = 'cleanup';
    survivalHud.update(DT, state);
    assert.equal(d.round.dataset.mode, 'between');
    assert.equal(d.roundKicker.textContent, 'NEXT ROUND');
    assert.equal(d.roundName.textContent, 'Long Shots');
    assert.equal(d.roundNum.textContent, '0:03');
    // With the wave's plan known, the countdown is the plan's own cleanup (Swarm: 45 ticks), so it
    // never promises three seconds the run will not wait (demo batch review 2026-11-23).
    bus.emit('run:wavePlanned', { wave: 6, plan: { completionRules: { cleanupTicks: 45 } } });
    state.simTime += 0.001;
    survivalHud.update(DT, state);
    assert.equal(d.roundNum.textContent, '0:01');

    // Boss round: Boss Machine-Plate takes the Round Plate's seat with heavy segmented scaleX bar
    state.run.phase = 'active';
    state.run.wave = 5;
    bus.emit('swarm:bossHp', { name: "Dreadnought 'Iron Maw'", frac: 0.65, alive: 1, total: 1 });
    swarmJuiceHud.update(DT, state);
    survivalHud.update(DT, state);
    assert.equal(d.round.hidden, true, 'boss plate replaces round plate');
    assert.equal(d.boss.hidden, false);
    assert.equal(d.bossName.textContent, "Dreadnought 'Iron Maw'");
    assert.equal(d.bossPct.textContent, '65%');
    assert.equal(d.bossFill.style.transform, 'scaleX(0.65)');
    assert.equal(d.bossFill.style.width, '', 'boss bar fills by scaleX, never width');
    assert.equal(swarmJuiceHud._dom.boss.hidden, true, 'no duplicate boss bar in swarmJuiceHud');

    // Round banner owns top lane <= 2 s and hides the round/boss plate so only one thing shows
    bus.emit('swarm:roundSlam', { wave: 5, boss: { name: 'Iron Maw' } });
    swarmJuiceHud.update(DT, state);
    survivalHud.update(DT, state);
    assert.equal(swarmJuiceHud._dom.slam.hidden, false);
    assert.equal(swarmJuiceHud._dom.slamTitle.textContent, 'Iron Maw');
    assert.equal(d.boss.hidden, true, 'boss plate yields to active banner');
    assert.equal(d.round.hidden, true, 'round plate yields to active banner');
    state.simTime += 2.0;
    swarmJuiceHud.update(DT, state);
    survivalHud.update(DT, state);
    assert.equal(swarmJuiceHud._dom.slam.hidden, true, 'round banner clears within ~2 s');
    assert.equal(d.boss.hidden, false, 'boss plate returns once banner clears');
  });
});

test('Item 3: Chain under round plate shows multiplier + Kiln voice line only when live, never banned jargon', () => {
  withFakeDoc(() => {
    const state = makeSwarmState();
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    const d = survivalHud._swarmLayer.dom;

    assert.equal(d.chain.hidden, true, 'hidden when no chain is live');

    bus.emit('swarm:chain', { chain: 28, best: 28, cause: 'terrain', step: 2, at: state.simTime });
    survivalHud.update(DT, state);
    assert.equal(d.chain.hidden, false);
    assert.equal(d.chainMult.textContent, '×3');
    assert.equal(d.chainLine.textContent, 'Off the wall!');
    assert.match(d.chainFill.style.transform, /^scaleX\(/);
    assert.doesNotMatch(`${d.chainMult.textContent} ${d.chainLine.textContent}`,
      /\b(IGNITION|FLARE|NOVA|MIXED\s*\+\s*2)\b/i);

    bus.emit('swarm:chainBroken', {});
    survivalHud.update(DT, state);
    assert.equal(d.chain.hidden, true);
  });
});

test('Item 4: Top-right Scrap + Score and room-kill ×2.5 multiplier flash', () => {
  withFakeDoc(() => {
    const state = makeSwarmState({ credits: 420, score: 3850 });
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    const d = survivalHud._swarmLayer.dom;

    assert.equal(d.scrapNum.textContent, '420');
    assert.equal(d.scoreNum.textContent, '3,850');
    assert.equal(d.roomMult.hidden, true);

    assert.equal(isRoomKillCausePhrase('Thrown mass'), true);
    assert.equal(isRoomKillCausePhrase('Pulse Cannon'), false);
    assert.equal(formatRoomMultiplier(2.5), '×2.5');

    // Gun kill does not flash the room multiplier
    bus.emit('run:awarded', { reason: 'kill', causePhrase: 'Pulse Cannon', credits: 10, score: 100, xp: 3 });
    survivalHud.update(DT, state);
    assert.equal(d.roomMult.hidden, true);

    // Room kill flashes ×2.5 beside Scrap for a beat
    bus.emit('run:awarded', { reason: 'kill', causePhrase: 'Thrown mass', credits: 25, score: 120, xp: 8 });
    survivalHud.update(DT, state);
    assert.equal(d.roomMult.hidden, false);
    assert.equal(d.roomMult.textContent, '×2.5');

    state.simTime += SWARM_ROOM_KILL_FLASH_S + 0.1;
    survivalHud.update(DT, state);
    assert.equal(d.roomMult.hidden, true, 'room-kill flash clears after its beat');
  });
});

test('Item 6 & 7: sf-swarm-hud body class gates Swarm and clears on run end / quit / Run Over; no Traffic labels', () => {
  withFakeDoc(({ body }) => {
    const state = makeSwarmState();
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    assert.equal(isSwarmHudActive(state), true);
    assert.equal(body.classList.contains(SWARM_HUD_BODY_CLASS), true);

    // Run end / Run Over clears the class immediately so Adventure never leaks
    state.run.phase = 'ended';
    bus.emit('run:ended', { outcome: 'defeat' });
    survivalHud.update(DT, state);
    assert.equal(isSwarmHudActive(state), false);
    assert.equal(body.classList.contains(SWARM_HUD_BODY_CLASS), false);

    // Restarting re-sets it; exitToMenu clears it cleanly
    state.run.phase = 'active';
    survivalHud.update(DT, state);
    assert.equal(body.classList.contains(SWARM_HUD_BODY_CLASS), true);
    bus.emit('game:exitToMenu', {});
    assert.equal(body.classList.contains(SWARM_HUD_BODY_CLASS), false);

    // Adventure flight never sets sf-swarm-hud
    state.run = { kind: 'adventure', phase: 'inactive' };
    survivalHud.update(DT, state);
    assert.equal(isSwarmHudActive(state), false);
    assert.equal(body.classList.contains(SWARM_HUD_BODY_CLASS), false);
  });

  // Minimap contact display name suppresses Traffic in Swarm, keeps it in Adventure
  const ambient = { data: { role: 'civilian' } };
  assert.equal(contactDisplayName(ambient, 'civilian', { isSwarm: false }), 'Traffic');
  assert.equal(contactDisplayName(ambient, 'civilian', { isSwarm: true }), '');
  assert.equal(contactDisplayName({ data: { name: 'Traffic' } }, 'neutral', { isSwarm: true }), '');
});

test('Item 10 & 11: no per-frame layout reads / querySelector in swarmHudLayer; reduced motion suppresses flashes while words still update', () => {
  const src = readFileSync(new URL('../src/ui/swarmHudLayer.js', import.meta.url), 'utf8');
  const updateBody = src.slice(src.indexOf('function update('));
  assert.doesNotMatch(updateBody, /getBoundingClientRect|offsetWidth|offsetHeight|clientWidth|querySelector/,
    'update() performs zero layout reads and zero querySelector calls');
  assert.match(SWARM_HUD_LAYER_CSS, /prefers-reduced-motion:\s*reduce/);
  assert.match(SWARM_HUD_LAYER_CSS, /html\.sf-reduce-motion \.sf-swhud__xp-flash/);
  assert.equal(formatSwarmRoundKicker({ wave: 6 }), 'ROUND 6');
  assert.equal(formatSwarmRoundName({ wave: 6 }), 'The Charge');
  assert.equal(formatSwarmPickLabel(1, true, 1), '+1 pick');
  assert.equal(formatSwarmPickLabel(2, false, 1), '2 picks');

  withFakeDoc(({ html }) => {
    html.classList.add('sf-reduce-motion');
    const state = makeSwarmState();
    state.settings.video.motionReduce = true;
    const bus = createBus();
    survivalHud.init({ state, bus });
    survivalHud.update(DT, state);
    const d = survivalHud._swarmLayer.dom;

    state.run.level = 5;
    state.run.pilot.banked = 1;
    bus.emit('run:levelUp', { level: 5, previousLevel: 4, xp: runXpForLevel(5), banked: 1 });
    bus.emit('run:awarded', { reason: 'kill', causePhrase: 'Thrown mass', credits: 25, score: 100, xp: 5 });
    survivalHud.update(DT, state);

    assert.equal(d.root.dataset.reduced, '1');
    assert.equal(d.xpFlash.dataset.flash, undefined, 'no XP bar flash under reduced motion');
    assert.equal(d.picks.dataset.pulse, undefined, 'no pick chip pulse under reduced motion');
    assert.equal(d.roomMult.dataset.flash, undefined, 'no room-kill flash animation under reduced motion');
    // Words STILL change cleanly under reduced motion:
    assert.equal(d.lvN.textContent, '5');
    assert.equal(d.lvRide.textContent, 'LEVEL 5');
    assert.equal(d.picks.textContent, '+1 pick');
    assert.equal(d.roomMult.textContent, '×2.5');
  });
});
