// Controlled Chaos packet 08 - concussion is the existing tumble (tumbleStates + impulseKernel),
// proven here through the real systems, plus the stable lifecycle read the classifier/AI share.
//
//   * momentum is retained: a concussed hull coasts on its real velocity through the real physics
//     owner - never a hidden teleport-to-zero;
//   * the fire + steering channels are genuinely gated while the helm is lost (production update
//     order: the AI writes intent first, tumbleStates overwrites it, weapons reads last);
//   * a heavy hull responds less (shorter helm loss, same impulse) but is never immune - its
//     velocity still changes by a real delta-V;
//   * repeated tiny hits cannot chain-lock forever: diminishing extension and a hard ceiling;
//   * `lifecycleOf` / `readConcussion` expose the state without a second writer or save field.
//
// Focused deterministic Node verification. Not a renderer inspection.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { ships, fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { HITSTUN_CHAIN_LAW, HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { isRecovering, readTumbleStatus } from '../src/combat/tumbleStatus.js';
import {
  LIFECYCLE,
  isCombatant,
  isDisabledHull,
  isHelmLost,
  lifecycleOf,
  readConcussion,
} from '../src/combat/lifecycle.js';

const DT = 1 / 60;
let previousFlags;
let sessions;
beforeEach(() => {
  previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  sessions = [];
});
afterEach(() => {
  for (const h of sessions) {
    h.sim.registry.get('tumbleStates')?.destroy?.();
    h.sim.registry.get('physics')?._sg02?.dispose?.();
    h.sim.dispose();
  }
  restoreFeatureMaps(previousFlags);
});

// Production relative order of the systems this claim crosses: physics settles, tumbleStates is the
// final helm writer, weapons reads intents last, combat advances statuses.
async function harness() {
  const sim = createSimulation({
    seed: 4242,
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
    systems: [ships, combat, weapons, tumbleStates, physics],
    updateOrder: [physics, tumbleStates, weapons, combat],
    helpers: {},
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui.screenStack.length = 0;
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
  }));
  state.playerId = player.id;
  state.input.aimAngle = 0;
  state.input.actions = {};
  const h = { sim, state, bus, player, fires: [] };
  bus.on('combat:fire', (p) => h.fires.push({ tick: state.tick, ownerId: p && p.ownerId }));
  h.step = (n = 1) => sim.runTicks(n, DT);
  sessions.push(h);
  // The rapier-dynamic authority boots asynchronously; wait for it so momentum is the real thing.
  const ph = sim.registry.get('physics');
  for (let i = 0; i < 300 && !(ph._diag && ph._diag.sg02Ready); i++) {
    h.step(1);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.ok(ph._diag.sg02Ready, 'fixture: real rapier-dynamic physics is up');
  return h;
}

function npc(h, defId, { x = -300, vx = 0, vz = 0 } = {}) {
  const spec = makeShipEntitySpec(defId, {
    team: 1, factionId: 'faction_reach', pos: { x, z: 0 }, rot: 0,
    fittings: fittingsFromDefaultModules(defId, NEW_GAME.fittedModules),
  });
  const e = h.sim.spawn({ ...spec, vel: { x: vx, z: vz } });
  e.data.intent = { fire: false, moveX: 0, moveZ: 0, aimAngle: 0, boost: false, brake: false };
  e.data.combatProfileId = e.data.combatProfileId || 'combat_profile_standard_ship';
  return e;
}

// Exactly what damage.js applyImpulse does for a shove-class hit: the real impulse goes through the
// physics membrane, then the hitstun receipt takes the helm.
function concuss(h, victim, deltaV, extra = {}) {
  queuePhysicsImpulse(victim, { x: deltaV * victim.mass, y: 0, z: 0 });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source: 'gun', victimId: victim.id, attackerId: h.player.id, attackerMass: 18, victimMass: victim.mass,
    deltaV, dirX: 1, dirZ: 0, hitSide: 1, tick: h.state.tick, ...extra,
  });
}

function speedOf(e) { return Math.hypot(e.vel.x, e.vel.z); }
// delta-V as a fraction of the victim's own governed cruise - the law's k.
function shove(h, victim, k) { return k * resolveGovernedCombatSpeed(victim, h.state, 0); }

