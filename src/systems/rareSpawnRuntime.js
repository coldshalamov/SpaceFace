// Plan 28 rare-spawn runtimes. The ordinary encounter director owns deterministic selection,
// pressure, cooldowns, entity admission, and teardown. These handlers only author the physical
// cast and translate real interaction receipts into durable outcomes.
import { Masks } from '../core/entity.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './ships.js';

const OFFER_S = 45;
const MIGRATION_S = 75;
const ACE_COMBAT_S = 120;
const PHYSICAL_MASK = Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE;

function news(d, live, headline, stage = 'sighting', outcome = null) {
  d.emit('news:headline', {
    kind: 'rare-spawn',
    headline,
    text: headline,
    stage,
    outcome,
    encounterId: live.id,
    shapeId: live.shapeId,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
  });
}

function remember(state, live, outcome) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  const ledger = story.flags.rareSpawns || (story.flags.rareSpawns = { completed: {}, history: [] });
  if (!ledger.completed || typeof ledger.completed !== 'object') ledger.completed = {};
  if (!Array.isArray(ledger.history)) ledger.history = [];
  const record = {
    encounterId: live.id,
    outcome,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
    tick: state.tick | 0,
    at: Number(state.simTime) || 0,
  };
  ledger.completed[live.shapeId] = record;
  ledger.history.push({ shapeId: live.shapeId, ...record });
  if (ledger.history.length > 32) ledger.history.splice(0, ledger.history.length - 32);
  return record;
}

function finish(d, live, state, outcome, headline) {
  if (!live || live.phase === 'done') return false;
  remember(state, live, outcome);
  news(d, live, headline, 'aftermath', outcome);
  d.emit('rareSpawn:resolved', {
    encounterId: live.id,
    shapeId: live.shapeId,
    outcome,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
  });
  d.resolve(live, outcome, { vars: live.vars });
  return true;
}

function startOffer(d, live, headline) {
  live.phase = 'offer';
  live.deadlineAt = d.now() + OFFER_S;
  news(d, live, headline);
  d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
  const choices = (live.shape.choices || []).map((choice) => choice.id);
  if (choices.length) d.offerChoices(live, choices, live.shape.timeoutChoice, live.deadlineAt);
}

function timeout(d, live, state, now, choose) {
  if (live.phase === 'offer' && live.deadlineAt > 0 && now >= live.deadlineAt) {
    choose(d, live, state, live.shape.timeoutChoice);
  }
}

function bindPhysical(d, live, spec, role) {
  const spawnEntity = d.helpers && d.helpers.spawnEntity;
  if (typeof spawnEntity !== 'function') return null;
  const entity = spawnEntity(spec);
  if (!entity || entity.id == null) return null;
  live.ids.push(entity.id);
  live.roles[entity.id] = role;
  entity.data = entity.data || {};
  entity.data.rareSpawnRole = role;
  entity.data.rareSpawnShapeId = live.shapeId;
  entity.data.encounterId = live.id;
  return entity;
}

function spawnCargoPickup(d, live, {
  pos,
  commodityId,
  amount,
  role,
  scanLabel,
}) {
  return bindPhysical(d, live, {
    type: 'pickup',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 3.2,
    mass: Math.max(2, amount * 0.4),
    collides: true,
    flags: { persistent: true },
    data: {
      kind: 'cargo',
      commodityId,
      amount,
      scanLabel,
      despawnAt: d.now() + 180,
    },
  }, role);
}

function addPersistentStoryCargo(state, id) {
  const story = state.story || (state.story = { flags: {} });
  const cargo = story.persistentCargo || (story.persistentCargo = []);
  if (!cargo.includes(id)) cargo.push(id);
}

function spawnGoldPirates(d, live) {
  const plans = ['reaver_pirate', 'corsair_raider'].map((archetype, index) => ({
    archetype,
    level: 5,
    role: 'gold_claimant',
    team: 1,
    factionId: 'faction_reach',
    context: 'encounter',
    passive: false,
    doctrine: index === 0 ? 'scavenger' : 'balanced',
    pos: {
      x: live.anchor.x + 155 + index * 55,
      z: live.anchor.z + (index === 0 ? -90 : 95),
    },
  }));
  return d.spawnShips(live, plans);
}

