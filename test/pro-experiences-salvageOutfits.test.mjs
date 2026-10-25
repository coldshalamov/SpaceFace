// Focused explicit-system evidence, not a claim that the shared production registry is wired.
// Uses the real simulation, spawn budget, NPC work, combat attachment, native Rapier, mining,
// and economy owners. The candidate deliberately leaves shared registry/save imports to integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as moduleApi from 'node:module';
import { readFileSync } from 'node:fs';

// This scoped candidate cannot edit the shared generated index. Add only its authored module
// to that index in memory, exactly as the documented index rebuild would. The entire actual
// director, runtime dispatch, source, economy and native physics implementations stay real.
const catalogUrl = new URL('../src/data/encounters/index.generated.js', import.meta.url).href;
let catalogHook = null;
if (!readFileSync(new URL(catalogUrl), 'utf8').includes("from './8204-pro-salvage-outfits.js'")) {
  assert.equal(typeof moduleApi.registerHooks, 'function',
    'Pre-integration catalog evidence requires Node 24/registerHooks; an already rebuilt catalog needs no hook');
  catalogHook = moduleApi.registerHooks({
    load(url, context, next) {
      const result = next(url, context);
      if (url !== catalogUrl) return result;
      const source = String(result.source);
      if (source.includes("from './8204-pro-salvage-outfits.js'")) return result;
      const marker = 'export const ENCOUNTER_MODULES = Object.freeze([';
      assert.ok(source.includes(marker), 'the documented encounter catalog integration seam must exist');
      return { ...result, source: "import * as salvageOutfitsCandidate from './8204-pro-salvage-outfits.js';\n"
        + source.replace(marker, marker + '\n  salvageOutfitsCandidate,') };
    },
  });
}
const { createSimulation, SIM_DT } = await import('../src/core/sim.js');
const { createBus } = await import('../src/core/eventBus.js');
const { physics } = await import('../src/core/physics.js');
const { queuePhysicsImpulse } = await import('../src/core/physicsAuthority.js');
const { combat } = await import('../src/systems/combat.js');
const { scalarHitToDamagePacket } = await import('../src/combat/damage.js');
const { flightV3 } = await import('../src/systems/flightV3.js');
const { aiPorts } = await import('../src/systems/aiPorts.js');
const { economy } = await import('../src/systems/economy.js');
const { mining } = await import('../src/systems/mining.js');
const { spawnBudget } = await import('../src/systems/spawnBudget.js');
const { ships, makeShipEntitySpec } = await import('../src/systems/ships.js');
const { default: npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
const { save } = await import('../src/save/saveSystem.js');
const { fnv1a } = await import('../src/save/checksum.js');
const { encounterDirector, planEncountersDay } = await import('../src/systems/encounterDirector.js');
const { ENCOUNTERS } = await import('../src/data/encounters.js');
const { zonesForSector } = await import('../src/data/sectorZones.js');
const { sectorGlobalOrigin } = await import('../src/data/sectorCoordinates.js');
const encounter = await import('../src/data/encounters/8204-pro-salvage-outfits.js');
const { routeDigit } = await import('../src/ui/promptDeck.js');
const { createSalvageOutfitsPhysical } = await import('../src/features/salvageOutfits/physical.js');
const { createSalvageOutfitsPresentation } = await import('../src/features/salvageOutfits/presentation.js');
const { getSalvageOutfitsReadModel, salvageOutfitEntity } = await import('../src/features/salvageOutfits/readModel.js');
const { freshSalvageOutfits, makeSalvageMeeting, normalizeSalvageOutfits,
  captureSalvageOutfits, restoreSalvageOutfits } = await import('../src/features/salvageOutfits/persistence.js');
const { salvageOutfitsDiscoveryId } = await import('../src/features/salvageOutfits/discovery.js');
catalogHook?.deregister();

const SECTOR = 'sector_ceres_belt';
const ANCHOR = sectorGlobalOrigin(SECTOR);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const total = pool => Object.values(pool || {}).reduce((n, q) => n + q, 0);
const clone = value => JSON.parse(JSON.stringify(value));

async function boot({ variant = 'split_drift', seed = 4242, start = true, native = true, playerPos = null } = {}) {
  const { salvageOutfits } = await import('../src/features/salvageOutfits/index.js');
  const sim = createSimulation({ seed,
    systems: [spawnBudget, ships, physics, combat, economy, mining, aiPorts, flightV3, npcJobsRuntime, encounterDirector, salvageOutfits, save],
    updateOrder: [flightV3, salvageOutfits, npcJobsRuntime, aiPorts, combat, physics],
  });
  const { state, bus } = sim;
  state.mode = 'flight'; state.timeScale = 1;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = { id: SECTOR, pois: [], stations: [
    { id: 'station_ceres', name: 'Ceres Refinery', pos: { x: ANCHOR.x + 450, z: ANCHOR.z } },
  ] };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, pos: playerPos || { x: ANCHOR.x, z: ANCHOR.z + 180 },
  }));
  state.playerId = player.id;
  const owner = sim.registry.get('salvageOutfits');
  const events = [];
  for (const name of ['salvageOutfits:offer', 'salvageOutfits:radio', 'salvageOutfits:offerClosed',
    'salvage:claimJumped', 'economy:creditsChanged', 'economy:salvageIntakeApplied']) {
    bus.on(name, payload => events.push({ name, payload: clone(payload || {}) }));
  }
  const nativeOwner = sim.registry.get('physics');
  if (native) assert.equal(await nativeOwner.prepareBackend(state), true, 'native body owner must prepare');
  let meeting;
  if (start) {
    const result = owner.start({ encounterId: 'test:outfits:one', sectorId: SECTOR, anchor: ANCHOR, variant });
    assert.equal(result.ok, true, JSON.stringify(result));
    meeting = state.salvageOutfits.meetings[result.meetingId];
    sim.runTicks(3);
  }
  return { sim, state, bus, owner, player, meeting, events, nativeOwner,
    adapter: createSalvageOutfitsPhysical(sim.registry.ctx),
    close() {
      owner.destroy();
      for (const name of ['npcJobsRuntime', 'combat', 'spawnBudget', 'ships', 'mining', 'economy', 'encounterDirector', 'save']) {
        sim.registry.get(name)?.destroy?.();
      }
      nativeOwner._disableSg02DynamicAuthority();
      sim.dispose();
    },
  };
}

