import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { weirAmbush } from '../src/systems/encounterScripts/weirAmbush.js';
import { TETHYS_CUSTOMS_WEIR, pointInsideCustomsWeir } from '../src/world/customsWeir.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';

// LW-02 — The Cargo Weir Ambush. A licensed MTS strip crew works a seized hulk at the
// impound yard inside the Tethys gate; an SCN cordon holds the impound line; a masked
// Reach thief flight contests the hulk. The scene sits BEYOND the weir cone's read
// reach so the lawful tow never feeds the beam; the theft run crosses it, so the gate's
// own machinery (weir_bolt / manifest read → runScan) is the single law owner — the
// script mints no second incident for the same act.

const SHAPE_ID = 'cargo_weir_ambush';
const SHAPE = ENCOUNTERS[SHAPE_ID];
const ANCHOR = { x: TETHYS_CUSTOMS_WEIR.origin.x, z: TETHYS_CUSTOMS_WEIR.origin.z };

// Deterministic per-(live,label) stream, same shape as the director's mulberry32 seam.
function streamFor(seedTag) {
  let h = 2166136261 >>> 0;
  for (const c of String(seedTag)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = h || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1) >>> 0;
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61) >>> 0;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// plan.ships as the composer produces them for this shape: squad (anchor first) + escort.
const PLAN_SHIPS = [
  { archetype: 'corsair_raider', compositionRole: 'identity_anchor', role: 'squad', level: 3 },
  { archetype: 'reaver_pirate', compositionRole: 'light', role: 'squad', level: 3 },
  { archetype: 'customs_cutter', role: 'escort', level: 3 },
  { archetype: 'customs_cutter', role: 'escort', level: 3 },
];

function makeState() {
  const entities = new Map();
  const player = {
    id: 'player-1', alive: true, type: 'ship', team: 0,
    pos: { x: ANCHOR.x + 40, z: ANCHOR.z + 40 }, vel: { x: 0, z: 0 },
    tether: { active: false, targetId: null },
    credits: 500, occupantGeneration: 'gen-player',
    flags: {}, data: {},
  };
  entities.set(player.id, player);
  const state = {
    simTime: 100, tick: 6000, playerId: player.id,
    entities, player, story: {},
    world: { currentSectorId: 'sector_tethys_junction' },
    encounterDirector: { live: {} },
    meta: { seed: 7 },
  };
  Object.defineProperty(state, 'entityList', { get: () => [...entities.values()] });
  return state;
}

function liveFor() {
  return {
    id: 'live-weir-1', shapeId: SHAPE_ID, shape: SHAPE, script: 'weirAmbush',
    plan: { ships: PLAN_SHIPS.map((s) => ({ ...s })) },
    vars: {}, data: {}, ids: [], roles: {}, propIds: [],
    phase: 'telegraph', factionId: 'faction_reach',
    sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_checkpoint',
    zoneName: 'Customs Checkpoint', zoneRadius: 820,
    anchor: { ...ANCHOR }, squadId: 'live-weir-1',
    deck: 'combat', tier: 'minor',
  };
}

