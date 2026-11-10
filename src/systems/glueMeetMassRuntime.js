// FIELD TRIAL — glue, meet mass. A bounded polymer fitting, then two physical
// endings on the live adhesive law: bridge the light hull to the wreck and
// shove the pair, or coat that hull and disable it with guns. A miss, a bare
// kill, and a full hold move no pay and apply no film.
import { ADHESIVE } from '../data/reactiveMatter/adhesive.js';
import { COMMODITIES } from '../data/commodities.js';
import { addCargo, removeCargo } from './cargo.js';
import { installReactiveEntity } from './reactiveMatter.js';

const PAY = 280;
const ALLOTMENT = 4;
const OFFER_S = 90;
const GRACE_S = 240;
const SHOVE_SPEED = 4;
const LIGHT_HULL = 40;
const LIGHT_AHEAD = 16;
const WRECK_GAP = 18;
const ROCK_ASIDE = 56;

function polymerVol() {
  const row = COMMODITIES.find((entry) => entry.id === ADHESIVE.polymerId);
  return row && row.volPerU > 0 ? row.volPerU : Infinity;
}

function polymerRoom(state) {
  const cargo = state.player && state.player.cargo;
  const vol = polymerVol();
  if (!cargo || !Number.isFinite(vol)) return 0;
  const free = cargo.capVolume - cargo.usedVolume;
  if (!Number.isFinite(free)) return 0;
  return Math.floor(free / vol);
}

function polymersOf(state) {
  const items = state.player && state.player.cargo && state.player.cargo.items;
  return items && items[ADHESIVE.polymerId] || 0;
}

function ensureStory(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  return story;
}

function clawBack(state, story) {
  const held = polymersOf(state);
  const take = Math.min(ALLOTMENT, held);
  if (take > 0) removeCargo(state, ADHESIVE.polymerId, take);
  if (story && story.flags) story.flags.glueMeetMassFitted = false;
}

function lay(state, helpers, spec) {
  const entity = installReactiveEntity(state, spec, helpers);
  if (!entity || entity.id == null || !entity.data || !entity.data.reactiveMatter) return null;
  return entity;
}

function claim(live, entity, role) {
  live.ids.push(entity.id);
  live.roles[entity.id] = role;
}

function coatOf(state, key) {
  const bag = state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive;
  const row = key && bag && bag.coatings && bag.coatings.get(key);
  return row && row.integrity > 0 ? row.integrity : 0;
}

function liveBridge(state, a, b) {
  const bridges = state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive
    && state.reactiveMatterWorld.adhesive.bridges;
  if (!bridges || !a || !b) return null;
  for (const bridge of bridges.values()) {
    if (!bridge.alive) continue;
    if ((bridge.aId === a && bridge.bId === b) || (bridge.aId === b && bridge.bId === a)) return bridge;
  }
  return null;
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  if (!vel || !Number.isFinite(vel.x) || !Number.isFinite(vel.z)) return 0;
  return Math.hypot(vel.x, vel.z);
}

function disabled(entity) {
  return !entity || entity.alive === false || !(entity.hull > 0);
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
  story.flags.glueMeetMass = 'calibrated';
}

function settle(d, live, state, outcome) {
  if (live.vars.settled || live.phase === 'done') return;
  live.vars.settled = true;
  const paid = outcome === 'shoved' || outcome === 'coated';
  if (paid) {
    remember(d, live, state, outcome);
    d.grant(PAY, 'glue_meet_mass');
    d.emit('audio:cue', { id: 'sfx_station_dock', gain: 0.7 });
    d.emit('news:publish', {
      text: outcome === 'shoved'
        ? 'FIELD TRIAL LOGGED. THE FILM HELD A SHOVE, AND THE GUN STAYS AS IT WAS.'
        : 'FIELD TRIAL LOGGED. A COATED HULL WENT DOWN UNDER GUNS, AND THE GUN STAYS AS IT WAS.',
      kind: 'reach',
      sectorId: live.sectorId,
      encounterId: live.id,
      source: 'glue_meet_mass',
    });
  }
  d.resolve(live, outcome);
}

