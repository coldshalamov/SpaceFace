import { getCombatKernel } from '../../combat/kernel.js';
import { scalarHitToDamagePacket } from '../../combat/damage.js';
import { deliverPhysicalImpulse } from '../../combat/physicalEffects.js';
import { occupantGenerationOf } from '../../core/entity.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, resolvePhysicsBodySpec } from '../../core/physicsAuthority.js';
import { PINNED_STATUS_ID } from '../../data/combatDefs.js';
import { makeShipEntitySpec } from '../../systems/ships.js';
import { createTowjawController } from './controller.js';
import { TOWJAW, TOWJAW_MECHANISMS } from './catalog.js';
import { armorIntercept, encounterLayout, finite, limitVector, mechanismPosition, pointInAttack, validPoint } from './geometry.js';
import { interceptTowjawDamage, registerTowjawDamageRoute } from './damageBridge.js';
import { createTowjawPresentation } from './presentation.js';

const SCHEMA = 1;
const MAX_BODIES = 16;
const MAX_SHOT_S = 3.4;
const ACTIVE = new WeakMap();
const CLOCKS = new WeakSet();
const KEYS = Object.freeze(['jaw', 'winch', 'drive']);
const clone = value => JSON.parse(JSON.stringify(value));
const keyFor = (encounterId, slot) => `${encounterId}/${slot}`;
const activeBody = entity => !!entity && entity.alive !== false && Number(entity.hull) > 0 && validPoint(entity.pos);
const sectorOf = state => state.world?.currentSectorId ?? null;

function remapControllerIds(snapshot, before, after) {
  const ids = new Map();
  for (let i = 0; i < before.length; i++) {
    if (before[i].id == null) continue;
    ids.set(before[i].id, after[i].id ?? `towjaw-lost:${before[i].key}`);
  }
  const map = id => ids.has(id) ? ids.get(id) : id;
  const result = clone(snapshot);
  result.bossId = map(result.bossId);
  result.mechanismIds = Object.fromEntries(KEYS.map(key => [key, map(result.mechanismIds?.[key])]));
  for (const field of ['eligibleIds', 'spentIds', 'lostIds']) {
    result[field] = (Array.isArray(result[field]) ? result[field] : []).slice(0, TOWJAW.maxTracked).map(map);
  }
  for (const field of ['armor', 'released']) {
    result[field] = (Array.isArray(result[field]) ? result[field] : []).slice(0, TOWJAW.maxTracked)
      .map(row => ({ ...row, id: map(row.id) }));
  }
  // All casts are cancelled by controller.restore. Keep the serialized shape
  // finite but never reinterpret old projectile/world geometry as a fresh cast.
  return result;
}

/** Body identity includes a durable authored slot AND the current occupant. An
 * ID reused by a civilian can never become scrap, armor, a mount, or a victim. */
function matches(entity, record, binding) {
  return !!entity && !!binding && entity.id === binding.id
    && entity.data?.towjaw?.encounterId === record.encounterId
    && entity.data.towjaw.key === binding.key
    && entity.data.towjaw.role === binding.role
    && entity.data.towjaw.sectorId === record.sectorId
    && occupantGenerationOf(entity) === binding.generation;
}

function sweptContact(from, to, point, radius) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length2)) : 0;
  return Math.hypot(from.x + dx * t - point.x, from.z + dz * t - point.z) <= radius;
}

function isPinned(state, entity) {
  const status = state.combat?.entities?.[String(entity.id)]?.statuses?.[PINNED_STATUS_ID];
  return !!status && Number(status.expiresTick) > finite(state.tick);
}

function playerHolds(state, entity) {
  const player = state.entities?.get(state.playerId);
  if (!player) return false;
  const rows = state.combat?.attachments?.byId || {};
  // The game's attachment registry is already bounded. Stop at 128 to keep a
  // corrupted imported registry from making this optional encounter a hot loop.
  let walked = 0;
  for (const id in rows) {
    if (++walked > 128) break;
    const row = rows[id];
    if (!row || row.state !== 'active') continue;
    const held = row.ownerId === player.id && row.targetId === entity.id;
    const reversed = row.targetId === player.id && row.ownerId === entity.id;
    if (!held && !reversed) continue;
    const bodyGen = held ? row.targetGeneration : row.ownerGeneration;
    const playerGen = held ? row.ownerGeneration : row.targetGeneration;
    if (bodyGen != null && bodyGen !== occupantGenerationOf(entity)) continue;
    if (playerGen != null && playerGen !== occupantGenerationOf(player)) continue;
    return true;
  }
  return false;
}

