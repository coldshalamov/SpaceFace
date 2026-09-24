import test from 'node:test';
import assert from 'node:assert/strict';

import { save } from '../src/save/saveSystem.js';
import { canSave } from '../src/ui/screens/saveLoad.js';
import { playerIsDamageTarget } from '../src/combat/damage.js';
import { findActorEntity } from '../src/systems/scenarioRuntime.js';
import { audio as audioSystem, CAPITAL_PREDET_RECIPE, capitalPredetonationOffset } from '../src/audio/audioSystem.js';
import { moralTrapSystem } from '../src/systems/moralTrap.js';
import { targetBracketShape } from '../src/ui/targetBracket.js';
import { traffic } from '../src/systems/traffic.js';

function playerZero() {
  const player = { id: 0, alive: true };
  return { playerId: 0, entities: new Map([[0, player]]), entityList: [player] };
}

test('player id 0 is still a player for save, shields, and the scenario cast', () => {
  const state = playerZero();
  assert.equal(save._hasPlayerEntity.call({ state }), true);
  assert.equal(canSave({ state }), true);
  assert.equal(save._hasPlayerEntity.call({ state: { playerId: 0, entities: new Map() } }), false);
  assert.equal(playerIsDamageTarget(state, state.entities.get(0)), true);
  assert.equal(playerIsDamageTarget(state, { id: 3 }), false);
  assert.equal(findActorEntity(state, { id: 'player_kestrel' }).id, 0);
});

test('an audio cue with no id does not click like a menu', () => {
  const played = [];
  audioSystem._onCue.call({ play(id) { played.push(id); } }, null);
  audioSystem._onCue.call({ play(id) { played.push(id); } }, {});
  assert.deepEqual(played, []);
});

test('a capital pre-detonation tick is a combat recipe with a stable offset', () => {
  assert.equal(CAPITAL_PREDET_RECIPE, 'sfx_doctrine_ranged_charge');
  assert.notEqual(CAPITAL_PREDET_RECIPE, 'sfx_ui_hover');
  assert.equal(capitalPredetonationOffset(12, 0), capitalPredetonationOffset(12, 0));
  assert.notEqual(capitalPredetonationOffset(12, 0), capitalPredetonationOffset(12, 2));
});

test('a moral-trap reveal still speaks when no voice helper is mounted, once', () => {
  const toasts = [];
  const state = {
    simTime: 10,
    ui: {},
    missions: {
      active: [
        { id: 'm1', trap: { id: 't1', revealAt: 'mid_run', revealLine: 'The crate is weapons.', choice: { prompt: 'Choose' } } },
        { id: 'm2', trap: { id: 't2', revealAt: 'mid_run', revealLine: 'The passenger is wanted.', choice: { prompt: 'Choose' } } },
      ],
    },
  };
  const sys = {
    _state: state,
    _bus: { emit(name, payload) { if (name === 'toast') toasts.push(payload); } },
    _helpers: {},
    _speakReveal: moralTrapSystem._speakReveal,
    _maybeReveal: moralTrapSystem._maybeReveal,
  };
  sys._maybeReveal();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'The crate is weapons.');
  assert.equal(state.ui.moralTrap.missionId, 'm1');
  assert.equal(state.missions.active[1]._trapRevealed, undefined);
  sys._maybeReveal();
  assert.equal(toasts.length, 2);
  assert.equal(toasts[1].text, 'The passenger is wanted.');
});

test('a freight pod annotated as an object still gets the cargo bracket', () => {
  const pod = targetBracketShape({
    type: 'prop',
    data: { kind: 'cargo', freightCustodyPod: { qty: 2 } },
  }, false);
  assert.equal(pod, 'bracket-cargo');
  const ship = targetBracketShape({ type: 'ship', data: { freightCustodyPod: { qty: 1 } } }, true);
  assert.equal(ship, 'bracket-hostile');
});

test('the Helios liner lock title is the liner name', () => {
  const entity = { data: { trafficRole: 'express' } };
  traffic._refreshPassengerLinerPresentation.call(traffic, entity, {}, [], {
    originStationId: 'station_helios',
    destinationStationId: 'station_coalition',
    state: 'EN_ROUTE',
  });
  assert.equal(entity.data.name, 'Helios Civic Liner');
  assert.equal(entity.data.callsign, 'HELIOS-LINE');
  assert.match(entity.data.trafficLabel, /HELIOS CIVIC LINER/);
});
