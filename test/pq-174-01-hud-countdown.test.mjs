// PQ-174.01 HUD — the swarm readout is the live cohort count, not a kill quota or a clock.
//
// Seed 4242, Helios Core. Swarm rounds complete their finite cohort: the HUD reads the run's
// own spawned/resolved census and never invents progress; the legacy tick-based waveProgress
// path still renders only what survivalWave publishes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import {
  SWARM_RULESET,
  bindSwarmPressureContext,
  resetSwarmPressureState,
} from '../src/data/swarmMode.js';
import {
  survivalHud,
  waveCountdownClock,
  waveElapsedFill,
} from '../src/ui/survivalHud.js';
import {
  survivalAnnounce,
  waveOpeningLine,
} from '../src/systems/survivalAnnounce.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 4242;
const QUOTA_FIG = /^\d+\s*\/\s*\d+$/;

function installDom() {
  const previous = globalThis.document;
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.className = '';
      this.hidden = false;
      this._text = '';
      this.style = {};
      this.dataset = {};
      this.id = '';
    }
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._text;
    }
    set textContent(value) {
      this._text = String(value ?? '');
      this.children = [];
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'id') this.id = String(value);
    }
    getAttribute(name) {
      if (name === 'id') return this.id || null;
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    appendChild(child) {
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    }
  }
  const head = new El('head');
  const body = new El('body');
  const host = new El('div');
  host.className = 'sf-leftcontext';
  body.appendChild(host);
  function walk(node, pred) {
    if (pred(node)) return node;
    for (const child of node.children) {
      const found = walk(child, pred);
      if (found) return found;
    }
    return null;
  }
  globalThis.document = {
    head,
    body,
    createElement(tag) { return new El(tag); },
    getElementById(id) {
      return walk(head, (n) => n.id === id) || walk(body, (n) => n.id === id);
    },
    querySelector(sel) {
      if (sel === '.sf-leftcontext') {
        return walk(body, (n) => String(n.className).split(/\s+/).includes('sf-leftcontext'));
      }
      return null;
    },
  };
  return {
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

function boot(seed = SEED) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  const state = createGameState(seed);
  state.mode = 'flight';
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  survivalHud.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    survivalWave.update(DT);
    survivalRun.update(DT);
    survivalHud.update(DT, h.state);
  }
}

function beginSwarm(h, seed = SEED) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA,
  });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
  return h.state.run;
}

function liveHostiles(h) {
  const out = [];
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.alive === false) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(entity);
  }
  return out;
}

function killOne(h) {
  const live = liveHostiles(h);
  if (live.length === 0) return false;
  const victim = live[0];
  victim.alive = false;
  h.state.entities.delete(victim.id);
  h.bus.emit('entity:destroyed', { id: victim.id });
  return true;
}

function hud() {
  const dom = survivalHud._dom;
  assert.ok(dom && dom.threatFig, 'HUD mounted a countdown figure');
  return {
    word: dom.threatWord.textContent,
    fig: dom.threatFig.textContent,
    fill: String(dom.threatFill.style.width || ''),
    fillPct: Number.parseInt(String(dom.threatFill.style.width || '0'), 10) || 0,
    hidden: !!dom.threat.hidden,
    aria: dom.threat.getAttribute('aria-label') || '',
    now: dom.threat.getAttribute('aria-valuenow'),
    max: dom.threat.getAttribute('aria-valuemax'),
    kills: dom.killFig ? dom.killFig.textContent : '',
  };
}

function paint(h) {
  survivalHud.update(DT, h.state);
  return hud();
}

function lastProgress(h) {
  const rows = h.emitted.filter((e) => e.event === 'run:waveProgress');
  return rows.length ? rows[rows.length - 1].payload : null;
}

test('clock helpers: 0:SS from remainingTicks, fill is elapsed not kills', () => {
  assert.equal(waveCountdownClock(3600), '0:60');
  assert.equal(waveCountdownClock(3540), '0:59');
  assert.equal(waveCountdownClock(1), '0:01');
  assert.equal(waveCountdownClock(0), '0:00');
  assert.equal(waveElapsedFill(3600, 3600), 0);
  assert.equal(waveElapsedFill(1800, 3600), 0.5);
  assert.equal(waveElapsedFill(0, 3600), 1);
  assert.equal(waveElapsedFill(0, 0), 0);
});

