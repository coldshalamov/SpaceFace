import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';
import { projectCounterweightCircuitJournal } from '../src/features/counterweightCircuit/readModel.js';
import { resolveFlightObjectiveCommand, flightDestinationSurface } from '../src/ui/hud.js';

test('the published circuit view temporarily owns the flight objective and releases it', async () => {
  const lane = createSimHost(), domains = new Map();
  let tick = 0;
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry, runtime } = lane.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_pallas_drift';
    const anchor = venueAnchorGlobal();
    const player = runtime.spawn({ type: 'ship', isPlayer: true, team: 0,
      pos: { x: anchor.x + 20, z: anchor.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100,
      collides: false, physicsBody: false, data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    const circuit = registry.get('counterweightCircuit');
    circuit.update(1 / 60);
    const send = async (payload) => {
      const ring = createSimCommandRing();
      if (payload) pushLaneCommand(ring, { kind: 'busEmit', emit: 'counterweightCircuit:action', payload });
      const reply = await lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
      for (const update of reply.domainUpdates) applyDomainPathUpdate(domains, structuredClone(update), new Set());
    };
    await send();
    for (const [action, eventId] of [['events'], ['preview', 'soft_berth'], ['attempt', 'soft_berth']]) {
      const offer = domains.get('counterweightCircuitOffer');
      await send({ action, eventId, offerId: offer.id, generation: offer.generation });
    }
    const view = domains.get('counterweightCircuitView');
    assert.equal(view.eventId, 'soft_berth');
    assert.ok(view.admission, 'real published view is awaiting preparation');
    const mission = { id: '47a', status: 'active', title: 'Recover 47-A', type: 'cargo_delivery' };
    const waypoint = { kind: 'mission', missionId: '47a', reason: 'Recover 47-A', sectorId: 'sector_helios' };
    const facade = { mode: 'flight', world: { currentSectorId: 'sector_pallas_drift' },
      ui: { trackedMissionId: mission.id }, missions: { active: [mission] }, nav: { waypoint },
      counterweightCircuitView: view };
    const before = structuredClone({ mission, waypoint, trackedMissionId: facade.ui.trackedMissionId });
    const read = () => flightDestinationSurface(facade, resolveFlightObjectiveCommand(facade));
    assert.match(read().line, /preparing course/i);
    assert.doesNotMatch(read().line, /Recover 47-A|Next jump/i);

    // The same production projection advances leg text as the attempt's public journal changes.
    const live = circuit._attempt();
    const advanced = structuredClone({ eventId: live.eventId, practice: live.practice, fsm: live.fsm });
    advanced.fsm.phase = 'running'; advanced.fsm.legIndex = 1;
    advanced.fsm.legStatus = ['done', 'active'];
    facade.counterweightCircuitView = { ...view, phase: 'running', admission: null,
      journal: projectCounterweightCircuitJournal(state, { attempt: advanced }) };
    assert.match(read().line, /Seat the load in the cradle/);
    assert.doesNotMatch(read().line, /Recover 47-A|Next jump/i);

    facade.nav.waypoint = { kind: 'claim_defense', reason: 'Defend the claim' };
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'navigation');
    facade.nav.waypoint = waypoint;
    facade.mode = 'station';
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'tracked-mission');
    facade.mode = 'flight'; facade.world.currentSectorId = 'sector_helios';
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'tracked-mission');
    facade.world.currentSectorId = 'sector_pallas_drift';
    const runningView = facade.counterweightCircuitView;
    facade.counterweightCircuitView = { ...runningView, phase: null,
      journal: { attempt: null, lastResult: { eventId: 'soft_berth', outcome: 'complete' } } };
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'tracked-mission', 'a result releases the objective');
    facade.counterweightCircuitView = { ...runningView, eventId: 'another_event' };
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'tracked-mission', 'mismatched public view is ignored');
    const offer = domains.get('counterweightCircuitOffer');
    await send({ action: 'cancel', offerId: offer.id, generation: offer.generation });
    facade.counterweightCircuitView = domains.get('counterweightCircuitView');
    assert.equal(facade.counterweightCircuitView.journal.lastResult.outcome, 'cancelled');
    assert.equal(resolveFlightObjectiveCommand(facade).owner, 'tracked-mission');
    assert.match(read().line, /Recover 47-A/);
    assert.deepEqual({ mission, waypoint, trackedMissionId: facade.ui.trackedMissionId }, before);
  } finally { lane.shutdown(); }
});
