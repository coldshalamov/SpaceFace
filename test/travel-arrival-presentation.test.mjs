// Arriving in a sector has a visible beat, owned by two existing pieces: the presentation orchestrator
// emits the arrival cues for the player's hull on sector entry, and the VFX owner draws a heading-aligned
// vector wake plus a flare for them. The 09-28 graphics assessment recorded "sector arrival: no effect,
// only a fade"; nothing pinned the opposite, so the claim could not be checked. This file pins it at the
// owners, headless: no GL, no audio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { vfx } from '../src/render/vfx.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { TRAVEL_PRESENTATION_CUE_IDS } from '../src/presentation/travelChoreography.js';

const HEADING = Math.PI / 2; // facing +z

function orchestratorHost() {
  const cues = [];
  const player = { id: 7, pos: { x: 120, y: 0, z: -40 }, rot: HEADING };
  const host = Object.create(presentationOrchestrator);
  host.state = { playerId: 7, entities: new Map([[7, player]]), tick: 12, simTime: 3 };
  host._emitCue = (id, payload, options) => { cues.push({ id, payload, options }); return true; };
  return { host, cues, player };
}

function vfxHost({ reduced = false } = {}) {
  const calls = { sprites: [], wakes: [] };
  const host = Object.create(vfx);
  host._scene = {};
  host.state = { playerId: 7, settings: { video: { motionReduce: reduced, flashReduce: false } }, entities: new Map() };
  host.helpers = { player: () => ({ id: 7, pos: { x: 120, z: -40 }, rot: HEADING }) };
  host._spawnSprite = (...args) => calls.sprites.push(args);
  host._spawnTravelVectorWake = (...args) => calls.wakes.push(args);
  return { host, calls };
}

const arrivalCue = (id, extra = {}) => ({
  id,
  position: { x: 120, y: 0, z: -40 },
  direction: { x: Math.cos(HEADING), z: Math.sin(HEADING) },
  tags: ['arrival', 'oriented'],
  payload: { heading: HEADING },
  ...extra,
});

test('both arrival cues are part of the shipped travel vocabulary', () => {
  assert.ok(TRAVEL_PRESENTATION_CUE_IDS.includes('travel.arrival.oriented'));
  assert.ok(TRAVEL_PRESENTATION_CUE_IDS.includes('travel.arrival.sector_identity'));
});

test('entering a sector emits the oriented landing and the identity beat for the player hull, on the arrival heading', () => {
  const { host, cues, player } = orchestratorHost();
  host._onTravelSectorEnter({ sectorId: 'sector_ceres_belt', continuous: true, entryPoint: { x: 0, z: 0, heading: 0 }, sector: { palette: { fill: 0xffb13d } }, firstVisit: true });
  const ids = cues.map((c) => c.id);
  assert.deepEqual(ids, ['travel.arrival.oriented', 'travel.arrival.sector_identity']);
  for (const cue of cues) {
    assert.equal(cue.options.sourceId, player.id, 'the cue is addressed to the player hull');
    assert.equal(cue.options.targetId, 'sector_ceres_belt');
    assert.deepEqual(cue.payload.position, { x: 120, y: 0, z: -40 }, 'it lands where the hull is, not at the sector origin');
    assert.ok(Math.abs(cue.payload.direction.x - Math.cos(HEADING)) < 1e-9 && Math.abs(cue.payload.direction.z - Math.sin(HEADING)) < 1e-9,
      'it points down the hull heading');
  }
  assert.ok(cues[1].options.tags.includes('first_visit') && cues[1].options.tags.includes('palette_belt'),
    'the identity beat carries the visit kind and the sector palette');
});

test('the VFX owner draws a heading-aligned wake and flare for the oriented landing, and a flare for the identity beat', () => {
  const full = vfxHost();
  full.host._onDirectTravelPresentationCue(arrivalCue('travel.arrival.oriented'));
  assert.equal(full.calls.wakes.length, 1, 'one vector wake');
  const [pos, dx, dz, segments] = full.calls.wakes[0];
  assert.deepEqual({ x: pos.x, z: pos.z }, { x: 120, z: -40 });
  assert.ok(Math.abs(dx - Math.cos(HEADING)) < 1e-9 && Math.abs(dz - Math.sin(HEADING)) < 1e-9, 'the wake runs along the heading');
  assert.equal(segments, 12, 'full motion draws the full wake');
  assert.equal(full.calls.sprites.length, 1, 'plus the leading flare');

  const identity = vfxHost();
  identity.host._onDirectTravelPresentationCue(arrivalCue('travel.arrival.sector_identity', { tags: ['arrival', 'sector_identity', 'palette_belt'] }));
  assert.equal(identity.calls.sprites.length, 1);
  assert.equal(identity.calls.sprites[0][9], '#ffb35c', 'the identity flare takes the sector palette (belt = amber)');
});

test('reduced motion damps the landing to a single dim flare and no wake', () => {
  const full = vfxHost();
  const reduced = vfxHost({ reduced: true });
  full.host._onDirectTravelPresentationCue(arrivalCue('travel.arrival.oriented'));
  reduced.host._onDirectTravelPresentationCue(arrivalCue('travel.arrival.oriented'));
  // Reduced mode takes the early-out path: one low-opacity flare and no multi-segment wake at all.
  assert.equal(reduced.calls.wakes.length, 0, 'no wake under reduced motion');
  assert.equal(reduced.calls.sprites.length, 1);
  const fullOpacity = full.calls.sprites[0][7];
  const reducedOpacity = reduced.calls.sprites[0][7];
  assert.ok(reducedOpacity < fullOpacity, `reduced flare (${reducedOpacity}) must be dimmer than full (${fullOpacity})`);
});