// A director facade with the same ownership contract: spawnShips populates live.ids +
// live.roles with real entities; spawnProp rides live.propIds; every intent is recorded.
function facade(state, emitted) {
  let nextId = 0;
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.entities.get(state.playerId) || null,
    stream: (live, label) => streamFor(`${live.id}:${label}`),
    spawnShips(live, ships) {
      const ids = [];
      for (const sh of ships) {
        const id = `npc-${++nextId}`;
        const e = {
          id, alive: true, type: 'ship', team: sh.team ?? 1,
          pos: { x: sh.pos.x, z: sh.pos.z }, vel: { x: 0, z: 0 }, rot: 0,
          radius: 10, mass: 40, hull: 100, hullMax: 100,
          factionId: sh.factionId || null,
          occupantGeneration: `gen-${id}`,
          flags: {},
          data: {
            ai: {
              passive: !!sh.passive,
              squadId: live.squadId,
              spawnContext: sh.context,
              sectorId: live.sectorId,
              zoneId: live.zoneId,
              encounterId: live.id,
              encounterRole: sh.role,
              motive: 'assigned_interdiction',
              engagementTrigger: 'authorized_hostile_spawn',
              combatDoctrineId: 'brawler_commit',
              roe: 'hold_fire',
            },
            scanLabel: sh.scanLabel || null,
            spawnedSpec: { archetype: sh.archetype, factionId: sh.factionId, context: sh.context },
          },
        };
        entitiesOf(state).set(id, e);
        live.ids.push(id);
        live.roles[id] = sh.role || 'squad';
        ids.push(id);
      }
      return ids;
    },
    spawnProp(live, opts) {
      const id = `prop-${++nextId}`;
      const e = {
        id, alive: true, type: opts.type || 'beacon',
        pos: { x: opts.pos.x, z: opts.pos.z }, vel: { x: 0, z: 0 },
        radius: Math.max(2, Number(opts.radius) || 6),
        mass: Math.max(1, Number(opts.mass) || 1e6),
        hull: 1, hullMax: 1,
        occupantGeneration: `gen-${id}`,
        flags: {},
        data: {
          parentType: 'story_prop',
          scanLabel: opts.scanLabel || null,
          encounterId: live.id,
          storyPropKind: opts.storyPropKind || null,
          tetherable: opts.tetherable !== false,
        },
      };
      entitiesOf(state).set(id, e);
      (live.propIds || (live.propIds = [])).push(id);
      return e;
    },
    entsOf(live, role) {
      const out = [];
      for (const id of live.ids) {
        if (role && live.roles[id] !== role) continue;
        const e = entitiesOf(state).get(id);
        if (e && e.alive !== false) out.push(e);
      }
      return out;
    },
    aliveCount(live, role) { return this.entsOf(live, role).length; },
    setPassive(live, passive, role) {
      emitted.push({ name: 'setPassive', payload: { passive: !!passive, role: role || null } });
      for (const e of this.entsOf(live, role || undefined)) {
        if (e.data && e.data.ai) e.data.ai.passive = !!passive;
      }
    },
    say(live, channel, textOrId, vars, o) {
      emitted.push({ name: `say:${channel}`, payload: { textOrId, vars, o } });
      return true;
    },
    offerChoices(live, ids, timeoutChoice, deadlineAt) {
      emitted.push({
        name: 'encounter:choiceOffered',
        payload: {
          options: ids.map((id) => ({ id, available: true })),
          timeoutChoice, deadlineAt,
        },
      });
    },
    grant(amount, reason) {
      emitted.push({ name: 'economy:grantCredits', payload: { amount, reason } });
    },
    rep(factionId, delta, reason) {
      emitted.push({ name: 'faction:repDelta', payload: { factionId, delta, reason } });
    },
    resolve(live, outcome, o) {
      emitted.push({ name: 'resolved', payload: { outcome, vars: (o && o.vars) || live.vars } });
      live.phase = 'done';
      return outcome;
    },
    abort(live, reason) {
      emitted.push({ name: 'aborted', payload: { reason } });
      return 'aborted';
    },
    emit(name, payload) { emitted.push({ name, payload }); },
    restoreEncounterRecord(item) {
      return {
        id: item.encounterId, shapeId: item.shapeId, shape: SHAPE, script: 'weirAmbush',
        plan: { ships: [] }, vars: {}, data: {}, ids: [], roles: {}, propIds: [],
        phase: 'telegraph', factionId: 'faction_reach',
        sectorId: item.sectorId, zoneId: item.zoneId, zoneName: item.zoneName,
        zoneRadius: item.zoneRadius, anchor: { ...item.zoneCenter },
        squadId: item.squadId, deck: 'combat', tier: 'minor', offerConsumed: false,
      };
    },
    helpers: {},
  };
  return d;
}
function entitiesOf(state) { return state.entities; }