test('seed 4242: the round readout counts the live cohort and the wave closes on kills', () => {
  const dom = installDom();
  try {
    const h = boot(SEED);
    let cleared = null;
    h.bus.on('run:waveCleared', (p) => {
      if (cleared == null && p && p.wave === 1) cleared = { ...p, simTime: h.state.simTime };
    });
    const run = beginSwarm(h, SEED);
    assert.equal(run.phase, 'active');
    const t0 = paint(h);
    const progress0 = lastProgress(h);
    assert.ok(progress0, 'survivalWave published run:waveProgress');
    // The shipped wave contract is the finite cohort: the progress payload counts bodies, not ticks.
    assert.equal(progress0.completionKind, 'cohort');
    assert.ok(Number.isInteger(progress0.remaining) && Number.isInteger(progress0.total),
      `cohort progress carries remaining/total, got ${JSON.stringify(progress0)}`);
    assert.equal(progress0.durationTicks, undefined, 'no clock rides the cohort payload');
    assert.equal(t0.word, 'HOSTILES');
    const cohort = progress0.total;
    assert.equal(t0.fig, `${cohort} / ${cohort}`, `full cohort on the readout, got ${t0.fig}`);
    assert.equal(t0.fillPct, 0);
    assert.equal(t0.aria, 'Hostiles remaining');
    assert.equal(t0.now, String(cohort));
    assert.equal(t0.max, String(cohort));

    // Kills move the readout because kills are the finish line: each resolution drops the count.
    let killed = 0;
    for (let i = 0; i < 6 && killOne(h); i++) { killed += 1; tick(h, 1); }
    assert.ok(killed > 0, 'someone had to die');
    const t1 = paint(h);
    const progress1 = lastProgress(h);
    assert.equal(t1.fig, `${cohort - killed} / ${cohort}`, `kills resolved the count: ${t1.fig}`);
    assert.equal(t1.now, String(cohort - killed));
    assert.ok(t1.fillPct > 0, 'the bar is resolved-share, not elapsed time');
    assert.equal(t1.aria, 'Hostiles remaining');
    assert.ok(progress1.remaining < progress0.remaining, 'the published count fell with the kills');

    // The wave closes when the cohort resolves — no clock carries it over the line.
    for (let i = 0; i < 4000 && !cleared; i++) {
      if (i % 2 === 0) killOne(h);
      tick(h, 1);
    }
    assert.ok(cleared, 'wave 1 closed when its cohort resolved');
    assert.equal(cleared.completionKind, 'cohort');
    assert.equal(cleared.survivors, 0, 'a resolved cohort leaves no survivors to carry');
    const tEnd = paint(h);
    assert.match(tEnd.fig, /^0 \/ \d+$/, `cleared cohort reads empty: ${tEnd.fig}`);
    assert.equal(tEnd.now, '0');
    console.log(`[pq-174.01-hud] seed=${SEED} t0=${t0.fig} t1=${t1.fig} tEnd=${tEnd.fig} fill=${tEnd.fillPct}%`);
  } finally {
    survivalHud.destroy();
    survivalWave.destroy();
    survivalRun.destroy();
    dom.restore();
  }
});

test('seed 4242: the readout IS the cohort — kills move it because kills are the finish line', () => {
  const dom = installDom();
  try {
    const h = boot(SEED);
    beginSwarm(h, SEED);
    const beforeKills = paint(h);
    const progress0 = lastProgress(h);
    const cohort = progress0.total;
    assert.equal(beforeKills.fig, `${cohort} / ${cohort}`);
    assert.equal(beforeKills.fillPct, 0);
    assert.equal(beforeKills.word, 'HOSTILES');
    assert.ok(QUOTA_FIG.test(beforeKills.fig),
      `the cohort readout is honest x / total, got ${beforeKills.fig}`);

    let killed = 0;
    for (let i = 0; i < 12; i++) {
      if (killOne(h)) killed += 1;
      tick(h, 1);
    }
    const afterKills = paint(h);
    assert.ok(killed >= 1, `need a kill, got ${killed}`);
    const expectedRemaining = Math.max(0, cohort - killed);
    assert.equal(afterKills.fig, `${expectedRemaining} / ${cohort}`,
      'the figure answers the resolved count, not a clock');
    assert.notEqual(afterKills.fig, beforeKills.fig, 'kills move the readout — they ARE the wave');
    assert.ok(afterKills.fillPct > beforeKills.fillPct, 'the bar is resolved share');
    assert.equal(afterKills.word, 'HOSTILES');
    assert.equal(afterKills.aria, 'Hostiles remaining');
    assert.equal(afterKills.now, String(expectedRemaining));
  } finally {
    survivalHud.destroy();
    survivalWave.destroy();
    survivalRun.destroy();
    dom.restore();
  }
});

test('seed 4242: HUD does not advance the count itself — no resolution, no movement', () => {
  const dom = installDom();
  try {
    const h = boot(SEED);
    beginSwarm(h, SEED);
    const frozen = paint(h);
    const progressCount = h.emitted.filter((e) => e.event === 'run:waveProgress').length;

    for (let i = 0; i < 180; i++) {
      h.state.simTime += DT;
      survivalHud.update(DT, h.state);
    }
    const still = hud();
    assert.equal(still.fig, frozen.fig, 'no resolution → the cohort count does not change');
    assert.equal(still.fillPct, frozen.fillPct);
    assert.equal(still.now, frozen.now);
    assert.equal(
      h.emitted.filter((e) => e.event === 'run:waveProgress').length,
      progressCount,
      'HUD must not emit waveProgress',
    );
  } finally {
    survivalHud.destroy();
    survivalWave.destroy();
    survivalRun.destroy();
    dom.restore();
  }
});

test('a cohort wave announces the fight it is — contacts to break, kills that cleared', () => {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const run = createRunState({ kind: 'survival', seed: SEED });
  run.arenaId = ARENA;
  run.phase = 'active';
  run.wave = 1;
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET });
  bus.emit('run:wavePlanned', { wave: 1, plan });
  bus.emit('run:waveStarted', { wave: 1, tick: 1 });
  const opener = emitted.filter((e) => e.event === 'voice:say').map((e) => e.payload.text);
  assert.ok(opener.some((t) => /Break the pack/.test(t)), `swarm opener names the pack: ${opener[0]}`);
  assert.ok(!/Survive the minute/.test(opener.join('\n')), 'no clock on a cohort wave');
  assert.ok(!/Put down \d+/.test(opener.join('\n')), 'opener must not name a kill quota');
  emitted.length = 0;
  bus.emit('run:waveCleared', {
    wave: 1,
    completionKind: 'cohort',
    admitted: 12,
    killed: 12,
    survivors: 0,
    starved: false,
  });
  const texts = emitted.filter((e) => e.event === 'voice:say').map((e) => e.payload.text);
  assert.equal(texts[0], 'Wave 1 clear. Twelve down.');
  assert.ok(!/survived/.test(texts[0]), 'a resolved cohort is a clear, not a clock-out');
  assert.equal(waveOpeningLine(1, plan), opener[0]);
  survivalAnnounce.destroy();
});
