// E1 encounter phase handlers. Each authored data module exports its own handler from this table;
// the generated encounter index discovers runtime and trigger metadata together. Consequences use
// owner intents for credits/rep/cargo and durable story flags for narrative state.
import { hash32 } from '../core/rng.js';
import { FLAVOR_PACKS } from '../data/flavor/index.generated.js';
import { ensureMoralMemory, nextMoralDebt, revealMoralDebt } from './moralMemory.js';
import { makeShipEntitySpec } from './ships.js';

const CHOICE_WINDOW_S = 45;
const H6_WAIT_TIMEOUT_S = 20;
const GRAFFITI_BY_SET = new Map();
for (const entry of FLAVOR_PACKS.graffiti.entries) {
  const rows = GRAFFITI_BY_SET.get(entry.set) || [];
  rows.push(entry);
  GRAFFITI_BY_SET.set(entry.set, rows);
}

function authoredGraffiti(state, set, sourceKey) {
  const rows = GRAFFITI_BY_SET.get(set) || [];
  if (!rows.length) throw new Error(`E1 requires V2 graffiti set ${set}`);
  const seed = state.meta && Number.isFinite(state.meta.seed) ? state.meta.seed : 0;
  return rows[hash32(seed, set, sourceKey, 'e1-v2-graffiti') % rows.length].text;
}

function encounterMemory(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  if (!story.depthProgramEncounters || typeof story.depthProgramEncounters !== 'object') {
    story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  const memory = story.depthProgramEncounters;
  if (!memory.completed || typeof memory.completed !== 'object') memory.completed = {};
  if (!Array.isArray(memory.history)) memory.history = [];
  return memory;
}

function begin(d, live, state, { spawn = false, timeout = true, primaryLine = null } = {}) {
  live.phase = 'offer';
  live.deadlineAt = timeout ? d.now() + CHOICE_WINDOW_S : 0;
  if (spawn && Array.isArray(live.plan.ships)) d.spawnShips(live, live.plan.ships);
  d.say(live, 'info', primaryLine || live.shape.primaryLine, null, { literal: true, primary: true });
  const ids = (live.shape.choices || []).map((entry) => entry.id);
  if (ids.length) d.offerChoices(live, ids, live.shape.timeoutChoice, live.deadlineAt || null);
}

function timeoutChoice(d, live, state, now, choose) {
  if (live.deadlineAt > 0 && now >= live.deadlineAt && live.shape.timeoutChoice) {
    choose(d, live, state, live.shape.timeoutChoice);
  }
}

function finish(d, live, state, outcome, flags = {}) {
  const memory = encounterMemory(state);
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
  Object.assign(state.story.flags, flags);
  d.resolve(live, outcome, { vars: live.vars });
}

function addPersistentStoryCargo(d, state, id, label) {
  const cargo = state.story.persistentCargo || (state.story.persistentCargo = []);
  if (!cargo.includes(id)) cargo.push(id);
  d.emit('cargo:persistentAdded', { id, label, source: 'depth_program_e1' });
}

function spawnStoryWreck(d, live, dx, dz, scanLabel, pool = {}, storyPropKind = null) {
  return d.spawnWreck(live, {
    pos: { x: live.anchor.x + dx, z: live.anchor.z + dz },
    scanLabel,
    pool,
    storyPropKind,
  });
}

const h1 = Object.freeze({
  fire(d, live, state) {
    spawnStoryWreck(d, live, 90, -35, 'Tessera previous-crew mayday wreck', {}, 'vols_mayday_wreck');
    begin(d, live, state);
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h1.choose); },
  choose(d, live, state, choiceId) {
    if (choiceId === 'listen') {
      d.say(live, 'info', 'VOLS: We already vented. Keep the engines warm.', null, { literal: true });
      finish(d, live, state, 'listen', { volsEchoUnlocked: true });
    } else if (choiceId === 'board') {
      addPersistentStoryCargo(d, state, 'depth_vols_black_box', 'Captain Vols black box');
      d.emit('graffiti:show', {
        line: authoredGraffiti(state, 'vols_hand', 'depth_h1_distress_from_inside:board'),
        where: 'bulkhead', author: 'Vols',
      });
      finish(d, live, state, 'boarded', { volsBlackBoxRecovered: true });
    } else if (choiceId === 'leave') {
      d.emit('ambientComms:register', {
        id: 'vols_mayday_ghost', line: 'Mayday. Tessera drive gone. Anyone receiving.', persistent: true,
      });
      finish(d, live, state, 'left', { volsMaydayGhost: true });
    }
  },
});