function roleMembers(state, live, role) {
  return live.ids
    .filter((id) => live.roles[id] === role)
    .map((id) => state.entities.get(id))
    .filter((e) => e && e.alive !== false);
}
function hulkEnt(state, live) { return state.entities.get(live.data.hulkId); }
function resolvedOf(emitted) { return emitted.filter((e) => e.name === 'resolved'); }
function driveToOffer(d, live, state) {
  weirAmbush.fire(d, live, state);
  weirAmbush.tick(d, live, state, state.simTime + 3); // past APPROACH_S
  assert.equal(live.phase, 'offer', 'approach beat opens the offer deck');
}

test('shape loads with three authored choices and refuse timeout', () => {
  assert.ok(SHAPE, 'cargo_weir_ambush present in the generated encounter index');
  assert.equal(SHAPE.script, 'weirAmbush');
  assert.deepEqual(SHAPE.choices.map((c) => c.id), ['assist', 'theft', 'refuse']);
  assert.equal(SHAPE.timeoutChoice, 'refuse');
  assert.equal(SHAPE.squad.anchorArchetype, 'corsair_raider', 'Reach thief flight lead');
  assert.ok(SHAPE.squad.archetypes.includes('reaver_pirate'), 'reaver wing in the flight');
  assert.equal(SHAPE.escort.archetypes[0], 'customs_cutter');
  assert.equal(SHAPE.escort.factionId, 'faction_scn');
});

test('fire lays out the scene beyond the weir read; the theft route crosses it', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  weirAmbush.fire(d, live, state);
  assert.equal(live.phase, 'approach');

  const thieves = roleMembers(state, live, 'thief');
  const patrol = roleMembers(state, live, 'patrol');
  const salvors = roleMembers(state, live, 'salvor');
  assert.equal(thieves.length, 2, 'a corsair + reaver thief flight, not a tether specialist');
  assert.equal(patrol.length, 2);
  assert.equal(salvors.length, 3);
  assert.ok(thieves.every((e) => e.factionId === 'faction_reach'));
  assert.ok(patrol.every((e) => e.factionId === 'faction_scn'));
  assert.ok(salvors.every((e) => e.factionId === 'faction_mts'), 'licensed strip crew');
  assert.ok(thieves.every((e) => e.data.ai.passive === true), 'the mask holds until the spring');
  assert.ok(patrol.every((e) => e.data.ai.lawful === true), 'cordon is a lawful eye');
  assert.ok(patrol.every((e) => e.data.ai.passive === true), 'cordon never opens on a clean player');

  // Geometry law: the whole lawful scene sits BEYOND the weir's read reach, so the
  // custody tow never feeds the beam; the theft run must cross the read — which is the
  // gate's own answer, minted by lawSecurity's weir machinery, not by this script.
  const inside = (pos) => pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, pos);
  const hulk = hulkEnt(state, live);
  assert.ok(hulk && !inside(hulk.pos), 'seized hulk parks outside the read region');
  for (const e of [...thieves, ...patrol, ...salvors]) assert.ok(!inside(e.pos), 'cast outside the read');
  for (const id of live.data.ballastIds) assert.ok(!inside(state.entities.get(id).pos));
  const axes = live.data.weir;
  const midTow = { x: ANCHOR.x + axes.inDir.x * 140, z: ANCHOR.z + axes.inDir.z * 140 };
  assert.ok(inside(midTow), 'the outbound run must cross the cone — the weir is the tripwire');
});

test('fire produces a towable hulk and throwable ballast, not static dressing', () => {
  const state = makeState();
  const d = facade(state, []);
  const live = liveFor();
  weirAmbush.fire(d, live, state);
  const hulk = hulkEnt(state, live);
  assert.equal(hulk.mass, 90, 'explicit tow-class mass — spawnProp default 1e6 would be immovable');
  assert.equal(hulk.physicsBody.mass, 90);
  assert.equal(hulk.physicsBody.dynamic, true);
  assert.equal(hulk.data.masslineTetherable, true);
  assert.ok(hulk.mass < 1e6, 'the line can actually move it');
  const ballast = live.data.ballastIds.map((id) => state.entities.get(id));
  assert.equal(ballast.length, 2);
  assert.ok(ballast.every((b) => b.mass === 14 && b.physicsBody.mass === 14), 'small throwable masses');
});

