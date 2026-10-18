// TWO SHIPS, ONE MISTAKE — a leaked adhesive film holds two medium haulers on the
// Tethys lane. The film, the hold impulse, and the wear are the real adhesive law.
// This runtime only places the hulls, grants a bounded can allotment, and pays
// once from physical facts: a quiet sever, or both hulls still bridged at the hub.
import { ADHESIVE } from '../data/reactiveMatter/adhesive.js';
import { modelById } from '../data/reactiveMatter/models.js';
import { refreshAdhesiveCoat } from '../matter/reactive/adhesive.js';
import { addCargo } from './cargo.js';
import { installReactiveEntity } from './reactiveMatter.js';

const HAULER = modelById('hauler');
const PUCK = modelById('inert_puck');
const STEP = 1 / 60;
const AHEAD = 42;
const GAP = 6.6;
const TOW = 110;
const LOOSE = 30;
const SERVICE_R = 22;
const LEAVE_WU = 1800;
const OFFER_S = 45;
const PAY_CUT = 240;
const PAY_PAIR = 360;
const SPILL_QTY = 4;
const KEY_A = 'mistake-a';
const KEY_B = 'mistake-b';
const KEY_END = 'mistake-end';

// Fresh hold for two equal free masses: strength * dt / reduced mass. The pair
// starts at a fraction of that, so the film holds until the player yanks or waits.
function freshSep(mass) {
  const strength = ADHESIVE.filmNewtons * Math.sqrt(ADHESIVE.referenceMass / mass);
  const reduced = mass / 2;
  return (strength * STEP) / reduced;
}

const DIVERGE_SEP = freshSep(HAULER.mass) * 0.36;
const QUIET_SEP = freshSep(HAULER.mass) * 0.22;

const watches = new Map();

function ensureStory(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  return story;
}

function hubOf(d, state) {
  const active = state.world && state.world.activeSector;
  const stations = (active && Array.isArray(active.stations) && active.stations)
    || d.stationsInSector();
  const named = stations.find((row) => row && row.pos && typeof row.name === 'string' && row.name);
  const station = named || stations.find((row) => row && row.pos);
  if (!station || !station.pos) return null;
  const name = typeof station.name === 'string' && station.name ? station.name : 'the hub';
  return { x: station.pos.x, z: station.pos.z, name };
}

function layout(player, hub) {
  let ax = hub.x - player.x;
  let az = hub.z - player.z;
  const span = Math.hypot(ax, az);
  if (!(span > 1)) {
    ax = 1;
    az = 0;
  } else {
    ax /= span;
    az /= span;
  }
  const mid = { x: player.x + ax * AHEAD, z: player.z + az * AHEAD };
  const half = GAP / 2;
  const hubDist = Math.hypot(hub.x - mid.x, hub.z - mid.z);
  const service = hubDist <= TOW + 40
    ? { x: hub.x, z: hub.z, name: hub.name }
    : { x: mid.x + ax * TOW, z: mid.z + az * TOW, name: hub.name };
  return {
    ax,
    az,
    mid,
    a: { x: mid.x - ax * half, z: mid.z - az * half },
    b: { x: mid.x + ax * half, z: mid.z + az * half },
    loose: { x: mid.x + (-az) * LOOSE, z: mid.z + ax * LOOSE },
    service,
  };
}

function plainPlace(name) {
  if (typeof name !== 'string' || name.length < 3) return 'the hub';
  if (/[a-z]+_[a-z0-9_]+/.test(name) || /[a-z][A-Z]/.test(name)) return 'the hub';
  return name;
}

function canSentence(count) {
  if (count === 2) return 'Two cans are in your hold.';
  if (count === 1) return 'One can is in your hold.';
  return 'The hold had no room for the cans.';
}

function workLine(count, place) {
  return `${canSentence(count)} Quiet the pull and let the film wear off, or match speed and walk both hulls to ${plainPlace(place)}. A hard yank scatters the load and pays nothing.`;
}

