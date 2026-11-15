// The title's route into a new Adventure (TITLE-01, design/game/20_THE_FIRST_HOUR.md): two doors,
// ADVENTURE and SWARM. The ADVENTURE door is the same button the title always had (data-action="newGame",
// accessible name and text "New Game"); pressing it opens the New Game screen. With a save present the door
// itself becomes Continue and New Game stands on it as a visible secondary key, so the same button is
// pressed in both states. Scripts press New Game
// through here so the route is written once.
//
//   await pressNewGame(page);                      // Playwright page
//   await pressTitleAction(page, 'circuits');      // anything behind the title's "More" (load, circuits, sandbox, ...)

const MORE_ACTIONS = new Set(['load', 'crucible', 'archive', 'circuits', 'sandbox', 'physics']);

/** Press a title action by its data-action hook, opening "More" first when the action lives behind it. */
export async function pressTitleAction(page, action, { timeout = 60000 } = {}) {
  const sel = `[data-screen="mainMenu"] [data-action="${action}"]`;
  if (MORE_ACTIONS.has(action)) {
    const visible = await page.locator(sel).first().isVisible().catch(() => false);
    if (!visible) {
      const more = page.locator('[data-screen="mainMenu"] [data-title-more]').first();
      if (await more.isVisible().catch(() => false)) await more.click({ timeout });
    }
  }
  await page.locator(sel).first().click({ timeout });
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
