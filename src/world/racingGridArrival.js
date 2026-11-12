// The in-process launch and the worker command use the same world and mission
// owners. Either owner can emit synchronously and let a newer run take over.
export function armRacingGrid({ state, bus, missions, world }, { offer, sectorId, start, relocate, allowEnterSector }) {
  const missionBook = state.missions;
  const startingRows = missionBook.active;
  const worldAtStart = state.world;
  const { currentSectorId, enterSerial, activeSector } = worldAtStart;
  const sameEntry = (id, serial, bag) => state.world === worldAtStart
    && worldAtStart.currentSectorId === id && worldAtStart.enterSerial === serial
    && worldAtStart.activeSector === bag;
  const sameDeparture = () => sameEntry(currentSectorId, enterSerial, activeSector);
  const sameMissionBook = () => state.missions === missionBook && missionBook.active === startingRows;

  const result = missions.postAndAcceptAuthoredOffer(offer);
  if (result?.ok !== true || result.reused) {
    if (!sameMissionBook() || !sameDeparture()) return { ok: false, reason: 'superseded' };
    return { ok: result?.ok === true, reused: result?.reused === true, missionId: result?.missionId, result: result ?? null };
  }
  const missionId = result.missionId;
  const mission = sameMissionBook() && startingRows.find(row => row?.id === missionId && row.status === 'active'
    && row.type === 'race' && row.params?.racingContractId === offer.params?.racingContractId);
  const ownsMission = () => state.missions === missionBook && mission?.status === 'active'
    && missionBook.active.find(row => row?.id === missionId) === mission;
  const fail = (reason) => {
    if (ownsMission()) bus?.emit?.('mission:abandon', { missionId });
    return { ok: false, reason, missionId };
  };
  if (!ownsMission() || !sameDeparture()) return fail('superseded');

  if (currentSectorId !== sectorId) {
    if (!allowEnterSector) return fail('superseded');
    // enterSector mints one serial up front. An error after that mint can
    // still belong to us, but a nested entry or restore mints past it.
    const entrySerial = (Number(state.enterSerialSeq) || 0) + 1;
    let entered;
    try {
      entered = world.enterSector(sectorId);
    } catch {
      const ownsEntry = sameDeparture() || (state.world === worldAtStart && worldAtStart.enterSerial === entrySerial
        && (worldAtStart.currentSectorId === currentSectorId || worldAtStart.currentSectorId === sectorId));
      return fail(ownsMission() && ownsEntry ? 'grid_failed' : 'superseded');
    }
    if (entered === null) {
      return fail(ownsMission() && sameDeparture() ? 'grid_failed' : 'superseded');
    }
  }
  if (!ownsMission() || state.world !== worldAtStart || worldAtStart.currentSectorId !== sectorId) {
    return fail('superseded');
  }
  const arrivalSerial = worldAtStart.enterSerial;
  const arrivalBag = worldAtStart.activeSector;
  let moved;
  try {
    moved = !relocate || (start && world.relocatePlayerInSector(start, { reason: 'race_grid' }) !== false);
  } catch {
    moved = false;
  }
  if (!ownsMission() || !sameEntry(sectorId, arrivalSerial, arrivalBag)) return fail('superseded');
  if (!moved) return fail('grid_failed');
  return { ok: true, missionId, result };
}
