// Row 448 (GOLD-COLOSSI): the score bosses carry rope-detachable plates — data on the
// fight record until a held line tears them, a thrown wreck afterwards; a covered
// subsystem stays silent while the plate holds and the act shed guarantees the ladder.
// Seed 4242, DT = 1/60, no wall-clock, no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { validateCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { CAPITAL_PLATE_FULL_PULL, capitalPlateUnderLine } from '../src/combat/capitalPlates.js';
import { capitalBossReadouts, createCapitalBossOverlay } from '../src/presentation/capitalBossPresentation.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';
import { tetherBreakCueForReason } from '../src/systems/presentationOrchestrator.js';

const DT = 1 / 60;
const SEED = 4242;
const TOLLMAN = 'capital_boss_tollman';
const BOSS_IDS = [
  'capital_boss_ala', 'capital_boss_brood_queen', 'capital_boss_foreman',
  'capital_boss_hulk', 'capital_boss_regent', 'capital_boss_tendril',
  'capital_boss_tollman',
];

function bootScoreFight(encounterId, { attachmentService = null } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload, tick: state.tick }); raw.emit(event, payload); },
  };
  const spawned = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage: createDamageRouter({ state, bus: raw, catalog: createCombatCatalog(), helpers: {} }, { schedule() {} }),
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity); state.entityList.push(entity); spawned.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player); state.entityList.push(player); state.playerId = player.id;
  state.mode = 'flight';
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1, data: {},
  };
  state.entities.set(boss.id, boss); state.entityList.push(boss);
  const fightId = `contract:${encounterId}`;
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  const capSys = createProductionCapitalBossEncounters();
  const registry = attachmentService
    ? { get: (name) => (name === 'actions' ? { kernel: { attachments: attachmentService } } : null) }
    : null;
  capSys.init({ state, bus, helpers, registry });
  bus.emit('capitalBoss:start', { encounterId, fightId, bossId: boss.id, targetId: player.id });
  return { state, bus, emitted, spawned, capSys, fightId, boss, player, helpers };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i += 1) { h.state.tick += 1; h.state.simTime += DT; h.capSys.update(DT); }
}

// A live player latch on the boss, the pilot holding it out along the bearing of `anchor`
// (boss-local), with the raw line force a given fraction of a starter hull's full-burn pull —
// the same records the tear check reads in production. A capital is roped at its centre of
// mass, so targetAnchorLocal is {0,0} exactly as tetherGameplay creates it; and the HUD's
// tensionEstimate is pinned near its live ~1e-3 to prove the tear never reads it.
function latchAt(h, anchor, tension = 0.9) {
  if (!h.state.combat.attachments) h.state.combat.attachments = { byId: {}, nextId: 1 };
  const att = {
    id: 'att_plate_test', defId: 'tether_standard',
    ownerId: h.player.id, targetId: h.boss.id, state: 'active',
    targetAnchorLocal: { x: 0, z: 0 }, lastTension: tension * CAPITAL_PLATE_FULL_PULL,
  };
  h.state.combat.attachments.byId[att.id] = att;
  const len = Math.hypot(anchor.x, anchor.z) || 1;
  h.player.pos.x = h.boss.pos.x + (anchor.x / len) * 120;
  h.player.pos.z = h.boss.pos.z + (anchor.z / len) * 120;
  if (!h.player.tether) h.player.tether = {};
  h.player.tether.tensionEstimate = 0.0005;
  if (h.state.player && h.state.player !== h.player) h.state.player.tether = h.player.tether;
  return att;
}
const plateAnchorLocal = (h, plateId) => {
  const spec = requireCapitalBossEncounter(h.state.capitalBossEncounters
    .fights[h.fightId].encounterId).plates.find((p) => p.id === plateId);
  return { x: spec.anchor.x * h.boss.radius, z: spec.anchor.z * h.boss.radius, spec };
};
const fightRec = (h) => h.state.capitalBossEncounters.fights[h.fightId];
const plateRec = (h, id) => fightRec(h).plates.find((p) => p.id === id);
const plateSpawns = (h) => h.spawned.filter((e) => e.data && e.data.capitalPlate);
const bossSubsystemHp = (h, id) => {
  const row = ensureCombatant(h.state, h.boss, createCombatCatalog()).subsystems[id];
  return row ? row.health : NaN;
};

