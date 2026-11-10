import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactMemoryFor } from '../src/data/stationContacts.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { CERES_SHIPBREAK_MANIFEST as SITE } from '../src/data/ceresShipbreak.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { ceresShiftOutcome, ceresReturnChoices, ceresReturnReply,
  CERES_RETURN_CONTACT as CONTACT, CERES_RETURN_STATION as STATION } from '../src/story/ceresShiftReturn.js';
import { generateContacts, getChoices, buildReply, emitBarContactChoice } from '../src/ui/station/barContacts.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { fakeDom } from './helpers/fake-dom.mjs';
const copy = v => JSON.parse(JSON.stringify(v));
const q = (verb, outcome) => `ceres_return_${verb}_${outcome}`;
const dock = s => { s.world.currentSectorId = 'sector_helios_prime'; s.ui.docked = true; s.ui.dockedStationId = STATION; };
const flags = s => stationContactMemoryFor(s, CONTACT)?.flags || {};
function scene(s, outcome) {
  const site = { completedOperations: {}, payloads: { long_plate: {} } };
  s.sites = { worldById: { [C.siteId]: site } }; s.npcJobs = {};
  if (outcome !== 'unbraced') site.completedOperations.brace_long_plate = {};
  if (outcome !== 'working') site.completedOperations.cut_long_plate_seam = {};
  if (['secured', 'aftercare'].includes(outcome)) site.payloads.long_plate.retained = { receiverWorldRecordId: C.identities.cradle, tick: 1 };
  if (outcome === 'lost') site.payloads.long_plate.destroyed = true;
  if (outcome === 'custody') s.npcJobs.ceresWorkfleet = { phase: 'player-retained' };
  if (['stopped', 'aftercare'].includes(outcome)) s.npcJobs.ceresWorkfleet = { phase: 'worker-disabled' };
  return site;
}
function fixture() {
  const sim = createSimulation({ seed: 23, systems: [stationContacts], updateOrder: [] });
  const s = sim.state; s.mode = 'flight'; s.run.kind = 'adventure'; dock(s);
  const contact = () => generateContacts(STATION, s).find(c => c.id === CONTACT);
  const emit = (choiceId, extra = {}) => emitBarContactChoice(sim.bus, { stationId: STATION,
    contactId: CONTACT, canonicalKey: 'kessler', name: 'Kessler', role: 'merchant', choiceId, ...extra });
  const talk = choice => {
    const c = contact(); assert.ok(getChoices(c.role, c).some(row => row.id === choice), choice);
    emit(choice); return buildReply(c.role, choice, { state: s, bus: sim.bus }, STATION, c).text;
  };
  return { sim, s, contact, emit, talk, close: () => sim.dispose() };
}

// Actual mounted handlers, with layout replaced by a DOM stub. This verifies
// routing/continuity, not pixels or the public flight between Ceres and Helios.
function mountBar(state, bus) {
  const names = ['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(names.map(k => [k, globalThis[k]]));
  const doc = fakeDom(), make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag), selectors = new Map();
    Object.assign(node, { isConnected: true, hidden: false, offsetWidth: 10, ownerDocument: doc });
    node.style.getPropertyValue = () => ''; node.style.removeProperty = () => {};
    node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 });
    node.querySelector = sel => { if (!selectors.has(sel)) selectors.set(sel, doc.createElement('div')); return selectors.get(sel); };
    node.replaceChildren = (...children) => { node.children = []; children.forEach(c => node.appendChild(c)); };
    node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; };
    node.remove = () => node.parentNode?.removeChild(node); node.scrollIntoView = () => {};
    node.hasAttribute = key => key in node.attributes; return node;
  };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag); doc.body = doc.createElement('body');
  doc.querySelector = () => null; doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  globalThis.document = doc; globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const screen = createBarScreen({ state, bus }); screen.onShow();
  const rail = screen.el.querySelector('.sx-bar__rail'), stage = screen.el.querySelector('.sx-bar__stage');
  const click = async (node, attr, value) => {
    const button = doc.createElement('button'); button.setAttribute(attr, value);
    for (const fn of node.listeners.click || []) await fn({ target: { closest: sel => sel === `[${attr}]` ? button : null } });
  };
  return { screen, rail, stage, click, close() { screen.dispose(); for (const k of names) {
    if (previous[k] === undefined) delete globalThis[k]; else globalThis[k] = previous[k];
  } } };
}

