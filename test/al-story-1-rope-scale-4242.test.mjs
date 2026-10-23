// AL-STORY-1 (row 423) — "the rope is a scale": three authored manifest-declaration cases
// ride the native tow_recovery route; holding a loaded line on the real body for 0.5 s of
// qualifying ticks is the physical act of weighing it. The slip is durable economy-contract
// state, filed by law at the issuing station, spent by Oriel at the fence, and heard by
// Kessler only once the audit slip actually lands at Helios.
//
// Deterministic on seed 4242 at the fixed 1/60 step, on the real systems: native missions
// offer → accept → spawn path, real masslineTelemetry observer, real lawSecurity filing,
// real economyContracts evidence ledger, real story listener.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { story } from '../src/systems/story.js';
import { normalizeMassScaleState, physicalMassT } from '../src/systems/cargoCustody.js';
import { resolveMasslineInstrumentColumns } from '../src/ui/masslineCadenceReadout.js';
import { readClusterModel, mountOrreryCluster } from '../src/ui/orrery/hudAdapter.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';
import { SECTORS } from '../src/data/sectors.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

const SEED = 4242;
const DT = 1 / 60;
const CASES = Object.freeze([
  { kind: 'weight_audit', stationId: 'station_helios', declared: 20, offerId: 'eco_mass_scale_weight_audit_station_helios' },
  { kind: 'sealed_recovery', stationId: 'station_smuggler', declared: 24, offerId: 'eco_mass_scale_sealed_recovery_station_smuggler' },
  { kind: 'carrier_frame', stationId: 'station_ceres', declared: 32, offerId: 'eco_mass_scale_carrier_frame_station_ceres' },
]);
const SECTOR_OF = new Map();
for (const s of SECTORS) for (const st of s.stations || []) SECTOR_OF.set(st.id, s.id);

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  for (const evt of [
    'mission:offered', 'mission:offerBoarded', 'mission:accepted', 'mission:completed',
    'tether:massWeighed', 'customs:massSlipFiled', 'ambientComms:register',
    'law:incidentReceipt', 'toast', 'economy:chargeCredits', 'economy:grantCredits',
  ]) bus.on(evt, (p) => events.push({ evt, p }));
  const ctx = { state, bus, helpers: {}, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const voiceCalls = [];
  ctx.helpers.voice = { say: (req) => { voiceCalls.push(req); return true; } };
  const mis = Object.create(missions); mis.init(ctx);
  const eco = Object.create(economyContracts); eco.init(ctx);
  const law = Object.create(lawSecurity); law.init(ctx);
  const tel = Object.create(masslineTelemetry); tel.init(ctx);
  const sto = Object.create(story); sto.init(ctx);
  state.onboarding = { active: false, finished: true }; // serialized record present, tutorial done
  const player = ctx.helpers.spawnEntity({
    type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  state.player.credits = 1_000_000;
  const step = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      state.tick = (state.tick | 0) + 1;
      state.simTime = (Number(state.simTime) || 0) + DT;
      tel.update(DT, state);
    }
  };
  return { state, bus, events, mis, eco, law, tel, sto, player, voiceCalls, step };
}

const emitted = (t, evt) => t.events.filter((e) => e.evt === evt).map((e) => e.p);
const massScale = (t) => t.state.economyContracts && t.state.economyContracts.massScale;
const slips = (t) => (massScale(t) ? massScale(t).slips : {});

// Dock until the authored row boards — the G06 first-trade row may legitimately take the
// single economyContract slot on the first dock at Helios, so the retry rule is exercised.
function dockFor(t, c) {
  t.state.world.currentSectorId = SECTOR_OF.get(c.stationId);
  for (let i = 0; i < 4; i += 1) {
    t.bus.emit('dock:docked', { stationId: c.stationId });
    const board = t.state.missions.boards && t.state.missions.boards[c.stationId];
    if (board && (board.slots || []).some((row) => row && row.id === c.offerId)) return board;
  }
  assert.fail(`${c.offerId} never boarded at ${c.stationId}`);
}

function acceptAndTarget(t, c) {
  dockFor(t, c);
  assert.equal(t.mis.acceptMission(c.offerId), true, `${c.kind}: board offer accepts`);
  const inst = t.state.missions.active.find((m) => m && m.sourceOfferId === c.offerId)
    || t.state.missions.active.find((m) => m && m.id === c.offerId);
  assert.ok(inst, `${c.kind}: a native mission instance exists`);
  const target = [...t.state.entities.values()].find(
    (e) => e && e.data && (e.data.missionTag === inst.id || e.data.missionId === inst.id)
      && e.type === 'asteroid',
  );
  assert.ok(target, `${c.kind}: the native tow target spawned`);
  return { inst, target };
}

function startWeigh(t, target) {
  t.state.player.tether = {
    active: true, targetId: target.id, phase: 'loaded', strain: 0.4,
    load: 0.5, tensionEstimate: 0.4, restLength: 80, reelStrength: 0,
  };
  target.vel.x = 5;
  target.vel.z = 0;
}

