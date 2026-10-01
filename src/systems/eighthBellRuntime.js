// THE EIGHTH BELL — self-registered runtime for the Vesta Forge pilgrim tow.
// A Choir chapel-barge (a dead-drive Atlas) drifts on the Forge approach with the Eighth
// Bell in an open cradle — a real tetherable body. Cut her loose and haul: above toll
// speed she rings, every peal published on the lane and pushed into the sector's danger
// pool through the ordinary impulse owner. Reach the Resonant Cathedral's arch and the
// Choir pays and remembers; pay a Forge yard tug and they finish the last leg; fire on a
// pilgrimage and the wardens answer.
//
// The script only composes live owners: spawnProp/spawnShips for the cast, massline for
// the verb, sectorsim:impulse for the noise, economy/faction intents for the settlement,
// news:publish for the headline. No parallel physics, no second mission runner.
import { makeShipEntitySpec } from './ships.js';

const OFFER_WINDOW_S = 45;
const TOLL_SPEED = 55;            // WU/s — below a gentle haul; a swung line rings it
const TOLL_REARM = 0.45;          // must fall below TOLL_SPEED * this before the next peal
const TOLL_MIN_GAP_S = 4;
const BERTH_RADIUS = 170;         // the Cathedral arch is ~110 WU of spires; grace around it
const TOW_GRACE_S = 420;          // after this the procession gives up on this lane
const HIRE_COST = 260;
const TOLL_DANGER = 0.012;        // noise on the lane, via the ordinary danger pool
const CATHEDRAL_POI = 'poi_vesta_resonant_cathedral';
const DEPOT_STATION = 'station_depot3';

const TOLL_LINES = Object.freeze([
  '— THE EIGHTH BELL TOLLS. Half the Forge heard that. —',
  '— BONG. Somewhere a cantor puts down her tools and does not know why. —',
  '— THE BELL AGAIN. The lane has ears, pilot. —',
  '— She rings like she is angry at the wait. Keep flying. —',
]);

function berthTarget(d, state) {
  const active = state.world && state.world.activeSector;
  const pois = (active && active.pois) || [];
  const cathedral = pois.find((p) => p && p.poiId === CATHEDRAL_POI && p.pos
    && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z));
  if (cathedral) return { x: cathedral.pos.x, z: cathedral.pos.z, name: 'The Resonant Cathedral' };
  const depot = d.stationsInSector().find((s) => s.id === DEPOT_STATION)
    || d.stationsInSector()[0] || null;
  return depot ? { x: depot.pos.x, z: depot.pos.z, name: depot.name || 'the depot' } : null;
}

function speedOf(entity, live, now) {
  const vel = entity && entity.vel;
  if (vel && Number.isFinite(vel.x) && Number.isFinite(vel.z)) {
    return Math.hypot(vel.x, vel.z);
  }
  const last = live.vars.lastBellPos;
  const dt = Math.max(0.001, now - (live.vars.lastBellT || now));
  if (last && entity && entity.pos) {
    return Math.hypot(entity.pos.x - last.x, entity.pos.z - last.z) / dt;
  }
  return 0;
}

function bellEntity(state, live) {
  const id = live.vars.bellId;
  const entity = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
  return entity && entity.alive !== false ? entity : null;
}

function finish(d, live, state, outcome, flags = {}) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
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
  Object.assign(story.flags, flags);
  d.resolve(live, outcome, { vars: live.vars });
}

function enterTow(d, live, state, via) {
  if (live.phase !== 'offer') return;
  live.phase = 'towing';
  live.vars.towingSince = d.now();
  live.vars.towVia = via;
  d.say(live, 'info', via === 'rope'
    ? 'LINE ON. She rocks in the cradle — cut her loose and let the Saint hear speed.'
    : 'CANTOR: Then sound her, pilot. Haul the Eighth Bell to the Cathedral arch and ring it home.',
    null, { literal: true });
}

function toll(d, live, state, now) {
  const vars = live.vars;
  vars.tolls = (vars.tolls || 0) + 1;
  vars.lastTollAt = now;
  vars.tollArmed = false;
  d.say(live, 'info', TOLL_LINES[(vars.tolls - 1) % TOLL_LINES.length], null, { literal: true });
  d.emit('audio:cue', { id: 'sfx_eighth_bell_toll', gain: 0.95 });
  // The bell is loud in the pool that matters: every peal is real sector noise.
  d.dangerImpulse(live, 'eighth_bell_toll', TOLL_DANGER);
  if (vars.tolls === 3) {
    d.say(live, 'info',
      'CANTOR: Three! She has not sounded three since the old shift whistle. FASTER.',
      null, { literal: true });
  }
}

