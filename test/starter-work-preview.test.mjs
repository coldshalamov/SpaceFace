import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEW_GAME_STARTERS, starterById, DEFAULT_STARTER_ID } from '../src/data/newGameDefaults.js';
import { activeOwnedShip, nextStarterStep, STARTER_JOBS } from '../src/data/starterJobs.js';
import { starterWorkPreview, paintStarterWorkPreview } from '../src/ui/starterWorkPreview.js';

const source = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
const DEFAULT_STARTER = starterById(DEFAULT_STARTER_ID);
class Element {
  constructor(tag, className = '', text = '') { this.tag = tag; this.className = className; this.textContent = text; this.children = []; this.attrs = {}; this.style = { setProperty() {} }; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key, value) { this.attrs[key] = value; }
}
function routeFixture() {
  const first = source.slice(source.indexOf('const FIRST_MINUTES = ['), source.indexOf('\n];', source.indexOf('const FIRST_MINUTES = [')) + 3);
  const a = source.indexOf("    const route = el('div', 'sf-ng-route');");
  const b = source.indexOf('    body.appendChild(route);', a) + '    body.appendChild(route);'.length;
  assert.ok(a > 0 && b > a, 'production mount route exists');
  return Function('el', 'pin', 'coreText', 'paintStarterWorkPreview', `${first}\nconst body = el('div');\n${source.slice(a,b)}\nreturn { route, steps, workHeading, workDetail, renderWorkPreview };`)(
    (tag, cls, text) => new Element(tag, cls, text), () => {}, () => 'First 15 minutes', paintStarterWorkPreview);
}
function selectFixture(route) {
  const buttons = NEW_GAME_STARTERS.map(starter => ({ dataset: { action: `starter:${starter.id}` }, setAttribute(k,v) { this[k] = v; } }));
  const refs = { starterWords: { querySelectorAll: () => buttons }, starterDesc: {}, hullName: {}, hullBlurb: {},
    ctx: {}, renderLoadout: starter => { refs.loadout = starter.fittedModules; }, renderWorkPreview: route.renderWorkPreview };
  const a = source.indexOf('  _setStarter(id,');
  const b = source.indexOf('\n  _setDifficulty(', a);
  const method = source.slice(a,b).trim().replace(/,$/, '');
  const select = Function('refs', 'starterById', 'DEFAULT_STARTER', 'shipDefFor', 'syncKeys', `return ({${method}})._setStarter;`)(
    refs, starterById, DEFAULT_STARTER, () => null, () => {});
  const owner = { _emitEmbarkSpec() {} };
  return { refs, buttons, choose: id => select.call(owner, id) };
}

test('every catalog hull previews its canonical first board ticket with its actual required fit', () => {
  const before = JSON.stringify(NEW_GAME_STARTERS);
  for (const starter of NEW_GAME_STARTERS) {
    const job = STARTER_JOBS.find(j => j.shipId === starter.shipId);
    assert.ok(starter.fittedModules.includes(job.requiredModule));
    const [title, detail] = starterWorkPreview(starter);
    assert.ok(title.length <= 24);
    assert.ok(detail.includes(job.steps[0].title));
    assert.match(detail, /Contracts at Helios/);
    assert.doesNotMatch(detail, /accepted|paid|guaranteed/i);
  }
  assert.equal(JSON.stringify(NEW_GAME_STARTERS), before);
  assert.match(starterWorkPreview(starterById('starter_wasp'))[1], /guns do not count/);
});

test('missing or malformed fits replace the offered route rather than promise that job', () => {
  for (const starter of NEW_GAME_STARTERS) {
    for (const fittedModules of [[], undefined, null, 'mod_winch_hd']) {
      const [heading, text] = starterWorkPreview({ ...starter, fittedModules });
      assert.equal(heading, 'Check the local fit');
      assert.match(text, /Check your fittings/);
      assert.doesNotMatch(text, /First local ticket/);
    }
  }
});