const goldAsteroid = Object.freeze({
  fire(d, live) {
    const rock = bindPhysical(d, live, {
      type: 'asteroid',
      team: 2,
      pos: { x: live.anchor.x, z: live.anchor.z },
      vel: { x: 0, z: 0 },
      radius: 18,
      mass: 920,
      angVel: 0.035,
      hull: 760,
      hullMax: 760,
      collides: true,
      collisionMask: PHYSICAL_MASK,
      physicsBody: {
        dynamic: false,
        radius: 18,
        mass: 920,
        material: 'rock',
        shape: 'ball',
      },
      data: {
        typeId: 'ast_metallic',
        tier: 4,
        tierCap: 4,
        oreHP: 760,
        oreHPMax: 760,
        yieldU: 44,
        pctEjected: 0,
        respawnSec: 86_400,
        tint: '#d7a91e',
        scanLabel: 'Gold asteroid — jackpot core signature',
        authoredRichCore: {
          commodityId: 'cmdty_ore_goldium',
          amount: 48,
        },
      },
    }, 'gold_asteroid');
    if (!rock) return d.abort(live, 'spawn_failed');
    live.data.rockId = rock.id;
    live.data.coreSpawned = false;
    spawnGoldPirates(d, live);
    live.phase = 'physical';
    news(d, live, 'PROSPECTOR WHISPER CONFIRMED: a gold assay has drawn pirate claimants');
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
  },
  event(d, live, state, name, payload = {}) {
    if (name !== 'asteroidDestroyed' || payload.id !== live.data.rockId || live.data.coreSpawned) return;
    live.data.coreSpawned = true;
    const core = spawnCargoPickup(d, live, {
      pos: payload.pos || live.anchor,
      commodityId: 'cmdty_ore_goldium',
      amount: 48,
      role: 'gold_jackpot_core',
      scanLabel: 'Gold jackpot core — 48 units',
    });
    if (!core) return d.abort(live, 'core_spawn_failed');
    finish(d, live, state, 'jackpot_core_exposed', 'GOLD CORE EXPOSED: the jackpot mass is physically loose');
  },
});

function merchantShipSpec(live) {
  const spec = makeShipEntitySpec('ship_atlas', {
    team: 2,
    factionId: 'faction_meridian',
    pos: { x: live.anchor.x, z: live.anchor.z },
    appearance: {
      hullColor: '#f5d76e',
      accentColor: '#fff2bd',
      finish: 'polished',
      wear: 0.02,
      decalId: 'frontier',
    },
    fittings: fittingsFromDefaultModules('ship_atlas', []),
    ai: { passive: true },
  });
  spec.data.scanLabel = 'THE MERCHANT PRINCE — luxury manifest';
  spec.data.rareSpawnOverlit = true;
  return spec;
}

function spawnMerchantCast(d, live) {
  const merchantPlan = {
    entitySpec: merchantShipSpec(live),
    role: 'merchant_prince',
    team: 2,
    factionId: 'faction_meridian',
    context: 'civilian',
    passive: true,
    pos: { x: live.anchor.x, z: live.anchor.z },
  };
  const guardPlans = ['pd_screen_escort', 'heavy_gunship', 'hostile_interceptor'].map((archetype, index) => ({
    archetype,
    level: 6,
    role: 'prince_guard',
    team: 2,
    factionId: 'faction_meridian',
    context: 'patrol',
    passive: true,
    pos: {
      x: live.anchor.x - 90 - index * 35,
      z: live.anchor.z + (index - 1) * 85,
    },
  }));
  const merchantIds = d.spawnShips(live, [merchantPlan]);
  const guardIds = d.spawnShips(live, guardPlans);
  if (!merchantIds.length || guardIds.length < 2) return false;
  live.data.merchantId = merchantIds[0];
  live.data.guardIds = guardIds;
  return true;
}

function armAgainstPlayer(d, live, roles) {
  const wanted = new Set(roles);
  for (const entity of d.entsOf(live)) {
    if (!wanted.has(live.roles[entity.id])) continue;
    entity.team = 1;
    entity.data = entity.data || {};
    entity.data.team = 1;
    const ai = entity.data.ai || (entity.data.ai = {});
    ai.passive = false;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
  }
  d.setPassive(live, false);
}

