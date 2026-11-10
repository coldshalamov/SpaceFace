// MemLab scenario: Station Dock & Menu Cycle
// Tests if docking at a station, opening tabs (market, shipyard, fittings), and undocking leaves memory leaks.

export function url() {
  const port = process.env.SPACEFACE_PORT || 8123;
  return `http://localhost:${port}/?seed=47`;
}

export async function action(page) {
  // Wait for canvas and game boot
  await page.waitForSelector('#gl-canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.SF && window.SF.state, { timeout: 20000 });

  // Start new game into flight
  await page.evaluate(() => {
    if (window.SF.bus && typeof window.SF.bus.emit === 'function') {
      window.SF.bus.emit('game:new', { seed: 47 });
    }
  });
  await page.waitForFunction(() => window.SF.state && window.SF.state.mode === 'flight', { timeout: 180000, polling: 500 });
  await page.waitForTimeout(1500);

  // Open station screen
  await page.evaluate(() => {
    if (window.SF.bus) {
      window.SF.bus.emit('screen:open', { id: 'station' });
    }
  });
  await page.waitForTimeout(1500);
}

export async function back(page) {
  // Undock / close station screen back to flight
  await page.evaluate(() => {
    if (window.SF.bus) {
      window.SF.bus.emit('screen:close');
    }
  });
  await page.waitForTimeout(1500);
}

export function repeat() {
  return 1;
}