function settleH2(d, live, state, choiceId) {
  if (choiceId === 'hail') {
    d.say(live, 'info', 'UNDERSTORY: We died here. We answer together.', null, { literal: true });
    d.rep('faction_understory', 25, 'first_contact_hail');
    d.emit('faction:tradePosture', { factionId: 'faction_understory', posture: 'open_early', permanent: true });
    finish(d, live, state, 'hailed', { understoryTradePosture: 'open_early', understoryNeverFiresFirst: true });
  } else if (choiceId === 'scan') {
    d.say(live, 'info', 'SCAN: armed, not hot. No firing solution held.', null, { literal: true });
    d.emit('faction:tradePosture', { factionId: 'faction_understory', posture: 'cautious', permanent: true });
    finish(d, live, state, 'scanned', { understoryTradePosture: 'cautious', understoryNeverFiresFirst: true });
  } else if (choiceId === 'fire') {
    d.setPassive(live, false);
    for (const entity of d.entsOf(live)) {
      const ai = entity.data && entity.data.ai;
      if (ai) { ai.forcePlayerTarget = true; ai.hostileTeams = [0]; }
    }
    d.emit('faction:aggro', { factionId: 'faction_understory', reason: 'first_contact_fired_first', permanent: true });
    d.rep('faction_understory', -100, 'first_contact_fired_first');
    d.emit('faction:tradePosture', { factionId: 'faction_understory', posture: 'grudge', permanent: true });
    d.despawnAll(live, 18);
    finish(d, live, state, 'fired', {
      understoryTradePosture: 'grudge', understoryNeverFiresFirst: false, understoryPermanentGrudge: true,
    });
  }
}

const h2 = Object.freeze({
  fire(d, live, state) {
    begin(d, live, state, { spawn: true });
    d.setPassive(live, true);
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h2.choose); },
  choose(d, live, state, choiceId) { settleH2(d, live, state, choiceId); },
  event(d, live, state, name) {
    if (name === 'scanPulse') settleH2(d, live, state, 'scan');
    else if (name === 'playerHitSquad') settleH2(d, live, state, 'fire');
  },
});

const h3 = Object.freeze({
  fire(d, live, state) {
    spawnStoryWreck(d, live, 110, -45, 'Hull-ID recognition derelict', {}, 'tessera_recognition_wreck');
    begin(d, live, state, { primaryLine: h3PrimaryLine(state, live.shape.primaryLine) });
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h3.choose); },
  choose(d, live, state, choiceId) {
    if (choiceId === 'read') {
      d.emit('graffiti:show', {
        line: authoredGraffiti(state, 'vols_hand', 'depth_h3_wreck_that_knows_you:read'),
        where: 'bulkhead', author: 'Vols',
      });
      finish(d, live, state, 'read', { volsLetterRead: true, volsHandGraffiti: true, volsLetterEpilogue: true });
    } else if (choiceId === 'carry') {
      addPersistentStoryCargo(d, state, 'depth_vols_letter', 'Letter to the Tessera');
      finish(d, live, state, 'carried', { volsLetterCarried: true, kurtzDeskVolsLetter: true, volsLetterEpilogue: true });
    } else if (choiceId === 'ignore') {
      finish(d, live, state, 'ignored', { volsLetterIgnored: true, volsLetterEpilogue: false });
    }
  },
});