function chooseMerchant(d, live, state, choiceId) {
  if (live.phase !== 'offer') return;
  if (choiceId === 'pass') {
    finish(d, live, state, 'passed', 'MERCHANT PRINCE PASSED: the convoy kept its impossible shine');
    return;
  }
  if (choiceId === 'rob') {
    live.phase = 'robbery';
    armAgainstPlayer(d, live, ['merchant_prince', 'prince_guard']);
    d.say(live, 'alert', 'MERCHANT GUARD: transponder marked. Protect the Prince.', null, { literal: true });
    return;
  }
  if (choiceId !== 'guard') return;
  live.phase = 'guarding';
  const raiderPlans = ['reaver_pirate', 'corsair_raider', 'hostile_interceptor'].map((archetype, index) => ({
    archetype,
    level: 6,
    role: 'prince_raider',
    team: 1,
    factionId: 'faction_reach',
    context: 'encounter',
    passive: false,
    pos: {
      x: live.anchor.x + 320,
      z: live.anchor.z + (index - 1) * 110,
    },
  }));
  live.data.raiderIds = d.spawnShips(live, raiderPlans);
  live.data.killedRaiders = [];
  for (const guard of d.entsOf(live, 'prince_guard')) {
    guard.team = 0;
    guard.data.team = 0;
  }
  d.setPassive(live, false, 'prince_guard');
  if (!live.data.raiderIds.length) d.abort(live, 'spawn_cap');
}

function spawnPrinceLoot(d, live, at) {
  return [
    spawnCargoPickup(d, live, {
      pos: { x: at.x - 7, z: at.z + 4 },
      commodityId: 'cmdty_luxury_goods',
      amount: 80,
      role: 'prince_luxury_manifest',
      scanLabel: 'Merchant Prince luxury manifest',
    }),
    spawnCargoPickup(d, live, {
      pos: { x: at.x + 8, z: at.z - 5 },
      commodityId: 'cmdty_art',
      amount: 25,
      role: 'prince_art_manifest',
      scanLabel: 'Merchant Prince sealed art manifest',
    }),
  ].filter(Boolean);
}

const merchantPrince = Object.freeze({
  fire(d, live) {
    if (!spawnMerchantCast(d, live)) return d.abort(live, 'spawn_cap');
    startOffer(d, live, 'MERCHANT PRINCE SIGHTED: a luxury convoy and three real guards cross the lane');
  },
  tick(d, live, state, now) { timeout(d, live, state, now, chooseMerchant); },
  choose: chooseMerchant,
  event(d, live, state, name, payload = {}) {
    if (name === 'playerHitSquad' && live.phase === 'offer') {
      chooseMerchant(d, live, state, 'rob');
      return;
    }
    if (name !== 'squadKill') return;
    if (payload.role === 'merchant_prince' && live.phase === 'robbery') {
      const merchant = state.entities && state.entities.get(payload.id);
      const at = merchant && merchant.pos || live.anchor;
      const loot = spawnPrinceLoot(d, live, at);
      if (loot.length !== 2) return d.abort(live, 'loot_spawn_failed');
      finish(d, live, state, 'prince_robbed', 'MERCHANT PRINCE ROBBED: two physical manifests are loose');
      return;
    }
    if (payload.role !== 'prince_raider' || live.phase !== 'guarding') return;
    if (!live.data.killedRaiders.includes(payload.id)) live.data.killedRaiders.push(payload.id);
    if (live.data.killedRaiders.length < live.data.raiderIds.length) return;
    d.grant(14_000, 'rare_spawn:merchant_prince_guarded');
    d.rep('faction_meridian', 18, 'merchant_prince_guarded');
    finish(d, live, state, 'prince_guarded', 'MERCHANT PRINCE GUARDED: 14,000 CR cleared against the live convoy');
  },
});

