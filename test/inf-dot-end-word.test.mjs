// inf-dot-end-word — a burn-down hull reads as the attrition end it is.
//
// The Burning/Goo DoTs route their periodic ticks with the applier as attackerId (credit was
// already honest), but the END stamped 'generic', so the kill popup said the gun word
// (SHREDDED/PUNCHED) while the hull visibly burned down. combat.killEndLabelFor now labels a
// status-origin end 'wasted' on the payload (beside the massline_whip precedent), and the
// room-grammar owner speaks it per arena — while styleCauseFromKill keeps the label out of
// the style families, so attrition pays gun rate and can never reach the force-table ratio.
//
// The burn chain is real: statuses → periodic routeDamage → the kill handler production
// combat.kill installs, with the exact lethal it will see.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { killEndLabelFor, buildKillPresentationReceipt } from '../src/systems/combat.js';
import { styleCauseFromKill, physicsPlayScoreMult } from '../src/systems/survivalStyle.js';
import { swarmKillCauseWord, SWARM_ARENA_KILL_WORDS, SWARM_KILL_WORDS } from '../src/data/swarmJuice.js';

test('a status end labels wasted; weapon, collision and room ends do not', () => {
  assert.equal(killEndLabelFor({ origin: { kind: 'status', id: 'status_burning' } }), 'wasted');
  assert.equal(killEndLabelFor({ origin: { kind: 'weapon', weaponId: 'wpn_autocannon_s' } }), null);
  assert.equal(killEndLabelFor({ origin: { kind: 'collision' } }), null);
  assert.equal(killEndLabelFor({ origin: { kind: 'mine' } }), null);
  assert.equal(killEndLabelFor(null), null);
});

test('the room speaks the wasted end in its own language, friendly fire outranks it', () => {
  assert.equal(SWARM_KILL_WORDS.wasted, 'WASTED');
  for (const [arenaId, words] of Object.entries(SWARM_ARENA_KILL_WORDS)) {
    assert.equal(swarmKillCauseWord({ cause: 'direct', killLabel: 'wasted', arenaId }), words.wasted);
  }
  // Without the label the same read stays the gun word (no vocabulary drift).
  assert.equal(swarmKillCauseWord({ cause: 'direct', arenaId: 'cinder_sluice' }), 'SCORED');
  // Friendly fire outranks the label, in every room.
  assert.equal(swarmKillCauseWord({ cause: 'direct', killLabel: 'wasted', friendlyFire: true }), 'FRIENDLY FIRE');
  // The label speaks the WORD only: the style family stays on the canonical cause.
  const payload = { cause: 'wasted', presentation: { cause: 'generic' } };
  assert.equal(styleCauseFromKill(payload), 'direct');
  assert.equal(physicsPlayScoreMult(styleCauseFromKill(payload), null, true), 1,
    'an attrition end is not a physics play and must not reach the force-table ratio');
  assert.equal(buildKillPresentationReceipt(
    { playerId: 7, entities: { get: () => null } },
    { id: 11, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} },
    7,
    { origin: { kind: 'status', id: 'status_burning' }, packet: { source: { kind: 'status' } } },
  ).cause, 'generic');
});

test('a real burn ticked through the combat kernel ends as a wasted, player-credited kill', t => {
  const sim = createSimulation({ seed: 1, systems: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  state.playerId = player.id;
  const victim = sim.spawn({ type: 'ship', team: 1, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
    hull: 6, hullMax: 6, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    radius: 10, mass: 20, collides: true, data: {} });

  const kernel = getCombatKernel({ state, bus, helpers: {} });
  let seenLethal = null;
  let killedPayload = null;
  kernel.setKillHandler((target, killerId, lethal) => {
    seenLethal = lethal;
    killedPayload = { targetId: target.id, killerId };
    target.alive = false;
  });
  kernel.prePhysics(SIM_DT);
  const runtime = state.combat.entities[String(victim.id)];
  assert.ok(runtime, 'the kernel materialized the victim combat runtime');
  kernel.statuses.schedule(victim, runtime, { id: 'status_burning', stacks: 3, durationTicks: 240 },
    { attackerId: player.id });

  for (let i = 0; i < 40 && !seenLethal; i++) {
    state.tick += 1;
    state.simTime += SIM_DT;
    kernel.prePhysics(SIM_DT);
  }

  assert.ok(seenLethal, 'three stacks of the burn ticked the hull down inside 40 ticks');
  assert.equal(seenLethal.origin && seenLethal.origin.kind, 'status',
    'the kill handler production combat.kill installs sees a status origin');
  assert.equal(killEndLabelFor(seenLethal), 'wasted');
  assert.equal(killedPayload.killerId, player.id,
    'the DoT end credits the applier — the field killed it, the game credits somebody');
});

test('the label outranks nothing on the payload side the chronicler reads', () => {
  // killCauseFromPayload gates on the canonical set, so a 'wasted' payload label can never
  // flow into a canonical kill cause or a campaign consequence receipt.
  const payload = { cause: 'wasted', presentation: { cause: 'generic' } };
  assert.equal(styleCauseFromKill(payload), 'direct');
  assert.equal(swarmKillCauseWord({ cause: styleCauseFromKill(payload), killLabel: payload.cause, arenaId: 'the_hive' }), 'SCALDED');
});