test('three distinct authored kinds board, accept, and spawn a physically heavier body', () => {
  const t = boot();
  for (const c of CASES) {
    const { inst, target } = acceptAndTarget(t, c);
    assert.equal(inst.type, 'tow_recovery');
    assert.equal(inst.params.massDeclaration.kind, c.kind, 'declaration metadata rides the mission');
    assert.equal(inst.params.massDeclaration.declaredMassT, c.declared);
    assert.equal(inst.params.massU, c.declared, 'the manifest number is the declared weight');
    assert.equal(physicalMassT(target), 40, 'the spawned body honestly weighs 40 t');
    assert.equal(target.data.missionTargetSlot, 0);
    // Distinct consequences, not merely titles: each kind resolves to a different route.
    assert.equal(
      { weight_audit: 'station_helios', sealed_recovery: 'station_smuggler', carrier_frame: 'station_ceres' }[c.kind],
      c.stationId,
    );
  }
});

test('nothing is discoverable before the rope is actually loaded', () => {
  const t = boot();
  const { inst, target } = acceptAndTarget(t, CASES[0]);
  // Selection, scan facts, a parked or slack line create no slip, fence, or story line.
  assert.equal(Object.keys(slips(t)).length, 0);
  const infoLine = objectInfoLine(target, t.state, t.player, 100);
  assert.ok(infoLine == null || !/40\s*t|mass\s*40|40\.0/i.test(infoLine),
    'target info does not disclose the 40 t body');
  assert.equal(inst.params.massU, 20, 'native instructions keep the declared number');
  // A stationary attachment accrues nothing.
  t.state.player.tether = { active: true, targetId: target.id, phase: 'loaded', strain: 0.4, load: 0.5 };
  t.step(60);
  assert.equal(Object.keys(slips(t)).length, 0, 'a parked scale reads nothing');
  // A slack line accrues nothing.
  target.vel.x = 5;
  t.state.player.tether.phase = 'slack';
  t.state.player.tether.strain = 0;
  t.step(60);
  assert.equal(Object.keys(slips(t)).length, 0, 'slack is not weighing');
  assert.equal(emitted(t, 'tether:massWeighed').length, 0);
  assert.equal(emitted(t, 'ambientComms:register').length, 0);
});

test('the weigh mints exactly once at the 30th qualifying tick with the honest numbers', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  startWeigh(t, target);
  t.step(29);
  assert.equal(Object.keys(slips(t)).length, 0, '29 qualifying ticks is still not a weigh');
  assert.equal(emitted(t, 'tether:massWeighed').length, 0);
  t.step(1);
  const weighed = emitted(t, 'tether:massWeighed');
  assert.equal(weighed.length, 1, 'the 30th qualifying tick is a weigh');
  const slip = weighed[0];
  assert.equal(slip.slipId, 'mass-slip:eco_mass_scale_weight_audit_station_helios:0');
  assert.equal(slip.kind, 'weight_audit');
  assert.equal(slip.declaredMassT, 20);
  assert.equal(slip.measuredMassT, 40);
  assert.equal(slip.deltaMassT, 20);
  assert.equal(slip.ratio, 2);
  const kept = slips(t)[slip.slipId];
  assert.ok(kept, 'the durable owner kept the slip');
  assert.equal(kept.issuingStationId, 'station_helios');
  assert.equal(kept.measuredMassT, 40, 'the durable record re-read the body, not the payload');
  assert.ok(t.state.player.masslineTelemetry.massWeighing, 'the transient projection mirrors the weigh');
  t.step(60);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1, 'continued towing mints no duplicate');
});

