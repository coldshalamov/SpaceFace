import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { WEAK_POINTS_BY_CLASS } from '../src/data/weakPoints.js';
import { combat } from '../src/systems/combat.js';
import { createFloatingText, weakPointFloatingTextSpec } from '../src/ui/floatingText.js';

const HIT = { targetId: 2, ownerId: 1, damage: 10, damageType: 'kinetic', pos: { x: -10, z: 0 } };

function fixture(t, { enabled = true, shipClass = 'freighter' } = {}) {
  const previousFlag = COMBAT_FLAGS.weakPoints;
  COMBAT_FLAGS.weakPoints = enabled;
  t.after(() => { COMBAT_FLAGS.weakPoints = previousFlag; });
  const player = makeEntity({ type: 'ship', team: 0, pos: { x: -30, z: 0 }, hull: 1000, hullMax: 1000 });
  player.id = 1;
  const target = makeEntity({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, rot: 0,
    hull: 1000, hullMax: 1000, shield: 0, armorHp: 0, data: { shipClass } });
  target.id = 2;
  const state = { playerId: 1, entities: new Map([[1, player], [2, target]]),
    entityList: [player, target], tick: 0, simTime: 0,
    rng() { throw new Error('weak-point hits must not draw simulation RNG'); },
    settings: { showDamageNumbers: true, gameplay: { difficulty: 'veteran' }, video: { motionReduce: false } } };
  const bus = createBus();
  const receipts = [];
  const damage = [];
  bus.on('combat:weakPointHit', p => receipts.push(p));
  bus.on('combat:damage', p => damage.push(p));
  const system = Object.create(combat);
  system.init({ state, bus, helpers: {} });
  t.after(() => system.kernel.dispose());
  return { state, bus, system, target, receipts, damage };
}

function mountText(t, ctx) {
  const previousDocument = globalThis.document;
  const elements = [];
  const doc = {
    createElement() {
      const el = { id: '', style: {}, className: '', textContent: '', children: [],
        appendChild(child) { this.children.push(child); return child; } };
      elements.push(el);
      return el;
    },
    getElementById(id) { return elements.find(el => el.id === id) || null; },
  };
  doc.head = doc.createElement();
  doc.body = doc.createElement();
  globalThis.document = doc;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  // Cosmetic spawn drift is fixed in this fixture; simulation RNG above must never be used.
  t.mock.method(Math, 'random', () => 0.5);
  let projections = 0;
  const text = createFloatingText({ ...ctx, helpers: { worldToScreen(pos) {
    projections++;
    return { x: 100 + pos.x, y: 100 + pos.z, onScreen: true };
  } } });
  const pool = doc.getElementById('sf-floattext').children;
  return { text, pool, doc, visible: () => pool.filter(el => el.style.display === 'block'),
    allocations: () => elements.length, projections: () => projections };
}

test('every existing weak-point class emits deterministic critical metadata with its unchanged bonus', t => {
  const f = fixture(t);
  for (const [shipClass, wp] of Object.entries(WEAK_POINTS_BY_CLASS)) {
    f.target.data.shipClass = shipClass;
    const before = structuredClone(f.target);
    const first = f.system._weakPointMult(HIT.targetId, HIT.ownerId, HIT.pos);
    const second = f.system._weakPointMult(HIT.targetId, HIT.ownerId, HIT.pos);
    assert.equal(first, wp.bonusMult);
    assert.equal(second, wp.bonusMult);
    const receipt = f.receipts.at(-1);
    assert.deepEqual(receipt, { targetId: 2, ownerId: 1, label: wp.label, mult: wp.bonusMult,
      critical: true, criticalLabel: 'CRIT', pos: { x: -10, z: 0 } });
    assert.deepEqual(receipt, f.receipts.at(-2));
    assert.notEqual(receipt.pos, HIT.pos, 'receipt snapshots the hit position');
    assert.deepEqual(structuredClone(f.target), before, 'receipt creation must not mutate the target');
  }
  assert.equal(f.receipts.length, Object.keys(WEAK_POINTS_BY_CLASS).length * 2);
});

test('projectile hit produces one critical callout and one correctly multiplied damage number', t => {
  const f = fixture(t);
  const dom = mountText(t, f);
  f.bus.emit('projectile:hit', HIT);
  assert.equal(f.receipts.length, 1);
  assert.equal(f.damage.length, 1);
  assert.equal(f.damage[0].applied, 16);
  assert.equal(f.target.hull, 984);
  assert.deepEqual(dom.visible().map(el => [el.textContent, el.className]), [
    ['◈ CRIT · DRIVE COIL', 'sf-ft sf-ft--weak sf-ft--critical'],
    ['16', 'sf-ft sf-ft--hull'],
  ]);
  // An ordinary hit in the same burst still aggregates solely into the numeric receipt.
  f.bus.emit('projectile:hit', { ...HIT, pos: { x: 10, z: 0 } });
  assert.equal(f.receipts.length, 1);
  assert.equal(f.target.hull, 974);
  assert.deepEqual(dom.visible().map(el => el.textContent), ['◈ CRIT · DRIVE COIL', '26']);
  assert.equal(dom.visible()[1].className, 'sf-ft sf-ft--hull sf-ft--big');
});

