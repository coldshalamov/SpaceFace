import test from 'node:test';
import assert from 'node:assert/strict';
import { MORAL_TRAPS } from '../src/data/moralTraps.js';
import { moralTrapSystem, referenceTrapRefusal } from '../src/systems/moralTrap.js';
import { missions } from '../src/systems/missions.js';
import { MORAL_MEMORY_MAX_DEBTS, rememberMoralDebt } from '../src/systems/moralMemory.js';
import { infStoryScenario } from './helpers/infStoryScenario.mjs';

test('STORY-09 [4242] a refused trap writes one line; the same broker cites it on the next board', () => {
  const h = infStoryScenario([missions, moralTrapSystem]);
  try {
    const owner = h.sim.registry.get('missions');
    const first = owner.ensureBoard('station_helios').slots.find((offer) => offer.trap);
    assert.ok(first, 'the default board has a reachable trap');
    h.bus.emit('ui:acceptMission', { missionId: first.id });
    const mission = h.state.missions.active.find((row) => row.trap?.id === first.trap.id);
    assert.ok(mission, 'the ordinary board accept path creates the trapped mission');
    const option = MORAL_TRAPS[mission.trap.id].choice.options.find((row) => row.settle === 'end');
    const payload = { missionId: mission.id, optionId: option.id };
    h.bus.emit('moralTrap:choose', payload);
    h.bus.emit('moralTrap:choose', payload);
    const memory = h.state.story.moralMemory;
    assert.equal(memory.order.length, 1);
    const debt = memory.debts[memory.order[0]];
    assert.equal(debt.refusal.line, `Declined ${debt.refusal.partyName}'s offer: ${option.label}.`);
    assert.equal(debt.cause, `moral_trap:${mission.trap.id}:${option.id}`);
    const saved = JSON.parse(JSON.stringify(h.state.story));
    h.state.story = saved;
    h.state.simTime += 3600;
    const next = owner.ensureBoard('station_helios').slots.find((offer) => offer.factionId === first.factionId && !offer.source && !offer.storyTag);
    assert.ok(next, 'a later board offers work from the same broker');
    const expected = `${debt.refusal.partyName}: "You refused my last offer. I remember."`;
    assert.ok(next.brief.includes(expected));
    assert.equal(referenceTrapRefusal(next, h.state).brief, next.brief, 'refresh does not repeat the reference');
    const stranger = { id: 'unrelated', stationId: 'station_forge', factionId: first.factionId, brief: 'Different broker.' };
    assert.equal(referenceTrapRefusal(stranger, h.state), stranger);
    console.log(`STORY-09 memory: ${debt.refusal.line}`);
    console.log(`STORY-09 offer: ${expected}`);
  } finally { h.dispose(); }
});

test('STORY-09 [4242] honoring a trap is not a refusal; moral memory stays bounded', () => {
  const h = infStoryScenario([moralTrapSystem]);
  try {
    h.state.missions = { active: [{
      id: 'm_honored', stationId: 'station_forge', factionId: 'faction_mts',
      trap: MORAL_TRAPS.cargo_is_weapons, reward_cr: 500,
    }] };
    h.bus.emit('moralTrap:choose', { missionId: 'm_honored', optionId: 'deliver' });
    assert.equal(h.state.story.moralMemory.debts['moralTrap:m_honored'].refusal, undefined);
    for (let i = 0; i <= MORAL_MEMORY_MAX_DEBTS; i++) rememberMoralDebt(h.state, { id: `bounded:${i}` });
    const memory = h.state.story.moralMemory;
    assert.equal(memory.order.length, MORAL_MEMORY_MAX_DEBTS);
    assert.equal(Object.keys(memory.debts).length, MORAL_MEMORY_MAX_DEBTS);
    assert.equal(memory.debts['moralTrap:m_honored'], undefined);
  } finally { h.dispose(); }
});