test('offer reaches the deck: three choices, refuse timeout, 30 s window', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'choices offered');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['assist', 'theft', 'refuse']);
  assert.equal(offer.payload.timeoutChoice, 'refuse');
  assert.equal(offer.payload.deadlineAt, state.simTime + 3 + 30, 'authored offerS window');
});

test('assist: a settled hulk beside a live cutter resolves weir_lawful_assist once', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  assert.equal(live.phase, 'task');
  assert.equal(live.data.task, 'law');
  const hulk = hulkEnt(state, live);
  const cutter = roleMembers(state, live, 'patrol')[0];
  hulk.pos = { x: cutter.pos.x + 20, z: cutter.pos.z };
  hulk.vel = { x: 0, z: 0 };
  state.player.tether = { active: false, targetId: null };
  weirAmbush.tick(d, live, state, state.simTime + 4);
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1, 'exactly one resolve');
  assert.equal(resolved[0].payload.outcome, 'weir_lawful_assist');
  const grant = emitted.find((e) => e.name === 'economy:grantCredits');
  assert.equal(grant.payload.amount, 160);
  assert.equal(grant.payload.reason, 'weir:impound_fee');
  const rep = emitted.find((e) => e.name === 'faction:repDelta');
  assert.equal(rep.payload.factionId, 'faction_scn');
  assert.equal(rep.payload.delta, 10);
  assert.equal(hulk.data.tetherable, false, 'custody taken — the hulk can\'t be re-stolen');
  weirAmbush.tick(d, live, state, state.simTime + 5);
  assert.equal(resolvedOf(emitted).length, 1, 'no second resolve, no double mint');
});

test('theft: committed run springs the flight once, resolves weir_theft with one law owner', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'theft');
  assert.equal(live.phase, 'task');
  assert.equal(live.data.task, 'theft');
  const hulk = hulkEnt(state, live);
  const axes = live.data.weir;

  // The tow commits outbound: 60 wu past the gate trips the mask.
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 70, z: ANCHOR.z + axes.outDir.z * 70 };
  weirAmbush.tick(d, live, state, state.simTime + 4);
  assert.equal(live.data.thiefSprung, 'ignored_demand', 'committed outbound run springs the flight');
  const flight = roleMembers(state, live, 'thief');
  assert.equal(flight.length, 2);
  for (const e of flight) {
    const ai = e.data.ai;
    assert.equal(ai.passive, false, 'mask dropped');
    assert.equal(ai.motive, 'cargo_extortion', 'motive stamped like settleWakeMotive');
    assert.equal(ai.engagementTrigger, 'ignored_demand');
    assert.equal(ai.motiveSatisfied, false);
    assert.equal(ai.activity.kind, ActivityKind.ATTACK_RUN);
    assert.equal(ai.roe, RulesOfEngagement.WEAPONS_FREE);
    assert.equal(e.data.combat.targetId, 'player-1', 'the flight contests the runner');
  }
  const mines = emitted.filter((e) => e.name === 'mines:placeRequest');
  assert.equal(mines.length, 3, 'a short mine fence seeds on spring');
  assert.ok(mines.every((m) => m.payload.ownerId === flight[0].id && m.payload.team === 1));
  assert.ok(emitted.some((e) => e.name === 'ai:telegraph' && e.payload.cue === 'wake_mines'));

  // The patrol is untouched by the spring: lawful + passive forever.
  for (const p of roleMembers(state, live, 'patrol')) {
    assert.equal(p.data.ai.passive, true);
    assert.equal(p.data.ai.lawful, true);
  }
  assert.ok(emitted.every((e) => e.name !== 'setPassive' || e.payload.role === 'thief'),
    'setPassive only ever flips the flight');

  // Finish the run: hulk settled past the gate, cordon left behind.
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 310, z: ANCHOR.z + axes.outDir.z * 310 };
  hulk.vel = { x: 0, z: 0 };
  weirAmbush.tick(d, live, state, state.simTime + 5);
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'weir_theft');
  const grant = emitted.find((e) => e.name === 'economy:grantCredits');
  assert.equal(grant.payload.amount, 260);
  assert.equal(grant.payload.reason, 'weir:fence_cut');
  // Single law-consequence owner: the script mints NO incident or rep penalty for the
  // theft — the gate's own weir machinery (weir_bolt heat / manifest read → runScan)
  // answered the physical crossing itself. Any repDelta or extra law emit here would be
  // a second consequence for the same act.
  assert.equal(emitted.filter((e) => e.name === 'faction:repDelta').length, 0,
    'no script-side rep penalty stacked on the gate\'s answer');
  assert.equal(emitted.filter((e) => e.name === 'law:response'
    || e.name === 'customs:weirBolt' || e.name === 'law:incident').length, 0,
    'no script-side incident minted — weir machinery owns the consequence');
  weirAmbush.tick(d, live, state, state.simTime + 6);
  assert.equal(resolvedOf(emitted).length, 1, 'single resolve per live');
});

