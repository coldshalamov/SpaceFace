// check-combat-ceiling.mjs — BP-02 combat ceiling acceptance (Wave 2).
// Exercises the shipped pure helpers and flag defaults; static-audits HUD hooks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { solveLeadAngle } from '../src/systems/weapons.js';
import { leadSolution, hasBallisticWeapon } from '../src/ai/gunnery.js';
import { weakPointForEntity, isHitInWeakArc, WEAK_POINTS_BY_CLASS } from '../src/data/weakPoints.js';
import { COMBAT_FLAGS, combatFlag } from '../src/data/featureFlags.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function run(name, fn) {
  fn();
  console.log(`ok   ${name}`);
}

// ── Flag defaults (golden safety): OFF under node ───────────────────────────
run('combat flags default OFF in node (missileV2, weakPoints)', () => {
  assert.equal(typeof window, 'undefined', 'check must run headless');
  assert.equal(COMBAT_FLAGS.missileV2, false);
  assert.equal(COMBAT_FLAGS.weakPoints, false);
  assert.equal(COMBAT_FLAGS.momentumInherit, false);
  assert.equal(combatFlag('missileV2'), false);
  assert.equal(combatFlag('weakPoints'), false);
});

// ── Lead solver: deterministic + shared model ─────────────────────────────
run('solveLeadAngle is deterministic and responds to target motion', () => {
  const shooter = { pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0 };
  const still = { pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 } };
  const moving = { pos: { x: 800, z: 0 }, vel: { x: -120, z: 40 } };
  const a = solveLeadAngle(shooter, still, 360);
  const b = solveLeadAngle(shooter, still, 360);
  const c = solveLeadAngle(shooter, moving, 360);
  assert.equal(a, b, 'same inputs must produce identical angle');
  assert.notEqual(a, c, 'lead angle must change when target velocity changes');
  assert.ok(Number.isFinite(a));
});

run('gunnery.leadSolution uses the same solver (valid pip)', () => {
  const shooter = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 360 }] } };
  const target = { pos: { x: 500, z: 0 }, vel: { x: 60, z: 0 } };
  const sol = leadSolution(shooter, target, 360);
  assert.equal(sol.valid, true);
  assert.ok(Math.hypot(sol.x - shooter.pos.x, sol.z - shooter.pos.z) > 400);
});

// ── Weak-point geometry ─────────────────────────────────────────────────────
run('weakPointForEntity returns data for gunship class', () => {
  const e = { type: 'ship', role: 'gunship', pos: { x: 0, z: 0 }, rot: 0 };
  const wp = weakPointForEntity(e);
  assert.ok(wp);
  assert.equal(wp.label, WEAK_POINTS_BY_CLASS.gunship.label);
});

run('isHitInWeakArc detects rear-arc hits', () => {
  const target = { pos: { x: 0, z: 0 }, rot: 0 };
  const wp = WEAK_POINTS_BY_CLASS.gunship;
  assert.equal(isHitInWeakArc(target, { x: -100, z: 0 }, wp), true);
  assert.equal(isHitInWeakArc(target, { x: 100, z: 0 }, wp), false);
});

// ── Static HUD hooks present ────────────────────────────────────────────────
const hudSrc = readFileSync(join(ROOT, 'src/ui/hud.js'), 'utf8');
const panelSrc = readFileSync(join(ROOT, 'src/ui/targetPanel.js'), 'utf8');
const uiRootSrc = readFileSync(join(ROOT, 'src/ui/uiRoot.js'), 'utf8');

run('HUD lead pip wired', () => {
  assert.match(hudSrc, /sf-leadpip/);
  assert.match(hudSrc, /leadSolution/);
  assert.match(uiRootSrc, /\.sf-leadpip/);
});

run('target panel damage triangle wired', () => {
  assert.match(panelSrc, /sf-target__triangle/);
  assert.match(panelSrc, /familyEffectiveness/);
  assert.match(uiRootSrc, /\.sf-tri/);
});

run('weak-point reveal path wired', () => {
  const floatSrc = readFileSync(join(ROOT, 'src/ui/floatingText.js'), 'utf8');
  assert.match(hudSrc, /scan:weakPoint/);
  assert.match(panelSrc, /sf-target__weak/);
  assert.match(floatSrc, /combat:weakPointHit/);
});

run('hostile gunship + ballistic weapon produces valid lead solution', () => {
  const player = {
    id: 1, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 360 }] },
  };
  const hostile = {
    id: 2, type: 'ship', team: 1, role: 'gunship', pos: { x: 600, z: 100 }, vel: { x: -70, z: 30 }, rot: 0,
    data: { shipClass: 'gunship', encounter: true, ai: { hostileTeams: [0] } },
  };
  const state = { playerId: 1, entities: new Map([[1, player], [2, hostile]]) };
  assert.equal(isHostileToPlayer(hostile, player.team, state), true);
  assert.equal(hasBallisticWeapon(player), true);
  const sol = leadSolution(player, hostile, 360);
  assert.equal(sol.valid, true);
  const wp = weakPointForEntity(hostile);
  assert.ok(wp && wp.label === 'AMMO MAGAZINE');
});

console.log('\nBP-02 combat ceiling: all checks passed.');