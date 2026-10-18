// THE DRIFT AUCTION — self-registered runtime for the Pallas Drift lawless-pocket
// salvage auction (build_map §30.3 VIG-03). A salvage scow floats three tethered
// mystery crates with two circling rival scavengers. There is no menu: a scanner
// pulse landing on a crate IS a bid, a rival answers on its own cadence, and the
// gavel falls when the window closes. One crate in every lot is a dud — light
// scrap dressed as salvage — and the dud is deterministic per (seed, encounter).
//
// The script only composes live owners: spawnProp for the scow and the crates
// (real tetherable bodies), spawnShips for the rivals (real ships on loiter
// doctrine that answer bids), spawnCargoPod for the winner's take (the ordinary
// jettisoned-cargo path, so custody and pickup stay single-writer), and
// news:publish for the headline. No auction UI, no timer HUD, no law response —
// the pocket is lawless, so theft is a hostility answer, not a fine.
import { setEntityDoctrine } from '../ai/doctrine.js';

// The bidding window: rivals answer inside it, the gavel falls at its end.
const BIDDING_WINDOW_S = 120;
// A rival answers a bid after this long — its own pulse, on its own cadence.
const RIVAL_ANSWER_S = 8;
// A rival that nobody prodded opens on its own after this long. NPCs may win.
const RIVAL_OPEN_S = 45;
// A rival only bids while it holds the circle: parked or fled hulls stay quiet.
const RIVAL_BID_RADIUS = 1500;
// How close a pulse must land to count as a bid on that crate.
const BID_PULSE_RADIUS = 600;
const CRATE_RADIUS = 7;
const CRATE_MASS = 40;
const SCOW_RADIUS = 16;
const SCOW_MASS = 400;

const REAL_LOTS = Object.freeze([
  { commodityId: 'cmdty_refined_metals', amount: 12, label: 'REFINED METALS' },
  { commodityId: 'cmdty_ore_platinoid', amount: 6, label: 'PLATINOID ORE' },
]);
const DUD_LOT = Object.freeze({ commodityId: 'cmdty_scrap_metal', amount: 3, label: 'SCRAP' });

function crateEntity(state, live, index) {
  const crates = live.vars.crates;
  const crate = Array.isArray(crates) ? crates[index] : null;
  if (!crate || crate.id == null) return null;
  const entity = state.entities && state.entities.get
    ? state.entities.get(crate.id) : null;
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
    winner: live.vars.winner || null,
    crateIndex: live.vars.soldCrate ?? null,
  };
  memory.completed[live.shapeId] = rec;
  memory.history.push({ shapeId: live.shapeId, ...rec });
  if (memory.history.length > 64) memory.history.splice(0, memory.history.length - 64);
  Object.assign(story.flags, flags);
  d.resolve(live, outcome, { vars: live.vars });
}

function lotReading(crate) {
  if (!crate) return 'an unmarked crate';
  return crate.dud ? 'light scrap in a heavy shell' : 'dense salvage, hot on the return';
}

function placeBid(d, live, state, crateIndex, bidder, bidderName) {
  const vars = live.vars;
  vars.bids.push({ crate: crateIndex, bidder, at: d.now() });
  vars.highBidder = bidder;
  vars.highCrate = crateIndex;
  vars.lastBidAt = d.now();
  if (bidder !== 'player') {
    vars.rivalAnsweredAt = d.now();
    d.say(live, 'info',
      `SCOW: A rival pulse answers — the small hauler wants crate ${crateIndex + 1} too.`,
      null, { literal: true });
  }
}

function maybeRivalAnswer(d, live, state, now) {
  const vars = live.vars;
  if (vars.highBidder && vars.highBidder !== 'player') return;
  if (!vars.highBidder && (now - vars.startedAt) < RIVAL_OPEN_S) return;
  if (vars.rivalAnsweredAt > 0 && (now - vars.rivalAnsweredAt) < RIVAL_ANSWER_S) return;
  const openBid = vars.highBidder === 'player';
  const crateIndex = openBid ? vars.highCrate : pickRivalCrate(vars);
  const rivalId = pickAnsweringRival(state, vars);
  if (rivalId == null) return;
  const rival = state.entities.get(rivalId);
  const name = (rival && rival.data && rival.data.scanLabel) || 'the small hauler';
  vars.lastRivalId = rivalId;
  placeBid(d, live, state, crateIndex, `rival:${rivalId}`, name);
  if (!openBid) {
    d.say(live, 'info',
      `SCOW: ${name} pulses first — crate ${crateIndex + 1} has an opening bid. Your pulse tops it.`,
      null, { literal: true });
  }
}