test('refuse and timeout spring the flight — mines, motive stamps, patrol untouched', () => {
  for (const via of ['refuse', 'timeout']) {
    const emitted = [];
    const state = makeState();
    const d = facade(state, emitted);
    const live = liveFor();
    driveToOffer(d, live, state);
    if (via === 'refuse') weirAmbush.choose(d, live, state, 'refuse');
    else weirAmbush.tick(d, live, state, live.deadlineAt + 1);
    assert.equal(live.phase, 'conflict');
    const trigger = via === 'refuse' ? 'explicit_refusal' : 'ignored_demand';
    assert.equal(live.data.thiefSprung, trigger);
    for (const e of roleMembers(state, live, 'thief')) {
      assert.equal(e.data.ai.passive, false);
      assert.equal(e.data.ai.engagementTrigger, trigger);
      assert.equal(e.data.ai.motiveSatisfied, false);
    }
    assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3,
      `${via} seeds the mine fence`);
    for (const s of roleMembers(state, live, 'salvor')) {
      assert.ok(Number.isFinite(s.data.despawnAt), 'strip crew scatters on the spring');
    }
    for (const p of roleMembers(state, live, 'patrol')) {
      assert.equal(p.data.ai.passive, true, 'cordon stays passive');
      assert.equal(p.data.ai.lawful, true, 'cordon stays lawful');
    }
    // Flight wiped → the refusal fight closes with its outcome, exactly once.
    for (const e of roleMembers(state, live, 'thief')) e.alive = false;
    weirAmbush.tick(d, live, state, state.simTime + 30);
    const resolved = resolvedOf(emitted);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].payload.outcome, 'weir_refused');
    weirAmbush.tick(d, live, state, state.simTime + 31);
    assert.equal(resolvedOf(emitted).length, 1);
  }
});

test('player_attack during the offer is refusal by trigger', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.event(d, live, state, 'playerHitSquad');
  assert.equal(live.phase, 'conflict');
  assert.equal(live.data.thiefSprung, 'player_attack');
  assert.equal(live.data.conflictOutcome, 'weir_refused');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3);
  for (const e of roleMembers(state, live, 'thief')) {
    assert.equal(e.data.ai.engagementTrigger, 'player_attack');
    assert.equal(e.data.ai.passive, false);
  }
});

test('player_attack mid-tow springs the flight once; the work continues under fire', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  weirAmbush.event(d, live, state, 'playerHitSquad');
  assert.equal(live.phase, 'task', 'the tow can still finish under fire');
  assert.equal(live.data.thiefSprung, 'player_attack');
  weirAmbush.event(d, live, state, 'playerHitSquad');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3,
    'the fence seeds once, never twice');
});

