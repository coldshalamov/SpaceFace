import test from 'node:test';
import assert from 'node:assert/strict';
import { scanner } from '../src/systems/scanner.js';
import { contactHailAvailability, createContactHailOffer, createContactHailResponse, livingWorkStatusText } from '../src/data/contactHail.js';
import * as readout from '../src/world/charonSupplyReadout.js';
import { createContactHailPrompt } from '../src/ui/contactHailPrompt.js';
function entity(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    data: { ...base.data, ...(overrides.data || {}) },
  };
}

function baseState(target) {
  const player = entity('player', { team: 1, pos: { x: 0, z: 0 }, data: {} });
  const entities = new Map([[player.id, player]]);
  if (target) entities.set(target.id, target);
  return {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    playerId: player.id,
    player: {
      team: 1,
      targetId: target && target.id,
      credits: 4321,
      heat: 0,
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: [null, null, null, null, null, 'mod_cargo_scanner_s'],
      }],
      moduleInventory: [],
      cargo: { items: { cmdty_ore_common: 3 } },
    },
    entities,
    entityList: [...entities.values()],
    input: { actions: {} },
    ui: { docked: false },
    world: { currentSectorId: 'sector_test', scanPings: {} },
    factions: { faction_scn: { rep: 7 } },
    traffic: { freighters: [] },
    pirateParley: { squads: {} },
  };
}

function busHarness() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    off(name, fn) {
      const rows = listeners.get(name) || [];
      const i = rows.indexOf(fn);
      if (i >= 0) rows.splice(i, 1);
    },
    emit(name, payload) {
      events.push({ name, payload: structuredClone(payload) });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
  };
}

function mount(state) {
  const bus = busHarness();
  const system = Object.create(scanner);
  system.init({ state, bus });
  return { state, bus, system };
}

function emitted(bus, name) {
  return bus.events.filter((row) => row.name === name).map((row) => row.payload);
}

class El {
  constructor(tag) { this.tagName=tag;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.nodes={};this.listeners={};const c=new Set();this.classList={add:(...x)=>x.forEach(v=>c.add(v)),remove:(...x)=>x.forEach(v=>c.delete(v)),contains:x=>c.has(x),toggle:(x,b)=>b?c.add(x):c.delete(x)}; }
  set innerHTML(html) { for(const key of html.matchAll(/data-k="([^"]+)"/g)) { const el=new El('div');this.nodes[key[1]]=el;this.appendChild(el); } }
  querySelector(selector) { return this.nodes[/data-k="([^"]+)"/.exec(selector)?.[1]]; }
  setAttribute(k,v){this.attrs[k]=String(v);} removeAttribute(k){delete this.attrs[k];}
  appendChild(n){this.children.push(n);return n;} replaceChildren(...n){this.children=n;}
  addEventListener(n,f){this.listeners[n]=f;} removeEventListener(){} remove(){} contains(n){return this===n||this.children.includes(n);} focus(){document.activeElement=this;}
}

function fixture(kind = 'trader') {
  const h = entity('original-hauler', { hull: 100, occupantGeneration: 1, data: {
    trafficRole: 'hauler', callsign: 'CHARON HAULER', name: 'Original hauler',
    activityActorSlotId: 'charon_colony_hauler', worldRecordId: 'record-hauler',
    durable: true, identityKey: 'charon:activity:charon_colony_hauler',
    ai: { passive: true, archetype: 'fleeing_trader' },
  }});
  const r = entity('original-cutter', { hull: 100, occupantGeneration: 1, data: {
    trafficRole: 'salvor', callsign: 'CHARON CUTTER', name: 'Original cutter', jobPhase: 'hold',
    activityActorSlotId: 'charon_colony_salvor', worldRecordId: 'record-cutter',
    durable: true, identityKey: 'charon:activity:charon_colony_salvor', ai: { passive: true },
  }});
  const state = baseState(h);
  state.entities.set(r.id, r); state.entityList.push(r);
  state.player.targetId = kind === 'worker' ? r.id : h.id;
  state.world.currentSectorId = 'sector_charon_expanse';
  state.world.records = { byId: {} };
  for (const e of [h,r]) state.world.records.byId[e.data.worldRecordId] = {
    recordId: e.data.worldRecordId, identityKey: e.data.identityKey,
    alive: true, outcome: 'active', homeSectorId: 'sector_charon_expanse',
  };
  state.bandRadio = { channelId: null };
  state.traffic.charonSalvageSupply = {
    schema: 1, original: 6, phase: 'collect', haulerId: 'record-hauler', salvorId: 'record-cutter',
    haulerReady: true, salvorReady: true,
    pods: [{ id: 'charon_colony_air_pod', original: 6, loose: 6, aboard: 0, delivered: 0,
      consumed: 0, player: 0, other: 0, lost: 0 }],
  };
  const f = mount(state);
  const old = globalThis.document, head = new El('head'), root = new El('div');
  globalThis.document = { head, createElement: t => new El(t),
    getElementById: id => id === 'ui-root' ? root : head.children.find(e => e.id === id) || null,
    addEventListener(){}, removeEventListener(){} };
  const prompt = createContactHailPrompt({ state, bus: f.bus });
  return { ...f, h, r, prompt, book: state.traffic.charonSalvageSupply,
    restore() { prompt.destroy(); f.system.destroy(); globalThis.document = old; } };
}
function hail(f, choice = null) {
  f.bus.emit('contactHail:request', { targetId: f.state.player.targetId });
  const offer = emitted(f.bus, 'contactHail:offer').at(-1);
  assert.ok(offer, 'real scanner emitted an offer');
  if (!choice) return offer;
  f.bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice });
  return emitted(f.bus, 'contactHail:response').at(-1);
}
function visibleLines(f) { return f.prompt.el.nodes.lines.children.map(e => e.textContent); }
function phase(f, name, field = 'loose') {
  f.book.phase = name;
  for (const key of ['loose','aboard','delivered','consumed','player','other','lost']) f.book.pods[0][key] = key === field ? 6 : 0;
}

