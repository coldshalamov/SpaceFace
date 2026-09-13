// MemLab scenario: Galaxy Map Open & Close
// Tests if opening the galaxy map and closing it leaves retained DOM elements, canvas buffers, or event subscriptions.

export function url() {
  const port = process.env.SPACEFACE_PORT || 8123;
  return `http://localhost:${port}/?seed=47`;
}

export async function action(page) {
  await page.waitForSelector('#gl-canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.SF && window.SF.state, { timeout: 20000 });

  // Start new game into flight
  await page.evaluate(() => {
    if (window.SF.helpers && typeof window.SF.helpers.startNewGame === 'function') {
      window.SF.helpers.startNewGame({ seed: 47 });
    }
  });
  await page.waitForFunction(() => window.SF.state && window.SF.state.mode === 'flight', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Open Galaxy Map screen
  await page.evaluate(() => {
    if (window.SF.bus) {
      window.SF.bus.emit('screen:open', { id: 'galaxy-map' });
    }
  });
  await page.waitForTimeout(1500);
}

export async function back(page) {
  // Close Galaxy Map
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