test('dead cordon means no receiver: distinct outcome, no lawful credit', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  const hulk = hulkEnt(state, live);
  const cutters = roleMembers(state, live, 'patrol');
  hulk.pos = { x: cutters[0].pos.x, z: cutters[0].pos.z };
  hulk.vel = { x: 0, z: 0 };
  for (const c of cutters) c.alive = false;
  weirAmbush.tick(d, live, state, state.simTime + 4);
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1, 'a dead cordon settles now — not 320 s later');
  assert.equal(resolved[0].payload.outcome, 'weir_receiver_dead',
    'distinct receipt: nobody left to take custody, never the "stalled" lie');
  assert.ok(SHAPE.receipts.weir_receiver_dead, 'the outcome has authored receipt text');
  // Lawful-kill heat stays the law machinery's job — the script stamps nothing extra.
  assert.equal(emitted.filter((e) => e.name === 'economy:grantCredits').length, 0);
  assert.equal(emitted.filter((e) => e.name === 'faction:repDelta').length, 0);
  assert.equal(emitted.filter((e) => e.name === 'law:response'
    || e.name === 'law:incident' || e.name === 'customs:weirBolt').length, 0,
    'no script-side law stamp on the void ticket');
  for (const s of roleMembers(state, live, 'salvor')) {
    assert.ok(Number.isFinite(s.data.despawnAt), 'strip crew packs up on the void');
  }
  weirAmbush.tick(d, live, state, state.simTime + 5);
  assert.equal(resolvedOf(emitted).length, 1, 'single resolve');
});

test('abandoning the scene resolves weir_abandoned; determinism holds', () => {
  const layout = (run) => {
    const emitted = [];
    const state = makeState();
    const d = facade(state, emitted);
    const live = liveFor();
    weirAmbush.fire(d, live, state);
    return { positions: live.ids.map((id) => ({ ...state.entities.get(id).pos })),
      hulk: { ...hulkEnt(state, live).pos } };
  };
  const a = layout(), b = layout();
  assert.deepEqual(a, b, 'same stream → same scene, no ambient randomness');

  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  state.player.pos = { x: ANCHOR.x + 5000, z: ANCHOR.z + 5000 }; // beyond zoneRadius + pad
  weirAmbush.tick(d, live, state, state.simTime + 4);
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'weir_abandoned');
});

test('save mid-offer restores cast and never double-mints an outcome', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.captureSave(d, live, state);
  const saved = state.story.depthProgramEncounters.weirAmbush;
  assert.equal(saved.status, 'active');
  assert.equal(saved.actorRefs.length, 10, '7 hulls + hulk + 2 ballast ride the save bag');

  // The outgoing coordinator retires; the visit restores a fresh record on the same bodies.
  const restored = weirAmbush.restoreSaved(d, state);
  assert.ok(restored, 'restore binds the surviving cast');
  assert.equal(restored.phase, 'offer');
  assert.ok(restored.data.hulkId != null, 'hulk rebound by stable slot');
  assert.equal(restored.ids.length, 7);
  assert.equal(restored.roles[restored.data.hulkId], undefined, 'hulk is a prop, not squad');
  assert.ok(emitted.filter((e) => e.name === 'encounter:choiceOffered').length >= 2,
    'the offer deck re-opens on restore');

  // Terminal visits never replay: settle writes terminal once, re-settle is a no-op.
  const hulk = hulkEnt(state, restored);
  const cutter = restored.ids
    .map((id) => state.entities.get(id))
    .find((e) => e && restored.roles[e.id] === 'patrol');
  restored.data.task = 'law';
  restored.data.taskDeadlineAt = state.simTime + 300;
  restored.phase = 'task';
  hulk.pos = { x: cutter.pos.x, z: cutter.pos.z };
  hulk.vel = { x: 0, z: 0 };
  weirAmbush.tick(d, restored, state, state.simTime + 5);
  assert.equal(resolvedOf(emitted).length, 1);
  assert.equal(resolvedOf(emitted)[0].payload.outcome, 'weir_lawful_assist');
  assert.equal(state.story.depthProgramEncounters.weirAmbush.status, 'terminal');
  weirAmbush.tick(d, restored, state, state.simTime + 6);
  assert.equal(resolvedOf(emitted).length, 1, 'no consequence replayed after save');
});