test('unknown and mismatched identities do not inherit a named starter route', () => {
  for (const starter of [null, {}, { ...NEW_GAME_STARTERS[0], id: 'starter_wasp' }, { ...NEW_GAME_STARTERS[0], shipId: 'ship_unknown' }]) {
    assert.deepEqual(starterWorkPreview(starter), ['Dock and pick work', 'Check Contracts at Helios for work your current fit can take.']);
  }
});

test('actual screen selection updates the existing fourth row with the hull and loadout, including repeated picks and invalid-id fallback', () => {
  const route = routeFixture();
  const { refs, buttons, choose } = selectFixture(route);
  const originalRows = route.steps.children.slice();
  const intro = originalRows.slice(0,3).map(row => row.children[0].children.map(child => child.textContent));
  for (const id of ['starter_hitch', 'starter_pelican', 'starter_wasp', 'starter_wasp', 'starter_hitch', 'invalid']) {
    choose(id);
    const expected = starterById(id) || DEFAULT_STARTER;
    assert.equal(refs.starter, expected);
    assert.equal(refs.hullName.textContent, expected.name);
    assert.equal(refs.loadout, expected.fittedModules);
    assert.deepEqual([route.workHeading.textContent, route.workDetail.textContent], starterWorkPreview(expected));
    assert.deepEqual(route.steps.children, originalRows);
    assert.deepEqual(originalRows.slice(0,3).map(row => row.children[0].children.map(child => child.textContent)), intro);
    assert.equal(buttons.filter(b => b['aria-pressed'] === 'true').length, 1);
  }
  assert.equal(originalRows[3].children[0].attrs['aria-live'], 'polite');
  assert.equal(originalRows[3].children[0].attrs['aria-atomic'], 'true');
});

test('presenter clears a prior named job when the fit becomes unavailable', () => {
  const route = routeFixture();
  route.renderWorkPreview(starterById('starter_pelican'));
  assert.match(route.workHeading.textContent, /44-C/);
  route.renderWorkPreview({ ...starterById('starter_pelican'), fittedModules: [] });
  assert.equal(route.workHeading.textContent, 'Check the local fit');
  assert.doesNotMatch(route.workDetail.textContent, /44-C/);
  route.renderWorkPreview(starterById('starter_wasp'));
  assert.match(route.workHeading.textContent, /gate runner/);
  assert.equal(route.steps.children.length, 4);
});

// Run the current board injection owner. Rolling the generic offer and dressing the
// physical worksite are narrow adapters; the selected hull, step, title and fit are real.
test('preview matches the first ticket emitted by the current Helios board owner', () => {
  const board = readFileSync(process.env.STARTER_PREVIEW_BOARD_SOURCE || new URL('../src/systems/missionBoardOps.js', import.meta.url), 'utf8');
  const a = board.indexOf('  _injectStarterJob(info, offers, cap) {');
  const b = board.indexOf('\n  },', a) + '\n  }'.length;
  assert.ok(a > 0 && b > a);
  const inject = Function('activeOwnedShip', 'nextStarterStep', 'starterWorkSite', 'STARTER_WORKDAY_VERSION',
    `return ({${board.slice(a,b)}})._injectStarterJob;`)(activeOwnedShip, nextStarterStep, () => null, 1);
  for (const starter of NEW_GAME_STARTERS) {
    const offers = [];
    const state = { player: { ownedShips: [{ defId: starter.shipId, fittings: starter.fittedModules }] }, missions: {} };
    inject.call({ state, _rollOffer: type => ({ type }) }, { id: 'station_helios', sectorId: 'sector_helios_prime' }, offers, 8);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].source, 'starterJob');
    assert.ok(starterWorkPreview(starter)[1].includes(offers[0].title));
    assert.ok(starter.fittedModules.includes(offers[0].params.requiredModule));
    assert.equal(offers[0].params.starterStep, 1);
  }
});