test('dwell resets on slack/release/target change; forged events file nothing', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  startWeigh(t, target);
  t.step(15);
  t.state.player.tether.phase = 'slack'; // interrupt
  t.step(1);
  t.state.player.tether.phase = 'loaded';
  t.step(20);
  assert.equal(Object.keys(slips(t)).length, 0, 'interrupted dwell needs a fresh 30 ticks');
  t.step(10);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1, 'the fresh 30 ticks still earns the slip');
  // Release clears the projection and re-latching does not duplicate.
  t.state.player.tether.active = false;
  t.step(2);
  assert.equal(t.state.player.masslineTelemetry.massWeighing, undefined);
  // Rejections: dead target, unrelated body, wrong slot, fabricated event.
  t.state.player.tether = { active: true, targetId: target.id, phase: 'loaded', strain: 0.4, load: 0.5 };
  target.alive = false;
  t.step(45);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1, 'a dead body reads nothing');
  target.alive = true;
  const stray = t.state.entities.get(t.player.id);
  assert.ok(stray !== target);
  t.state.player.tether.targetId = t.player.id;
  t.step(45);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1, 'an unrelated target carries no declaration');
  const before = Object.keys(slips(t)).length;
  t.bus.emit('tether:massWeighed', {
    slipId: 'mass-slip:eco_mass_scale_weight_audit_station_helios:0',
    sourceOfferId: 'eco_mass_scale_weight_audit_station_helios',
    missionId: 'forged', targetSlot: 0, targetId: target.id, kind: 'weight_audit',
    declaredMassT: 20, measuredMassT: 40, deltaMassT: 20, ratio: 2, tick: 1, simTime: 1,
  });
  assert.equal(Object.keys(slips(t)).length, before, 'a forged event changes nothing');

  // Codex E2: mid-tow, a re-emitted event quoting a DIFFERENT measured mass must still be
  // refused — the payload has to repeat the owner's own projection, not just a valid id.
  const weigh2 = t.state.player.masslineTelemetry.massWeighing
    || { slipId: 'mass-slip:eco_mass_scale_weight_audit_station_helios:0' };
  const beforeE2 = Object.keys(slips(t)).length;
  const distinct = new Set(Object.keys(slips(t)));
  t.bus.emit('tether:massWeighed', {
    slipId: weigh2.slipId,
    sourceOfferId: 'eco_mass_scale_weight_audit_station_helios',
    missionId: 'forged', targetSlot: 0, targetId: target.id, kind: 'weight_audit',
    declaredMassT: 20, measuredMassT: 999, deltaMassT: 979, ratio: 49.95, tick: 1, simTime: 1,
  });
  assert.deepEqual(new Set([...Object.keys(slips(t)), ...distinct]), distinct,
    'a payload quoting a foreign measured mass files nothing');

  // The Codex case: real mission and target ids, but no rope was ever attached and the
  // telemetry owner has no matching projection — the emit is refused outright.
  const t2 = boot();
  const real = acceptAndTarget(t2, CASES[0]);
  assert.ok(!t2.state.player.tether, 'no tether has ever attached in this boot');
  t2.bus.emit('tether:massWeighed', {
    slipId: 'mass-slip:eco_mass_scale_weight_audit_station_helios:0',
    sourceOfferId: 'eco_mass_scale_weight_audit_station_helios',
    missionId: real.inst.id, targetSlot: 0, targetId: real.target.id, kind: 'weight_audit',
    declaredMassT: 20, measuredMassT: 40, deltaMassT: 20, ratio: 2, tick: 1, simTime: 1,
  });
  assert.equal(Object.keys(slips(t2)).length, 0, 'a real-ids emit without the rope files nothing');
  assert.ok(!t2.voiceCalls.some((c) => c.channel === 'objective' && /mass-scale/.test(c.id || '')),
    'and no caption speaks for it');
});

test('a save/load severs the weigh — partial dwell never straddles a reload', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  startWeigh(t, target);
  t.step(15);
  t.bus.emit('save:loaded', {});
  // The reload severs the latch: the dwell clock restarts from zero on the next tick.
  t.step(29);
  assert.equal(emitted(t, 'tether:massWeighed').length, 0,
    '29 post-reload ticks is 0.48 s — the pre-reload dwell must not carry');
  t.step(1);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1,
    'a full 0.5 s post-reload dwell still earns the slip');
});

test('the dwell counts simulation seconds, not ticks', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  startWeigh(t, target);
  for (let i = 0; i < 59; i += 1) {
    t.state.tick += 1;
    t.state.simTime += 1 / 120;
    t.tel.update(1 / 120, t.state);
  }
  assert.equal(emitted(t, 'tether:massWeighed').length, 0,
    '59 updates at dt=1/120 is 0.49 s of dwell — the same rope must not weigh early');
  t.state.tick += 1;
  t.state.simTime += 1 / 120;
  t.tel.update(1 / 120, t.state);
  assert.equal(emitted(t, 'tether:massWeighed').length, 1,
    'update 60 reaches 0.5 s — the measurement is a time on the rope, not a frame count');
});

test('the ordinary field cadence keeps first shot; mass-scale runs after it on every dock', () => {
  const t = boot();
  const order = [];
  const planOffers = t.eco.planOffers.bind(t.eco);
  const offerMassScale = t.eco._offerMassScale.bind(t.eco);
  t.eco.planOffers = (info, epoch) => { order.push('field'); return planOffers(info, epoch); };
  t.eco._offerMassScale = (info, epoch) => { order.push('mass-scale'); return offerMassScale(info, epoch); };
  t.state.world.currentSectorId = SECTOR_OF.get('station_ceres');
  t.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.deepEqual(order.slice(0, 2), ['field', 'mass-scale'],
    'the epoch-guarded field evaluation runs before the non-returning mass-scale attempt');
  // And the mass-scale attempt still gets its turn: a later dock boards the authored row.
  dockFor(t, CASES[2]);
});