test('the ordinary Kessler card keeps the paid offer until actual work exists, then exposes the return', () => {
  const f = fixture();
  try {
    assert.ok(getChoices(f.contact().role, f.contact()).some(c => c.id === 'ceres_second_measure_shift'));
    assert.equal(ceresShiftOutcome(f.s), null);
    scene(f.s, 'working');
    assert.ok(getChoices(f.contact().role, f.contact()).some(c => c.id === q('read', 'working')));
    assert.ok(!getChoices(f.contact().role, f.contact()).some(c => c.id === 'ceres_second_measure_shift'));
    const unchanged = copy({ sites: f.s.sites, credits: f.s.player.credits, missions: f.s.missions, cargo: f.s.player.cargo });
    assert.match(f.talk(q('read', 'working')), /No completed lift/);
    assert.match(f.talk(q('crew', 'working')), /paid and their shift can still be unfinished/);
    f.talk(q('remember', 'working'));
    assert.equal(flags(f.s).ceres_crew_matters, true);
    assert.match(f.talk(q('read', 'working')), /crew still has an unfinished lift/);
    assert.deepEqual(copy({ sites: f.s.sites, credits: f.s.player.credits, missions: f.s.missions, cargo: f.s.player.cargo }), unchanged);
    f.talk(q('leave', 'working')); assert.equal(flags(f.s).ceres_crew_matters, undefined);
    assert.match(f.talk(q('read', 'working')), /Four hundred credits/);
  } finally { f.close(); }
});

test('each physical outcome has its own conversation, with no invented death or completed lift', () => {
  const cases = { working: /unfinished/, secured: /They got it in/, lost: /plate that is gone/,
    unbraced: /cannot do this lift/, custody: /custody claim, not a delivery receipt/, aftercare: /Nor will I cross out what they did finish/, stopped: /make the equipment and the handling path safe/ };
  for (const [outcome, expression] of Object.entries(cases)) {
    const f = fixture();
    try {
      scene(f.s, outcome); assert.equal(ceresShiftOutcome(f.s), outcome);
      const before = copy({ site: f.s.sites, job: f.s.npcJobs });
      f.talk(q('read', outcome)); assert.match(f.talk(q('crew', outcome)), expression);
      f.talk(q('remember', outcome));
      assert.deepEqual(copy({ site: f.s.sites, job: f.s.npcJobs }), before);
      assert.equal(flags(f.s).ceres_crew_matters, true);
    } finally { f.close(); }
  }
});

test('current loss and custody outrank an old retained slip; a phase alone does not certify the cradle', () => {
  const f = fixture();
  try {
    const record = scene(f.s, 'secured');
    f.s.npcJobs.ceresWorkfleet = { phase: 'player-retained' }; assert.equal(ceresShiftOutcome(f.s), 'custody');
    record.payloads.long_plate.destroyed = true; assert.equal(ceresShiftOutcome(f.s), 'lost');
    delete record.payloads.long_plate.destroyed; delete record.payloads.long_plate.retained;
    f.s.npcJobs.ceresWorkfleet.phase = 'secured'; assert.equal(ceresShiftOutcome(f.s), 'working');
    record.payloads.long_plate.retained = { receiverWorldRecordId: 'other-yard' };
    assert.equal(ceresShiftOutcome(f.s), 'working');
  } finally { f.close(); }
});