function berth(d, live, state) {
  const vars = live.vars;
  d.say(live, 'info',
    'The arch catches her note and answers. THE EIGHTH BELL IS HOME.',
    null, { literal: true });
  d.emit('audio:cue', { id: 'sfx_eighth_bell_toll', gain: 1.0 });
  d.grant(240, 'eighth_bell_freight');
  d.rep('faction_choir', 10, 'eighth_bell_delivered');
  d.emit('news:publish', {
    text: 'THE EIGHTH BELL RINGS AT THE RESONANT CATHEDRAL — TOWED HOME ON A PRIVATE LINE',
    kind: 'choir', sectorId: live.sectorId, encounterId: live.id, source: 'the_eighth_bell',
  });
  finish(d, live, state, 'berthed', {
    eighthBellGone: 'berthed',
    eighthBellTolls: vars.tolls || 0,
  });
}

function desecrate(d, live, state) {
  for (const entity of d.entsOf(live)) {
    const ai = entity.data && entity.data.ai;
    if (ai) { ai.passive = false; ai.forcePlayerTarget = true; ai.hostileTeams = [0]; }
  }
  d.say(live, 'info',
    'WARDEN: You fire on a pilgrimage. The Saint keeps ledgers too.',
    null, { literal: true });
  d.rep('faction_choir', -12, 'eighth_bell_desecrated');
  finish(d, live, state, 'desecrated', {
    eighthBellGone: 'desecrated',
    choirBellDesecrated: true,
  });
}

