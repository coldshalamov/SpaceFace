import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';

function boot(t, extra = {}) {
  const state = createGameState(4242), bus = createBus(), calls = [];
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    arenaId: 'helios_core', wave: 11, phase: 'active', ...extra };
  const owner = Object.create(swarmJuice);
  owner.init({ state, bus });
  t.after(() => owner.destroy());
  bus.on('swarm:announce', (p) => calls.push(p));
  return {
    state, bus, owner, calls,
    counter: (p = {}) => bus.emit('swarm:broodCounter', { kind: 'scrape', familyId: 'leecher', wave: state.run.wave, ...p }),
  };
}

test('the room names a real shed and a real broken shell once per round', t => {
  const h = boot(t);
  h.counter(); h.counter();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].text, 'LEECHER SHED');
  assert.equal(h.calls[0].kind, 'recovery');
  h.state.run.wave = 12; h.counter();
  assert.equal(h.calls.length, 2, 'a new round names the shed again');
  h.state.run.wave = 13;
  h.counter({ kind: 'shell', familyId: 'glassback' });
  h.counter({ kind: 'shell', familyId: 'glassback' });
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].text, 'SHELL BROKEN');
  h.bus.emit('run:started', {});
  h.counter({ kind: 'shell', familyId: 'glassback' });
  assert.equal(h.calls.length, 4, 'a fresh run retires the last run\'s ledger');
});

test('a scraped-off eel grip is named as a grip, not a leecher', t => {
  const h = boot(t);
  h.counter({ kind: 'scrape', familyId: 'wake_eel' });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].text, 'GRIP SHED');
});

for (const [name, extra, mode] of [
  ['another ruleset', { ruleset: 'standard' }],
  ['an ended run', { phase: 'ended' }],
  ['the draft between rounds', { phase: 'draft' }],
  ['pause', {}, 'pause'],
]) test(`no counter call in ${name}`, t => {
  const h = boot(t, extra);
  if (mode) h.state.mode = mode;
  h.counter();
  assert.equal(h.calls.length, 0);
});

test('stale waves and unknown counter kinds do not consume the real payoff', t => {
  const h = boot(t);
  h.counter({ wave: 12 });
  h.counter({ kind: 'unknown' });
  h.counter({ wave: 99 });
  assert.equal(h.calls.length, 0, 'a stale or unauthored receipt stays silent');
  h.counter();
  assert.equal(h.calls.length, 1);
});

test('the shell broken anywhere still names, on any arena or wave', t => {
  const h = boot(t, { arenaId: 'the_hive', wave: 27 });
  h.counter({ kind: 'shell', familyId: 'glassback', wave: 27 });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].text, 'SHELL BROKEN');
});

test('the pilot\'s shield coming back up is named SHIELD BACK once per round', t => {
  const h = boot(t);
  h.state.playerId = 'player-1';
  h.bus.emit('shieldRestored', { combatantId: 'player-1' });
  h.bus.emit('shieldRestored', { combatantId: 'player-1' });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].text, 'SHIELD BACK');
  h.bus.emit('shieldRestored', { combatantId: 'someone-else' });
  assert.equal(h.calls.length, 1, 'another ship\'s shield is not your recovery');
  h.state.run.wave = 12;
  h.bus.emit('shieldRestored', { combatantId: 'player-1' });
  assert.equal(h.calls.length, 2, 'the next round names it again');
});

test('a scooped repair cell and a bought patch both name HULL PATCHED', t => {
  const h = boot(t);
  h.bus.emit('swarm:supplyCollected', { id: 7, wave: 11, restored: 30, hull: 80, hullMax: 100 });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].text, 'HULL PATCHED');
  h.bus.emit('swarm:supplyCollected', { id: 8, wave: 11, restored: 0 });
  assert.equal(h.calls.length, 1, 'a cell that healed nothing names nothing');
  // The yard's between-rounds patch is the same recovery — it lands in the draft phase
  // under the next round's number, so it is named rather than deduped against round 11.
  h.state.run.phase = 'draft'; h.state.run.wave = 12;
  h.bus.emit('service:completed', { type: 'repair', restoredHull: 40, restoredArmor: 0 });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].text, 'HULL PATCHED');
  h.bus.emit('service:completed', { type: 'refuel', restoredHull: 0 });
  assert.equal(h.calls.length, 2, 'a non-repair service is not a hull patch');
});

test('cryo weather cues speak their short names on cryo drift only', t => {
  const h = boot(t, { arenaId: 'cryo_drift' });
  h.bus.emit('swarm:cryoWeather', { cue: 'moved', role: 'coolant', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'COLD FRONT');
  assert.equal(h.calls.at(-1).kind, 'cryo');
  h.bus.emit('swarm:cryoWeather', { cue: 'moved', role: 'heat', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'HEAT FRONT');
  h.bus.emit('swarm:cryoWeather', { cue: 'spent', role: 'coolant', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'FRONT PASSED');
  h.bus.emit('swarm:cryoWeather', { cue: 'lost', role: 'coolant', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'TANK LOST');
  h.bus.emit('swarm:cryoWeather', { cue: 'refilled', role: 'heat', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'RECHARGED');
  h.bus.emit('swarm:cryoWeather', { cue: 'low', role: 'coolant', wave: 11 });
  assert.equal(h.calls.at(-1).text, 'CHARGE LOW');
  h.bus.emit('swarm:cryoWeather', { cue: 'nonsense', role: 'coolant', wave: 11 });
  h.bus.emit('swarm:cryoWeather', { cue: 'moved', role: 'nonsense', wave: 11 });
  assert.equal(h.calls.length, 6, 'unauthored cues stay silent');
});

test('cryo weather cues stay silent off the cryo room', t => {
  const h = boot(t, { arenaId: 'helios_core' });
  h.bus.emit('swarm:cryoWeather', { cue: 'moved', role: 'coolant', wave: 11 });
  assert.equal(h.calls.length, 0);
});

test('recovery words do not change wallet, stock, time or sound', t => {
  const h = boot(t), before = JSON.stringify(h.state.run), effects = [];
  for (const name of ['run:awardRequested', 'audio:cue', 'camera:shake', 'time:effect']) {
    h.bus.on(name, p => effects.push({ name, p }));
  }
  h.counter();
  h.state.playerId = 'p';
  h.bus.emit('shieldRestored', { combatantId: 'p' });
  h.bus.emit('swarm:supplyCollected', { id: 9, wave: 11, restored: 10 });
  assert.equal(JSON.stringify(h.state.run), before);
  assert.deepEqual(effects, []);
});