test('actual scanner and presenter retain the actionable Charon ROUTE line (baseline drops it)', () => {
  const f = fixture(); try {
    const before = JSON.stringify(f.book);
    const response = hail(f, 'route');
    assert.equal(response.lines.length, 2);
    assert.match(response.lines[1], /Bring the original loose supply pod/);
    assert.deepEqual(visibleLines(f), response.lines);
    assert.equal(f.prompt.el.nodes.panel.attrs['aria-label'], response.lines.join(' '));
    assert.ok(f.prompt.el.nodes.panel.classList.contains('sf-contact-hail__panel--detail'));
    assert.equal(f.prompt.el.nodes.panel.attrs.tabindex, '0');
    assert.equal(f.prompt.el.nodes.pilot.textContent, 'CHARON HAULER');
    assert.equal(JSON.stringify(f.book), before, 'presentation changes no supply facts');
    assert.equal(f.state.bandRadio.channelId, null);
  } finally { f.restore(); }
});

test('original worker has concise default offer/STATUS and a wrapped read-only SUPPLY ROUTE', () => {
  const f = fixture('worker'); try {
    const offer = hail(f);
    assert.equal(offer.kind, 'worker');
    assert.deepEqual(offer.lines, ['VISITING SALVAGE · NO RESIDENTS', '6 KITS LOOSE · ROUND WAITING']);
    assert.ok(offer.lines.every(line => line.length <= 32));
    assert.ok(offer.actions.some(a => a.id === 'route' && a.label === 'SUPPLY ROUTE'));
    assert.equal(f.prompt.el.nodes.pilot.textContent, 'CHARON CUTTER');
    assert.equal(f.prompt.el.nodes.panel.classList.contains('sf-contact-hail__panel--detail'), false);
    const status = hail(f, 'status');
    assert.deepEqual(status.lines, offer.lines);
    assert.deepEqual(visibleLines(f), status.lines);
    assert.equal(f.prompt.el.nodes.panel.attrs['aria-label'], status.lines.join(' '));
    assert.equal(f.prompt.el.nodes.panel.attrs.tabindex, undefined);
    assert.match(livingWorkStatusText(f.r, { state: f.state, depth: 'lock' }), /SUPPLY.*6 KITS LOOSE/);
    const route = hail(f, 'route');
    assert.match(route.lines[0], /colony was evacuated/);
    assert.match(route.lines[0], /Taking any cancels/);
    assert.match(route.lines[1], /slow it and release your tether/);
    assert.equal(route.actions.length, 0);
    assert.deepEqual(visibleLines(f), route.lines);
    assert.equal(f.prompt.el.nodes.panel.attrs['aria-label'], route.lines.join(' '));
    assert.equal(f.prompt.el.nodes.panel.attrs.tabindex, '0');
  } finally { f.restore(); }
});

