#!/usr/bin/env node
// Global one-voice arbiter check.
//
// Pins the pure VoiceQueue contract, the system wrapper, a 10-minute no-overlap soak, and the
// current backend/story voice-lane source contract. Direct UI/action toasts are allowed; spoken
// story/comms/news/bark surfaces must route through helpers.voice.say so the arbiter owns the floor.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { missions as missionsSystem } from '../src/systems/missions.js';
import { story as storySystem } from '../src/systems/story.js';
import {
  CHANNEL_PRIORITY,
  VoiceQueue,
  normalizeTtlMs,
  voiceArbiter,
} from '../src/ui/voiceArbiter.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let sections = 0;

function ok(label) {
  sections++;
  console.log(`  ok ${label}`);
}

function source(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function run(label, fn) {
  fn();
  ok(label);
}

run('normalizes ttl seconds/ms and preserves default priority order', () => {
  assert.equal(normalizeTtlMs(2), 2000);
  assert.equal(normalizeTtlMs(2500), 2500);
  assert.equal(normalizeTtlMs(0), 4000);
  assert(CHANNEL_PRIORITY.story > CHANNEL_PRIORITY.alert);
  assert(CHANNEL_PRIORITY.alert > CHANNEL_PRIORITY.bark);
  assert(CHANNEL_PRIORITY.bark > CHANNEL_PRIORITY.news);
  assert(CHANNEL_PRIORITY.news > CHANNEL_PRIORITY.info);
});

run('surfaces one active voice and preserves equal-priority insertion order', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'first', ttl: 1 }, 0);
  q.enqueue({ channel: 'info', text: 'second', ttl: 5 }, 0);
  const first = q.step(0);
  assert.equal(first.text, 'first');
  assert.equal(q.active.text, 'first');
  assert.equal(q.step(500), null, 'equal priority must wait while the floor is held');
  const second = q.step(1100);
  assert.equal(second.text, 'second');
  assert.equal(q.active.text, 'second');
});

run('allows only strictly higher priority to preempt the floor', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'low floor', ttl: 10 }, 0);
  assert.equal(q.step(0).text, 'low floor');

  q.enqueue({ channel: 'news', text: 'news waits behind active news?', ttl: 5 }, 100);
  const news = q.step(100);
  assert.equal(news.text, 'news waits behind active news?');
  assert.equal(q.active.channel, 'news');

  q.enqueue({ channel: 'news', text: 'equal news', ttl: 5 }, 200);
  assert.equal(q.step(200), null, 'same-priority arrivals do not preempt');

  q.enqueue({ channel: 'story', text: 'story cuts in', ttl: 5 }, 300);
  const story = q.step(300);
  assert.equal(story.text, 'story cuts in');
  assert.equal(q.active.channel, 'story');
});

run('replaces same-id entries without stacking duplicates', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'old readout', id: 'readout', ttl: 10 }, 0);
  q.enqueue({ channel: 'alert', text: 'new readout', id: 'readout', ttl: 10 }, 100);
  assert.equal(q.size, 1, 'queued same-id replacement stays one entry');
  const surfaced = q.step(100);
  assert.equal(surfaced.text, 'new readout');
  assert.equal(surfaced.priority, CHANNEL_PRIORITY.alert);

  q.enqueue({ channel: 'story', text: 'active update', id: 'readout', ttl: 10 }, 200);
  assert.equal(q.size, 1, 'active same-id replacement stays one floor holder');
  assert.equal(q.active.text, 'active update');
  assert.equal(q.pending.length, 0);
});

run('drops stale queued entries instead of surfacing late', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'story', text: 'long floor', ttl: 5 }, 0);
  q.enqueue({ channel: 'info', text: 'stale whisper', ttl: 1 }, 0);
  assert.equal(q.step(0).text, 'long floor');
  assert.equal(q.step(1500), null);
  assert.equal(q.pending.length, 0, 'stale queued item was dropped while floor stayed active');
});

run('rate-limits barks while letting non-barks take a free floor', () => {
  const q = new VoiceQueue({ barkMinGapMs: 1500 });
  q.enqueue({ channel: 'bark', text: 'first bark', ttl: 0.5 }, 0);
  assert.equal(q.step(0).text, 'first bark');

  q.enqueue({ channel: 'bark', text: 'too soon bark', ttl: 5 }, 600);
  assert.equal(q.step(600), null, 'second bark waits inside bark gap');

  q.enqueue({ channel: 'news', text: 'non-bark alternate', ttl: 5 }, 700);
  const alt = q.step(700);
  assert.equal(alt.text, 'non-bark alternate');
  assert.equal(alt.channel, 'news');
});