function storyWreck(d, live, spec, role) {
  return bindPhysical(d, live, {
    type: 'wreck',
    team: 2,
    pos: spec.pos,
    vel: spec.vel || { x: 0, z: 0 },
    rot: spec.rot || 0,
    angVel: spec.angVel || 0,
    radius: spec.radius || 10,
    mass: spec.mass || 140,
    hull: 1,
    hullMax: 1,
    collides: true,
    collisionMask: PHYSICAL_MASK,
    physicsBody: {
      dynamic: spec.dynamic !== false,
      radius: spec.radius || 10,
      mass: spec.mass || 140,
      material: 'debris',
      shape: 'ball',
    },
    data: {
      parentType: 'debris',
      salvagePool: spec.salvagePool,
      salvageTimeLeft: spec.salvageTimeLeft || 14,
      isCommunicator: true,
      scanLabel: spec.scanLabel,
      storyPropKind: spec.storyPropKind,
      tetherable: true,
      coldDerelict: !!spec.coldDerelict,
      hailResponse: spec.hailResponse || null,
    },
  }, role);
}

function chooseGhost(d, live, state, choiceId) {
  if (live.phase !== 'offer') return;
  if (choiceId === 'leave') {
    finish(d, live, state, 'left_cold', 'GHOST SHIP LEFT COLD: the static answer continues without an audience');
    return;
  }
  if (choiceId !== 'hail') return;
  live.phase = 'salvage';
  d.say(live, 'info', 'GHOST SHIP: ...kshh... one carrier, no voice, then your own hail returns.', null, { literal: true });
}

const ghostShip = Object.freeze({
  fire(d, live) {
    const wreck = storyWreck(d, live, {
      pos: { x: live.anchor.x, z: live.anchor.z },
      radius: 13,
      mass: 210,
      dynamic: false,
      coldDerelict: true,
      hailResponse: 'static_loopback',
      scanLabel: 'Cold ghost ship — static hail return',
      storyPropKind: 'rare_ghost_ship',
      salvagePool: { cmdty_salvage_electronics: 3, cmdty_exotic_xenium: 1 },
    }, 'ghost_ship');
    if (!wreck) return d.abort(live, 'spawn_failed');
    live.data.wreckId = wreck.id;
    startOffer(d, live, 'GHOST SHIP REPORTED: a cold hull is answering hails with static');
  },
  tick(d, live, state, now) { timeout(d, live, state, now, chooseGhost); },
  choose: chooseGhost,
  event(d, live, state, name, payload = {}) {
    if (name !== 'entityGone' || payload.id !== live.data.wreckId) return;
    addPersistentStoryCargo(state, `rare_black_box:ghost:${live.id}`);
    finish(d, live, state, 'black_box_recovered', 'GHOST SHIP STRIPPED: one black box and a Xenium trace enter the record');
  },
});

function drifterSpec(live, index) {
  const lane = index - 3;
  const spec = makeShipEntitySpec('ship_drifter', {
    team: 2,
    factionId: 'faction_free',
    pos: {
      x: live.anchor.x - 520 - Math.abs(lane) * 28,
      z: live.anchor.z + lane * 82,
    },
    rot: 0,
    appearance: {
      hullColor: index % 2 ? '#7f9b99' : '#9b8d75',
      accentColor: '#d3e7d0',
      finish: 'worn',
      wear: 0.48,
      decalId: 'frontier',
    },
    fittings: fittingsFromDefaultModules('ship_drifter', []),
    ai: { passive: true },
  });
  spec.vel = { x: 18 + (index % 3) * 2, z: lane * 0.28 };
  spec.data.intent = {
    assistMode: 'newtonian',
    moveZ: 0,
    moveX: 0,
    turnIntent: 0,
    boost: false,
    brake: false,
  };
  spec.data.scanLabel = `Drifter migration shoal ${index + 1}/7`;
  return spec;
}