const h4 = Object.freeze({
  fire(d, live, state) {
    d.spawnProp(live, {
      type: 'beacon',
      pos: { x: live.anchor.x + 70, z: live.anchor.z - 30 },
      radius: 5,
      scanLabel: 'Love-letter route buoy',
      storyPropKind: 'love_letter_buoy',
      assetRef: 'asset.slice.kessler_handoff_beacon',
    });
    begin(d, live, state);
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h4.choose); },
  choose(d, live, state, choiceId) {
    if (choiceId === 'reseed') {
      d.emit('graffiti:show', {
        line: authoredGraffiti(state, 'kindness', 'depth_h4_love_letter_buoy:reseed'),
        where: 'airlock', author: 'unknown',
      });
      d.emit('ambientComms:toneChanged', { tone: 'warmer', reason: 'love_letter_reseeded', persistent: true });
      finish(d, live, state, 'reseeded', { kindness: true, loveLetterReseeded: true });
    } else if (choiceId === 'listen') {
      finish(d, live, state, 'heard', { loveLetterHeard: true });
    }
  },
});

const h5 = Object.freeze({
  fire(d, live, state) {
    spawnStoryWreck(d, live, -190, -80, 'Civilian corridor wreck', {});
    spawnStoryWreck(d, live, 35, 145, 'Civilian corridor wreck', {});
    spawnStoryWreck(d, live, 210, -25, 'Civilian corridor wreck', {});
    begin(d, live, state, { spawn: true });
    d.setPassive(live, true);
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h5.choose); },
  choose(d, live, state, choiceId) {
    // Deliberately exhaustive: H5 has no neutral/fourth path. Unknown ids leave the offer live.
    if (choiceId === 'flee') {
      d.rep('faction_scn', 2, 'corridor_massacre_silence_credit');
      finish(d, live, state, 'fled', { corridorCoverHeld: true, corridorMassacreWitnessed: true });
    } else if (choiceId === 'publish') {
      d.emit('news:headline', {
        kind: 'corridor_massacre_evidence', headline: 'THE MARGIN PUBLISHES CONCORD CORRIDOR RECORD',
        sourceId: 'contact_lira_vonn',
      });
      finish(d, live, state, 'published', {
        corridorMassacreWitnessed: true, valePathClosed: true, orrinPathOpen: true,
      });
    } else if (choiceId === 'engage') {
      d.setPassive(live, false);
      for (const entity of d.entsOf(live)) {
        const ai = entity.data && entity.data.ai;
        if (ai) { ai.forcePlayerTarget = true; ai.hostileTeams = [0]; }
      }
      d.emit('faction:aggro', { factionId: 'faction_scn', reason: 'corridor_massacre_witness', permanent: true });
      d.rep('faction_scn', -100, 'corridor_massacre_engaged');
      finish(d, live, state, 'engaged', {
        corridorMassacreWitnessed: true, concordHostileForever: true, dorinBranchUnlocked: true,
      });
    }
  },
});

function stageH6Battle(d, live) {
  const concord = d.entsOf(live, 'squad');
  const reach = d.entsOf(live, 'escort');
  if (!concord.length || !reach.length) return;
  const stage = (side, team, target, hostileTeam) => {
    for (const entity of side) {
      entity.team = team;
      const ai = entity.data && entity.data.ai;
      if (!ai) continue;
      // Lawful is used here only as the existing player-neutrality gate. The explicit retaliation
      // target keeps the two non-player teams fighting while both can still hail for aid.
      ai.lawful = true;
      ai.passive = false;
      ai.forcePlayerTarget = false;
      ai.retaliationTargetId = target.id;
      ai.hostileTeams = [hostileTeam];
    }
  };
  stage(concord, 3, reach[0], 4);
  stage(reach, 4, concord[0], 3);
  live.vars.h6Battle = {
    startedAt: d.now(),
    waitDeadlineAt: null,
    sides: {
      squad: concord.map((entity) => ({ id: entity.id, x: entity.pos.x, z: entity.pos.z })),
      escort: reach.map((entity) => ({ id: entity.id, x: entity.pos.x, z: entity.pos.z })),
    },
  };
}