function entity(h, record) { return h.state.entities.get(record.entityId); }
function advanceUntil(h, predicate, seconds = 180, eachTick = null) {
  for (let i = 0; i < Math.ceil(seconds / SIM_DT); i++) {
    if (predicate()) return true;
    if (eachTick) eachTick(i);
    h.sim.step(SIM_DT);
  }
  return !!predicate();
}
function choose(h, choiceId) {
  const offer = h.meeting.offer;
  assert.ok(offer?.id, `a current offer must explain ${choiceId}`);
  return h.owner.choose({ meetingId: h.meeting.id, offerId: offer.id, choiceId });
}

// A deterministic test pilot applies bounded impulses through the native command membrane.
// This tests original-body recovery/settlement, not keyboard handling or player-flight feel.
function driveToward(h, destination, load = null) {
  const actor = h.player;
  const dx = destination.x - actor.pos.x, dz = destination.z - actor.pos.z;
  const gap = Math.hypot(dx, dz), travel = Math.min(26, Math.sqrt(16 * Math.max(0, gap - 3)));
  const targetX = dx / Math.max(1, gap) * travel, targetZ = dz / Math.max(1, gap) * travel;
  const errorX = targetX - actor.vel.x, errorZ = targetZ - actor.vel.z;
  const error = Math.hypot(errorX, errorZ), maxDv = 60 * SIM_DT;
  const scale = Math.min(1, maxDv / Math.max(0.001, error));
  queuePhysicsImpulse(actor, { x: errorX * scale * actor.mass, y: 0, z: errorZ * scale * actor.mass },
    { provenance: 'salvage-outfits-fixture-pilot', tick: h.state.tick });
  if (load) {
    const line = h.owner.physical.playerLine(load);
    const minimum = Math.max(30, actor.radius + load.radius + 8);
    if (line?.restLength > minimum) h.sim.registry.get('combat').kernel.attachments.reel(line.id,
      -Math.min(line.restLength - minimum, 0.5), minimum);
  }
}

function playerRecovery(h, id, seconds = 120) {
  const body = h.meeting.bodies[id];
  const load = entity(h, body);
  assert.ok(load?.alive);
  let attachment = null;
  const recovered = advanceUntil(h, () => body.status === 'delivered', seconds, () => {
    if (!load.alive) return;
    const active = h.owner.physical.playerLine(load);
    if (!active) {
      const dx = h.meeting.receiver.x - load.pos.x, dz = h.meeting.receiver.z - load.pos.z;
      const length = Math.max(1, Math.hypot(dx, dz));
      const separation = h.player.radius + load.radius + 25;
      driveToward(h, { x: load.pos.x + dx / length * separation, z: load.pos.z + dz / length * separation });
      if (dist(h.player.pos, load.pos) < separation + 20
        && Math.hypot(h.player.vel.x - load.vel.x, h.player.vel.z - load.vel.z) < 12) {
        const made = h.sim.registry.get('combat').kernel.attachments.create({
          defId: 'tether_standard', ownerId: h.player.id, targetId: load.id,
          sourceWorld: h.player.pos, targetWorld: load.pos,
        });
        if (made.ok) attachment = made.attachment;
      }
    } else {
      driveToward(h, { x: h.meeting.receiver.x + 12, z: h.meeting.receiver.z }, load);
    }
  });
  assert.ok(attachment, 'the test pilot must attach the real native body before delivery');
  assert.ok(recovered, `${id} failed physical recovery: status=${body.status}, player=${JSON.stringify(h.player.pos)}, load=${JSON.stringify(load.pos)}`);
  assert.equal(body.deliveredBy, 'player');
  return load;
}

test('the encounter is planned by the ordinary Adventure planner, with no acceptance gate', () => {
  const catalog = { ...ENCOUNTERS, [encounter.trigger.id]: encounter.default };
  const zones = zonesForSector(SECTOR);
  let item;
  for (let day = 0; day < 80 && !item; day++) {
    item = planEncountersDay(4242, SECTOR, day, zones, null, catalog)
      .find(row => row.shapeId === encounter.trigger.id);
  }
  assert.ok(item, 'the normal seeded sector-day planner must schedule the candidate');
  assert.ok(encounter.trigger.zoneTypes.includes(item.zoneType));
  assert.equal(encounter.trigger.proximity, true);
  assert.equal(encounter.default.choices.length, 0, 'work starts independently of a mission acceptance');
});

test('prompt-deck adapter routes refuse/cancel and rejects stale callbacks without sim writes', () => {
  const bus = createBus(), state = { mode: 'flight', simTime: 0 }, offered = [], resolved = [], intents = [];
  const deck = { offerDecision(spec) { offered.push(spec); return true; }, resolveDecision(id) { resolved.push(id); } };
  const view = createSalvageOutfitsPresentation({ state, bus, deck });
  bus.on('salvageOutfits:choose', p => intents.push(p));
  const payload = { meetingId: 'meeting', offerId: 'terms:1', title: 'Split the pieces',
    detail: 'Keel takes the core. You keep the frame and cache.',
    choices: [{ id: 'split', label: 'AGREE' }, { id: 'refuse', label: 'RACE' }, { id: 'cancel', label: 'LATER' }] };
  try {
    const before = clone(state);
    bus.emit('salvageOutfits:offer', payload);
    const first = offered.at(-1);
    assert.deepEqual(routeDigit([{ ...first, seq: 0 }], first.id, '2'),
      { type: 'choose', id: first.id, choiceId: 'refuse' }, 'existing deck digit policy owns the answer');
    bus.emit('salvageOutfits:offer', { ...payload, offerId: 'terms:2' });
    first.onChoose('split', 'keyboard');
    assert.equal(intents.length, 0, 'a replaced contract cannot commit');
    offered.at(-1).onChoose('cancel', 'pointer');
    offered.at(-1).onChoose('split', 'keyboard');
    assert.equal(intents.length, 1, 'one answer is one intent');
    assert.equal(intents[0].choiceId, 'cancel');
    assert.deepEqual(state, before, 'presentation has no gameplay write authority');
    bus.emit('salvageOutfits:offer', payload);
    const pending = offered.at(-1);
    bus.emit('save:restoring');
    pending.onChoose('split', 'keyboard');
    assert.equal(intents.length, 1, 'cold restore retracts the old prompt');
    assert.equal(view.inspect().offers, 0);
  } finally { view.destroy(); }
  bus.emit('salvageOutfits:offer', payload);
  assert.equal(view.inspect().offers, 0, 'destroy unsubscribes the adapter');
});