test('outcome changes reopen the current facts and stale intents cannot skip or overwrite memory', () => {
  const f = fixture();
  try {
    scene(f.s, 'working');
    f.emit(q('remember', 'working')); f.emit(q('crew', 'working'));
    assert.deepEqual(flags(f.s), {});
    f.talk(q('read', 'working')); f.talk(q('crew', 'working')); f.talk(q('remember', 'working'));
    scene(f.s, 'secured'); const before = copy(flags(f.s));
    for (const choice of [q('leave', 'working'), q('crew', 'secured'), q('remember', 'secured'), 'ceres_return_nonsense']) f.emit(choice);
    assert.deepEqual(flags(f.s), before);
    assert.match(ceresReturnChoices(f.s, STATION)[0].label, /remember the crew/);
    assert.match(ceresReturnReply(f.s, STATION, q('leave', 'working')).text, /current entry/);
    f.talk(q('read', 'secured')); f.talk(q('crew', 'secured')); f.talk(q('leave', 'secured'));
    assert.equal(flags(f.s).ceres_crew_matters, undefined);
  } finally { f.close(); }
});

test('missing work, wrong contact, wrong venue, undocking and Continue restoration reject talk before memory', () => {
  const f = fixture();
  try {
    f.emit(q('read', 'working')); assert.deepEqual(flags(f.s), {});
    scene(f.s, 'working');
    for (const mutate of [s => s.ui.docked = false, s => s.ui.dockedStationId = 'station_ceres',
      s => s.world.currentSectorId = C.sectorId, s => s.physicsVenue = { active: true },
      s => s.run.kind = 'swarm', s => s.save = { restoring: true }]) {
      dock(f.s); f.s.physicsVenue = {}; f.s.run.kind = 'adventure'; f.s.save = {}; mutate(f.s);
      f.emit(q('read', 'working')); assert.deepEqual(flags(f.s), {});
    }
    dock(f.s); f.s.save = {}; f.s.run.kind = 'adventure';
    f.emit(q('read', 'working'), { contactId: 'contact_station_helios_wex' });
    f.emit(q('read', 'working'), { stationId: 'station_ceres' });
    assert.deepEqual(flags(f.s), {});
    f.talk(q('read', 'working')); assert.equal(flags(f.s).choice_ceres_return_read_working, true);
  } finally { f.close(); }
});

