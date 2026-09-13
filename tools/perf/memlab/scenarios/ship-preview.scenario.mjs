// MemLab scenario: Ship Preview & Main Menu Cycle
// Specifically guards against the secondary preview WebGL context leak and runaway resizing on ship preview.

export function url() {
  const port = process.env.SPACEFACE_PORT || 8123;
  return `http://localhost:${port}/?seed=47`;
}

export async function action(page) {
  await page.waitForSelector('#gl-canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.SF && window.SF.state, { timeout: 20000 });

  // Open ship hangar / preview on main menu
  await page.evaluate(() => {
    if (window.SF.bus) {
      window.SF.bus.emit('screen:open', { id: 'shipworks' });
    }
  });
  await page.waitForTimeout(2000);
}

export async function back(page) {
  // Return to main menu / close preview
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
