// Read-only decoder for the bounded Pallet Jack presentation frame published by its simulation
// owner. Keeping this contract independent lets render consume the mirror without importing the
// encounter system or its enemy-spawn dependencies.
export function readPalletJackMotionFrame(state, entity) {
  if (state?.mode !== 'flight' || !entity || entity.alive === false) return null;
  const raw = entity.palletJackMotionFrame;
  if (typeof raw !== 'string') return null;
  try {
    const frame = JSON.parse(raw);
    if (frame?.v !== 1 || frame.tick !== state.tick || frame.actorId !== entity.id
      || frame.ownerLife !== entity.occupantGeneration
      || !Number.isSafeInteger(frame.phaseStartTick) || frame.phaseStartTick > state.tick) return null;
    return { ...frame, sourceRevision: entity.physicsBody?.revision,
      lastRelease: frame.release ? { ...frame.release } : null };
  } catch (_) { return null; }
}
