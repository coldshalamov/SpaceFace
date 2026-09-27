// The world-space selection mark.
//
// INF-045 gave the locked target a disciplined flat ring. Its SUBJECT RULE is the part that had to
// survive the art change and it is pinned here unchanged: the live selection wins, the engaged gun
// target only subjects when there is no selection, and dead bodies never subject. The art is now
// the ORRERY selection sigil (`src/render/selectionSigil.js`) — an astrolabe deck of light under the
// target. These tests pin what the art must never lose: the rule, the depth layering that lets it
// read through a Well, a class legible without colour, a structural (never opacity) arrival, and a
// reduced-motion path that keeps every figure.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  SELECTION_SIGIL_LIFT,
  SELECTION_SIGIL_RENDER_ORDER,
  SIGIL_CLASS,
  SIGIL_RADIUS_MAX,
  SIGIL_RADIUS_MIN,
  SIGIL_RETRACT_SECONDS,
  SelectionSigil,
  classifySelectionSubject,
  resolveSelectionSigil,
  sigilRadius,
} from '../src/render/selectionSigil.js';
import { resolveTargetContour, resolveTargetContourEntity } from '../src/render/targetContour.js';
import { targetBracketShape } from '../src/ui/targetBracket.js';

function ship(id, team, x = 100, z = -40, radius = 12, hostile = false) {
  return {
    id, type: 'ship', alive: true, team,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius, mass: 60,
    hull: 100, hullMax: 100, shield: 0, shieldMax: 0, flags: {},
    data: hostile ? { ai: { huntPlayer: true } } : {},
  };
}

function stateFor(playerTeam, target, gunTarget = null) {
  const entities = new Map([[1, ship(1, playerTeam, 0, 0)]]);
  entities.get(1).player = true;
  if (target) entities.set(target.id, target);
  if (gunTarget) entities.set(gunTarget.id, gunTarget);
  return {
    mode: 'flight',
    playerId: 1,
    player: { targetId: target ? target.id : null, gunTargetId: gunTarget ? gunTarget.id : null, team: playerTeam },
    entities,
    entityList: [...entities.values()],
  };
}

const FULL_SETTINGS = { video: {}, accessibility: {} };
const REDUCED_MOTION = { video: { motionReduce: true }, accessibility: {} };
const REDUCED_FLASH = { video: { flashReduce: true }, accessibility: {} };

// -----------------------------------------------------------------------------------------------
// INF-045, carried forward unchanged: the subject rule.

test('the live selection subjects the mark with its hull read', () => {
  const target = ship(7, 1, 100, -40, 12, true);
  const state = stateFor(0, target);
  assert.deepEqual(resolveTargetContour(state), { id: 7, x: 100, z: -40, radius: 12, hostile: true });
  assert.deepEqual(resolveSelectionSigil(state), {
    id: 7, x: 100, z: -40, radius: 12, klass: SIGIL_CLASS.HOSTILE,
  });
  assert.equal(resolveTargetContourEntity(state), target, 'the entity resolver hands the same body back');
});

test('the engaged contact subjects only with no live selection', () => {
  const dead = ship(7, 1);
  dead.alive = false;
  const guns = ship(9, 1, -30, 55, 8, true);
  const state = stateFor(0, dead, guns);
  assert.deepEqual(resolveTargetContour(state), { id: 9, x: -30, z: 55, radius: 8, hostile: true });
  assert.equal(resolveSelectionSigil(stateFor(0, null, null)), null, 'no subject, no mark');
  assert.equal(resolveSelectionSigil({}), null, 'an empty state never throws');
});

test('a live selection beats an engaged contact', () => {
  const picked = ship(4, 0, 10, 10, 9);
  const firing = ship(9, 1, -30, 55, 8, true);
  const state = stateFor(0, picked, firing);
  assert.equal(resolveSelectionSigil(state).id, 4, 'what the player chose is what gets marked');
});

// -----------------------------------------------------------------------------------------------
// Class is shape, not tint.

