// 706 — THE BREAKER DERBY (E-39, Drift signature). Drift crews race to split the biggest
// rock on the field: Breaker Head slams on a work rhythm, chunk throws into the
// competitors' piles. The player is the unannounced entry — a fast body into the derby
// rock is a slam scored to the hull that threw it. The winner takes the Deed Name and the
// split lot; the loser keeps the chunks either way.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as DMC } from '../factions/dmc.js';

export const encounterOrder = 706;
export const trigger = deepFreeze({
  id: 'breaker_derby',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.9,
  zoneTypes: ['mining_belt', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'traderRun',
  pressureCost: 24,
  cooldownS: 1200,
  proximity: true,
  fireWithinWu: 640,
  gates: {},
});

const CFG = (DMC.custom && DMC.custom.breakerDerby) || {};
const HEAD = (DMC.custom && DMC.custom.breakerHead) || {};
const SLAM_INTERVAL_S = Math.max(1, Number(CFG.slamIntervalS) || 4);
const CHUNKS = Array.isArray(CFG.chunkCount) ? CFG.chunkCount : [3, 5];
const MIN_IMPACT = Math.max(10, Number(HEAD.minImpactSpeed) || 40);
const ROCK_INTEGRITY = 120;      // slam points to split
const CREW_SLAM = 8;             // a breaker's hit on its rhythm
const SLAM_RANGE_WU = 150;       // a breaker works inside this ring
const CONTACT_PAD_WU = 18;       // a fast body this close to the rock's skin is a slam
const DEADLINE_S = 150;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function speed(e) {
  const v = e && e.vel;
  return v ? Math.hypot(v.x, v.z) : 0;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const rng = d.stream(live, 'derby_layout');

    // Two work crews circle the biggest rock on the field — squad is crew 'red',
    // escort is crew 'gold'. The player is the unannounced third entry.
    const crewA = ships.filter((s) => s && s.role === 'squad');
    const crewB = ships.filter((s) => s && s.role === 'escort');
    crewA.forEach((s, i) => {
      s.pos = { x: center.x + 75 + i * 35, z: center.z - 50 };   // inside the slam ring
      s.factionId = 'faction_dmc';
    });
    crewB.forEach((s, i) => {
      s.pos = { x: center.x - 75 - i * 35, z: center.z + 50 };
      s.factionId = 'faction_dmc';
    });
    const ids = d.spawnShips(live, [...crewA, ...crewB].filter(Boolean));
    if (!ids.length) return d.abort(live, 'no_budget');
    const roster = { crew_a: d.entsOf(live, 'squad'), crew_b: d.entsOf(live, 'escort') };
    const scores = { crew_a: 0, crew_b: 0, player: 0 };
    const slamAt = {};
    let seq = 0;
    for (const [crewId, members] of Object.entries(roster)) {
      for (const m of members) {
        const md = m.data || (m.data = {});
        md.scanLabel = crewId === 'crew_a' ? 'DMC DERBY CREW RED' : 'DMC DERBY CREW GOLD';
        const ai = md.ai || (md.ai = {});
        ai.passive = true; ai.holdPosition = true;
        slamAt[m.id] = { crewId, nextS: seq * 0.7 }; // staggered work rhythm, deterministic
        seq += 1;
      }
    }

    const rock = d.spawnProp(live, {
      type: 'asteroid',
      pos: { x: center.x, z: center.z },
      radius: 70, mass: 9000,
      scanLabel: 'DERBY ROCK — THE BIG ONE',
      storyPropKind: 'derby_rock',
    });
    if (!rock) return d.abort(live, 'no_rock');
    rock.data.derbyRock = true;
    rock.data.integrity = ROCK_INTEGRITY;
    rock.data.integrityMax = ROCK_INTEGRITY;

    live.data.derby = {
      rockId: rock.id, scores, slamAt,
      rngStream: rng, splitDone: false,
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'DERBY MARSHAL: Biggest rock on the field. Two crews on the clock — and a third if they\'ve got the arms. First split takes the deed.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    if (!(live.data && live.data.derby) || live.phase === 'done') return;
    if (name === 'tetherAttached' && payload) {
      // Whatever the player latches and lets fly is theirs — the derby scores the throw.
      const playerId = (d.player() && d.player().id) || state.playerId;
      if (playerId && payload.actorId !== playerId && payload.controllerId !== playerId) return;
      const body = state.entities.get(payload.targetId);
      if (body && body.data && body.data.derbyRock !== true) body.data.thrownBy = 'player';
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.derby;
    if (!rec) return;
    const rock = state.entities.get(rec.rockId);
    const player = d.player();
    if (!player || player.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'subject_gone', { speak: false });
    }
    if (!rock || rock.alive === false) return finishDerby(d, live, rec);

    // Crew slams land on the work rhythm — each breaker inside the slam ring hits on its bell.
    for (const [memberId, slot] of Object.entries(rec.slamAt)) {
      const m = state.entities.get(memberId);
      if (!m || m.alive === false || !m.pos) continue;
      const dx = m.pos.x - rock.pos.x, dz = m.pos.z - rock.pos.z;
      if (dx * dx + dz * dz > SLAM_RANGE_WU * SLAM_RANGE_WU) continue;
      if (now < slot.nextS) continue;
      slot.nextS = now + SLAM_INTERVAL_S;
      rock.data.integrity -= CREW_SLAM;
      rec.scores[slot.crewId] += CREW_SLAM;
      d.emit('derby:slam', { crewId: slot.crewId, memberId, integrity: Math.max(0, Math.round(rock.data.integrity)), t: now });
    }

    // Player slams are physical: any loose body moving fast enough that crosses the rock's
    // skin scores to whoever threw it — Breaker Head math, derby scoring.
    const list = state.entityList || (state.entities ? [...state.entities.values()] : []);
    for (const body of list) {
      if (!body || body === rock || body.alive === false || !body.pos) continue;
      if ((body.data || {}).derbyRock === true) continue;
      const thrownBy = (body.data && body.data.thrownBy) || null;
      if (!thrownBy) continue;                       // only thrown bodies count as slams
      if (speed(body) < MIN_IMPACT) continue;
      const pad = (rock.radius || 0) + (body.radius || 0) + CONTACT_PAD_WU;
      const dx = body.pos.x - rock.pos.x, dz = body.pos.z - rock.pos.z;
      if (dx * dx + dz * dz > pad * pad) { body.data.slamArmed = true; continue; }
      if (body.data.slamArmed === false) continue;   // still riding the skin — one count
      body.data.slamArmed = false;
      const hit = Math.max(1, Math.round((Number(body.mass) || 10) * 0.5));
      rock.data.integrity -= hit;
      const crew = thrownBy === 'player' ? 'player' : thrownBy;
      rec.scores[crew] = (rec.scores[crew] || 0) + hit;
      body.vel.x *= -0.3; body.vel.z *= -0.3;        // the chunk bounces off the big one
      d.emit('derby:slam', { crewId: crew, memberId: thrownBy, integrity: Math.max(0, Math.round(rock.data.integrity)), t: now });
    }

    if (rock.data.integrity <= 0) {
      rec.splitDone = true;
      splitRock(d, live, rec, rock);
      return finishDerby(d, live, rec);
    }
    if (now >= live.deadlineAt) return finishDerby(d, live, rec);
  },
});