function observe(state, entity, extras = {}) {
  if (!entity) return null;
  const physics = resolvePhysicsBodySpec(entity);
  return { id: entity.id, pos: { x: finite(entity.pos?.x), z: finite(entity.pos?.z) },
    vel: { x: finite(entity.vel?.x), z: finite(entity.vel?.z) }, rot: finite(entity.rot),
    angVel: finite(entity.angVel), mass: physics?.mass ?? entity.mass, inertiaY: physics?.inertiaY,
    radius: finite(entity.radius, 1), hull: finite(entity.hull), hullMax: finite(entity.hullMax),
    alive: activeBody(entity), pinned: isPinned(state, entity), playerHeld: playerHolds(state, entity), ...extras };
}

function ownedData(encounterId, slot, role, sectorId) {
  return {
    towjaw: { schemaVersion: SCHEMA, encounterId, key: keyFor(encounterId, slot), role, sectorId },
    encounterId, encounter: true, missionPinned: true,
    // missionPinned is the existing kill-reward reservation. This encounter owns
    // a physical salvage outcome, so generic bounty/shard writers must not pay it.
    loot: [], bountyCr: 0, lootTableId: null,
    masslineTetherable: true, scanLabel: role === 'boss' ? 'TOWJAW' : role,
  };
}

/** New specs only. Reuses the Forge-authored yard tug and normal packaged wreck
 * body resolver. Runtime never manufactures mesh bodies or changes live mass. */
export function buildTowjawSpawnSpecs({ encounterId, sectorId, origin, heading = 0, seed = 4242 }) {
  if (!encounterId || sectorId !== TOWJAW.sectorId || !validPoint(origin)) throw new TypeError('TOWJAW needs its Vesta field anchor');
  const layout = encounterLayout(origin, heading, 9, seed);
  const boss = makeShipEntitySpec(TOWJAW.bossShipId, { pos: origin, rot: heading,
    team: 1, factionId: 'faction_reach', ai: { passive: true, lawful: false,
      motive: 'salvage_predation', engagementTrigger: 'towjaw_accepted', roe: 'hold_fire' } });
  Object.assign(boss, { radius: 24, mass: 420, hull: 420, hullMax: 420,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    shieldRegenRate: 0, drag: 0.08, maxSpeed: 110, turnRate: 0, thrust: 0 });
  boss.physicsBody = { schemaVersion: 1, shape: 'capsule', mass: 420, dynamic: true };
  boss.flags = { ...boss.flags, persistent: true };
  boss.data = { ...boss.data, ...ownedData(encounterId, 'boss', 'boss', sectorId),
    weapons: [], miningBeam: null, intent: null, shipClass: 'heavy' };
  const rows = [{ slot: 'boss', role: 'boss', spec: boss }];
  for (const key of KEYS) {
    const def = TOWJAW_MECHANISMS[key];
    rows.push({ slot: key, role: key, spec: { type: 'wreck', team: 1,
      pos: layout.mechanisms[key], radius: def.radius, mass: 10,
      hull: def.hull, hullMax: def.hull, collides: true,
      physicsBody: { schemaVersion: 1, shape: 'capsule', mass: 10, dynamic: true },
      flags: { persistent: true }, data: { ...ownedData(encounterId, key, key, sectorId),
        parentType: 'debris', scanLabel: def.label, salvagePool: {}, salvageTimeLeft: 20,
        proportions: { length: 1.2, width: 0.8, height: 0.6 } } } });
  }
  layout.scrap.forEach((item, index) => {
    // Two exposed cargo modules are genuine collectible cargo; the other seven
    // are salvageable wrecks. Both remain the original body when used as armor.
    const cargo = index >= 7;
    rows.push({ slot: `scrap_${index}`, role: 'scrap', spec: {
      type: cargo ? 'pickup' : 'wreck', team: 1,
      pos: { x: item.x, z: item.z }, vel: { x: item.vx, z: item.vz }, rot: heading + index * 0.63,
      radius: item.radius, mass: item.mass, hull: 44, hullMax: 44, collides: true,
      physicsBody: { schemaVersion: 1, shape: cargo ? 'ball' : 'capsule', material: 'debris', mass: item.mass, dynamic: true },
      flags: { persistent: true }, data: { ...ownedData(encounterId, `scrap_${index}`, 'scrap', sectorId),
        parentType: 'debris', scanLabel: cargo ? 'Loose scrap freight' : 'Salvage plate',
        ...(cargo ? { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 }
          : { salvagePool: { cmdty_scrap_metal: 2 }, authoredSalvagePool: { cmdty_scrap_metal: 2 }, salvageTimeLeft: 6 }),
        proportions: { length: 1.5, width: 0.9, height: 0.6 } },
    } });
  });
  return rows;
}