test('mounted Bar preserves the interrupted return, keeps other topics, and answers a changed original', async () => {
  const f = fixture(); scene(f.s, 'working'); const ui = mountBar(f.s, f.sim.bus);
  try {
    await ui.click(ui.rail, 'data-contact', CONTACT);
    await ui.click(ui.stage, 'data-choice', q('read', 'working'));
    assert.match(ui.stage.innerHTML, /No completed lift/);
    ui.screen.onHide(); ui.screen.onShow();
    assert.match(ui.stage.innerHTML, /ceres_return_crew_working/);
    await ui.click(ui.stage, 'data-choice', q('crew', 'working'));
    await ui.click(ui.stage, 'data-choice', q('remember', 'working'));
    assert.equal(flags(f.s).ceres_crew_matters, true);
    await ui.click(ui.rail, 'data-contact', 'contact_station_helios_wex');
    assert.doesNotMatch(ui.stage.innerHTML, /data-choice="ceres_return_/);
    scene(f.s, 'lost');
    await ui.click(ui.rail, 'data-contact', CONTACT);
    assert.match(ui.stage.innerHTML, /remember the crew/);
    await ui.click(ui.stage, 'data-choice', q('read', 'lost'));
    assert.match(ui.stage.innerHTML, /long plate is gone/);
    assert.match(ui.stage.innerHTML, /data-choice="routes"/);
  } finally { ui.close(); f.close(); }
});

for (const braced of [false, true]) test(`native ${braced ? 'paid brace' : 'premature cut'} reaches the human return and full Save/Continue`, async () => {
  const prior = snapshotFeatureMaps();
  const rt = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 48 });
  applyFeatureConfigToMaps(rt.config.features);
  try {
    const s = rt.state, world = rt.getSystem('world'); s.mode = 'flight'; s.run.kind = 'adventure';
    const player = rt.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: { x: 0, z: 0 }, fittings: [] })); s.playerId = player.id;
    world.enterSector(C.sectorId); world.relocatePlayerInSector(SITE.mapAnnotation.coursePos, { reason: 'ceres-return-fixture' });
    const sites = rt.getSystem('asteroidSites'); sites._syncWorldSites(C.sectorId);
    assert.equal(await rt.getSystem('physics').prepareBackend(s), true);
    const target = s.entityList.find(e => e.alive && e.data?.worldSiteId === C.siteId
      && e.data.worldSiteComponentId === (braced ? 'long_plate_clamp' : 'long_plate'));
    player.pos.set(target.pos.x, 0, target.pos.z - 90); player.vel.set(0, 0, 0);
    s.ui.docked = false; s.ui.beamMode = 'auto'; s.ui.componentSelection = null;
    s.player.targetId = target.id; s.input.actions = { mine: true, siteBeam: true }; s.input.fireGroup = 2;
    const mining = rt.getSystem('mining'), credits = s.player.credits; mining._stopBeam();
    for (let n = 0; n < (braced ? 81 : 181); n++) { s.tick++; s.simTime += 1/60; mining.update(1/60, s); }
    mining._stopBeam(); s.input.actions = {}; s.input.fireGroup = 0;
    assert.equal(s.player.credits, credits + (braced ? 400 : 0));
    const outcome = braced ? 'working' : 'unbraced'; assert.equal(ceresShiftOutcome(s), outcome);
    // Transfer/dock is an explicit fixture, not a claim of an earned intersector flight.
    world.enterSector('sector_helios_prime'); dock(s);
    for (const verb of ['read', 'crew', 'remember']) emitBarContactChoice(rt.bus, { stationId: STATION,
      contactId: CONTACT, canonicalKey: 'kessler', name: 'Kessler', role: 'merchant', choiceId: q(verb, outcome) });
    assert.equal(flags(s).ceres_crew_matters, true);
    const saver = rt.getSystem('save'), envelope = copy(saver.serialize('ceres-return'));
    assert.equal(saver.loadEnvelope(envelope, 'ceres-return'), true); dock(s);
    assert.equal(ceresShiftOutcome(s), outcome); assert.equal(flags(s).ceres_crew_matters, true);
    assert.equal(s.player.credits, credits + (braced ? 400 : 0));
    assert.ok(ceresReturnChoices(s, STATION).some(c => c.id === q('remember', outcome)));
    world.enterSector(C.sectorId); world.relocatePlayerInSector(SITE.mapAnnotation.coursePos, { reason: 'ceres-return-revisit' }); sites._syncWorldSites(C.sectorId);
    const originals = s.entityList.filter(e => e.alive && e.data?.worldRecordId === C.identities.payload);
    assert.equal(originals.length, 1); assert.equal(originals[0].mass, 1800);
    assert.equal(originals[0].physicsBody.dynamic, !braced);
    assert.equal(s.player.credits, credits + (braced ? 400 : 0));
  } finally { rt.dispose(); restoreFeatureMaps(prior); }
});