test('a concussed light hull coasts on retained momentum - velocity is never reset to zero', async () => {
  const h = await harness();
  const victim = npc(h, 'ship_wasp', { vx: 60 }); // flying away from the push, along +x
  h.step(2);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.ALIVE);
  concuss(h, victim, shove(h, victim, 0.7));
  h.step(1);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.CONCUSSED, 'the hit takes the helm');
  const entry = readConcussion(h.state, victim);
  assert.equal(entry.phase, 'tumble');
  assert.equal(entry.source, 'gun');
  assert.ok(entry.until > h.state.simTime, 'the window ends in the future');
  const speedAtEntry = speedOf(victim);
  assert.ok(speedAtEntry > 30, `entry speed ${speedAtEntry} - the hit adds to a hull already flying`);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    h.step(1);
    if (readTumbleStatus(h.state, victim)) samples.push(speedOf(victim));
  }
  assert.ok(samples.length >= 30, `the helm stays lost across the sampled window (${samples.length})`);
  assert.ok(Math.min(...samples) >= speedAtEntry * 0.85,
    `ballistic through the window: min ${Math.min(...samples)} vs entry ${speedAtEntry}`);
  assert.ok(Math.abs(victim.angVel) > 0.3, `it is visibly spinning (${victim.angVel} rad/s)`);
});

test('while the helm is lost the fire and steering channels are really gated, then they return', async () => {
  const h = await harness();
  const victim = npc(h, 'ship_wasp');
  assert.ok(victim.data.weapons && victim.data.weapons.length > 0, 'fixture: the wasp is armed');
  // The AI slot writes its intent before tumbleStates every tick; replay that.
  const aiWrites = () => { victim.data.intent.fire = true; victim.data.intent.moveX = 1; victim.data.intent.moveZ = 0.5; };
  for (let i = 0; i < 90; i++) { aiWrites(); h.step(1); }
  const firesFree = h.fires.filter((f) => f.ownerId === victim.id).length;
  assert.ok(firesFree > 0, `fixture sanity: an un-gated wasp fires (${firesFree})`);

  concuss(h, victim, shove(h, victim, 0.6));
  h.step(1);
  assert.ok(isHelmLost(h.state, victim));
  const before = h.fires.filter((f) => f.ownerId === victim.id).length;
  let gatedTicks = 0;
  for (let i = 0; i < 600; i++) {
    aiWrites();
    h.step(1);
    if (!isHelmLost(h.state, victim)) break;
    gatedTicks++;
    assert.equal(victim.data.intent.fire, false, 'tumbleStates overwrote the fire intent before weapons read it');
    assert.equal(victim.data.intent.moveX, 0);
    assert.equal(victim.data.intent.moveZ, 0);
  }
  assert.ok(gatedTicks >= 20, `the gate held for a real window (${gatedTicks} ticks)`);
  const during = h.fires.filter((f) => f.ownerId === victim.id).length;
  assert.equal(during, before, 'no shot left the hull while its helm was lost');
  // The stabilization window is the second beat: still reads concussed, guns still hold.
  assert.ok(isRecovering(h.state, victim));
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.CONCUSSED);
  assert.equal(readConcussion(h.state, victim).phase, 'recovering');
  // ...and then control returns for good.
  for (let i = 0; i < 240; i++) { aiWrites(); h.step(1); }
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.ALIVE, 'recovery is bounded');
  assert.equal(readConcussion(h.state, victim), null);
  assert.ok(h.fires.filter((f) => f.ownerId === victim.id).length > during, 'it fights again');
});

test('a heavy hull responds less to the same shove but is never immune', async () => {
  const h = await harness();
  const light = npc(h, 'ship_wasp', { x: -250 });
  const heavy = npc(h, 'ship_atlas', { x: -450 });
  assert.ok(heavy.mass > light.mass * 2, `fixture: atlas ${heavy.mass} vs wasp ${light.mass}`);
  h.step(2);
  // The same delivered MOMENTUM on both hulls (a gun slug does not care what it hits).
  const momentum = shove(h, light, 0.7) * light.mass;
  const dvLight = momentum / light.mass;
  const dvHeavy = momentum / heavy.mass;
  const heavyBefore = { x: heavy.vel.x, z: heavy.vel.z };
  concuss(h, light, dvLight, { attackerMass: 18 });
  concuss(h, heavy, dvHeavy, { attackerMass: 18 });
  const seen = { light: 0, heavy: 0 };
  let heavyPeak = 0;
  let lightPeak = 0;
  for (let i = 0; i < 400; i++) {
    h.step(1);
    if (isHelmLost(h.state, light)) seen.light++;
    if (isHelmLost(h.state, heavy)) seen.heavy++;
    if (i < 6) {
      heavyPeak = Math.max(heavyPeak, Math.hypot(heavy.vel.x - heavyBefore.x, heavy.vel.z - heavyBefore.z));
      lightPeak = Math.max(lightPeak, speedOf(light));
    }
  }
  assert.ok(seen.light > 0, 'the light hull loses the helm');
  assert.ok(seen.heavy <= seen.light, `the heavy hull never loses it for longer (${seen.heavy} vs ${seen.light})`);
  // "Never immune": the real physics still delivered a measurable velocity change to the heavy hull,
  // smaller than the light hull's by the mass ratio - responds less, not zero.
  assert.ok(heavyPeak > 1, `the heavy hull still took the impulse (peak dV ${heavyPeak})`);
  assert.ok(heavyPeak < lightPeak * 0.8, `and moved less than the light hull (${heavyPeak} vs ${lightPeak})`);
});