test('contextual radio reaches the existing voice floor once and only sounds after surfacing', () => {
  const bus = createBus(), speech = [], audio = [];
  const view = createSalvageOutfitsPresentation({ state: { mode: 'flight' }, bus, deck: null });
  bus.on('voice:say', p => speech.push(p));
  bus.on('barkDirector:voice', p => audio.push(p));
  try {
    const line = { id: 'keel:claim:1', crewId: 'keel', text: 'Winch on the core. Mind the line.' };
    bus.emit('salvageOutfits:radio', line);
    bus.emit('salvageOutfits:radio', line);
    assert.equal(speech.length, 1);
    assert.equal(audio.length, 0, 'queued speech has not taken the voice floor');
    bus.emit('voice:surface', { id: speech[0].id });
    bus.emit('voice:surface', { id: speech[0].id });
    assert.equal(audio.length, 1);
    assert.equal(audio[0].factionId, 'faction_pitborn');
  } finally { view.destroy(); }
});

test('discovery materializes two different crews and one finite pool with readable pre-tow targets', async () => {
  const h = await boot();
  try {
    const { meeting } = h;
    assert.deepEqual(Object.keys(meeting.crews).sort(), ['keel', 'latch']);
    assert.deepEqual(Object.keys(meeting.bodies).sort(), ['cache', 'core', 'frame']);
    assert.ok(Object.values(meeting.bodies).every(b => b.status === 'live' && total(b.pool) > 0));
    const crewEntities = Object.values(meeting.crews).map(c => entity(h, c));
    assert.ok(crewEntities.every(e => e?.alive && e.hull > 0 && !e.invulnerable));
    assert.notEqual(crewEntities[0].data.defId, crewEntities[1].data.defId, 'functional hulls have different silhouettes');
    assert.ok(crewEntities.every(e => e.data.ai.passive), 'workers begin outside combat');
    const uniqueKeys = new Set(Object.values(meeting.bodies).map(b => b.key));
    assert.equal(uniqueKeys.size, 3);
    assert.equal(h.state.entityList.filter(e => e.alive && uniqueKeys.has(e.data?.worldRecordId)).length, 3);
    const model = getSalvageOutfitsReadModel(h.state);
    assert.equal(model.crewCount, 2); assert.equal(model.cargoCount, 3);
    assert.ok(model.crews.slice(0, 2).every(c => c.materialized));
    assert.ok(model.crews.slice(0, 2).some(c => c.hasTarget && c.targetMaterialized), 'intention is projected before any settlement');
    const before = h.state.entityList.length;
    const reused = h.owner.start({ encounterId: 'test:outfits:one', sectorId: SECTOR, anchor: ANCHOR });
    assert.equal(reused.meetingId, meeting.id);
    assert.equal(h.state.entityList.length, before, 'retry does not mint a duplicate field');
  } finally { h.close(); }
});

test('accept, refuse, cancel, and stale offer each preserve their distinct contract consequences', async () => {
  for (const choice of ['split', 'refuse', 'cancel']) {
    const h = await boot();
    try {
      const credits = h.state.player.credits;
      const offerId = h.meeting.offer.id;
      assert.equal(choose(h, choice).ok, true, choice);
      assert.equal(h.state.player.credits, credits, 'a promise is not payment');
      assert.equal(h.owner.choose({ meetingId: h.meeting.id, offerId, choiceId: 'cooperate' }).ok, false,
        'an answered offer cannot be committed again');
      if (choice === 'split') {
        assert.equal(h.meeting.agreement.type, 'split');
        assert.notEqual(h.meeting.bodies.core.claim, h.meeting.bodies.frame.claim, 'split assigns distinct originals');
      } else assert.ok(!h.meeting.agreement || h.meeting.agreement.status !== 'active');
      assert.ok(Object.values(h.meeting.crews).map(c => entity(h, c)).every(e => e.data.ai.passive),
        'refusal and cancellation do not arbitrarily turn workers hostile');
    } finally { h.close(); }
  }
});

test('two crews naturally approach and tow the original cargo through native constraints', async () => {
  const h = await boot();
  try {
    choose(h, 'refuse');
    const starts = new Map(Object.values(h.meeting.bodies).map(b => [b.key, { ...entity(h, b).pos }]));
    const originals = new Map(Object.values(h.meeting.bodies).map(b => [b.key, entity(h, b)]));
    const seenCrews = new Set(), traveled = new Set();
    let maximumStep = 0;
    const previous = new Map([...starts].map(([id, p]) => [id, { ...p }]));
    const moved = advanceUntil(h, () => seenCrews.size === 2 && traveled.size >= 2, 120, () => {
      for (const [crewId, crew] of Object.entries(h.meeting.crews)) {
        const body = h.meeting.bodies[crew.targetId];
        const actor = entity(h, crew), load = body && entity(h, body);
        if (actor && load && h.adapter.line(actor, load)) seenCrews.add(crewId);
      }
      for (const body of Object.values(h.meeting.bodies)) {
        const load = entity(h, body);
        if (!load?.alive) continue;
        assert.equal(load, originals.get(body.key), 'native cargo is the same original entity');
        maximumStep = Math.max(maximumStep, dist(previous.get(body.key), load.pos));
        previous.set(body.key, { ...load.pos });
        if (dist(starts.get(body.key), load.pos) > 8) traveled.add(body.key);
      }
    });
    assert.ok(moved, `both crews must move actual cargo: crews=${[...seenCrews]} moved=${[...traveled]}`);
    assert.ok(maximumStep < 8, `fixed-step movement must be continuous, largest step=${maximumStep}`);
    assert.ok(h.state.physicsRuntime.diagnostics.sg02Attachments >= 1);
  } finally { h.close(); }
});

