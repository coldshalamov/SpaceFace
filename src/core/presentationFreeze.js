/**
 * When the player is in a menu, the flight scene stays resident but must not keep
 * submitting. Dock already did this; map/station/pause use the same screen-stack
 * pause the ScreenManager already owns.
 *
 * Coming back is a resume, not a sector re-admission.
 *
 * This freezes the FLIGHT submit, not the canvas. `src/render/uiStage.js` draws a menu's own lit
 * world in the same context while this returns true; the simulation stays frozen either way, which
 * is the property the freeze exists to protect (a map that lets an off-screen enemy keep killing
 * the player is an ambush). Use `canvasIsProtectedDuringFreeze()` before drawing anything else.
 */

export function shouldFreezeFlightSubmit(state) {
  const ui = state && state.ui;
  if (ui && ui.docked === true) return true;
  const stack = ui && ui.screenStack;
  if (Array.isArray(stack) && stack.length > 0) return true;
  // Intentional sector arrival cooks the live next scene before the first
  // Ceres present. Keep bloom off that working set until the cook returns.
  if (state && state.render && state.render.sectorShellAdmission === true) return true;
  return false;
}

/**
 * True when the frozen canvas is holding a picture nothing else may draw over.
 *
 * Two freezes are not menus. The loading route owns the boot shell, and a sector-shell admission is
 * mid-cook on the working set the next present needs. Both must keep the canvas they have; a menu
 * freeze must not, because a menu with nothing behind it is the black screen this whole program
 * exists to remove.
 */
export function canvasIsProtectedDuringFreeze(state) {
  if (!state) return true;
  if (state.mode === 'loading') return true;
  return !!(state.render && state.render.sectorShellAdmission === true);
}
