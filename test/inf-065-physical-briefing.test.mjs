// INF-065 — one mission briefed as a physical situation. The escort dossier carries a small
// briefing diagram derived from the offer's actual target, route, and KNOWN hazards, paired
// with one concrete approach. The diagram must agree with the live situation (destination and
// danger echo route intel exactly), disclose nothing undiscovered, and recommend only verbs
// the player already has.
import test from 'node:test';
import assert from 'node:assert/strict';

import { missionBriefingDiagram, missionRouteIntel } from '../src/ui/missionPreflight.js';
import { briefingDiagramHtml } from '../src/ui/views/contractPresentation.js';
import { SECTORS, dangerIndex } from '../src/data/sectors.js';

const state = {};

function escortTo(sectorId, extra = {}) {
  return { type: 'escort', title: 'Convoy screen', destSectorId: sectorId, ...extra };
}

// Pick sectors from live tuning: one above the dossier's own hazard band, one below.
const hot = SECTORS.find((s) => dangerIndex(s) >= 0.72);
const calm = SECTORS.find((s) => dangerIndex(s) < 0.48);
assert.ok(hot, 'live data has a hazardous sector for the screen approach');
assert.ok(calm, 'live data has a calm sector for the sweep approach');

test('the diagram agrees with the spawned situation: target, span, and known danger', () => {
  const offer = escortTo(hot.id, { jumps: 2 });
  const intel = missionRouteIntel(offer, state);
  assert.ok(intel, 'route intel resolves for the offer destination');
  const diagram = missionBriefingDiagram(offer, state, 'Helios Yard');
  assert.equal(diagram.origin, 'Helios Yard', 'origin is the board station, not invented');
  assert.equal(diagram.destination, intel.targetName, 'destination echoes live route intel');
  assert.equal(diagram.danger, intel.danger, 'danger echoes live route intel exactly');
  assert.equal(diagram.dangerLabel, intel.label, 'danger band echoes live route intel exactly');
  assert.match(diagram.span, /2 jumps/, 'span echoes the offer route fields');
  assert.equal(diagram.convoyGate, true, 'the INF-064 convoy condition rides along');
});

test('a hazardous lane briefs screen; a calm lane briefs sweep; a critical clock briefs launch', () => {
  assert.equal(missionBriefingDiagram(escortTo(hot.id), state).approach.id, 'screen', 'hot lane: stay with the convoy');
  assert.equal(missionBriefingDiagram(escortTo(calm.id), state).approach.id, 'sweep', 'calm lane: run ahead and fall back');
  const critical = escortTo(calm.id, { deadline_s: 60, distance: 20000 });
  assert.equal(missionBriefingDiagram(critical, { simTime: 0 }).approach.id, 'launch', 'critical clock beats a calm lane');
});

test('the briefing discloses nothing undiscovered and acts with existing verbs', () => {
  const diagram = missionBriefingDiagram(escortTo(hot.id, { jumps: 1 }), state, 'Helios Yard');
  const keys = Object.keys(diagram).sort();
  assert.deepEqual(
    keys,
    ['approach', 'convoyGate', 'danger', 'dangerLabel', 'destination', 'origin', 'span'],
    'no spawn, target, or cargo detail leaks into the briefing',
  );
  assert.match(
    diagram.approach.line,
    /convoy|accept|launch|track|dock|lane|destination/i,
    'the approach names only verbs and markers the player already has',
  );
  const html = briefingDiagramHtml(diagram);
  assert.match(html, /Helios Yard/, 'strip names the origin');
  assert.match(html, new RegExp(diagram.destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'strip names the live destination');
  assert.match(html, /Approach:/, 'strip pairs the diagram with the concrete approach');
});

test('only the escort is briefed; other missions render no strip', () => {
  assert.equal(missionBriefingDiagram({ type: 'cargo_delivery', destSectorId: hot.id }, state), null, 'no diagram off-type');
  assert.equal(briefingDiagramHtml(null), '', 'no strip off-type');
});
