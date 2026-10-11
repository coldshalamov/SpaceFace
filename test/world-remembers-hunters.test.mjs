// THE WORLD REMEMBERS - U-A: WANTED hunters that learn you.
// Waves roll on WANTED arrivals (rhythm + cooldown), the pick is a pure hash of the seed, a
// disabled hunter is excluded while recovering and the next wave is bolder, a returning
// hunter's first hail names what you did, and the memory rides lawSecurity's lazy save slice.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  WARRANT_HUNTERS,
  WARRANT_RECOVER_BASE_S,
  WARRANT_WAVE_ARRIVAL_DELAY_S,
  WARRANT_WAVE_RHYTHM,
  pickWarrantHunter,
  warrantHunterById,
  warrantHunterLine,
} from '../src/data/warrantHunters.js';
import { heat, wantedTierFor, WANTED_TIER } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { normalizeMemory } from '../src/systems/warrantHunterWaves.js';

const SECTOR = 'sector_helios_prime';
const SEEDS = [4242, 8008];

function heatFor(tier) {
  const mid = { [WANTED_TIER.NETS]: 0.5, [WANTED_TIER.IMPOUND]: 0.9 }[tier];
  assert.equal(wantedTierFor(mid), tier, `heat ${mid} reads ${tier}`);
  return mid;
}

function boot(seed, { withHeat = true, level = WANTED_TIER.NETS } = {}) {
  const systems = withHeat ? [heat, lawSecurity, spawnBudget] : [lawSecurity, spawnBudget];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = level === WANTED_TIER.NONE ? 0 : heatFor(level);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const said = [];
  sim.helpers.voice = { say: (line) => { said.push(line); return true; } };
  const log = {};
  for (const name of [
    'warrant:waveSpawned', 'warrant:hunterDisabled', 'warrant:hunterEscaped', 'warrant:hunterPaid',
    'warrant:hail', 'law:reportIncidentReceipt', 'law:killedAdjudicated',
  ]) {
    log[name] = [];
    bus.on(name, (p) => log[name].push(p));
  }
  return { sim, state, bus, player, said, log, law: sim.registry.get('lawSecurity') };
}

/** Only one hunter is eligible: every other cast member is recovering for a long time. */
function onlyHunter(state, hunterId, extra = {}) {
  const hunters = {};
  for (const h of WARRANT_HUNTERS) if (h.id !== hunterId) hunters[h.id] = { recoverUntilT: 1e9 };
  hunters[hunterId] = { ...(extra.record || {}) };
  state.lawSecurity.warrantHunters = normalizeMemory({
    arrivalCount: 0, lastWaveArrival: 0, lastWaveT: null, bolder: extra.bolder || 0, hunters,
  });
}

/** Jump in until a wave is armed (rhythm allows at most three arrivals at NETS). */
function arriveUntilArmed(ctx, max = 4) {
  for (let i = 0; i < max; i++) {
    ctx.bus.emit('jump:arrive', {});
    if (ctx.law._warrantWaves._view().pending) return i + 1;
  }
  return 0;
}

function land(ctx) {
  ctx.state.simTime += WARRANT_WAVE_ARRIVAL_DELAY_S + 1;
  ctx.sim.step();
  ctx.sim.step();
}

function lawfulEye(ctx, fn) {
  const eye = ctx.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 30, z: 0 },
    hull: 80, hullMax: 80, radius: 8, data: { ai: { lawful: true }, witnessEye: true },
  });
  fn();
  eye.alive = false;
  eye.hull = 0;
}

function bossOf(ctx) {
  const live = ctx.law._warrantWaves._view().live;
  for (const [id, entry] of live) if (entry.role === 'boss') return ctx.state.entities.get(id);
  return null;
}

function killBoss(ctx, boss, { witnessed = true } = {}) {
  const payload = {
    id: boss.id,
    killerId: ctx.state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: boss.factionId,
    factionLawful: boss.data.ai.lawful === true,
    targetHostileToPlayer: true,
  };
  if (witnessed) lawfulEye(ctx, () => ctx.bus.emit('entity:killed', payload));
  else ctx.bus.emit('entity:killed', payload);
}

