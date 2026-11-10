import test from 'node:test';
import assert from 'node:assert/strict';

import { attentionAdmits, isAdventureFlight, plainCallout } from '../src/ui/attentionGlass.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { isSwarmGlass, swarmGlassAdmits } from '../src/ui/swarmGlass.js';

const flight = (extra = {}) => ({ mode: 'flight', run: null, ui: {}, playerId: 1, entities: { get: () => null }, ...extra });
const station = (extra = {}) => ({ mode: 'station', run: null, ui: { docked: true }, playerId: 1, entities: { get: () => null }, ...extra });
const swarm = (extra = {}) => ({
  mode: 'flight',
  run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
  ui: {},
  playerId: 1,
  entities: { get: () => null },
  ...extra,
});

test('Adventure flight is the flight glass, not the station or map', () => {
  assert.equal(isAdventureFlight(flight()), true);
  assert.equal(isAdventureFlight(station()), false);
  assert.equal(isAdventureFlight(swarm()), false);
  assert.equal(isAdventureFlight({ mode: 'map', run: null }), false);
});

test('Adventure flight is an actionable allowlist; prose and unknown sources stay off', () => {
  const st = flight();
  for (const source of ['combat', 'objective', 'system', 'error', 'danger', 'warning']) {
    assert.equal(attentionAdmits(st, { source, text: 'Taking fire' }), true, source);
  }
  for (const source of ['bark', 'chatter', 'news', 'landmark', 'codex', 'discovery', 'faction',
    'contract', 'rumor', 'market']) {
    assert.equal(attentionAdmits(st, { source, text: 'The desk is open.' }), false, source);
  }
  assert.equal(attentionAdmits(st, { kind: 'error', text: 'Docking denied' }), true);
});

test('Adventure callouts are plain words: the baseline jargon cannot draw', () => {
  const st = flight();
  assert.equal(plainCallout('double kill'), 'DOUBLE KILL');
  assert.equal(plainCallout('PILE-UP ×7'), 'PILE-UP ×7');
  for (const jargon of [
    'IMPACT LOGGED — 214',
    'CLEAN SNAG 93',
    'LINE RELEASED 16T — MESSY',
    'MASS 20 · EVEN PULL',
    'GYRE — STRAIN ×4 · 38t',
  ]) {
    assert.equal(plainCallout(jargon), null, jargon);
  }
});

test('receipt glass: Adventure flight refuses stunt jargon and chatter, keeps plain callouts', () => {
  const st = flight();
  assert.equal(admitReceipt({ text: 'IMPACT LOGGED — 214', kind: 'stunt', state: st }).admit, false);
  assert.equal(admitReceipt({ text: 'CLEAN SNAG 93', kind: 'stunt', state: st }).admit, false);
  assert.equal(admitReceipt({ text: 'PILE-UP ×7', kind: 'stunt', state: st }).admit, true);
  assert.equal(admitReceipt({ text: 'The desk is open.', kind: 'info', channel: 'news', state: st }).admit, false);
  assert.equal(admitReceipt({ text: 'Target destroyed', kind: 'info', channel: 'combat', state: st }).admit, true);
});

test('a multi-sentence tagline is prose, not a flight callout', () => {
  const st = flight();
  assert.equal(attentionAdmits(st, {
    kind: 'info',
    text: 'Light ships are ammunition. Swing a rock. Keep the speed.',
  }), false);
  assert.equal(admitReceipt({
    text: 'Light ships are ammunition. Swing a rock. Keep the speed.',
    kind: 'info',
    state: st,
  }).admit, false);
  // A one-sentence result still draws on an actionable channel.
  assert.equal(attentionAdmits(st, { kind: 'info', source: 'system', text: 'Refit complete.' }), true);
});

test('station screens keep their own words', () => {
  const st = station();
  assert.equal(admitReceipt({ text: 'The desk is open.', kind: 'info', channel: 'landmark', state: st }).admit, true);
});

test('the Swarm path is unchanged and still stricter', () => {
  const st = swarm();
  assert.equal(isSwarmGlass(st), true);
  assert.equal(swarmGlassAdmits(st, { source: 'boss' }), true);
  assert.equal(swarmGlassAdmits(st, { source: 'bark' }), false);
  // attentionGlass never loosens the Swarm surface: it abstains outside Adventure flight.
  assert.equal(attentionAdmits(st, { source: 'bark', text: 'The desk is open.' }), true);
});