for (const [name, options, hit] of [
  ['outside the weak arc', {}, { ...HIT, pos: { x: 10, z: 0 } }],
  ['a hull without a weak point', { shipClass: 'fighter' }, HIT],
  ['a non-player attacker', {}, { ...HIT, ownerId: 3 }],
  ['the feature flag off', { enabled: false }, HIT],
  ['no hit position', {}, { ...HIT, pos: null }],
]) {
  test(`${name} keeps ordinary damage and floating text unchanged`, t => {
    const f = fixture(t, options);
    const dom = mountText(t, f);
    const result = f.system.onHit(hit);
    assert.equal(result.ok, true);
    assert.deepEqual(f.receipts, []);
    assert.equal(f.damage.length, 1);
    assert.equal(f.damage[0].applied, 10);
    assert.equal(f.target.hull, 990);
    assert.deepEqual(dom.visible().map(el => [el.textContent, el.className]), [['10', 'sf-ft sf-ft--hull']]);
  });
}

test('legacy and malformed weak-point payloads retain their existing text and class behavior', () => {
  assert.equal(weakPointFloatingTextSpec(null), null);
  assert.equal(weakPointFloatingTextSpec({ critical: true }), null);
  for (const critical of [undefined, false, 1, 'true']) {
    assert.deepEqual(weakPointFloatingTextSpec({ ...HIT, label: 'DRIVE COIL', critical }),
      { text: '◈ DRIVE COIL', cls: 'sf-ft--weak' });
  }
  assert.deepEqual(weakPointFloatingTextSpec(HIT), { text: '◈ WEAK POINT', cls: 'sf-ft--weak' });
  assert.deepEqual(weakPointFloatingTextSpec({ ...HIT, critical: true }),
    { text: '◈ CRIT · WEAK POINT', cls: 'sf-ft--weak sf-ft--critical' });
});

test('critical text uses the pool and existing reduced-motion lifetime without new frame work', t => {
  const f = fixture(t);
  const dom = mountText(t, f);
  const allocated = dom.allocations();
  f.state.settings.video.motionReduce = true;
  f.state.settings.accessibility = { flashReduce: true };
  f.bus.emit('combat:weakPointHit', { ...HIT, label: 'DRIVE COIL', critical: true });
  f.bus.emit('combat:weakPointHit', { ...HIT, label: 'DRIVE COIL' });
  dom.text.update(0.02);
  const [critical, legacy] = dom.visible();
  assert.equal(critical.style.transform, legacy.style.transform, 'critical uses the existing motion path');
  assert.match(critical.style.transform, /scale\(1\)$/);
  assert.equal(critical.style.opacity, legacy.style.opacity);
  assert.equal(legacy.className, 'sf-ft sf-ft--weak');
  assert.equal(legacy.textContent, '◈ DRIVE COIL');
  f.state.settings.video.motionReduce = false;
  dom.text.update(0.02);
  const scale = Number(critical.style.transform.match(/scale\(([^)]+)\)$/)[1]);
  assert.ok(Math.abs(scale - 1.075) < 1e-12);
  assert.equal(critical.style.transform, legacy.style.transform);
  dom.text.update(1);
  assert.equal(dom.text._activeCount(), 0);
  const projected = dom.projections();
  dom.text.update(1 / 60);
  assert.equal(dom.projections(), projected, 'expired callouts go back to sleep');
  // Fill and wrap the pool, ensuring critical classes cannot leak onto ordinary numbers.
  for (let i = 0; i < dom.pool.length + 1; i++) {
    f.bus.emit('combat:damage', { amount: 5, pos: HIT.pos });
  }
  assert.ok(dom.visible().every(el => el.textContent === '5' && el.className === 'sf-ft sf-ft--hull'));
  assert.equal(dom.allocations(), allocated, 'spawns and updates reuse the existing DOM pool');
});

for (const settings of [{ showDamageNumbers: false }, { gameplay: { damageNumbers: false } }]) {
  test(`critical callouts respect the damage-number preference ${JSON.stringify(settings)}`, t => {
    const f = fixture(t);
    const dom = mountText(t, f);
    f.state.settings = { ...settings, gameplay: { difficulty: 'veteran', ...settings.gameplay } };
    f.bus.emit('projectile:hit', HIT);
    assert.equal(f.receipts.length, 1, 'presentation preferences do not change earned hits');
    assert.equal(f.target.hull, 984);
    assert.equal(dom.text._activeCount(), 0);
  });
}
