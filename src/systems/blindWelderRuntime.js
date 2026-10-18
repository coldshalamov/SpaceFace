// THE BLIND WELDER — self-registered runtime for the Vesta Forge slag-field tow job
// (build_map §30 VIG-01). A sensor-dead repair barge hails on the radio band from inside
// the slag radiation field: her drive is cold, her eyes are dead, but her bow carries a
// fixed welder arc and the Forge strut beside her has three cracked seams.
//
// The only save is physical — latch a Massline onto the barge and tow her slow along the
// strut so the fixed arc traces each seam in turn. The gate is the tow itself: the barge
// must be latched, the pair must drift under the speed gate, and her nose must sit on the
// seam while she moves. Park on the strut untowed and the arc traces nothing. Drag her
// fast and the line shears — she stays adrift for a kinder lane. Refuse her and she waits.
//
// The script only composes live owners: spawnProp for the barge (a real tetherable body),
// the massline latch the player already carries, service:completed for the repair receipt
// (ships.js patches scars on any repair that restores hull), graffiti:show for the
// weld-seam bow mark, news:publish for the headline. No timer HUD, no menu, no
// auto-complete while parked.
import { livingHullOpenScars } from '../core/livingHull.js';

// Inside this relative drift the arc can lay a bead; above it the tow shears instead.
const WELD_SPEED_GATE = 8;
// The nose must sit this close to the seam while the tow moves.
const SEAM_TRACE_RADIUS = 90;
// Nose alignment: how close the barge heading must sit to the seam arc (radians).
const SEAM_ARC_TOLERANCE = 0.35;
// Each seam needs this long under the gate before the bead holds.
const SEAM_DWELL_S = 3;
// A fast tow shears the line after this long above the gate — a botch, not a timeout.
const SHEAR_GRACE_S = 4;
const OFFER_WINDOW_S = 45;
const TOW_GRACE_S = 420;          // after this the barge stops watching this lane
const BARGE_MASS = 120;
const BARGE_RADIUS = 14;

function bargeEntity(state, live) {
  const id = live.vars.bargeId;
  const entity = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
  return entity && entity.alive !== false ? entity : null;
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  return vel && Number.isFinite(vel.x) && Number.isFinite(vel.z)
    ? Math.hypot(vel.x, vel.z) : 0;
}

function relativeSpeed(state, barge) {
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!barge || !player) return Infinity;
  const bv = barge.vel || { x: 0, z: 0 };
  const pv = player.vel || { x: 0, z: 0 };
  const bx = Number.isFinite(bv.x) ? bv.x : 0;
  const bz = Number.isFinite(bv.z) ? bv.z : 0;
  const px = Number.isFinite(pv.x) ? pv.x : 0;
  const pz = Number.isFinite(pv.z) ? pv.z : 0;
  return Math.hypot(bx - px, bz - pz);
}

// Producer: tetherGameplay attachments.create writes state.combat.attachments.byId.
// A row is the line only while state is 'active' and the ends are the player and
// this barge. Dialogue acceptance is not an attachment. A cut sets state 'broken'.
function tetherLatched(state, live) {
  const bargeId = live.vars && live.vars.bargeId;
  const playerId = state && state.playerId;
  if (bargeId == null || playerId == null) return false;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return false;
  for (const attachment of Object.values(byId)) {
    if (!attachment || attachment.state !== 'active') continue;
    const ownerId = attachment.ownerId;
    const targetId = attachment.targetId;
    if ((ownerId === playerId && targetId === bargeId)
      || (ownerId === bargeId && targetId === playerId)) return true;
  }
  return false;
}

