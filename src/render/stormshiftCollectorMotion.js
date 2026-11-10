// Presentation-only projection of the original traffic worker's durable itinerary.
// The pinned bank owns six visual radiator leaves; its solid cheeks stay fixed.
export function createStormshiftCollectorMotionDriver(entity, controllers) {
  const route = entity?.data?.itinerary;
  if (route?.kind !== 'anvil_work' || route.role !== 'collector') return null;
  const rigs = controllers.filter(controller => controller.rigId === 'stormshift_collector');
  if (!rigs.length) return null;
  let occupant = null, generation = null, previous = null;
  return function updateStormshiftCollectorMotion(liveEntity, simNow) {
    const itinerary = liveEntity?.data?.itinerary;
    const collecting = liveEntity?.alive !== false && liveEntity?.hull > 0
      && !liveEntity.data?.jobId && itinerary?.kind === 'anvil_work'
      && itinerary.role === 'collector' && itinerary.phase === 'collect';
    const next = collecting ? 'stormshift_deploy' : 'stormshift_stow';
    const admission = occupant !== liveEntity || generation !== liveEntity?.occupantGeneration;
    if (!admission && previous === next) return;
    // Fresh/Continue/residency admission has no trustworthy phase start timestamp.
    // Pose the current durable state immediately, never replay fictitious work.
    // The pinned deploy/stow curves are exact time reverses. Mirror elapsed phase
    // on interruption so retreat folds immediately, rather than auto-bridging
    // through the fully deployed first key of stow. The bank remains sole writer.
    for (const controller of rigs) {
      const duration = controller.clipDuration(next);
      const elapsed = admission ? null : controller.clipElapsed(previous, simNow);
      const progress = elapsed == null ? 1 : Math.min(1, Math.max(0,
        elapsed / controller.clipDuration(previous)));
      const offset = admission ? duration : duration * (1 - progress);
      controller.setState({ state: next, startTimeS: simNow - offset, noBridge: true });
    }
    occupant = liveEntity;
    generation = liveEntity?.occupantGeneration;
    previous = next;
  };
}