/** Real production ports: core helpers, the per-state combat kernel, and the
 * physics command membrane. A fresh runtime is inert until explicit start. */
export function createTowjawRuntime(ctx = {}) {
  const { state, bus, helpers = {} } = ctx;
  if (!state?.entities || typeof helpers.spawnEntity !== 'function' || typeof helpers.removeEntity !== 'function') {
    throw new TypeError('TOWJAW requires core spawnEntity/removeEntity helpers and state.entities');
  }
  let record = null, controller = null, unregisterDamage = null, stopped = false;
  let lastTick = null, lastTime = null, stepping = false;
  const unsubs = [];
  const previous = new Map();
  const launched = new Map();
  let pendingHits = [];
  let previousPlayer = null;
  let presentation = ctx.presentation || null;

  const entityFor = binding => record && binding && matches(state.entities.get(binding.id), record, binding)
    ? state.entities.get(binding.id) : null;
  const bindingForId = id => record?.bindings.find(row => row.id != null && row.id === id && !row.tombstone) || null;
  const bodyForId = id => entityFor(bindingForId(id));
  const bossEntity = () => entityFor(record?.bindings.find(row => row.role === 'boss'));

  function world() {
    if (!record) return null;
    const boss = observe(state, bossEntity());
    const mechanisms = {};
    for (const key of KEYS) mechanisms[key] = observe(state, entityFor(record.bindings.find(row => row.role === key)));
    return { simTime: finite(state.simTime), sectorId: sectorOf(state), boss,
      player: observe(state, state.entities.get(state.playerId)), mechanisms,
      debris: record.bindings.filter(row => row.role === 'scrap').map(row => observe(state, entityFor(row), { eligible: true })).filter(Boolean),
      hits: pendingHits.splice(0, 24) };
  }

  function getView() {
    if (!record) return null;
    // Observation must not consume queued contact evidence on presentation reads.
    const saved = pendingHits; pendingHits = [];
    const observation = world(); pendingHits = saved;
    return { ...(controller?.getView() || {}), encounterId: record.encounterId,
      outcome: record.outcome, stopped, world: observation };
  }

  function incoming(input) {
    if (!record || stopped || !input || input.targetId == null) return input;
    const target = bodyForId(input.targetId);
    if (!target || target.alive === false) return input;
    const binding = bindingForId(target.id);
    let targetId = target.id, hitPosition = input.packet?.hit?.pos || target.pos;
    if (input.origin?.kind !== 'mechanisms-disabled' && (binding.role === 'boss' || KEYS.includes(binding.role))) {
      const attacker = state.entities.get(input.attackerId);
      const approach = input.packet?.hit?.approach;
      const approachLength = validPoint(approach) ? Math.hypot(approach.x, approach.z) : 0;
      const from = approachLength > 0
        ? { x: hitPosition.x - approach.x / approachLength * 300, z: hitPosition.z - approach.z / approachLength * 300 }
        : validPoint(attacker?.pos) ? attacker.pos : null;
      if (from && validPoint(hitPosition)) {
        const armor = (controller?.getView().armor || [])
          .filter(row => row.status === 'latched').map(row => bodyForId(row.id)).filter(activeBody);
        const intercepted = armorIntercept({ from, to: hitPosition, armor });
        if (intercepted) { targetId = intercepted.id; hitPosition = intercepted.point; }
        else if (binding.role === 'boss') {
          // A shot crossing a real exposed mechanism hits that piece first.
          const mechanisms = KEYS.map(key => entityFor(record.bindings.find(row => row.role === key))).filter(activeBody);
          const mechanismHit = armorIntercept({ from, to: hitPosition, armor: mechanisms });
          if (mechanismHit) { targetId = mechanismHit.id; hitPosition = mechanismHit.point; }
        }
      }
    }
    const packet = { ...(input.packet || {}), hit: { ...(input.packet?.hit || {}),
      pos: { x: finite(hitPosition.x), z: finite(hitPosition.z) } },
      flags: { ...(input.packet?.flags || {}), allowAnyTarget: true } };
    return { ...input, targetId, packet };
  }

  function routeDamage(input) {
    // This is useful for integration tests and encounter-generated physical
    // contacts. The central hook uses the same bridge for ordinary player fire.
    return getCombatKernel(ctx).routeDamage(interceptTowjawDamage(state, input));
  }

  function bindRuntime() {
    if (ACTIVE.has(state) && ACTIVE.get(state) !== api) throw new Error('TOWJAW already active in this state');
    ACTIVE.set(state, api);
    unregisterDamage = registerTowjawDamageRoute(state, incoming);
    if (bus?.on) {
      unsubs.push(bus.on('encounter:resolved', event => {
        if (event?.encounterId === record?.encounterId && !stopped) dispose('director_resolved', { preserveSalvage: true });
      }));
      unsubs.push(bus.on('sector:enter', () => {
        if (record && sectorOf(state) !== record.sectorId) dispose('sector_exit', { preserveSalvage: true });
      }));
      // Save owner restores entities before rehydrating this adapter. The old
      // process-local generations are not authority over those restored bodies.
      unsubs.push(bus.on('save:loaded', () => dispose('save_rebind', { retireBodies: false })));
      unsubs.push(bus.on('game:started', () => dispose('new_game', { retireBodies: false })));
    }
  }

  function start(options = {}) {
    if (record) return { ok: false, reason: 'already_issued', encounterId: record.encounterId };
    if (ACTIVE.has(state)) return { ok: false, reason: 'already_active' };
    if (state.story?.flags?.towjawIssued) return { ok: false, reason: 'already_issued' };
    const encounterId = String(options.encounterId || '').slice(0, 160);
    const sectorId = options.sectorId || sectorOf(state);
    if (!encounterId || sectorId !== TOWJAW.sectorId || sectorOf(state) !== sectorId || !validPoint(options.origin)) {
      return { ok: false, reason: 'wrong_sector_or_anchor' };
    }
    const player = state.entities.get(state.playerId);
    if (!activeBody(player) || state.ui?.docked || player.flags?.docked) return { ok: false, reason: 'player_unavailable' };
    if (Math.hypot(player.pos.x - options.origin.x, player.pos.z - options.origin.z) < 180) return { ok: false, reason: 'unsafe_player_proximity' };
    const nearby = typeof helpers.queryRadius === 'function' ? helpers.queryRadius(options.origin, 220) : [];
    if (nearby.some(body => activeBody(body) && (body.type === 'station' || body.type === 'gate'
      || body.type === 'ship' && body.team !== 1))) return { ok: false, reason: 'occupied_anchor' };
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : state.meta?.seed >>> 0;
    record = { schemaVersion: SCHEMA, encounterId, sectorId, seed,
      origin: { x: options.origin.x, z: options.origin.z }, heading: finite(options.heading),
      bindings: [], issued: true, outcome: null, rewardClaimed: false, startedAt: finite(state.simTime) };
    state.story ||= { flags: {} }; state.story.flags ||= {};
    state.story.flags.towjawIssued = encounterId;
    // Reserve the issue before the first synchronous entity:spawned callback.
    try {
      const specs = buildTowjawSpawnSpecs(record);
      if (specs.length > MAX_BODIES) throw new Error('TOWJAW body cap exceeded');
      for (const row of specs) {
        const entity = helpers.spawnEntity(row.spec);
        if (!entity || entity.id == null) throw new Error(`TOWJAW spawn failed: ${row.slot}`);
        record.bindings.push({ id: entity.id, issuedId: entity.id, key: row.spec.data.towjaw.key,
          role: row.role, generation: occupantGenerationOf(entity) });
      }
      controller = createTowjawController({ ...record, bossId: bossEntity().id,
        mechanismIds: Object.fromEntries(KEYS.map(key => [key, record.bindings.find(row => row.role === key).id])),
        eligibleIds: record.bindings.filter(row => row.role === 'scrap').map(row => row.id) });
      bindRuntime();
      return { ok: true, encounterId, bossId: bossEntity().id, ids: record.bindings.map(row => row.id) };
    } catch (error) {
      record.outcome = 'spawn_failed';
      dispose('spawn_failed');
      return { ok: false, reason: 'spawn_failed', detail: String(error.message).slice(0, 180) };
    }
  }

  function moveMounts(dt, observation) {
    const boss = bossEntity();
    if (!activeBody(boss)) return;
    for (const key of KEYS) {
      const entity = entityFor(record.bindings.find(row => row.role === key));
      if (!activeBody(entity) || isPinned(state, entity) || playerHolds(state, entity)) continue;
      const anchor = mechanismPosition(observation.boss, key);
      const dx = anchor.x - entity.pos.x, dz = anchor.z - entity.pos.z;
      // A torn-off jaw remains a real loose object; the winch cannot teleport it home.
      if (Math.hypot(dx, dz) > 45) continue;
      const force = limitVector((dx * 11 + (boss.vel.x - entity.vel.x) * 5) * entity.mass,
        (dz * 11 + (boss.vel.z - entity.vel.z) * 5) * entity.mass, 7000);
      queuePhysicsImpulse(entity, { x: force.x * dt, y: 0, z: force.z * dt }, { tag: 'towjaw_mount', actorId: boss.id });
      queuePhysicsImpulse(boss, { x: -force.x * dt, y: 0, z: -force.z * dt }, { tag: 'towjaw_mount_reaction' });
    }
  }

  function damage(target, amount, reason, ownerId = bossEntity()?.id) {
    if (!activeBody(target) || !(amount > 0)) return null;
    const failure = reason === 'mechanisms-disabled' && target.id === bossEntity()?.id;
    const packet = scalarHitToDamagePacket({ damage: Math.min(failure ? 5000 : 100, amount), damageType: 'kinetic',
      pos: target.pos, source: { kind: reason } });
    // Only explicitly selected, matching TOWJAW pieces or the player are valid.
    if (bodyForId(target.id)) packet.flags = { allowAnyTarget: true };
    if (reason === 'stolen-scrap' || failure) packet.flags = { ...packet.flags, ignoreFriendlyFire: true };
    return routeDamage({ targetId: target.id, attackerId: ownerId,
      packet, origin: { kind: reason, id: record.encounterId } });
  }

  function execute(command, dt) {
    if (!command || !record || stopped) return;
    const entity = bodyForId(command.entityId);
    switch (command.type) {
      case 'force':
      case 'impulse': {
        const target = entity || (command.entityId === state.playerId ? state.entities.get(state.playerId) : null);
        if (!activeBody(target)) return;
        const v = limitVector(finite(command.x), finite(command.z), command.type === 'force' ? TOWJAW.maxForce : TOWJAW.maxImpulse);
        const scale = command.type === 'force' ? dt : 1;
        if (target.id === state.playerId) deliverPhysicalImpulse(state, target, { x: v.x * scale, z: v.z * scale },
          { actorId: bossEntity()?.id, tag: 'towjaw_grapple', tick: state.tick },
          { scaleEnvironment: false, continuous: command.type === 'force', dt });
        else queuePhysicsImpulse(target, { x: v.x * scale, y: 0, z: v.z * scale }, { tag: `towjaw_${command.reason || 'force'}` });
        break;
      }
      case 'torque':
        if (activeBody(entity)) queuePhysicsTorqueImpulse(entity,
          { x: 0, y: Math.max(-30000, Math.min(30000, finite(command.y))) * dt, z: 0 }, { tag: 'towjaw_heading' });
        break;
      case 'damage': {
        const target = bodyForId(command.targetId) || (command.targetId === state.playerId ? state.entities.get(state.playerId) : null);
        damage(target, command.amount, command.reason || 'towjaw_attack', command.sourceId ?? bossEntity()?.id);
        break;
      }
      case 'launchScrap': {
        if (!activeBody(entity) || bindingForId(entity.id)?.role !== 'scrap') return;
        const wanted = command.velocity;
        if (!validPoint(wanted)) return;
        const delta = limitVector((wanted.x - entity.vel.x) * entity.mass, (wanted.z - entity.vel.z) * entity.mass, TOWJAW.maxImpulse);
        queuePhysicsImpulse(entity, { ...delta, y: 0 }, { tag: 'towjaw_scrap_shotgun', actorId: bossEntity()?.id });
        const attack = controller.getView().attack;
        const ammoIndex = attack?.ammo?.findIndex(row => row.id === entity.id) ?? -1;
        const lane = ammoIndex >= 0 ? attack?.shapes?.[ammoIndex] : null;
        launched.set(entity.id, { generation: occupantGenerationOf(entity),
          until: Math.min(finite(state.simTime) + MAX_SHOT_S, finite(command.expiresAt, finite(state.simTime))),
          hit: false, lane: lane ? clone(lane) : null });
        break;
      }
      case 'release':
        // A clamp is only this controller's spring. Releasing it never calls the
        // Massline break API and never writes the existing body's mass/velocity.
        break;
      case 'outcome':
        settle(command.outcome, command.rewardEligible === true);
        break;
      default: break;
    }
  }

  function contacts(observation) {
    const player = state.entities.get(state.playerId);
    const winch = entityFor(record.bindings.find(row => row.role === 'winch'));
    for (const body of observation.debris) {
      const old = previous.get(body.id) || body.pos;
      const shot = launched.get(body.id);
      if (shot && (shot.until < state.simTime || shot.generation !== occupantGenerationOf(bodyForId(body.id)))) launched.delete(body.id);
      else if (shot && !shot.hit && activeBody(player)) {
        const lastPlayer = previousPlayer || player.pos;
        const crossed = sweptContact({ x: old.x - lastPlayer.x, z: old.z - lastPlayer.z },
          { x: body.pos.x - player.pos.x, z: body.pos.z - player.pos.z }, { x: 0, z: 0 }, player.radius + body.radius);
        const overlapping = Math.hypot(player.pos.x - body.pos.x, player.pos.z - body.pos.z) <= player.radius + body.radius;
        if ((crossed || overlapping) && shot.lane && pointInAttack(shot.lane, player.pos, player.radius)) {
          shot.hit = true;
          damage(player, 9, 'towjaw_scrap_impact');
        }
      }
      // A stolen or loose owned piece can disable an exposed feed winch. Native
      // contacts may already have caused damage; this records the physical stunt
      // once per crossing, so standing overlaps do not become a damage sprinkler.
      const plate = controller.getView().armor?.find(row => row.id === body.id);
      if (activeBody(winch) && plate?.status !== 'latched' && !launched.has(body.id)) {
        const radius = winch.radius + body.radius;
        const outside = Math.hypot(old.x - winch.pos.x, old.z - winch.pos.z) > radius;
        const crossed = sweptContact(old, body.pos, winch.pos, radius);
        const speed = Math.hypot(body.vel.x - winch.vel.x, body.vel.z - winch.vel.z);
        if (outside && crossed && speed >= TOWJAW.thrownScrapMinSpeed) {
          pendingHits.push({ mechanism: 'winch', bodyId: body.id, relativeSpeed: speed });
        }
      }
      previous.set(body.id, { ...body.pos });
    }
    previousPlayer = activeBody(player) ? { x: player.pos.x, z: player.pos.z } : null;
  }

  function settle(outcome, rewardEligible) {
    if (!record || record.outcome) return;
    record.outcome = outcome === 'defeat' ? 'defeat' : 'retreat';
    record.rewardClaimed = record.rewardClaimed || rewardEligible;
    // Reward is the nine existing physical bodies and their finite cargo/pools.
    // There is no second loot burst, credit grant, or remint on restoration.
    if (state.story?.flags) state.story.flags.towjawOutcome = record.outcome;
    dispose(record.outcome, { preserveSalvage: true });
  }

  function step(dt) {
    if (!record || stopped || !controller || stepping || !(dt > 0) || !Number.isFinite(dt)) return { commands: [], events: [], state: getView() };
    if (lastTick === state.tick && lastTime === state.simTime) return { commands: [], events: [], state: getView() };
    lastTick = state.tick; lastTime = state.simTime;
    if (sectorOf(state) !== record.sectorId) { dispose('sector_exit', { preserveSalvage: true }); return { commands: [], events: [], state: getView() }; }
    stepping = true;
    try {
      const observation = world();
      contacts(observation);
      observation.hits.push(...pendingHits.splice(0, 24));
      const result = controller.step(dt, observation);
      moveMounts(Math.min(dt, TOWJAW.maxStepS), observation);
      for (const command of result.commands.slice(0, TOWJAW.maxCommands)) execute(command, Math.min(dt, TOWJAW.maxStepS));
      presentation?.onEvents(result.events.slice(0, TOWJAW.maxEvents), getView());
      return { ...result, state: getView() };
    } finally { stepping = false; if (stopped) presentation?.destroy?.(); }
  }

  function snapshot() {
    if (!record) return null;
    const bindings = record.bindings.map(row => activeBody(entityFor(row)) ? { ...row }
      : { ...row, id: null, tombstone: true, generation: -1 });
    const controllerSave = controller?.snapshot() || null;
    return { ...clone(record), bindings,
      controller: controllerSave ? remapControllerIds(controllerSave, record.bindings, bindings) : null,
      // A restored round already in flight never gains a fresh damage allowance.
      launched: [...launched.entries()].slice(0, 6).map(([id, row]) => ({ id, until: row.until, hit: row.hit, lane: row.lane })) };
  }

  function restore(saved) {
    if (record || ACTIVE.has(state)) return { ok: false, reason: 'already_active' };
    if (saved?.schemaVersion !== SCHEMA || !saved.issued || saved.sectorId !== TOWJAW.sectorId
      || !validPoint(saved.origin) || !Array.isArray(saved.bindings) || saved.bindings.length > MAX_BODIES
      || typeof saved.encounterId !== 'string' || saved.encounterId.length > 160 || !saved.encounterId || !saved.controller) return { ok: false, reason: 'invalid_snapshot' };
    const uniqueKeys = new Set(), uniqueIds = new Set();
    for (const row of saved.bindings) {
      if (!row || !(Number.isSafeInteger(row.id) && row.id > 0 || row.id === null && row.tombstone === true) || typeof row.key !== 'string'
        || uniqueKeys.has(row.key) || row.id != null && uniqueIds.has(row.id)
        || !['boss', 'scrap', ...KEYS].includes(row.role)
        || !row.key.startsWith(`${saved.encounterId}/`)
        || row.role === 'scrap' && !/^scrap_[0-8]$/.test(row.key.slice(saved.encounterId.length + 1))
        || row.role !== 'scrap' && row.key !== keyFor(saved.encounterId, row.role)) return { ok: false, reason: 'invalid_bindings' };
      uniqueKeys.add(row.key); if (row.id != null) uniqueIds.add(row.id);
    }
    if (['boss', ...KEYS].some(role => saved.bindings.filter(row => row.role === role).length !== 1)) return { ok: false, reason: 'missing_binding' };
    const savedBoss = saved.bindings.find(row => row.role === 'boss');
    if (saved.controller.schemaVersion !== SCHEMA || saved.controller.encounterId !== saved.encounterId
      || saved.controller.sectorId !== saved.sectorId
      || savedBoss.id != null && saved.controller.bossId !== savedBoss.id) return { ok: false, reason: 'invalid_controller_snapshot' };
    record = clone({ ...saved, controller: undefined, launched: undefined });
    const matchesByKey = new Map();
    for (const entity of state.entities.values()) {
      if (entity.data?.towjaw?.encounterId !== record.encounterId) continue;
      const key = entity.data.towjaw.key;
      if (matchesByKey.has(key)) { record.outcome = 'invalid_restore'; stopped = true; presentation?.destroy?.(); return { ok: false, reason: 'duplicate_slot' }; }
      matchesByKey.set(key, entity);
    }
    record.bindings = record.bindings.map(row => {
      const entity = matchesByKey.get(row.key);
      // A dead/missing slot is a tombstone. We never call spawnEntity in restore.
      return row.tombstone !== true && row.id != null && entity && activeBody(entity)
        && entity.data.towjaw.role === row.role && entity.data.towjaw.sectorId === record.sectorId
        ? { ...row, id: entity.id, generation: occupantGenerationOf(entity) }
        : { ...row, id: null, tombstone: true, generation: -1 };
    });
    state.story ||= { flags: {} }; state.story.flags ||= {};
    state.story.flags.towjawIssued ||= record.encounterId;
    if (record.outcome || sectorOf(state) !== record.sectorId || !bossEntity()) {
      record.outcome ||= 'lost'; stopped = true;
      presentation?.destroy?.();
      return { ok: true, terminal: true, outcome: record.outcome };
    }
    controller = createTowjawController({ ...record,
      bossId: bossEntity().id, mechanismIds: Object.fromEntries(KEYS.map(key => [key, record.bindings.find(row => row.role === key)?.id ?? null])),
      eligibleIds: record.bindings.filter(row => row.role === 'scrap' && row.id != null).map(row => row.id) });
    const remappedController = remapControllerIds(saved.controller, saved.bindings, record.bindings);
    if (!controller.restore(remappedController, world())) {
      record.outcome = 'invalid_restore'; stopped = true; controller.stop('invalid_restore');
      presentation?.destroy?.();
      return { ok: false, reason: 'invalid_controller_snapshot' };
    }
    for (const row of (saved.launched || []).slice(0, 6)) {
      const oldBinding = saved.bindings.find(binding => binding.id === row.id);
      const newBinding = oldBinding && record.bindings.find(binding => binding.key === oldBinding.key);
      const entity = entityFor(newBinding);
      if (entity && Number.isFinite(row.until) && row.until > state.simTime) launched.set(entity.id,
        { generation: occupantGenerationOf(entity), until: row.until, hit: true, lane: row.lane || null });
    }
    bindRuntime();
    return { ok: true, terminal: false, bossId: bossEntity().id };
  }

  function dispose(reason = 'disposed', options = {}) {
    if (stopped) return false;
    stopped = true;
    if (record && !record.outcome) record.outcome = reason;
    controller?.stop(reason);
    unregisterDamage?.(); unregisterDamage = null;
    for (const off of unsubs.splice(0)) if (typeof off === 'function') off();
    if (ACTIVE.get(state) === api) ACTIVE.delete(state);
    if (record && options.retireBodies !== false) {
      for (const binding of record.bindings) {
        const entity = entityFor(binding);
        if (!entity) continue;
        if (options.preserveSalvage && binding.role === 'scrap') continue;
        helpers.removeEntity(entity.id);
      }
    }
    launched.clear(); previous.clear(); previousPlayer = null; pendingHits = [];
    if (!stepping) presentation?.destroy?.();
    return true;
  }

  function setPresentation(adapter) {
    if (adapter != null && typeof adapter.onEvents !== 'function') throw new TypeError('TOWJAW presentation requires onEvents');
    presentation?.destroy?.();
    presentation = adapter;
  }
  if (!presentation) presentation = createTowjawPresentation({ state, bus, getSnapshot: getView });
  const api = Object.freeze({ start, step, getView, snapshot, restore, dispose, routeDamage, setPresentation });
  return api;
}

