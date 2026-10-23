import { TOWJAW, TOWJAW_ATTACKS, TOWJAW_MECHANISMS, TOWJAW_SLOTS } from './catalog.js';
import { attackGeometry, clamp, compareIds, distance, finite, grappleSweepShape,
  isMechanismCovered, limitVector, mechanismPosition, pointInAttack, slotPosition,
  sweptInAttack, validPoint, wrapAngle } from './geometry.js';

const KEYS = Object.keys(TOWJAW_MECHANISMS);
const PHASES = new Set(['approach', 'scavenge', 'commit', 'attack', 'exposed', 'recover', 'retreat', 'done']);
const copy = value => JSON.parse(JSON.stringify(value));
const live = body => !!body && body.alive !== false && validPoint(body.pos) && !(Number.isFinite(body.hull) && body.hull <= 0);
const validId = id => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
  || typeof id === 'string' && id.length > 0 && id.length <= 160;
const cleanIds = ids => [...new Set((Array.isArray(ids) ? ids : []).filter(validId))].slice(0, TOWJAW.maxTracked);
const velocity = body => ({ x: finite(body?.vel?.x), z: finite(body?.vel?.z) });

/** Pure encounter state machine. `world` is a read-only observation of the real
 * entity/physics owners. Commands request real effects; this module never edits
 * a position, velocity, entity health, cargo, wallet, faction, or wanted state.
 *
 * World: {simTime, sectorId, boss, player, debris[], mechanisms:{jaw,winch,drive}}
 * Bodies carry id,pos,vel,rot,mass,radius,hull,alive; debris additionally carries
 * eligible/playerHeld/pinned and mechanisms pinned. The adapter defines eligible
 * narrowly (encounter-owned salvage only). IDs are never reconstructed as bodies.
 */
