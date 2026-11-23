// DEMO-SWARM-QUIET-1: Adventure chatter stays off a Swarm fight. Each source is the
// one the game actually fires. A Swarm run yields no line; Adventure still says it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio, DEATH_CAPTION, payoffCaption } from '../src/audio/audioSystem.js';
import { distressCallCue, distressCallForRun } from '../src/audio/combatFeedbackEar.js';
import { resolveMasslineInstrument } from '../src/audio/masslineInstrument.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import {
  deathRecoverySubtitle,
  noteFirstCargoLanding,
  swarmDeniesCaption,
} from '../src/ui/hud.js';
import { isSwarmGlass } from '../src/ui/swarmGlass.js';

const CARGO = { items: { fuel_cell: 1 }, usedVolume: 1 };
const MANIFEST = '[ I ]';
const MAYDAY = { routedToPlayer: true, callerId: 7, pos: { x: 40, z: -12 } };

function swarmRun() {
  const state = createGameState(4242);
  state.run.kind = 'survival';
  state.run.phase = 'active';
  state.run.ruleset = SWARM_RULESET;
  return state;
}

function adventureRun() {
  const state = createGameState(4242);
  state.run.kind = 'adventure';
  state.run.phase = 'active';
  state.run.ruleset = null;
  return state;
}

function shown(state, text) {
  if (!text) return '';
  return swarmDeniesCaption(state, text) ? '' : String(text);
}

function earWith(state) {
  const bus = createBus();
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p));
  const ear = Object.create(audio);
  ear.init({ state, bus });
  ear.play = () => ({ id: 'stub' });
  ear._duckMusic = () => {};
  ear._triggerHush = () => {};
  return { ear, bus, captions };
}

test('a Swarm run hides each leaked line; Adventure still says it', () => {
  const swarm = swarmRun();
  const adventure = adventureRun();
  assert.equal(isSwarmGlass(swarm), true);
  assert.equal(isSwarmGlass(adventure), false);

  assert.equal(noteFirstCargoLanding(swarm, {
    wasEmpty: true, cargo: CARGO, bindingLabel: MANIFEST,
  }), '');
  assert.notEqual(swarm.player.hints.firstCargoManifest, true, 'the hint stays unspent');
  assert.equal(noteFirstCargoLanding(adventure, {
    wasEmpty: true, cargo: CARGO, bindingLabel: MANIFEST,
  }), `Cargo aboard. Manifest ${MANIFEST}.`);

  const swarmEar = earWith(swarm);
  const adventureEar = earWith(adventure);
  try {
    swarmEar.bus.emit('tech:researched', { nodeId: 'node_a' });
    adventureEar.bus.emit('tech:researched', { nodeId: 'node_a' });
    swarmEar.bus.emit('distress:call', MAYDAY);
    adventureEar.bus.emit('distress:call', MAYDAY);
    swarmEar.bus.emit('player:death', { cause: 'hull' });
    adventureEar.bus.emit('player:death', { cause: 'hull' });
    swarmEar.bus.emit('achievement:unlocked', { name: 'Made Contact' });
    swarmEar.bus.flush();
    adventureEar.bus.flush();

    assert.equal(payoffCaption('tech:researched', { nodeId: 'node_a' }), 'Research complete.');
    assert.deepEqual(swarmEar.captions.filter((c) => c.text === 'Research complete.'), []);
    assert.equal(adventureEar.captions.filter((c) => c.text === 'Research complete.').length, 1);

    assert.equal(distressCallCue(MAYDAY).caption, 'Mayday.');
    assert.equal(distressCallForRun(MAYDAY, { swarm: true }), null);
    assert.equal(distressCallForRun(MAYDAY, { swarm: false }).caption, 'Mayday.');
    assert.deepEqual(swarmEar.captions.filter((c) => c.text === 'Mayday.'), []);
    assert.equal(adventureEar.captions.filter((c) => c.text === 'Mayday.').length, 1);

    assert.equal(DEATH_CAPTION, 'Ship lost.');
    assert.equal(swarmEar.captions.filter((c) => c.text === 'Ship lost.').length, 1);
    assert.equal(adventureEar.captions.filter((c) => c.text === 'Ship lost.').length, 1);
    assert.equal(shown(swarm, 'Ship lost.'), '');
    assert.equal(shown(adventure, 'Ship lost.'), 'Ship lost.');

    assert.equal(deathRecoverySubtitle(swarm), '');
    assert.equal(deathRecoverySubtitle(adventure), 'Emergency recovery online…');

    assert.equal(swarmEar.captions.filter((c) => c.text === 'Achievement: Made Contact.').length, 1);
  } finally {
    swarmEar.ear.destroy();
    adventureEar.ear.destroy();
  }

  const strain = resolveMasslineInstrument({ event: 'strain', tension: 0.8, strain: 0.9 });
  assert.equal(strain.caption, 'Line strain.');
  assert.equal(shown(swarm, strain.caption), '');
  assert.equal(shown(adventure, strain.caption), 'Line strain.');

  const bus = createBus();
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p && p.text));
  presentationAdapters.init({ state: { tick: 1, simTime: 1, settings: {} }, bus });
  try {
    bus.emit('presentation:cue', { id: 'massline.threat', playerRelevance: 1, importance: 0.4 });
    bus.emit('presentation:cue', { id: 'combat.player.kill', playerRelevance: 1, importance: 0.4 });
    bus.flush();
  } finally {
    presentationAdapters.dispose();
  }
  assert.ok(captions.includes('Swing threat detected.'));
  assert.ok(captions.includes('Target destroyed.'));
  for (const line of ['Swing threat detected.', 'Target destroyed.']) {
    assert.equal(shown(swarm, line), '', line);
    assert.equal(shown(adventure, line), line, line);
  }
});