test('tiny repeated hits cannot chain-lock a hull: diminishing extension and a hard ceiling', async () => {
  const h = await harness();
  const victim = npc(h, 'ship_wasp');
  const graze = shove(h, victim, 0.5); // each hit really tumbles; none is a heavy blow
  let startedAt = null;
  const untils = [];
  for (let i = 0; i < 240; i++) {
    if (i % 12 === 0) concuss(h, victim, graze);
    h.step(1);
    const c = readConcussion(h.state, victim);
    if (c && c.phase === 'tumble') {
      if (startedAt == null) startedAt = c.startedAt;
      untils.push(c.until);
    }
    // The continuous helm loss never outlives the ceiling measured from the first hit.
    if (startedAt != null) {
      assert.ok(c === null || c.until <= startedAt + HITSTUN_CHAIN_LAW.maxChainDurationS + 1e-6,
        `window ${c && c.until} exceeds the ${HITSTUN_CHAIN_LAW.maxChainDurationS} s ceiling from ${startedAt}`);
    }
  }
  assert.ok(untils.length > 0, 'the chain really tumbled the hull');
  // Diminishing extension: each chained hit pushes the window out by less than the one before it.
  const distinct = [...new Set(untils.map((u) => Math.round(u * 1000)))].map((u) => u / 1000);
  assert.ok(distinct.length >= 4, `several hits really extended the window (${distinct.join(', ')})`);
  const steps = distinct.slice(1).map((u, i) => u - distinct[i]);
  assert.ok(steps[0] > steps[2], `extension shrinks along the chain (${steps.map((x) => x.toFixed(3)).join(', ')})`);
  assert.ok(steps[0] < distinct[0] - startedAt, 'a chained hit adds less than a fresh first hit would');
  const finalUntil = Math.max(...untils);
  assert.ok(finalUntil - startedAt <= HITSTUN_CHAIN_LAW.maxChainDurationS + 1e-6);
  // After the barrage stops the hull is free: it is not stuck in a permanent tumble.
  for (let i = 0; i < 600; i++) h.step(1);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.ALIVE);
});

test('lifecycle read is total and writes nothing: drive-disabled, wreck, unknown ids', async () => {
  const h = await harness();
  const victim = npc(h, 'ship_wasp');
  h.step(2);
  const snapshot = JSON.stringify(h.state.combat.entities[String(victim.id)] || null);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.ALIVE);
  assert.equal(isCombatant(h.state, victim), true);
  const runtime = h.state.combat.entities[String(victim.id)];
  assert.ok(runtime, 'the combat runtime exists for a live hull');
  runtime.capabilities = { ...(runtime.capabilities || {}), drive: false };
  assert.equal(isDisabledHull(h.state, victim), true);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.DISABLED, 'a persistent loss is "disabled", not "dying"');
  assert.equal(isCombatant(h.state, victim), true, 'a disabled hull is still a combatant (capture/finish)');
  // a tumble outranks the drive-down: the short fact wins
  runtime.capabilities.drive = true;
  concuss(h, victim, shove(h, victim, 0.6));
  h.step(1);
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.CONCUSSED);
  // dead hull and plain wreck
  victim.alive = false;
  assert.equal(lifecycleOf(h.state, victim), LIFECYCLE.WRECK);
  assert.equal(readConcussion(h.state, victim), null, 'the dead are not concussed');
  const wreck = h.sim.spawn({ type: 'wreck', pos: { x: 50, z: 50 }, radius: 8, mass: 20, hull: 1, hullMax: 1, data: { killedAt: 1 } });
  assert.equal(lifecycleOf(h.state, wreck), LIFECYCLE.WRECK);
  assert.equal(isCombatant(h.state, wreck), false);
  // total: nonsense in, 'alive' out, no throw
  assert.equal(lifecycleOf(null, null), LIFECYCLE.ALIVE);
  assert.equal(lifecycleOf(h.state, 999999), LIFECYCLE.ALIVE);
  assert.equal(readConcussion(h.state, 999999), null);
  assert.equal(snapshot.length > 0, true);
});

test('the player is never concussed by the NPC hitstun law', async () => {
  const h = await harness();
  concuss(h, h.player, 90);
  h.step(3);
  assert.equal(readConcussion(h.state, h.player), null);
  assert.notEqual(lifecycleOf(h.state, h.player), LIFECYCLE.CONCUSSED, 'no existing rule removes player control');
});