test('validator law: all authored capital bosses carry two lawful plates', () => {
  for (const id of [...BOSS_IDS, 'capital_boss_last_argument']) {
    const spec = requireCapitalBossEncounter(id);
    const result = validateCapitalBossEncounter(spec, {});
    assert.equal(result.ok, true, `${id}: ${result.errors.join('; ')}`);
    assert.equal(spec.plates.length, 2, `${id} authors two plates`);
    assert.ok(spec.plates.some((p) => p.shedOnAct != null), `${id} has an act-shed plate`);
    assert.ok(spec.plates.every((p) => /^[a-z][a-z ]+$/.test(p.label)), `${id} labels are plain words`);
  }
});

test('a held line inside the plate radius tears it after 30 ticks and spawns a throwable slab', () => {
  const cut = [], created = [];
  const svc = { cut: (id, by, reason) => cut.push({ id, reason }), create: (spec) => { created.push(spec); return { ok: true, attachment: { id: 'att_new' } }; } };
  const h = bootScoreFight(TOLLMAN, { attachmentService: svc });
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.9); // holdTension 0.8 on the battery housing
  tick(h, 5); // fight starts stepping
  assert.equal(plateRec(h, 'battery_housing').attached, true);
  assert.ok(plateRec(h, 'battery_housing').strainTicks > 0, 'strain accrues under held tension');
  tick(h, 30);
  assert.equal(plateRec(h, 'battery_housing').attached, false, '30 held ticks tear the plate');
  const torn = h.emitted.filter((e) => e.event === 'capitalBoss:plateTorn');
  assert.equal(torn.length, 1, 'one plateTorn emitted');
  assert.equal(torn[0].payload.cause, 'tether');
  const slab = plateSpawns(h);
  assert.equal(slab.length, 1, 'exactly one plate body spawned');
  assert.equal(slab[0].type, 'wreck');
  assert.equal(slab[0].data.masslineTetherable, true, 'the slab is throwable');
  assert.equal(slab[0].data.capitalPlate.plateId, 'battery_housing');
  assert.ok(Math.abs(slab[0].pos.x - (h.boss.pos.x + 0.5 * h.boss.radius)) < 1e-6
    && Math.abs(slab[0].pos.z - (h.boss.pos.z + 0.15 * h.boss.radius)) < 1e-6,
    'slab spawns at the authored anchor');
  assert.equal(cut.length, 1, 'the old line is cut');
  assert.equal(created.length, 1, 'the line is re-latched through the sanctioned create');
  assert.equal(created[0].targetId, slab[0].id, 'the line moves to the torn slab');
  assert.ok(h.emitted.some((e) => e.event === 'toast' && /^You tear .+'s battery housing free\.$/.test(e.payload.text)),
    'the rope tear names itself');
  // The cover the plate was paying for drops the moment it tears.
  assert.equal((h.boss.data.capitalPlateCover || {}).subsystem_weapon, undefined);
  tick(h, 40);
  assert.equal(plateSpawns(h).length, 1, 'a torn plate never re-spawns');
});

test('below holdTension or latched off-anchor, the plate never tears', () => {
  const h = bootScoreFight(TOLLMAN);
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.5); // below the 0.8 holdTension
  tick(h, 45);
  assert.equal(plateRec(h, 'battery_housing').attached, true, 'below-threshold tension holds');
  assert.equal(plateRec(h, 'battery_housing').strainTicks, 0);
  // Now enough tension but the latch sits off the anchor.
  latchAt(h, { x: -15, z: 12 }, 0.9); // off every authored anchor
  tick(h, 45);
  assert.equal(plateRec(h, 'battery_housing').attached, true, 'off-anchor latch holds');
  assert.equal(plateSpawns(h).length, 0);
});