function tipH6Battle(d, live, alliedRole) {
  const allied = d.entsOf(live, alliedRole);
  const hostile = d.entsOf(live, alliedRole === 'squad' ? 'escort' : 'squad');
  for (const entity of allied) {
    entity.team = 0;
    const ai = entity.data && entity.data.ai;
    if (!ai) continue;
    ai.lawful = false;
    ai.passive = false;
    ai.forcePlayerTarget = false;
    ai.retaliationTargetId = hostile[0] && hostile[0].id;
    ai.hostileTeams = [1];
  }
  for (const entity of hostile) {
    entity.team = 1;
    const ai = entity.data && entity.data.ai;
    if (!ai) continue;
    ai.lawful = false;
    ai.passive = false;
    ai.forcePlayerTarget = true;
    ai.retaliationTargetId = d.player() && d.player().id;
    ai.hostileTeams = [0];
  }
}

function vultureH6Battle(d, live, state, resolution) {
  const concord = d.entsOf(live, 'squad');
  const reach = d.entsOf(live, 'escort');
  const strength = (side) => side.reduce((sum, entity) => (
    sum + Math.max(0, entity.hull || 0) / Math.max(1, entity.hullMax || entity.hull || 1)
  ), 0);
  const concordStrength = strength(concord);
  const reachStrength = strength(reach);
  const concordWins = reach.length === 0 && concord.length > 0
    ? true
    : concord.length === 0 && reach.length > 0
      ? false
      : concordStrength === reachStrength
        ? (typeof state.rng === 'function' ? state.rng() < 0.5 : true)
        : concordStrength > reachStrength;
  const winners = concordWins ? concord : reach;
  const loserRole = concordWins ? 'escort' : 'squad';
  const battle = live.vars.h6Battle || {};
  const wreckSites = battle.sides && battle.sides[loserRole] || [];
  for (const site of wreckSites) {
    spawnStoryWreck(d, live, site.x - live.anchor.x, site.z - live.anchor.z,
      'Vultured battle wreck', {
        cmdty_classified_salvage: 2,
        cmdty_quantum_cores: 1,
        cmdty_weapons: 2,
      }, 'patrol_ambush_vulture_wreck');
    const entity = state.entities && state.entities.get(site.id);
    if (!entity) continue;
    entity.data = entity.data || {};
    entity.data.despawnAt = d.now() + 1;
    if (entity.data.ai) entity.data.ai.passive = true;
  }
  for (const entity of winners) {
    entity.team = 1;
    const ai = entity.data && entity.data.ai;
    if (!ai) continue;
    ai.lawful = false;
    ai.passive = false;
    ai.forcePlayerTarget = true;
    ai.retaliationTargetId = d.player() && d.player().id;
    ai.hostileTeams = [0];
  }
  live.vars.winner = concordWins ? 'concord' : 'reach';
  live.vars.waitResolution = resolution;
}

function settleH6Wait(d, live, state, resolution) {
  vultureH6Battle(d, live, state, resolution);
  d.emit('salvage:fieldVulture', {
    encounterId: live.id, sectorId: live.sectorId, loot: 'highest', risk: 'high',
    winner: live.vars.winner, resolution,
  });
  d.emit('encounter:winnerHostile', {
    encounterId: live.id, reason: 'vulture_claim', winner: live.vars.winner, resolution,
  });
  finish(d, live, state, 'vultured', {
    lastPatrolAmbushSide: 'vulture', lastPatrolAmbushResolution: resolution,
  });
}