test('the live ORRERY adapter reads the earned slip, never the manifest or the hidden stamp', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  assert.equal(physicalMassT(target), 40, 'the spawned body honestly weighs 40 t');
  // The native latch identity: tetherGameplay mirrors attachmentId + targetId onto
  // state.player.tether, and the attachment ledger binds att_000001 to this body.
  // attachmentId is NOT an entity id — the adapter must walk the ledger, not entities.
  const attachments = t.state.combat.attachments
    || (t.state.combat.attachments = { nextId: 2, byId: {} });
  attachments.byId.att_000001 = {
    id: 'att_000001', ownerId: t.player.id, targetId: target.id, state: 'active',
  };
  t.state.player.tether = {
    active: true, attachmentId: 'att_000001', targetId: target.id, phase: 'loaded',
    strain: 0.4, load: 0.5, tensionEstimate: 0.4, restLength: 80, reelStrength: 0,
  };
  target.vel.x = 5;
  target.vel.z = 0;
  const hudMass = () => {
    const model = readClusterModel(t.state, t.player, { ordnance: {} });
    return model && model.tether ? model.tether.mass : undefined;
  };
  // Before the rope has measured, the declared body's tonnage is honestly unknown —
  // not the manifest's 20 t claim, not the body's hidden 40 t stamp, not a default 1 T.
  assert.equal(hudMass(), null, 'pre-weigh the scale shows no fabricated number');
  t.step(29);
  assert.equal(hudMass(), null, 'mid-dwell is still not a measurement');
  t.step(1);
  assert.equal(hudMass(), 40, 'the mounted adapter reads the earned slip, not a default');
  // A save-style boot keeps the same reading off the durable slip — no live latch, no
  // telemetry projection, just the record of a measurement already earned.
  const t2 = boot();
  t2.state.economyContracts.massScale = normalizeMassScaleState(
    JSON.parse(JSON.stringify(massScale(t))));
  const real2 = acceptAndTarget(t2, CASES[0]);
  const att2 = t2.state.combat.attachments
    || (t2.state.combat.attachments = { nextId: 2, byId: {} });
  att2.byId.att_000007 = {
    id: 'att_000007', ownerId: t2.player.id, targetId: real2.target.id, state: 'active',
  };
  t2.state.player.tether = {
    active: true, attachmentId: 'att_000007', targetId: real2.target.id, phase: 'loaded',
    strain: 0.4, load: 0.5, tensionEstimate: 0.4, restLength: 80, reelStrength: 0,
  };
  const model2 = readClusterModel(t2.state, t2.player, { ordnance: {} });
  assert.equal(model2.tether.mass, 40, 'the durable slip alone carries the reading');
});

test('the mounted Cluster answers the unweighed line: strain live, tonnage at the empty mark', () => {
  // Codex round-7: a mass gate on the payload readout hid the whole instrument while the
  // tonnage was honestly unknown — beam, strain dial and label vanished together at tick 0
  // and only reappeared once the weigh landed. The instrument answers the LINE, not the
  // scale: live strain reads from the first latched frame, the numeral waits for the
  // earned slip and prints the empty mark until then.
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  const attachments = t.state.combat.attachments
    || (t.state.combat.attachments = { nextId: 2, byId: {} });
  attachments.byId.att_000001 = {
    id: 'att_000001', ownerId: t.player.id, targetId: target.id, state: 'active',
  };
  t.state.player.tether = {
    active: true, attachmentId: 'att_000001', targetId: target.id, phase: 'loaded',
    strain: 0.4, load: 0.5, tensionEstimate: 0.4, restLength: 80, reelStrength: 0,
  };
  target.vel.x = 5;
  target.vel.z = 0;

  const previous = globalThis.document;
  const doc = fakeDom();
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create(tag);
    node.remove = () => {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
      node.parentNode = null;
    };
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  globalThis.document = doc;
  const root = doc.createElement('div');
  let mounted = null;
  const payloadEl = () => findAll(root, (n) => /orr-cluster__payload/.test(n.className || ''))[0];
  const massLabel = () => payloadEl().children[1].getAttribute('aria-label');
  const strainText = () => findAll(payloadEl(), (n) => n.tagName === 'small')[0].textContent;
  try {
    mounted = mountOrreryCluster(root, t.state);
    // Before the dwell earns anything the rope is already loaded — the instrument paints,
    // the strain reads, and only the tonnage waits at the empty mark.
    mounted.update(t.state, t.player, true);
    const payload = payloadEl();
    assert.ok(payload, 'the payload readout exists in the mounted cluster');
    assert.equal(payload.style.visibility, 'visible',
      'an active line shows the instrument before the scale reads a number');
    assert.equal(strainText(), 'STRAIN 50%', 'live strain still reads on the unweighed line');
    assert.equal(massLabel(), '— T',
      'an unearned tonnage prints the empty mark, never a fabricated count');
    t.step(29);
    mounted.update(t.state, t.player, true);
    assert.equal(payloadEl().style.visibility, 'visible', 'mid-dwell the instrument stays up');
    assert.equal(strainText(), 'STRAIN 50%', 'the strain never blinked during the dwell');
    assert.equal(massLabel(), '— T', '29 ticks is still no measurement');
    t.step(1);
    mounted.update(t.state, t.player, true);
    assert.equal(payloadEl().style.visibility, 'visible');
    assert.equal(massLabel(), '40 T', 'the earned slip lands its measured tonnage on the instrument');
    assert.equal(strainText(), 'STRAIN 50%', 'the weigh added the number without dramatizing the load');
  } finally {
    mounted?.dispose();
    globalThis.document = previous;
  }
});

