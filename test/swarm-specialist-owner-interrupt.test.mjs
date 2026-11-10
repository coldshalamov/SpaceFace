import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';

for (const cause of ['disabled', 'stunned', 'hull']) {
  test(`the Anchor force owner stops ${cause} sources without waiting for another AI decision`, (t) => {
    const enabled = FIELD_FLAGS.enabled;
    FIELD_FLAGS.enabled = true;
    t.after(() => { FIELD_FLAGS.enabled = enabled; });
    const bus = createBus();
    const owner = Object.create(fields);
    const anchor = { id: 71, type: 'ship', alive: true, team: 1, hull: 100,
      pos: { x: 300, z: 0 }, data: { runCohort: 'survival', runWave: 22,
        enemyTypeId: 'field_anchor_controller',
        fieldAnchor: { defKey: 'anchorSnare', spinupTicks: 45, radius: 235, strength: 185 } } };
    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
    const state = { tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
      run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 22 },
      entities: new Map([[1, player], [71, anchor]]), entityList: [player, anchor] };
    owner.init({ state, bus, helpers: {}, registry: null });
    t.after(() => { for (const off of owner._lifecycleUnsubs || []) off(); });
    const fieldId = owner._registerAnchoredField(anchor);
    for (const [doctrinePhase, tick] of [['field_spool', 100], ['anchor_hold', 130]]) {
      state.tick = tick;
      applySpecialistCounterplay({ state, specialist: anchor, enemyId: 'field_anchor_controller',
        doctrinePhase, doctrine: { phaseStartedTick: tick }, tick, fields: owner });
    }
    owner._syncAnchoredFields(state, state.fields);
    assert.equal(owner._kernel.get(fieldId).strength, SWARM_SPECIALIST_TUNING.anchor.activeStrength);

    if (cause === 'hull') anchor.hull = 0;
    else anchor.data[cause] = true;
    state.tick = 131;
    owner._syncAnchoredFields(state, state.fields);
    assert.equal(owner._kernel.get(fieldId).strength, 0);
    assert.equal(state.fields.anchored[fieldId].armed, false);
    assert.equal(anchor.data.swarmSpecialist.anchorActive, false);
    assert.equal(anchor.data.swarmSpecialist.phase, 'recovery');
    assert.equal(anchor.data.swarmSpecialist.interruptedAt, 131);
    const recoveryEnds = anchor.data.swarmSpecialist.phaseEndsAt;
    state.tick = 140;
    owner._syncAnchoredFields(state, state.fields);
    assert.equal(anchor.data.swarmSpecialist.phaseEndsAt, recoveryEnds,
      'each disabled physics tick must not extend the authored recovery');
    anchor.hull = 100; anchor.data.disabled = false; anchor.data.stunned = false;
    state.tick = 141;
    applySpecialistCounterplay({ state, specialist: anchor, enemyId: 'field_anchor_controller',
      doctrinePhase: 'anchor_hold', doctrine: { phaseStartedTick: 130 }, tick: 141, fields: owner });
    owner._syncAnchoredFields(state, state.fields);
    assert.equal(owner._kernel.get(fieldId).strength, 0, 'the cancelled commit cannot silently resume');
  });
}