function begin(d, live, state) {
  const story = ensureStory(state);
  const fitted = story.flags.glueMeetMassFitted === true;
  if (!fitted) {
    if (polymerRoom(state) < ALLOTMENT) {
      d.resolve(live, 'hold_full');
      return;
    }
    const added = addCargo(state, ADHESIVE.polymerId, ALLOTMENT);
    if (added < ALLOTMENT) {
      if (added > 0) removeCargo(state, ADHESIVE.polymerId, added);
      d.resolve(live, 'hold_full');
      return;
    }
    story.flags.glueMeetMassFitted = true;
  }
  const player = d.player();
  if (!player || !player.pos) {
    if (!fitted) clawBack(state, story);
    d.abort(live, 'no_player');
    return;
  }
  const ox = player.pos.x;
  const oz = player.pos.z;
  const lightKey = `glue-light:${live.id}`;
  const wreckKey = `glue-wreck:${live.id}`;
  const rockKey = `glue-rock:${live.id}`;
  const light = lay(state, d.helpers, {
    key: lightKey, modelId: 'hauler', role: 'ship',
    x: ox + LIGHT_AHEAD, z: oz, scanLabel: 'Light hull',
  });
  const wreck = lay(state, d.helpers, {
    key: wreckKey, modelId: 'cryo_gate', role: 'structure',
    x: ox + LIGHT_AHEAD + WRECK_GAP, z: oz, scanLabel: 'Loose wreck',
  });
  const rock = lay(state, d.helpers, {
    key: rockKey, modelId: 'anchor_bumper',
    x: ox + LIGHT_AHEAD, z: oz + ROCK_ASIDE, scanLabel: 'Heavy rock',
  });
  if (!light || !wreck || !rock) {
    if (light) claim(live, light, 'light');
    if (wreck) claim(live, wreck, 'wreck');
    if (rock) claim(live, rock, 'rock');
    if (!fitted) clawBack(state, story);
    d.abort(live, 'field_failed');
    return;
  }
  light.team = 1;
  light.hull = LIGHT_HULL;
  light.hullMax = LIGHT_HULL;
  // Hostile to guns, with no helm orders, so the hull stays in bridge reach
  // until the player shoves it or shoots it.
  light.data.encounter = true;
  light.data.masslineTetherable = true;
  wreck.data.masslineTetherable = true;
  claim(live, light, 'light');
  claim(live, wreck, 'wreck');
  claim(live, rock, 'rock');
  live.vars.lightId = light.id;
  live.vars.wreckId = wreck.id;
  live.vars.rockId = rock.id;
  live.vars.lightKey = light.data.reactiveMatter.key;
  live.vars.wreckKey = wreck.data.reactiveMatter.key;
  live.vars.rockKey = rock.data.reactiveMatter.key;
  live.vars.filmOnLight = false;
  live.vars.snapSaid = false;
  live.vars.settled = false;
  live.vars.startedAt = d.now();
  live.phase = 'trial';
  d.say(live, 'info', fitted
    ? 'The fitting is already aboard. The trial is open again. Spray slow and close, or the film never starts.'
    : 'Fitting taken. Four units of polymers are aboard. Spray slow and close, or the film never starts.',
  null, { literal: true });
}

function noteSnap(d, live, state) {
  if (live.vars.snapSaid) return;
  const bridges = state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive
    && state.reactiveMatterWorld.adhesive.bridges;
  if (!bridges) return;
  const keys = new Set([live.vars.lightKey, live.vars.wreckKey, live.vars.rockKey]);
  for (const bridge of bridges.values()) {
    if (!bridge.severed) continue;
    if (!keys.has(bridge.aId) && !keys.has(bridge.bId)) continue;
    live.vars.snapSaid = true;
    d.say(live, 'info', 'The bond let go. The trial stays open while sample remains.', null, { literal: true });
    return;
  }
}

function pairShoved(state, vars, light, wreck) {
  if (!light || light.alive === false || !wreck || wreck.alive === false) return false;
  if (!liveBridge(state, vars.lightKey, vars.wreckKey)) return false;
  if (speedOf(light) < SHOVE_SPEED || speedOf(wreck) < SHOVE_SPEED) return false;
  const dot = (light.vel.x || 0) * (wreck.vel.x || 0) + (light.vel.z || 0) * (wreck.vel.z || 0);
  return dot > 0;
}

function samplesGone(state, vars) {
  if (polymersOf(state) > 0) return false;
  if (coatOf(state, vars.lightKey) > ADHESIVE.coatMin) return false;
  if (coatOf(state, vars.wreckKey) > ADHESIVE.coatMin) return false;
  if (coatOf(state, vars.rockKey) > ADHESIVE.coatMin) return false;
  if (liveBridge(state, vars.lightKey, vars.wreckKey)) return false;
  return true;
}

export const GLUE_MEET_MASS_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const story = ensureStory(state);
    if (story.flags.glueMeetMass === 'calibrated') {
      d.abort(live, 'already_calibrated');
      return;
    }
    live.phase = 'offer';
    live.deadlineAt = d.now() + OFFER_S;
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['fit', 'decline'], 'decline', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId !== 'fit') {
      d.resolve(live, 'declined');
      return;
    }
    begin(d, live, state);
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (now >= live.deadlineAt) d.resolve(live, 'declined');
      return;
    }
    if (live.phase !== 'trial' || live.vars.settled) return;
    const vars = live.vars;
    const light = vars.lightId != null && state.entities ? state.entities.get(vars.lightId) : null;
    const wreck = vars.wreckId != null && state.entities ? state.entities.get(vars.wreckId) : null;
    if (coatOf(state, vars.lightKey) > ADHESIVE.coatMin) vars.filmOnLight = true;
    noteSnap(d, live, state);
    if (pairShoved(state, vars, light, wreck)) return settle(d, live, state, 'shoved');
    if (disabled(light) && vars.filmOnLight) return settle(d, live, state, 'coated');
    if (disabled(light)) return settle(d, live, state, 'fought_bare');
    if (samplesGone(state, vars)) return settle(d, live, state, 'samples_gone');
    if (now - vars.startedAt > GRACE_S) return settle(d, live, state, 'unfinished');
    return null;
  },
});

export default GLUE_MEET_MASS_RUNTIME;