test('reopening uses current finite facts, never an arrival assumption or heard-once state', () => {
  const f = fixture(); try {
    for (const [name, field, probe] of [
      ['collect','loose','6 KITS LOOSE'], ['collect','aboard','6 KITS ABOARD'],
      ['delivered','delivered','KITS AT CUTTER'], ['working','consumed','RESERVE USED'],
      ['shortfall','player','ROUND CANCELLED'], ['lost','lost','RESERVE LOST'],
    ]) {
      phase(f,name,field);
      const offer = hail(f);
      assert.ok(offer.lines[1].includes(probe), `${name}: ${offer.lines[1]}`);
      assert.ok(offer.lines.every(line => line.length <= 32));
      const route = hail(f,'route');
      if (name === 'shortfall') assert.match(route.lines[1], /cancelled.*no replacement/i);
      if (name === 'working') assert.match(route.lines[1], /used.*next cutting round/);
      if (name !== 'collect') assert.doesNotMatch(route.lines[0], /Taking any cancels/);
    }
    phase(f,'awaiting_round'); f.book.haulerReady = false;
    assert.match(hail(f).lines[1], /FINISHING CURRENT JOBS/);
    assert.match(hail(f,'route').lines[1], /finishing our current jobs/);
    f.book.haulerReady = true;
    assert.match(hail(f).lines[1], /6 KITS LOOSE/);
    assert.equal(f.state.bandRadio.channelId, null);
    assert.equal(f.state.bandRadio.heardLineIds, undefined);
  } finally { f.restore(); }
});

test('Continue-shaped restored facts and legitimate reentered original identities remain readable', () => {
  const f = fixture('worker'); try {
    hail(f); phase(f, 'shortfall', 'player');
    // Restore makes a new ledger and new canonical entity lives; presentation caches are not saved.
    f.state.traffic.charonSalvageSupply = JSON.parse(JSON.stringify(f.book));
    f.book = f.state.traffic.charonSalvageSupply;
    for (const key of ['h','r']) {
      const old = f[key], restored = structuredClone(old);
      restored.occupantGeneration++;
      f.state.entities.set(restored.id, restored);
      f.state.entityList = f.state.entityList.map(e => e === old ? restored : e);
      f[key] = restored;
    }
    assert.match(hail(f).lines[1], /ROUND CANCELLED/);
    // World shelving/rematerialization keeps the healthy original durable record.
    const old = f.r; old.alive = false; f.state.entities.delete(old.id);
    const returned = structuredClone(old); returned.id = 'reentered-cutter'; returned.alive = true; returned.occupantGeneration++;
    f.state.entities.set(returned.id, returned);
    f.state.entityList = f.state.entityList.filter(e => e !== old); f.state.entityList.push(returned);
    f.state.player.targetId = returned.id; f.r = returned;
    assert.match(hail(f).lines[1], /ROUND CANCELLED/);
    assert.match(hail(f,'route').lines[1], /taken or lost/);
  } finally { f.restore(); }
});

test('foreign records, replaced lives, duplicate originals, blocked books fail closed', () => {
  const f = fixture('worker'); try {
    assert.ok(readout.charonSupplyPresentation(f.state, f.r));
    const original = f.r.data.worldRecordId;
    f.r.data.worldRecordId = 'foreign';
    assert.equal(readout.charonSupplyPresentation(f.state, f.r), null);
    assert.ok(!hail(f).actions.some(a => a.label === 'SUPPLY ROUTE'));
    f.r.data.worldRecordId = original;
    f.r.occupantGeneration++;
    assert.equal(readout.charonSupplyPresentation(f.state, f.r), null);
    f.r.occupantGeneration--;
    const duplicate = structuredClone(f.r); duplicate.id = 'duplicate';
    f.state.entities.set(duplicate.id, duplicate); f.state.entityList.push(duplicate);
    assert.equal(readout.charonSupplyPresentation(f.state, f.r), null);
    f.state.entities.delete(duplicate.id); f.state.entityList.pop();
    f.book.blocked = true;
    assert.equal(readout.charonSupplyPresentation(f.state, f.r), null);
  } finally { f.restore(); }
});

