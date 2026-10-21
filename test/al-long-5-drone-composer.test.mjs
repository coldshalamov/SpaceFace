import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { automation } from '../src/systems/automation.js';
import { claims } from '../src/systems/claims.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { DRONES } from '../src/data/automation.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { addToShipment, shipmentQty, shipmentUsed } from '../src/systems/cargoCustody.js';
import { TEMPLATES, validateProgram, resolveBeacon, hasProgram, tickProgram } from '../src/systems/alphabet.js';
import { automationScreen, describeDroneEarnings } from '../src/ui/screens/automationPanel.js';

const SECTOR = 'sector_helios_prime', STATION = 'station_helios';
const METAL = 'cmdty_refined_metals', IRON = 'cmdty_ore_iron';
const clone = (v) => JSON.parse(JSON.stringify(v));
const loop = (steps, name = 'Foundry sale') => ({ kind: 'custom', version: 1, name, steps, reaction: 'none' });
const move = (target) => ({ op: 'move', target });
const collect = (qty = 2) => ({ op: 'interact', verb: 'collect', target: 'claim:claim_1', good: METAL, qty });
const wait = () => ({ op: 'wait', until: 'timer', seconds: 2 });
const foundry = () => loop([move('claim:claim_1'), collect(), move(`station:${STATION}`), { op: 'interact', verb: 'sell', target: `station:${STATION}`, good: METAL }]);
const oreSupply = () => loop([{ op: 'mine', target: 'field', until: 'cargoFull' }, move('claim:claim_1'),
  { op: 'interact', verb: 'unload', target: 'claim:claim_1', good: IRON, qty: DRONES[0].bufferCap }, move('field')], 'Ore supply');
const relaySupply = () => loop([move('claim:claim_1'), collect(), wait(), move('claim:claim_2'),
  { op: 'interact', verb: 'unload', target: 'claim:claim_2', good: METAL, qty: 2 }, wait()], 'Relay supply');

function boot({ relay = false, physical = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [economy, cargo, claims, flightV3, physics, automation],
    // Claims production is deliberately idle: these fixtures isolate drone handoffs from the
    // automatic relay chain already tested by AL-LONG-4. All mutations use the real owners.
    updateOrder: [flightV3, physics, automation] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.simTime = 100;
  state.world.currentSectorId = SECTOR;
  state.settings.gameplay.physicsBackend = physical ? 'rapier-dynamic' : 'custom';
  state.player.credits = 1_000_000;
  state.player.researchedNodes = ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'];
  state.player.stats = {};
  const econ = sim.registry.get('economy'); econ.newGame();
  const claimOwner = sim.registry.get('claims'); claimOwner.newGame();
  const auto = sim.registry.get('automation');
  state.playerId = sim.spawn({ type: 'ship', pos: { x: -300, z: -100 }, hull: 100, hullMax: 100, data: { isPlayer: true } }).id;
  const station = sim.spawn({ type: 'station', name: 'Helios Station', pos: { x: 340, z: 0 }, radius: 30, mass: 1000,
    collides: true, data: { stationId: STATION, dockRadius: 30 } });
  const rock = sim.spawn({ type: 'asteroid', pos: { x: -120, z: 0 }, radius: 12, mass: 500, hull: 20000, hullMax: 20000,
    data: { typeId: 'ast_rock', oreHP: 20000, oreHPMax: 20000 } });
  function commission(id, specId, x) {
    const poi = sim.spawn({ type: 'wreck', pos: { x, z: 0 }, radius: 20, collides: false, data: { poiId: id } });
    assert.equal(claimOwner.claim({ id, name: id === 'foundry' ? 'Foundry A' : 'Relay B', size: 'M', pos: poi.pos }), true);
    const b = state.claims.bodies.at(-1), def = BODY_SPECIALIZATION_BY_ID.get(specId);
    assert.equal(claimOwner.buildModule(b.id, def.requiresModule), true);
    assert.equal(claimOwner.specialize(b.id, specId), true);
    return b;
  }
  const refinery = commission('foundry', 'spec_refinery', 100);
  const relayBody = relay ? commission('relay', 'spec_relay', 340) : null;
  const def = DRONES[0];
  const g = { id: 'drone-composer', defId: def.id, count: 1, bufferCap: def.bufferCap, buffer: 0,
    fuel: def.fuelMax, fuelMax: def.fuelMax, status: 'program', sectorId: SECTOR,
    originPos: { x: -120, z: 0 }, entityIds: [], oreType: IRON };
  state.automation.drones.push(g);
  auto._spawnDroneEntities(g, def);
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload: clone(payload ?? null) }); emit(event, payload); };
  const h = { sim, state, bus, auto, econ, claimOwner, g, refinery, relay: relayBody, station, rock, events };
  h.close = () => { sim.registry.get('physics')._disableSg02DynamicAuthority?.(); sim.dispose(); };
  return h;
}

async function prepare(h) { assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true); }
function tick(h, n = 1) { for (let i = 0; i < n; i++) h.sim.step(SIM_DT); }
function until(h, predicate, limit = 14000) {
  for (let i = 0; i < limit; i++) { if (predicate()) return; tick(h); }
  assert.fail(`did not reach requested step: ${JSON.stringify(h.g.programState)} fuel=${h.g.fuel}`);
}
function lead(h) { return h.state.entities.get(h.g.entityIds[0]); }
function arrive(h, body = h.refinery) { lead(h).pos.set(body.x, 0, body.z); lead(h).vel.set(0, 0, 0); }
function stepAt(h, p, pc = 0) { assert.equal(h.auto.assignProgram(h.g.id, p), true); h.g.programState.pc = pc; }
function receiptEvents(h) { return h.events.filter((e) => e.event === 'claim:receipt' && e.payload.receipt.kind.startsWith('drone_')); }

