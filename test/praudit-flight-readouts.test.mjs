import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

test('flight instruments retain their text nodes when the reading changes', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=flight&chrome=0`);
    await page.waitForFunction(() => window.__BENCH_READY === true);
    const result = await page.evaluate(async () => {
      const { createSpeedDial } = await import('/src/ui/orrery/speedDial.js');
      const { createRadar } = await import('/src/ui/radar.js');
      const dial = createSpeedDial();
      document.body.appendChild(dial.el);
      dial.update({ speed: 42, ref: 180 });
      const numeral = dial.el.querySelector('.orr-numeral');
      const firstSpeedNode = numeral.firstChild;
      dial.update({ speed: 43, ref: 180 });
      const speed = { retained: numeral.firstChild === firstSpeedNode, text: numeral.textContent };
      const state = window.__BENCH_STATE;
      const radar = createRadar({ state, bus: window.__BENCH_BUS });
      document.body.appendChild(radar.el);
      radar.draw();
      const readout = radar.el.querySelector('.sf-radar-objective-readout');
      const firstRadarNode = readout.firstChild;
      const firstText = readout.textContent;
      state.nav.waypoint.label = 'Second beacon';
      radar.draw();
      const objective = { retained: !!firstRadarNode && readout.firstChild === firstRadarNode,
        changed: firstText !== readout.textContent, text: readout.textContent };
      radar.destroy();
      dial.dispose();
      return { speed, objective };
    });
    assert.equal(result.speed.text, '43');
    assert.equal(result.objective.changed, true, 'the real radar follows the changed waypoint');
    assert.deepEqual([result.speed.retained, result.objective.retained], [true, true]);
  } finally {
    await browser.close();
    await server.close();
  }
});