test('read models reject a recycled numeric id and leave authoritative state untouched', async () => {
  const h = await boot();
  try {
    const core = h.meeting.bodies.core, original = entity(h, core);
    const before = clone(h.owner.serialize());
    getSalvageOutfitsReadModel(h.state);
    assert.deepEqual(h.owner.serialize(), before);
    const impostor = { ...original, data: { ...original.data, salvageOutfitKey: 'someone-else' } };
    h.state.entities.set(core.entityId, impostor);
    assert.equal(salvageOutfitEntity(h.state, core), null, 'a reused number is not the original piece');
    h.state.entities.set(core.entityId, original);
    assert.equal(salvageOutfitEntity(h.state, core), original);
  } finally { h.close(); }
});

test('cold snapshot normalization preserves exhaustion and rejects missing original records', () => {
  const state = freshSalvageOutfits();
  const meeting = makeSalvageMeeting({ id: 'save:test', sectorId: SECTOR, anchor: ANCHOR,
    variant: 'heavy_lift', now: 50, memory: state.memory });
  state.meetings[meeting.id] = meeting;
  meeting.bodies.core.status = 'delivered'; meeting.bodies.core.pool = {};
  meeting.bodies.frame.pool = { cmdty_scrap_metal: 2 };
  delete meeting.bodies.cache;
  meeting.crews.keel.pos.x += 240;
  meeting.crews.keel.status = 'tow'; meeting.crews.keel.towSeconds = 9;
  meeting.agreement = { type: 'cooperate', status: 'active', crewId: 'keel', pieceId: 'frame',
    acceptedAt: 52, bonus: 120, receiptId: 'save:test:agreement:cooperate' };
  const restored = normalizeSalvageOutfits(clone(state)).meetings[meeting.id];
  assert.equal(restored.bodies.core.status, 'delivered');
  assert.deepEqual(restored.bodies.core.pool, {}, 'a retired component cannot refill from catalog');
  assert.equal(total(restored.bodies.frame.pool), 2);
  assert.equal(restored.bodies.cache.status, 'destroyed', 'absent identity cannot respawn as a free prize');
  assert.equal(restored.crews.keel.pos.x, meeting.crews.keel.pos.x);
  assert.equal(restored.crews.keel.towSeconds, 9);
  assert.equal(restored.agreement.acceptedAt, 52);
  assert.equal(restored.agreement.bonus, 120);
  assert.equal(restored.bodies.core.entityId, null, 'runtime IDs are not trusted across process boundaries');
});

test('cooperation requires both real deliveries and pays through economy exactly once', async () => {
  const h = await boot({ variant: 'heavy_lift' });
  try {
    const before = h.state.player.credits;
    assert.equal(choose(h, 'cooperate').ok, true);
    const agreement = h.meeting.agreement;
    const frameValue = total(h.meeting.bodies.frame.pool) * 8;
    assert.equal(h.state.player.credits, before);
    const original = playerRecovery(h, 'frame');
    assert.equal(h.state.entities.get(original.id), undefined, 'only actual receiver retirement removes the original');
    assert.ok(advanceUntil(h, () => agreement.status === 'complete', 120),
      `Keel must finish its physical half; core=${h.meeting.bodies.core.status}`);
    assert.equal(h.meeting.bodies.core.deliveredBy, 'keel');
    assert.equal(h.state.player.credits, before + frameValue + agreement.bonus);
    assert.equal(h.state.salvageOutfits.memory.keel.helped, 1);
    const paid = h.state.player.credits;
    h.sim.runTicks(240);
    assert.equal(h.state.player.credits, paid, 'continued receiver polling never pays again');
    assert.equal(h.events.filter(e => e.name === 'economy:salvageIntakeApplied').length, 2,
      'exactly two original shipments enter the existing salvage market');
    assert.equal(h.owner._deliver(h.meeting, h.meeting.bodies.frame, 'player', h.player).ok, false,
      'reentrant or stale finalization cannot spend a receipt twice');
  } finally { h.close(); }
});

test('a lost cooperation component pays no joint bonus and leaves useful partial recovery', async () => {
  const h = await boot({ variant: 'heavy_lift' });
  try {
    assert.equal(choose(h, 'cooperate').ok, true);
    const before = h.state.player.credits, core = entity(h, h.meeting.bodies.core);
    h.sim.helpers.removeEntity(core.id);
    h.sim.runTicks(2);
    assert.equal(h.meeting.agreement.status, 'broken');
    assert.equal(h.state.player.credits, before);
    assert.equal(h.meeting.bodies.frame.status, 'live');
    const expected = total(h.meeting.bodies.frame.pool) * 8;
    playerRecovery(h, 'frame');
    assert.equal(h.state.player.credits, before + expected, 'only physically recovered remaining value is paid');
    assert.equal(h.state.salvageOutfits.memory.keel.helped, 0);
  } finally { h.close(); }
});

test('Latchkey overcommits with a real load, releases its cable, and offers a noncoercive rescue', async () => {
  const h = await boot({ variant: 'overreach' });
  try {
    const originalOfferId = h.meeting.offer.id; // Leave first terms open: rescue must replace them.
    const core = entity(h, h.meeting.bodies.core), start = { ...core.pos };
    assert.ok(advanceUntil(h, () => h.meeting.crews.latch.status === 'stalled', 90), 'overweight haul must create the mistake');
    assert.equal(entity(h, h.meeting.bodies.core), core, 'slipped cargo remains the exact original');
    assert.ok(dist(start, core.pos) > 1, 'mistake occurs during real extraction, not while posing');
    assert.equal(h.owner.physical.line(entity(h, h.meeting.crews.latch), core), null);
    assert.notEqual(h.meeting.offer.id, originalOfferId, 'the emergency replaces stale split terms');
    assert.ok(h.meeting.offer.choices.some(c => c.id === 'rescue'));
    const before = h.state.player.credits;
    assert.equal(choose(h, 'rescue').ok, true);
    assert.equal(h.state.player.credits, before);
    const expected = total(h.meeting.bodies.core.pool) * 8 + h.meeting.agreement.bonus;
    playerRecovery(h, 'core', 180);
    h.sim.runTicks(3);
    assert.equal(h.state.player.credits, before + expected);
    assert.equal(h.state.salvageOutfits.memory.latch.helped, 1);
    assert.equal(h.meeting.agreement.status, 'complete');
    const next = h.owner.start({ encounterId: 'test:outfits:help-remembered', sectorId: SECTOR,
      anchor: { x: ANCHOR.x + 900, z: ANCHOR.z }, variant: 'heavy_lift' });
    assert.equal(next.ok, true);
    const repeat = h.state.salvageOutfits.meetings[next.meetingId];
    assert.equal(repeat.crews.latch.favorsPlayer, true, 'remembered assistance changes which pieces the cutter pursues');
    assert.equal(repeat.crews.latch.targetId, 'frame', 'help changes the normal heavy-lift cache approach');
    assert.equal(repeat.bodies.cache.claim, 'player', 'the remembered favor reserves an actual small original');
    const repeatedFrame = entity(h, repeat.bodies.frame), repeatedCache = entity(h, repeat.bodies.cache);
    assert.ok(advanceUntil(h, () => h.owner.physical.line(entity(h, repeat.crews.latch), repeatedFrame), 120),
      'the remembered choice must reach a real native attachment to the radiator');
    assert.equal(entity(h, repeat.bodies.cache), repeatedCache);
    assert.equal(repeat.bodies.cache.claim, 'player', 'work and elapsed time do not revoke the remembered favor');
  } finally { h.close(); }
});

