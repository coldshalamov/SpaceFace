/**
 * When the player is in a menu, the flight scene stays resident but must not keep
 * submitting. Dock already did this; map/station/pause use the same screen-stack
 * pause the ScreenManager already owns.
 *
 * Coming back is a resume, not a sector re-admission.
 */

export function shouldFreezeFlightSubmit(state) {
  const ui = state && state.ui;
  if (!ui) return false;
  if (ui.docked === true) return true;
  const stack = ui.screenStack;
  return Array.isArray(stack) && stack.length > 0;
}