test('instrument fields are untouched and the caption explains the discovery', () => {
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[1]);
  startWeigh(t, target);
  t.step(30);
  const tele = t.state.player.masslineTelemetry;
  assert.equal(tele.strain, 0.4, 'the weigh did not dramatize the instrument');
  assert.equal(tele.load, 0.5);
  const columns = resolveMasslineInstrumentColumns(t.state);
  assert.equal(columns.load, 0.5, 'the load instrument reads the same real load');
  assert.ok(t.voiceCalls.some((c) => c.channel === 'objective'
    && c.id === 'mass-scale:mass-slip:eco_mass_scale_sealed_recovery_station_smuggler:0'
    && /24/.test(c.text) && /40/.test(c.text)),
    'the objective caption quotes declared and measured and explains the next action');
});

test('customs files the audit slip at Helios and disputes the issuer at Ceres', () => {
  const t = boot();
  // Pre-weigh submit is ordinary compliance only.
  t.bus.emit('customs:submit', { factionId: 'faction_scn', stationId: 'station_helios' });
  let receipts = emitted(t, 'law:incidentReceipt');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, 'customs_complied');
  const creditsBefore = t.state.player.credits;
  const heatBefore = t.state.player.heat;

  const audit = acceptAndTarget(t, CASES[0]);
  startWeigh(t, audit.target);
  t.step(30);
  t.bus.emit('customs:submit', { factionId: 'faction_scn', stationId: 'station_helios' });
  receipts = emitted(t, 'law:incidentReceipt');
  const auditFiling = receipts.find((r) => r.cause === 'mass_manifest');
  assert.ok(auditFiling, 'the audit slip files at its issuing station');
  assert.equal(auditFiling.outcome, 'mass_discrepancy_filed');
  assert.equal(auditFiling.statusText, 'WEIGHT SLIP FILED');
  assert.match(auditFiling.text, /Helios Variance Office/);
  const filedEvents = emitted(t, 'customs:massSlipFiled');
  assert.equal(filedEvents.length, 1);
  assert.equal(filedEvents[0].slipId, 'mass-slip:eco_mass_scale_weight_audit_station_helios:0');
  assert.ok(slips(t)['mass-slip:eco_mass_scale_weight_audit_station_helios:0']
    .filedAtStations.station_helios, 'the owner records the filing');
  // A repeat submit does not refile.
  t.bus.emit('customs:submit', { factionId: 'faction_scn', stationId: 'station_helios' });
  assert.equal(emitted(t, 'customs:massSlipFiled').length, 1, 'no duplicate filing');

  const frame = acceptAndTarget(t, CASES[2]);
  startWeigh(t, frame.target);
  t.step(30);
  // Clean-hold docking files it too — the dock:docked path, no submit needed.
  t.bus.emit('dock:docked', { stationId: 'station_ceres' });
  const frameFiling = emitted(t, 'law:incidentReceipt').filter((r) => r.cause === 'mass_manifest');
  assert.equal(frameFiling.length, 2);
  assert.equal(frameFiling[1].outcome, 'mass_frame_disputed');
  assert.equal(frameFiling[1].statusText, 'ISSUER DISPUTED');
  assert.match(frameFiling[1].text, /Ceres Dock Registrar/);
  // The toast feed is invisible while docked (hud goes transparent under ui-modal-open and
  // the card would expire unseen), so nothing paints during the 11-second dock — the notice
  // is held in the massScale slice and re-presented on the first flight frame after undock.
  assert.equal(emitted(t, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || '')).length, 0,
    'no filing toast expires unseen while docked');
  assert.equal((massScale(t).pendingNotices || []).length, 2, 'both filings wait for the player');
  // Round-4 E1 setup: capture the slice BEFORE the undock drain — a save taken here still
  // holds both notices (the real docked-save defect).
  const slice = JSON.parse(JSON.stringify(massScale(t)));
  for (let i = 0; i < 11 * 60; i += 1) t.step(1);
  t.bus.emit('dock:undocked', { stationId: 'station_ceres' });
  const filingToasts = emitted(t, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || ''));
  assert.equal(filingToasts.length, 2, 'both filings paint the feed on undock');
  assert.match(filingToasts[0].text, /Helios Variance Office/);
  assert.match(filingToasts[0].text, /20\s*t/);
  assert.match(filingToasts[0].text, /40\s*t/);
  assert.match(filingToasts[0].text, /Manifest discrepancy filed/);
  assert.match(filingToasts[1].text, /Ceres Dock Registrar/);
  assert.match(filingToasts[1].text, /declaration is disputed/);
  t.bus.emit('dock:docked', { stationId: 'station_helios' });
  t.bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.equal(emitted(t, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || '')).length, 2,
    'a later dock cycle never repeats the notices');
  assert.equal(t.state.player.credits, creditsBefore, 'filing never charges');
  assert.equal(t.state.player.heat, heatBefore, 'filing never touches heat');
  assert.ok(t.state.player.cargo == null || Object.keys(t.state.player.cargo.items || {}).length === 0,
    'filing moves no cargo');

  // Round-4 E1: the docked-save slice captured above still holds both notices — the
  // production restore clears docking without a dock:undocked event, so save:loaded drains
  // them exactly once into visible flight.
  const t2 = boot();
  t2.state.economyContracts.massScale = normalizeMassScaleState(slice);
  t2.state.ui = { docked: false, dockedStationId: null };
  t2.state.player.flags = { ...(t2.state.player.flags || {}), docked: false };
  t2.bus.emit('save:loaded', {});
  assert.equal(emitted(t2, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || '')).length, 0,
    'the load handler only marks the drain — nothing emits before the presenter mounts');
  t2.bus.emit('economy:tick', { t: t2.state.simTime, ticksElapsed: 1 });
  assert.equal(emitted(t2, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || '')).length, 2,
    'the first economy:tick after the load paints both held notices, once');
  t2.bus.emit('economy:tick', { t: t2.state.simTime + 1 / 60, ticksElapsed: 2 });
  assert.equal(emitted(t2, 'toast').filter((m) => /WEIGHT SLIP/.test(m.text || '')).length, 2,
    'a second tick never repeats the notices');
});