test('review: every spawnable plate is reachable by a starter hull line on a COM-roped capital', () => {
  // Measured full main burn on a 420-mass body (scripts/probe-tether-visual-drive.mjs):
  // ship_mule ~2930 is the weakest starter pull. Every rope-tearable plate must sit at or under it.
  const STARTER_FULL_BURN_FLOOR = 2900;
  for (const id of BOSS_IDS) {
    const spec = requireCapitalBossEncounter(id);
    const R = spec.actors[0].radius;
    const boss = { pos: { x: 0, z: 0 }, rot: 0.7, radius: R };
    for (const p of spec.plates) {
      assert.ok(p.holdTension * CAPITAL_PLATE_FULL_PULL <= STARTER_FULL_BURN_FLOOR,
        `${id}/${p.id}: holdTension ${p.holdTension} needs more than a starter's full burn`);
      // Hold the line out along the plate's world bearing: it must read as under the line.
      const ax = p.anchor.x * R, az = p.anchor.z * R;
      const c = Math.cos(boss.rot), s = Math.sin(boss.rot);
      const wx = ax * c - az * s, wz = ax * s + az * c;
      const len = Math.hypot(wx, wz) || 1;
      const owner = { pos: { x: (wx / len) * 150, z: (wz / len) * 150 } };
      assert.equal(capitalPlateUnderLine(p, boss, owner), true, `${id}/${p.id} reachable by bearing`);
      // The opposite side of the hull never hauls on it.
      const away = { pos: { x: -owner.pos.x, z: -owner.pos.z } };
      assert.equal(capitalPlateUnderLine(p, boss, away), false, `${id}/${p.id} not from the far side`);
    }
  }
});