const drifterMigration = Object.freeze({
  fire(d, live) {
    const plans = Array.from({ length: 7 }, (_, index) => {
      const entitySpec = drifterSpec(live, index);
      return {
        entitySpec,
        role: 'drifter_migrant',
        team: 2,
        factionId: 'faction_free',
        context: 'civilian',
        passive: true,
        pos: entitySpec.pos,
      };
    });
    const ids = d.spawnShips(live, plans);
    if (ids.length < 4) return d.abort(live, 'spawn_cap');
    live.data.migrantIds = ids;
    // This is migration, not seven combat pilots sharing a target selector. Keep each admitted
    // ship on its authored Newtonian crossing vector so tactical AI cannot turn the shoal into a
    // stationary loiter cluster.
    for (const id of ids) {
      const migrant = d.state.entities && d.state.entities.get(id);
      if (migrant && migrant.data) migrant.data.ai = null;
    }
    live.phase = 'migration';
    live.data.completeAt = d.now() + MIGRATION_S;
    news(d, live, 'DRIFTER MIGRATION: a seven-hull shoal is crossing the sector under inertia');
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
  },
  tick(d, live, state, now) {
    if (live.phase !== 'migration' || now < live.data.completeAt) return;
    finish(d, live, state, 'shoal_crossed', 'DRIFTER MIGRATION PASSED: traffic logs keep the seven wakes');
  },
});

function chooseDoubleWreck(d, live, state, choiceId) {
  if (live.phase !== 'offer') return;
  if (choiceId === 'leave') {
    finish(d, live, state, 'left_locked', 'DOUBLE WRECK LEFT: both black boxes continue the same argument');
    return;
  }
  if (choiceId !== 'read') return;
  live.phase = 'salvage';
  d.say(live, 'info', 'BOX A: I held course. BOX B: So did I.', null, { literal: true });
}

const doubleWreck = Object.freeze({
  fire(d, live) {
    const velocity = { x: 3.5, z: -1.2 };
    const first = storyWreck(d, live, {
      pos: { x: live.anchor.x - 8, z: live.anchor.z },
      vel: velocity,
      radius: 11,
      mass: 180,
      angVel: 0.055,
      scanLabel: 'Double Wreck A — courier manifest',
      storyPropKind: 'rare_double_wreck_a',
      salvagePool: { cmdty_scrap_metal: 4, cmdty_electronics: 2 },
    }, 'double_wreck_a');
    const second = storyWreck(d, live, {
      pos: { x: live.anchor.x + 8, z: live.anchor.z },
      vel: velocity,
      radius: 12,
      mass: 195,
      angVel: -0.047,
      scanLabel: 'Double Wreck B — interceptor manifest',
      storyPropKind: 'rare_double_wreck_b',
      salvagePool: { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 3 },
    }, 'double_wreck_b');
    if (!first || !second) return d.abort(live, 'spawn_failed');
    first.data.doubleWreckPartnerId = second.id;
    second.data.doubleWreckPartnerId = first.id;
    first.data.lockedPair = true;
    second.data.lockedPair = true;
    live.data.wreckIds = [first.id, second.id];
    live.data.recoveredWreckIds = [];
    startOffer(d, live, 'DOUBLE WRECK FOUND: two mutually-killed hulls remain locked and tumbling');
  },
  tick(d, live, state, now) { timeout(d, live, state, now, chooseDoubleWreck); },
  choose: chooseDoubleWreck,
  event(d, live, state, name, payload = {}) {
    if (name !== 'entityGone' || !live.data.wreckIds.includes(payload.id)) return;
    if (!live.data.recoveredWreckIds.includes(payload.id)) live.data.recoveredWreckIds.push(payload.id);
    if (live.data.recoveredWreckIds.length < 2) return;
    addPersistentStoryCargo(state, `rare_black_box:double-a:${live.id}`);
    addPersistentStoryCargo(state, `rare_black_box:double-b:${live.id}`);
    finish(d, live, state, 'both_manifests_recovered', 'DOUBLE WRECK READ: both black boxes agree that neither ship turned');
  },
});

function eligibleAces(state, live) {
  const memory = state.aceMemory || {};
  return (live.shape.acePool || []).filter((ace) => ace && ace.returnArchetype
    && !(memory[ace.id] && memory[ace.id].defeated === true));
}

function rendezvousPair(d, live, state) {
  const roster = eligibleAces(state, live);
  if (roster.length < 2) return [];
  const rng = d.stream(live, 'aces-rendezvous-pair');
  const firstIndex = Math.floor(rng() * roster.length) % roster.length;
  let secondIndex = Math.floor(rng() * (roster.length - 1)) % (roster.length - 1);
  if (secondIndex >= firstIndex) secondIndex++;
  return [roster[firstIndex], roster[secondIndex]];
}

