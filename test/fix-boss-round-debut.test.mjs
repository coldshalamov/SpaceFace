// fix-boss-round-debut — a champion round that is also a debut round names the debut.
//
// S14 (483dff172351) moved the Swarm champions from 10, 20, 30... to 5, 15, 25... It did not
// move the debut clock. Wave 5 is now the Iron Maw AND the Detonator Dart's first body, and
// wave 15 is the Foreman AND the Patrol Lawman's. The Brood's undertow (55) and pox sac (75)
// debut under the Quiet Choir and the Tendril. Both readers let the boss win outright: the
// slam sub-line said "BOSS · <champion>" (the versus card and the boss bar already say it),
// and the wave-intro line returned before its "X is new." namecheck. So the hull that IS a
// bomb arrived unannounced on the first boss round. These pins drive the real planner, the
// real juice owner and the real HUD model on the ordinary run path.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET, isSwarmBossWave, swarmBossFor, swarmNewcomerFor } from '../src/data/swarmMode.js';
import { swarmBroodNewcomerFor } from '../src/data/swarmBrood.js';
import { swarmJuiceHud, swarmSlamSub } from '../src/ui/swarmJuiceHud.js';

const SEED = 4242;

function boot(wave) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', hull: 200, hullMax: 200 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;
  const ctx = { state, bus, helpers: {}, timeEffects: createTimeEffects(state) };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  swarmJuiceHud.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = 'helios_core';
  state.run.phase = 'wave_intro';
  state.run.wave = wave;
  return { state, bus, emitted };
}

function teardown() {
  swarmJuiceHud.destroy();
  swarmJuice.destroy();
}

/** Plan the wave for real, then announce it through the live juice owner and HUD model. */
function playIntro(wave) {
  const h = boot(wave);
  const plan = planWave({ seed: SEED, arenaId: 'helios_core', wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  h.bus.emit('run:wavePlanned', { wave, plan });
  const slam = h.emitted.filter((e) => e.event === 'swarm:roundSlam');
  const intro = h.emitted.filter((e) => e.event === 'swarm:bossIntro');
  const hudSlam = swarmJuiceHud._slam ? { ...swarmJuiceHud._slam } : null;
  const hudCard = swarmJuiceHud._card ? { ...swarmJuiceHud._card } : null;
  const hudBar = swarmJuiceHud._bossHp ? { ...swarmJuiceHud._bossHp } : null;
  teardown();
  return { plan, slam, intro, hudSlam, hudCard, hudBar, line: waveOpeningLine(wave, plan) };
}

test('the S14 collision is real: wave 5 and wave 15 are champion rounds AND ship debuts', () => {
  for (const [wave, bossId, debutId] of [[5, 'iron_maw', 'detonator_dart'], [15, 'mirrorjaw_foreman', 'patrol_lawman']]) {
    assert.ok(isSwarmBossWave(wave), `wave ${wave} is a champion round`);
    assert.equal(swarmBossFor(wave).id, bossId);
    assert.equal(swarmNewcomerFor(wave).enemyId, debutId, `wave ${wave} also debuts ${debutId}`);
  }
  assert.equal(swarmBroodNewcomerFor(55).id, 'undertow');
  assert.equal(swarmBossFor(55).id, 'quiet_choir');
  assert.equal(swarmBroodNewcomerFor(75).id, 'poxsac');
  assert.equal(swarmBossFor(75).id, 'brood_tendril');
});

test('wave 5: the versus card names the Iron Maw and the slam names the Detonator Dart', () => {
  const r = playIntro(5);
  // The planner still stages the debut's lone first body on a champion round.
  const debut = r.plan.packages.filter((p) => p.debut === true);
  assert.equal(debut.length, 1, 'one staged debut body');
  assert.equal(debut[0].enemyId, 'detonator_dart');
  assert.ok(r.plan.packages.some((p) => p.champion === true && p.enemyId === 'dreadnought_boss'));
  // The juice owner deals both cards on one slam.
  assert.equal(r.slam.length, 1);
  assert.equal(r.slam[0].payload.boss.name, "Dreadnought 'Iron Maw'");
  assert.equal(r.slam[0].payload.newcomer.enemyId, 'detonator_dart');
  assert.equal(r.slam[0].payload.newcomer.counter, 'It explodes. Throw it.');
  assert.equal(r.intro.length, 1, 'the versus card fires');
  // The HUD model: the champion holds the versus card and the bar; the slam names the debut.
  assert.equal(r.hudCard.title, "Dreadnought 'Iron Maw'");
  assert.equal(r.hudBar.name, "Dreadnought 'Iron Maw'");
  assert.equal(r.hudSlam.title, 'ROUND 05');
  assert.equal(r.hudSlam.sub, 'NEW THREAT · Detonator Dart', 'the debut is named on the round slam');
  // The intro readout and voice: the champion speaks first, then the namecheck.
  assert.match(r.line, /Dreadnought 'Iron Maw'\. Throw the pack into it\. Detonator Dart is new\./);
  assert.match(r.line, /Break the pack\.$/);
});

test('wave 15: the Foreman round still names the Patrol Lawman', () => {
  const r = playIntro(15);
  assert.equal(r.hudCard.title, 'Mirrorjaw Foreman');
  assert.equal(r.hudSlam.sub, 'NEW THREAT · Patrol Lawman');
  assert.match(r.line, /Mirrorjaw Foreman\..*Patrol Lawman is new\./);
});

test('the Brood debuts under a champion keep their card: undertow at 55, pox sac at 75', () => {
  for (const [wave, name, champion] of [[55, 'Undertow', 'The Quiet Choir'], [75, 'Pox Sac', 'The Tendril']]) {
    const r = playIntro(wave);
    assert.equal(r.slam[0].payload.newcomer.name, name);
    assert.equal(r.slam[0].payload.newcomer.brood, true);
    assert.equal(r.hudCard.title, champion, `wave ${wave} versus card`);
    assert.equal(r.hudSlam.sub, `NEW THREAT · ${name}`, `wave ${wave} slam names the brood debut`);
  }
});

test('boundaries: a champion round with no debut still says BOSS; a plain debut is unchanged', () => {
  // Wave 25 (the Regent) debuts nothing — the slam keeps the boss and the line adds no namecheck.
  assert.equal(swarmNewcomerFor(25), null);
  assert.equal(swarmBroodNewcomerFor(25), null);
  const regent = playIntro(25);
  assert.equal(regent.hudSlam.sub, 'BOSS · Forge Regent');
  assert.ok(!/ is new\./.test(regent.line), 'no debut, no namecheck');
  // Wave 6 debuts the jackal on an ordinary round.
  const jackal = playIntro(6);
  assert.equal(jackal.intro.length, 0, 'no versus card on an ordinary round');
  assert.equal(jackal.hudSlam.sub, 'NEW THREAT · Mine-Layer Jackal');
  assert.match(jackal.line, /Mine-Layer Jackal is new\./);
  // Pure reader edges: empty names never print, and nothing is invented.
  assert.equal(swarmSlamSub({ boss: { name: '' }, newcomer: { name: '' } }), '');
  assert.equal(swarmSlamSub({}), '');
  assert.equal(swarmSlamSub({ boss: { name: 'The Anvil' }, newcomer: null }), 'BOSS · The Anvil');
});