function pickRivalCrate(vars) {
  // The hungriest rival opens on a real crate, never the dud: baiting works because
  // the house knows the lot. Deterministic — first non-dud crate in row order.
  const crates = vars.crates || [];
  for (let i = 0; i < crates.length; i += 1) {
    if (!crates[i].dud) return i;
  }
  return 0;
}

function pickAnsweringRival(state, vars) {
  const rivals = Array.isArray(vars.rivals) ? vars.rivals : [];
  const scow = vars.scowId != null && state.entities && state.entities.get
    ? state.entities.get(vars.scowId) : null;
  for (const id of rivals) {
    const rival = state.entities && state.entities.get ? state.entities.get(id) : null;
    if (!rival || rival.alive === false) continue;
    if (scow && scow.pos && rival.pos) {
      const dx = rival.pos.x - scow.pos.x;
      const dz = rival.pos.z - scow.pos.z;
      if (Math.hypot(dx, dz) > RIVAL_BID_RADIUS) continue;
    }
    return id;
  }
  return null;
}

function closeAuction(d, live, state, now) {
  const vars = live.vars;
  const top = vars.bids.length ? vars.bids[vars.bids.length - 1] : null;
  if (!top) {
    d.say(live, 'info',
      'SCOW: No pulses. The lot drifts on, still tethered, still nobody\u2019s.',
      null, { literal: true });
    return finish(d, live, state, 'unsold', { driftAuction: 'unsold' });
  }
  const crate = (vars.crates || [])[top.crate];
  const crateEntityRef = crateEntity(state, live, top.crate);
  vars.winner = top.bidder;
  vars.soldCrate = top.crate;
  if (top.bidder === 'player') {
    // The win is physical: the crate's lot spills as a real cargo pod the player
    // collects through the ordinary pickup path. Cargo stays single-writer.
    if (crateEntityRef && crateEntityRef.pos) {
      d.spawnCargoPod(live, {
        pos: { x: crateEntityRef.pos.x, z: crateEntityRef.pos.z },
        vel: { x: 0, z: 0 },
        commodityId: crate.commodityId,
        amount: crate.amount,
        ownerName: 'the drift auction',
        factionId: 'faction_quiet',
      });
      crateEntityRef.alive = false;
    }
    d.say(live, 'info',
      crate.dud
        ? 'SCOW: Gavel falls — yours. The shell cracks light: scrap, dressed as salvage. The pocket laughs.'
        : 'SCOW: Gavel falls — yours. The crate spills its lot beside the scow. Fly and collect.',
      null, { literal: true });
    d.emit('news:publish', {
      text: crate.dud
        ? 'DRIFT LOT GOES TO A PRIVATE PULSE — THE SHELL WAS LIGHT AND THE POCKET LAUGHS'
        : 'DRIFT LOT GOES TO A PRIVATE PULSE — SALVAGE CHANGES HANDS WITH NO PAPER',
      kind: 'quiet', sectorId: live.sectorId, encounterId: live.id, source: 'the_drift_auction',
    });
    return finish(d, live, state, 'sold', { driftAuction: 'sold' });
  }
  // A rival takes the lot home: its crate goes dark and it leaves the bidding circle.
  if (crateEntityRef) crateEntityRef.alive = false;
  const rival = state.entities.get(Number(String(top.bidder).split(':')[1]));
  if (rival && rival.data && rival.data.ai) {
    rival.data.ai.roe = 'hold_fire';
  }
  d.say(live, 'info',
    'SCOW: Gavel falls — the small hauler takes it. Your pulse was second. The pocket keeps no receipts.',
    null, { literal: true });
  d.emit('news:publish', {
    text: 'DRIFT LOT GOES TO A HUNGRY HAULER — ONE PULSE TOO SLOW AND THE POCKET KEEPS NO RECEIPTS',
    kind: 'quiet', sectorId: live.sectorId, encounterId: live.id, source: 'the_drift_auction',
  });
  return finish(d, live, state, 'sold', { driftAuction: 'sold_rival' });
}