run('system wrapper installs helpers.voice and emits one arbiter-origin toast at a time', () => {
  const bus = createBus();
  const state = { simTime: 0 };
  const helpers = {};
  const toasts = [];
  bus.on('toast', (payload) => toasts.push({ ...payload, at: state.simTime }));

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  assert.equal(typeof helpers.voice.say, 'function');

  helpers.voice.say({ channel: 'info', text: 'floor', ttl: 1, kind: 'info' });
  helpers.voice.say({ channel: 'info', text: 'queued', ttl: 5, kind: 'info' });
  voiceArbiter.update(0, state);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'floor');
  assert.equal(toasts[0]._fromVoice, true);
  assert.equal(toasts[0].ttl, 1);

  state.simTime = 0.5;
  voiceArbiter.update(0.5, state);
  assert.equal(toasts.length, 1, 'held floor does not emit a second toast');

  state.simTime = 1.1;
  voiceArbiter.update(0.6, state);
  assert.equal(toasts.length, 2);
  assert.equal(toasts[1].text, 'queued');

  bus.emit('voice:say', { channel: 'alert', text: 'bus alert', ttl: 1, kind: 'warn' });
  state.simTime = 1.2;
  voiceArbiter.update(0.1, state);
  assert.equal(toasts.length, 3);
  assert.equal(toasts[2].text, 'bus alert');
  assert.equal(toasts[2].kind, 'warn');
});

run('migrated story helpers prefer voice and fall back to toast', () => {
  for (const [label, system] of [['missions', missionsSystem], ['story', storySystem]]) {
    const calls = [];
    const toasts = [];
    system.helpers = { voice: { say(msg) { calls.push(msg); return true; } } };
    system.bus = { emit(evt, payload) { toasts.push({ evt, payload }); } };

    assert.equal(system._sayStoryLine(`${label} direction`, 6), true);
    assert.equal(calls.length, 1, `${label}: voice should receive the story line`);
    assert.equal(calls[0].channel, 'story');
    assert.equal(calls[0].kind, 'story');
    assert.equal(calls[0].ttl, 6);
    assert.equal(toasts.length, 0, `${label}: voice success should not also toast`);

    calls.length = 0;
    toasts.length = 0;
    system.helpers = { voice: { say() { return false; } } };
    assert.equal(system._sayStoryLine(`${label} fallback`, 8), true);
    assert.equal(calls.length, 0);
    assert.equal(toasts.length, 1, `${label}: voice decline should preserve toast fallback`);
    assert.equal(toasts[0].evt, 'toast');
    assert.equal(toasts[0].payload.kind, 'story');
    assert.equal(toasts[0].payload.ttl, 8);
  }
});

run('10-minute soak never surfaces overlapping voices except strict priority replacement', () => {
  const q = new VoiceQueue({ barkMinGapMs: 1500 });
  const schedule = [];
  for (let t = 0; t <= 600000; t += 2750) {
    const n = t / 2750;
    schedule.push({ at: t, channel: n % 9 === 0 ? 'story' : (n % 4 === 0 ? 'bark' : (n % 3 === 0 ? 'news' : 'info')), text: `line ${n}`, ttl: n % 9 === 0 ? 6 : 3 });
    if (n % 17 === 0) schedule.push({ at: t + 250, channel: 'alert', text: `alert ${n}`, ttl: 2 });
    // The two tiers added for the one-voice closeout must serialize through the same floor with
    // zero overlap — inject them into the churn so the soak proves it over the full 10 minutes.
    if (n % 13 === 0) schedule.push({ at: t + 500, channel: 'tutorial', text: `teach ${n}`, ttl: 2 });
    if (n % 7 === 0) schedule.push({ at: t + 750, channel: 'objective', text: `objective ${n}`, ttl: 2 });
  }

  let index = 0;
  let last = null;
  let surfacedCount = 0;
  for (let now = 0; now <= 600000; now += 250) {
    while (index < schedule.length && schedule[index].at <= now) {
      q.enqueue(schedule[index], now);
      index++;
    }
    const before = q.active;
    const surfaced = q.step(now);
    if (!surfaced) continue;
    surfacedCount++;
    if (before && now < before.expireAt) {
      assert(surfaced.priority > before.priority,
        `only strict priority may replace an active floor at ${now}ms`);
    } else if (last) {
      assert(now >= last.end,
        `voice overlap: "${last.text}" held until ${last.end}ms but "${surfaced.text}" surfaced at ${now}ms`);
    }
    last = { text: surfaced.text, end: surfaced.expireAt, priority: surfaced.priority };
  }
  assert(surfacedCount >= 80, `soak must exercise real queue churn (got ${surfacedCount} surfaced lines)`);
});