test('assist tow that runs outbound pivots to the run — spring, conversion, theft path', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  assert.equal(live.data.task, 'law');
  const hulk = hulkEnt(state, live);
  const axes = live.data.weir;

  // The "lawful" tow commits outbound through the read — the deal is burned.
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 70, z: ANCHOR.z + axes.outDir.z * 70 };
  weirAmbush.tick(d, live, state, state.simTime + 4);
  assert.equal(live.data.task, 'theft', 'a committed outbound run converts the deal');
  assert.equal(live.data.thiefSprung, 'ignored_demand', 'the flight springs on its cue');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, 3,
    'the spring still seeds its mine fence');
  const says = emitted.filter((e) => e.name.startsWith('say:')).map((e) => e.payload.textOrId);
  assert.ok(says.includes(SHAPE.pivotBark), 'the burned ticket is said aloud');
  assert.ok(says.includes(SHAPE.pivotFenceBark), 'the fence claims the run aloud');
  assert.equal(resolvedOf(emitted).length, 0, 'no false receipt on the pivot');

  // The theft path stays completable with the flight already hunting.
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 310, z: ANCHOR.z + axes.outDir.z * 310 };
  hulk.vel = { x: 0, z: 0 };
  weirAmbush.tick(d, live, state, state.simTime + 5);
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'weir_theft');
  const grant = emitted.find((e) => e.name === 'economy:grantCredits');
  assert.equal(grant.payload.amount, 260);
  assert.equal(grant.payload.reason, 'weir:fence_cut');
  assert.equal(emitted.filter((e) => e.name === 'faction:repDelta').length, 0,
    'pivot adds no second law stamp — the gate owns the crossing');
});

test('a sprung assist still pivots when the tow runs outbound', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  weirAmbush.event(d, live, state, 'playerHitSquad');
  assert.equal(live.data.thiefSprung, 'player_attack');
  assert.equal(live.data.task, 'law', 'still the law deal under fire');
  const hulk = hulkEnt(state, live);
  const axes = live.data.weir;
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 80, z: ANCHOR.z + axes.outDir.z * 80 };
  const minesBefore = emitted.filter((e) => e.name === 'mines:placeRequest').length;
  weirAmbush.tick(d, live, state, state.simTime + 4);
  assert.equal(live.data.task, 'theft', 'the deal converts even with the mask already off');
  assert.equal(live.data.thiefSprung, 'player_attack', 'no re-spring — the trigger stands');
  assert.equal(emitted.filter((e) => e.name === 'mines:placeRequest').length, minesBefore,
    'the fence seeds once, never twice');
  assert.ok(emitted.filter((e) => e.name.startsWith('say:'))
    .some((e) => e.payload.textOrId === SHAPE.pivotBark), 'the pivot is still narrated');
});

test('every non-delivery outcome strips the hulk line — no free post-resolve tow', () => {
  for (const via of ['refused', 'stalled', 'receiver_dead']) {
    const emitted = [];
    const state = makeState();
    const d = facade(state, emitted);
    const live = liveFor();
    driveToOffer(d, live, state);
    const hulk = hulkEnt(state, live);
    if (via === 'refused') {
      weirAmbush.choose(d, live, state, 'refuse');
      for (const e of roleMembers(state, live, 'thief')) e.alive = false;
      weirAmbush.tick(d, live, state, state.simTime + 30);
      assert.equal(resolvedOf(emitted)[0].payload.outcome, 'weir_refused');
    } else if (via === 'stalled') {
      weirAmbush.choose(d, live, state, 'assist');
      weirAmbush.tick(d, live, state, live.data.taskDeadlineAt + 1);
      assert.equal(resolvedOf(emitted)[0].payload.outcome, 'weir_stalled');
    } else {
      weirAmbush.choose(d, live, state, 'assist');
      for (const c of roleMembers(state, live, 'patrol')) c.alive = false;
      weirAmbush.tick(d, live, state, state.simTime + 4);
      assert.equal(resolvedOf(emitted)[0].payload.outcome, 'weir_receiver_dead');
    }
    assert.equal(hulk.data.tetherable, false, `${via}: the resolved seizure is not towable`);
    assert.equal(hulk.data.masslineTetherable, false, `${via}: the latch gate is closed`);
  }
});