export function createTowjawController(options = {}) {
  const seed = Number(options.seed) >>> 0;
  const model = {
    schemaVersion: TOWJAW.schemaVersion,
    encounterId: String(options.encounterId || 'towjaw').slice(0, 160),
    sectorId: String(options.sectorId || TOWJAW.sectorId).slice(0, 160),
    seed, rng: (seed ^ 0x746f776a) >>> 0 || 1,
    bossId: validId(options.bossId) ? options.bossId : null,
    mechanismIds: Object.fromEntries(KEYS.map(key => [key, validId(options.mechanismIds?.[key]) ? options.mechanismIds[key] : null])),
    eligibleIds: cleanIds(options.eligibleIds),
    origin: validPoint(options.origin) ? { x: options.origin.x, z: options.origin.z } : { x: 0, z: 0 },
    heading: wrapAngle(finite(options.heading)),
    phase: 'approach', phaseTime: 0, elapsed: 0, lastTime: null,
    targetArmor: 3, armor: [], mechanisms: {}, attack: null,
    castSequence: 0, cycles: 0, starvations: 0, emptyFor: 0, awayFor: 0,
    outcome: null, outcomeEmitted: false, released: [], lostIds: [], spentIds: [],
    previousPlayer: null, previousBoss: null,
  };
  for (const key of KEYS) model.mechanisms[key] = { disabled: false, exposed: true, pinned: false };
  const pending = [];
  let commands = [], events = [];
  let currentWorld = null;

  function random() {
    let value = model.rng;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    model.rng = value >>> 0 || 1;
    return model.rng / 4294967296;
  }
  model.targetArmor = TOWJAW.minArmor + Math.floor(random() * (TOWJAW.maxArmor - TOWJAW.minArmor + 1));

  function command(row) { if (commands.length < TOWJAW.maxCommands) commands.push(row); }
  function event(type, extra = {}) {
    if (events.length < TOWJAW.maxEvents) events.push({ type, encounterId: model.encounterId,
      at: finite(currentWorld?.simTime, model.elapsed), ...extra });
  }
  function setPhase(phase, reason) {
    if (phase === model.phase) return;
    const previous = model.phase;
    model.phase = phase; model.phaseTime = 0;
    event('phase', { phase, previous, reason });
  }
  function bodyById(world, id) { return (world.debris || []).find(body => body?.id === id) || null; }
  function rememberReleased(id, cooldown = 4) {
    const previous = model.released.find(row => row.id === id);
    if (previous) previous.until = Math.max(previous.until, model.elapsed + cooldown);
    else if (model.released.length < TOWJAW.maxTracked) model.released.push({ id, until: model.elapsed + cooldown });
  }
  function removePlate(index, reason, permanent = false) {
    const [plate] = model.armor.splice(index, 1);
    if (!plate) return;
    if (permanent && !model.lostIds.includes(plate.id) && model.lostIds.length < TOWJAW.maxTracked) model.lostIds.push(plate.id);
    rememberReleased(plate.id);
    command({ type: 'release', entityId: plate.id, reason });
    event('armor-lost', { entityId: plate.id, slot: plate.slot,
      mechanism: TOWJAW_SLOTS[plate.slot]?.mechanism, reason });
  }
  function releaseAll(reason) {
    for (let index = model.armor.length - 1; index >= 0; index--) removePlate(index, reason);
  }
  function finish(outcome, reason) {
    if (model.outcomeEmitted) return;
    releaseAll(reason);
    if (model.attack) event('telegraph-cancel', { ...copy(model.attack), reason });
    model.attack = null; model.outcome = outcome;
    model.outcomeEmitted = true;
    setPhase('done', reason);
    command({ type: 'outcome', outcome, reason, rewardEligible: outcome === 'defeat' });
    event('outcome', { outcome, reason, rewardEligible: outcome === 'defeat' });
  }
  function cancelAttack(reason) {
    if (model.attack) {
      event('telegraph-cancel', { ...copy(model.attack), reason });
      model.cycles++;
    }
    model.attack = null;
    setPhase('exposed', reason);
  }
  function startRetreat(reason) {
    if (model.phase === 'retreat' || model.phase === 'done') return;
    if (model.attack) event('telegraph-cancel', { ...copy(model.attack), reason });
    model.attack = null; releaseAll(reason);
    setPhase('retreat', reason);
  }

  function emitForce(body, acceleration, reason) {
    if (!body || !validId(body.id)) return;
    const mass = clamp(finite(body.mass, 1), 0.1, 2000);
    const force = limitVector(acceleration.x * mass, acceleration.z * mass, TOWJAW.maxForce);
    if (Math.hypot(force.x, force.z) > 1e-6) command({ type: 'force', entityId: body.id, ...force, reason });
  }
  function brake(boss) {
    const vel = velocity(boss);
    emitForce(boss, limitVector(-vel.x * TOWJAW.bossBrake, -vel.z * TOWJAW.bossBrake, TOWJAW.bossAcceleration), 'brake');
    // Translation braking does not damp yaw in Rapier. Without this physical
    // torque the approach turn persists forever and peels every new plate off.
    turn(boss, finite(boss.rot));
  }
  function turn(boss, heading) {
    const error = wrapAngle(heading - finite(boss.rot));
    const desired = clamp(error * 1.2, -TOWJAW.maxTurnRate, TOWJAW.maxTurnRate);
    const angularAcceleration = clamp((desired - finite(boss.angVel)) * 2.5, -0.8, 0.8);
    // Authored flight profiles can carry an inertia independent of visual
    // radius. Guessing mass*r² for the Hawser overdrives its real yaw solver.
    const inferred = clamp(finite(boss.mass, 420), 1, 2000) * Math.max(1, finite(boss.radius, 24)) ** 2 * 0.5;
    const inertia = Math.max(0.01, finite(boss.inertiaY, inferred));
    command({ type: 'torque', entityId: boss.id, y: clamp(angularAcceleration * inertia, -30000, 30000), reason: 'helm' });
  }
  function steer(boss, target, speed = TOWJAW.bossCruiseSpeed) {
    const dx = target.x - boss.pos.x, dz = target.z - boss.pos.z;
    const length = Math.hypot(dx, dz);
    const vel = velocity(boss);
    const wanted = Math.min(speed, Math.max(0, length - 80) * 0.45);
    const acceleration = limitVector((dx / (length || 1) * wanted - vel.x) * 1.5,
      (dz / (length || 1) * wanted - vel.z) * 1.5, TOWJAW.bossAcceleration);
    emitForce(boss, acceleration, 'scavenge-helm');
    if (length > 1) turn(boss, Math.atan2(dz, dx));
  }

  function eligibility(body, world) {
    if (!live(body) || !validId(body.id) || body.id === model.bossId || body.id === world.player?.id) return false;
    if (body.eligible !== true && !model.eligibleIds.includes(body.id)) return false;
    if (body.playerHeld || body.pinned || model.lostIds.includes(body.id) || model.spentIds.includes(body.id)) return false;
    if (model.armor.some(plate => plate.id === body.id)) return false;
    if (model.released.some(row => row.id === body.id && row.until > model.elapsed)) return false;
    const mass = finite(body.mass, -1);
    return mass >= 0.5 && mass <= 80 && distance(body.pos, world.boss.pos) <= TOWJAW.reelRange;
  }

  function reconcileArmor(world, dt) {
    const boss = world.boss;
    for (let index = model.armor.length - 1; index >= 0; index--) {
      const plate = model.armor[index], body = bodyById(world, plate.id);
      if (!live(body)) { removePlate(index, 'body-lost', true); continue; }
      const mount = slotPosition(boss, plate.slot);
      const offset = { x: mount.x - body.pos.x, z: mount.z - body.pos.z };
      const error = Math.hypot(offset.x, offset.z);
      const bossVel = velocity(boss), bodyVel = velocity(body);
      const rotational = finite(boss.angVel);
      const mountVel = { x: bossVel.x - rotational * (mount.z - boss.pos.z),
        z: bossVel.z + rotational * (mount.x - boss.pos.x) };
      const relative = { x: bodyVel.x - mountVel.x, z: bodyVel.z - mountVel.z };
      const relSpeed = Math.hypot(relative.x, relative.z);
      plate.age += dt;
      const pulled = body.playerHeld && (error > 6 || relSpeed > 10);
      const pinnedAway = body.pinned && error > TOWJAW.latchDistance;
      const overstretched = plate.status === 'latched' && error > TOWJAW.releaseDistance;
      plate.strainS = pulled || pinnedAway || overstretched ? plate.strainS + dt : 0;
      if (plate.strainS >= TOWJAW.releaseHoldS || error > TOWJAW.reelRange
          || plate.status === 'reeling' && plate.age > TOWJAW.reelS) {
        removePlate(index, pulled ? 'stolen' : pinnedAway ? 'pinned' : 'overstretched'); continue;
      }
      if (plate.status === 'reeling') {
        plate.settleS = error <= TOWJAW.latchDistance && relSpeed <= TOWJAW.latchSpeed ? plate.settleS + dt : 0;
        if (plate.settleS >= TOWJAW.latchS) {
          plate.status = 'latched'; plate.strainS = 0;
          event('armor-latched', { entityId: plate.id, slot: plate.slot,
            mechanism: TOWJAW_SLOTS[plate.slot].mechanism, mass: body.mass });
        }
      }
      // PIN arrests this exact body. Do not fake a kinematic attachment or tear
      // the player's Massline; separation under the real solver breaks our latch.
      if (body.pinned) continue;
      const acceleration = limitVector(offset.x * TOWJAW.spring - relative.x * TOWJAW.damping,
        offset.z * TOWJAW.spring - relative.z * TOWJAW.damping,
        plate.status === 'latched' ? TOWJAW.holdAcceleration : TOWJAW.reelAcceleration);
      const mass = clamp(finite(body.mass, 10), 0.5, 80);
      const force = limitVector(acceleration.x * mass, acceleration.z * mass, TOWJAW.maxForce);
      command({ type: 'force', entityId: body.id, ...force, reason: plate.status === 'latched' ? 'armor-latch' : 'reel' });
      command({ type: 'force', entityId: boss.id, x: -force.x, z: -force.z, reason: 'winch-reaction' });
    }
    model.released = model.released.filter(row => row.until > model.elapsed);
  }

  function updateMechanisms(world) {
    for (const key of KEYS) {
      const observed = world.mechanisms?.[key], state = model.mechanisms[key];
      const wasDisabled = state.disabled;
      const wasDetached = state.detached;
      state.disabled ||= !live(observed);
      state.pinned = !!observed?.pinned;
      state.detached = live(observed) && distance(observed.pos, mechanismPosition(world.boss, key)) > 24;
      state.exposed = state.disabled || state.detached || !isMechanismCovered(key, model, world);
      if (!wasDisabled && state.disabled) event('mechanism-disabled', { mechanism: key, entityId: model.mechanismIds[key] });
      if (!wasDetached && state.detached) event('mechanism-displaced', { mechanism: key, entityId: model.mechanismIds[key] });
    }
    if (model.attack) {
      const mechanism = model.mechanisms[model.attack.mechanism];
      // Shotgun deliberately throws its own armor after firing. This self-made
      // opening is recovery, not a reason to revoke already-launched bodies.
      const intentionallySpent = model.phase === 'attack' && model.attack.kind === 'shotgun' && model.attack.fired;
      if (!intentionallySpent && (mechanism.disabled || mechanism.pinned || mechanism.exposed)) {
        cancelAttack(mechanism.disabled ? 'mechanism-disabled' : mechanism.pinned ? 'jaw-pinned' : 'mechanism-exposed');
      }
    }
  }

  function processScrapHits(world) {
    // Runtime collision evidence is optional; using it does not trust an input
    // button or invent a hit. IDs and exposure are validated again here.
    for (const hit of (world.hits || []).slice(0, 8)) {
      const key = hit?.mechanism, mechanism = world.mechanisms?.[key];
      if (!KEYS.includes(key) || !live(mechanism) || model.mechanisms[key].disabled || !model.mechanisms[key].exposed) continue;
      if (!validId(hit.bodyId) || !(finite(hit.relativeSpeed) >= TOWJAW.thrownScrapMinSpeed)) continue;
      const body = bodyById(world, hit.bodyId);
      if (!live(body) || !(body.eligible === true || model.eligibleIds.includes(body.id))) continue;
      if (model.armor.some(plate => plate.id === body.id) || model.spentIds.includes(body.id)) continue;
      // A high-speed scrap strike is spent once, even if contact persists across
      // ticks or a save reload repeats a contact callback.
      model.spentIds.push(body.id);
      if (model.spentIds.length > TOWJAW.maxTracked) model.spentIds.length = TOWJAW.maxTracked;
      const amount = clamp(finite(body.mass, 1) * finite(hit.relativeSpeed) * TOWJAW.thrownScrapDamageScale, 10, TOWJAW.thrownScrapMaxDamage);
      command({ type: 'damage', targetId: mechanism.id, sourceId: world.player?.id ?? body.id,
        bodyId: body.id, amount, reason: 'stolen-scrap' });
      event('scrap-hit', { entityId: body.id, mechanism: key, amount });
    }
  }

  function chooseFeedstock(world) {
    const candidates = (world.debris || []).slice(0, TOWJAW.maxDebris).filter(body => eligibility(body, world));
    candidates.sort((a, b) => distance(a.pos, world.boss.pos) - distance(b.pos, world.boss.pos) || compareIds(a.id, b.id));
    return candidates;
  }
  function reelNext(world, candidates) {
    if (!candidates.length || model.armor.length >= model.targetArmor || model.armor.some(plate => plate.status === 'reeling')) return;
    const occupied = new Set(model.armor.map(plate => plate.slot));
    const priorities = TOWJAW_SLOTS.map((row, slot) => ({ row, slot }))
      .filter(({ row, slot }) => !occupied.has(slot) && !model.mechanisms[row.mechanism].disabled)
      .sort((a, b) => Number(model.armor.some(plate => TOWJAW_SLOTS[plate.slot].mechanism === a.row.mechanism))
        - Number(model.armor.some(plate => TOWJAW_SLOTS[plate.slot].mechanism === b.row.mechanism)) || a.slot - b.slot);
    const slot = priorities[0]?.slot;
    if (slot == null) return;
    // Distance owns the choice; seeded ordering resolves only near-equivalent
    // pieces. This remains reproducible when the store iteration order changes.
    const nearest = candidates[0];
    const peers = candidates.filter(body => distance(body.pos, world.boss.pos) <= distance(nearest.pos, world.boss.pos) + 4);
    peers.sort((a, b) => compareIds(a.id, b.id));
    const body = peers[Math.floor(random() * peers.length)];
    model.armor.push({ id: body.id, slot, status: 'reeling', age: 0, settleS: 0, strainS: 0 });
    event('reel-start', { entityId: body.id, slot, mechanism: TOWJAW_SLOTS[slot].mechanism });
  }

  function commitAttack(world) {
    const player = world.player;
    if (!live(player)) { startRetreat('player-left'); return; }
    const ammoCandidates = model.armor.filter(plate => plate.status === 'latched')
      .map(plate => ({ plate, body: bodyById(world, plate.id) }))
      .filter(({ body }) => live(body) && !pointInAttack({ kind: 'lane', a: body.pos,
        b: player.pos, radius: finite(body.radius, 6) + 1 }, world.boss.pos, finite(world.boss.radius, 24)))
      .sort((a, b) => distance(a.body.pos, player.pos) - distance(b.body.pos, player.pos) || a.plate.slot - b.plate.slot);
    const choices = Object.keys(TOWJAW_ATTACKS).filter(kind => {
      const mechanism = model.mechanisms[TOWJAW_ATTACKS[kind].mechanism];
      const from = kind === 'grapple' ? world.mechanisms.jaw?.pos : world.boss.pos;
      const range = kind === 'ram' ? TOWJAW_ATTACKS.ram.length : TOWJAW_ATTACKS[kind].outer;
      return !mechanism.disabled && !mechanism.exposed && !mechanism.pinned
        && validPoint(from) && distance(from, player.pos) <= range
        && (kind !== 'shotgun' || ammoCandidates.length >= 2);
    });
    if (!choices.length) { setPhase('exposed', 'no-covered-mechanism'); return; }
    // Rotate the preferred attack each cycle, with a seeded first beat. Damage
    // to a mechanism removes that branch; ordinary weapons remain sufficient.
    const preferred = ['grapple', 'shotgun', 'ram'][(model.cycles + (seed % 3)) % 3];
    const kind = choices.includes(preferred) ? preferred : choices[Math.floor(random() * choices.length)];
    const def = TOWJAW_ATTACKS[kind];
    const geometry = attackGeometry(kind, world.boss, world.player, random() < 0.5 ? -1 : 1);
    if (kind === 'grapple' && validPoint(world.mechanisms?.jaw?.pos)) {
      geometry.origin = { x: world.mechanisms.jaw.pos.x, z: world.mechanisms.jaw.pos.z };
      geometry.shapes[0].x = geometry.origin.x; geometry.shapes[0].z = geometry.origin.z;
    }
    const now = finite(world.simTime, model.elapsed);
    const attack = { kind, attack: kind, mechanism: def.mechanism,
      castId: `${model.encounterId}:${++model.castSequence}`,
      startedAt: now, fireAt: now + def.telegraphS, endAt: now + def.telegraphS + def.activeS,
      ...geometry, fired: false, hitPlayer: false, activeTime: 0, ammo: [] };
    if (kind === 'shotgun') {
      const plates = ammoCandidates.slice(0, def.maxScrap).map(row => row.plate);
      attack.shapes = [];
      for (let index = 0; index < plates.length; index++) {
        const body = bodyById(world, plates[index].id);
        const origin = { x: body.pos.x, z: body.pos.z };
        const spread = plates.length === 2 ? index * def.halfAngle
          : plates.length > 1 ? (index / (plates.length - 1) * 2 - 1) * def.halfAngle : 0;
        const heading = Math.atan2(player.pos.z - origin.z, player.pos.x - origin.x) + spread;
        attack.ammo.push({ id: body.id, origin, heading });
        // Each launched physical body has its own warned corridor. Its allowed
        // pre-fire drift is included in the lane radius; more drift cancels.
        attack.shapes.push({ kind: 'lane', a: origin,
          b: { x: origin.x + Math.cos(heading) * def.outer, z: origin.z + Math.sin(heading) * def.outer },
          radius: finite(body.radius, 6) + 12 });
      }
    }
    model.attack = attack;
    setPhase('commit', kind);
    event('telegraph-start', copy(attack));
  }

  function startAttack(world) {
    const attack = model.attack;
    if (!attack) return;
    if (attack.kind === 'shotgun') {
      if (attack.ammo.some(ammo => {
        const body = bodyById(world, ammo.id);
        return !live(body) || !model.armor.some(plate => plate.id === ammo.id && plate.status === 'latched')
          || distance(body.pos, ammo.origin) > 12;
      })) { cancelAttack('shotgun-feed-displaced'); return; }
      for (const ammo of attack.ammo) {
        const index = model.armor.findIndex(plate => plate.id === ammo.id);
        if (index >= 0) removePlate(index, 'shotgun-fired');
        if (!model.spentIds.includes(ammo.id)) model.spentIds.push(ammo.id);
        command({ type: 'launchScrap', entityId: ammo.id,
          velocity: { x: Math.cos(ammo.heading) * TOWJAW_ATTACKS.shotgun.scrapSpeed,
            z: Math.sin(ammo.heading) * TOWJAW_ATTACKS.shotgun.scrapSpeed },
          castId: attack.castId, expiresAt: attack.fireAt + TOWJAW_ATTACKS.shotgun.outer / TOWJAW_ATTACKS.shotgun.scrapSpeed,
          reason: 'shotgun' });
      }
    }
    attack.fired = true;
    setPhase('attack', attack.kind);
    event('attack-start', copy(attack));
  }

  function applyAttack(world, dt) {
    const attack = model.attack, player = world.player, boss = world.boss;
    if (!attack) return;
    const def = TOWJAW_ATTACKS[attack.kind];
    const previous = attack.activeTime;
    attack.activeTime += dt;
    if (attack.kind === 'ram') {
      const vel = velocity(boss);
      const acceleration = limitVector(Math.cos(attack.heading) * def.speed - vel.x,
        Math.sin(attack.heading) * def.speed - vel.z, 65);
      emitForce(boss, acceleration, 'committed-ram');
      turn(boss, attack.heading);
    } else brake(boss);
    if (live(player) && !attack.hitPlayer) {
      let hit = false;
      if (attack.kind === 'grapple') {
        const shape = grappleSweepShape(attack, attack.activeTime / def.activeS, previous / def.activeS);
        hit = pointInAttack(shape, player.pos, finite(player.radius))
          || model.previousPlayer && sweptInAttack(shape, model.previousPlayer, player.pos, finite(player.radius));
      } else if (attack.kind === 'ram') {
        // The warning corridor is permission, not damage. Only the moving real
        // hull contacting the player's swept circle actually hits.
        const movement = { kind: 'lane', a: model.previousBoss || boss.pos, b: boss.pos,
          radius: finite(boss.radius, 24) };
        hit = pointInAttack(attack.shapes[0], player.pos, finite(player.radius))
          && (pointInAttack(movement, player.pos, finite(player.radius))
          || model.previousPlayer && sweptInAttack(movement, model.previousPlayer, player.pos, finite(player.radius)));
      }
      if (hit) {
        attack.hitPlayer = true;
        command({ type: 'damage', targetId: player.id, sourceId: boss.id, amount: def.damage, reason: attack.kind });
        const heading = attack.kind === 'grapple'
          ? Math.atan2(attack.origin.z - player.pos.z, attack.origin.x - player.pos.x) : attack.heading;
        const mass = clamp(finite(player.mass, 10), 0.1, 2000);
        const impulse = limitVector(Math.cos(heading) * mass * def.impulseDeltaV,
          Math.sin(heading) * mass * def.impulseDeltaV, TOWJAW.maxImpulse);
        command({ type: 'impulse', entityId: player.id, ...impulse, reason: attack.kind });
        event('attack-hit', { castId: attack.castId, attack: attack.kind, entityId: player.id });
      }
    }
    if (attack.activeTime >= def.activeS) {
      event('attack-end', copy(attack));
      model.attack = null; model.cycles++;
      setPhase('exposed', 'overcommitted');
    }
  }

  function getView() {
    const result = copy(model);
    result.telegraph = model.attack ? copy(model.attack) : null;
    result.armorCount = model.armor.filter(plate => plate.status === 'latched').length;
    result.disabledCount = KEYS.filter(key => model.mechanisms[key].disabled).length;
    return result;
  }

  function step(dt, world = {}) {
    commands = []; events = []; currentWorld = world;
    if (!(Number.isFinite(dt) && dt > 0) || !Number.isFinite(world.simTime)) return { commands, events, state: getView() };
    if (model.lastTime !== null && world.simTime <= model.lastTime) return { commands, events, state: getView() };
    model.lastTime = world.simTime;
    for (const row of pending.splice(0, TOWJAW.maxEvents)) event(row.type, row);
    if (model.phase === 'done') return { commands, events, state: getView() };
    dt = Math.min(dt, TOWJAW.maxStepS);
    model.elapsed += dt; model.phaseTime += dt;
    const boss = world.boss, player = world.player;
    if (world.sectorId && world.sectorId !== model.sectorId) {
      finish('retreat', 'sector-left'); return { commands, events, state: getView() };
    }
    if (!live(boss) || boss.id !== model.bossId) {
      // Missing and dead are distinct: a vanished save body never pays a kill.
      finish(boss && boss.id === model.bossId ? 'defeat' : 'retreat', boss ? 'hull-destroyed' : 'boss-missing');
      return { commands, events, state: getView() };
    }
    model.heading = finite(boss.rot, model.heading);
    reconcileArmor(world, dt);
    updateMechanisms(world);
    processScrapHits(world);
    if (KEYS.every(key => model.mechanisms[key].disabled)) {
      command({ type: 'damage', targetId: boss.id, sourceId: world.player?.id ?? boss.id,
        amount: Math.max(1, finite(boss.hull, 500)) * 2 + 100, reason: 'mechanisms-disabled' });
      finish('defeat', 'mechanisms-disabled'); return { commands, events, state: getView() };
    }
    const playerAway = !live(player) || distance(player.pos, boss.pos) > TOWJAW.disengageRange;
    model.awayFor = playerAway ? model.awayFor + dt : 0;
    if (model.awayFor >= TOWJAW.disengageS || distance(boss.pos, model.origin) > TOWJAW.leashRadius
      || model.elapsed >= TOWJAW.maxDurationS) startRetreat('leash');
    if (finite(boss.hullMax) > 0 && boss.hull / boss.hullMax < 0.12 && model.cycles > 0) startRetreat('broken-drive-train');

    if (model.phase === 'approach') {
      const candidates = chooseFeedstock(world);
      steer(boss, candidates[0]?.pos || model.origin);
      if (model.phaseTime >= TOWJAW.approachS) setPhase('scavenge', 'field-reached');
    } else if (model.phase === 'scavenge') {
      const candidates = chooseFeedstock(world);
      const latched = model.armor.filter(plate => plate.status === 'latched').length;
      const reeling = model.armor.some(plate => plate.status === 'reeling');
      model.emptyFor = candidates.length || reeling ? 0 : model.emptyFor + dt;
      if (reeling || latched >= TOWJAW.minArmor) brake(boss);
      else steer(boss, candidates[0]?.pos || model.origin);
      reelNext(world, candidates);
      if (latched >= model.targetArmor || latched >= TOWJAW.minArmor && !reeling && model.phaseTime >= 5) {
        model.starvations = 0; model.emptyFor = 0;
        // The cage is a mobile physical weapon, not a performance staged beyond
        // weapon range. Bring the intact tug into reach before freezing a tell.
        // Steering uses real force and torque; there is no position snap.
        if (live(player) && distance(player.pos, boss.pos) > 195) steer(boss, player.pos);
        else commitAttack(world);
      } else if (model.emptyFor >= TOWJAW.denyS || model.phaseTime >= TOWJAW.scavengeS) {
        model.starvations++;
        event('feedstock-denied', { starvation: model.starvations, armorCount: latched });
        if (model.starvations >= TOWJAW.starvationLimit) startRetreat('feedstock-denied');
        else setPhase('exposed', 'feedstock-denied');
      }
    } else if (model.phase === 'commit') {
      brake(boss);
      const attack = model.attack;
      if (attack && world.simTime + 1e-9 >= attack.fireAt) startAttack(world);
    } else if (model.phase === 'attack') {
      applyAttack(world, dt);
    } else if (model.phase === 'exposed') {
      brake(boss);
      if (model.phaseTime >= TOWJAW.exposedS) setPhase('recover', 'winch-reset');
    } else if (model.phase === 'recover') {
      brake(boss);
      if (model.phaseTime >= TOWJAW.recoverS) {
        model.targetArmor = TOWJAW.minArmor + Math.floor(random() * (TOWJAW.maxArmor - TOWJAW.minArmor + 1));
        model.emptyFor = 0; setPhase('scavenge', 'feed-again');
      }
    } else if (model.phase === 'retreat') {
      const away = live(player) ? { x: boss.pos.x - player.pos.x, z: boss.pos.z - player.pos.z }
        : { x: Math.cos(model.heading), z: Math.sin(model.heading) };
      const length = Math.hypot(away.x, away.z) || 1;
      emitForce(boss, { x: away.x / length * TOWJAW.bossAcceleration,
        z: away.z / length * TOWJAW.bossAcceleration }, 'retreat');
      if (model.phaseTime >= TOWJAW.retreatS) finish('retreat', 'escaped');
    }
    model.previousBoss = { x: boss.pos.x, z: boss.pos.z };
    model.previousPlayer = live(player) ? { x: player.pos.x, z: player.pos.z } : null;
    return { commands, events, state: getView() };
  }

  /** Restore is reconciliation, never entity creation. Attack timing is
   * deliberately cancelled on load; a stale launch cannot replay or hit before
   * the player receives a fresh full warning. Terminal rewards stay latched. */
  function restore(snapshot, world = {}) {
    if (!snapshot || snapshot.schemaVersion !== TOWJAW.schemaVersion
      || snapshot.encounterId !== model.encounterId || snapshot.sectorId !== model.sectorId
      || snapshot.bossId !== model.bossId) return false;
    model.rng = Number(snapshot.rng) >>> 0 || model.rng;
    model.elapsed = clamp(finite(snapshot.elapsed), 0, TOWJAW.maxDurationS);
    model.phase = PHASES.has(snapshot.phase) ? snapshot.phase : 'recover';
    model.phaseTime = clamp(finite(snapshot.phaseTime), 0, TOWJAW.maxDurationS);
    model.targetArmor = clamp(Math.floor(finite(snapshot.targetArmor, 3)), 3, 6);
    model.castSequence = clamp(Math.floor(finite(snapshot.castSequence)), 0, 1000000);
    model.cycles = clamp(Math.floor(finite(snapshot.cycles)), 0, 10000);
    model.starvations = clamp(Math.floor(finite(snapshot.starvations)), 0, TOWJAW.starvationLimit);
    model.emptyFor = 0; model.awayFor = 0;
    model.spentIds = cleanIds(snapshot.spentIds);
    model.lostIds = cleanIds(snapshot.lostIds);
    model.released = (Array.isArray(snapshot.released) ? snapshot.released : [])
      .filter(row => validId(row?.id) && Number.isFinite(row.until))
      .slice(0, TOWJAW.maxTracked).map(row => ({ id: row.id,
        until: clamp(row.until, model.elapsed, model.elapsed + 60) }));
    model.armor = [];
    const seen = new Set(), slots = new Set();
    for (const plate of (Array.isArray(snapshot.armor) ? snapshot.armor : []).slice(0, 6)) {
      if (!validId(plate?.id) || seen.has(plate.id) || !Number.isInteger(plate.slot) || !TOWJAW_SLOTS[plate.slot]
        || slots.has(plate.slot) || model.spentIds.includes(plate.id) || model.lostIds.includes(plate.id)) continue;
      seen.add(plate.id); slots.add(plate.slot);
      const body = bodyById(world, plate.id);
      if (!live(body) || !(body.eligible === true || model.eligibleIds.includes(body.id))) {
        if (!model.lostIds.includes(plate.id) && model.lostIds.length < TOWJAW.maxTracked) model.lostIds.push(plate.id);
        continue;
      }
      model.armor.push({ id: plate.id, slot: plate.slot, status: plate.status === 'latched' ? 'latched' : 'reeling',
        age: clamp(finite(plate.age), 0, TOWJAW.reelS), settleS: 0, strainS: 0 });
    }
    for (const key of KEYS) {
      model.mechanisms[key].disabled = snapshot.mechanisms?.[key]?.disabled === true || !live(world.mechanisms?.[key]);
      model.mechanisms[key].pinned = !!world.mechanisms?.[key]?.pinned;
      model.mechanisms[key].exposed = !isMechanismCovered(key, model, world);
    }
    model.attack = null;
    if (model.phase === 'commit' || model.phase === 'attack') { model.phase = 'recover'; model.phaseTime = 0; }
    model.outcome = snapshot.outcome === 'defeat' || snapshot.outcome === 'retreat' ? snapshot.outcome : null;
    model.outcomeEmitted = snapshot.outcomeEmitted === true || model.outcome !== null;
    if (model.outcomeEmitted) { model.phase = 'done'; model.armor = []; }
    model.previousPlayer = null; model.previousBoss = null; model.lastTime = null;
    pending.push({ type: 'restored', reason: 'reconciled', cancelledAttack: !!snapshot.attack });
    return true;
  }

  function stop(reason = 'disposed') {
    commands = []; events = []; currentWorld = null;
    finish('retreat', String(reason).slice(0, 80));
    return { commands, events, state: getView() };
  }

  return Object.freeze({ step, getView, snapshot: () => copy(model), restore, stop });
}