test('production worker publishes all return steps and remembered emphasis through a cold contact bag', { timeout: 60000 }, async () => {
  const { readFileSync } = await import('node:fs');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createSimCommandRing, pushLaneCommand } = await import('../scripts/lib/simCommandChannel.mjs');
  const { applyDomainPathUpdate } = await import('../scripts/lib/simReadModel.mjs');
  const { createBus } = await import('../src/core/eventBus.js');
  const f = fixture(); scene(f.s, 'working');
  for (let i = 0; i < 30; i++) f.s.player.stationContacts[`contact_ceres_return_${i}`] = {
    met: true, talkCount: 1, flags: {}, name: `Previous contact ${i}` };
  const host = createSimHost(), bus = createBus(), commands = []; let ui;
  try {
    const init = await host.init({ profile: 'production', seed: 48, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) });
    const s = host.host.state; s.mode = 'flight'; s.run.kind = 'adventure'; dock(s);
    s.sites = copy(f.s.sites); s.npcJobs = copy(f.s.npcJobs); s.player.stationContacts = copy(f.s.player.stationContacts);
    bus.on('ui:talkContact', payload => commands.push(structuredClone(payload)));
    const domains = new Map(Object.entries(f.s)); let seq = 0;
    const flush = async () => {
      const ring = createSimCommandRing();
      for (const payload of commands.splice(0)) pushLaneCommand(ring, { kind: 'busEmit', emit: 'ui:talkContact', payload });
      const win = globalThis.window; delete globalThis.window; let reply;
      try { reply = await host.tick({ tick: ++seq, steps: 0, generation: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) }); } finally { globalThis.window = win; }
      for (const update of reply.domainUpdates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        if (!['player', 'sites', 'npcJobs'].includes(segs[0])) continue;
        applyDomainPathUpdate(domains, { ...update, segs }, new Set()); f.s[segs[0]] = domains.get(segs[0]);
      }
      for (const event of reply.events || []) bus.emit(event.t, event.p);
    };
    await flush(); ui = mountBar(f.s, bus);
    await ui.click(ui.rail, 'data-contact', CONTACT);
    for (const verb of ['read', 'crew', 'remember']) {
      await ui.click(ui.stage, 'data-choice', q(verb, 'working')); await flush();
      assert.equal(flags(f.s)[`choice_${q(verb, 'working')}`], true);
    }
    assert.equal(flags(s).ceres_crew_matters, true); assert.equal(flags(f.s).ceres_crew_matters, true);
    assert.match(ui.stage.innerHTML, /I still want to hear about the crew/);
    await ui.click(ui.stage, 'data-choice', q('read', 'working'));
    assert.match(ui.stage.innerHTML, /looks for the current yard slip/); await flush();
    assert.match(ui.stage.innerHTML, /crew still has an unfinished lift/);
    await ui.click(ui.stage, 'data-choice', q('leave', 'working')); await flush();
    assert.equal(flags(s).ceres_crew_matters, undefined); assert.equal(flags(f.s).ceres_crew_matters, undefined);
    ui.screen.onHide(); ui.screen.onShow();
    assert.match(ui.stage.innerHTML, /Next time, start with the crew/);
    for (const outcome of ['custody', 'stopped', 'secured', 'aftercare', 'lost', 'unbraced']) {
      scene(s, outcome); await flush();
      // The new scalar phase is immediate. Site records keep their existing
      // bounded cadence; all spoken answers already come from authority.
      if (['custody', 'stopped'].includes(outcome)) assert.equal(ceresShiftOutcome(f.s), outcome);
      for (let n = 0; n < 60 && ceresShiftOutcome(f.s) !== outcome; n++) await flush();
      assert.equal(ceresShiftOutcome(f.s), outcome, `actual worker projection: ${outcome}`);
      ui.screen.refresh();
      assert.match(ui.stage.innerHTML, new RegExp(q('read', outcome)));
    }
  } finally { ui?.close(); host.shutdown(); f.close(); }
});

