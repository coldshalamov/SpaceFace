// Transient exact-object identity for the two internal docking producers. Logical IDs and
// occupant generations may repeat after loading the same save; neither proves current life.
// Private receipts do not survive JSON or actor/station replacement. No allocator or saved
// state changes are needed, and live entity references never enter event data.
const ACTORS = new WeakMap();

export function createDockIntent(state, details, actor = state.entities?.get?.(state.playerId)) {
  const payload = Object.freeze(actor ? { ...details, shipId: actor.id,
    shipGeneration: actor.occupantGeneration ?? null } : { ...details });
  if (actor) {
    const stations = state.entityIndex?.stations || state.entityList || [];
    const station = stations.find(entity => entity?.alive && entity.type === 'station'
      && entity.data?.stationId === details.stationId && state.entities?.get(entity.id) === entity) || null;
    ACTORS.set(payload, { state, actor, id: actor.id, generation: actor.occupantGeneration,
      station, stationId: details.stationId, stationLife: station?.occupantGeneration,
      sectorId: state.world?.currentSectorId, enterSerial: state.world?.enterSerial });
  }
  return payload;
}

export function dockIntentStatus(state, payload) {
  const receipt = payload && typeof payload === 'object' ? ACTORS.get(payload) : null;
  if (!receipt) return 'unbound';
  if (receipt.state !== state || state.playerId !== receipt.id || receipt.actor.id !== receipt.id
    || state.entities?.get?.(state.playerId) !== receipt.actor
    || receipt.actor.occupantGeneration !== receipt.generation
    || state.world?.currentSectorId !== receipt.sectorId || state.world?.enterSerial !== receipt.enterSerial) return 'stale';
  // Identity alone is not a live command: the pilot may have died or entered a menu,
  // jump/administrative transition since the intent was issued. ui.docked is deliberately
  // not checked here because the post-commit observer reads this receipt after setting it.
  const ui = state.ui;
  const jump = state.jump?.state;
  if (receipt.actor.alive !== true || (Number.isFinite(receipt.actor.hull) && receipt.actor.hull <= 0)
    || state.mode !== 'flight' || ui?.fulfillmentBlackoutActive === true
    || (Array.isArray(ui?.screenStack) && ui.screenStack.length > 0)
    || jump === 'CHARGING' || jump === 'JUMPING') return 'stale';
  // The existing tow owner issues its fresh destination receipt AFTER enterSector. Its
  // presentation shell can still be cooking; that is not a second pending gameplay jump.
  // The receipt already binds that exact new sector epoch and station. Manual docking may
  // never cross the shell-admission fence using an older flight command.
  if (state.render?.sectorShellAdmission === true && payload.via !== 'tow') return 'stale';
  const station = receipt.station;
  if (!station) return 'unbound'; // ordinary compatibility, but no verified target for recognition
  return state.entities?.get(station.id) === station && station.alive
    && station.occupantGeneration === receipt.stationLife && station.data?.stationId === receipt.stationId
    ? 'current' : 'stale';
}