// -----------------------------------------------------------------------------------------------
// Depth layering, inherited from INF-045.

test('the sigil draws after field surfaces yet loses to real occluders', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const m = sigil.mesh.material;
    assert.equal(sigil.mesh.renderOrder, SELECTION_SIGIL_RENDER_ORDER);
    assert.ok(SELECTION_SIGIL_RENDER_ORDER > 16, 'after the field force surfaces (16)');
    assert.equal(m.depthTest, true, 'hulls and rock still occlude');
    assert.equal(m.depthWrite, false, 'the mark itself hides nothing');
    assert.equal(m.transparent, true);
    assert.equal(m.side, THREE.DoubleSide, 'it lies in the flight plane and is read from above');
    assert.equal(m.blending, THREE.AdditiveBlending, 'lines of light, never a card that dims the hull');
    assert.equal(m.forceSinglePass, true, 'a planar additive surface gets one submission');
    assert.equal(sigil.mesh.visible, false, 'nothing is marked at boot');
  } finally { sigil.dispose(); }
});

test('the mark is one world-space quad, never a point-sprite or camera-facing card', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    assert.equal(sigil.mesh.geometry.attributes.position.count, 4, 'a single quad, one draw call');
    const source = `${sigil.mesh.material.vertexShader}\n${sigil.mesh.material.fragmentShader}`;
    for (const banned of ['gl_PointSize', 'Points', 'SpriteMaterial', 'billboard']) {
      assert.ok(!source.includes(banned), `${banned} is not a technique here`);
    }
    // "Fine edges use screen derivatives" (VFX standard) — the reason this is a fragment program
    // and not a tessellated ring: the hairline scale keeps its weight at every zoom.
    assert.match(sigil.mesh.material.fragmentShader, /dFdx/);
  } finally { sigil.dispose(); }
});

// -----------------------------------------------------------------------------------------------
// Tracking.

test('the sigil follows, sizes, hides, and survives a rebase', () => {
  const scene = new THREE.Scene();
  const sigil = new SelectionSigil(scene);
  const hostile = { id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE };
  try {
    assert.equal(scene.children.length, 1);
    assert.equal(sigil.setSubject(hostile, 30, -25, 1 / 60, FULL_SETTINGS), true);
    assert.equal(sigil.mesh.visible, true);
    assert.equal(sigil.mesh.position.x, 30);
    assert.equal(sigil.mesh.position.z, -25);
    assert.equal(sigil.mesh.position.y, SELECTION_SIGIL_LIFT, 'lifted to the force-surface plane');
    assert.ok(sigil.mesh.scale.x > 12, 'the instrument clears the hull it marks');
    assert.equal(sigil.mesh.scale.x, sigil.mesh.scale.z, 'uniform: a circle in the plane is a circle');
    sigil.reproject(100, -50);
    assert.equal(sigil.mesh.position.x, 130);
    assert.equal(sigil.mesh.position.z, -75);
    assert.equal(sigil.setSubject(hostile, NaN, 0, 1 / 60, FULL_SETTINGS), false, 'a bad fix refuses instead of teleporting');
    const inspection = sigil.inspect();
    assert.equal(inspection.schema, 'spaceface.selection-sigil.v1');
    assert.equal(inspection.visible, true);
    assert.equal(inspection.klass, SIGIL_CLASS.HOSTILE);
  } finally {
    sigil.dispose();
    sigil.dispose();
    assert.equal(scene.children.length, 0, 'teardown leaves the scene clean');
  }
});

test('the radius fit keeps a speck legible and a capital bounded', () => {
  assert.equal(sigilRadius(NaN), sigilRadius(6), 'a junk radius falls back to the default');
  assert.ok(sigilRadius(0.5) >= SIGIL_RADIUS_MIN, 'even a tiny body gets a readable instrument');
  assert.ok(sigilRadius(400) <= SIGIL_RADIUS_MAX, 'a capital hull does not swallow the screen');
  assert.ok(sigilRadius(12) > 12, 'always larger than the body it marks');
});


