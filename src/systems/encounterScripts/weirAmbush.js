// src/systems/encounterScripts/weirAmbush.js — LW-02 "The Cargo Weir Ambush".
//
// A Reach salvage crew is stripping a seized cargo hulk inside a customs weir while an SCN
// cordon cutter holds the impound line. A hostile tether specialist sits masked outbound of
// the gate, waiting for a runner. The player can hand the hulk to law, tow it through the
// gap for the crew's cut, or refuse and take the specialist head-on.
//
// Phases: approach → offer → task (law | theft) → conflict → done.
// Determinism: no Math.random, no wall clock — d.stream(live, label) and state.simTime only.
// Hostility: the specialist is passive until it springs; patrol stays lawful+passive forever.
// Consequences ride d.grant / d.rep / lawSecurity.reportIncident / d.resolve — never direct
// writes to credits, rep, heat, or story.

import { occupantGenerationOf } from '../../core/entity.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import { customsWeirForSector } from '../../world/customsWeir.js';
import { SECTOR_GLOBAL_ORIGINS } from '../../data/sectorCoordinates.js';

// ── tuning ────────────────────────────────────────────────────────────────────────────────
const APPROACH_S = 2;               // hail beat before the offer deck opens
const OFFER_S = 30;                 // decision window before silence reads as a refusal
const TASK_S = 240;                 // physical tow window once a branch is picked
const HULK_RADIUS = 11;
const HULK_MASS = 90;               // tow-class for a starter line: it moves, grudgingly
const BALLAST_RADIUS = 5;
const BALLAST_MASS = 14;            // throwable counterplay for the specialist
const TASK_OUTBOUND_WU = 300;       // theft clears the weir past the anchor by this much
const TASK_SPRING_WU = 60;          // outbound displacement that reads as a committed run
const PATROL_HOLD_WU = 150;         // lawful delivery: hulk this close to a live patrol
const PATROL_CLEAR_WU = 160;        // theft fails while a live patrol is on top of the lot
const SETTLE_SPEED = 3;             // the lot must actually be at rest for custody
const ESCAPE_R = 2600;              // refusal fight ends when the player is this far out
const LEAVE_PAD_WU = 1000;          // player beyond zoneRadius + this abandoned the scene
const SPECIALIST_LEASH = 3400;
const THEFT_PAY = 200;              // the crew's cut for running the gap
const ASSIST_PAY = 150;             // customs impound-assist fee
const ASSIST_REP = 8;
const THEFT_REP = -10;

