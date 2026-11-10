// SFQ-I045 — a law citation names the reason and target of the incident it reports,
// and those words are the same ones the provenance ledger stored for that incident.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, provenanceLedger] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.meta.seed = SEED;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const voices = [];
  bus.on('law:voice', (payload) => voices.push(payload));
  return {
    sim,
    state,
    player,
    voices,
    law: sim.registry.get('lawSecurity'),
  };
}

function incidentNode(state, incidentId) {
  const chains = state.provenance && state.provenance.chains || [];
  for (const chain of chains) {
    const nodes = chain && chain.nodes || [];
    for (const node of nodes) {
      if (node && node.k === 'incident' && node.incidentId === incidentId) return node;
    }
  }
  return null;
}

function openIncident(h, stationId, targetId, reason, data) {
  return h.law._openIncident(
    h.player,
    { id: targetId, data: data || {} },
    { stationId, entityId: null, factionId: 'faction_scn', radius: 900 },
    reason,
  );
}

test('two incidents each cite their own reason and target, matching provenance', () => {
  const h = boot();
  const first = openIncident(h, 'station_helios', 'hauler-keel', 'player_assault', { callsign: 'KEEL RUN' });
  const second = openIncident(h, 'station_tethys', 'hauler-mio', 'npc_piracy');
  assert.equal(h.voices.length, 2);

  const cases = [
    { incident: first, reason: 'player_assault', phrase: /Assault against KEEL RUN\./, targetId: 'hauler-keel', voice: h.voices[0] },
    { incident: second, reason: 'npc_piracy', phrase: /Piracy reported\./, targetId: 'hauler-mio', voice: h.voices[1] },
  ];
  for (const row of cases) {
    const text = String(row.voice && row.voice.text || '');
    assert.match(text, row.phrase);
    assert.doesNotMatch(text, /_/, 'the voice line carries no raw identifier');
    assert.doesNotMatch(text, /hauler-/, 'the voice line carries no raw entity id');
    const node = incidentNode(h.state, row.incident.id);
    assert.ok(node, `provenance holds ${row.incident.id}`);
    assert.equal(node.reason, row.reason);
    assert.equal(node.cause, row.reason);
    assert.equal(node.targetId, row.targetId);
    assert.equal(node.text, text);
  }
  assert.notEqual(h.voices[0].text, h.voices[1].text);

  const before = h.voices.length;
  openIncident(h, 'station_helios', 'hauler-other', 'player_piracy');
  assert.equal(h.voices.length, before, 'reopening the same attacker does not mint a second citation');
  const kept = incidentNode(h.state, first.id);
  assert.equal(kept.reason, 'player_assault');
  assert.equal(kept.targetId, 'hauler-keel');
});
