import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { racingToFlight } from '../scripts/player-truth/routes.mjs';

const CONTRACT = 'contract_junction_jam';
const COURSE_SECTOR = 'sector_tethys_junction';
const activeRace = {
  type: 'race',
  status: 'active',
  params: { racingContractId: CONTRACT, courseSectorId: COURSE_SECTOR },
};

function routeFixture({ active = [], sector = COURSE_SECTOR, onPoll = null } = {}) {
  const state = { mode: 'menu', world: { currentSectorId: sector }, missions: { active } };
  const window = { SF: { state, ctx: { screenManager: { top: () => 'raceBoard' } } } };
  const selectedCard = { dataset: { contractId: CONTRACT } };
  const board = {
    querySelector(selector) {
      if (selector === '.race-board-start h2') return { textContent: 'Junction Jam' };
      if (selector === '[data-contract-id] button[aria-pressed="true"]') {
        return { closest: () => selectedCard };
      }
      return null;
    },
  };
  const document = {
    body: { innerText: '' },
    getElementById: () => null,
    querySelector: () => board,
    querySelectorAll: () => [{ textContent: 'Circuits', offsetParent: {} }],
  };
  const clicks = [];
  const steps = [];
  const step = (...args) => steps.push(args);
  const evaluate = (fn, arg) => {
    // The final seed reader imports a game-server module. The route fixture supplies its receipt.
    if (fn.constructor.name === 'AsyncFunction') return { seed: 239 };
    return runInNewContext(`(${fn})(argument)`, { window, document, argument: arg });
  };
  const page = {
    async evaluate(fn, arg) { return evaluate(fn, arg); },
    async waitForFunction(fn, arg) {
      let value = evaluate(fn, arg);
      if (!value && onPoll) {
        onPoll(state);
        value = evaluate(fn, arg);
      }
      if (!value) {
        const error = new Error('condition timed out');
        error.name = 'TimeoutError';
        throw error;
      }
      return value;
    },
    locator(selector) {
      return {
        filter() { return this; },
        first() { return this; },
        async waitFor() {},
        async textContent() { return selector.includes('sf-confirm') ? 'Launch circuit' : 'Start'; },
        async click() {
          clicks.push(selector);
          if (selector.includes('sf-confirm')) state.mode = 'flight';
        },
      };
    },
  };
  return { page, step, steps, clicks };
}

for (const [name, options] of [
  ['ordinary flight without a race', {}],
  ['flight with a different race', {
    active: [{ ...activeRace, params: { ...activeRace.params, racingContractId: 'contract_textile_qual' } }],
  }],
  ['the selected race in the wrong sector', { active: [activeRace], sector: 'sector_tethys' }],
]) {
  test(`Circuits rejects ${name}`, async () => {
    const { page, step, steps } = routeFixture(options);
    await assert.rejects(racingToFlight(page, step), /Circuits.*contract_junction_jam.*course sector/i);
    assert.equal(steps.some(([name]) => name === 'preparation'), false);
  });
}

test('Circuits clicks through the public board and waits for the selected race to publish', async () => {
  const { page, step, steps, clicks } = routeFixture({
    onPoll(state) { state.missions.active = [activeRace]; },
  });
  const result = await racingToFlight(page, step);
  assert.equal(result.course, 'Junction Jam');
  assert.equal(result.runSeed, 239);
  assert.deepEqual(clicks, [
    '#screens button:visible',
    '#screens [data-screen="raceBoard"] .race-board-launch:visible',
    '.sf-confirm .sf-confirm__ok',
  ]);
  assert.deepEqual(steps.map(([name, ok]) => [name, ok]), [['mode select', true], ['preparation', true]]);
});