export const EIGHTH_BELL_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const flags = (state.story && state.story.flags) || {};
    if (flags.eighthBellGone) { d.abort(live, 'bell_already_gone'); return; }
    const anchor = live.anchor || { x: 0, z: 0 };
    const berthPos = berthTarget(d, state);
    if (!berthPos) { d.abort(live, 'no_berth'); return; }

    live.vars.amount = HIRE_COST;
    live.vars.berth = berthPos;
    live.vars.tolls = 0;
    live.vars.tollArmed = true;
    live.vars.lastTollAt = -Infinity;
    live.vars.lastBellPos = null;
    live.vars.lastBellT = d.now();
    live.vars.bellStruck = 0;
    live.vars.scanned = false;

    // The cast: one dead-drive Atlas chapel-barge holding the cradle, two wardens flying
    // loose escort, and the Eighth Bell itself — a separate tetherable body you cut free.
    live.plan.ships = [
      {
        entitySpec: makeShipEntitySpec('ship_atlas', {
          team: 2, factionId: 'faction_choir',
          pos: { x: anchor.x, z: anchor.z },
          ai: {},
        }),
        team: 2, factionId: 'faction_choir', context: 'convoy_civilian',
        role: 'barge', passive: true,
        scanLabel: 'CHAPEL-BARGE SERAPH OF THE LANE',
      },
      {
        archetype: 'choir_zealot', level: 4,
        pos: { x: anchor.x - 120, z: anchor.z + 80 },
        factionId: 'faction_choir', context: 'convoy_civilian',
        formation: 'loose', role: 'warden', passive: true, team: 2,
      },
      {
        archetype: 'choir_zealot', level: 4,
        pos: { x: anchor.x + 150, z: anchor.z + 60 },
        factionId: 'faction_choir', context: 'convoy_civilian',
        formation: 'loose', role: 'warden', passive: true, team: 2,
      },
    ];
    d.spawnShips(live, live.plan.ships);
    const barge = d.entsOf(live, 'barge')[0];
    if (!barge) { d.abort(live, 'spawn_failed'); return; }
    live.vars.bargeId = barge.id;
    barge.data = barge.data || {};
    barge.data.masslineTetherable = true;   // the whole chapel can be dragged, heroically

    const bell = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + 34, z: anchor.z - 18 },
      radius: 12,
      mass: 60,
      scanLabel: 'THE EIGHTH BELL',
      storyPropKind: 'eighth_bell',
    });
    if (!bell || bell.id == null) { d.abort(live, 'bell_spawn_failed'); return; }
    bell.hull = 160;
    bell.hullMax = 160;
    bell.data.masslineTetherable = true;
    live.vars.bellId = bell.id;
    live.ids.push(bell.id);
    live.roles[bell.id] = 'bell';

    live.phase = 'offer';
    live.deadlineAt = d.now() + OFFER_WINDOW_S;
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, (live.shape.choices || []).map((c) => c.id),
      live.shape.timeoutChoice, live.deadlineAt);
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (live.deadlineAt > 0 && now >= live.deadlineAt && live.shape.timeoutChoice) {
        EIGHTH_BELL_RUNTIME.choose(d, live, state, live.shape.timeoutChoice);
      }
      return;
    }
    if (live.phase !== 'towing') return;
    const vars = live.vars;
    const bell = bellEntity(state, live);
    if (!bell) return finish(d, live, state, 'lost', { eighthBellGone: 'lost' });

    const speed = speedOf(bell, live, now);
    vars.lastBellPos = bell.pos ? { x: bell.pos.x, z: bell.pos.z } : vars.lastBellPos;
    vars.lastBellT = now;
    if (vars.tollArmed !== true && speed < TOLL_SPEED * TOLL_REARM) vars.tollArmed = true;
    if (speed >= TOLL_SPEED && vars.tollArmed === true && now - vars.lastTollAt >= TOLL_MIN_GAP_S) {
      toll(d, live, state, now);
      if (live.phase === 'done') return;
    }
    const berthPos = vars.berth;
    if (berthPos && bell.pos) {
      const dx = bell.pos.x - berthPos.x;
      const dz = bell.pos.z - berthPos.z;
      if (dx * dx + dz * dz <= BERTH_RADIUS * BERTH_RADIUS) return berth(d, live, state);
    }
    if (now - vars.towingSince > TOW_GRACE_S) {
      d.say(live, 'info',
        'The lane moves on. The Saint is patient; the wardens are not.',
        null, { literal: true });
      return finish(d, live, state, 'drifted');
    }
    return null;
  },

  choose(d, live, state, choiceId) {
    if (choiceId === 'vow') {
      enterTow(d, live, state, 'vow');
    } else if (choiceId === 'hire') {
      d.charge(live.vars.amount, 'eighth_bell_yard_tug');
      d.say(live, 'info',
        'FORGE YARD: Tug Sixteen answers the Saint\u2019s coin. She rides company iron from here.',
        null, { literal: true });
      d.rep('faction_choir', 3, 'eighth_bell_hired_tug');
      finish(d, live, state, 'hired', { eighthBellGone: 'hired' });
    } else if (choiceId === 'pass') {
      if (live.phase === 'towing') {
        d.say(live, 'info',
          'CANTOR: The line is already on her. Cut it or fly it, pilot.',
          null, { literal: true });
        return;
      }
      finish(d, live, state, 'passed');
    }
  },

  event(d, live, state, name, payload) {
    if (name === 'tetherAttached') {
      if (!payload || payload.actorId !== state.playerId) return;
      const targetId = payload.targetId;
      if (targetId !== live.vars.bellId && targetId !== live.vars.bargeId) return;
      enterTow(d, live, state, 'rope');
      return;
    }
    if (name === 'scanPulse') {
      if (live.vars.scanned) return;
      live.vars.scanned = true;
      d.say(live, 'info',
        'REGISTRY: SERAPH-OF-THE-LANE. CARGO: one (1) Eighth Bell. STATUS: overdue by forty years.',
        null, { literal: true });
      return;
    }
    if (name === 'playerHitSquad') {
      if (payload && payload.targetId === live.vars.bellId) {
        // Ringing her with guns is the wrong kind of loud. The first hit sings — the
        // second is sacrilege and the wardens stop asking.
        live.vars.bellStruck = (live.vars.bellStruck || 0) + 1;
        if (live.vars.bellStruck === 1) {
          toll(d, live, state, d.now());
          d.say(live, 'info',
            'WARDEN: She sings for pain now. Holster it or answer for it.',
            null, { literal: true });
          return;
        }
      }
      desecrate(d, live, state);
      return;
    }
    if (name === 'squadKill' && payload) {
      if (payload.id === live.vars.bellId) {
        if (payload.byPlayer) desecrate(d, live, state);
        else finish(d, live, state, 'lost', { eighthBellGone: 'lost' });
        return;
      }
      if (payload.byPlayer) desecrate(d, live, state);
    }
  },
});

export default EIGHTH_BELL_RUNTIME;
