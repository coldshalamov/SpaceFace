// 362 — THE SALVAGE WATCH. The living-world chain the vision demands, played as a scene:
// a freighter dies on a fringe lane, the station actually ANSWERS — a yard tug burns out to
// patch the drive — and raiders decide two wrecks are better than one. The player can defend
// the work, rob the spill, or make everything worse. No consent dialog: the watch is already
// open when the beat fires, exactly like the opening raid.
import { deepFreeze, defineEncounter } from './catalog.js';
import { makeShipEntitySpec } from '../../systems/ships.js';

export const encounterOrder = 362;
export const trigger = deepFreeze({
  id: 'salvage_watch',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['trade_lane', 'civilian_core', 'refinery_approach'],
  // Freight-event routing (pickup:collected, subsystemDisabled, entityGone) rides the convoy
  // family exactly like 344; this module's self-registered runtime wins fire/tick dispatch
  // by shapeId.
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 15,
  cooldownS: 1800,
  proximity: true,
  gates: {
    maxSecurity: 0.8, // lawful cores have patrols for this; the fringe has a tug and you
  },
});

// The raid dissolving must not take its cast with it (same release as 344): ids/roles detach
// from the live record so the released ships keep flying as ordinary world entities.
function releaseSquadToWorld(live) {
  if (!live) return;
  stopWatch(live);
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

const REPAIR_NEED_S = 55;      // open work the player is defending
const ESCALATE_AT_S = 22;      // probe → commit on the tug itself
const TUG_PRESS_WU = 240;      // raiders this close stall the work: patching under fire is a lie


// The watch's helm lease and actor identities are transient, just like the live scene.
const watches = new WeakMap();
const HOLD_GAP = 35;
const WORK_GAP_MIN = 15;
const WORK_GAP_MAX = 70;
const WORK_SPEED_MAX = 5;

function stopWatch(live) {
  const own = watches.get(live);
  if (!own || own.stopped) return;
  own.stopped = true;
  own.qualified = false;
  if (own.tug.data?.intent === own.intent) {
    own.intent.moveX = own.intent.moveZ = own.intent.turnIntent = 0;
    if (own.previousIntent === undefined) delete own.tug.data.intent;
    else own.tug.data.intent = own.previousIntent;
  }
  for (const off of own.off) if (typeof off === 'function') off();
  own.off.length = 0;
}

function beginWatch(d, live, tug, freighter) {
  const dx = tug.pos.x - freighter.pos.x, dz = tug.pos.z - freighter.pos.z;
  const distance = Math.hypot(dx, dz);
  const own = {
    tug, freighter, tugGeneration: tug.occupantGeneration,
    freighterGeneration: freighter.occupantGeneration,
    tugBody: tug.physicsBody, freighterBody: freighter.physicsBody,
    previousIntent: tug.data.intent, intent: { moveX: 0, moveZ: 0, turnIntent: 0 },
    nx: distance > 0 ? dx / distance : 1, nz: distance > 0 ? dz / distance : 0,
    stopped: false, qualified: false, off: [],
  };
  watches.set(live, own);
  tug.data.intent = own.intent;
  if (d.bus?.on) {
    own.off.push(d.bus.on('encounter:resolved', p => {
      if (p?.encounterId === live.id) stopWatch(live);
    }));
    // Securing either original hull during the work ends the civilian helm lease too.
    // Otherwise a later repair could put its departure timer onto the player's property.
    const original = actor => !own.stopped && actor?.alive === true && actor.hull > 0
      && originalActor(d.state, live, own, actor, actor === tug ? 'escort' : 'hauler',
        actor === tug ? 'tugBody' : 'freighterBody', actor === tug ? 'tugGeneration' : 'freighterGeneration');
    const custody = () => {
      releaseSquadToWorld(live);
      d.say(live, 'info', 'STATION WATCH: Rescue helm released. Secured hulls are now under your care; the watch is standing down.', null, { literal: true });
      d.resolve(live, 'watch_over', { speak: true });
    };
    own.off.push(d.bus.on('ship:captured', event => {
      for (const actor of [tug, freighter]) if (original(actor) && event?.targetId === actor.id
        && actor.flags?.persistent && event.vesselId === actor.data?.vesselId) { custody(); break; }
    }));
    // Only the committed transfer event is authoritative; failed attempts emit no change.
    own.off.push(d.bus.on('ship:controlChanging', event => {
      if ([tug, freighter].some(actor => original(actor)
        && (event?.toId === actor.id || event?.fromId === actor.id))) custody();
    }));
    for (const event of ['save:restoring', 'sector:exit', 'game:exitToMenu', 'game:new']) {
      own.off.push(d.bus.on(event, () => stopWatch(live)));
    }
  }
}

function originalActor(state, live, own, actor, role, bodyKey, generationKey) {
  const dead = actor && (actor.alive === false || actor.hull <= 0);
  const present = actor && state.entities.get(actor.id);
  // A removed original with an observed death still owns its loss. Missing live actors,
  // replacement bodies and new owners are interruptions, not evidence of destruction.
  if (!actor || (present !== actor && !(present == null && dead))
    || (!dead && actor.data?.despawnAt != null)
    || actor.occupantGeneration !== own[generationKey]
    || (live.roles[actor.id] != null && live.roles[actor.id] !== role)
    || actor.data?.ai?.encounterRole !== role
    || actor.data?.ai?.encounterId !== live.id
    || actor.data.ai.sectorId !== live.sectorId) return false;
  if (dead) return true; // destruction may already have retired the body and roster entry
  if (!live.ids.includes(actor.id) || live.roles[actor.id] !== role) return false;
  // Physics can materialize after spawn, but an established body cannot be substituted.
  if (own[bodyKey] == null && actor.physicsBody != null) own[bodyKey] = actor.physicsBody;
  return actor.physicsBody === own[bodyKey];
}

function attendWatch(own) {
  own.intent.moveX = own.intent.moveZ = 0;
  const tug = own.tug, mule = own.freighter;
  const values = [tug.pos?.x, tug.pos?.z, mule.pos?.x, mule.pos?.z,
    tug.vel?.x, tug.vel?.z, mule.vel?.x, mule.vel?.z, tug.radius, mule.radius, tug.rot];
  if (!values.every(Number.isFinite) || tug.radius <= 0 || mule.radius <= 0) return false;
  // Hold outside BOTH real hull envelopes, not at the casualty's centre.
  const berth = tug.radius + mule.radius + HOLD_GAP;
  const dx = mule.pos.x + own.nx * berth - tug.pos.x;
  const dz = mule.pos.z + own.nz * berth - tug.pos.z;
  const range = Math.hypot(dx, dz);
  const scale = range > 0 ? Math.min(45, range * 0.3) / range : 0;
  const ax = (mule.vel.x + dx * scale - tug.vel.x) * 0.04;
  const az = (mule.vel.z + dz * scale - tug.vel.z) * 0.04;
  const c = Math.cos(tug.rot), s = Math.sin(tug.rot);
  own.intent.moveZ = Math.max(-1, Math.min(1, ax * c + az * s));
  own.intent.moveX = Math.max(-1, Math.min(1, -ax * s + az * c));
  const gap = Math.hypot(tug.pos.x - mule.pos.x, tug.pos.z - mule.pos.z)
    - tug.radius - mule.radius;
  return gap >= WORK_GAP_MIN && gap <= WORK_GAP_MAX
    && Math.hypot(tug.vel.x - mule.vel.x, tug.vel.z - mule.vel.z) <= WORK_SPEED_MAX;
}


// A completed rescue keeps its receipt immediately; only this short civilian burn remains.
// The closure owns two exact packets, never a new world job or a persistent controller.
function departWatch(d, state, tug, mule, now) {
  if (!d.bus?.on) return;
  const dx = tug.pos.x - mule.pos.x, dz = tug.pos.z - mule.pos.z;
  const distance = Math.hypot(dx, dz);
  const nx = distance > 0 ? dx / distance : 1, nz = distance > 0 ? dz / distance : 0;
  const off = [];
  const leases = [tug, mule].map((actor, index) => {
    const sign = index === 0 ? 1 : -1, c = Math.cos(actor.rot), s = Math.sin(actor.rot);
    const intent = { moveX: sign * (-nx * s + nz * c) * 0.65,
      moveZ: sign * (nx * c + nz * s) * 0.65, turnIntent: 0, assistMode: 'assisted' };
    const lease = { actor, generation: actor.occupantGeneration, intent,
      previous: actor.data.intent, expiry: now + 20, active: true };
    actor.data.intent = intent;
    actor.data.despawnAt = lease.expiry;
    return lease;
  });
  const current = lease => state.entities.get(lease.actor.id) === lease.actor
    && lease.actor.occupantGeneration === lease.generation;
  function release(lease, custody = false) {
    if (!lease.active) return;
    lease.active = false;
    const actor = lease.actor;
    if (actor.data?.intent === lease.intent) {
      lease.intent.moveX = lease.intent.moveZ = lease.intent.turnIntent = 0;
      if (custody || lease.previous === undefined) delete actor.data.intent;
      else actor.data.intent = lease.previous;
    }
    // Only a committed change of custody cancels our retirement, never an attempted one.
    if (custody && current(lease) && actor.data?.despawnAt === lease.expiry) delete actor.data.despawnAt;
    if (leases.every(item => !item.active)) {
      for (const unsubscribe of off) if (typeof unsubscribe === 'function') unsubscribe();
      off.length = 0;
    }
  }
  off.push(d.bus.on('ship:captured', event => {
    for (const lease of leases) if (current(lease) && event?.targetId === lease.actor.id
      && lease.actor.flags?.persistent && event.vesselId === lease.actor.data?.vesselId) release(lease, true);
  }));
  // This event is emitted after every fallible handoff guard, at the synchronous commit.
  off.push(d.bus.on('ship:controlChanging', event => {
    for (const lease of leases) if (current(lease)
      && (event?.toId === lease.actor.id || event?.fromId === lease.actor.id)) release(lease, true);
  }));
  off.push(d.bus.on('entity:destroyed', event => {
    for (const lease of leases) if (event?.entity === lease.actor) release(lease);
  }));
  for (const event of ['save:restoring', 'sector:exit', 'game:exitToMenu', 'game:new']) {
    off.push(d.bus.on(event, () => { for (const lease of leases) release(lease); }));
  }
}

function nearestEnemyDistTo(d, live, body) {
  if (!body || !body.pos) return Infinity;
  let best = Infinity;
  for (const raider of d.entsOf(live, 'raider')) {
    if (!raider || !raider.pos || !raider.data || raider.data.despawnAt != null) continue;
    const dx = raider.pos.x - body.pos.x;
    const dz = raider.pos.z - body.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < best) best = dist;
  }
  return best;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + 170;
    live.data.watch = { phase: 'arrive', t: 0, escalated: false, halfSaid: false, stallSaid: false, tenderLost: false };

    // The casualty rides in already broken: one plan tweak pre-spawn, the ordinary budget
    // grant does the rest. Its volatile lot is the physical stake — destruction spills it
    // through the same custody path the opening raid uses.
    for (const sh of (live.plan && live.plan.ships) || []) {
      if (sh.role === 'hauler') sh.hullFrac = 0.16;
      if (sh.role === 'escort') {
        // The station's answer is yard stock, not an enemy archetype: a complete ship spec
        // gives the tug its real hull identity (H8 pattern). It must not inherit the PD
        // screen's combat doctrine — a repair tug does not fight.
        sh.combatDoctrineId = null;
        sh.entitySpec = makeShipEntitySpec('ship_hawser', {
          team: 2,
          factionId: sh.factionId || 'faction_mts',
          pos: sh.pos,
        });
      }
    }

    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs all three parts: a casualty, a rescue, and a threat. A partial grant
    // that lands fewer resolves nothing — abort leaves the ledger honest.
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'escort') < 1
      || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const freighter = d.entsOf(live, 'hauler')[0];
    const tug = d.entsOf(live, 'escort')[0];

    // Stake: a small volatile lot. Cookable class, physical spill, no predation machinery —
    // the pods belong to whoever is there when the hull breaks.
    if (freighter) {
      const qty = 4 + Math.round(d.stream(live, 'cargo')() * 3);
      const fdata = freighter.data || (freighter.data = {});
      fdata.jobKind = 'hauler';
      fdata.cargo = { cmdty_fuel_cells: qty };
      fdata.bountyCr = 0;
      fdata.loot = null;
      fdata.freightRewardOwner = 'manifest_custody';
      live.data.freightManifest = {
        manifestId: `fm_watch_${live.id}`,
        freighterKey: `encounter:${live.id}`,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      fdata.cargoManifest = {
        manifestId: live.data.freightManifest.manifestId,
        freighterKey: live.data.freightManifest.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
    }

    // Raiders are committed on the casualty from the first frame (the raid is already
    // happening), the same focus-stamp the opening raid uses.
    for (const raider of d.entsOf(live, 'raider')) {
      const data = raider.data || (raider.data = {});
      if (data.ai) data.ai.targetId = freighter.id;
      (data.combat || (data.combat = {})).targetId = freighter.id;
    }

    // Passive forbids combat AI; the scene supplies a temporary civilian helm packet.
    // Ordinary flight and physics still supply every metre of approach.
    if (tug && freighter) {
      const tdata = tug.data || (tug.data = {});
      tdata.jobKind = 'tender';
      tdata.bountyCr = 0;
      tdata.loot = null;
      tdata.ai = tdata.ai || {};
      tdata.watchTugFor = freighter.id;
      beginWatch(d, live, tug, freighter);
    }

    live.phase = 'conflict';
    d.say(live, 'alert',
      'MULE: Mayday, mayday — drive coupling is gone, hold is intact, I am not moving. Anyone on the watch channel…',
      null, { literal: true, primary: true });
    d.say(live, 'info',
      'STATION WATCH: Copy the mayday. Yard tug is burning to your marker. Salvage watch is open — armed escort appreciated, pilot.',
      null, { literal: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done' || live.data.watch?.completed) { stopWatch(live); return; }
    const w = live.data.watch || (live.data.watch = { phase: 'arrive', t: 0, escalated: false, halfSaid: false, stallSaid: false, tenderLost: false });
    const step = Math.max(0, now - (w.lastNow == null ? now : w.lastNow));
    w.lastNow = now;

    const own = watches.get(live);
    if (!own || (own.stopped && !w.tenderLost && !w.casualtyLost)
      || state.world.currentSectorId !== live.sectorId
      || (!own.stopped && own.tug.data?.intent !== own.intent)) {
      releaseSquadToWorld(live);
      return d.resolve(live, 'watch_over', { speak: true });
    }
    const freighter = own.freighter, tug = own.tug;
    if (!originalActor(state, live, own, freighter, 'hauler', 'freighterBody', 'freighterGeneration')
      || !originalActor(state, live, own, tug, 'escort', 'tugBody', 'tugGeneration')) {
      releaseSquadToWorld(live);
      return d.resolve(live, 'watch_over', { speak: true });
    }
    const freighterAlive = !w.casualtyLost && freighter.alive !== false && freighter.hull > 0;
    const tugAlive = !w.tenderLost && tug.alive !== false && tug.hull > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    // Custody in play outranks the watch: spilled pods mean somebody is still flying.
    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);

    // ── resolution ladder ──────────────────────────────────────────────────────────────
    if (!freighterAlive) {
      w.casualtyLost = true;
      stopWatch(live);
      if (custodyOpen) return;
      // Casualty broke up — the watch becomes a disputed salvage field. Raiders take what
      // they can reach and leave; the tug marks the spot and goes home.
      if (tugAlive && tug.data) tug.data.despawnAt = now + 14;
      if (raidersAlive) d.despawnAll(live, 16, 'raider');
      if (!w.casualtyNews) {
        w.casualtyNews = true;
        d.emit('news:publish', {
          text: 'LANE CASUALTY BROKE UP UNDER WATCH: fuel-cell hold spilled across the lane. Salvage rights in dispute before the wreck stopped tumbling.',
          kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
          eventId: `salvage_watch:${live.id}`,
        });
      }
      releaseSquadToWorld(live);
      return d.resolve(live, 'casualty_lost', { speak: true });
    }

    if (!tugAlive && !w.tenderLost) {
      stopWatch(live);
      // The tug is the watch. Saying it once: the rep hit and the headline are the station's
      // memory of losing a hull on a mayday answer — never a per-tick drumbeat.
      w.tenderLost = true;
      d.rep('faction_mts', -4, 'salvage_watch_tender_lost');
      d.emit('news:publish', {
        text: 'YARD TUG LOST ON THE WATCH: the station answers maydays with hulls, and today the lane kept one.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
        eventId: `salvage_watch:${live.id}`,
      });
    }

    if (!tugAlive) {
      // No rescue left. Raiders go back to stripping the casualty; the watch resolves when
      // the stripping ends or the deadline closes the channel.
      if (raidersAlive && freighter) {
        for (const raider of d.entsOf(live, 'raider')) {
          const data = raider.data || (raider.data = {});
          if (data.ai) data.ai.targetId = freighter.id;
          (data.combat || (data.combat = {})).targetId = freighter.id;
        }
      }
      if (!raidersAlive || now >= live.deadlineAt) {
        releaseSquadToWorld(live);
        return d.resolve(live, 'tender_lost', { speak: true });
      }
      return; // the stripping continues on-glass; the player can still answer it
    }

    if (now >= live.deadlineAt) {
      releaseSquadToWorld(live);
      return d.resolve(live, 'watch_over', { speak: true });
    }

    const attended = attendWatch(own);
    if (attended && w.phase === 'arrive') {
      w.phase = 'work';
      d.say(live, 'bark',
        'TUG: On scene and holding beside the coupling. Keep the lane clear while I cut.',
        null, { literal: true });
    }

    // The complication the whole beat exists for: raiders stop nibbling at a dead ship and
    // go for the rescue. Killing the tender is the unforgivable loss here.
    if (!w.escalated && raidersAlive && w.lastNow - live.startedAt >= ESCALATE_AT_S && tug) {
      w.escalated = true;
      for (const raider of d.entsOf(live, 'raider')) {
        const data = raider.data || (raider.data = {});
        if (data.ai) data.ai.targetId = tug.id;
        (data.combat || (data.combat = {})).targetId = tug.id;
      }
      d.say(live, 'alert',
        'RAIDER: Forget the corpse. Kill the rescue — the station stops answering after this.',
        null, { literal: true });
    }

    // Credit only a continuous observed interval. Ordinary director cadence is up to
    // 1.5 s; longer gaps cannot buy work offscreen. Separation pauses, never erases a patch.
    const pressed = nearestEnemyDistTo(d, live, tug) < TUG_PRESS_WU;
    const qualified = attended && !pressed;
    const worked = qualified && own.qualified && step > 0 && step <= 1.6;
    if (worked) w.t += step;
    own.qualified = qualified;
    if (w.phase === 'work') {
      const reason = pressed ? 'pressure' : !attended ? 'separation' : null;
      if (reason && w.stalled !== reason) {
        d.say(live, 'danger', reason === 'pressure'
          ? 'TUG: I cannot work with them on me! Peel them off or we are both cargo!'
          : 'TUG: Lost the service berth. Patch paused until I am alongside and steady again.',
        null, { literal: true });
      } else if (!reason && w.stalled) {
        d.say(live, 'bark', 'TUG: Alongside and steady. Resuming the patch.', null, { literal: true });
      }
      w.stalled = reason;
      if (!w.halfSaid && w.t >= REPAIR_NEED_S * 0.5) {
        w.halfSaid = true;
        d.say(live, 'bark', 'TUG: Half patched. Whatever you are doing, keep doing it.', null, { literal: true });
      }
    }

    if (w.t >= REPAIR_NEED_S && qualified) {
      w.completed = true; // latch before synchronous reward/news callbacks can re-enter
      stopWatch(live);
      // The payoff: the freighter leaves under its own power, paid and named on the wire.
      if (freighter && freighter.data) {
        freighter.hull = freighter.hullMax;

      }
      departWatch(d, state, tug, freighter, now);
      d.grant(300, 'salvage_watch:repaired');
      d.rep('faction_mts', 6, 'salvage_watch_repaired');
      d.emit('comms:log', {
        from: 'MTS MULE',
        text: 'Drive is LIVE. Watch bounty is on its way, pilot — the station heard everything you did out here.',
        kind: 'encounter',
      });
      d.emit('news:publish', {
        text: 'SALVAGE WATCH CLOSED CLEAN: lane casualty drive restored under escort; rescue pair clearing the service berth. The watch channel names its escort.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
        eventId: `salvage_watch:${live.id}`,
      });
      releaseSquadToWorld(live);
      return d.resolve(live, 'repaired', { speak: true });
    }

    if (now >= live.deadlineAt) {
      // Watch closes at the deadline whatever the state. Everything still alive stays
      // alive — released to the world, not deleted.
      releaseSquadToWorld(live);
      return d.resolve(live, w.tenderLost ? 'tender_lost' : 'watch_over', { speak: true });
    }
    // Presentation follows earned work, never the tender label or elapsed offscreen time.
    // Latch before emit: synchronous listeners may revisit this same scene tick.
    if (worked && !own.stopped && !w.completed
      && (own.lastWorkCueAt == null || now - own.lastWorkCueAt >= 0.3)) {
      own.lastWorkCueAt = now;
      d.emit('salvageWatch:repairWork', {
        encounterId: live.id, sectorId: live.sectorId, simTime: now,
        sourceId: tug.id, sourceGeneration: tug.occupantGeneration,
        targetId: freighter.id, targetGeneration: freighter.occupantGeneration,
      });
    }
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'reaver_pirate',
  },
  motive: 'wreck_stripping',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE SALVAGE WATCH',
  primaryLine: 'WATCH RELAY: Casualty on the lane — drive dead, cargo intact, rescue inbound. Raiders already sniffing the wreck.',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'corsair_raider'],
    size: [2, 3],
    clusterRadius: 110,
    minSeparation: 42,
    doctrine: 'thief',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // The station's answer arrives as a third cast: yard stock, the Hawser-class tug the
  // station actually owns. Identity rides a complete ship spec set at fire time.
  escort: {
    archetypes: ['pd_screen_escort'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  receipts: {
    repaired: 'WATCH CLOSED — the mule’s drive is restored; both ships are clearing the service berth. The station pays for hulls it keeps, and it heard your name on the channel.',
    tender_lost: 'THE TUG IS GONE — the station answers maydays with hulls, and this lane kept one. No rescue is coming for the mule.',
    casualty_lost: 'THE CASUALTY BROKE UP — spilled fuel cells are floating free on the lane. The tug marked the field and went home quiet.',
    watch_over: 'THE WATCH CLOSED — the tug had to break off. Whatever the lane kept, it kept.',
  },
});