const h6 = Object.freeze({
  fire(d, live, state) {
    begin(d, live, state, { spawn: true });
    stageH6Battle(d, live);
  },
  tick(d, live, state, now) {
    if (live.phase === 'waiting_battle') {
      const concordAlive = d.entsOf(live, 'squad').length;
      const reachAlive = d.entsOf(live, 'escort').length;
      if (concordAlive === 0 || reachAlive === 0) settleH6Wait(d, live, state, 'combat_outcome');
      else if (now >= Number(live.vars.h6Battle && live.vars.h6Battle.waitDeadlineAt)) {
        settleH6Wait(d, live, state, 'deterministic_timeout');
      }
      return;
    }
    timeoutChoice(d, live, state, now, h6.choose);
  },
  choose(d, live, state, choiceId) {
    if (choiceId === 'concord') {
      tipH6Battle(d, live, 'squad');
      d.rep('faction_scn', 4, 'patrol_ambush_aid');
      d.rep('faction_reach', -3, 'patrol_ambush_opposed');
      finish(d, live, state, 'concord', { lastPatrolAmbushSide: 'concord' });
    } else if (choiceId === 'reach') {
      tipH6Battle(d, live, 'escort');
      d.rep('faction_reach', 4, 'patrol_ambush_aid');
      d.rep('faction_scn', -3, 'patrol_ambush_opposed');
      finish(d, live, state, 'reach', { lastPatrolAmbushSide: 'reach' });
    } else if (choiceId === 'wait') {
      live.phase = 'waiting_battle';
      live.deadlineAt = 0;
      const battle = live.vars.h6Battle || (live.vars.h6Battle = { sides: {} });
      battle.waitDeadlineAt = d.now() + H6_WAIT_TIMEOUT_S;
      d.emit('encounter:waitStarted', {
        encounterId: live.id, deadlineAt: battle.waitDeadlineAt, reason: 'observe_battle',
      });
    }
  },
});

function settleMoralReturn(d, live, state, choiceId) {
  const debt = live.vars.debt;
  if (!debt || !['ask', 'accept', 'refuse'].includes(choiceId)) return;
  revealMoralDebt(state, debt.id);
  const memory = ensureMoralMemory(state);
  const flags = { lastMoralReturn: debt.id, lastMoralReturnMercyCount: memory.mercyCount };
  if (choiceId === 'ask') {
    const kindness = state.story.flags && state.story.flags.kindness ? ' Kindness recorded.' : '';
    d.say(live, 'info', `${debt.name}: You let me leave. Your ledger says mercy: ${memory.mercyCount}.${kindness}`,
      null, { literal: true });
  }
  if (choiceId === 'refuse') return finish(d, live, state, 'refused', flags);
  if (debt.disposition === 'ally') {
    d.emit('mission:offered', {
      type: 'moral_return', sourceId: debt.id, sourceName: debt.name,
      reason: 'survival_made_possible', mercyCount: memory.mercyCount,
    });
    return finish(d, live, state, 'allied', flags);
  }
  for (const entity of d.entsOf(live)) {
    const ai = entity.data && entity.data.ai;
    if (ai) { ai.passive = false; ai.forcePlayerTarget = true; ai.hostileTeams = [0]; }
  }
  d.emit('moralMemory:vengefulReturn', { id: debt.id, name: debt.name, encounterId: live.id });
  return finish(d, live, state, 'vengeful', flags);
}

const h7 = Object.freeze({
  fire(d, live, state) {
    const debt = nextMoralDebt(state);
    if (!debt) { d.abort(live, 'missing_moral_debt'); return; }
    live.vars.debt = { ...debt };
    live.factionId = debt.factionId;
    const tier = Math.max(1, Math.min(3, debt.escalationTier | 0));
    const count = debt.disposition === 'ally' ? 1 : 2 + Math.min(2, tier);
    live.plan.ships = Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return {
        archetype: index === 0 ? (debt.archetype || 'corsair_raider') : 'wasp_swarmer',
        level: Math.max(4, debt.mercyOrdinal + 3 + tier - (index === 0 ? 0 : 1)),
        pos: { x: live.anchor.x + Math.cos(angle) * 280, z: live.anchor.z + Math.sin(angle) * 280 },
        factionId: debt.factionId,
        context: debt.disposition === 'ally' ? 'convoy_civilian' : 'encounter',
        doctrine: debt.disposition === 'ally' ? 'balanced' : 'scavenger',
        formation: 'loose', role: index === 0 ? 'return' : 'escort',
        passive: debt.disposition === 'ally', team: debt.disposition === 'ally' ? 0 : 1,
      };
    });
    begin(d, live, state, { spawn: true });
    if (debt.disposition === 'vengeful') {
      for (const entity of d.entsOf(live)) {
        const ai = entity.data && entity.data.ai;
        if (ai) { ai.forcePlayerTarget = true; ai.hostileTeams = [0]; }
      }
    }
  },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h7.choose); },
  choose(d, live, state, choiceId) { settleMoralReturn(d, live, state, choiceId); },
});
function earlierPlayerLine(state) {
  const lines = state.story && state.story.playerChoiceLines;
  return Array.isArray(lines) && lines.length ? String(lines[lines.length - 1]) : 'I was here.';
}

