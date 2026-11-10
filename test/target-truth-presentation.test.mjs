// Packet 02: every presenter of "what is targeted" reads the ONE projection. The world sigil
// (render/targetContour), the target panel's divergence row (ui/targetPanel) and the HUD's lead
// pip target (targetTruth.leadTargetId + tetherLeadSolution) must agree with it, including on the
// cases the weapons-written gunTargetId mirror could not express (recycled ids, unseen hulls).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import { projectTargetTruth, createTargetTruth, tetherLeadSolution } from '../src/combat/targetTruth.js';
import { resolveTargetContourEntity } from '../src/render/targetContour.js';
import { engagedContactReadout } from '../src/ui/targetPanel.js';
import { computeLeadPipOverlay, leadSolution } from '../src/ai/gunnery.js';
import { computeLockedLeadPoint } from '../src/combat/autoTargetMode.js';
import { bindSelection } from '../src/combat/targetIdentity.js';
import { engageEntityCloak } from '../src/systems/cloak.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

function stamp(entity, gen) {
  Object.defineProperty(entity, 'occupantGeneration', { value: gen, writable: true, configurable: true, enumerable: false });
  return entity;
}
function ship(id, team, x, z, vel = { x: 0, z: 0 }) {
  return stamp({
    id, type: 'ship', alive: true, flags: {}, team, radius: 10, pos: { x, z }, vel, rot: 0, mass: 100,
    data: team === 1 ? { combat: { targetId: 1 }, callsign: `HULL-${id}` } : { callsign: `HULL-${id}` },
  }, id * 10);
}
function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 50;
  state.entities.clear();
  state.entityList.length = 0;
  const player = stamp({
    id: 1, type: 'ship', alive: true, flags: {}, team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 },
    rot: 0, mass: 100, data: { weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }] },
  }, 10);
  state.playerId = 1;
  const add = (...es) => { for (const e of es) { state.entities.set(e.id, e); state.entityList.push(e); } };
  add(player);
  return { state, add };
}

test('selected A, hostile B on the line: contour keeps A, the panel row names B, the pip rides B', () => {
  const { state, add } = boot();
  add(ship(2, 1, 400, 0), ship(5, 1, 0, 140, { x: 90, z: 0 }));
  state.player.targetId = 2; bindSelection(state);
  state.player.tether = { active: true, targetId: 5, phase: 'slack', restLength: 0, strain: 0, attachmentId: null };
  const truth = projectTargetTruth(state, createTargetTruth());
  assert.equal(resolveTargetContourEntity(state).id, 2, 'the world mark stays on what the player picked');
  const read = engagedContactReadout(state);
  assert.equal(read.subjectId, 2);
  assert.equal(read.engaged.id, 5);
  assert.match(read.text, /LINE TARGET/);
  assert.equal(truth.leadTargetId, 5);
  // the pip must be the SAME constrained solve the fire path and the assist use
  const player = state.entities.get(1);
  const hull5 = state.entities.get(5);
  const solved = tetherLeadSolution(player, hull5, 320);
  const aimPoint = computeLockedLeadPoint(state);
  const angleFromPip = Math.atan2(solved.z - player.pos.z, solved.x - player.pos.x);
  const angleFromAssist = Math.atan2(aimPoint.z - player.pos.z, aimPoint.x - player.pos.x);
  assert.ok(Math.abs(angleFromPip - angleFromAssist) < 1e-6, 'pip and assist describe one solution');
  const overlay = computeLeadPipOverlay(player, hull5, state, {
    worldToScreen: (w) => ({ x: 960 + w.x, y: 600 + w.z, onScreen: true }),
    isHostileToPlayer,
    leadSolution: (s, t, sp) => (t.id === truth.tetherTargetId ? tetherLeadSolution(s, t, sp) : leadSolution(s, t, sp)),
  });
  assert.equal(overlay.visible, true, 'the moving line target has a visible lead offset');
});

test('no selection and a hostile on the line: the contour and panel subject the engaged hull', () => {
  const { state, add } = boot();
  add(ship(5, 1, 0, 140));
  state.player.targetId = null;
  state.player.tether = { active: true, targetId: 5, phase: 'slack', restLength: 0, strain: 0, attachmentId: null };
  assert.equal(resolveTargetContourEntity(state).id, 5);
  const read = engagedContactReadout(state);
  assert.equal(read.subjectIsEngaged, true);
  assert.equal(read.subjectId, 5);
  assert.match(read.text, /NO SELECTION/);
});