// Small Node DOM fixture: real screen rendering/handlers, including native-to-sf-select
// enhancement and focus replacement. It supplies DOM behavior, never simulation behavior.
function installDOM() {
  const doc = { activeElement: null, createElement: (tag) => new Element(tag, doc), createDocumentFragment: () => new Element('#fragment', doc),
    addEventListener() {}, removeEventListener() {} };
  doc.body = doc.createElement('body'); doc.activeElement = doc.body; globalThis.document = doc;
  return doc;
}
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.dataset = {}; this.attrs = {};
    this.parentNode = null; this.value = ''; this.id = ''; this.type = ''; this.name = ''; this.disabled = false; this.hidden = false;
    this.isConnected = true; this.listeners = {}; this.className = ''; this._text = ''; this.selectionStart = 0; this.selectionEnd = 0;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set textContent(v) { this.children.forEach((c) => c.disconnect()); this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = v; this.textContent = ''; }
  get innerHTML() { return this._html || ''; }
  get options() { return this.children; }
  get attributes() { return Object.entries({ ...this.attrs, ...Object.fromEntries(Object.entries(this.dataset).map(([k, v]) => [`data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, v])) }).map(([name, value]) => ({ name, value })); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return this.attrs[k] || null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.tagName === '#FRAGMENT') { for (const n of [...c.children]) this.appendChild(n); c.children = []; return c; } c.parentNode = this; this.children.push(c); return c; }
  append(...nodes) { nodes.forEach((c) => this.appendChild(c)); }
  replaceChildren(...nodes) { this.children.forEach((c) => c.disconnect()); this.children = []; this._text = ''; this.append(...nodes); }
  replaceWith(node) { const parent = this.parentNode; const i = parent.children.indexOf(this); this.disconnect(); parent.children[i] = node; node.parentNode = parent; }
  replaceChild(node, previous) { previous.replaceWith(node); return previous; }
  insertAdjacentHTML() {}
  disconnect() { this.isConnected = false; this.children.forEach((c) => c.disconnect()); if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  contains(c) { for (; c; c = c.parentNode) if (c === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  addEventListener(type, f) { (this.listeners[type] ||= []).push(f); }
  dispatchEvent(e) { for (const f of this.listeners[e.type] || []) f(e); return true; }
  closest(selector) { for (let c = this; c; c = c.parentNode) if (c.matches(selector)) return c; return null; }
  matches(selector) {
    return selector.split(',').some((item) => {
      const s = item.trim(), tag = s.match(/^[a-z]+/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const attrs = [...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      return attrs.every(([, k, v]) => {
        const value = k.startsWith('data-') ? this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.attrs[k];
        return value != null && (v === undefined || value === v);
      });
    });
  }
  querySelectorAll(selector) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function screenFor(h) {
  const doc = installDOM(), body = doc.createElement('div'); doc.body.appendChild(body);
  const s = Object.create(automationScreen);
  Object.assign(s, { _ctx: { state: h.state, bus: h.bus }, _root: body, _tab: 'drones', _els: { body, tabs: [] }, _bodySig: '', _loopDraft: null });
  s._syncHeader = s._syncTabs = s._renderOperationsBoard = () => {};
  s._listenProgramRejections();
  return s;
}
function controls(s) { return s._els.body.querySelectorAll('[data-loop-field]'); }
function edit(s, field, value, index = -1) {
  const c = controls(s).find((c) => c.dataset.loopField === field && Number(c.dataset.step) === index);
  assert.ok(c, `${field} control for step ${index}`); c.value = String(value); s._onLoopInput(c);
}
function action(s, name, index = -1) {
  const b = s._els.body.querySelectorAll('button').find((b) => b.dataset.act === name && Number(b.dataset.ref) === index);
  assert.ok(b, `${name} control exists`); if (!b.disabled) s._onAction(b.dataset.act, b.dataset.ref);
}
function author(h, p) {
  const s = screenFor(h); s._onAction('writeLoop', h.g.id);
  edit(s, 'name', p.name);
  for (let i = 0; i < p.steps.length; i++) {
    if (i) action(s, 'loopAdd');
    const step = p.steps[i]; edit(s, 'op', step.op, i);
    if (step.op === 'interact') edit(s, 'verb', step.verb, i);
    for (const key of ['target', 'good', 'qty', 'seconds']) if (key in step && step.op !== 'mine') edit(s, key, step[key], i);
  }
  const authored = { ...p }; delete authored.reaction;
  assert.deepEqual(s._loopDraft.program, authored);
  const before = clone(h.g.program || null);
  assert.equal(h.events.filter((e) => e.event === 'ui:fleetOrder').length, 0, 'draft edits emit no simulation command');
  assert.deepEqual(h.g.program || null, before);
  action(s, 'loopApply');
  const intent = h.events.find((e) => e.event === 'ui:fleetOrder');
  assert.deepEqual(intent.payload, { shipId: h.g.id, order: 'assignProgram', kind: 'drone', targetRef: authored });
  assert.deepEqual(h.g.program, authored);
  assert.ok(p.steps.length <= 6);
  for (const tpl of Object.values(TEMPLATES)) assert.notDeepEqual(p.steps, tpl.steps);
  s.dispose(); return p;
}

for (const [name, program, options] of [['foundry', foundry, {}], ['ore', oreSupply, {}], ['relay', relaySupply, { relay: true }]]) {
  test(`composer authors ${name} loop through controls and production owners execute physical freight`, async () => {
    const h = boot({ ...options, physical: true });
    try {
      await prepare(h); h.refinery.spec.store.output[METAL] = 20;
      addCargo(h.state, 'cmdty_food', h.state.player.cargo.capVolume);
      const hold = clone(h.state.player.cargo), stock = h.state.economy.markets[STATION][METAL].stock;
      author(h, program());
      let last = { x: lead(h).pos.x, z: lead(h).pos.z }, maxStep = 0;
      for (let i = 0; i < 14000 && !h.g.programState.cycles; i++) {
        const before = h.events.length; tick(h);
        const e = lead(h); maxStep = Math.max(maxStep, Math.hypot(e.pos.x - last.x, e.pos.z - last.z)); last = { x: e.pos.x, z: e.pos.z };
        for (const event of h.events.slice(before)) {
          if (event.event === 'claim:receipt' && event.payload.receipt.kind.startsWith('drone_')) {
            const b = h.state.claims.bodies.find((b) => b.id === event.payload.bodyId);
            assert.ok(Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 62, 'claim movement happens after physical arrival');
          }
          if (event.event === 'economy:applyTradePressure') assert.ok(Math.hypot(e.pos.x - h.station.pos.x, e.pos.z - h.station.pos.z) < 62, 'sale happens at named station');
        }
      }
      assert.equal(h.g.programState.cycles, 1, JSON.stringify(h.g.programState));
      assert.ok(maxStep < 8, 'Flight V3/CPU Rapier moves the hull without pose writes or teleportation');
      assert.deepEqual(h.state.player.cargo, hold, 'a full unrelated player hold is untouched');
      if (name === 'foundry') {
        assert.equal(h.refinery.spec.store.output[METAL], 18);
        assert.equal(h.state.economy.markets[STATION][METAL].stock, stock + 2);
        assert.equal(Object.values(h.g.saleReceipts).reduce((sum, r) => sum + r.receipt.quantity, 0), 2);
        const grants = h.events.filter((e) => e.event === 'economy:grantCredits');
        assert.equal(grants.length, 1); assert.ok(grants[0].payload.amount > 0);
      } else if (name === 'ore') {
        assert.equal(h.refinery.spec.store.input[IRON], DRONES[0].bufferCap);
        assert.equal(shipmentUsed(h.g), 0); assert.ok(h.rock.data.oreHP < 20000);
      } else { assert.equal(h.relay.spec.store.input[METAL], 2); assert.equal(h.refinery.spec.store.output[METAL], 18); }
    } finally { h.close(); }
  });
}

for (const template of Object.keys(TEMPLATES)) test(`${template} cannot collect the commissioned claim output`, () => {
  const h = boot();
  try {
    h.refinery.spec.store.output[METAL] = 10;
    assert.equal(h.auto.assignProgram(h.g.id, template), true); tick(h, 180);
    assert.equal(h.refinery.spec.store.output[METAL], 10); assert.equal(shipmentQty(h.g, METAL), 0);
    assert.equal(receiptEvents(h).length, 0); assert.equal(Object.keys(h.g.saleReceipts || {}).length, 0);
  } finally { h.close(); }
});

const refusalCases = [
  ['empty', (p) => p.steps = [], 'step_count'], ['seven', (p) => p.steps = Array(7).fill(move('field')), 'step_count'],
  ['operation', (p) => p.steps[1].op = 'teleport', 'unknown_operation'], ['verb', (p) => p.steps[1].verb = 'buy', 'unknown_verb'],
  ['commodity', (p) => p.steps[1].good = 'cmdty_fake', 'unknown_commodity'], ['target', (p) => p.steps[1].target = 'claim:', 'invalid_target'],
  ['missing claim', (p) => p.steps[1].target = 'claim:missing', 'unavailable_target'],
  ['fraction', (p) => p.steps[1].qty = 1.5, 'invalid_quantity'], ['infinite', (p) => p.steps[1].qty = Infinity, 'invalid_quantity'],
  ['over cap', (p) => p.steps[1].qty = DRONES[0].bufferCap + 1, 'invalid_quantity'],
  ['zero wait', (p) => p.steps[1] = { ...wait(), seconds: 0 }, 'invalid_timer'], ['long wait', (p) => p.steps[1] = { ...wait(), seconds: 601 }, 'invalid_timer'],
  ['nonfinite wait', (p) => p.steps[1] = { ...wait(), seconds: NaN }, 'invalid_timer'],
  ['conditional', (p) => p.steps[1].if = 'cargo_full', 'unsupported_node'], ['extra reaction', (p) => p.reactions = [], 'unsupported_node'],
  ['guard', (p) => p.steps[1] = { op: 'guard', target: 'player' }, 'persistent_guard'],
  ['repair', (p) => p.steps[1].verb = 'repair', 'unknown_verb'], ['build', (p) => p.steps[1].verb = 'build', 'unknown_verb'],
  ['reaction object', (p) => p.reaction = { on: 'cargo_full' }, 'invalid_reaction'],
  ['zero quantity', (p) => p.steps[1].qty = 0, 'invalid_quantity'],
  ['infinite timer', (p) => p.steps[1] = { ...wait(), seconds: Infinity }, 'invalid_timer'],
];
for (const [name, mutate, reason] of refusalCases) test(`assignment rejects ${name} atomically with a step-specific reason`, () => {
  const h = boot();
  try {
    stepAt(h, foundry()); addToShipment(h.g, IRON, 3, h.g.bufferCap); h.g.programState.pc = 2;
    h.g._programMineCarry = 0.25; h.g.saleSeq = 4; h.g.pendingSale = { intentId: 'old', quantity: 2 };
    const snapshot = clone(h.g), p = foundry(); mutate(p);
    assert.equal(h.auto.assignProgram(h.g.id, p), false);
    assert.deepEqual(h.g, snapshot);
    const events = h.events.filter((e) => e.event === 'automation:programRejected');
    assert.equal(events.length, 1); assert.equal(events[0].payload.reason, reason); assert.match(events[0].payload.message, /Step \d+:/);
    if (reason === 'persistent_guard') assert.match(events[0].payload.message, /Guard stays active indefinitely; use Guard Player/);
  } finally { h.close(); }
});

test('world validation refuses foreign-sector/inactive/unowned claims and gates; explicit targets never fall back', () => {
  const h = boot();
  try {
    for (const [key, value] of [['sectorId', 'sector_elsewhere'], ['owned', false]]) {
      const previous = h.refinery[key]; h.refinery[key] = value;
      assert.equal(h.auto.assignProgram(h.g.id, foundry()), false); h.refinery[key] = previous;
    }
    h.refinery.spec.status = 'cold'; assert.equal(h.auto.assignProgram(h.g.id, foundry()), false); h.refinery.spec.status = 'active';
    h.station.data.isGate = true; assert.equal(h.auto.assignProgram(h.g.id, foundry()), false); h.station.data.isGate = false;
    const ctx = { state: h.state, group: h.g };
    assert.equal(resolveBeacon('station:missing', ctx), null); assert.equal(resolveBeacon('claim:missing', ctx), null);
    const b = resolveBeacon('claim:claim_1', ctx); assert.equal(b.x, h.refinery.x); assert.equal(b.z, h.refinery.z); assert.equal(b.entity.data.poiId, 'foundry');
    const raw = foundry(), result = validateProgram(raw, ctx); assert.equal(result.ok, true); raw.steps[1].qty = 55;
    assert.equal(result.program.steps[1].qty, 2, 'validated data has no caller-owned mutable array');
  } finally { h.close(); }
});

test('freight refusals conserve source, shipment, destination, hold, payment and receipts', () => {
  const h = boot({ relay: true });
  try {
    h.refinery.spec.store.output[METAL] = 8;
    const transfer = (args = {}) => h.claimOwner.transferDroneFreight({ groupId: h.g.id, bodyId: h.refinery.id, direction: 'collect', good: METAL, qty: 2, ...args });
    const refuse = (args, message) => {
      const before = clone({ claims: h.state.claims, g: h.g, hold: h.state.player.cargo, credits: h.state.player.credits });
      const n = receiptEvents(h).length, r = transfer(args); assert.equal(r.ok, false); assert.equal(r.moved, 0); assert.match(r.reason, message);
      assert.deepEqual({ claims: h.state.claims, g: h.g, hold: h.state.player.cargo, credits: h.state.player.credits }, before);
      assert.equal(receiptEvents(h).length, n);
    };
    refuse({}, /not arrived/); arrive(h);
    h.refinery.spec.store.output = {}; refuse({}, /empty/);
    h.refinery.spec.store.output[METAL] = 8; addToShipment(h.g, IRON, h.g.bufferCap, h.g.bufferCap); refuse({}, /full/);
    h.g.shipment.items = { [METAL]: 3 }; refuse({ direction: 'unload' }, /feedstock/);
    h.refinery.spec.status = 'cold'; refuse({}, /inactive/); h.refinery.spec.status = 'active';
    h.relay.spec.store.input[IRON] = BODY_SPECIALIZATION_BY_ID.get('spec_relay').storeCapU;
    arrive(h, h.relay); refuse({ direction: 'unload', bodyId: h.relay.id }, /full/);
    h.relay.spec.store.input = {};
    assert.equal(transfer({ direction: 'unload', bodyId: h.relay.id }).moved, 2);
    assert.equal(h.relay.spec.store.input[METAL], 2); assert.equal(shipmentQty(h.g, METAL), 1);
    assert.equal(receiptEvents(h).at(-1).payload.receipt.kind, 'drone_delivered');
    arrive(h); h.refinery.spec.outputFull = true;
    assert.equal(transfer().moved, 2); assert.equal(h.refinery.spec.outputFull, false);
    assert.deepEqual(receiptEvents(h).at(-1).payload.receipt.data, { groupId: h.g.id, goodId: METAL, qty: 2 });
  } finally { h.close(); }
});

test('runtime blocks retry once availability returns and toast only on reason changes', () => {
  const h = boot();
  try {
    stepAt(h, loop([collect()])); arrive(h); tick(h, 5);
    assert.equal(h.g.programState.pc, 0); assert.match(h.g.programState.blockedReason, /empty/);
    assert.equal(h.events.filter((e) => e.event === 'toast' && /Step 1/.test(e.payload.text)).length, 1);
    h.refinery.spec.store.output[METAL] = 2; tick(h);
    assert.equal(h.g.programState.cycles, 1); assert.equal(shipmentQty(h.g, METAL), 2);
    stepAt(h, foundry(), 3); lead(h).pos.copy(h.station.pos);
    h.station.data.stationId = 'station_temporarily_unavailable'; const credits = h.state.player.credits, stock = h.state.economy.markets[STATION][METAL].stock;
    tick(h, 3); assert.equal(h.g.programState.pc, 3); assert.equal(h.state.player.credits, credits); assert.equal(shipmentQty(h.g, METAL), 2);
    assert.equal(h.state.economy.markets[STATION][METAL].stock, stock);
    h.station.data.stationId = STATION; tick(h); assert.equal(h.g.programState.pc, 0, JSON.stringify({ ps: h.g.programState, pos: lead(h).pos, station: h.station.pos })); assert.equal(shipmentQty(h.g, METAL), 0);
    stepAt(h, loop([collect()])); arrive(h); h.refinery.spec.status = 'cold'; tick(h, 3);
    assert.equal(h.g.programState.pc, 0); assert.match(h.g.programState.blockedReason, /unavailable/);
    h.refinery.spec.status = 'active'; h.refinery.spec.store.output[METAL] = 2; tick(h); assert.equal(h.g.programState.cycles, 1);
  } finally { h.close(); }
});

test('full shipment and relay park their current handoff and resume only the accepted remainder', () => {
  const h = boot({ relay: true });
  try {
    stepAt(h, loop([collect(5), wait()])); arrive(h); h.refinery.spec.store.output[METAL] = 9;
    addToShipment(h.g, IRON, h.g.bufferCap - 2, h.g.bufferCap); tick(h, 2);
    assert.equal(h.g.programState.stepMoved, 2); assert.equal(h.g.programState.pc, 0); assert.match(h.g.programState.blockedReason, /full/);
    assert.equal(h.refinery.spec.store.output[METAL], 7);
    // Another physical handoff makes room; the waiting collection owes three, never five.
    assert.equal(h.claimOwner.transferDroneFreight({ groupId: h.g.id, bodyId: h.refinery.id, direction: 'unload', good: IRON, qty: 3 }).moved, 3);
    tick(h); assert.equal(h.g.programState.pc, 1); assert.equal(shipmentQty(h.g, METAL), 5);
    const unload = loop([{ op: 'interact', verb: 'unload', target: 'claim:claim_2', good: METAL, qty: 5 }, wait()]);
    stepAt(h, unload); arrive(h, h.relay);
    const cap = BODY_SPECIALIZATION_BY_ID.get('spec_relay').storeCapU;
    h.relay.spec.store.input[IRON] = cap - 2; tick(h, 2);
    assert.equal(h.g.programState.stepMoved, 2); assert.equal(h.g.programState.pc, 0); assert.match(h.g.programState.blockedReason, /full/);
    h.relay.spec.store.input[IRON] -= 3; tick(h);
    assert.equal(h.g.programState.pc, 1); assert.equal(shipmentQty(h.g, METAL), 0); assert.equal(h.relay.spec.store.input[METAL], 5);
  } finally { h.close(); }
});

test('INTERACT without MOVE physically approaches the claim and the POI arrival envelope matches custody', async () => {
  const h = boot({ physical: true });
  try {
    await prepare(h); h.refinery.spec.store.output[METAL] = 2;
    stepAt(h, loop([collect(), wait()])); const start = lead(h).pos.x;
    tick(h); assert.equal(shipmentQty(h.g, METAL), 0);
    until(h, () => h.g.programState.pc === 1);
    assert.ok(lead(h).pos.x > start + 100); assert.equal(shipmentQty(h.g, METAL), 2);
    const poi = h.state.entities.get(resolveBeacon('claim:claim_1', { state: h.state, group: h.g }).entity.id);
    poi.radius = 150;
    // No Rapier-owned pose write: a freshly spawned hull uses the larger POI's same handoff envelope.
    h.auto._releaseDroneEntities(h.g);
    const e = h.sim.spawn({ type: 'drone', pos: { x: h.refinery.x - 170, z: h.refinery.z }, hull: 40, hullMax: 40,
      data: { groupId: h.g.id, kind: 'mining_drone' } }); h.g.entityIds = [e.id];
    h.refinery.spec.store.output[METAL] = 1;
    assert.equal(h.auto._steerGroupTo(h.g, DRONES[0], resolveBeacon('claim:claim_1', { state: h.state, group: h.g }), SIM_DT, SECTOR), true);
    assert.equal(h.claimOwner.transferDroneFreight({ groupId: h.g.id, bodyId: h.refinery.id, direction: 'collect', good: METAL, qty: 1 }).moved, 1);
  } finally { h.close(); }
});

test('saved custom schema refuses extra conditional nodes and keeps pending sale, mining carry and sealed receipts', () => {
  const h = boot(); let restored;
  try {
    stepAt(h, foundry()); addToShipment(h.g, METAL, 3, h.g.bufferCap);
    h.g.pendingSale = { intentId: 'pending', stationId: STATION, good: METAL, quantity: 3 };
    h.g._programMineCarry = 0.75; h.g.saleSeq = 8; h.g.saleReceipts.sealed = { receipt: { quantity: 2 } };
    const saved = snapshot(h); restored = restore(saved);
    assert.deepEqual(restored.g.pendingSale, h.g.pendingSale); assert.equal(restored.g._programMineCarry, 0.75);
    assert.equal(restored.g.saleSeq, 8); assert.deepEqual(restored.g.saleReceipts, h.g.saleReceipts);
    saved.automation.drones[0].program.branch = { if: 'cargo_full' };
    restored.auto.deserialize(clone(saved.automation)); restored.g = restored.state.automation.drones[0];
    assert.match(restored.g.programState.blockedReason, /Conditional/); assert.equal(shipmentQty(restored.g, METAL), 3);
    assert.equal(hasProgram(restored.g), true);
    // The blocked stub keeps the protocol slot: an assigned token survives, absent stays absent.
    assert.equal('reaction' in restored.g.program, false);
    saved.automation.drones[0].program.reaction = { id: 'flee_to_station_on_threat', on: 'threat_near', step: { op: 'dock', target: 'nearest_station' } };
    restored.auto.deserialize(clone(saved.automation)); restored.g = restored.state.automation.drones[0];
    assert.equal(restored.g.program.reaction.id, 'flee_to_station_on_threat', 'a token survives the blocked stub');
    delete saved.automation.drones[0].program.reaction;
    restored.auto.deserialize(clone(saved.automation)); restored.g = restored.state.automation.drones[0];
    assert.equal('reaction' in restored.g.program, false, 'an absent slot stays absent through the blocked stub');
    const savedAgain = restored.auto.serialize(); restored.auto.deserialize(clone(savedAgain)); restored.g = restored.state.automation.drones[0];
    assert.match(restored.g.programState.blockedReason, /Conditional/, 'the saved refusal remains readable on subsequent loads');
  } finally { h.close(); restored?.close(); }
});

function snapshot(h) {
  return clone({ automation: h.auto.serialize(), claims: h.claimOwner.serialize(), economy: h.econ.serialize(),
    player: h.state.player, simTime: h.state.simTime, rockHP: h.rock.data.oreHP });
}
function restore(saved, options) {
  const h = boot(options);
  h.state.player = clone(saved.player); h.state.simTime = saved.simTime;
  h.econ.deserialize(clone(saved.economy)); h.claimOwner.deserialize(clone(saved.claims));
  h.auto.deserialize(clone(saved.automation)); h.g = h.state.automation.drones[0];
  h.refinery = h.state.claims.bodies[0]; h.relay = h.state.claims.bodies[1];
  h.rock.data.oreHP = saved.rockHP;
  h.auto._spawnDroneEntities(h.g, DRONES[0]);
  return h;
}
function logical(h) {
  return clone({ state: h.g.programState, target: h.g.program.steps[h.g.programState.pc]?.target,
    items: h.g.shipment?.items || {}, saleReceipts: h.g.saleReceipts || {}, stock: h.state.economy.markets[STATION][METAL].stock,
    fuel: h.g.fuel, credits: h.state.player.credits,
    transfers: receiptEvents(h), stores: h.state.claims.bodies.map((b) => b.spec.store) });
}

test('partial collection resumes its remaining two units after production save/load, never five again', () => {
  const h = boot(); let restored;
  try {
    stepAt(h, loop([collect(5), wait()])); arrive(h); h.refinery.spec.store.output[METAL] = 3; tick(h);
    assert.equal(h.g.programState.stepMoved, 3); assert.equal(shipmentQty(h.g, METAL), 3);
    const saved = snapshot(h); restored = restore(saved);
    assert.equal(restored.g.programState.stepMoved, 3); restored.refinery.spec.store.output[METAL] = 2;
    tick(restored); assert.equal(restored.g.programState.pc, 1, JSON.stringify({ ps: restored.g.programState, pos: lead(restored).pos, motion: saved.automation.drones[0].programMotion })); assert.equal(restored.g.programState.stepMoved, 0);
    assert.equal(shipmentQty(restored.g, METAL), 5); assert.equal(restored.refinery.spec.store.output[METAL] || 0, 0);
    assert.equal(receiptEvents(restored).at(-1).payload.receipt.data.qty, 2);
  } finally { h.close(); restored?.close(); }
});

for (const checkpoint of ['MOVE', 'WAIT', 'partial']) test(`seed 4242 ${checkpoint} checkpoint resumes deterministically for three cycles`, async () => {
  const options = { relay: checkpoint === 'WAIT', physical: true }, h = boot(options); let a, b;
  try {
    await prepare(h);
    const p = checkpoint === 'WAIT' ? relaySupply() : foundry();
    if (checkpoint === 'partial') p.steps[1].qty = 5;
    stepAt(h, p); h.refinery.spec.store.output[METAL] = checkpoint === 'partial' ? 3 : 60;
    if (checkpoint === 'MOVE') { tick(h, 20); assert.equal(h.g.programState.pc, 0); assert.ok(Math.hypot(lead(h).vel.x, lead(h).vel.z) > 0); }
    else if (checkpoint === 'WAIT') { until(h, () => h.g.programState.pc === 2 && h.g.programState.waitT > 0.5); }
    else { until(h, () => h.g.programState.stepMoved === 3); }
    const saved = snapshot(h), savedPose = saved.automation.drones[0].programMotion[0];
    assert.ok(savedPose);
    assert.deepEqual(Object.keys(savedPose).filter((k) => !['intent', 'propulsionRuntime', 'propulsionResources'].includes(k)).sort(),
      ['angVel', 'hull', 'hullMax', 'pos', 'rot', 'vel']);
    assert.ok(savedPose.propulsionRuntime && savedPose.intent, 'a flown drone saves the drivetrain spool and live intent for warm reload');
    // serialize returns independent custom instructions/state, including cargo and partial work.
    h.g.program.name = 'changed after snapshot'; assert.notEqual(saved.automation.drones[0].program.name, h.g.program.name); h.g.program.name = p.name;
    a = restore(saved, options); b = restore(saved, options);
    assert.deepEqual({ x: lead(a).pos.x, z: lead(a).pos.z }, savedPose.pos);
    assert.deepEqual({ x: lead(a).vel.x, z: lead(a).vel.z }, savedPose.vel);
    assert.notEqual(lead(a).pos.x, h.g.originPos.x, 'restored work pose is not field fan-out');
    const entityCount = a.g.entityIds.length; a.auto._spawnDroneEntities(a.g, DRONES[0]); assert.equal(a.g.entityIds.length, entityCount);
    await prepare(a); await prepare(b);
    if (checkpoint === 'partial') for (const f of [h, a, b]) f.refinery.spec.store.output[METAL] = 60;
    const cycles = saved.automation.drones[0].programState.cycles + 3;
    let completed = 0;
    for (let i = 0; i < 14000 && a.g.programState.cycles < cycles; i++) {
      tick(h); tick(a); tick(b); assert.deepEqual(logical(a), logical(b), `restored tick ${i}`);
      // Reload must not change the trajectory: the restored hull tracks the uninterrupted one
      // tick-for-tick (cold propulsion spool lagged the MOVE ~20 ticks before the fix).
      if (i < 600 && lead(h) && lead(a)) {
        const drift = Math.hypot(lead(h).pos.x - lead(a).pos.x, lead(h).pos.z - lead(a).pos.z);
        assert.ok(drift < 0.5, `restored tick ${i} drifts ${drift.toFixed(3)}m from uninterrupted`);
        assert.equal(a.g.programState.pc, h.g.programState.pc, `restored tick ${i} program counter`);
      }
      completed = a.g.programState.cycles;
    }
    assert.equal(completed, cycles, JSON.stringify(a.g.programState));
    until(h, () => h.g.programState.cycles >= cycles);
    assert.deepEqual(h.g.shipment.items, a.g.shipment.items);
    assert.deepEqual(h.state.claims.bodies.map((b) => b.spec.store), a.state.claims.bodies.map((b) => b.spec.store));
    const receiptTotals = (f) => Object.values(f.g.saleReceipts || {}).map((r) => [r.receipt.good, r.receipt.quantity, r.receipt.credited]);
    assert.deepEqual(receiptTotals(h), receiptTotals(a), 'uninterrupted and restored execution settle identical freight exactly once');
    assert.equal(h.g.programState.pc, a.g.programState.pc);
  } finally { h.close(); a?.close(); b?.close(); }
});

test('legacy saves, malformed custom saves, repeated assignment/clear and offline classification remain safe', () => {
  const h = boot();
  try {
    stepAt(h, foundry()); addToShipment(h.g, METAL, 3, h.g.bufferCap); h.g._programMineCarry = 0.4;
    h.g.saleSeq = 5; h.g.saleReceipts.sealed = { receipt: { quantity: 1 } }; h.g.pendingSale = { intentId: 'uncommitted' };
    assert.equal(h.auto.assignProgram(h.g.id, relaySupply()), false, 'missing relay refuses rather than cancelling pending sale');
    assert.equal(h.g.pendingSale.intentId, 'uncommitted');
    assert.equal(h.auto.assignProgram(h.g.id, foundry()), true); assert.equal(h.g.pendingSale, null);
    assert.equal(h.g._programMineCarry, 0.4); assert.equal(h.g.saleSeq, 5); assert.ok(h.g.saleReceipts.sealed);
    assert.equal(h.auto.assignProgram(h.g.id, null), true); assert.equal(h.g.program, null); assert.equal(shipmentQty(h.g, METAL), 3);
    assert.equal(h.auto.assignProgram(h.g.id, 'scout_report'), true);
    const legacy = clone(h.auto.serialize()); delete legacy.drones[0].programState.cycles; delete legacy.drones[0].programState.stepMoved;
    h.auto.deserialize(legacy); h.g = h.state.automation.drones[0]; assert.equal(h.g.program.templateId, 'scout_report');
    assert.equal(h.g.programState.cycles, 0); assert.equal(h.g.programState.stepMoved, 0);
    const bad = clone(h.auto.serialize()); bad.drones[0].program = loop([{ op: 'buy', target: 'depot' }]);
    h.auto.deserialize(bad); h.g = h.state.automation.drones[0]; assert.ok(hasProgram(h.g)); assert.match(h.g.programState.blockedReason, /Step 1/);
    const before = clone(h.g.shipment); tick(h, 10); assert.deepEqual(h.g.shipment, before); assert.equal(h.g.buffer, 0);
    assert.equal(h.auto.assignProgram(h.g.id, foundry()), true);
    h.auto._releaseDroneEntities(h.g); h.g.sectorId = 'sector_elsewhere';
    const freight = clone(h.g.shipment), ps = clone(h.g.programState), fuel = h.g.fuel;
    tick(h, 65); h.auto._settleOffscreenNetwork(60, h.state.automation, SECTOR);
    const offline = h.auto.runOfflineCatchup({ offlineElapsedSec: 120 });
    assert.equal(offline.elapsedSec, 120, 'real catch-up window exercises offline classification');
    assert.deepEqual(h.g.shipment, freight); assert.deepEqual(h.g.programState, ps); assert.equal(h.g.fuel, fuel);
    assert.equal(h.g.buffer, 0);
    const s = screenFor(h); assert.match(s._customProgramStatus(h.g), /Paused outside active sector/); s.dispose();
  } finally { h.close(); }
});

test('custom loop retains FLT-01 interruption, WAIT progress, transfer progress, resume and exit', () => {
  const h = boot();
  try {
    stepAt(h, loop([wait(), collect(5)])); h.state.world.alienEcology = { machineProtocol: 'observed' };
    h.g.programState.pc = 1; h.g.programState.stepMoved = 3;
    assert.equal(h.auto.assignReaction(h.g.id, 'flee_to_station_on_threat'), true);
    let threat = true;
    const ctx = { state: h.state, group: h.g, bus: h.bus, isThreatNear: () => threat, steerTo: () => true, park() {},
      transferFreight: () => ({ ok: true, moved: 2 }), operationFull: () => false };
    tickProgram(h.g, ctx, SIM_DT); assert.ok(h.g.programState.interrupt); assert.equal(h.g.programState.stepMoved, 3);
    threat = false; tickProgram(h.g, ctx, SIM_DT); assert.equal(h.g.programState.interrupt, null); assert.equal(h.g.programState.cycles, 1);
    h.g.programState.waitT = 0.7; threat = true; tickProgram(h.g, ctx, SIM_DT); assert.equal(h.g.programState.waitT, 0.7);
    const saved = snapshot(h), restored = restore(saved);
    try { assert.deepEqual(restored.g.programState, h.g.programState); assert.deepEqual(restored.g.program.reaction, h.g.program.reaction); } finally { restored.close(); }
    threat = false; tickProgram(h.g, ctx, SIM_DT); assert.ok(h.g.programState.waitT > 0.7);
    assert.equal(h.auto.assignReaction(h.g.id, 'evacuate_on_threat'), true); threat = true;
    tickProgram(h.g, ctx, SIM_DT); assert.equal(h.g.program, null);
  } finally { h.close(); }
});

test('a saved custom program without a reaction slot keeps the slot absent, not disabled', () => {
  const h = boot();
  try {
    stepAt(h, loop([collect(2), wait()]));
    const saved = clone(h.auto.serialize()); delete saved.drones[0].program.reaction;
    h.auto.deserialize(saved); h.g = h.state.automation.drones[0];
    assert.equal('reaction' in h.g.program, false, 'absent reaction survives normalization as absent');
    // Absent means the FLT-01 default flee applies once the machine protocol is unlocked;
    // normalizing it to 'none' would silently disarm the drone (R403 review finding).
    h.state.world.alienEcology = { machineProtocol: 'observed' };
    const ctx = { state: h.state, group: h.g, bus: h.bus, isThreatNear: () => true, steerTo: () => true, park() {},
      transferFreight: () => ({ ok: true, moved: 0 }), operationFull: () => false };
    tickProgram(h.g, ctx, SIM_DT); assert.ok(h.g.programState.interrupt, 'absent reaction still applies the default flee');
    h.g.program.reaction = 'none'; h.g.programState.interrupt = null; h.g.programState.reactionLatched = false;
    tickProgram(h.g, ctx, SIM_DT); assert.equal(h.g.programState.interrupt, null, 'explicit none disables the default');
  } finally { h.close(); }
});

test('a loop re-edit preserves the assigned reaction and keeps an absent slot absent', () => {
  const h = boot(), s = screenFor(h);
  try {
    stepAt(h, loop([collect(2), wait()]));
    h.state.world.alienEcology = { machineProtocol: 'observed' };
    assert.equal(h.auto.assignReaction(h.g.id, 'flee_to_station_on_threat'), true);
    const token = h.g.program.reaction;
    // The composer draft never carries the protocol slot — an assigned token would
    // fail authored validation, and forcing 'none' would silently disarm it.
    s._onAction('writeLoop', h.g.id);
    assert.equal('reaction' in s._loopDraft.program, false, 'the draft does not carry the reaction slot');
    s._loopDraft.program.steps = [wait()];
    s._onAction('loopApply');
    assert.equal(s._loopDraft, null, 'the Apply validates cleanly');
    assert.equal(h.g.program.reaction, token, 'the assigned reaction survives the re-edit');
    // An absent slot stays absent through a re-edit — default flee is not disarmed.
    delete h.g.program.reaction;
    s._onAction('writeLoop', h.g.id);
    s._onAction('loopApply');
    assert.equal('reaction' in h.g.program, false, 'absent slot stays absent through a re-edit');
  } finally { h.close(); }
});

test('composer add/remove/reorder/limit, Cancel, inline refusals, telemetry focus and status', () => {
  const h = boot(), s = screenFor(h);
  try {
    s._onAction('writeLoop', h.g.id); edit(s, 'op', 'wait', 0); edit(s, 'seconds', 5, 0);
    action(s, 'loopAdd'); edit(s, 'target', 'player', 1); action(s, 'loopUp', 1);
    assert.deepEqual(s._loopDraft.program.steps[0], move('player'));
    action(s, 'loopDown', 0); assert.equal(s._loopDraft.program.steps[0].op, 'wait');
    action(s, 'loopRemove', 1); for (let i = 0; i < 6; i++) action(s, 'loopAdd');
    assert.equal(s._loopDraft.program.steps.length, 6); assert.equal(s._els.body.querySelectorAll('button').find((b) => b.dataset.act === 'loopAdd').disabled, true);
    s._onAction('loopAdd', '-1'); assert.equal(s._loopDraft.program.steps.length, 6);
    const name = controls(s).find((c) => c.dataset.loopField === 'name'); name.value = 'Keyboard edit'; s._onLoopInput(name);
    name.focus(); name.setSelectionRange(3, 7);
    h.g.fuel -= 2; s.refresh(s._ctx);
    assert.equal(document.activeElement.dataset.focusKey, name.dataset.focusKey); assert.equal(document.activeElement.value, 'Keyboard edit');
    assert.equal(document.activeElement.selectionStart, 3); assert.equal(document.activeElement.selectionEnd, 7);
    assert.equal(s._loopDraft.program.steps[0].seconds, 5);
    const selected = controls(s).find((c) => c.dataset.loopField === 'op' && c.dataset.step === '0');
    selected.sfSelectField.focus(); h.g.fuel -= 2; s.refresh(s._ctx);
    const replacement = controls(s).find((c) => c.dataset.loopField === 'op' && c.dataset.step === '0');
    assert.equal(document.activeElement, replacement.sfSelectField, 'enhanced dropdown keeps keyboard focus during telemetry refresh');
    assert.equal(replacement.value, 'wait');
    const timer = controls(s).find((c) => c.dataset.loopField === 'seconds' && c.dataset.step === '0');
    timer.value = ''; s._onLoopInput(timer); timer.focus(); h.g.fuel -= 2; s.refresh(s._ctx);
    assert.equal(document.activeElement.value, '', 'an incomplete numeric edit survives telemetry');
    action(s, 'loopCancel'); assert.equal(s._loopDraft, null); assert.equal(h.events.filter((e) => e.event === 'ui:fleetOrder').length, 0);
    s._onAction('writeLoop', h.g.id); edit(s, 'name', ''); action(s, 'loopApply');
    assert.match(s._els.body.querySelector('[role="alert"]').textContent, /Step 1/);
    edit(s, 'name', 'Valid name'); h.bus.emit('automation:programRejected', { id: h.g.id, message: 'Step 1: Claim became inactive' });
    assert.match(s._els.body.querySelector('[role="alert"]').textContent, /Claim became inactive/);
    action(s, 'loopCancel'); stepAt(h, foundry()); h.g.programState.cycles = 4; h.g.programState.blockedReason = 'Waiting for stock';
    addToShipment(h.g, METAL, 2, h.g.bufferCap);
    assert.match(s._customProgramStatus(h.g), /Step 1\/4.*4 completed cycles.*2 Refined Metals.*Waiting for stock/i);
    assert.match(describeDroneEarnings(h.state, h.g).text, /Shipment sales/);
    const sig = s._bodySignature(); h.g.programState.stepMoved = 1; assert.notEqual(s._bodySignature(), sig);
    s.dispose(); h.bus.emit('automation:programRejected', { id: h.g.id, message: 'late rejection' }); assert.equal(s._loopDraft, null);
  } finally { h.close(); }
});

test('custom-program refuel resumes the program status while preserving instruction and shipment progress', () => {
  const h = boot();
  try {
    stepAt(h, foundry(), 1); h.g.programState.stepMoved = 1;
    addToShipment(h.g, METAL, 1, h.g.bufferCap); h.g.status = 'stranded'; h.g.fuel = 0;
    const ps = clone(h.g.programState), freight = clone(h.g.shipment);
    assert.equal(h.auto.refuelDrone(h.g.id), true); assert.equal(h.g.status, 'program');
    assert.equal(h.g.fuel, DRONES[0].fuelMax); assert.deepEqual(h.g.programState, ps); assert.deepEqual(h.g.shipment, freight);
  } finally { h.close(); }
});