test('review: the overlay draws the PLATE/HOLD read while the line hauls on a plate', () => {
  const h = bootScoreFight(TOLLMAN);
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.9);
  tick(h, 3);
  const readouts = capitalBossReadouts(h.state, []);
  const rd = readouts.find((r) => r && r.plateHold);
  assert.ok(rd, 'the readout names the plate under the line');
  assert.equal(rd.plateHold.label, 'battery housing');
  assert.ok(Math.abs(rd.plateHold.tension - 0.9) < 1e-9, 'the read shows the same pull the tear check uses');
  const texts = [];
  const ctx2d = new Proxy({}, { get: (t, k) => (k === 'fillText' ? (s) => texts.push(s)
    : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const canvas = { width: 100, height: 100, getContext: () => ctx2d };
  const overlay = createCapitalBossOverlay({ canvas, bus: createBus(),
    worldToScreen: (p) => ({ x: p.x, y: p.z }), clockForFight: () => 0 });
  const feed = [...rd.plates];
  feed.hold = rd.plateHold;
  overlay.plateAnchors(feed);
  overlay.draw();
  assert.ok(texts.some((s) => /^PLATE 0\.9 t \/ HOLD 0\.8 t$/.test(s)), `PLATE/HOLD drawn: ${texts.join('|')}`);
});

test('while the plate holds, the covered subsystem takes no subsystem damage and hull still drops', () => {
  const h = bootScoreFight(TOLLMAN);
  tick(h, 3);
  // The fight owner stamps the cover the moment the fight is live.
  assert.equal((h.boss.data.capitalPlateCover || {}).subsystem_weapon, true);
  // Read the live combat runtime row the router writes (a data.subsystems stub is never touched).
  const hp0 = bossSubsystemHp(h, 'subsystem_weapon');
  assert.ok(hp0 > 0, 'the boss carries a live weapon subsystem');
  const hull0 = h.boss.hull;
  h.helpers.routeCombatDamage({ attackerId: h.player.id, targetId: h.boss.id,
    packet: { channels: { kinetic: 40 }, hit: { subsystemId: 'subsystem_weapon' } }, origin: 'test' });
  assert.equal(bossSubsystemHp(h, 'subsystem_weapon'), hp0,
    'the covered subsystem takes nothing');
  assert.ok(h.boss.hull < hull0, 'the plate sends the hit to hull');
});

test('an act change sheds its plate exactly once and the toast names the slab', () => {
  const h = bootScoreFight(TOLLMAN);
  tick(h, 200); // the authored intro holds the fight through its first 180 ticks
  assert.equal(fightRec(h).actIndex, 0, 'the offer act is live after the intro');
  assert.equal(plateRec(h, 'battery_housing').attached, true);
  // Drop hull under the act-1 gate so the score transitions and sheds shedOnAct 0.
  h.boss.hull = 60; // under hullAtMost 0.67 of 100
  tick(h, 140); // the act gate re-evaluates at the transition boundary
  assert.equal(fightRec(h).actIndex, 1, 'the seizure act is live');
  assert.equal(plateRec(h, 'battery_housing').attached, false, 'the act end tears its plate');
  const torn = h.emitted.filter((e) => e.event === 'capitalBoss:plateTorn');
  assert.equal(torn.length, 1);
  assert.equal(torn[0].payload.cause, 'actShed');
  assert.equal(plateSpawns(h).length, 1);
  const toast = h.emitted.find((e) => e.event === 'toast' && /sheds its battery housing/i.test(e.payload.text));
  assert.ok(toast, 'the shed is announced');
  // The fight never re-sheds it — the slab is gone for good.
  h.boss.hull = 20;
  tick(h, 40);
  assert.equal(plateSpawns(h).filter((e) => e.data.capitalPlate.plateId === 'battery_housing').length, 1);
});

test('a mid-fight save keeps torn/attached state and restore spawns nothing', () => {
  const h = bootScoreFight(TOLLMAN);
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.9);
  tick(h, 40);
  assert.equal(plateRec(h, 'battery_housing').attached, false);
  const saved = h.capSys.serialize();
  const before = plateSpawns(h).length;

  const h2 = bootScoreFight(TOLLMAN);
  h2.state.tick = h.state.tick; // the restored record's lastTick must not run backwards
  h2.capSys.restore(saved);
  const rec2 = h2.state.capitalBossEncounters.fights[h.fightId];
  assert.ok(rec2, 'the fight restores');
  assert.equal(rec2.plates.find((p) => p.id === 'battery_housing').attached, false);
  assert.equal(rec2.plates.find((p) => p.id === 'ledger_plate').attached, true);
  tick(h2, 40);
  assert.equal(h2.spawned.filter((e) => e.data && e.data.capitalPlate).length, 0,
    'restore never re-spawns the torn slab');

  // A pre-plates save (v1 record) restores with every plate attached.
  const legacy = JSON.parse(JSON.stringify(saved));
  const lf = legacy.fights[h.fightId];
  lf.version = 1;
  delete lf.plates;
  h2.capSys.restore(legacy);
  const rec3 = h2.state.capitalBossEncounters.fights[h.fightId];
  assert.ok(rec3.plates.every((p) => p.attached === true), 'v1 restores all plates attached');
});

test('a swarm champion fight spawns no plates', () => {
  const h = bootScoreFight(TOLLMAN);
  const rec = fightRec(h);
  rec.fightId = 'swarm:champion:test';
  delete h.state.capitalBossEncounters.fights[h.fightId];
  h.state.capitalBossEncounters.fights['swarm:champion:test'] = rec;
  h.fightId = 'swarm:champion:test';
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.9);
  tick(h, 60);
  assert.equal(plateSpawns(h).length, 0, 'swarm fights never spawn plates');
  assert.equal(h.boss.data.capitalPlateCover || null, null);
});