for (const seed of SEEDS) {
  test(`seed ${seed}: a WANTED arrival arms at most one wave per cooldown; none when clean`, () => {
    const clean = boot(seed, { level: WANTED_TIER.NONE });
    for (let i = 0; i < 6; i++) clean.bus.emit('jump:arrive', {});
    land(clean);
    assert.equal(clean.log['warrant:waveSpawned'].length, 0, 'not wanted: no wave');
    assert.equal(clean.state.lawSecurity.warrantHunters, undefined, 'nothing is remembered');

    const ctx = boot(seed);
    const armedAfter = arriveUntilArmed(ctx);
    assert.ok(armedAfter >= WARRANT_WAVE_RHYTHM.nets.minGap && armedAfter <= WARRANT_WAVE_RHYTHM.nets.guaranteeGap,
      `NETS arms on the ${WARRANT_WAVE_RHYTHM.nets.minGap}nd-${WARRANT_WAVE_RHYTHM.nets.guaranteeGap}rd arrival (got ${armedAfter})`);
    assert.equal(ctx.log['warrant:waveSpawned'].length, 0, 'no wave inside the first minute of the sector');
    land(ctx);
    assert.equal(ctx.log['warrant:waveSpawned'].length, 1, 'wave lands once the arrival delay passes');
    const receipt = ctx.log['warrant:waveSpawned'][0];
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.trigger, 'jump');
    assert.equal(receipt.tier, WANTED_TIER.NETS);
    assert.equal(receipt.sectorId, SECTOR);
    assert.equal(receipt.crewCount >= 0, true);
    assert.equal(Number.isInteger(receipt.tick), true);
    assert.equal(receipt.name, warrantHunterById(receipt.hunterId).name);

    // The cooldown: more WANTED arrivals right after never stack a second wave.
    for (let i = 0; i < 8; i++) ctx.bus.emit('jump:arrive', {});
    land(ctx);
    assert.equal(ctx.log['warrant:waveSpawned'].length, 1, 'cooldown holds a second wave back');
  });

  test(`seed ${seed}: the picked hunter is deterministic for the seed and carries identity`, () => {
    const a = boot(seed);
    const b = boot(seed);
    arriveUntilArmed(a);
    arriveUntilArmed(b);
    const pendingA = a.law._warrantWaves._view().pending;
    const pendingB = b.law._warrantWaves._view().pending;
    assert.equal(pendingA.hunterId, pendingB.hunterId);
    assert.equal(
      pendingA.hunterId,
      pickWarrantHunter({ seed, tier: WANTED_TIER.NETS, arrivalCount: pendingA.arrivalIdx, trigger: 'jump' }).id,
      'the pick is hash32(seed, tier, arrivalCount) over the cast',
    );
    land(a);
    const boss = bossOf(a);
    assert.ok(boss, 'the boss hull is live');
    const hunter = warrantHunterById(pendingA.hunterId);
    assert.equal(boss.data.warrantHunterId, hunter.id);
    assert.equal(boss.data.hostileContext, 'bounty_hunter');
    assert.equal(boss.data.name, hunter.name, 'target panel reads the hunter name');
    assert.equal(boss.data.ai.lawful, hunter.licensed === true);
    assert.deepEqual(boss.data.ai.hostileTeams, [0]);
  });

  test(`seed ${seed}: a disabled hunter recovers, is excluded, and the next wave is bolder`, () => {
    const ctx = boot(seed, { withHeat: false });
    const only = WARRANT_HUNTERS.find((h) => h.licensed && !h.quirk.triggers);
    onlyHunter(ctx.state, only.id);
    arriveUntilArmed(ctx);
    land(ctx);
    const first = ctx.log['warrant:waveSpawned'][0];
    assert.equal(first.hunterId, only.id);
    assert.equal(first.boldness, 1);
    const boss = bossOf(ctx);

    const heatBefore = ctx.state.player.heat;
    killBoss(ctx, boss);
    const disabled = ctx.log['warrant:hunterDisabled'][0];
    assert.ok(disabled, 'the kill is receipted');
    assert.equal(disabled.hunterId, only.id);
    assert.equal(disabled.byPlayer, true);
    assert.equal(disabled.heatIntent, 'law:reportIncidentReceipt');
    assert.equal(disabled.timesDisabled, 1);
    assert.equal(disabled.recoverUntilT - ctx.state.simTime, WARRANT_RECOVER_BASE_S);
    assert.equal(ctx.state.player.heat, heatBefore, 'the hunter path never writes heat');
    const priced = ctx.log['law:reportIncidentReceipt'].filter((r) => r.accepted === true && r.validatedCrime === true);
    assert.ok(priced.length >= 1, 'heat is reached through lawSecurity\'s signed receipt intent');
    assert.equal(priced[0].source, 'lawSecurity');

    const rec = ctx.state.lawSecurity.warrantHunters.hunters[only.id];
    assert.equal(rec.timesDisabled, 1);
    assert.equal(rec.grievance, 'disabled');
    assert.equal(rec.lastOutcome, 'disabled');

    // Recovering: the same hunter is not eligible, so the only-eligible pool is empty.
    ctx.state.simTime += WARRANT_WAVE_RHYTHM.nets.cooldownS + 1;
    for (let i = 0; i < 4; i++) ctx.bus.emit('jump:arrive', {});
    assert.equal(ctx.law._warrantWaves._view().pending, null, 'no eligible hunter while recovering');
    assert.equal(
      pickWarrantHunter({ seed, tier: 'nets', arrivalCount: 9, isRecovering: (id) => id !== 'wh_calder_ansah' }).id,
      'wh_calder_ansah',
      'the pure pick skips a recovering hunter',
    );

    // Recovered and returning: bolder than the first wave.
    ctx.state.simTime = rec.recoverUntilT + 1;
    ctx.state.lawSecurity.warrantHunters.lastWaveT = null;
    arriveUntilArmed(ctx, 8);
    land(ctx);
    const second = ctx.log['warrant:waveSpawned'][1];
    assert.ok(second, 'the hunter comes back');
    assert.equal(second.hunterId, only.id);
    assert.equal(second.returning, true);
    assert.ok(second.boldness > first.boldness, 'the next pick is one tier bolder');
  });

  test(`seed ${seed}: a returning hunter's first hail names what you did last time`, () => {
    const ctx = boot(seed, { withHeat: false });
    const only = WARRANT_HUNTERS.find((h) => !h.quirk.triggers && h.quirk.id !== 'hails_first');
    onlyHunter(ctx.state, only.id, { record: { encounters: 1, grievance: 'rammed', lastOutcome: 'rammed' } });
    arriveUntilArmed(ctx);
    land(ctx);
    const boss = bossOf(ctx);
    assert.ok(boss);
    // Put the hunter inside hail range and let upkeep run.
    boss.pos = { x: 400, z: 0 };
    ctx.sim.step();
    const hail = ctx.log['warrant:hail'][0];
    assert.ok(hail, 'the hunter hails');
    assert.equal(hail.kind, 'grievance');
    assert.equal(hail.grievance, 'rammed');
    assert.equal(hail.text, warrantHunterLine(only, 'grievance', { grievance: 'rammed' }));
    assert.ok(ctx.said.some((line) => line.channel === 'comms' && line.text === hail.text),
      'spoken on the hail channel through helpers.voice');
    ctx.sim.step();
    assert.equal(ctx.log['warrant:hail'].filter((h) => h.kind === 'grievance').length, 1, 'hails once');
  });

  test(`seed ${seed}: an unwitnessed licensed kill is signed by the contractor transponder; heat is untouched`, () => {
    const ctx = boot(seed, { withHeat: false });
    const only = WARRANT_HUNTERS.find((h) => h.licensed && !h.quirk.triggers);
    onlyHunter(ctx.state, only.id);
    arriveUntilArmed(ctx);
    land(ctx);
    const boss = bossOf(ctx);
    const heatBefore = ctx.state.player.heat;
    killBoss(ctx, boss, { witnessed: false });
    assert.equal(ctx.state.player.heat, heatBefore, 'no heat write from the hunter path');
    const receipts = ctx.log['law:reportIncidentReceipt'].filter((r) => r.accepted === true);
    assert.ok(ctx.log['law:killedAdjudicated'].some((p) => p.outcome === 'unwitnessed'), 'no eye saw it');
    const filed = receipts.find((r) => r.discoveryVia === 'contractor_transponder');
    assert.ok(filed, 'the transponder files what no eye saw');
    assert.equal(filed.validatedCrime, true);
    assert.equal(filed.kind, 'lawful_kill');
    assert.equal(filed.source, 'lawSecurity');
    assert.equal(Object.keys(ctx.state.lawSecurity.unreportedKills).length, 0, 'the pending case is closed');
    assert.equal(ctx.log['warrant:hunterDisabled'].length, 1);
  });

  test(`seed ${seed}: a hailing hunter offers the bounty and stands down when it is paid`, () => {
    const ctx = boot(seed, { withHeat: false });
    ctx.state.player.bounty = 500;
    onlyHunter(ctx.state, 'wh_ines_garrow');
    const offers = [];
    ctx.bus.on('warrant:hunterOffer', (p) => offers.push(p));
    arriveUntilArmed(ctx);
    land(ctx);
    const boss = bossOf(ctx);
    assert.equal(boss.data.ai.roe, 'hold_fire', 'hails first: no shots before the offer');
    boss.pos = { x: 400, z: 0 };
    ctx.sim.step();
    assert.equal(offers.length, 1);
    assert.equal(offers[0].amountCr, 500);
    ctx.bus.emit('bounty:cleared', { amount: 500, source: 'test' });
    const paid = ctx.log['warrant:hunterPaid'][0];
    assert.ok(paid);
    assert.equal(paid.hunterId, 'wh_ines_garrow');
    assert.equal(paid.amountCr, 500);
    assert.equal(boss.data.ai.forcePlayerTarget, false, 'the hunter stands down');
    assert.equal(ctx.state.lawSecurity.warrantHunters.hunters.wh_ines_garrow.grievance, 'paid');
  });

  test(`seed ${seed}: jumping out with a live hunter is remembered as outran`, () => {
    const ctx = boot(seed, { withHeat: false });
    const only = WARRANT_HUNTERS.find((h) => !h.quirk.triggers);
    onlyHunter(ctx.state, only.id);
    arriveUntilArmed(ctx);
    land(ctx);
    assert.ok(bossOf(ctx));
    ctx.bus.emit('sector:exit', { sectorId: SECTOR, continuous: false });
    const escaped = ctx.log['warrant:hunterEscaped'][0];
    assert.ok(escaped);
    assert.equal(escaped.hunterId, only.id);
    const rec = ctx.state.lawSecurity.warrantHunters.hunters[only.id];
    assert.equal(rec.timesYouEscaped, 1);
    assert.equal(rec.grievance, 'outran');
    assert.equal(rec.lastOutcome, 'outran');
  });

  test(`seed ${seed}: memory survives serialize/deserialize; a quiet run saves no warrantHunters key`, () => {
    const quiet = boot(seed, { level: WANTED_TIER.NONE });
    quiet.bus.emit('jump:arrive', {});
    assert.equal('warrantHunters' in quiet.law.serialize(), false, 'golden save shape is unchanged');

    const ctx = boot(seed, { withHeat: false });
    const only = WARRANT_HUNTERS.find((h) => h.licensed && !h.quirk.triggers);
    onlyHunter(ctx.state, only.id);
    arriveUntilArmed(ctx);
    land(ctx);
    killBoss(ctx, bossOf(ctx));
    const saved = ctx.law.serialize();
    assert.ok(saved.warrantHunters, 'memory is serialized after the first wave');
    const wire = JSON.parse(JSON.stringify(saved));

    const fresh = boot(seed, { withHeat: false });
    fresh.law.deserialize(wire);
    assert.deepEqual(fresh.law.serialize().warrantHunters, saved.warrantHunters);
    assert.equal(fresh.state.lawSecurity.warrantHunters.hunters[only.id].timesDisabled, 1);

    fresh.law.deserialize({});
    assert.equal('warrantHunters' in fresh.law.serialize(), false, 'a load without memory clears the slice');
  });
}

test('the cast is six authored hunters with a voice, a quirk, a portrait and a stable id', () => {
  assert.equal(WARRANT_HUNTERS.length, 6);
  assert.equal(new Set(WARRANT_HUNTERS.map((h) => h.id)).size, 6);
  assert.ok(WARRANT_HUNTERS.some((h) => h.licensed) && WARRANT_HUNTERS.some((h) => !h.licensed));
  for (const h of WARRANT_HUNTERS) {
    assert.ok(h.quirk && h.quirk.id, `${h.id} has a quirk`);
    assert.ok(h.portrait, `${h.id} has a portrait`);
    for (const kind of ['first', 'giveUp', 'tierUp']) {
      assert.ok(Array.isArray(h.voice[kind]) && h.voice[kind].length > 0, `${h.id} voices ${kind}`);
    }
    for (const g of ['disabled', 'rammed', 'netted', 'outran', 'paid']) {
      assert.equal(typeof h.voice.grievance[g], 'string', `${h.id} grievance ${g}`);
    }
  }
});
