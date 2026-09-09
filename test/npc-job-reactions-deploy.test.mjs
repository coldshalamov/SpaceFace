// Reactions and deploy/stow — the two cheapest multipliers in the whole variety programme.
//
// Reactions: "objects and NPCs should respond to the player". A working hull that does not notice
// you is scenery no matter how well it is lit. Each trade reacts in its OWN currency, taken from its
// dossier, so six trades give six responses rather than one shared alarm state.
//
// Deploy/stow: working gear swings out to work and folds back to fly. It is one scalar, it is read
// entirely from SILHOUETTE — the channel that survives distance — and it is derived from phase
// rather than stored, so a hull can never be caught flying with its jaws still open.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deployFraction,
  resolveNpcJobReaction,
  NPC_JOB_REACTION,
  NPC_JOB_REACTION_RANGE,
} from '../src/render/npcJobSignatureVfx.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

// ─── deploy / stow ────────────────────────────────────────────────────────────────────────────────

test('gear ramps OUT over time in a work phase and IN after leaving one', () => {
  assert.equal(deployFraction('work', 0, false), 0, 'gear starts stowed on entering work');
  assert.ok(deployFraction('work', 1.3, false) > 0.3, 'and is visibly moving partway through');
  assert.equal(deployFraction('work', 10, false), 1, 'and ends fully out');

  assert.equal(deployFraction('transit', 0, false), 1, 'gear is still out the instant work ends');
  assert.ok(deployFraction('transit', 1.3, false) < 0.7, 'and folds back');
  assert.equal(deployFraction('transit', 10, false), 0, 'a cruising hull is clean');
});

test('every cargo-handling phase counts as gear out', () => {
  for (const phase of ['work', 'load', 'unload']) {
    assert.equal(deployFraction(phase, 10, false), 1, `${phase} deploys the gear`);
  }
  for (const phase of ['commission', 'depart', 'transit', 'approach', 'hold', 'return']) {
    assert.equal(deployFraction(phase, 10, false), 0, `${phase} stows it`);
  }
});

test('the fraction is always a clean 0..1 even on junk input', () => {
  for (const t of [NaN, -5, Infinity, undefined, null, 'x']) {
    for (const phase of ['work', 'transit', 'not-a-phase']) {
      const v = deployFraction(phase, t, false);
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${phase}/${t} gave ${v}`);
    }
  }
});

test('reduced motion completes the swing faster rather than removing it', () => {
  // Removing the motion would delete a silhouette channel from players who need reduced motion.
  // Shortening it keeps the information and drops the duration of the movement.
  assert.ok(deployFraction('work', 1.0, true) > deployFraction('work', 1.0, false));
  assert.equal(deployFraction('work', 10, true), 1);
});

// ─── reactions ────────────────────────────────────────────────────────────────────────────────────

test('every trade has its own response — six trades, not one shared alarm', () => {
  const seen = new Map();
  for (const kind of Object.values(NPC_JOB_KIND)) {
    const r = resolveNpcJobReaction(kind, 10, 'work');
    assert.notEqual(r.id, NPC_JOB_REACTION.NONE, `${kind} must respond to a stranger closing`);
    seen.set(kind, r.id);
  }
  // Some overlap is honest — a patrol and a survey rig both paint you, and the fiction says so —
  // but the fleet must not collapse to a single gesture.
  assert.ok(new Set(seen.values()).size >= 4,
    `expected at least four distinct responses, got ${JSON.stringify([...seen])}`);
});

test('intensity slides in with distance instead of snapping on', () => {
  // A hull that snaps to full alarm at an invisible radius reads as scripted.
  const far = resolveNpcJobReaction('miner', NPC_JOB_REACTION_RANGE - 1, 'work');
  const mid = resolveNpcJobReaction('miner', NPC_JOB_REACTION_RANGE * 0.5, 'work');
  const near = resolveNpcJobReaction('miner', 5, 'work');
  assert.ok(far.intensity < mid.intensity && mid.intensity < near.intensity,
    `expected a ramp, got ${far.intensity} / ${mid.intensity} / ${near.intensity}`);
  assert.ok(near.intensity <= 1 && far.intensity >= 0);
});

test('nothing reacts from beyond the reaction range', () => {
  for (const kind of Object.values(NPC_JOB_KIND)) {
    const r = resolveNpcJobReaction(kind, NPC_JOB_REACTION_RANGE + 1, 'work');
    assert.equal(r.id, NPC_JOB_REACTION.NONE, `${kind} must not react from out of range`);
    assert.equal(r.intensity, 0);
  }
  assert.equal(resolveNpcJobReaction('miner', Infinity, 'work').id, NPC_JOB_REACTION.NONE);
  assert.equal(resolveNpcJobReaction('miner', NaN, 'work').id, NPC_JOB_REACTION.NONE);
});

test('a hull already fleeing, or finished, is past reacting', () => {
  for (const phase of ['flee', 'complete']) {
    for (const kind of Object.values(NPC_JOB_KIND)) {
      assert.equal(resolveNpcJobReaction(kind, 5, phase).id, NPC_JOB_REACTION.NONE,
        `${kind} in ${phase} must not also run a reaction overlay`);
    }
  }
});

test('the trade-specific responses match their dossiers', () => {
  // These are not arbitrary: each is the fiction's own line about that trade.
  assert.equal(resolveNpcJobReaction('miner', 5, 'work').id, NPC_JOB_REACTION.GO_DARK,
    'bright work attracts interdiction, so a barge douses');
  assert.equal(resolveNpcJobReaction('salvor', 5, 'work').id, NPC_JOB_REACTION.WATCH,
    'dousing the umbrellas would read as a kill in progress, so a salvor tilts and keeps cutting');
  assert.equal(resolveNpcJobReaction('tender', 5, 'work').id, NPC_JOB_REACTION.FLINCH,
    'a repair rig stops because its people are outside on the plate');
  assert.equal(resolveNpcJobReaction('hauler', 5, 'transit').id, NPC_JOB_REACTION.BRIGHTEN,
    'an insured hull defends itself by being boringly legitimate');
});

test('an unknown kind degrades to no reaction rather than throwing', () => {
  const r = resolveNpcJobReaction('bagpiper', 5, 'work');
  assert.equal(r.id, NPC_JOB_REACTION.NONE);
  assert.equal(r.intensity, 0);
  assert.doesNotThrow(() => resolveNpcJobReaction(null, 5, null));
});