// One finite scene, inside the existing story save bag. Physical state belongs to the normal
// persistent-entity serializer; this row holds only stable cast slots and phase/clock state.
const OWNER = 'weirAmbush';
const CONTINUATION_FIELDS = [
  'task', 'taskDeadlineAt', 'specialistSprung', 'sprungAt', 'conflictOutcome',
  'salvorsFled', 'approachEndsAt',
];
function visitOf(state) { return state.story?.depthProgramEncounters?.weirAmbush || null; }
function writeVisit(state, visit) {
  const story = state.story || (state.story = {});
  const memory = story.depthProgramEncounters || (story.depthProgramEncounters = {});
  memory.weirAmbush = visit;
}
function ownActor(live, e, slot, role = null) {
  e.flags = { ...e.flags, persistent: true };
  e.data.persistenceOwner = OWNER;
  e.data.weirVisitId = live.id;
  e.data.weirSlot = slot;
  e.data.stableId ||= `weir:${live.id}:${slot}`;
  live.data.actorRefs.push({ slot, role, stableId: e.data.stableId, type: e.type });
}
function playerOwnsActor(state, e) {
  if (e.id === state.playerId) return true;
  const vesselId = e.data?.vesselId;
  if (!vesselId) return false;
  // Inventory/custody own this decision, never a mutable team or a former scene role.
  if (state.player?.ownedShips?.some(ship => ship.vesselId === vesselId)) return true;
  const vessel = (state.player?.shipjack || state.shipjack)?.vesselsById?.[vesselId];
  return vessel?.custodian === 'player' && vessel.generation === e.data.shipjackGeneration;
}
function sceneOwnsActor(live, e) {
  return !!e && occupantGenerationOf(e) === live.data.gens?.[e.id]
    && e.data?.persistenceOwner === OWNER && e.data.weirVisitId === live.id;
}
function releaseActor(live, state, e) {
  if (!sceneOwnsActor(live, e)) return;
  // Ships admission already made the captured physical hull persistent. Relinquish only
  // this scene's claim; stripping that flag would also erase the new owner's save body.
  if (!playerOwnsActor(state, e)) delete e.flags.persistent;
  else if (e.data.despawnBy === live.id) {
    delete e.data.despawnAt;
    delete e.data.despawnBy;
  }
  delete e.data.persistenceOwner;
}
function releaseAcquiredActors(live, state) {
  for (const id of [...live.ids, ...(live.propIds || [])]) {
    const e = entOf(state, id);
    if (e && playerOwnsActor(state, e)) releaseActor(live, state, e);
  }
}
function captureVisit(live, state) {
  if (live.phase === 'done' || live.data.settled || visitOf(state)?.status === 'terminal') return;
  releaseAcquiredActors(live, state);
  const data = { weir: { inDir: { ...live.data.weir.inDir }, outDir: { ...live.data.weir.outDir },
    gapRange: live.data.weir.gapRange } };
  for (const key of CONTINUATION_FIELDS) if (live.data[key] !== undefined) data[key] = live.data[key];
  writeVisit(state, { version: 1, status: 'active', encounterId: live.id,
    sectorId: live.sectorId, zoneId: live.zoneId, zoneName: live.zoneName,
    anchor: { ...live.anchor }, zoneRadius: live.zoneRadius, phase: live.phase,
    deadlineAt: live.deadlineAt, offerConsumed: !!live.offerConsumed,
    actorRefs: live.data.actorRefs.map(ref => ({ ...ref })), data });
}
function releaseActors(live, state) {
  // A recycled id must never have its foreign persistence or lifetime changed.
  for (const id of [...live.ids, ...(live.propIds || [])]) {
    releaseActor(live, state, entOf(state, id));
  }
}