test('real beam salvage drains the shared source and a broken promise changes the next negotiation', async () => {
  const h = await boot();
  try {
    assert.equal(choose(h, 'split').ok, true);
    const core = entity(h, h.meeting.bodies.core), before = total(core.data.salvagePool);
    const mine = h.sim.registry.get('mining');
    let actualYield = 0;
    h.bus.on('mining:yield', p => { if (p.minerId === h.player.id) actualYield += p.qty; });
    mine._drainWreck(h.player, core, 18, 1);
    h.sim.runTicks(1); // The mining owner completes admission/refund before the feature captures its finite floor.
    assert.ok(total(core.data.salvagePool) < before, 'the production mining owner consumes the same original');
    assert.equal(total(h.meeting.bodies.core.pool), total(core.data.salvagePool), 'crew ledger sees the physical source loss');
    assert.ok(h.state.entityList.some(e => e.alive && e.type === 'pickup'), 'actual yield exists in the world');
    assert.equal(h.meeting.agreement.status, 'broken');
    assert.equal(h.state.salvageOutfits.memory.keel.cheated, 1);
    const remaining = total(h.meeting.bodies.core.pool);
    core.data.salvagePool.cmdty_scrap_metal = 100; // A stale external annotation may not refill the physical original.
    h.sim.runTicks(1);
    assert.equal(total(core.data.salvagePool), remaining, 'the actual mining source retains the saved depletion floor');
    mine._drainWreck(h.player, core, 18, 8);
    assert.equal(actualYield, before, 'mining before and after annotation cannot create extra finite units');
    assert.equal(total(h.meeting.bodies.core.pool), 0);
    const response = h.owner.start({ encounterId: 'test:outfits:broken-remembered', sectorId: SECTOR,
      anchor: { x: ANCHOR.x + 180, z: ANCHOR.z + 150 }, variant: 'heavy_lift' });
    assert.equal(response.ok, true);
    const next = h.state.salvageOutfits.meetings[response.meetingId];
    assert.ok(next.offer);
    assert.ok(!next.offer.choices.some(c => c.id === 'split' || c.id === 'cooperate'),
      'the next meeting changes available work terms instead of only printing a relationship number');
    assert.ok(Object.values(h.meeting.crews).map(c => entity(h, c)).every(e => e.data.ai.passive),
      'a broken deal is not an arbitrary scripted firefight');
  } finally { h.close(); }
});

test('a cold native save preserves live originals, cargo depletion, agreement, tow progress and settled rewards', async () => {
  let h = await boot({ variant: 'heavy_lift' });
  try {
    choose(h, 'cooperate');
    assert.ok(advanceUntil(h, () => h.meeting.crews.keel.status === 'tow'
      && h.meeting.crews.keel.towSeconds >= 3, 90));
    // A legitimate partial extraction on the open cache must stay partially depleted after load.
    const cache = entity(h, h.meeting.bodies.cache);
    h.sim.registry.get('mining')._drainWreck(h.player, cache, 18, 3);
    const snapshot = captureSalvageOutfits(h.state, h.sim.registry);
    const meetingId = h.meeting.id;
    const coreBefore = entity(h, h.meeting.bodies.core), savedCorePos = { ...coreBefore.pos };
    const keysBefore = Object.values(h.meeting.bodies).map(b => b.key);
    const envelope = clone(h.sim.registry.get('save').serialize('outfits-cold'));
    // This is the concrete save-extension seam delivered with the scoped candidate. The shared
    // serializer's one import is intentionally not patched by this independently integrated task.
    envelope.data.salvageOutfits = snapshot;
    envelope.checksum = fnv1a(JSON.stringify(envelope.data));
    h.close();
    h = await boot({ start: false });
    assert.equal(h.sim.registry.get('save').loadEnvelope(envelope, 'outfits-cold'), true,
      'actual save owner must validate and restore the native envelope');
    assert.equal(restoreSalvageOutfits(envelope.data, h.sim.registry), true);
    h.owner.afterContinue();
    h.player = h.state.entities.get(h.state.playerId);
    h.meeting = h.state.salvageOutfits.meetings[meetingId];
    assert.ok(h.meeting);
    assert.equal(h.meeting.agreement.type, 'cooperate');
    assert.equal(h.meeting.agreement.acceptedAt, snapshot.meetings[meetingId].agreement.acceptedAt);
    assert.equal(h.meeting.crews.keel.towSeconds, snapshot.meetings[meetingId].crews.keel.towSeconds);
    assert.deepEqual(h.meeting.bodies.cache.pool, snapshot.meetings[meetingId].bodies.cache.pool);
    assert.ok(dist(entity(h, h.meeting.bodies.core).pos, savedCorePos) < 0.01, 'the race does not restart at its approach spawn');
    for (const key of keysBefore) assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === key).length, 1,
      `${key}: no source copy after cold adoption`);
    h.sim.runTicks(4);
    playerRecovery(h, 'frame');
    assert.ok(advanceUntil(h, () => h.meeting.agreement.status === 'complete', 120));
    const paid = h.state.player.credits;
    const settledSnapshot = captureSalvageOutfits(h.state, h.sim.registry);
    const settledEnvelope = clone(h.sim.registry.get('save').serialize('outfits-settled'));
    settledEnvelope.data.salvageOutfits = settledSnapshot;
    settledEnvelope.checksum = fnv1a(JSON.stringify(settledEnvelope.data));
    h.close(); h = await boot({ start: false });
    assert.equal(h.sim.registry.get('save').loadEnvelope(settledEnvelope, 'outfits-settled'), true);
    restoreSalvageOutfits(settledEnvelope.data, h.sim.registry); h.owner.afterContinue();
    h.player = h.state.entities.get(h.state.playerId); h.meeting = h.state.salvageOutfits.meetings[meetingId];
    h.sim.runTicks(240);
    assert.equal(h.state.player.credits, paid, 'a second process cannot replay old settlement');
    assert.equal(h.meeting.agreement.status, 'complete');
    assert.equal(h.state.salvageOutfits.memory.keel.helped, 1);
    assert.equal(h.state.entityList.filter(e => e.alive && keysBefore.slice(0, 2).includes(e.data?.worldRecordId)).length, 0,
      'received core and frame never rematerialize');
  } finally { h.close(); }
});