test('the held notices drain on the scheduled production route, not only the event edge', () => {
  // Codex review-5: economyContracts has no seat in PRODUCTION_UPDATE_ORDER, so a drain that
  // only ran from update() would never fire for the player. The drain rides `economy:tick`,
  // which the in-order `economy` system emits from econTick on its own clock. The stepped
  // sim must therefore schedule ONLY economy — stepping economyContracts.update() too
  // would let its own drain run every tick and pass this test with the subscription
  // deleted (Codex review-6), which is exactly the production defect.
  const sim = createSimulation({ seed: SEED, systems: [economyContracts, economy], updateOrder: [economy] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  // economyContracts init'd before this probe, so on each economy:tick its drain runs
  // first — the count captured here is what the scheduled emit itself painted.
  const paintedAtTick = [];
  bus.on('economy:tick', () => paintedAtTick.push(toasts.length));
  state.economyContracts.massScale = normalizeMassScaleState({
    pendingNotices: [
      { text: 'WEIGHT SLIP FILED — customs holds the audit copy at Helios.' },
      { text: 'WEIGHT SLIP FILED — the frame attaches to the issuer at Ceres.' },
    ],
  });
  bus.emit('save:loaded', {});
  // Nothing may paint before the first scheduled economy tick — the presenter mounts after
  // the load handler, so the handler only arms the drain.
  assert.equal(toasts.length, 0, 'the load alone paints nothing');
  // Just under the 5 s econ clock (300 ticks at 1/60): the queue is still pending —
  // with the production-faithful schedule, nothing but economy:tick can drain it.
  sim.runTicks(299);
  assert.equal(paintedAtTick.length, 0, 'no economy:tick has fired yet');
  assert.equal(toasts.length, 0, 'no notice paints before the economy clock fires');
  assert.equal((state.economyContracts.massScale.pendingNotices || []).length, 2,
    'the notices stay queued while the scheduled clock has not fired');
  // Cross the first 5 s boundary: the in-order economy system emits its own clock
  // event, and the drain painted by that emit delivers both notices exactly once.
  sim.runTicks(2);
  assert.ok(paintedAtTick.length >= 1, 'the stepped sim really ran the economy clock');
  assert.equal(paintedAtTick[0], 2, 'the first scheduled economy:tick drained both notices');
  assert.equal(toasts.length, 2);
  sim.runTicks(400); // past the second 5 s econ clock
  assert.ok(paintedAtTick.length >= 2, 'the second econ clock also fired');
  assert.equal(toasts.length, 2, 'the second econ tick repeats nothing');
  assert.deepEqual(state.economyContracts.massScale.pendingNotices, []);
  sim.dispose();
});

test('a re-emitted event quoting a foreign measured mass files nothing', () => {
  // Round-5 E2 (Codex): durable dedup masks a replayed-alteration test unless no slip
  // exists yet. Detach the owner's handler so the genuine event is heard but never
  // delivered, replay the altered copies first, then deliver the real one.
  const t = boot();
  const { target } = acceptAndTarget(t, CASES[0]);
  let genuine = null;
  t.bus.off('tether:massWeighed', t.eco._onMassWeighed);
  t.bus.on('tether:massWeighed', (p) => { genuine = p; });
  startWeigh(t, target);
  for (let i = 0; i < 31; i += 1) t.step(1);
  assert.ok(genuine && genuine.measuredMassT > 20,
    'the weigh emitted its real event while the owner stood down');
  assert.equal(Object.keys(slips(t)).length, 0, 'withholding delivery records nothing');
  const mw = t.state.player.masslineTelemetry && t.state.player.masslineTelemetry.massWeighing;
  assert.ok(mw, 'the owner projection still minted');
  // Drive the owner method directly with the captured payload altered at its measured
  // mass — every other field is genuine, the projection minted, and the live tether
  // still points at the weighed body, so only the mass guard can refuse them.
  t.state.player.tether = { active: true, targetId: target.id, phase: 'loaded', load: 0.5, targetMassT: 40 };
  for (const alt of [959, Number(mw.measuredMassT) + 0.000002]) {
    t.eco._recordMassWeigh({
      ...genuine, measuredMassT: alt,
      deltaMassT: Math.abs(alt - 20), ratio: alt / 20,
    });
  }
  assert.equal(Object.keys(slips(t)).length, 0,
    'altered-payload calls record no slip even with valid identities and a live latch');
  t.eco._recordMassWeigh(genuine);
  assert.equal(Object.keys(slips(t)).length, 1,
    'the unmodified payload then records exactly one slip');
});

test('Oriel posts one real courier leg only after the sealed slip physically exists', () => {
  const t = boot();
  t.state.world.currentSectorId = SECTOR_OF.get('station_smuggler');
  for (let i = 0; i < 3; i += 1) t.bus.emit('dock:docked', { stationId: 'station_smuggler' });
  assert.equal(emitted(t, 'mission:offered').filter(
    (o) => o.cause && o.cause.tag === 'mass_scale_fence').length, 0, 'no slip, no fence offer');
  const sealed = acceptAndTarget(t, CASES[1]);
  startWeigh(t, sealed.target);
  t.step(30);
  const slipId = 'mass-slip:eco_mass_scale_sealed_recovery_station_smuggler:0';
  assert.ok(slips(t)[slipId]);
  let fenceOffer = null;
  for (let i = 0; i < 3 && !fenceOffer; i += 1) {
    t.bus.emit('dock:docked', { stationId: 'station_smuggler' });
    fenceOffer = emitted(t, 'mission:offered').find((o) => o.cause && o.cause.tag === 'mass_scale_fence');
  }
  assert.ok(fenceOffer, 'the validated slip earns the courier leg');
  assert.equal(fenceOffer.cause.massSlipId, slipId);
  assert.equal(fenceOffer.cause.fenceId, 'fence_oriel_pask');
  assert.equal(fenceOffer.type, 'cargo_delivery');
  assert.equal(fenceOffer.destStationId, 'station_ceres');
  assert.equal(fenceOffer.params.cmdtyId, 'cmdty_narcotics');
  assert.match(fenceOffer.brief, /24\s*t/);
  const cargoBefore = JSON.stringify(t.state.player.cargo && t.state.player.cargo.items);
  assert.equal(t.mis.acceptMission(fenceOffer.id), true, 'the courier leg accepts through missions');
  const items = (t.state.player.cargo && t.state.player.cargo.items) || {};
  const narco = items.cmdty_narcotics || 0;
  assert.equal(narco, 1, 'acceptance loads exactly one narcotics unit through the cargo writer');
  assert.notEqual(JSON.stringify(items), cargoBefore || '""');
  // Native delivery: docking at the contracted destination lets missions consume the
  // narcotics unit and complete the leg — never a fabricated mission:completed emit.
  const fenceInst = t.state.missions.active.find((m) => m && m.sourceOfferId === fenceOffer.id);
  assert.ok(fenceInst, 'the courier mission is active after acceptance');
  t.bus.emit('dock:docked', { stationId: 'station_ceres' });
  const completions = emitted(t, 'mission:completed').filter((e) => e.missionId === fenceInst.id);
  assert.equal(completions.length, 1, 'the courier leg completes natively on its destination dock');
  assert.equal(((t.state.player.cargo && t.state.player.cargo.items) || {}).cmdty_narcotics || 0, 0,
    'the delivered unit is consumed through the cargo writer');
  const grants = emitted(t, 'economy:grantCredits').filter((g) => g.reason === `mission:${fenceInst.id}`);
  assert.equal(grants.length, 1, 'exactly one payout for this leg lands through the credits writer');
  const ms = massScale(t);
  assert.equal(ms.fenceOffers[slipId].completed, true, 'the owner marks the leg spent');
  t.bus.emit('dock:docked', { stationId: 'station_smuggler' });
  assert.equal(emitted(t, 'mission:offered').filter((o) => o.cause && o.cause.tag === 'mass_scale_fence').length, 1,
    'completed legs do not repost');
});

test('the Kessler beat is earned only by a filed Helios audit slip', () => {
  const t = boot();
  const audit = acceptAndTarget(t, CASES[0]);
  startWeigh(t, audit.target);
  t.step(30);
  assert.equal(emitted(t, 'ambientComms:register').length, 0, 'weighing alone is not the beat');
  const sealed = acceptAndTarget(t, CASES[1]);
  startWeigh(t, sealed.target);
  t.step(30);
  t.bus.emit('dock:docked', { stationId: 'station_smuggler' });
  assert.equal(emitted(t, 'ambientComms:register').length, 0, 'a non-Helios filing never registers it');
  t.bus.emit('dock:docked', { stationId: 'station_helios' });
  const comms = emitted(t, 'ambientComms:register');
  assert.equal(comms.length, 1, 'weighing plus Helios filing registers exactly once');
  assert.equal(comms[0].id, 'mass_scale_47a_weight_slip');
  assert.equal(comms[0].sender, 'KESSLER');
  assert.equal(comms[0].persistent, true);
  const storyLines = t.sto.serialize && t.sto.serialize();
  assert.ok(JSON.stringify(storyLines).includes('mass_scale_47a_weight_slip'),
    'the real story listener stored the line');
  t.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(emitted(t, 'ambientComms:register').length, 1, 'repeated filings mint no second line');
});

test('the evidence slice round-trips and old saves stay byte-identical', () => {
  const t = boot();
  assert.equal('massScale' in t.state.economyContracts, false, 'absent before the first write');
  t.eco.deserialize({ evaluatedEpochByStation: {}, firstTradeOffered: false });
  assert.equal('massScale' in t.state.economyContracts, false, 'an old save grows no key');
  const audit = acceptAndTarget(t, CASES[0]);
  startWeigh(t, audit.target);
  t.step(30);
  t.bus.emit('dock:docked', { stationId: 'station_helios' });
  const saved = t.eco.serialize();
  const restored = JSON.parse(JSON.stringify(saved));
  const t2 = boot();
  t2.eco.deserialize(restored);
  const ms2 = t2.state.economyContracts.massScale;
  const slipId = 'mass-slip:eco_mass_scale_weight_audit_station_helios:0';
  assert.ok(ms2.slips[slipId], 'slips survive the round trip');
  assert.equal(ms2.slips[slipId].measuredMassT, 40);
  assert.ok(ms2.slips[slipId].filedAtStations.station_helios, 'filing survives');
  assert.equal(JSON.stringify(ms2), JSON.stringify(normalizeMassScaleState(ms2)),
    'the persisted slice is already normalized plain data');
  // Partial dwell is not a measurement and never crosses a reload.
  const t3 = boot();
  const a3 = acceptAndTarget(t3, CASES[0]);
  startWeigh(t3, a3.target);
  t3.step(15);
  t3.eco.deserialize(t3.eco.serialize());
  const ms3 = t3.state.economyContracts.massScale;
  assert.equal(!ms3 || Object.keys(ms3.slips).length === 0, true,
    '15 ticks of dwell leaves no slip');
  // Malformed slices normalize to empty without throwing.
  const bad = normalizeMassScaleState({ slips: { x: { slipId: 'x' } }, completed: 'nope' });
  assert.deepEqual(bad, { version: 1, slips: {}, completed: {}, fenceOffers: {} });
  // New Game clears the records.
  t.eco.newGame();
  assert.equal('massScale' in t.state.economyContracts, false);
});

test('measurement changes nothing about payment, cargo, or ordinary delivery', () => {
  const t = boot();
  const audit = acceptAndTarget(t, CASES[0]);
  const creditsBefore = t.state.player.credits;
  const cargoBefore = JSON.stringify((t.state.player.cargo && t.state.player.cargo.items) || {});
  const chargesBefore = emitted(t, 'economy:chargeCredits').length;
  startWeigh(t, audit.target);
  t.step(30);
  // The towed body is in the destination sector, so this destination dock completes the
  // mission through missions' own physical route — one completion, one payout.
  t.state.world.currentSectorId = audit.inst.destSectorId || t.state.world.currentSectorId;
  const grantsBefore = emitted(t, 'economy:grantCredits').length;
  t.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(t.state.player.credits, creditsBefore, 'no measurement side-effect lands on the wallet');
  assert.equal(JSON.stringify((t.state.player.cargo && t.state.player.cargo.items) || {}), cargoBefore,
    'the observer never moves cargo');
  assert.equal(emitted(t, 'economy:chargeCredits').length, chargesBefore,
    'the observer charges nothing');
  // missions still owns delivery and its own payment — the observer only closes its own
  // bookkeeping, never mints a second reward.
  const completions = emitted(t, 'mission:completed').filter((e) => e.missionId === audit.inst.id);
  assert.equal(completions.length, 1, 'the native tow completes on the destination dock');
  const grants = emitted(t, 'economy:grantCredits').filter((g) => g.reason === `mission:${audit.inst.id}`);
  assert.equal(grants.length, 1, 'exactly one payout for the tow lands through the credits writer');
  assert.equal(massScale(t).completed['eco_mass_scale_weight_audit_station_helios'], true,
    'the observer closes the case without minting a second reward');
});
