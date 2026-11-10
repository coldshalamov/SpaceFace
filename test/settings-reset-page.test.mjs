// Settings: "Reset this page" on Audio, Video, Gameplay and Access.
//
// A pilot who had fiddled with volume, assists and text size had no way back to how the game
// shipped: the only reset row lived on Controls and returned key bindings only. Each of the other
// four pages now ends in one word that returns THAT page to createGameState(0).settings, key by key
// through the screen's own `_set` (so renderer/audio live-apply, the profile persists and the worker
// lane mirrors it), behind the kit confirm.
//
// Run: node --test test/settings-reset-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { matchingQualityPreset, applyQualityPreset } from '../src/render/adaptiveQuality.js';
import {
  settingsScreen, SETTINGS_RESET_PAGES, SETTINGS_RESET_COPY, settingsPageResetPlan,
} from '../src/ui/screens/settings.js';

const DEFAULTS = createGameState(0).settings;

function rig(seed = 11) {
  const state = createGameState(seed);
  const bus = createBus();
  const events = [];
  bus.on('settings:changed', (payload) => events.push(payload));
  return { ctx: { state, bus }, state, events, settings: state.settings };
}

const keysOf = (events, section) => events.filter((e) => e.section === section).map((e) => e.key);
const count = (list) => list.reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {});

function recorder() {
  const rows = [];
  const record = (kind) => (label, ...rest) => { rows.push({ kind, label, args: rest }); return rows[rows.length - 1]; };
  return {
    rows,
    word: record('word'),
    break: record('break'),
  };
}

test('the four pages have a reset and Controls keeps its own', () => {
  assert.deepEqual([...SETTINGS_RESET_PAGES], ['Audio', 'Video', 'Gameplay', 'Access']);
  for (const page of SETTINGS_RESET_PAGES) {
    assert.ok(SETTINGS_RESET_COPY[page].length > 20, `${page} confirm text is written`);
    assert.doesNotMatch(SETTINGS_RESET_COPY[page], /[a-z][A-Z]|_/, `${page} confirm text shows no internal ids`);
  }
  assert.match(SETTINGS_RESET_COPY.Access, /motion choice/, 'the Access confirm says the motion choice stays');
  assert.match(SETTINGS_RESET_COPY.Video, /Motion effects are set under Access/);
});

test('every page reset lists its shipped values and never a key it must keep', () => {
  const audio = settingsPageResetPlan('Audio', DEFAULTS);
  assert.deepEqual(audio.map((i) => i.key).sort(),
    Object.keys(DEFAULTS.audio).filter((k) => k !== 'defaultMuteVersion').sort());

  const keysFor = (page) => settingsPageResetPlan(page, DEFAULTS).map((i) => `${i.section || 'root'}.${i.key}`);
  const access = keysFor('Access');
  for (const kept of ['motionPreference', 'motionAsked', 'motionPrompted', 'motionDefaultVersion']) {
    assert.ok(!access.includes(`accessibility.${kept}`), `Access reset keeps ${kept}`);
  }
  assert.ok(!access.includes('root.locale'), 'Access reset keeps the language');
  assert.ok(access.includes('accessibility.textScale') && access.includes('root.uiScale'));

  const video = keysFor('Video');
  assert.ok(!video.includes('video.motionReduce'), 'Video reset keeps the mirrored motion switch');
  assert.ok(!video.includes('video.shadowsDefaultVersion'));

  const gameplay = keysFor('Gameplay');
  for (const kept of ['physicsBackend', 'aiBackend', 'flightBackend', 'runtimeProfile', 'controlScheme', 'controlSchemeV2']) {
    assert.ok(!gameplay.includes(`gameplay.${kept}`), `Gameplay reset keeps ${kept}`);
  }
  assert.ok(gameplay.includes('controls.flightMode'));
  for (const key of [...audio, ...settingsPageResetPlan('Gameplay', DEFAULTS)].map((i) => i.key)) {
    assert.notEqual(key, 'bindings', 'no reset ever touches key bindings');
  }
  assert.deepEqual(settingsPageResetPlan('Controls', DEFAULTS), []);
});