test('theft progress read: crossing the read and a registered drop are said once', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'theft');
  const hulk = hulkEnt(state, live);
  const axes = live.data.weir;
  const says = () => emitted.filter((e) => e.name.startsWith('say:'))
    .map((e) => e.payload.textOrId);

  // Past the read but still on the line: the "outside the manifest read" cue fires once.
  state.player.tether = { active: true, targetId: hulk.id };
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 310, z: ANCHOR.z + axes.outDir.z * 310 };
  hulk.vel = { x: 0, z: 0 };
  weirAmbush.tick(d, live, state, state.simTime + 4);
  assert.equal(live.data.readClearTold, true);
  assert.equal(says().filter((s) => s === SHAPE.readClearBark).length, 1);
  assert.equal(resolvedOf(emitted).length, 0, 'still attached — the run has not landed');
  weirAmbush.tick(d, live, state, state.simTime + 5);
  assert.equal(says().filter((s) => s === SHAPE.readClearBark).length, 1,
    'the read cue is said once, not every tick');

  // Line cut and settled: the drop registers — then the run closes as theft.
  state.player.tether = { active: false, targetId: null };
  weirAmbush.tick(d, live, state, state.simTime + 6);
  assert.equal(live.data.dropCountedTold, true);
  assert.ok(says().includes(SHAPE.dropCountedBark), '"delivery counted" is said');
  const resolved = resolvedOf(emitted);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'weir_theft');
});

test('continuation carries the mine fence and progress marks across a cold restore', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  // A real mine seam: placed ids ride the continuation row, not just the emit fallback.
  let mineSeq = 0;
  d.helpers = { placeMine: (opts) => ({ id: `mine-${++mineSeq}`, ...opts }) };
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'theft');
  const hulk = hulkEnt(state, live);
  const axes = live.data.weir;
  state.player.tether = { active: true, targetId: hulk.id };
  hulk.pos = { x: ANCHOR.x + axes.outDir.x * 310, z: ANCHOR.z + axes.outDir.z * 310 };
  weirAmbush.tick(d, live, state, state.simTime + 4);
  assert.equal(live.data.thiefSprung, 'ignored_demand');
  assert.equal(live.data.minesSeeded.length, 3, 'the helper-placed fence ids were kept');
  assert.equal(live.data.readClearTold, true);

  weirAmbush.captureSave(d, live, state);
  const saved = state.story.depthProgramEncounters.weirAmbush;
  assert.deepEqual(saved.data.minesSeeded, ['mine-1', 'mine-2', 'mine-3'],
    'the mine fence rides the continuation row');
  assert.equal(saved.data.readClearTold, true, 'progress marks ride the row');
  const restored = weirAmbush.restoreSaved(d, state);
  assert.ok(restored, 'restore binds the surviving cast');
  assert.equal(restored.phase, 'task');
  assert.equal(restored.data.task, 'theft');
  assert.deepEqual(restored.data.minesSeeded, ['mine-1', 'mine-2', 'mine-3'],
    'cold restore keeps the fence bookkeeping');
  assert.equal(restored.data.readClearTold, true, 'no double-bark after restore');
});

test('captureVisit snapshots on change only — steady task ticks never rewrite the bag', () => {
  const emitted = [];
  const state = makeState();
  const d = facade(state, emitted);
  const live = liveFor();
  driveToOffer(d, live, state);
  weirAmbush.choose(d, live, state, 'assist');
  const before = state.story.depthProgramEncounters.weirAmbush;
  weirAmbush.tick(d, live, state, state.simTime + 4);
  weirAmbush.tick(d, live, state, state.simTime + 5);
  weirAmbush.captureSave(d, live, state);
  assert.equal(state.story.depthProgramEncounters.weirAmbush, before,
    'an unchanged continuation row is not rewritten every tick');
  live.data.taskDeadlineAt += 30;
  weirAmbush.captureSave(d, live, state);
  const after = state.story.depthProgramEncounters.weirAmbush;
  assert.notEqual(after, before, 'a real continuation change writes a fresh row');
  assert.equal(after.data.taskDeadlineAt, live.data.taskDeadlineAt);
});