test('delayed authoritative replies reject stale outcomes and never overwrite a newer or retired conversation', async () => {
  const { createBus } = await import('../src/core/eventBus.js');
  const a = fixture(), f = fixture(), bus = createBus(), queued = [], receipts = [];
  scene(a.s, 'working'); a.talk(q('read', 'working')); a.talk(q('crew', 'working'));
  scene(f.s, 'working'); f.s.player.stationContacts = copy(a.s.player.stationContacts);
  bus.on('ui:talkContact', payload => queued.push(copy(payload)));
  a.sim.bus.on('comms:log', payload => { if (payload.source === 'ceres_shift_return') receipts.push(copy(payload)); });
  const ui = mountBar(f.s, bus);
  const settle = () => {
    for (const payload of queued.splice(0)) a.sim.bus.emit('ui:talkContact', payload);
    f.s.sites = copy(a.s.sites); f.s.npcJobs = copy(a.s.npcJobs);
    f.s.player.stationContacts = copy(a.s.player.stationContacts);
    for (const payload of receipts.splice(0)) bus.emit('comms:log', payload);
    bus.emit('stationContact:changed', { contactId: CONTACT });
  };
  try {
    await ui.click(ui.rail, 'data-contact', CONTACT);
    await ui.click(ui.stage, 'data-choice', q('remember', 'working'));
    assert.match(ui.stage.innerHTML, /looks for the current yard slip/);
    assert.doesNotMatch(ui.stage.innerHTML, /All right. The crew before the credits/);
    scene(a.s, 'lost'); settle();
    assert.equal(flags(a.s).ceres_crew_matters, undefined);
    assert.match(ui.stage.innerHTML, /does not match the current entry/);
    assert.match(ui.stage.innerHTML, /ceres_return_read_lost/);
    await ui.click(ui.stage, 'data-choice', q('read', 'lost'));
    a.sim.bus.emit('ui:talkContact', queued.shift()); const old = receipts.shift();
    await ui.click(ui.stage, 'data-choice', q('read', 'lost'));
    bus.emit('comms:log', old); assert.match(ui.stage.innerHTML, /looks for the current yard slip/);
    settle(); assert.match(ui.stage.innerHTML, /long plate is gone/);
    const answered = ui.stage.innerHTML;
    bus.emit('comms:log', { ...old, text: 'OBSOLETE ANSWER' }); assert.equal(ui.stage.innerHTML, answered);
    await ui.click(ui.stage, 'data-choice', q('crew', 'lost')); ui.screen.onHide(); settle(); ui.screen.onShow();
    assert.doesNotMatch(ui.stage.innerHTML, /looks for the current yard slip|plate that is gone/);
    await ui.click(ui.stage, 'data-choice', q('remember', 'lost'));
    await ui.click(ui.rail, 'data-contact', 'contact_station_helios_wex'); settle();
    assert.doesNotMatch(ui.stage.innerHTML, /crew before the credits/);
    await ui.click(ui.rail, 'data-contact', CONTACT);
    await ui.click(ui.stage, 'data-choice', q('read', 'lost'));
    bus.emit('save:loaded', {}); settle(); assert.doesNotMatch(ui.stage.innerHTML, /looks for the current yard slip|long plate is gone/);
    await ui.click(ui.stage, 'data-choice', q('leave', 'lost'));
    f.s.ui.docked = false; a.s.ui.docked = false; ui.screen.refresh(); settle();
    dock(f.s); dock(a.s); ui.screen.refresh();
    assert.equal(flags(a.s).ceres_crew_matters, true, 'the undocked request did not clear accepted memory');
    assert.doesNotMatch(ui.stage.innerHTML, /Your part, then|looks for the current yard slip/);
  } finally { ui.close(); a.close(); f.close(); }
});


test('later loss or equipment custody does not erase a recorded completed lift', () => {
  for (const outcome of ['lost', 'custody']) {
    const f = fixture();
    try {
      const record = scene(f.s, 'secured');
      if (outcome === 'lost') record.payloads.long_plate.destroyed = true;
      else f.s.npcJobs.ceresWorkfleet = { phase: 'player-retained' };
      assert.equal(ceresShiftOutcome(f.s), outcome);
      f.talk(q('read', outcome));
      const answer = f.talk(q('crew', outcome));
      assert.match(answer, outcome === 'lost' ? /finished the lift before the plate was lost/ : /completed lift still happened/);
      assert.doesNotMatch(answer, /cannot finish this lift/);
    } finally { f.close(); }
  }
});