test('Audio: mutated volumes return to the shipped mix, one event per changed key', () => {
  const { ctx, settings, events } = rig();
  settings.audio.master = 0.1;
  settings.audio.music = 0.9;
  settings.audio.muteOnFocusLoss = true;
  settings.gameplay.autosaveIntervalS = 0;       // another page: must stay
  settings.controls.bindings = { forward: ['KeyI'] };
  const moved = settingsScreen._resetPage(ctx, 'Audio');

  assert.deepEqual(settings.audio, DEFAULTS.audio);
  assert.equal(moved, 3);
  assert.deepEqual(events.map((e) => `${e.section}.${e.key}=${e.value}`).sort(), [
    `audio.master=${DEFAULTS.audio.master}`,
    `audio.muteOnFocusLoss=${DEFAULTS.audio.muteOnFocusLoss}`,
    `audio.music=${DEFAULTS.audio.music}`,
  ].sort());
  assert.ok(Object.values(count(events.map((e) => e.key))).every((n) => n === 1), 'once per changed key');
  assert.equal(settings.gameplay.autosaveIntervalS, 0, 'a different page is untouched');
  assert.deepEqual(settings.controls.bindings, { forward: ['KeyI'] }, 'key bindings are untouched');
});

test('a page that is already at its shipped values emits nothing', () => {
  const { ctx, events } = rig();
  for (const page of SETTINGS_RESET_PAGES) settingsScreen._resetPage(ctx, page);
  assert.deepEqual(events, [], 'a fresh profile has nothing to give back');
});

test('Video: the picture returns to the shipped preset through the preset contract', () => {
  const { ctx, settings, events } = rig();
  assert.equal(matchingQualityPreset(DEFAULTS.video), 'medium', 'the shipped default is the Balanced preset');
  applyQualityPreset(settings, 'high');
  settings.video.fov = 80;
  settings.video.hudScale = 1.4;
  settings.video.screenShake = 20;
  settings.video.motionReduce = true;            // mirror of the Access choice: must stay
  settings.accessibility.motionPreference = 'reduce';
  settings.accessibility.motionAsked = true;
  settings.controls.bindings = { boost: ['KeyB'] };
  assert.equal(matchingQualityPreset(settings.video), 'high');

  settingsScreen._resetPage(ctx, 'Video');

  for (const key of Object.keys(DEFAULTS.video)) {
    if (key === 'motionReduce') continue;
    assert.deepEqual(settings.video[key], DEFAULTS.video[key], `video.${key} is back to the shipped value`);
  }
  assert.equal(matchingQualityPreset(settings.video), 'medium', 'the Quality mode lamp reads Balanced');
  assert.equal(settings.video.motionReduce, true, 'the motion mirror is kept');
  assert.equal(settings.accessibility.motionPreference, 'reduce');
  assert.ok(events.length > 0 && events.every((e) => e.section === 'video'));
  assert.ok(Object.values(count(events.map((e) => e.key))).every((n) => n === 1),
    'the preset and the residual pass never publish the same key twice');
  assert.ok(keysOf(events, 'video').includes('fov') && keysOf(events, 'video').includes('qualityPreset'));
  assert.deepEqual(settings.controls.bindings, { boost: ['KeyB'] });
});

test('Gameplay: assists, autosave and cameras return; difficulty, scheme and bindings follow their own rules', () => {
  const { ctx, settings, events } = rig();
  settings.gameplay.autosaveIntervalS = 0;
  settings.gameplay.tutorialHints = false;
  settings.gameplay.targetAssistStrength = 'off';
  settings.gameplay.pursuitSlotAssist = true;
  settings.gameplay.racingDistance = 100;
  settings.gameplay.velocityVectoring = false;
  settings.gameplay.difficulty = 'veteran';
  settings.gameplay.controlScheme = 'classic';
  settings.controls.flightMode = 'newtonian';
  settings.controls.bindings = { forward: ['KeyI'] };

  settingsScreen._resetPage(ctx, 'Gameplay');

  assert.equal(settings.gameplay.autosaveIntervalS, DEFAULTS.gameplay.autosaveIntervalS);
  assert.equal(settings.gameplay.tutorialHints, DEFAULTS.gameplay.tutorialHints);
  assert.equal(settings.gameplay.targetAssistStrength, DEFAULTS.gameplay.targetAssistStrength);
  assert.equal(settings.gameplay.pursuitSlotAssist, false);
  assert.equal(settings.gameplay.difficulty, 'standard', 'a non-Ironman difficulty returns to Standard');
  assert.equal(settings.gameplay.racingDistance, 58);
  assert.equal(settings.gameplay.velocityVectoring, true);
  assert.equal(settings.controls.flightMode, DEFAULTS.controls.flightMode);
  assert.equal(settings.gameplay.controlScheme, 'classic', 'the control scheme is a Controls row and stays');
  assert.deepEqual(settings.controls.bindings, { forward: ['KeyI'] });
  assert.ok(Object.values(count(events.map((e) => `${e.section}.${e.key}`))).every((n) => n === 1));
  assert.ok(events.every((e) => e.section === 'gameplay' || (e.section === 'controls' && e.key === 'flightMode')));
});

