// The title's route into a new Adventure (TITLE-02, design/overhaul/08_INTERFACE.md §2): two doors,
// SWARM and ADVENTURE. The ADVENTURE door is the same button the title always had (data-action="newGame",
// accessible name "New Game"); pressing it opens the New Game screen. With a save present the door itself
// becomes Continue and New Game stands in the small row under the doors, so the same button is pressed in
// both states. Scripts press New Game through here so the route is written once.
//
//   await pressNewGame(page);                      // Playwright page
//   await pressTitleAction(page, 'circuits');      // a lab verb (hidden on a player's title)

/** Practice and test modes: kept off a player's title (dev switch `?titleLab=1` shows them), still in the
 *  DOM with their own click handlers, so tooling reaches them through the same button. */
const LAB_ACTIONS = new Set(['swarmSetup', 'crucible', 'archive', 'circuits', 'sandbox', 'physics']);

/** Press a title action by its data-action hook. A hidden lab verb is pressed through its own handler. */
export async function pressTitleAction(page, action, { timeout = 60000 } = {}) {
  const sel = `[data-screen="mainMenu"] [data-action="${action}"]`;
  const button = page.locator(sel).first();
  if (LAB_ACTIONS.has(action) && !(await button.isVisible().catch(() => false))) {
    await page.waitForSelector(sel, { state: 'attached', timeout });
    await button.evaluate((b) => b.click());
    return;
  }
  await button.click({ timeout });
}

/**
 * Press New Game and wait for the New Game screen. With a save on disk the title asks "Start a new game?"
 * first; this answers it (the same press a player makes), so a script runs the same in both states.
 */
export async function pressNewGame(page, { timeout = 60000 } = {}) {
  await pressTitleAction(page, 'newGame', { timeout });
  const confirmOk = '#sf-confirm-root.sf-confirm--in .sf-confirm__ok';
  await page.waitForSelector(`[data-screen="newGame"], ${confirmOk}`, { state: 'visible', timeout });
  const ask = page.locator(confirmOk).first();
  if (await ask.isVisible().catch(() => false)) await ask.click({ timeout });
  await page.waitForSelector('[data-screen="newGame"]', { state: 'visible', timeout });
}