test('new-game and teardown cancel native lines, release spawn slots and reject stale answers', async () => {
  const h = await boot();
  try {
    const oldOffer = clone(h.meeting.offer);
    assert.ok(advanceUntil(h, () => Object.values(h.meeting.crews).some(c => c.status === 'tow'), 90));
    assert.ok(h.state.physicsRuntime.diagnostics.sg02Attachments > 0);
    const oldKey = h.meeting.bodies.core.key;
    h.owner.newGame();
    h.sim.runTicks(3);
    assert.equal(Object.keys(h.state.salvageOutfits.meetings).length, 0);
    assert.equal(h.state.entityList.some(e => e.alive && e.data?.worldRecordId === oldKey), false);
    assert.equal(h.state.physicsRuntime.diagnostics.sg02Attachments, 0);
    assert.equal(h.sim.helpers.spawnBudget.current(), 0);
    assert.equal(h.owner.choose({ meetingId: h.meeting.id, offerId: oldOffer.id, choiceId: 'split' }).ok, false);
  } finally { h.close(); }
});

test('touching and abandoning a prize does not reserve it forever; crews resume the physical race', async () => {
  const h = await boot();
  try {
    choose(h, 'refuse');
    const core = entity(h, h.meeting.bodies.core);
    const attachments = h.sim.registry.get('combat').kernel.attachments;
    const made = attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: core.id,
      sourceWorld: h.player.pos, targetWorld: core.pos });
    assert.equal(made.ok, true, made.reason);
    h.sim.runTicks(4);
    assert.equal(h.meeting.bodies.core.claim, 'player', 'a real player line wins the present physical race');
    assert.equal(attachments.cut(made.attachment.id, h.player.id, 'test_player_abandoned').ok, true);
    assert.ok(advanceUntil(h, () => h.meeting.bodies.core.claim !== 'player', 14),
      'uncontracted custody expires when the player has abandoned the original');
    assert.ok(advanceUntil(h, () => Object.values(h.meeting.crews).some(c => c.targetId === 'core'
      && h.owner.physical.line(entity(h, c), core)), 180),
      'one of the same working crews must really reacquire the abandoned original');
    assert.equal(entity(h, h.meeting.bodies.core), core);
  } finally { h.close(); }
});

test('a real receipt invalidates an unanswered offer before its original pieces can be promised twice', async () => {
  const h = await boot();
  try {
    const offerId = h.meeting.offer.id, credits = h.state.player.credits;
    assert.ok(advanceUntil(h, () => h.meeting.bodies.frame.status === 'delivered', 120),
      'Latchkey must physically hand over the radiator while the player leaves the offer unanswered');
    assert.equal(h.meeting.bodies.frame.deliveredBy, 'latch');
    assert.equal(h.owner.choose({ meetingId: h.meeting.id, offerId, choiceId: 'cooperate' }).ok, false);
    assert.equal(h.meeting.agreement, null);
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.owner.offer(h.meeting.id), true, 'remaining originals still have current independent-work terms');
    assert.ok(h.meeting.offer.choices.every(c => !['split', 'cooperate'].includes(c.id)),
      'current terms cannot offer an original already received by someone else');
  } finally { h.close(); }
});

test('remembered actual violence changes Latchkey to smaller work and a wider physical approach', async () => {
  const h = await boot({ variant: 'overreach' });
  try {
    const firstLatch = entity(h, h.meeting.crews.latch);
    const damage = h.sim.registry.get('combat').kernel.routeDamage({ attackerId: h.player.id,
      targetId: firstLatch.id, packet: scalarHitToDamagePacket({ damage: 12, damageType: 'kinetic', pos: firstLatch.pos }),
      origin: { kind: 'test', id: 'salvage-outfit-remembered-hit' } });
    assert.equal(damage.ok, true);
    assert.ok(damage.totalApplied > 0, 'the remembered event must be routed physical damage');
    assert.equal(h.state.salvageOutfits.memory.latch.cheated, 1);
    const repeatAnchor = { x: ANCHOR.x + 600, z: ANCHOR.z + 250 };
    const started = h.owner.start({ encounterId: 'test:outfits:cautious-repeat', sectorId: SECTOR,
      anchor: repeatAnchor, variant: 'overreach' });
    assert.equal(started.ok, true);
    const repeat = h.state.salvageOutfits.meetings[started.meetingId];
    assert.equal(repeat.crews.latch.cautious, true);
    assert.equal(repeat.crews.latch.targetId, 'cache', 'the same overreach situation now gets a small-load decision');
    assert.equal(repeat.bodies.core.claim, 'keel');
    const cutter = entity(h, repeat.crews.latch), cache = entity(h, repeat.bodies.cache);
    assert.equal(cutter.pos.x, repeatAnchor.x + 220, 'caution changes the materialized approach position');
    assert.ok(advanceUntil(h, () => h.owner.physical.line(cutter, cache), 120),
      'changed intention must result in real native custody of the smaller original');
    assert.equal(repeat.crews.latch.overcommitted, false);
    assert.equal(repeat.crews.latch.targetId, 'cache');
  } finally { h.close(); }
});

