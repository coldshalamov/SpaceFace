import test from 'node:test';
import assert from 'node:assert/strict';
import { miningNextStep } from '../src/ui/asteroid/progressionGuide.js';
import { planSiteVisit } from '../src/systems/siteIndustryPlanner.js';

const core = { defId: 'sm_massline_core', powerRatio: 1, laneKey: 0 };
const extractor = { defId: 'sm_extractor', powerRatio: 1, laneKey: 0, status: { state: 'running' } };
const context = () => ({ drill: { tilesCleared: 0, scan: { serial: 0 } }, cargo: { items: {} } });

test('fresh pilot is taught movement and preservation before the shopping list', () => {
  const c = context();
  assert.equal(miningNextStep(c).id, 'bore');
  c.drill.tilesCleared = 2;
  assert.equal(miningNextStep(c).id, 'survey');
  c.drill.scan.serial++;
  assert.equal(miningNextStep(c).id, 'kit');
  assert.match(miningNextStep(c).detail, /station/);
  c.cargo.items = planSiteVisit('first_claim').manifest;
  assert.equal(miningNextStep(c).id, 'core');
  assert.equal(miningNextStep({ ...c, build: true }).selection, 'sm_massline_core');
});

test('live funding truth accepts affordable Core before the rest of the kit is packed', () => {
  const c = { ...context(), build: true, coreMissing: {} };
  assert.equal(miningNextStep(c).id, 'core');
  c.coreMissing = { cmdty_control_unit: 1 };
  assert.equal(miningNextStep(c).id, 'kit');
});

test('adjacent powered first machines skip unnecessary cable and lane lessons', () => {
  const c = { ...context(), extractorMissing: {}, projection: { machines: [core] } };
  assert.equal(miningNextStep(c).selection, 'sm_extractor');
  c.projection.machines.push(extractor);
  assert.equal(miningNextStep(c).selection, 'refining');
  c.projection.lanes = [{ store: { cmdty_ore_iron: 2 } }];
  assert.equal(miningNextStep(c).action, 'site');
  assert.match(miningNextStep(c).detail, /indefinitely/);
});

test('a pilot who could afford only the Core gets the remaining shopping list', () => {
  const c = { ...context(), projection: { machines: [core] } };
  assert.equal(miningNextStep(c).id, 'extractor-kit');
  c.cargo.items = planSiteVisit('first_claim', { machines: [core] }).manifest;
  assert.equal(miningNextStep(c).selection, 'sm_extractor');
  c.extractorMissing = { cmdty_regocrete: 1 };
  assert.equal(miningNextStep(c).selection, 'first_claim');
});

test('a broken connection overrides expansion advice and recovers from live state', () => {
  const c = { ...context(), projection: { machines: [core, { ...extractor, powerRatio: 0 }], lanes: [] } };
  assert.equal(miningNextStep(c).selection, 'power');
  c.projection.machines[1] = { ...extractor, laneKey: null };
  assert.equal(miningNextStep(c).selection, 'lane');
  c.projection.machines[1] = { ...extractor, status: { state: 'no-geology' } };
  assert.equal(miningNextStep(c).id, 'geology');
  c.projection.machines[1] = extractor;
  assert.equal(miningNextStep(c).id, 'refine');
});

test('processors teach input logistics before suggesting another expensive kit', () => {
  const c = { ...context(), projection: { machines: [core, extractor,
    { defId: 'sm_refinery', powerRatio: 1, laneKey: 0, status: { state: 'starved' } }] } };
  assert.equal(miningNextStep(c).id, 'inputs');
  c.projection.machines[2].status.state = 'running';
  assert.equal(miningNextStep(c).selection, 'courier');
  c.projection.machines.push({ defId: 'sm_fabricator', powerRatio: 1, laneKey: 0 });
  assert.equal(miningNextStep(c).selection, 'construction');
  c.projection.machines[2].status.state = 'backlogged';
  assert.equal(miningNextStep(c).id, 'storage');
});

test('full cargo and heat give an immediate recovery action without losing progression', () => {
  const c = context();
  c.cargo.capVolume = 10; c.cargo.usedVolume = 10;
  assert.equal(miningNextStep(c).action, 'leave');
  c.cargo.usedVolume = 5; c.drill.overheated = true;
  assert.equal(miningNextStep(c).id, 'recover');
  c.drill.overheated = false;
  assert.equal(miningNextStep(c).id, 'bore');
  assert.equal(miningNextStep({}), null);
});
