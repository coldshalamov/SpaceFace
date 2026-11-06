// inf-berth-voice (WF-13): the yard's own hand now speaks its whole lifecycle. Booking a paid
// job was total silence until the welders started; the self-serve decant answered with the
// same generic menu click as any info toast; and a REFUSED decant (tank room a paid pump
// already owns, or sealed cells) sounded the very click an info toast makes. Now: the order is
// taken on a deeper, quieter stamp of the dock clunk (one recipe, registers), the decant pours
// on the pressure-release hiss, and the refusal rides the capacity-refusal voice with the toast
// carrying only words. Seed 4242, no AudioContext.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import {
  SERVICE_BERTH_CUES,
  SERVICE_BERTH_REGISTERS,
  SERVICE_DECANT_CUE,
  AUDIO_RECIPE_BY_ID,
  audio,
  resolveAudioCueRecipeId,
  serviceDecantCue,
  serviceMomentCaption,
} from '../src/audio/audioSystem.js';
import { stationServices } from '../src/systems/stationServices.js';

const SEED = 4242;

function boot(extra = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 60, hullMax: 100, armorHp: 0, armorMax: 0 };
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    meta: { seed: SEED },
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios', sectors: {} },
    entities: new Map([[1, player]]),
    entityList: [player],
    fuel: { current: 20, max: 100 },
    ui: { docked: true, dockedStationId: 'station_helios' },
    ...extra,
  };
  const bus = createBus();
  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus, helpers: {} });
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  return { state, bus, ear, plays };
}

test('the queued voice is the dock clunk at a deeper, quieter register — one recipe, registers', () => {
  assert.equal(SERVICE_BERTH_CUES.queued, SERVICE_BERTH_CUES.started, 'the berth keeps one take-the-order recipe');
  assert.ok(RECIPES.some((row) => row.id === SERVICE_BERTH_CUES.queued), 'the clunk is an authored recipe');
  const queued = SERVICE_BERTH_REGISTERS.queued;
  const started = SERVICE_BERTH_REGISTERS.started;
  assert.ok(queued.gain < started.gain, 'the stamp is quieter than the welders');
  assert.ok(queued.rate < started.rate, 'the stamp sits deeper than the welders');
});

test('service:queued on the bus stamps once and names itself for the caption layer', () => {
  const { bus, ear, plays } = boot();
  try {
    bus.emit('service:queued', { jobId: 'job:x:1', type: 'repair', stationId: 'station_helios', units: 40, position: 0 });
    bus.flush();
    assert.equal(plays.length, 1, 'one stamp per booking');
    assert.equal(plays[0].recipeId, SERVICE_BERTH_CUES.queued);
    assert.equal(plays[0].opts.rate, SERVICE_BERTH_REGISTERS.queued.rate);
    assert.equal(serviceMomentCaption('service:queued'), 'The yard takes your job.');
    assert.equal(serviceMomentCaption('service:started'), null, 'existing registers keep their old behavior');
  } finally {
    ear.destroy();
  }
});

test('the decant pour is the pressure-release hiss, scaled by the cells that moved', () => {
  assert.ok(RECIPES.some((row) => row.id === SERVICE_DECANT_CUE.id), 'the hiss is an authored recipe');
  assert.equal(serviceDecantCue(null), null);
  assert.equal(serviceDecantCue({ cells: 0, units: 0 }), null, 'a receipt that moved nothing stays silent');
  assert.equal(serviceDecantCue({ cells: -2 }), null);
  const one = serviceDecantCue({ cells: 1, units: 24 });
  const many = serviceDecantCue({ cells: 8, units: 192 });
  assert.equal(one.id, 'sfx_rcs_hiss');
  assert.ok(one.rate > many.rate, 'more cells pour lower and longer');
  assert.ok(one.rate <= 1 && many.rate >= 0.85, 'the register stays in the hiss band');
  assert.equal(one.gain, many.gain, 'the pour is quiet at any size');
});

test('a real decant pours once; a real refusal speaks the capacity-refusal voice, not a toast tone', () => {
  const { state, bus, ear, plays } = boot({
    player: { heat: 0, cargo: { items: { cmdty_fuel_cells: 5 } } },
    fuel: { current: 20, max: 100 },
  });
  try {
    const toasts = [];
    bus.on('toast', (p) => toasts.push(p));
    const yard = Object.create(stationServices);
    yard.bus = bus;
    yard.state = state;

    const result = yard.decantFuelCells();
    bus.flush();
    assert.equal(result.ok, true, 'the pour succeeds');
    assert.equal(plays.filter((row) => row.recipeId === 'sfx_rcs_hiss').length, 1, 'one pour');
    assert.equal(toasts.filter((row) => row.audio === false).length, 0, 'a clean pour never needed a silenced toast');

    // Refusal: the tank cannot hold a whole cell (20 decanted in, room 76 -> force room < 24).
    plays.length = 0;
    toasts.length = 0;
    state.fuel = { current: 80, max: 100 };
    const refused = yard.decantFuelCells();
    bus.flush();
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'tank_full');
    assert.equal(toasts.length, 1, 'the refusal keeps its words');
    assert.equal(toasts[0].audio, false, 'the toast hands its sound to the refusal voice');
    assert.equal(refused.text, 'The tank has 20 left — a fuel cell needs 24.');
    assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_massline_deny'],
      'exactly one refusal voice: the capacity-refusal recipe, never a click');

    // The semantic cue the system emits resolves to that same recipe, distinct from the UI blip.
    assert.equal(resolveAudioCueRecipeId('service.decantRefused'), 'sfx_massline_deny');
    assert.notEqual('sfx_massline_deny', 'sfx_ui_error');
    assert.ok(AUDIO_RECIPE_BY_ID.sfx_massline_deny, 'the refusal voice is a real recipe');
  } finally {
    ear.destroy();
  }
});

test('the sealed-cells refusal rides the same voice from the request listener', () => {
  const { state, bus, ear, plays } = boot({
    // cells held but every one sealed (persistent cargo) — the custody reader refuses the decant
    player: { heat: 0, cargo: { items: { cmdty_fuel_cells: 5 } } },
    story: { persistentCargo: ['cmdty_fuel_cells'] },
    fuel: { current: 20, max: 100 },
  });
  try {
    const toasts = [];
    bus.on('toast', (p) => toasts.push(p));
    const yard = Object.create(stationServices);
    yard.bus = bus;
    yard.state = state;
    yard.init({ state, bus });
    bus.emit('service:decantRequest', {});
    bus.flush();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].audio, false, 'the sealed-cells refusal also declines the toast tone');
    assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_massline_deny']);
  } finally {
    ear.destroy();
  }
});