test('the three-way class is the HUD bracket class, by construction', () => {
  const hostile = ship(7, 1, 0, 0, 10, true);
  const friendly = ship(8, 0, 0, 0, 10);
  const pod = { type: 'pickup', alive: true, pos: { x: 0, z: 0 }, radius: 3, data: { kind: 'cargo' } };
  assert.equal(classifySelectionSubject(hostile, true), SIGIL_CLASS.HOSTILE);
  assert.equal(classifySelectionSubject(friendly, false), SIGIL_CLASS.FRIENDLY);
  assert.equal(classifySelectionSubject(pod, false), SIGIL_CLASS.CARGO);
  // The world marker cannot drift from the DOM lock bracket: it calls the same policy.
  assert.equal(targetBracketShape(hostile, true), 'bracket-hostile');
  assert.equal(targetBracketShape(pod, false), 'bracket-cargo');
  assert.equal(targetBracketShape(friendly, false), 'bracket-friendly');

// -----------------------------------------------------------------------------------------------
// Arrival and departure are structural, never an opacity channel (VFX standard B17).

test('the assembly re-arms on retarget and holds otherwise', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const a = { id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE };
    const b = { id: 9, radius: 12, klass: SIGIL_CLASS.HOSTILE };
    sigil.setSubject(a, 0, 0, 1 / 60, FULL_SETTINGS);
    const u = sigil.mesh.material.uniforms;
    for (let i = 0; i < 240; i++) sigil.setSubject(a, 0, 0, 1 / 60, FULL_SETTINGS);
    assert.ok(u.uAge.value > 3, 'a held subject keeps ageing; the instrument never re-builds');
    assert.equal(u.uRetract.value, 1, 'held open, with no dissolve channel to abuse');
    sigil.setSubject(b, 0, 0, 1 / 60, FULL_SETTINGS);
    assert.ok(u.uAge.value < 0.05, 'a new subject re-runs the whole arrival, born on the new body');
  } finally { sigil.dispose(); }
});

test('release folds the instrument inward, then hides it', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const u = sigil.mesh.material.uniforms;
    sigil.setSubject({ id: 7, radius: 12, klass: SIGIL_CLASS.FRIENDLY }, 0, 0, 1 / 60, FULL_SETTINGS);
    sigil.clear(1 / 60, FULL_SETTINGS);
    assert.equal(sigil.mesh.visible, true, 'the fold is visible, not an instant vanish');
    assert.ok(u.uRetract.value < 1 && u.uRetract.value > 0);
    let frames = 0;
    while (sigil.mesh.visible && frames < 600) { sigil.clear(1 / 60, FULL_SETTINGS); frames++; }
    assert.equal(sigil.mesh.visible, false);
    assert.ok(frames / 60 >= SIGIL_RETRACT_SECONDS - 0.02, 'the fold takes real time, not one frame');
    // Re-acquiring after a release rebuilds rather than inheriting a folded instrument.
    sigil.setSubject({ id: 8, radius: 12, klass: SIGIL_CLASS.CARGO }, 5, 5, 1 / 60, FULL_SETTINGS);
    assert.equal(sigil.mesh.visible, true);
    assert.equal(u.uRetract.value, 1);
  } finally { sigil.dispose(); }
});

test('the class re-tints the palette without touching the instrument size', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const u = sigil.mesh.material.uniforms;
    const body = { id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE };
    sigil.setSubject(body, 0, 0, 1, FULL_SETTINGS);
    const hostile = u.uPrimary.value.getHex();
    const size = sigil.mesh.scale.x;
    sigil.setSubject({ ...body, klass: SIGIL_CLASS.CARGO }, 0, 0, 1 / 60, FULL_SETTINGS);
    assert.notEqual(u.uPrimary.value.getHex(), hostile, 'class rides the palette');
    assert.equal(sigil.mesh.scale.x, size, 'and never the outer scale: size means range, not faction');
  } finally { sigil.dispose(); }
});