test('completed crews preserve a player-attached anchor and physically depart after the cable is cut', async () => {
  const h = await boot();
  try {
    choose(h, 'refuse');
    const crew = h.meeting.crews.latch, anchor = entity(h, crew), initial = { ...anchor.pos };
    const attachments = h.sim.registry.get('combat').kernel.attachments;
    const made = attachments.create({ defId: 'tether_standard', ownerId: h.player.id,
      targetId: anchor.id, sourceWorld: h.player.pos, targetWorld: anchor.pos });
    assert.equal(made.ok, true, made.reason);
    const mine = h.sim.registry.get('mining');
    for (const body of Object.values(h.meeting.bodies)) mine._drainWreck(h.player, entity(h, body), 18, 8);
    h.sim.runTicks(3);
    assert.equal(h.meeting.status, 'complete');
    const playerHolding = { x: ANCHOR.x + 500, z: ANCHOR.z };
    assert.ok(advanceUntil(h, () => h.meeting.crews.keel.status === 'departed', 180,
      () => driveToward(h, playerHolding)), 'the unattached crew must finish its actual outward trip');
    assert.equal(entity(h, crew), anchor, 'a live player attachment cannot lose its original endpoint');
    assert.equal(crew.status, 'departing');
    assert.ok(h.owner.physical.playerLine(anchor), 'the preserved endpoint belongs to a current native player rope');
    assert.equal(h.state.spawnBudget.reservations.get(crew.key)?.count, 1,
      'the attached original keeps its own spawn slot');
    assert.equal(h.state.spawnBudget.reservations.has(h.meeting.crews.keel.key), false);
    assert.equal(attachments.cut(made.attachment.id, h.player.id, 'test_anchor_release').ok, true);
    let furthest = dist(initial, anchor.pos), maximumStep = 0, previous = { ...anchor.pos };
    assert.ok(advanceUntil(h, () => crew.status === 'departed', 120, () => {
      if (!anchor.alive) return;
      furthest = Math.max(furthest, dist(initial, anchor.pos));
      maximumStep = Math.max(maximumStep, dist(previous, anchor.pos));
      previous = { ...anchor.pos };
    }), 'the released boat must navigate to its real departure point');
    assert.ok(furthest > 900, 'retirement follows a substantial actual outward journey');
    assert.ok(maximumStep < 8, 'departure movement is continuous under native thrust');
    assert.equal(h.state.entities.get(anchor.id), undefined);
    assert.equal(h.state.spawnBudget.reservations.has(crew.key), false,
      'departure releases the outfit slot without claiming unrelated mining follow-on reservations');
    h.sim.runTicks(120);
    assert.equal(h.state.entityList.some(e => e.alive && e.data?.worldRecordId === crew.key), false,
      'retired actors cannot materialize again from a completed meeting');
  } finally { h.close(); }
});

test('continuous membership preserves live towing and intentional jump-return preserves the finite site', async () => {
  const h = await boot({ variant: 'heavy_lift' });
  try {
    choose(h, 'cooperate');
    assert.ok(advanceUntil(h, () => h.meeting.crews.keel.status === 'tow'
      && h.meeting.crews.keel.towSeconds >= 3, 90));
    const actor = entity(h, h.meeting.crews.keel), core = entity(h, h.meeting.bodies.core);
    const line = h.owner.physical.line(actor, core);
    assert.ok(line);
    const acceptedAt = h.meeting.agreement.acceptedAt;
    const cache = entity(h, h.meeting.bodies.cache);
    h.sim.registry.get('mining')._drainWreck(h.player, cache, 18, 3);
    h.sim.runTicks(1);
    const depletedPool = clone(h.meeting.bodies.cache.pool);
    assert.ok(total(depletedPool) > 0 && total(depletedPool) < 4);
    const corePose = { ...core.pos }, actorPose = { ...actor.pos };

    // Exercise the production sector event protocol; bodies stay at their true coordinates.
    h.bus.emit('sector:exit', { sectorId: SECTOR, continuous: true });
    h.state.world.currentSectorId = 'sector_vesta_forge';
    h.bus.emit('sector:enter', { sectorId: 'sector_vesta_forge', continuous: true });
    assert.equal(entity(h, h.meeting.crews.keel), actor);
    assert.equal(entity(h, h.meeting.bodies.core), core);
    assert.ok(dist(core.pos, corePose) < 0.01 && dist(actor.pos, actorPose) < 0.01,
      'a membership handoff cannot place either live endpoint');
    h.sim.runTicks(4);
    assert.equal(h.owner.physical.line(actor, core)?.id, line.id,
      'the same live native cable must survive job-lease reacquisition');
    assert.ok(advanceUntil(h, () => h.meeting.bodies.core.status === 'delivered', 120),
      'a tow already under way must continue to its physical receipt after crossing membership');
    assert.equal(h.meeting.bodies.core.deliveredBy, 'keel');
    assert.equal(h.meeting.agreement.status, 'active', 'one half alone cannot settle cooperation');

    const frameKey = h.meeting.bodies.frame.key, cacheKey = h.meeting.bodies.cache.key;
    const framePose = { ...entity(h, h.meeting.bodies.frame).pos };
    h.bus.emit('sector:exit', { sectorId: 'sector_vesta_forge' });
    h.state.world.currentSectorId = 'sector_helios_prime';
    h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    h.sim.runTicks(4);
    assert.equal(h.owner.physical.find(frameKey), null);
    assert.equal(h.owner.physical.find(cacheKey), null);
    assert.equal(h.state.entityList.some(e => e.alive && e.data?.salvageOutfitMeetingId === h.meeting.id), false,
      'an intentional jump shelves every original still present after the continuous crossing');

    h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    h.state.world.currentSectorId = SECTOR;
    h.bus.emit('sector:enter', { sectorId: SECTOR });
    h.sim.runTicks(4);
    const frame = entity(h, h.meeting.bodies.frame), returnedCache = entity(h, h.meeting.bodies.cache);
    assert.ok(frame?.alive && returnedCache?.alive);
    assert.ok(dist(frame.pos, framePose) < 0.1, 'return rematerializes the saved original pose');
    assert.deepEqual(returnedCache.data.salvagePool, depletedPool);
    assert.equal(h.meeting.bodies.frame.claim, 'player');
    assert.equal(h.meeting.agreement.acceptedAt, acceptedAt);
    assert.equal(h.meeting.bodies.core.status, 'delivered');
    assert.equal(h.owner.physical.find(h.meeting.bodies.core.key), null, 'the received original never respawns');
    for (const key of [frameKey, cacheKey]) assert.equal(h.state.entityList.filter(e => e.alive
      && e.data?.worldRecordId === key).length, 1, 'each surviving source has one materialized original');
    const credits = h.state.player.credits, bonus = h.meeting.agreement.bonus;
    playerRecovery(h, 'frame');
    assert.equal(h.meeting.agreement.status, 'complete');
    assert.equal(h.state.player.credits, credits + 7 * 8 + bonus);
  } finally { h.close(); }
});