test('surviving original reports missing counterpart without offering a fabricated replacement', () => {
  const f = fixture('worker'); try {
    f.h.alive = false;
    phase(f, 'awaiting_round');
    assert.match(hail(f).lines[1], /CREW MISSING/);
    const route = hail(f,'route');
    assert.match(route.lines[1], /original supply crew is missing/);
    assert.doesNotMatch(route.lines[0], /Taking any cancels/);
    phase(f, 'lost', 'loose');
    assert.match(hail(f).lines[1], /RECOVERY STOPPED/);
    assert.doesNotMatch(hail(f).lines[1], /RESERVE LOST/);
    assert.match(hail(f, 'route').lines[1], /6 kits loose/);
  } finally { f.restore(); }
});

test('non-Charon offers/actions/responses are identical with an irrelevant supply ledger', () => {
  for (const kind of ['worker','trader']) {
    const f = fixture(kind); try {
      for (const e of [f.h,f.r]) delete e.data.activityActorSlotId;
      const available = contactHailAvailability(f.state);
      const withBook = createContactHailOffer(f.state, available, 'control', 20);
      const withResponse = createContactHailResponse(f.state, withBook, kind === 'worker' ? 'status' : 'route');
      delete f.state.traffic.charonSalvageSupply;
      assert.deepEqual(createContactHailOffer(f.state, available, 'control', 20), withBook);
      assert.deepEqual(createContactHailResponse(f.state, withBook, kind === 'worker' ? 'status' : 'route'), withResponse);
      assert.ok(!withBook.actions.some(a => a.label === 'SUPPLY ROUTE'));
    } finally { f.restore(); }
  }
});

test('production Save/Continue and world leave/reentry retain readable original custody', async () => {
  const { charonSupplySaveFixture } = await import('./fixtures/charon-salvage-supply-save.mjs');
  const f = charonSupplySaveFixture();
  try {
    const original = f.state.traffic.charonSalvageSupply;
    const select = () => {
      const e = f.state.entities.get(readout.charonSupplyFacts(f.state).salvorId);
      assert.ok(e); f.state.player.targetId = e.id;
      const availability = contactHailAvailability(f.state);
      assert.equal(availability.enabled, true);
      return { e, offer: createContactHailOffer(f.state, availability, 'production-readout', f.state.simTime + 8) };
    };
    assert.match(select().offer.lines[1], /6 KITS LOOSE/);
    f.state.player.cargo.capVolume = 1; f.state.player.cargo.usedVolume = 0;
    assert.equal(f.runtime.getSystem('mining')._collectPayload(f.source(), f.state.entities.get(f.state.playerId)), true);
    f.runtime.step(1 / 60);
    const before = readout.charonSupplyFacts(f.state);
    assert.equal(before.player, 1); assert.equal(before.loose, 5);
    assert.match(select().offer.lines[1], /ROUND CANCELLED/);
    assert.equal(f.save.loadEnvelope(f.save.serialize('charon-supply-readout')), true);
    assert.match(select().offer.lines[1], /ROUND CANCELLED/);
    assert.equal(f.state.traffic.charonSalvageSupply.haulerId, original.haulerId);
    assert.equal(f.state.traffic.charonSalvageSupply.salvorId, original.salvorId);
    const restored = select().e;
    f.runtime.getSystem('world').enterSector('sector_dione_lane');
    f.runtime.getSystem('world').enterSector('sector_charon_expanse');
    const returned = select();
    assert.notEqual(returned.e.id, restored.id);
    assert.equal(returned.e.data.worldRecordId, original.salvorId);
    assert.match(returned.offer.lines[1], /ROUND CANCELLED/);
    const route = createContactHailResponse(f.state, returned.offer, 'route');
    assert.equal(route.lines.length, 2);
    assert.match(route.lines[1], /taken or lost/);
    const after = readout.charonSupplyFacts(f.state);
    assert.equal(after.player, 1); assert.equal(after.loose, 5);
  } finally { f.close(); }
});