test('no divergence prints nothing: the guns agree with the selection', () => {
  const { state, add } = boot();
  add(ship(2, 1, 400, 0));
  state.player.targetId = 2; bindSelection(state);
  assert.equal(engagedContactReadout(state).text, '');
  assert.equal(resolveTargetContourEntity(state).id, 2);
});

test('an unseen or recycled selection gets no world mark and no panel subject', () => {
  const { state, add } = boot();
  const foe = ship(2, 1, 600, 0);
  add(foe);
  state.player.targetId = 2; bindSelection(state);
  assert.equal(resolveTargetContourEntity(state).id, 2);
  engageEntityCloak(foe, 150, state.simTime);
  assert.equal(resolveTargetContourEntity(state), null, 'no sigil on a cloak-hidden hull');
  assert.equal(engagedContactReadout(state).subject, null, 'and no panel readout of its health');
  // recycled number
  const { state: s2, add: add2 } = boot();
  add2(ship(2, 1, 100, 0));
  s2.player.targetId = 2; bindSelection(s2);
  assert.equal(resolveTargetContourEntity(s2).id, 2);
  s2.entities.delete(2);
  s2.entityList.splice(s2.entityList.findIndex((e) => e.id === 2), 1);
  add2(stamp(ship(2, 1, 50, 10), 9999));
  assert.equal(resolveTargetContourEntity(s2), null, 'the heir does not inherit the mark');
  assert.equal(engagedContactReadout(s2).subject, null);
});

test('a neutral selected is still an information subject for the mark and the panel', () => {
  const { state, add } = boot();
  add(ship(3, 2, 150, 0));
  state.player.targetId = 3; bindSelection(state);
  assert.equal(resolveTargetContourEntity(state).id, 3);
  assert.equal(engagedContactReadout(state).subjectId, 3);
});

test('mixed battery: the line\'s pip uses the speed the fire path solves with, not the pip\'s gun-only speed', async () => {
  const { lineLeadSolution } = await import('../src/combat/targetTruth.js');
  const { primaryProjSpeed } = await import('../src/ai/gunnery.js');
  const { tickAutoTarget, createAutoTargetRuntime, playerLeadSpeed } = await import('../src/combat/autoTargetMode.js');
  const { state, add } = boot();
  const player = state.entities.get(1);
  // slot order: a homing launcher first, then the guns (pulse 320, railgun 700)
  player.data.weapons = [
    { defId: 'wpn_swarm_missile_s', id: 'wpn_swarm_missile_s', projSpeed: 200, tracking: 'homing' },
    { defId: 'wpn_pulse_laser_s', projSpeed: 320 },
    { defId: 'wpn_railgun_m', projSpeed: 700 },
  ];
  add(ship(5, 1, 0, 160, { x: 90, z: 0 }));
  state.player.targetId = 5; bindSelection(state);
  state.player.tether = { active: true, targetId: 5, phase: 'slack', restLength: 0, strain: 0, attachmentId: null };
  assert.equal(playerLeadSpeed(state), 200, 'the assist and the fire path lead at the first mount that carries a speed');
  assert.notEqual(primaryProjSpeed(player), playerLeadSpeed(state), 'the pip\'s gun-only speed differs in this battery');
  const hull = state.entities.get(5);
  const viaPip = lineLeadSolution(state, player, hull);
  const aim = computeLockedLeadPoint(state);
  const a1 = Math.atan2(viaPip.z - player.pos.z, viaPip.x - player.pos.x);
  const a2 = Math.atan2(aim.z - player.pos.z, aim.x - player.pos.x);
  assert.ok(Math.abs(a1 - a2) < 1e-9, 'one solution for the pip, the assist and the fire path');
  const wrong = tetherLeadSolution(player, hull, primaryProjSpeed(player));
  assert.ok(Math.abs(Math.atan2(wrong.z - player.pos.z, wrong.x - player.pos.x) - a2) > 1e-4, 'the gun-only speed would lie');
  tickAutoTarget(state, 1 / 60, null, createAutoTargetRuntime());
  assert.equal(state.input.autoAim.leadSpeed, 200, 'the published provenance names the same speed');
});