test('a split allows ordinary beam recovery of both small originals and remembers the kept bargain', async () => {
  const h = await boot();
  try {
    choose(h, 'split');
    const credits = h.state.player.credits;
    const mine = h.sim.registry.get('mining');
    for (const id of ['frame', 'cache']) mine._drainWreck(h.player, entity(h, h.meeting.bodies[id]), 18, 8);
    h.sim.runTicks(1);
    assert.equal(h.meeting.bodies.frame.status, 'salvaged');
    assert.equal(h.meeting.bodies.cache.status, 'salvaged');
    assert.ok(advanceUntil(h, () => h.meeting.agreement.status === 'complete', 120),
      'Keel must physically recover its distinct promised cradle');
    assert.equal(h.meeting.bodies.core.deliveredBy, 'keel');
    assert.equal(h.state.salvageOutfits.memory.keel.kept, 1);
    assert.equal(h.state.salvageOutfits.memory.keel.cheated, 0);
    assert.equal(h.state.player.credits, credits, 'a clean split does not invent a joint-delivery bonus');
    const normalized = normalizeSalvageOutfits(h.owner.serialize());
    assert.equal(normalized.memory.keel.kept, 1, 'the kept outcome survives the cold-save whitelist');
    h.sim.runTicks(120);
    assert.equal(h.state.salvageOutfits.memory.keel.kept, 1, 'completion does not record the same bargain repeatedly');
  } finally { h.close(); }
});

test('nearby authored work uses the actual director admission and respects its pressure and pacing', async () => {
  const zone = zonesForSector(SECTOR).find(z => z.id === 'zone_ceres_belt');
  const site = { x: ANCHOR.x + zone.center.x, z: ANCHOR.z + zone.center.z };
  const h = await boot({ start: false, playerPos: { x: site.x, z: site.z + 180 } });
  const director = h.sim.registry.get('encounterDirector');
  const request = director.requestAuthoredEncounter, calls = [];
  director.requestAuthoredEncounter = function (payload) {
    const result = request.call(this, payload);
    if (payload.shapeId === encounter.trigger.id) calls.push({ payload: clone(payload), result: clone(result) });
    return result;
  };
  try {
    h.sim.runTicks(60);
    assert.ok(calls.some(c => c.result.reason === 'pressure'), 'the real director can decline a nearby work site');
    assert.equal(Object.keys(h.state.salvageOutfits.meetings).length, 0,
      'declined admission has no direct-start fallback');
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.persistenceOwner === 'salvageOutfits').length, 0);
    h.bus.emit('sector:enter', { sectorId: SECTOR }); // Existing director seeds ordinary entry pressure and breath.
    h.sim.runTicks(60);
    assert.ok(calls.some(c => c.result.reason === 'pacing_gap'));
    assert.equal(Object.keys(h.state.salvageOutfits.meetings).length, 0);
    assert.ok(advanceUntil(h, () => Object.keys(h.state.salvageOutfits.meetings).length > 0, 90),
      'ordinary sim-time and proximity must discover the crews without calling start or a debug event');
    const id = salvageOutfitsDiscoveryId(h.state, zone.id);
    h.meeting = h.state.salvageOutfits.meetings[id];
    assert.ok(h.meeting, 'the authored zone has one durable source identity');
    assert.deepEqual(h.meeting.anchor, site, 'sector-local authored coordinates become actual global coordinates');
    assert.equal(h.meeting.variant, 'split_drift', 'the site variant survives the real authored-request plan');
    assert.equal(h.state.encounterDirector.live[id]?.phase, 'working');
    assert.ok(calls.every(c => c.payload.respectPacing === true && c.payload.force !== true));
    assert.ok(calls.some(c => c.result.ok === true));
    h.sim.runTicks(4);
    assert.equal(Object.keys(h.meeting.crews).length, 2);
    for (const crew of Object.values(h.meeting.crews)) assert.ok(h.owner.physical.nativeReady(entity(h, crew)),
      'each discovered crew is an admitted native body');
    assert.ok(advanceUntil(h, () => Object.values(h.meeting.crews).some(c => {
      const body = h.meeting.bodies[c.targetId];
      return body && h.owner.physical.line(entity(h, c), entity(h, body));
    }), 120), 'automatically discovered workers must acquire a real original');

    const cache = entity(h, h.meeting.bodies.cache);
    h.sim.registry.get('mining')._drainWreck(h.player, cache, 18, 3);
    h.sim.runTicks(1);
    const remaining = clone(h.meeting.bodies.cache.pool), key = h.meeting.bodies.cache.key;
    assert.ok(total(remaining) > 0 && total(remaining) < 4);
    h.bus.emit('sector:exit', { sectorId: SECTOR });
    h.state.world.currentSectorId = 'sector_helios_prime';
    h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    h.sim.runTicks(4);
    h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    h.state.world.currentSectorId = SECTOR;
    h.bus.emit('sector:enter', { sectorId: SECTOR });
    h.sim.runTicks(90);
    assert.equal(Object.keys(h.state.salvageOutfits.meetings).length, 1,
      'return revisits the same finite work site');
    assert.equal(h.meeting.id, id);
    assert.deepEqual(entity(h, h.meeting.bodies.cache).data.salvagePool, remaining);
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === key).length, 1);
    const restored = normalizeSalvageOutfits(h.owner.serialize());
    assert.deepEqual(restored.meetings[id].bodies.cache.pool, remaining,
      'the fixed visited site and its depletion survive the durable save whitelist');
  } finally { director.requestAuthoredEncounter = request; h.close(); }
});