function entOf(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}
function alive(e) { return !!e && e.alive !== false; }
function finitePos(e) {
  return e && e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z) ? e.pos : null;
}
function speedOf(e) {
  const v = e && e.vel;
  if (!v) return 0;
  const x = Number(v.x), z = Number(v.z);
  return (Number.isFinite(x) && Number.isFinite(z)) ? Math.hypot(x, z) : NaN;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
function offsetOf(anchor, dir, wu) { return { x: anchor.x + dir.x * wu, z: anchor.z + dir.z * wu }; }

/**
 * The weir's axis: the direction INBOUND toward the sector's own heart (hub/station side).
 * Every border_checkpoint sits on the sector's gate edge, so "inbound" is the bearing from
 * the checkpoint anchor toward the sector origin — the same bearing the authored weir data
 * encodes (Tethys cone heading, Dione funnel axis, Helios corridor axis all agree). The
 * weir's own range only sizes how far past the gate the masked specialist sits.
 */
function weirAxes(live) {
  const weir = customsWeirForSector(live.sectorId) || null;
  let gapRange = 280;
  if (weir) {
    if (Number.isFinite(weir.range)) gapRange = weir.range;
    else if (Number.isFinite(weir.length)) gapRange = weir.length;
    else if (Number.isFinite(weir.halfLength)) gapRange = weir.halfLength;
  }
  const origin = SECTOR_GLOBAL_ORIGINS[live.sectorId];
  const dx = origin ? origin.x - live.anchor.x : 0;
  const dz = origin ? origin.z - live.anchor.z : 0;
  const len = Math.hypot(dx, dz);
  const inDir = len > 1e-3 ? { x: dx / len, z: dz / len } : { x: 0, z: -1 };
  return { inDir, outDir: { x: -inDir.x, z: -inDir.z }, gapRange };
}

/** Outbound displacement: how far the hulk has gone past the gate, in wu. */
function outboundDisp(live, e) {
  const axes = live.data.weir;
  if (!axes || !finitePos(e)) return -Infinity;
  return (e.pos.x - live.anchor.x) * axes.outDir.x + (e.pos.z - live.anchor.z) * axes.outDir.z;
}

/** A roster member the encounter spawned — alive, role-matched, and still the same occupant. */
function memberOf(d, live, state, role) {
  for (const e of d.entsOf(live, role)) {
    if (!sceneOwnsActor(live, e)) continue;
    if (playerOwnsActor(state, e)) { releaseActor(live, state, e); continue; }
    return e;
  }
  return null;
}
function membersOf(d, live, state, role) {
  const out = [];
  for (const e of d.entsOf(live, role)) {
    if (!sceneOwnsActor(live, e)) continue;
    if (playerOwnsActor(state, e)) { releaseActor(live, state, e); continue; }
    out.push(e);
  }
  return out;
}
function hulkOf(live, state) {
  const e = entOf(state, live.data && live.data.hulkId);
  if (!sceneOwnsActor(live, e) || e.alive === false) return null;
  if (playerOwnsActor(state, e)) { releaseActor(live, state, e); return null; }
  return e;
}

/** True while the player's Massline still holds the given body — released, cut, or broken is false. */
function playerTetheredTo(state, id) {
  const t = state.player && state.player.tether;
  return !!(t && t.active === true && t.targetId === id);
}

function departed(live, player) {
  if (!live.anchor || !finitePos(player)) return false;
  const r = (live.zoneRadius || 400) + LEAVE_PAD_WU;
  return dist2(player.pos, live.anchor) > r * r;
}

function recordGens(d, live, state) {
  const gens = live.data.gens || (live.data.gens = {});
  for (const e of d.entsOf(live)) gens[e.id] = occupantGenerationOf(e);
  for (const id of live.propIds || []) {
    const e = entOf(state, id);
    if (e) gens[id] = occupantGenerationOf(e);
  }
}

/** The specialist comes off the mask. trigger ∈ explicit_refusal | ignored_demand | player_attack. */
function springSpecialist(d, live, state, trigger) {
  if (live.data.specialistSprung) return;
  const spec = memberOf(d, live, state, 'specialist');
  if (!spec || !spec.data || !spec.data.ai) return;
  live.data.specialistSprung = trigger;
  live.data.sprungAt = d.now();
  // Flip the one member through the roster helper so its activity is rebuilt as a conflict
  // spawn, then stamp the escalation fields the engagement authority requires.
  d.setPassive(live, false, 'specialist');
  const ai = spec.data.ai;
  ai.motive = (live.shape && live.shape.motive) || 'cargo_extortion';
  ai.engagementTrigger = trigger;
  ai.motiveSatisfied = false;
  ai.approachTelegraph = 'attach_spool';
  ai.noFireResponseWindowS = 2;
  const player = d.player();
  const combat = spec.data.combat || (spec.data.combat = {});
  if (player && player.id != null) combat.targetId = player.id;
  setEntityDoctrine(spec, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason: `${live.shapeId}:conflict:specialist`,
      anchor: live.anchor,
      leashRadius: SPECIALIST_LEASH,
      startedTick: state.tick | 0,
      targetId: player && player.id != null ? player.id : null,
      routeId: live.zoneId,
      encounterId: live.id,
    },
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const line = (live.shape && live.shape.springBark) || null;
  if (line) d.say(live, 'alert', line, null, { literal: true });
}

function fleeSalvors(d, live, afterS) {
  if (live.data.salvorsFled) return;
  live.data.salvorsFled = true;
  // These scene-owned hulls stay saveable until their authored departure, so the generic
  // despawn helper correctly declines them. The scene may schedule its own original cast.
  let i = 0;
  for (const e of membersOf(d, live, d.state, 'salvor')) {
    e.data.despawnAt = d.now() + afterS + i++ * 0.5;
    e.data.despawnBy = live.id;
  }
}

/** The witnessed cargo-theft report — the law owner's own intake; a denial is a valid outcome. */
function reportTheftIncident(d, live, state, hulk) {
  const law = d.registry && typeof d.registry.get === 'function' ? d.registry.get('lawSecurity') : null;
  if (!law || typeof law.reportIncident !== 'function' || !hulk || !finitePos(hulk)) return null;
  const patrol = memberOf(d, live, state, 'patrol');
  const receipt = law.reportIncident({
    reportId: `weir-hulk-theft:${live.id}`,
    kind: 'payload_theft',
    offenderStableId: 'player',
    offenderEntityId: state.playerId,
    payloadStableId: (hulk.data && hulk.data.stableId) || `weir-hulk:${live.id}`,
    causalTick: Number.isInteger(state.tick) ? Math.max(0, state.tick) : 0,
    pos: { x: hulk.pos.x, z: hulk.pos.z },
    victimEntityId: patrol ? patrol.id : null,
  });
  live.data.theftIncidentId = receipt && receipt.incidentReceiptId || null;
  live.data.theftIncidentDenied = receipt && receipt.accepted === false ? receipt.reason || 'denied' : null;
  return receipt;
}

function lawfulDeliveryComplete(d, live, state, hulk) {
  if (!alive(hulk) || !finitePos(hulk)) return false;
  if (playerTetheredTo(state, hulk.id)) return false;
  if (!(speedOf(hulk) < SETTLE_SPEED)) return false;
  // Custody transfers to a living lawful eye: a dead cordon accepts nothing.
  for (const p of membersOf(d, live, state, 'patrol')) {
    if (dist(hulk.pos, p.pos) <= PATROL_HOLD_WU) return true;
  }
  return false;
}

function theftComplete(d, live, state, hulk) {
  if (!alive(hulk) || !finitePos(hulk)) return false;
  if (playerTetheredTo(state, hulk.id)) return false;
  if (!(speedOf(hulk) < SETTLE_SPEED)) return false;
  if (outboundDisp(live, hulk) < TASK_OUTBOUND_WU) return false;
  // The cordon must not be on top of the lot — a patrol that followed the tow spoils the run.
  for (const p of membersOf(d, live, state, 'patrol')) {
    if (dist(hulk.pos, p.pos) < PATROL_CLEAR_WU) return false;
  }
  return true;
}

function settle(d, live, state, outcome) {
  if (live.phase === 'done' || live.data.settled) return;
  const prior = visitOf(state);
  if (prior?.status === 'terminal') return d.resolve(live, prior.outcome, { speak: false });
  live.data.settled = true;
  // Mark terminal before any owner intent can synchronously trigger a save. Restore never
  // replays a grant, reputation change or theft report, even if saved inside a consequence.
  writeVisit(state, { version: 1, status: 'terminal', encounterId: live.id,
    sectorId: live.sectorId, outcome, at: d.now() });
  const hulk = hulkOf(live, state);
  if (outcome === 'weir_lawful_assist') {
    // Consequences before resolve — intents ride the facade, never direct state writes.
    d.grant(ASSIST_PAY, 'weir:impound_fee');
    d.rep('faction_scn', ASSIST_REP, 'weir_impound_assist');
    if (hulk && hulk.data) {
      hulk.data.scanLabel = 'IMPOUNDED HULK — IN CUSTOMS CUSTODY';
      hulk.data.masslineTetherable = false;
      hulk.data.tetherable = false;
    }
    d.say(live, 'info',
      'SALVOR LEAD: That was OUR cut, hauler. Customs doesn\'t pay what we do.',
      null, { literal: true });
    fleeSalvors(d, live, 18);
  } else if (outcome === 'weir_theft') {
    d.grant(THEFT_PAY, 'weir:salvage_cut');
    d.rep('faction_scn', THEFT_REP, 'weir_impound_theft');
    reportTheftIncident(d, live, state, hulk);
    if (hulk && hulk.data) hulk.data.scanLabel = 'SEIZED CARGO HULK — MISSING FROM IMPOUND';
    d.say(live, 'info',
      'SALVOR LEAD: Clean through the gap — half is yours, as promised.',
      null, { literal: true });
    fleeSalvors(d, live, 24);
  } else if (outcome === 'weir_stalled') {
    fleeSalvors(d, live, 20);
  }
  d.resolve(live, outcome, { vars: live.vars });
}

export const weirAmbush = {
  hasVisit(state) { return !!visitOf(state); },

  restoreSaved(d, state) {
    const saved = visitOf(state);
    if (!saved || saved.status !== 'active') return null;
    const existing = state.encounterDirector.live[saved.encounterId];
    if (existing) return existing;
    const live = d.restoreEncounterRecord({ encounterId: saved.encounterId,
      shapeId: 'cargo_weir_ambush', sectorId: saved.sectorId, zoneId: saved.zoneId,
      zoneName: saved.zoneName, zoneType: 'border_checkpoint', zoneCenter: saved.anchor,
      zoneRadius: saved.zoneRadius, squadId: saved.encounterId, ships: [] });
    if (!live) return null;
    live.phase = saved.phase;
    live.deadlineAt = saved.deadlineAt;
    live.offerConsumed = saved.offerConsumed;
    live.data = { ...saved.data, actorRefs: saved.actorRefs.map(ref => ({ ...ref })),
      gens: {}, ballastIds: [] };
    // Binding requires the exact stable slot AND the scene's physical ownership. Never
    // spawn missing cargo/cast, and never adopt an unrelated occupant of an old numeric id.
    for (const ref of saved.actorRefs) {
      const matches = state.entityList.filter(e => alive(e) && e.type === ref.type
        && e.data?.persistenceOwner === OWNER && e.data.weirVisitId === saved.encounterId
        && e.data.weirSlot === ref.slot && e.data.stableId === ref.stableId);
      if (matches.length !== 1) continue;
      const e = matches[0];
      live.data.gens[e.id] = occupantGenerationOf(e);
      if (playerOwnsActor(state, e)) { releaseActor(live, state, e); continue; }
      if (ref.role) {
        live.ids.push(e.id);
        live.roles[e.id] = ref.role;
      } else {
        live.propIds.push(e.id);
        if (ref.slot === 'hulk') live.data.hulkId = e.id;
        else live.data.ballastIds.push(e.id);
      }
    }
    if (!hulkOf(live, state)) {
      settle(d, live, state, 'weir_hulk_lost');
      return null;
    }
    if (live.phase === 'offer') {
      d.offerChoices(live, live.shape.choices.map(c => c.id), live.shape.timeoutChoice, live.deadlineAt);
    }
    return live;
  },

  captureSave(d, live, state) { captureVisit(live, state); },

  retire(d, live, state, reason) {
    // save:loaded retires an outgoing coordinator after incoming bodies have been restored.
    // It must not touch the incoming timeline, even if numeric ids happen to coincide.
    if (reason === 'save_loaded') return;
    releaseActors(live, state);
  },

  depart(d, live, state) { settle(d, live, state, 'weir_abandoned'); },

  fire(d, live, state) {
    const anchor = live.anchor;
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) {
      return d.abort(live, 'no_anchor');
    }
    const axes = weirAxes(live);
    live.data.weir = axes;
    const rng = d.stream(live, 'weir_layout');
    const perp = { x: -axes.outDir.z, z: axes.outDir.x };

    // Deterministic scene layout from the plan stream: the hulk sits just inside the gate,
    // the patrol holds the cordon line inbound, the crew works the hull, and the specialist
    // masks outbound past the gap.
    const hulkPos = offsetOf(anchor, axes.outDir, 55 + rng() * 25);
    const holdPos = offsetOf(anchor, axes.inDir, 150);
    const specPos = offsetOf(anchor, axes.outDir, axes.gapRange + 100 + rng() * 70);
    const posFor = {
      specialist: [specPos],
      patrol: [
        offsetOf(holdPos, perp, -(48 + rng() * 18)),
        offsetOf(holdPos, perp, 48 + rng() * 18),
      ],
      salvor: [
        offsetOf(hulkPos, perp, 50 + rng() * 14),
        offsetOf(hulkPos, perp, -(50 + rng() * 14)),
        offsetOf(hulkPos, axes.outDir, 30 + rng() * 12),
      ],
    };
    const take = { specialist: 0, patrol: 0, salvor: 0 };
    const specs = [];
    const counts = { specialist: 0, patrol: 0, salvor: 0 };
    // The authored roster comes from the plan; the script assigns the physical layout.
    for (const sh of (live.plan && live.plan.ships) || []) {
      const role = sh.compositionRole === 'identity_anchor' ? 'specialist'
        : sh.role === 'escort' ? 'patrol' : 'salvor';
      const pos = (posFor[role] && posFor[role][take[role]++ % posFor[role].length]) || anchor;
      counts[role]++;
      specs.push({
        ...sh,
        role,
        pos: { ...pos },
        team: role === 'specialist' ? 1 : 2,
        context: role === 'specialist' ? 'encounter' : role === 'patrol' ? 'patrol' : 'civilian',
        factionId: role === 'patrol' ? 'faction_scn' : 'faction_reach',
        passive: true,
        scanLabel: role === 'specialist' ? 'UNKNOWN CONTACT — MASKED, HOLDING OUTBOUND'
          : role === 'patrol' ? 'SCN CORDON CUTTER — IMPOUND LINE'
          : 'REACH SALVOR — WORKING THE SEIZURE',
      });
    }
    if (!counts.specialist || !counts.patrol || !counts.salvor) return d.abort(live, 'no_cast');
    const ids = d.spawnShips(live, specs);
    if (!ids.length) return d.abort(live, 'no_budget');
    if (!d.aliveCount(live, 'specialist') || !d.aliveCount(live, 'patrol')) {
      return d.abort(live, 'no_cast');
    }

    // The hulk is a real tetherable dynamic body — the whole encounter is a physical task
    // on a real pose, not a dialogue.
    const hulk = d.spawnProp(live, {
      type: 'payload', pos: hulkPos, radius: HULK_RADIUS, mass: HULK_MASS, tetherable: true,
      scanLabel: 'SEIZED CARGO HULK — CUSTOMS IMPOUND, TAMPER-SEALED',
      storyPropKind: 'weir_cargo_hulk',
    });
    if (!hulk) return d.abort(live, 'no_bodies');
    hulk.physicsBody = { shape: 'ball', mass: HULK_MASS, dynamic: true };
    hulk.data.masslineTetherable = true;
    hulk.data.stableId = `weir-hulk:${live.id}`;
    live.data.hulkId = hulk.id;
    live.data.ballastIds = [];
    for (const side of [1, -1]) {
      const ballast = d.spawnProp(live, {
        type: 'payload',
        pos: offsetOf(hulkPos, perp, side * (24 + rng() * 10)),
        radius: BALLAST_RADIUS, mass: BALLAST_MASS, tetherable: true,
        scanLabel: 'LOOSE BALLAST — SHEARED OFF THE HULK',
        storyPropKind: 'weir_ballast',
      });
      if (ballast) {
        ballast.physicsBody = { shape: 'ball', mass: BALLAST_MASS, dynamic: true };
        ballast.data.masslineTetherable = true;
        live.data.ballastIds.push(ballast.id);
      }
    }
    recordGens(d, live, state);
    live.data.actorRefs = [];
    const countsByRole = {};
    for (const e of d.entsOf(live)) {
      const role = live.roles[e.id];
      const index = countsByRole[role] || 0;
      countsByRole[role] = index + 1;
      ownActor(live, e, `${role}:${index}`, role);
    }
    ownActor(live, hulk, 'hulk');
    for (const [index, id] of live.data.ballastIds.entries()) {
      ownActor(live, entOf(state, id), `ballast:${index}`);
    }

    live.data.task = null;
    live.data.taskDeadlineAt = 0;
    live.data.specialistSprung = null;
    live.data.conflictOutcome = null;
    live.data.salvorsFled = false;
    live.data.approachEndsAt = d.now() + APPROACH_S;
    live.phase = 'approach';
    live.approach = { signal: 'cargo_weir', contacts: ids.length + 1, t: d.now() };
    captureVisit(live, state);

    const shape = live.shape || {};
    d.say(live, 'bark', shape.primaryLine
      || 'SALVOR LEAD: Hauler — this hulk is a customs write-off. Tow it to the cordon and the law tips you; run it through the gap and we pay double.',
      null, { primary: true, literal: true });
    d.say(live, 'alert', shape.patrolLine
      || 'CORDON: Impound line is set. Anything crossing the gate outbound is seized or shot.',
      null, { literal: true });
  },

  tick(d, live, state, now) {
    const b = live.data;
    if (!b || b.settled || live.phase === 'done') return;
    releaseAcquiredActors(live, state);
    const player = d.player();
    if (!alive(player)) return;
    const hulk = hulkOf(live, state);
    if (!hulk) return settle(d, live, state, 'weir_hulk_lost');
    if (departed(live, player)) return settle(d, live, state, 'weir_abandoned');

    if (live.phase === 'approach') {
      if (now < b.approachEndsAt) return;
      live.phase = 'offer';
      const deadline = now + (live.shape && live.shape.offerS || OFFER_S);
      live.deadlineAt = deadline;
      const ids = ((live.shape && live.shape.choices) || []).map((c) => c.id);
      d.offerChoices(live, ids, (live.shape && live.shape.timeoutChoice) || 'refuse', deadline);
      captureVisit(live, state);
      return;
    }

    if (live.phase === 'offer') {
      if (now >= live.deadlineAt) return weirAmbush.choose(d, live, state, 'timeout');
      return;
    }

    if (live.phase === 'task') {
      // A committed outbound run is the specialist's cue — it was waiting for a runner.
      if (b.task === 'theft' && !b.specialistSprung && outboundDisp(live, hulk) >= TASK_SPRING_WU) {
        springSpecialist(d, live, state, 'ignored_demand');
      }
      if (b.task === 'law' && lawfulDeliveryComplete(d, live, state, hulk)) {
        return settle(d, live, state, 'weir_lawful_assist');
      }
      if (b.task === 'theft' && theftComplete(d, live, state, hulk)) {
        return settle(d, live, state, 'weir_theft');
      }
      if (now >= b.taskDeadlineAt) return settle(d, live, state, 'weir_stalled');
      captureVisit(live, state);
      return;
    }

    if (live.phase === 'conflict') {
      const spec = memberOf(d, live, state, 'specialist');
      if (!alive(spec)) return settle(d, live, state, b.conflictOutcome || 'weir_refused');
      if (dist2(player.pos, spec.pos) >= ESCAPE_R * ESCAPE_R) {
        return settle(d, live, state, b.conflictOutcome || 'weir_refused');
      }
    }
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    const b = live.data;
    const shape = live.shape || {};
    const ack = shape.ackBarks || {};
    const now = d.now();
    if (choiceId === 'assist') {
      d.say(live, 'bark', ack.assist
        || 'SALVOR LEAD: Fine — hand it to the badge. We\'ll take the impound fee either way.',
        null, { literal: true });
      d.say(live, 'alert', 'CORDON: Smart. Put the hulk beside my line and cut the line clean.',
        null, { literal: true });
      b.task = 'law';
      b.taskDeadlineAt = now + (shape.taskS || TASK_S);
      live.phase = 'task';
      captureVisit(live, state);
      return;
    }
    if (choiceId === 'theft') {
      d.say(live, 'bark', ack.theft
        || 'SALVOR LEAD: Half is yours — run it past the gate and drop it clear of the cutters.',
        null, { literal: true });
      b.task = 'theft';
      b.taskDeadlineAt = now + (shape.taskS || TASK_S);
      live.phase = 'task';
      captureVisit(live, state);
      return;
    }
    // refuse, or silence at the deadline: the offer collapses into the spring.
    d.say(live, 'bark', ack.refused
      || 'SALVOR LEAD: Your loss, hauler. Specialist — earn your cut.',
      null, { literal: true });
    const trigger = choiceId === 'timeout' ? 'ignored_demand' : 'explicit_refusal';
    b.conflictOutcome = 'weir_refused';
    live.phase = 'conflict';
    springSpecialist(d, live, state, trigger);
    fleeSalvors(d, live, 14);
    captureVisit(live, state);
  },

  event(d, live, state, name) {
    if (name !== 'playerHitSquad') return;
    if (live.phase === 'offer') {
      // Opening fire during the offer is refusal by trigger — same collapse as a refusal,
      // stamped for what it was.
      live.data.conflictOutcome = 'weir_refused';
      live.phase = 'conflict';
      springSpecialist(d, live, state, 'player_attack');
      fleeSalvors(d, live, 12);
      captureVisit(live, state);
      return;
    }
    if (live.phase === 'task' && !live.data.specialistSprung) {
      // Under the tow it still springs — the work may continue under fire.
      springSpecialist(d, live, state, 'player_attack');
      captureVisit(live, state);
    }
  },
};