test('a mark stays legible with the palette removed entirely', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    // The emblems are three different figures, so greyscale still separates them. That is a
    // property of the shader's construction, so the contract is asserted on the source.
    const frag = sigil.mesh.material.fragmentShader;
    assert.match(frag, /uKlass < 0\.5[\s\S]*?polyEdge\(p, a, 0\.415, 3\.0, 0\.0\)/, 'hostile hexagram');
    assert.match(frag, /uKlass < 1\.5[\s\S]*?polyEdge\(p, a, 0\.420, 6\.0, aEmblem\)/, 'friendly rosette');
    assert.match(frag, /polyEdge\(p, a, 0\.420, 4\.0, aEmblem\)/, 'cargo eight-point star');
  } finally { sigil.dispose(); }
});


// -----------------------------------------------------------------------------------------------
// Accessibility.

test('reduced motion keeps every figure and only removes movement', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const u = sigil.mesh.material.uniforms;
    const body = { id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE };
    sigil.setSubject(body, 0, 0, 1 / 60, REDUCED_MOTION);
    assert.equal(u.uInstant.value, 1, 'the shader completes its own arrival on frame one');
    const steppedAt = u.uStepped.value;
    for (let i = 0; i < 600; i++) sigil.setSubject(body, 0, 0, 1 / 60, REDUCED_MOTION);
    assert.equal(u.uStepped.value, steppedAt, 'the vernier pointer rests instead of ticking');
    assert.equal(u.uKlass.value, 0, 'the emblem is still the hostile one');
    assert.equal(u.uRetract.value, 1, 'the mark is held open, with no arrival or departure pending');
    // Reduced motion reaches every state instantly — including release.
    sigil.clear(1 / 60, REDUCED_MOTION);
    assert.equal(sigil.mesh.visible, false, 'a fold nothing can see is just a late disappearance');
  } finally { sigil.dispose(); }
});

test('reduced flash drops radiance and never removes a figure', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    const u = sigil.mesh.material.uniforms;
    const body = { id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE };
    sigil.setSubject(body, 0, 0, 1 / 60, FULL_SETTINGS);
    assert.equal(u.uFlash.value, 1);
    sigil.setSubject(body, 0, 0, 1 / 60, REDUCED_FLASH);
    assert.ok(u.uFlash.value < 1, 'hot cores and the acquire ring come down');
    assert.equal(u.uInstant.value, 0, 'reduced flash still moves');
    assert.equal(u.uKlass.value, 0, 'identity untouched');
    assert.equal(sigil.mesh.visible, true);
  } finally { sigil.dispose(); }
});

test('the per-frame hot path rebuilds nothing and churns no uniforms', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  try {
    sigil.setSubject({ id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE }, 0, 0, 1 / 60, FULL_SETTINGS);
    const mesh = sigil.mesh;
    const geometry = mesh.geometry;
    const material = mesh.material;
    const keys = Object.keys(material.uniforms);
    for (let i = 0; i < 3000; i++) {
      sigil.setSubject({ id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE }, i * 0.01, 0, 1 / 60, FULL_SETTINGS);
    }
    assert.equal(sigil.mesh, mesh, 'the mesh is never swapped');
    assert.equal(sigil.mesh.geometry, geometry, 'the quad is never rebuilt');
    assert.equal(sigil.mesh.material, material, 'the program is never rebuilt (a recompile is a hitch)');
    assert.deepEqual(Object.keys(sigil.mesh.material.uniforms), keys, 'no uniform churn per frame');
  } finally { sigil.dispose(); }
});

test('a disposed sigil refuses work instead of throwing', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  sigil.dispose();
  assert.equal(sigil.setSubject({ id: 7, radius: 12, klass: SIGIL_CLASS.HOSTILE }, 0, 0, 1 / 60, FULL_SETTINGS), false);
  sigil.clear(1 / 60, FULL_SETTINGS);
  sigil.reproject(1, 1);
  assert.equal(sigil.inspect().visible, false);
  assert.equal(sigil.inspect().renderOrder, null);
});

});