function entityOf(state, id) {
  if (id == null || !state.entities || !state.entities.get) return null;
  const entity = state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function separating(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  return (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
}

function pairBridge(state) {
  const bridges = state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive
    && state.reactiveMatterWorld.adhesive.bridges;
  if (!bridges) return null;
  for (const bridge of bridges.values()) {
    const hit = (bridge.aId === KEY_A && bridge.bId === KEY_B)
      || (bridge.aId === KEY_B && bridge.bId === KEY_A);
    if (hit) return bridge;
  }
  return null;
}

function watchFilm(d, live, state) {
  if (!d.bus || typeof d.bus.on !== 'function' || watches.has(live.id)) return;
  const off = d.bus.on('toast', () => {
    if (live.vars.settled || live.phase !== 'work') return;
    const bridge = pairBridge(state);
    if (!bridge) return;
    if (bridge.severed) live.vars.severed = bridge.severed;
    if (bridge.alive) live.vars.sawLive = true;
  });
  watches.set(live.id, off);
}

function stopWatch(live) {
  const off = watches.get(live.id);
  if (typeof off === 'function') off();
  watches.delete(live.id);
}

function remember(d, live, state, outcome) {
  const story = ensureStory(state);
  if (!story.depthProgramEncounters || typeof story.depthProgramEncounters !== 'object') {
    story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  const memory = story.depthProgramEncounters;
  if (!memory.completed || typeof memory.completed !== 'object') memory.completed = {};
  if (!Array.isArray(memory.history)) memory.history = [];
  const rec = {
    outcome,
    at: d.now(),
    tick: state.tick | 0,
    encounterId: live.id,
    sectorId: live.sectorId,
    seed: state.meta && state.meta.seed,
  };
  memory.completed[live.shapeId] = rec;
  memory.history.push({ shapeId: live.shapeId, ...rec });
  if (memory.history.length > 64) memory.history.splice(0, memory.history.length - 64);
  story.flags.twoShipsOneMistake = outcome;
}

function finish(d, live, state, outcome, pay) {
  if (live.vars.settled || live.phase === 'done') return;
  live.vars.settled = true;
  stopWatch(live);
  if (outcome === 'snapped' && !live.vars.spilled) {
    live.vars.spilled = true;
    const first = entityOf(state, live.vars.firstId);
    const second = entityOf(state, live.vars.secondId);
    const pos = first && second
      ? { x: (first.pos.x + second.pos.x) / 2, z: (first.pos.z + second.pos.z) / 2 }
      : (live.vars.mid || { x: 0, z: 0 });
    d.spawnFreightPickup(live, { commodityId: 'cmdty_alloys', qty: SPILL_QTY, pos });
    d.dangerImpulse(live, 'adhesive snap', 0.03);
  }
  if (pay > 0) {
    d.grant(pay, 'adhesive recovery');
    d.emit('audio:cue', { id: 'sfx_station_dock', gain: 0.8 });
  }
  remember(d, live, state, outcome);
  d.resolve(live, outcome);
}

function lay(state, helpers, spec) {
  const entity = installReactiveEntity(state, spec, helpers);
  if (!entity || entity.id == null || !entity.data || !entity.data.reactiveMatter) return null;
  entity.data.masslineTetherable = true;
  return entity;
}

function claim(live, entity, role) {
  live.ids.push(entity.id);
  live.roles[entity.id] = role;
}

export const TWO_SHIPS_ONE_MISTAKE_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const story = ensureStory(state);
    const prior = story.flags.twoShipsOneMistake;
    if (prior && prior !== 'declined' && prior !== 'left') {
      d.abort(live, 'already_settled');
      return;
    }
    const player = d.player();
    const hub = hubOf(d, state);
    if (!player || !player.pos || !hub) {
      d.abort(live, 'no_lane');
      return;
    }
    const place = layout(player.pos, hub);
    live.vars.service = place.service;
    live.vars.mid = place.mid;
    live.vars.layout = place;
    live.vars.deadline = d.now() + OFFER_S;
    live.vars.filmed = false;
    live.vars.settled = false;
    live.phase = 'offered';
    watchFilm(d, live, state);
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['take', 'decline'], 'decline', live.vars.deadline);
  },

  choose(d, live, state, choiceId) {
    if (live.vars.settled || live.phase === 'done') return;
    if (choiceId === 'decline') return finish(d, live, state, 'declined', 0);
    if (choiceId !== 'take' || live.phase !== 'offered') return;
    const place = live.vars.layout;
    if (!place) {
      stopWatch(live);
      d.abort(live, 'no_lane');
      return;
    }
    const half = DIVERGE_SEP / 2;
    const helpers = d.helpers;
    const first = lay(state, helpers, {
      key: KEY_A,
      modelId: 'hauler',
      role: 'cargo',
      scanLabel: 'FIRST HAULER',
      x: place.a.x,
      z: place.a.z,
      vx: -place.ax * half,
      vz: -place.az * half,
      mass: HAULER.mass,
      radius: HAULER.radius,
    });
    const second = lay(state, helpers, {
      key: KEY_B,
      modelId: 'hauler',
      role: 'cargo',
      scanLabel: 'SECOND HAULER',
      x: place.b.x,
      z: place.b.z,
      vx: place.ax * half,
      vz: place.az * half,
      mass: HAULER.mass,
      radius: HAULER.radius,
    });
    const loose = lay(state, helpers, {
      key: KEY_END,
      modelId: 'inert_puck',
      role: 'cargo',
      scanLabel: 'LOOSE END',
      x: place.loose.x,
      z: place.loose.z,
      vx: 0,
      vz: 0,
      mass: PUCK.mass,
      radius: PUCK.radius,
    });
    if (!first || !second || !loose) {
      stopWatch(live);
      d.abort(live, 'spawn_failed');
      return;
    }
    claim(live, first, 'first');
    claim(live, second, 'second');
    claim(live, loose, 'loose');
    live.vars.firstId = first.id;
    live.vars.secondId = second.id;
    live.vars.looseId = loose.id;
    const landed = addCargo(state, ADHESIVE.polymerId, 2);
    live.phase = 'work';
    d.say(live, 'info', workLine(landed, place.service && place.service.name), null, { literal: true });
  },

  tick(d, live, state, now) {
    if (live.vars.settled || live.phase === 'done') return;
    if (live.phase === 'offered') {
      const player = d.player();
      const anchor = live.anchor || { x: 0, z: 0 };
      if (now >= (live.vars.deadline || 0)) return finish(d, live, state, 'declined', 0);
      if (player && player.pos && Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > LEAVE_WU) {
        return finish(d, live, state, 'declined', 0);
      }
      return;
    }
    if (live.phase !== 'work') return;

    // The director's first look is the same tick the bodies appear, before the
    // law has a bridge. Coat once and wait. Recoating would delete the film.
    if (!live.vars.filmed) {
      const world = state.reactiveMatterWorld;
      const bodies = world && world.bodies;
      if (!bodies || !bodies.has(KEY_A) || !bodies.has(KEY_B)) return;
      refreshAdhesiveCoat(world, KEY_A);
      refreshAdhesiveCoat(world, KEY_B);
      live.vars.filmed = true;
      return;
    }

    const first = entityOf(state, live.vars.firstId);
    const second = entityOf(state, live.vars.secondId);
    if (!first || !second) {
      return finish(d, live, state, live.vars.strikes > 0 ? 'harmed' : 'lost', 0);
    }
    const player = d.player();
    const mid = live.vars.mid || { x: (first.pos.x + second.pos.x) / 2, z: (first.pos.z + second.pos.z) / 2 };
    if (player && player.pos && Math.hypot(player.pos.x - mid.x, player.pos.z - mid.z) > LEAVE_WU) {
      return finish(d, live, state, 'left', 0);
    }

    const bridge = pairBridge(state);
    const severed = live.vars.severed || (bridge && bridge.severed) || null;
    const sep = separating(first, second);
    const service = live.vars.service;
    const quiet = sep <= QUIET_SEP;
    const parked = !!(service
      && Math.hypot(first.pos.x - service.x, first.pos.z - service.z) <= SERVICE_R
      && Math.hypot(second.pos.x - service.x, second.pos.z - service.z) <= SERVICE_R);

    if (severed === 'overloaded') return finish(d, live, state, 'snapped', 0);
    if (bridge && bridge.alive && parked && quiet) return finish(d, live, state, 'paired', PAY_PAIR);
    if (severed === 'worn' && quiet) return finish(d, live, state, 'separated', PAY_CUT);
    if (severed === 'worn') return finish(d, live, state, 'drifted', 0);
    return null;
  },

  event(d, live, state, name, payload) {
    if (live.vars.settled || live.phase === 'done') return;
    if (name === 'tetherAttached') {
      if (live.phase !== 'work' || live.vars.tetherSaid) return;
      if (!payload || payload.actorId !== state.playerId) return;
      const ids = live.ids || [];
      if (payload.targetId == null || !ids.includes(payload.targetId)) return;
      live.vars.tetherSaid = true;
      d.say(live, 'info', 'Line on. You are pulling both masses, not one.', null, { literal: true });
      return;
    }
    if (name === 'playerHitSquad') {
      if (live.phase !== 'work') return;
      live.vars.strikes = (live.vars.strikes || 0) + 1;
      if (live.vars.strikes === 1) {
        d.say(live, 'info', 'That hull is a crew, not a target. One more shot and the job is over.', null, { literal: true });
        return;
      }
      return finish(d, live, state, 'harmed', 0);
    }
    if (name === 'squadKill' && payload && payload.byPlayer) {
      return finish(d, live, state, 'harmed', 0);
    }
    return null;
  },
});