const h8 = Object.freeze({
  fire(d, live, state) {
    const player = d.player();
    if (!player || !live.anchor) { d.abort(live, 'missing_echo_source'); return; }
    const playerData = player.data || {};
    const defId = playerData.defId || 'ship_kestrel';
    const fittings = Array.isArray(playerData.fittings)
      ? playerData.fittings.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
      : [];
    const echoSpec = makeShipEntitySpec(defId, {
      team: player.team,
      factionId: player.factionId,
      fittings,
      player: state.player,
      pos: { x: live.anchor.x + 100, z: live.anchor.z },
      ai: { archetype: 'mirror_echo' },
    });
    echoSpec.data.echoOfPlayer = true;
    echoSpec.data.callsign = 'Tessera Echo';
    echoSpec.data.scanLabel = 'Tessera Echo';
    echoSpec.data.role = 'echo';
    const planned = Array.isArray(live.plan.ships) && live.plan.ships[0] || {};
    live.plan.ships = [{
      ...planned,
      entitySpec: echoSpec,
      team: player.team,
      factionId: player.factionId,
      context: 'anomaly_echo',
      role: 'echo',
      passive: true,
    }];
    begin(d, live, state, { spawn: true, timeout: false, primaryLine: h8PrimaryLine(state, live.shape.primaryLine) });
    const echo = d.entsOf(live)[0];
    if (!echo || !player || !live.anchor) { d.abort(live, 'missing_echo'); return; }
    live.vars.mirrorCenter = { x: live.anchor.x, z: live.anchor.z };
    live.vars.matchedS = 0;
    live.vars.lastMirrorAt = d.now();
    echo.pos.x = live.anchor.x + 100;
    echo.pos.z = live.anchor.z;
    echo.vel = echo.vel || { x: 0, z: 0 };
    echo.vel.x = 12;
    echo.vel.z = 0;
    d.setPassive(live, true);
  },
  tick(d, live, state, now) {
    const echo = d.entsOf(live)[0];
    const player = d.player();
    const center = live.vars.mirrorCenter;
    if (!echo || !player || !center) return;
    const positionError = Math.hypot(
      (player.pos.x + echo.pos.x) - center.x * 2,
      (player.pos.z + echo.pos.z) - center.z * 2,
    );
    const velocityError = Math.hypot(
      numberOr(player.vel && player.vel.x, 0) + numberOr(echo.vel && echo.vel.x, 0),
      numberOr(player.vel && player.vel.z, 0) + numberOr(echo.vel && echo.vel.z, 0),
    );
    const elapsed = Math.max(0, now - numberOr(live.vars.lastMirrorAt, now));
    live.vars.lastMirrorAt = now;
    if (positionError <= live.shape.mirrorCourse.maxPositionError
      && velocityError <= live.shape.mirrorCourse.maxVelocityError) live.vars.matchedS += elapsed;
    else live.vars.matchedS = 0;
    if (live.vars.matchedS >= live.shape.mirrorCourse.durationS) {
      const secret = h8MirrorSecret(state);
      d.say(live, 'info', secret.line, null, { literal: true });
      finish(d, live, state, 'synced', { volsMirrorSecretUnlocked: true, volsMirrorSecret: secret.id });
    }
  },
  choose(d, live, state, choiceId) {
    if (choiceId === 'hail') {
      const line = earlierPlayerLine(state);
      d.say(live, 'info', `TESSERA: ${line}`, null, { literal: true });
      finish(d, live, state, 'hailed', { echoQuotedLine: line });
    } else if (choiceId === 'break') {
      d.emit('sensorGhost:swarm', { encounterId: live.id, pos: { ...live.anchor }, count: 7 });
      finish(d, live, state, 'shattered', { echoShattered: true });
    }
  },
  event(d, live, state, name, payload) {
    if (name === 'playerHitSquad') h8.choose(d, live, state, 'break');
    else if (name === 'tetherAttached' && payload && live.ids.includes(payload.targetId)) {
      h8.choose(d, live, state, 'break');
    }
  },
});

