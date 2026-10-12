import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { swarmCombatShieldRadius } from '../src/render/weapons/shieldBubblePresentation.js';
import {
  SelectionSigil,
  SIGIL_RADIUS_SCALE,
  SIGIL_TIGHT_GAIN,
  SIGIL_TIGHT_SCALE,
  sigilRadius,
} from '../src/render/selectionSigil.js';

test('a swarm shield shell stays a fraction of the threat box', () => {
  assert.equal(swarmCombatShieldRadius(12), 12 * 0.42);
  assert.equal(swarmCombatShieldRadius(2), 1.5);
  assert.ok((Math.PI * (12 * 0.42) ** 2) / (24 ** 2) < 0.5);
});

test('a tight sigil shrinks onto the hull and a normal sigil keeps its instrument', () => {
  const scene = new THREE.Scene();
  const sigil = new SelectionSigil(scene);
  const body = { id: 4, radius: 12, klass: 'hostile' };
  try {
    sigil.setSubject(body, 0, 0, 1 / 60, null);
    assert.equal(sigil.mesh.scale.x, sigilRadius(12));
    assert.equal(sigil.mesh.scale.x, 12 * SIGIL_RADIUS_SCALE);
    assert.equal(sigil.mesh.material.uniforms.uGain.value, 0.36);
    sigil.setSubject({ ...body, tight: true }, 0, 0, 1 / 60, null);
    assert.equal(sigil.mesh.scale.x, sigilRadius(12, SIGIL_TIGHT_SCALE));
    assert.equal(sigil.mesh.material.uniforms.uGain.value, SIGIL_TIGHT_GAIN);
    assert.ok(sigil.mesh.scale.x < 12 * SIGIL_RADIUS_SCALE);
  } finally {
    sigil.dispose();
  }
});