function splitRock(d, live, rec, rock) {
  // The big one becomes the throwable chunks the derby was really about.
  const n = CHUNKS[0] + Math.floor(rec.rngStream() * (CHUNKS[1] - CHUNKS[0] + 1));
  rec.chunkIds = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rec.rngStream() * 0.4;
    const chunk = d.spawnProp(live, {
      type: 'asteroid',
      pos: { x: rock.pos.x + Math.cos(a) * (rock.radius + 10), z: rock.pos.z + Math.sin(a) * (rock.radius + 10) },
      radius: 14, mass: 320,
      scanLabel: `DERBY CHUNK ${i + 1} — THROWABLE`,
      storyPropKind: 'derby_chunk',
    });
    if (chunk) {
      chunk.vel = { x: Math.cos(a) * 14, z: Math.sin(a) * 14 };
      chunk.data = chunk.data || {};
      chunk.data.derbyChunk = true;
      rec.chunkIds.push(chunk.id);
    }
  }
  // The Deed Name goes on the biggest chunk — the worked rock keeps its scar.
  const first = rec.chunkIds[0] && d.state.entities.get(rec.chunkIds[0]);
  if (first && first.data) first.data.deedName = (DMC.custom.breakerDerby || {}).deedName || 'DERBY ROCK';
  rock.alive = false;
}

function finishDerby(d, live, rec) {
  const scores = rec.scores;
  const table = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const winner = table[0] && table[0][1] > 0 ? table[0][0] : null;
  const outcome = winner === 'player' ? 'player_wins_derby'
    : winner === 'crew_a' ? 'crew_a_wins'
    : winner === 'crew_b' ? 'crew_b_wins'
    : 'derby_draw';
  if (winner === 'player') d.rep('faction_dmc', 4, 'breaker_derby_win');
  else if (winner) d.rep('faction_dmc', 1, 'breaker_derby_ran');
  d.emit('derby:finished', { winner, scores, t: d.now() });
  releaseCast(live);
  return d.resolve(live, outcome, { speak: true });
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_dmc',
  },
  motive: 'derby_contest',
  engagementTrigger: 'none',
  factionId: 'faction_dmc',
  context: 'civilian',
  title: 'THE BREAKER DERBY',
  primaryLine: 'DERBY MARSHAL: Biggest rock on the field. First split takes the deed.',
  squad: {
    archetypes: ['mule_trader'],
    size: [2, 2],
    doctrine: 'blue-collar',
    formation: 'none',
    passive: true,
  },
  escort: {
    archetypes: ['mule_trader'],
    size: [2, 2],
    doctrine: 'blue-collar',
    formation: 'none',
    factionId: 'faction_dmc',
    context: 'civilian',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'Two Drift crews circle the biggest rock on the field — a derby is on.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The rock splits without you. Somebody else\'s name goes on the deed.',
    kill: 'You broke the derby, not the rock.',
  },
  receipts: {
    player_wins_derby: 'YOUR SPLIT — the deed is yours. The crews buy the first round.',
    crew_a_wins: 'CREW RED takes the deed. You keep whatever chunks you can carry.',
    crew_b_wins: 'CREW GOLD takes the deed. You keep whatever chunks you can carry.',
    derby_draw: 'No crew put a mark on it — the rock keeps its name.',
    subject_gone: 'The derby counts its own dead.',
  },
});