export function getActiveTowjawRuntime(state) { return ACTIVE.get(state) || null; }

export function isTowjawClockInstalled(state) { return CLOCKS.has(state); }

/** Register on the fixed pre-physics clock, NOT the calendar encounter director
 * (that owner ticks its scripts at 1 Hz). Save rebind waits until the first fixed
 * tick after all native entity owners have restored their bodies. */
export function createTowjawSystem() {
  let ctx = null, pending = null, off = null;
  return {
    name: 'towjaw',
    init(context) {
      ctx = context; CLOCKS.add(context.state);
      off?.();
      off = context.bus?.on?.('game:new', () => {
        pending = null;
        ACTIVE.get(context.state)?.dispose('new_game', { retireBodies: false });
      });
    },
    update(dt, state = ctx?.state) {
      if (!ctx || state !== ctx.state || !(dt > 0) || state.mode !== 'flight') return;
      if (pending) {
        const saved = pending; pending = null;
        const runtime = createTowjawRuntime(ctx);
        const result = runtime.restore(saved);
        if (!result.ok) runtime.dispose('invalid_restore', { retireBodies: false });
      }
      return ACTIVE.get(state)?.step(dt);
    },
    serialize() { return ctx ? ACTIVE.get(ctx.state)?.snapshot() || pending || null : null; },
    deserialize(saved) {
      if (!ctx) return;
      ACTIVE.get(ctx.state)?.dispose('save_rebind', { retireBodies: false });
      pending = saved && typeof saved === 'object' ? clone(saved) : null;
    },
    newGame() {
      pending = null;
      if (ctx) ACTIVE.get(ctx.state)?.dispose('new_game', { retireBodies: false });
    },
    destroy() {
      off?.(); off = null; pending = null;
      if (ctx) { ACTIVE.get(ctx.state)?.dispose('system_destroyed'); CLOCKS.delete(ctx.state); }
      ctx = null;
    },
  };
}