run('voice arbiter uses injected sim time and keeps legacy toast bridge disabled', () => {
  const src = source('src/ui/voiceArbiter.js');
  assert.match(src, /state\.simTime/);
  assert.doesNotMatch(src, /\bDate\.now\s*\(/);
  assert.doesNotMatch(src, /\bMath\.random\s*\(/);
  assert.doesNotMatch(src, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(src, /\.on\(['"]toast['"]/,
    'legacy toast bridge must stay disabled unless the bus can cancel the original toast');
});

run('registry initializes voice before callers and updates it after story/onboarding', () => {
  const src = source('src/core/registry.js');
  assert.match(src, /core, voiceArbiter, input/);
  assert.match(src, /story, scenarioRuntime, heat, traffic, drill, claims, onboarding, voiceArbiter/);
});

run('spoken backend lanes route through helpers.voice.say', () => {
  const contracts = [
    ['src/systems/encounterDirector.js', /helpers && this\.helpers\.voice|this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/story.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/ui/marketNews.js', /helpers\.voice/, /voice\.say\(\{ channel: 'news'/],
    ['src/ui/sectorPostcard.js', /helpers\.voice/, /voice\.say\(\{ channel: 'news'/],
    ['src/ui/dockDenyBanner.js', /helpers\.voice/, /voice\.say\(\{ channel: 'comms'/],
    ['src/ui/customsPrompt.js', /helpers\.voice/, /voice\.say\(\{ channel: 'comms'/],
    ['src/systems/stationBroadcast.js', /helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/lossLedger.js', /helpers\.voice/, /voice\.say\(\{ channel: 'news'/],
    ['src/systems/pirateParley.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/pirateDisguise.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/pirateDisengage.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/bountyHunt.js', /helpers && helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/aceMemory.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{/],
    ['src/systems/wingMorale.js', /this\.helpers = ctx && ctx\.helpers/, /voice\.say\(\{/],
    ['src/systems/economyContracts.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{ channel: 'news'/],
    ['src/systems/gateControlDirector.js', /this\.helpers && this\.helpers\.voice/, /voice\.say\(\{ channel: 'comms'/],
    ['src/systems/contractClauses.js', /helpers\.voice/, /voice\.say\(\{ channel: 'comms'/],
    ['src/systems/moralTrap.js', /helpers\.voice/, /voice\.say\(\{ channel: 'comms'/],
  ];
  for (const [path, helperPattern, sayPattern] of contracts) {
    const src = source(path);
    assert.match(src, helperPattern, `${path}: must read helpers.voice`);
    assert.match(src, sayPattern, `${path}: must route spoken line through voice.say`);
  }
});

run('legacy story toast stragglers are migrated to voice helpers', () => {
  const missions = source('src/systems/missions.js');
  assert.match(missions, /_sayStoryLine\(dir, 6\)/);
  assert.match(missions, /_sayStoryLine\(BEAT_HINT\[b0\.beat\], 6\)/);
  assert.doesNotMatch(missions, /if \(dir\) this\.bus\.emit\('toast', \{ text: dir, kind: 'story'/);
  assert.doesNotMatch(missions, /BEAT_HINT\[b0\.beat\]\) this\.bus\.emit\('toast'/);

  const story = source('src/systems/story.js');
  assert.match(story, /this\._sayStoryLine\(`Ending: \$\{def\.title\}`, 8\)/);
  assert.doesNotMatch(story, /this\.bus\.emit\('toast', \{ text: `Ending: \$\{def\.title\}`, kind: 'story'/);
});

run('the two added tiers (tutorial, objective) arbitrate correctly against their neighbors', () => {
  // Default channel order after the closeout: story(100) > alert(80) > tutorial(70) > objective(60)
  // > bark(50) > news(30) > info(10). The existing five are untouched; only two were inserted.
  assert.equal(CHANNEL_PRIORITY.tutorial, 70);
  assert.equal(CHANNEL_PRIORITY.objective, 60);
  assert(CHANNEL_PRIORITY.alert > CHANNEL_PRIORITY.tutorial, 'danger(alert) preempts teaching');
  assert(CHANNEL_PRIORITY.tutorial > CHANNEL_PRIORITY.objective, 'teaching preempts objective nudges');
  assert(CHANNEL_PRIORITY.objective > CHANNEL_PRIORITY.bark, 'objective nudges preempt chatter');
  assert(CHANNEL_PRIORITY.story > CHANNEL_PRIORITY.alert, 'story stays load-bearing above the alert default');

  // Walk a single floor up the ladder: bark → objective → tutorial → story → danger(110 override).
  const q = new VoiceQueue();
  q.enqueue({ channel: 'bark', text: 'bark floor', ttl: 10, id: 'b' }, 0);
  assert.equal(q.step(0).text, 'bark floor');
  q.enqueue({ channel: 'objective', text: 'objective nudge', ttl: 10, id: 'o' }, 100);
  assert.equal(q.step(100).text, 'objective nudge', 'objective preempts a held bark');
  q.enqueue({ channel: 'tutorial', text: 'teach', ttl: 10, id: 't' }, 200);
  assert.equal(q.step(200).text, 'teach', 'tutorial preempts a held objective');
  q.enqueue({ channel: 'story', text: 'story cuts in', ttl: 10, id: 's' }, 300);
  assert.equal(q.step(300).text, 'story cuts in', 'story preempts a held tutorial');
  q.enqueue({ channel: 'alert', text: 'SHIELDS DOWN', ttl: 10, priority: 110, id: 'd' }, 400);
  assert.equal(q.step(400).text, 'SHIELDS DOWN', 'life-critical danger (priority 110) tops even story');
  // A plain objective nudge cannot preempt the active danger floor.
  q.enqueue({ channel: 'objective', text: 'late objective', ttl: 10, id: 'o2' }, 500);
  assert.equal(q.step(500), null, 'a lower tier cannot preempt the active danger floor');
});

run('system wrapper presents exactly one floor via voice:surface / voice:clear', () => {
  const bus = createBus();
  const state = { simTime: 0 };
  const helpers = {};
  const activeIds = new Set();
  let maxActive = 0;
  let surfaces = 0;
  bus.on('voice:surface', (p) => { activeIds.add(p.id); surfaces++; maxActive = Math.max(maxActive, activeIds.size); });
  bus.on('voice:clear', (p) => { activeIds.delete(p.id); });

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();

  // Interleave the new tiers with a preempting danger and a later story; tick on a fixed cadence.
  const scriptLines = [
    { at: 0.0, msg: { channel: 'objective', text: 'o', ttl: 1, id: 'o' } },
    { at: 0.0, msg: { channel: 'tutorial', text: 't', ttl: 1, id: 't' } },
    { at: 0.4, msg: { channel: 'alert', text: 'DANGER', ttl: 1, priority: 110, id: 'd' } },
    { at: 2.0, msg: { channel: 'story', text: 's', ttl: 1, id: 's' } },
  ];
  let idx = 0;
  for (let t = 0; t <= 5; t += 0.2) {
    state.simTime = t;
    while (idx < scriptLines.length && scriptLines[idx].at <= t + 1e-9) { helpers.voice.say(scriptLines[idx].msg); idx++; }
    voiceArbiter.update(0.2, state);
    assert(activeIds.size <= 1, `at ${t.toFixed(1)}s the presenter shows ${activeIds.size} floors (must be <=1)`);
  }
  assert.equal(maxActive, 1, 'the presenter never shows two floors at once');
  assert(surfaces >= 3, `tiers surfaced through the presenter (got ${surfaces})`);
  assert.equal(activeIds.size, 0, 'the last floor is cleared when its ttl elapses — nothing lingers');
});

run('the one-voice stragglers route their transient emissions through the arbiter', () => {
  const arbiter = source('src/ui/voiceArbiter.js');
  assert.match(arbiter, /tutorial:\s*70/, 'arbiter defines the tutorial tier at 70');
  assert.match(arbiter, /objective:\s*60/, 'arbiter defines the objective tier at 60');
  assert.match(arbiter, /emit\('voice:surface'/, 'arbiter presents its floor via voice:surface');
  assert.match(arbiter, /emit\('voice:clear'/, 'arbiter retracts its floor via voice:clear');

  const alerts = source('src/ui/alerts.js');
  assert.match(alerts, /emit\('voice:say'/, 'alerts.js routes transient alerts through the arbiter');
  assert.match(alerts, /on\('voice:surface'/, 'alerts.js presents the arbiter floor top-center');
  assert.match(alerts, /on\('voice:clear'/, 'alerts.js clears the arbiter floor');
  assert.match(alerts, /announce\(\{ key: 'shield-down'/, 'combat danger (SHIELDS DOWN) routes through the arbiter, not a parallel pill');

  const toasts = source('src/ui/toasts.js');
  assert.match(toasts, /if \(_fromVoice\) return/, 'toasts.js suppresses the arbiter _fromVoice mirror (no double-surface)');

  const onboarding = source('src/systems/onboarding.js');
  assert.match(onboarding, /voice\.say\(\{ channel: 'tutorial'/, 'onboarding routes tutorial lines to the tutorial tier');

  const missions = source('src/systems/missions.js');
  assert.match(missions, /voice\.say\(\{ channel: 'objective'/, 'missions routes the tracked-objective nudge to the objective tier');

  const story = source('src/systems/story.js');
  assert.match(story, /_viaVoice/, 'story marks arbiter-surfaced comms lines');
  const comms = source('src/ui/comms.js');
  assert.match(comms, /_viaVoice/, 'comms logs arbiter-surfaced lines to the backlog only (no double feed)');
});

console.log(`[check-one-voice] PASS - ${sections} sections green`);