export const DRIFT_AUCTION_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const flags = (state.story && state.story.flags) || {};
    if (flags.driftAuction === 'sold') { d.abort(live, 'auction_already_sold'); return; }
    const anchor = live.anchor || { x: 0, z: 0 };

    const scow = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x, z: anchor.z },
      radius: SCOW_RADIUS,
      mass: SCOW_MASS,
      scanLabel: 'SALVAGE SCOW — DRIFT AUCTION',
      storyPropKind: 'drift_auction',
    });
    if (!scow || scow.id == null) { d.abort(live, 'scow_spawn_failed'); return; }
    scow.hull = 200;
    scow.hullMax = 200;
    scow.data = scow.data || {};
    scow.data.masslineTetherable = true;
    live.ids.push(scow.id);
    live.roles[scow.id] = 'scow';
    live.vars.scowId = scow.id;

    // The dud is deterministic per (seed, encounter): the same lane always hides
    // the light shell in the same crate, so baiting a rival into it is a skill.
    const rng = d.stream(live, 'drift_auction_lots');
    const dudIndex = Math.floor(rng() * 3);
    live.vars.crates = [];
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    for (let i = 0; i < 3; i += 1) {
      const crate = d.spawnProp(live, {
        type: 'beacon',
        pos: {
          x: anchor.x + Math.cos(angles[i]) * 160,
          z: anchor.z + Math.sin(angles[i]) * 160,
        },
        radius: CRATE_RADIUS,
        mass: CRATE_MASS,
        scanLabel: `MYSTERY CRATE ${i + 1} — TETHERED`,
        storyPropKind: 'drift_auction_crate',
      });
      if (!crate || crate.id == null) { d.abort(live, 'crate_spawn_failed'); return; }
      crate.hull = 60;
      crate.hullMax = 60;
      crate.data = crate.data || {};
      crate.data.masslineTetherable = true;
      live.ids.push(crate.id);
      live.roles[crate.id] = 'crate';
      const dud = i === dudIndex;
      const lot = dud ? DUD_LOT : REAL_LOTS[i % REAL_LOTS.length];
      live.vars.crates.push({
        id: crate.id, index: i, dud,
        commodityId: lot.commodityId, amount: lot.amount, label: lot.label,
      });
    }

    // Two circling rival scavengers on loiter doctrine — they hold fire until the
    // player gives them a reason. Physical ships, not menu entries.
    const rivalIds = d.spawnShips(live, [0, 1].map((i) => ({
      archetype: 'mule_trader',
      level: 1,
      role: 'rival',
      factionId: 'faction_quiet',
      team: 2,
      context: 'civilian',
      passive: true,
      pos: {
        x: anchor.x + Math.cos(angles[i] + Math.PI / 3) * 420,
        z: anchor.z + Math.sin(angles[i] + Math.PI / 3) * 420,
      },
      scanLabel: i === 0 ? 'HUNGRY HAULER — CIRCLING' : 'LEAN HAULER — CIRCLING',
    })));
    if (!rivalIds.length) { d.abort(live, 'rivals_spawn_failed'); return; }
    live.vars.rivals = rivalIds.slice();
    for (const rival of d.entsOf(live, 'rival')) {
      rival.vel = { x: 0, z: 0 };
      setEntityDoctrine(rival, {
        activity: { kind: 'loiter', anchor: { x: anchor.x, z: anchor.z }, preferredRange: 420 },
        roe: 'hold_fire',
      });
    }

    live.vars.bids = [];
    live.vars.highBidder = null;
    live.vars.highCrate = null;
    live.vars.lastBidAt = 0;
    live.vars.rivalAnsweredAt = 0;
    live.vars.lastRivalId = null;
    live.vars.peeked = [false, false, false];
    live.vars.stolen = false;
    live.vars.startedAt = d.now();
    live.phase = 'bidding';
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase !== 'bidding') return;
    const vars = live.vars;
    const scow = vars.scowId != null && state.entities && state.entities.get
      ? state.entities.get(vars.scowId) : null;
    if (!scow || scow.alive === false) {
      return finish(d, live, state, 'lost', { driftAuction: 'lost' });
    }
    maybeRivalAnswer(d, live, state, now);
    if ((now - vars.startedAt) >= BIDDING_WINDOW_S) return closeAuction(d, live, state, now);
    return null;
  },

  event(d, live, state, name, payload) {
    const vars = live.vars;
    if (name === 'scanPulse') {
      if (live.phase !== 'bidding') return;
      const targetId = payload && payload.targetId;
      const sourceId = payload && (payload.sourceId ?? payload.scannerId);
      // A pulse that names no crate is table talk, not a bid. A pulse from a
      // rival hull is its answer — routed through the same bid path.
      const crates = vars.crates || [];
      let crateIndex = -1;
      for (let i = 0; i < crates.length; i += 1) {
        if (crates[i].id === targetId) { crateIndex = i; break; }
      }
      if (crateIndex < 0) {
        // Untargeted pulse near the scow: first one reads the registry line.
        if (!vars.scanned) {
          vars.scanned = true;
          d.say(live, 'info',
            'REGISTRY: SALVAGE SCOW, THREE TETHERED CRATES. HOUSE: pulse a crate to bid. Peek reads mass and heat.',
            null, { literal: true });
        }
        return;
      }
      const crate = crates[crateIndex];
      const bidder = sourceId === state.playerId ? 'player' : `rival:${sourceId}`;
      if (bidder === 'player') {
        // A peek rides on the first pulse per crate: mass and thermal decay tell
        // the dud from the salvage before the bidding closes.
        if (!vars.peeked[crateIndex]) {
          vars.peeked[crateIndex] = true;
          d.say(live, 'info',
            `PEEK: crate ${crateIndex + 1} reads ${lotReading(crate)}. The rivals saw your pulse.`,
            null, { literal: true });
        }
        placeBid(d, live, state, crateIndex, 'player', 'you');
        return;
      }
      placeBid(d, live, state, crateIndex, bidder, 'the small hauler');
      return;
    }
    if (name === 'tetherAttached') {
      if (live.phase !== 'bidding') return;
      if (!payload || payload.actorId !== state.playerId) return;
      const crates = vars.crates || [];
      const stolen = crates.findIndex((c) => c.id === payload.targetId);
      if (stolen < 0) return;
      // Cutting the tether and running with the crate is theft, not a bid: the
      // rivals answer through hostility, and the lawless pocket stays silent —
      // no fine, no patrol, just the crossfire the row promises.
      vars.stolen = true;
      vars.soldCrate = stolen;
      vars.winner = 'player_theft';
      for (const rivalId of vars.rivals || []) {
        const rival = state.entities && state.entities.get
          ? state.entities.get(rivalId) : null;
        if (!rival || rival.alive === false) continue;
        setEntityDoctrine(rival, {
          activity: {
            kind: 'attack_run', reason: 'drift_auction:theft',
            targetId: state.playerId,
            anchor: rival.pos ? { x: rival.pos.x, z: rival.pos.z } : { x: 0, z: 0 },
            preferredRange: 120,
          },
          roe: 'weapons_free',
        });
      }
      d.say(live, 'info',
        'SCOW: THE LINE GOES TAUT — somebody runs with a crate! No law out here. Run the crossfire, pilot.',
        null, { literal: true });
      d.emit('news:publish', {
        text: 'DRIFT LOT LIFTED OFF ITS TETHER — THE POCKET SETTLES IT WITH GUNS, NOT PAPER',
        kind: 'quiet', sectorId: live.sectorId, encounterId: live.id, source: 'the_drift_auction',
      });
      return finish(d, live, state, 'stolen', { driftAuction: 'stolen' });
    }
    if (name === 'squadKill' && payload) {
      const crates = vars.crates || [];
      if (crates.some((c) => c.id === payload.id)) {
        return finish(d, live, state, 'lost', { driftAuction: 'lost' });
      }
      return;
    }
  },
});

export default DRIFT_AUCTION_RUNTIME;
