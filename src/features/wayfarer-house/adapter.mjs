import { PODS, ROLES, ROUTE, DESTINATIONS, LIMITS, CIVILIANS, at } from './data.mjs';
import { createJourney, restoreJourney, stepJourney, command, targetFor, distance,
  relativeSpeed, survivors, clone, objective } from './core.mjs';

const ended = s => ['settled', 'lost', 'retired'].includes(s.phase);
const signature = e => ({ id: e.id, generation: e.occupantGeneration ?? null });

/** A bounded producer using the actual pinned owner APIs. Dependency injection here passes
 * canonical implementations, NOT alternate writers: makeShipEntitySpec/removeCargo and registry.
 * No subscriptions are required; tick samples owner truth, avoiding stale destruction callbacks.
 */
export function createWayfarerHouse({ state, bus, helpers, registry, makeShipEntitySpec,
  removeCargo, sellableCargoQuantity, destinationAvailable }) {
  if (!state || !bus || !helpers || !registry || typeof makeShipEntitySpec !== 'function'
    || typeof removeCargo !== 'function' || typeof sellableCargoQuantity !== 'function'
    || typeof destinationAvailable !== 'function') throw new TypeError('Missing canonical Wayfarer owners');
  let journey = null;
  let bindings = {}, raiders = [null, null], links = { hearth: null, clinic: null, garden: null };
  let jobId = null, routeKey = null, lease = null, lastError = null, busy = false;
  let nextAttempt = 0;
  const attachments = () => registry.get('combat')?.kernel?.attachments;
  const jobs = () => helpers.npcJobs;
  const stableKey = role => `${journey.id}:${role}`;
  const live = role => {
    const b = bindings[role];
    const e = b && state.entities?.get(b.id);
    return e && e.occupantGeneration === b.generation && e.data?.wayfarerKey === stableKey(role) ? e : null;
  };
  const raider = index => {
    const b = raiders[index], e = b && state.entities?.get(b.id);
    return e && e.occupantGeneration === b.generation
      && e.data?.wayfarerKey === stableKey(`raider_${index}`) ? e : null;
  };
  const player = () => state.entities?.get(state.playerId);
  const present = () => state.mode === 'flight' && state.world?.currentSectorId === journey.sectorId
    && player()?.alive === true && live('tug')?.alive === true
    && distance(player().pos, live('tug').pos) <= LIMITS.playerRange;
  function say(civilian, line) {
    const person = CIVILIANS[civilian];
    bus.emit('comms:popup', { speaker: person.name, text: person[line] || line, ttl: 6 });
  }
  function error(reason) { lastError = String(reason).slice(0,160); return false; }
  function currentLink(pod) {
    const a = links[pod] && attachments()?.get(links[pod]);
    if (!a || a.state !== 'active') return null;
    const owner = live(previous(pod)), target = live(pod);
    return owner && target && a.ownerId === owner.id && a.targetId === target.id
      && a.ownerGeneration === owner.occupantGeneration && a.targetGeneration === target.occupantGeneration ? a : null;
  }
  function previous(pod) {
    const candidates = ROLES.slice(0, ROLES.indexOf(pod)).reverse();
    return candidates.find(role => role === 'tug' || journey.pods[role].disposition === 'aboard') || 'tug';
  }
  function connect(pod) {
    if (currentLink(pod)) return true;
    const owner = live(previous(pod)), target = live(pod), service = attachments();
    if (!owner?.alive || !target?.alive || !service) return error('attachment_owner_unavailable');
    if (distance(owner.pos, target.pos) > LIMITS.captureRange
      || relativeSpeed(owner.vel, target.vel) > LIMITS.relativeSpeed) return error('pod_outside_capture_envelope');
    // Adopt exactly matching restored feature links. At most two sockets per pod; bounded query.
    const prior = service.listForEntity(target.id, true).find(a => a.state === 'active'
      && a.actionInstanceId === stableKey(pod) && a.ownerId === owner.id && a.targetId === target.id
      && a.ownerGeneration === owner.occupantGeneration && a.targetGeneration === target.occupantGeneration);
    if (prior) { links[pod] = prior.id; return true; }
    const result = service.create({ defId: 'attachment_twin_bridle', ownerId: owner.id,
      targetId: target.id, actionInstanceId: stableKey(pod) });
    if (result?.ok !== true) return error(result?.reason || 'attachment_refused');
    links[pod] = result.attachment.id; return true;
  }
  function cut(pod) {
    const a = currentLink(pod);
    if (!a) { links[pod] = null; return true; }
    const result = attachments().cut(a.id, a.ownerId, 'wayfarer_coupling_release');
    if (result?.ok !== true) return error(result?.reason || 'cut_refused');
    links[pod] = null; return true;
  }
  function dropJob() {
    if (lease) helpers.aiManeuver?.cancelActivity(lease);
    lease = null;
    if (jobId) {
      const entry = jobs()?.get(jobId);
      if (entry?.worldRecordId === live('tug')?.data?.worldRecordId) {
        jobs().releaseControl(jobId, `${journey.id}:hold`);
        jobs().release(jobId);
      }
    }
    jobId = null; routeKey = null;
  }
  function navigate(target) {
    const tug = live('tug');
    if (!tug?.alive || !jobs()) return error('npc_navigation_unavailable');
    // A short patrol is used solely as the canonical NPC navigation controller. No freight
    // loading/unloading phase, no timer-based waypoint completion in this feature.
    const key = target ? `${journey.phase}:${journey.leg}:${journey.destination || ''}` : 'hold';
    const old = jobId && jobs().get(jobId);
    if (old && old.entityId !== tug.id) { jobId = null; routeKey = null; return error('stale_navigation_job'); }
    if (routeKey !== key || !old) {
      dropJob();
      const end = target || { x: tug.pos.x + 1, z: tug.pos.z };
      jobId = jobs().assign(tug, { kind: 'patrol', sectorId: journey.sectorId,
        route: [{ id: 'origin', pos: { x: tug.pos.x, z: tug.pos.z } }, { id: 'goal', pos: end }],
        speed: LIMITS.speed, commissionS: 0.1, approachS: 2, dwellS: 3600 });
      if (!jobId) return error('navigation_assignment_refused');
      routeKey = key;
    }
    if (!target) {
      const held = jobs().claimControl(jobId, { claimId: `${journey.id}:hold`, holder: 'wayfarerHouse' });
      if (held?.granted !== true) return error('navigation_hold_refused');
      if (!helpers.aiManeuver) return error('brake_owner_unavailable');
      if (!lease) lease = helpers.aiManeuver.claimActivity(tug, 'wayfarer_house');
      if (!lease) return error('brake_activity_refused');
      return helpers.aiManeuver.request({ version: 1, entityId: tug.id, tick: state.tick,
        kind: 'hold', forceLocal: { forward: 0, right: 0 }, torqueYaw: 0, boost: false,
        brake: true, targetHeading: tug.rot, horizonTicks: 1, reason: 'wayfarer_house_hold' });
    }
    return true;
  }
  function spawnSpec(role, origin) {
    const pod = PODS.find(p => p.id === role);
    const pos = pod ? at(origin, pod.offset) : { ...origin };
    const common = { wayfarerKey: stableKey(role), worldRecordId: `wayfarer:${journey.id}:${role}`,
      sectorId: journey.sectorId, wayfarerRole: role };
    if (!pod) {
      const spec = makeShipEntitySpec('ship_hawser', { team: 2, factionId: 'faction_free', pos,
        ai: { archetype: 'hauler', passive: true, activity: 'wayfarer_house', spawnContext: 'convoy_civilian' } });
      return { ...spec, flags: { ...spec.flags, persistent: true }, data: { ...spec.data, ...common } };
    }
    return { type: 'payload', team: 2, pos, vel: { x: 0, z: 0 }, rot: 0,
      radius: pod.radius, mass: pod.mass, hull: pod.hull, hullMax: pod.hull,
      collides: true, flags: { persistent: true }, homeSectorId: journey.sectorId,
      physicsBody: { version: 1, dynamic: true, radius: pod.radius, mass: pod.mass,
        inertiaY: 0.5 * pod.mass * pod.radius ** 2 },
      data: { ...common, towable: true, payloadType: 'wayfarer_habitat',
        label: pod.name, civilianId: pod.civilian } };
  }
  function launchThreat() {
    const tug = live('tug');
    if (!tug || !helpers.spawnEntity) return false;
    // Exactly two authored interceptors. Never replace a killed/retired member or retry a bound id.
    for (let i = 0; i < 2; i++) {
      if (raiders[i]) continue;
      const spec = makeShipEntitySpec('ship_wasp', { team: 3, factionId: 'faction_pirates',
        pos: { x: tug.pos.x + 650, z: tug.pos.z + (i ? -260 : 260) },
        ai: { archetype: 'fighter', spawnContext: 'mission' } });
      const entity = helpers.spawnEntity({ ...spec, flags: { ...spec.flags, persistent: true },
        data: { ...spec.data, wayfarerKey: stableKey(`raider_${i}`) } });
      if (!entity || entity.occupantGeneration == null) return error('defense_spawn_refused');
      raiders[i] = signature(entity);
    }
    journey.threat = 'active'; journey.revision++; return true;
  }
  function snapshotView() {
    const bodies = Object.fromEntries(ROLES.map(role => {
      const e = live(role);
      return [role, e ? { alive: e.alive !== false && e.hull > 0, pos: e.pos, vel: e.vel } : null];
    }));
    const garden = live('garden'), pilot = player();
    const playerTowingGarden = !!garden && !!pilot && !!attachments()?.listForEntity(garden.id, true).some(a =>
      a.state === 'active' && (a.ownerId === pilot.id || a.controllerId === pilot.id)
      && (a.targetId === garden.id || a.ownerId === garden.id)
      && (a.targetId !== garden.id || a.targetGeneration === garden.occupantGeneration));
    return { present: present(), bodies, playerTowingGarden,
      linked: Object.fromEntries(PODS.map(p => [p.id, !!currentLink(p.id)])),
      available: Object.fromEntries(Object.keys(DESTINATIONS).map(id => [id, destinationAvailable(id, journey) === true])),
      // A deleted/recycled raider is retired by its owner. A live raider far away still matters.
      threatCleared: journey.threat === 'active' && raiders.every((b,i) => b && (!raider(i) || raider(i).alive === false || raider(i).hull <= 0)) };
  }
  function settle() {
    if (journey.phase !== 'settled' || journey.rewardClaimed) return;
    const economy = registry.get('economy'), factions = registry.get('factions');
    if (typeof economy?.grantCredits !== 'function' || typeof factions?.applyRep !== 'function') {
      error('settlement_owners_unavailable'); return;
    }
    // Synchronous owner calls; latch before callbacks can re-enter. Save owner must capture all
    // registered owners in one snapshot, never feature and economy in separate asynchronous saves.
    journey.rewardClaimed = true; journey.revision++;
    const c = journey.consequence;
    if (c.rewardCr) economy.grantCredits(c.rewardCr, `wayfarer:${journey.id}`);
    if (c.reputation) bus.emit('faction:repDelta', { factionId: c.factionId, delta: c.reputation,
      reason: `wayfarer:${journey.id}` });
  }
  const api = {
    name: 'wayfarerHouse',
    // Called once at ordinary discovery by root. Subsequent activation is idempotent.
    activate(spec) {
      if (journey) return journey.id === spec.id;
      journey = createJourney(spec, state.simTime);
      if (!helpers.spawnEntity) return error('entity_factory_unavailable');
      for (const role of ROLES) {
        const e = helpers.spawnEntity(spawnSpec(role, journey.origin));
        if (!e || e.occupantGeneration == null) return error(`body_admission_failed:${role}`);
        bindings[role] = signature(e);
      }
      for (const p of PODS) connect(p.id);
      say('mara', 'greeting'); return true;
    },
    // Root rematerialization supplies only these four entities from stable world records.
    bind(role, e) {
      if (!journey || !ROLES.includes(role) || !e || e.occupantGeneration == null
        || state.entities.get(e.id) !== e || e.data?.wayfarerKey !== stableKey(role)
        || (role !== 'tug' && ['lost','abandoned'].includes(journey.pods[role].disposition))) return false;
      const old = live(role);
      if (old && old !== e && old.alive !== false) return false;
      bindings[role] = signature(e); return true;
    },
    update() {
      if (!journey || busy) return;
      busy = true;
      try {
        const view = snapshotView();
        // Preparing and ordinary post-break repairs are real capture operations, never teleport.
        if (view.present && state.simTime >= nextAttempt) {
          nextAttempt = state.simTime + 1;
          for (const p of survivors(journey)) if (p.id !== 'garden' || journey.separation !== 'requested') connect(p.id);
        }
        const effects = stepJourney(journey, state.simTime, view);
        for (const e of effects) {
          if (e.kind === 'separate' && cut('garden')) { command(journey, 'separated'); say('sen','separation'); }
          if (e.kind === 'reconnect' && connect('garden')) { command(journey,'reconnected'); say('sen','recovered'); }
          if (e.kind === 'defense' && state.simTime >= nextAttempt - 1) launchThreat();
          if (e.kind === 'loss') say(e.civilian, 'loss');
          if (e.kind === 'destination_closed') say('mara', 'Harbour is closed. We choose again; we do not disappear.');
        }
        if (ended(journey)) { dropJob(); settle(); return; }
        const ready = survivors(journey).every(p => !!currentLink(p.id));
        navigate(view.present && ready && journey.separation !== 'requested' ? targetFor(journey) : null);
      } finally { busy = false; }
    },
    // UI/input owner invokes this after rebinding its ordinary action. No new key handler.
    act({ revision, kind, pod, destination } = {}) {
      if (!journey || busy || revision !== journey.revision || ended(journey)) return false;
      if (!present()) return error('rejoin_the_house_first');
      busy = true;
      try {
        let accepted = false;
        if (kind === 'supply') {
          const p = PODS.find(p => p.id === pod), body = p && live(pod);
          if (!p || journey.pods[pod].supplied || journey.pods[pod].disposition !== 'aboard'
            || !body?.alive || distance(player().pos, body.pos) > LIMITS.supplyRange) return false;
          if (sellableCargoQuantity(state,p.need) < p.quantity) return error('insufficient_unreserved_supplies');
          // Single cargo owner; debit receipt is the actual quantity, not an optimistic event.
          const taken = removeCargo(state,p.need,p.quantity);
          if (taken !== p.quantity) return error('cargo_owner_short_transfer');
          accepted = command(journey,'supplied',pod); if (accepted) say(p.civilian,'supplied');
        } else if (kind === 'choose') {
          if (!Object.hasOwn(DESTINATIONS,destination) || destinationAvailable(destination,journey) !== true) return false;
          accepted = command(journey,'choose',destination);
        } else if (['depart','abandon','retire'].includes(kind)) accepted = command(journey,kind);
        if (accepted) { lastError = null; dropJob(); }
        return accepted;
      } finally { busy = false; }
    },
    routeToHarbour(id) {
      if (!journey || !Object.hasOwn(DESTINATIONS,id) || destinationAvailable(id,journey) !== true) return false;
      const target = at(journey.origin, DESTINATIONS[id]);
      bus.emit('ui:setCourse', { pos: target, label: DESTINATIONS[id].name }); return true;
    },
    // Mission owner pulls verifiable objective truth; this never emits completion or edits missions.
    missionProof(id) {
      return { source: 'wayfarerHouse', episodeId: journey?.id || null, missionId: id,
        complete: journey?.phase === 'settled', failed: ['lost','retired'].includes(journey?.phase),
        objective: journey ? objective(journey) : 'Not discovered',
        consequence: journey?.consequence ? clone(journey.consequence) : null };
    },
    serviceProfile(id) {
      return journey?.phase === 'settled' && journey.destination === id
        ? clone(journey.consequence) : null;
    },
    read() { return journey ? { ...clone(journey), lastError,
      available: Object.fromEntries(Object.keys(DESTINATIONS).map(id=>[id,destinationAvailable(id,journey) === true])) } : null; },
    serialize() { return journey ? { version: 1, journey: clone(journey), bindings: clone(bindings),
      links: clone(links), raiders: clone(raiders) } : null; },
    deserialize(saved) {
      if (!saved) { dropJob(); journey = null; bindings = {}; raiders = [null,null]; return; }
      if (saved.version !== 1) throw new TypeError('Unsupported Wayfarer adapter version');
      const restored = restoreJourney(saved.journey), checked = {};
      const check = b => b && Number.isSafeInteger(b.id) && b.id >= 0 && Number.isSafeInteger(b.generation)
        && b.generation >= 0 ? { id:b.id,generation:b.generation } : null;
      for (const role of ROLES) checked[role] = check(saved.bindings?.[role]);
      const checkedRaiders = [0,1].map(i=>check(saved.raiders?.[i]));
      if (restored.threat === 'active' && checkedRaiders.some(b=>!b)) throw new TypeError('Missing active defense binding');
      dropJob(); journey = restored; bindings = checked; raiders = checkedRaiders;
      links = Object.fromEntries(PODS.map(p => [p.id, typeof saved.links?.[p.id] === 'string'
        && saved.links[p.id].length < 100 ? saved.links[p.id] : null]));
      nextAttempt = 0; lastError = null;
    },
    dispose() { dropJob(); },
  };
  return api;
}