function armAces(d, live) {
  armAgainstPlayer(d, live, ['rendezvous_ace']);
  live.phase = 'combat';
  live.data.escapeAt = d.now() + ACE_COMBAT_S;
}

function chooseAces(d, live, state, choiceId) {
  if (live.phase !== 'offer') return;
  if (choiceId === 'observe') {
    finish(d, live, state, 'trade_completed', 'ACES RENDEZVOUS OBSERVED: two named crews completed the exchange');
    return;
  }
  if (choiceId !== 'interrupt') return;
  armAces(d, live);
  d.say(live, 'alert', 'TWO ACE LOCKS: both crews break from the trade at once.', null, { literal: true });
}

const acesRendezvous = Object.freeze({
  fire(d, live, state) {
    const pair = rendezvousPair(d, live, state);
    if (pair.length !== 2) return d.abort(live, 'ace_pool_empty');
    const plans = pair.map((ace, index) => ({
      archetype: ace.returnArchetype,
      level: ace.baseReturnLevel + 2,
      role: 'rendezvous_ace',
      team: 2,
      factionId: ace.factionId,
      context: 'encounter',
      passive: true,
      namedAceId: ace.id,
      bossName: ace.name,
      bountyCr: 6_500 + index * 1_500,
      pos: {
        x: live.anchor.x + (index === 0 ? -70 : 70),
        z: live.anchor.z + (index === 0 ? -25 : 25),
      },
    }));
    const ids = d.spawnShips(live, plans);
    if (ids.length !== 2) return d.abort(live, 'spawn_cap');
    live.data.aceIds = pair.map((ace) => ace.id);
    live.data.aceByEntity = Object.fromEntries(ids.map((id, index) => [id, pair[index].id]));
    live.data.defeatedAceIds = [];
    for (let index = 0; index < ids.length; index++) {
      d.emit('namedAce:appeared', {
        aceId: pair[index].id,
        entityId: ids[index],
        encounterId: live.id,
        sectorId: live.sectorId,
        signatureSpoken: false,
      });
    }
    startOffer(d, live, `ACES RENDEZVOUS: ${pair[0].name} and ${pair[1].name} are trading in open space`);
  },
  tick(d, live, state, now) {
    timeout(d, live, state, now, chooseAces);
    if (live.phase !== 'combat' || now < live.data.escapeAt) return;
    for (const [entityId, aceId] of Object.entries(live.data.aceByEntity)) {
      const entity = state.entities && state.entities.get(Number(entityId));
      if (entity && entity.alive !== false && !live.data.defeatedAceIds.includes(aceId)) {
        d.emit('namedAce:fled', { aceId, entityId: entity.id, encounterId: live.id, sectorId: live.sectorId });
      }
    }
    finish(d, live, state, 'aces_escaped', 'ACES RENDEZVOUS BROKEN: surviving crews escaped on separate burns');
  },
  choose: chooseAces,
  event(d, live, state, name, payload = {}) {
    if (name === 'playerHitSquad' && live.phase === 'offer') {
      chooseAces(d, live, state, 'interrupt');
      return;
    }
    if (name !== 'squadKill' || payload.role !== 'rendezvous_ace') return;
    const aceId = live.data.aceByEntity[payload.id];
    if (!aceId || live.data.defeatedAceIds.includes(aceId)) return;
    live.data.defeatedAceIds.push(aceId);
    d.emit('namedAce:defeated', {
      aceId,
      entityId: payload.id,
      encounterId: live.id,
      sectorId: live.sectorId,
      byPlayer: !!payload.byPlayer,
    });
    if (live.data.defeatedAceIds.length === 2) {
      finish(d, live, state, 'double_bounty', 'ACES RENDEZVOUS ENDED: both named bounties cleared in one contact');
    }
  },
});

export const RARE_SPAWN_RUNTIMES = Object.freeze({
  goldAsteroid,
  merchantPrince,
  ghostShip,
  drifterMigration,
  doubleWreck,
  acesRendezvous,
});