// h9 — generic literary encounter handler. Used by authored side-mission encounters
// that need no bespoke prop-spawning or combat logic: the narrative surface is the
// primaryLine → choices → receipts chain. Each encounter's `graffitiOn` map (keyed by
// choiceId → { line, where, author }) optionally emits graffiti on resolve. Deterministic:
// no Math.random, no wall-clock; reuses begin/timeoutChoice/finish infrastructure.
const h9 = Object.freeze({
  fire(d, live, state) { begin(d, live, state); },
  tick(d, live, state, now) { timeoutChoice(d, live, state, now, h9.choose); },
  choose(d, live, state, choiceId) {
    const g = live.shape.graffitiOn && live.shape.graffitiOn[choiceId];
    if (g) d.emit('graffiti:show', { line: g.line, where: g.where || 'airlock', author: g.author || 'unknown' });
    finish(d, live, state, choiceId);
  },
});

export const E1_ENCOUNTER_RUNTIMES = Object.freeze({ h1, h2, h3, h4, h5, h6, h7, h8, h9 });

function numberOr(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function h3PrimaryLine(state, fallback) {
  const flags = state.story && state.story.flags || {};
  if (flags.volsEchoUnlocked) return 'VOLS ECHO: Tessera. We already vented. Keep the engines warm.';
  if (flags.volsBlackBoxRecovered) return 'DERELICT: Tessera. The Vols black box knows this hull.';
  if (flags.volsMaydayGhost) return 'GHOST MAYDAY: Tessera drive gone. The derelict answers.';
  return fallback;
}

function h8PrimaryLine(state, fallback) {
  const flags = state.story && state.story.flags || {};
  if (flags.orrinPathOpen) return 'ORRIN RECORD: Tessera signature mirrored inside the published corridor file.';
  if (flags.concordHostileForever) return 'CONCORD WARRANT: Tessera echo classified hostile forever.';
  if (flags.understoryPermanentGrudge) return 'UNDERSTORY: We keep the first shot. Your echo keeps it too.';
  if (flags.understoryTradePosture === 'open_early') return 'UNDERSTORY: We answered together. Now Tessera answers herself.';
  if (flags.kindness) return 'KINDNESS RETURN: the quiet buoy route echoes your Tessera signature.';
  if (flags.kurtzDeskVolsLetter) return 'VOLS LETTER: Tessera, your signature is ahead, flying backward.';
  return fallback;
}

function h8MirrorSecret(state) {
  const flags = state.story && state.story.flags || {};
  if (flags.orrinPathOpen) return { id: 'orrin_witness', line: 'VOLS: Orrin kept the corridor copy under the warmer engine.' };
  if (flags.concordHostileForever) return { id: 'concord_warrant', line: 'VOLS: The warrant names the ship, not the pilot.' };
  if (flags.volsLetterCarried) return { id: 'vols_letter', line: 'VOLS: Take the letter to the desk. Kurtz knew the route.' };
  if (flags.understoryPermanentGrudge) return { id: 'understory_first_shot', line: 'VOLS: The bloom remembers which muzzle flashed first.' };
  return { id: 'warmer_engine', line: 'VOLS: If the ship answers herself, follow the warmer engine.' };
}