test('Gameplay: a chosen Ironman stays chosen — leaving it has its own confirm', () => {
  const { ctx, settings } = rig();
  settings.gameplay.difficulty = 'ironman';
  settings.gameplay.autosaveIntervalS = 300;
  settingsScreen._resetPage(ctx, 'Gameplay');
  assert.equal(settings.gameplay.difficulty, 'ironman');
  assert.equal(settings.gameplay.autosaveIntervalS, DEFAULTS.gameplay.autosaveIntervalS, 'the rest still resets');
});

test('Access: text size returns and applies; the recorded motion choice and language are never overwritten', () => {
  const props = {};
  const priorDocument = globalThis.document;
  const rootProps = {};
  globalThis.document = {
    documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } },
    getElementById: (id) => (id === 'ui-root' ? { style: { setProperty: (k, v) => { rootProps[k] = v; } } } : null),
  };
  try {
    const { ctx, settings, events } = rig();
    settings.accessibility.textScale = 1.4;
    settings.accessibility.highContrast = true;
    settings.accessibility.colorblindMode = 'tritanopia';
    settings.accessibility.captions = true;
    settings.accessibility.holdToToggle = { boost: true };
    settings.accessibility.motionPreference = 'reduce';
    settings.accessibility.motionAsked = true;
    settings.accessibility.motionPrompted = true;
    settings.video.motionReduce = true;
    settings.uiScale = 1.5;
    settings.locale = 'fr-FR';
    settings.controls.bindings = { forward: ['KeyI'] };

    settingsScreen._resetPage(ctx, 'Access');

    for (const key of Object.keys(DEFAULTS.accessibility)) {
      if (['motionPreference', 'motionAsked', 'motionPrompted', 'motionDefaultVersion'].includes(key)) continue;
      assert.deepEqual(settings.accessibility[key], DEFAULTS.accessibility[key], `accessibility.${key} is back to the shipped value`);
    }
    assert.equal(settings.accessibility.textScale, 1);
    assert.equal(props['--sf-text-scale'], '1', 'the text size is applied to the page, not only stored');
    assert.equal(settings.uiScale, DEFAULTS.uiScale);
    assert.equal(rootProps['--ui-scale'], '1');
    assert.equal(settings.accessibility.motionPreference, 'reduce', 'an explicit Reduce is kept');
    assert.equal(settings.accessibility.motionAsked, true);
    assert.equal(settings.accessibility.motionPrompted, true);
    assert.equal(settings.video.motionReduce, true);
    assert.equal(settings.locale, 'fr-FR', 'the language is kept');
    assert.deepEqual(settings.controls.bindings, { forward: ['KeyI'] });
    assert.ok(!keysOf(events, 'accessibility').some((k) => k.startsWith('motion')));
    assert.ok(Object.values(count(events.map((e) => `${e.section}.${e.key}`))).every((n) => n === 1));
  } finally {
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
  }
});

test('the foot of a page is one word behind the kit confirm: Keep changes nothing, Reset does', async () => {
  const { ctx, settings, events } = rig();
  settings.audio.master = 0.05;
  const asked = [];
  let answer = false;
  const original = settingsScreen._confirmReset;
  settingsScreen._confirmReset = (opts) => { asked.push(opts); return Promise.resolve(answer); };
  try {
    const build = recorder();
    settingsScreen._resetFoot(ctx, build, 'Audio');
    const words = build.rows.filter((r) => r.kind === 'word');
    assert.equal(words.length, 1);
    assert.equal(words[0].label, 'Reset this page');
    const click = words[0].args[0];

    click();                                   // Keep
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(asked.length, 1, 'a click asks first');
    assert.equal(asked[0].title, 'Reset this page?');
    assert.equal(asked[0].body, SETTINGS_RESET_COPY.Audio);
    assert.equal(settings.audio.master, 0.05, 'one misclick wipes nothing');
    assert.deepEqual(events, []);

    answer = true;                             // Reset
    click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(asked.length, 2);
    assert.equal(settings.audio.master, DEFAULTS.audio.master);
    assert.deepEqual(events.map((e) => e.key), ['master']);
  } finally {
    settingsScreen._confirmReset = original;
  }
});

test('an unknown page is not a reset', async () => {
  const { ctx, events } = rig();
  assert.equal(settingsScreen._resetPage(ctx, 'Controls'), 0);
  assert.equal(await settingsScreen._askReset(ctx, 'Controls'), false);
  assert.deepEqual(events, []);
});