test('two runs on the same seed tear on the same tick', () => {
  const tearTick = () => {
    const h = bootScoreFight(TOLLMAN);
    const anchor = plateAnchorLocal(h, 'battery_housing');
    latchAt(h, anchor, 0.9);
    for (let t = 0; t < 90; t += 1) {
      tick(h, 1);
      if (!plateRec(h, 'battery_housing').attached) return t;
    }
    return -1;
  };
  assert.equal(tearTick(), tearTick(), 'the tear tick is deterministic');
});

test('review 2: the torn slab draws as the armor slab part it names', () => {
  const h = bootScoreFight(TOLLMAN);
  const anchor = plateAnchorLocal(h, 'battery_housing');
  latchAt(h, anchor, 0.9);
  tick(h, 40);
  const slab = plateSpawns(h);
  assert.equal(slab.length, 1);
  assert.equal(wreckPackagedFile(slab[0]), 'places/place_aftermath_aft_armor_slab.glb',
    'fractureVisual.partId selects the authored slab, never a hash-picked aftermath piece');
});

test('review 2: the rope tear hand-off is not a failed-cable crack', () => {
  assert.equal(tetherBreakCueForReason('capital_plate_tear'), null,
    'the cut+re-latch is quiet on tether:broken / tether:broke; the latch voices it');
});

test('review 2: plate cover drops when the fight ends or detaches', () => {
  const h = bootScoreFight(TOLLMAN);
  tick(h, 3);
  assert.ok(h.boss.data.capitalPlateCover, 'live fight stamps the cover');
  fightRec(h).terminal = 'victory';
  tick(h, 1);
  assert.equal(h.boss.data.capitalPlateCover, null, 'a finished fight pays for no plate');
  const h2 = bootScoreFight(TOLLMAN);
  tick(h2, 3);
  assert.ok(h2.boss.data.capitalPlateCover);
  h2.bus.emit('capitalBoss:detach', { fightId: h2.fightId });
  assert.equal(h2.boss.data.capitalPlateCover, null, 'a detached fight leaves no cover behind');
});

test('review 3: tear the plate, sling its slab back, and the bared subsystem takes the hit', () => {
  const created = [];
  const svc = { cut() {}, create: (spec) => { created.push(spec); return { ok: true, attachment: { id: 'att_slab' } }; } };
  const h = bootScoreFight(TOLLMAN, { attachmentService: svc });
  const weaponHp = () => bossSubsystemHp(h, 'subsystem_weapon');
  const whipHit = (slabId) => h.helpers.routeCombatDamage({
    attackerId: h.player.id, targetId: h.boss.id,
    packet: { channels: { kinetic: 40 }, hit: { subsystemId: 'subsystem_weapon' },
      source: { kind: 'massline_whip', entityId: slabId } },
    origin: { kind: 'massline_whip', impactorId: slabId },
  });
  // Before the tear the same whip impact is eaten by the plate.
  tick(h, 3);
  const hp0 = weaponHp();
  assert.ok(hp0 > 0, 'the boss carries a live weapon subsystem');
  whipHit(null);
  assert.equal(weaponHp(), hp0, 'the bolted plate covers the weapon');
  latchAt(h, plateAnchorLocal(h, 'battery_housing'), 0.9);
  tick(h, 40);
  const slab = plateSpawns(h)[0];
  assert.ok(slab, 'the plate tore into a slab');
  assert.equal(created.at(-1).targetId, slab.id, 'the line is latched on the slab');
  assert.equal((h.boss.data.capitalPlateCover || {}).subsystem_weapon, undefined, 'cover dropped');
  const hull0 = h.boss.hull;
  whipHit(slab.id);
  assert.ok(weaponHp() < hp0,
    'the slab whipped into the boss lands subsystem damage on the now-uncovered weapon');
  assert.ok(h.boss.hull < hull0, 'and the hull still takes its share');
});
