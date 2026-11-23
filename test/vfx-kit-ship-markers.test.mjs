// Ship markers (owner ruling 2026-11-23: "the weird Sonic rings around everything look like shit").
// No ship wears a ring, arc or chevron, in any state. All that stays in the world is one soft dark
// contact shadow per ship, which darkens what is under the hull and adds no shape and no colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShipMarkers } from '../src/render/vfx/kit/shipMarkers.js';

const toLocal = (x, z, out) => { out.x = x; out.z = z; return out; };
const TYPE_POOL = 0;

// The game's teams: the player flies team 0, enemies team 1, civilian traffic team 2.
const cast = () => {
  const me = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 12, rot: 0, isPlayer: true };
  const foe = { id: 2, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 0 }, radius: 10, rot: 1, data: { enemyTypeId: 'wasp_swarmer' } };
  const boss = { id: 5, type: 'ship', team: 1, alive: true, pos: { x: 300, z: 0 }, radius: 40, data: { isBoss: true } };
  const trader = { id: 3, type: 'ship', team: 2, alive: true, pos: { x: -100, z: 0 }, radius: 10, rot: 0 };
  const rock = { id: 4, type: 'asteroid', alive: true, pos: { x: 0, z: 50 }, radius: 20 };
  return { playerId: 1, entities: new Map([[1, me]]), entityList: [me, foe, boss, trader, rock] };
};

test('every ship gets exactly one contact shadow and nothing else, in every HUD state', () => {
  for (const attention of ['fight', 'teach', 'calm']) {
    const m = new ShipMarkers(new THREE.Scene());
    const state = cast();
    for (let i = 0; i < 10; i++) m.update(state, toLocal, 0.05 * i, false, 0.3, attention);
    assert.equal(m.count, 4, `${attention}: four ships, one quad each; rocks get none`);
    for (let i = 0; i < m.count; i++) {
      assert.equal(m.b[i * 4 + 3], TYPE_POOL, `${attention}: quad ${i} is a contact shadow, never a ring or chevron`);
    }
    m.dispose();
  }
});

test('the shadow only darkens: the shader adds no colour and draws no ring band', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const frag = m.material.fragmentShader;
  assert.match(frag, /gl_FragColor=vec4\(0\.0,0\.0,0\.0,a\)/, 'premultiplied black: darkening only');
  assert.doesNotMatch(frag, /ring|chevron|atan/i, 'no ring, arc or chevron shape left in the shader');
  assert.equal(m.material.depthWrite, false);
  m.dispose();
});

test('dead and docked ships carry no shadow; an empty frame hides the draw', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const state = { playerId: 1, entities: new Map(), entityList: [
    { id: 2, type: 'ship', team: 2, alive: false, pos: { x: 0, z: 0 } },
    { id: 3, type: 'ship', team: 2, alive: true, flags: { docked: true }, pos: { x: 0, z: 0 } },
  ] };
  assert.equal(m.update(state, toLocal), 0);
  assert.equal(m.mesh.visible, false);
  m.dispose();
});