function angleDelta(a, b) {
  let delta = (a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function seamReading(state, live, barge) {
  const seams = live.vars.seams;
  const next = live.vars.tracedSeams | 0;
  if (!Array.isArray(seams) || next >= seams.length || !barge || !barge.pos) return null;
  const seam = seams[next];
  const dx = barge.pos.x - seam.x;
  const dz = barge.pos.z - seam.z;
  const distance = Math.hypot(dx, dz);
  const relSpeed = relativeSpeed(state, barge);
  const arcDelta = angleDelta(Number(barge.rot) || 0, seam.arc);
  return {
    seam,
    index: next,
    distance,
    relSpeed,
    arcDelta,
    inGate: relSpeed <= WELD_SPEED_GATE
      && distance <= SEAM_TRACE_RADIUS
      && arcDelta <= SEAM_ARC_TOLERANCE,
  };
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

function welded(d, live, state) {
  const vars = live.vars;
  // Free repair of the hull's scars: count the open marks, then let the yard's own
  // receipt path cover them — ships.js patches scars on any service:completed repair
  // that restores hull. The receipt carries the count so the ledger reads true.
  const owned = state.player && Array.isArray(state.player.ownedShips)
    ? state.player.ownedShips[state.player.activeShipIndex || 0] || null
    : null;
  const openBefore = owned ? livingHullOpenScars(owned.livingHull).length : 0;
  d.emit('service:completed', {
    type: 'repair',
    cost: 0,
    restoredHull: Math.max(0, openBefore),
    restoredArmor: 0,
    hullMax: 100,
    armorMax: 0,
    beforeProtection: 1,
    stationId: null,
    atT: d.now(),
  });
  d.emit('graffiti:show', {
    where: 'bulkhead',
    line: 'Three bright weld seams across the bow — the Forge thanks a slow tow.',
    author: 'Vesta Forge yard',
  });
  d.say(live, 'info',
    'BARGE: Three seams, three beads. Your scars are covered and the bow carries our mark — fly slow, pilot.',
    null, { literal: true });
  d.emit('audio:cue', { id: 'sfx_station_dock', gain: 0.8 });
  d.emit('news:publish', {
    text: 'SENSOR-DEAD BARGE WALKS THREE SEAMS HOME ON A PRIVATE LINE — YARD COVERS THE TOWER SCARS FREE',
    kind: 'dmc', sectorId: live.sectorId, encounterId: live.id, source: 'the_blind_welder',
  });
  finish(d, live, state, 'welded', {
    blindWelder: 'welded',
    blindWelderSeams: vars.tracedSeams | 0,
  });
}

function sheared(d, live, state) {
  d.say(live, 'info',
    'The line shears — too fast across the seam. She drifts on, cold and patient; come back slower.',
    null, { literal: true });
  // No blockAfterOutcome on this path: refusing or botching leaves her reachable later.
  finish(d, live, state, 'sheared', { blindWelderSheared: true });
}

function projectSeams(state, live) {
  const seams = live.vars && live.vars.seams;
  if (!Array.isArray(seams) || !state.entities || typeof state.entities.get !== 'function') return;
  const current = live.vars.tracedSeams | 0;
  const dwell = Number(live.vars.seamDwellS) || 0;
  const fraction = dwell <= 0 ? 0 : Math.min(1, dwell / SEAM_DWELL_S);
  for (let i = 0; i < seams.length; i += 1) {
    const seam = seams[i];
    if (!seam || seam.id == null) continue;
    const body = state.entities.get(seam.id);
    if (!body || body.alive === false) continue;
    body.pos.x = seam.x;
    body.pos.z = seam.z;
    // The renderer faces a body with entity.rot. That is the heading the arc requires.
    body.rot = seam.arc;
    body.data = body.data || {};
    if (i < current) body.data.scanLabel = 'SEAM CLOSED — the bead holds';
    else if (i > current) body.data.scanLabel = 'CRACKED SEAM — still ahead';
    else if (fraction <= 0) {
      body.data.scanLabel = 'OPEN CRACK — hold the bow on this heading. the bead has not started.';
    } else if (fraction < 1) {
      body.data.scanLabel = 'OPEN CRACK — hold the bow on this heading. the bead is taking.';
    } else {
      body.data.scanLabel = 'OPEN CRACK — hold the bow on this heading. the bead holds.';
    }
  }
}

function enterTow(d, live, state, via) {
  if (live.phase !== 'offer' && live.phase !== 'towing') return;
  const starting = live.phase === 'offer';
  if (starting) {
    live.phase = 'towing';
    live.vars.towingSince = d.now();
    live.vars.towVia = via;
    live.vars.seamDwellS = 0;
    live.vars.shearS = 0;
  }
  // The vow accepts the job. Only a rope that is actually on says the line is on.
  // Neither one fabricates a latch — the attachment table is read every tick.
  if (starting || via === 'rope') {
    d.say(live, 'info', via === 'rope'
      ? 'LINE ON. Dead eyes, live arc — walk me slow along the strut and hold each seam till the bead bites.'
      : 'BARGE: Then take the strain gentle. Three seams, slow feet, and the yard covers your scars.',
      null, { literal: true });
  }
}

export const BLIND_WELDER_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const flags = (state.story && state.story.flags) || {};
    if (flags.blindWelder === 'welded') { d.abort(live, 'welder_already_paid'); return; }
    const anchor = live.anchor || { x: 0, z: 0 };

    const barge = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + 60, z: anchor.z - 40 },
      radius: BARGE_RADIUS,
      mass: BARGE_MASS,
      scanLabel: 'SENSOR-DEAD REPAIR BARGE',
      storyPropKind: 'blind_welder',
    });
    if (!barge || barge.id == null) { d.abort(live, 'barge_spawn_failed'); return; }
    barge.hull = 120;
    barge.hullMax = 120;
    barge.data = barge.data || {};
    barge.data.masslineTetherable = true;
    barge.rot = 0.6;
    live.ids.push(barge.id);
    live.roles[barge.id] = 'barge';
    live.vars.bargeId = barge.id;

    // Three cracked seams along the station strut, deterministic off the anchor: the tow
    // walks them in order, nose on each seam while the pair drifts. Fixed arcs — the
    // barge's welder never traverses, only the tow aims it.
    live.vars.seams = [
      { x: anchor.x - 120, z: anchor.z + 60, arc: 2.4 },
      { x: anchor.x - 40, z: anchor.z + 110, arc: 2.9 },
      { x: anchor.x + 60, z: anchor.z + 150, arc: 3.4 },
    ];
    // Each crack is a beacon the renderer already draws. rot is the required heading;
    // scanLabel carries which crack is open and how far the bead has run.
    for (let i = 0; i < live.vars.seams.length; i += 1) {
      const seam = live.vars.seams[i];
      const body = d.spawnProp(live, {
        type: 'beacon',
        pos: { x: seam.x, z: seam.z },
        radius: 8,
        mass: 1,
        scanLabel: 'CRACKED SEAM — still ahead',
        storyPropKind: 'blind_welder_seam',
      });
      if (!body || body.id == null) { d.abort(live, 'seam_spawn_failed'); return; }
      body.rot = seam.arc;
      body.collides = false;
      body.physicsBody = false;
      body.hull = 10000;
      body.hullMax = 10000;
      live.ids.push(body.id);
      live.roles[body.id] = 'seam';
      seam.id = body.id;
    }
    live.vars.tracedSeams = 0;
    live.vars.seamDwellS = 0;
    live.vars.shearS = 0;
    live.vars.latchedOnce = false;
    live.vars.towingSince = 0;
    live.vars.startedAt = d.now();
    live.vars.scanned = false;

    projectSeams(state, live);
    live.phase = 'offer';
    live.deadlineAt = d.now() + OFFER_WINDOW_S;
    // The hail goes out on the radio band: she is sensor-dead and the band is her only voice.
    d.say(live, 'band', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, (live.shape.choices || []).map((c) => c.id),
      live.shape.timeoutChoice, live.deadlineAt);
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (live.deadlineAt > 0 && now >= live.deadlineAt && live.shape.timeoutChoice) {
        BLIND_WELDER_RUNTIME.choose(d, live, state, live.shape.timeoutChoice);
      }
      return;
    }
    if (live.phase !== 'towing') return;
    const vars = live.vars;
    const barge = bargeEntity(state, live);
    if (!barge) return finish(d, live, state, 'lost', { blindWelderLost: true });
    if (!tetherLatched(state, live)) {
      vars.seamDwellS = 0;
      vars.shearS = 0;
      projectSeams(state, live);
      if (now - vars.towingSince > TOW_GRACE_S) {
        d.say(live, 'info',
          'The band goes quiet. She drifts on, cold and patient.',
          null, { literal: true });
        return finish(d, live, state, 'drifted');
      }
      return null;
    }

    const dt = Math.max(0, now - (vars.lastTickAt ?? vars.towingSince ?? now));
    vars.lastTickAt = now;
    const reading = seamReading(state, live, barge);
    if (!reading) return null;
    const ownSpeed = speedOf(barge);

    // A fast tow shears the line: the gate that welds is the gate that breaks.
    if (reading.relSpeed > WELD_SPEED_GATE || ownSpeed > WELD_SPEED_GATE * 2) {
      vars.seamDwellS = 0;
      vars.shearS = (vars.shearS || 0) + dt;
      projectSeams(state, live);
      if (vars.shearS >= SHEAR_GRACE_S) return sheared(d, live, state);
      if (vars.shearS - dt <= 0) {
        d.say(live, 'info',
          'BARGE: Too fast — the arc skips. Slow her down or the line parts.',
          null, { literal: true });
      }
      return null;
    }
    vars.shearS = 0;

    // Parked on the strut without the tow moving welds nothing: the arc needs the drift.
    if (ownSpeed < 0.5) {
      vars.seamDwellS = 0;
      projectSeams(state, live);
      return null;
    }

    if (reading.inGate) {
      vars.seamDwellS = (vars.seamDwellS || 0) + dt;
      projectSeams(state, live);
      if (vars.seamDwellS >= SEAM_DWELL_S) {
        vars.tracedSeams = (vars.tracedSeams | 0) + 1;
        vars.seamDwellS = 0;
        projectSeams(state, live);
        const done = vars.tracedSeams | 0;
        if (done >= 3) return welded(d, live, state);
        d.say(live, 'info',
          done === 1
            ? 'First seam holds — a bright bead cooling on the strut. Walk her on.'
            : 'Second seam holds. One more crack to close.',
          null, { literal: true });
      }
    } else {
      vars.seamDwellS = 0;
      projectSeams(state, live);
    }

    if (now - vars.towingSince > TOW_GRACE_S) {
      d.say(live, 'info',
        'The band goes quiet. She drifts on, cold and patient.',
        null, { literal: true });
      return finish(d, live, state, 'drifted');
    }
    return null;
  },

  choose(d, live, state, choiceId) {
    if (choiceId === 'tow') {
      enterTow(d, live, state, 'vow');
    } else if (choiceId === 'pass') {
      if (live.phase === 'towing') {
        d.say(live, 'info',
          'BARGE: The line is already on. Walk me or cut me, pilot.',
          null, { literal: true });
        return;
      }
      // Refusing leaves her adrift and reachable later — no blockAfterOutcome on this path.
      finish(d, live, state, 'passed');
    }
  },

  event(d, live, state, name, payload) {
    const vars = live.vars;
    if (name === 'tetherAttached') {
      if (!payload || payload.actorId !== state.playerId) return;
      if (payload.targetId !== vars.bargeId) return;
      if (!vars.latchedOnce) {
        vars.latchedOnce = true;
        enterTow(d, live, state, 'rope');
      }
      return;
    }
    if (name === 'scanPulse') {
      if (vars.scanned) return;
      vars.scanned = true;
      d.say(live, 'info',
        'REGISTRY: YARD BARGE, SENSOR-DEAD. CARGO: one fixed welder arc. STATUS: three cracked seams on the strut.',
        null, { literal: true });
      return;
    }
  },
});

export default BLIND_WELDER_RUNTIME;