test('selected-target lock resolves original identities once and skips detailed-route work', () => {
  const f = fixture('worker'); try {
    const list = f.state.entityList, filter = list.filter;
    let scans = 0;
    list.filter = function (...args) { scans++; return filter.apply(this, args); };
    try {
      const status = livingWorkStatusText(f.r, { state: f.state, depth: 'lock' });
      assert.match(status, /SUPPLY.*6 KITS LOOSE/);
      assert.equal(scans, 4, `lock path entity-list scans: ${scans}`);
      scans = 0;
      const foreign = entity('unrelated-worker', { data: { trafficRole: 'salvor', jobPhase: 'hold' } });
      f.state.entities.set(foreign.id, foreign); f.state.entityList.push(foreign);
      assert.equal(readout.charonSupplyPresentation(f.state, foreign, { detailed: false }), null);
      assert.equal(scans, 0, 'non-Charon guard must not scan original actors');
      livingWorkStatusText(foreign, { state: f.state, depth: 'lock' });
      assert.equal(scans, 0, 'ordinary selected-target lock adds no Charon population work');
      const compact = readout.charonSupplyPresentation(f.state, f.r, { detailed: false });
      assert.equal(compact.route, undefined, 'compact view must not build detailed route prose');
      const detailed = readout.charonSupplyPresentation(f.state, f.r);
      assert.deepEqual(compact.compact, detailed.compact);
      assert.equal(compact.status, detailed.status);
      assert.match(detailed.route[1], /slow it and release your tether/);
    } finally { list.filter = filter; }
  } finally { f.restore(); }
});

test('actual partial pickup during original jobs reports reserve shortfall before round boundary', async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { materializeCharonSupply } = await import('../src/world/charonSalvageSupply.js');
  const { sectorLocalToGlobalForSector } = await import('../src/data/sectorCoordinates.js');
  const { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } = await import('../src/data/featureFlags.js');
  const flags = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state, owner = runtime.getSystem('traffic');
  const materialize = owner._materializeAuthoredActivityCast;
  try {
    state.mode = 'flight'; state.ui.screenStack = [];
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player,
      team: 0, pos: sectorLocalToGlobalForSector({ x: -820, z: 1220 }, 'sector_charon_expanse') }));
    state.playerId = player.id;
    // Admit against already materialized original job holders, as the existing legacy-cast test does.
    owner._materializeAuthoredActivityCast = function (...args) {
      const result = materialize.apply(this, args);
      assert.equal(materializeCharonSupply(this, {
        entities: new Set(state.entityList), records: new Set(Object.keys(state.world.records.byId)),
      }), true);
      return result;
    };
    runtime.getSystem('world').enterSector('sector_charon_expanse');
    owner._materializeAuthoredActivityCast = materialize;
    const book = state.traffic.charonSalvageSupply;
    assert.equal(book.phase, 'awaiting_round');
    assert.equal(book.haulerReady, false); assert.equal(book.salvorReady, false);
    const actor = state.entities.get(readout.charonSupplyFacts(state).salvorId);
    const jobId = actor.data.jobId;
    assert.ok(jobId);
    const pod = state.entityList.find(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod');
    state.player.cargo.capVolume = 1; state.player.cargo.usedVolume = 0;
    assert.equal(runtime.getSystem('mining')._collectPayload(pod, player), true);
    assert.equal(book.phase, 'awaiting_round', 'pickup does not forge the deferred physical phase');
    assert.equal(readout.charonSupplyFacts(state).player, 1);
    assert.equal(readout.charonSupplyFacts(state).loose, 5);
    const before = JSON.stringify(book);
    state.player.targetId = actor.id;
    const offer = createContactHailOffer(state, contactHailAvailability(state), 'partial-before-boundary', state.simTime + 8);
    assert.match(livingWorkStatusText(actor, { state, depth: 'lock' }), /RESERVE SHORT/);
    assert.match(offer.lines[1], /RESERVE SHORT/);
    const status = createContactHailResponse(state, offer, 'status');
    assert.match(status.lines[1], /RESERVE SHORT/);
    const route = createContactHailResponse(state, offer, 'route');
    assert.match(route.lines[1], /5.*loose.*1.*recovered by you/);
    assert.match(route.lines[1], /next cutting round cannot start/);
    assert.doesNotMatch(route.lines.join(' '), /before recovering|Taking any cancels|Bring the original loose/);
    assert.equal(JSON.stringify(book), before, 'readout preserves physical phase and quantities');
    assert.equal(actor.data.jobId, jobId, 'existing round remains owned by its original job');
  } finally {
    owner._materializeAuthoredActivityCast = materialize;
    runtime.dispose(); restoreFeatureMaps(flags);
  }
});
