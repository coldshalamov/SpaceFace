// Recorded frames are ordered by tick. Advance once through a tape instead of
// rescanning its prefix on every simulation step; held axes survive sparse gaps.
export function createTapeReader(tape) {
  const frames = tape?.frames || [];
  let index = -1;
  return (tick) => {
    while (index + 1 < frames.length && (frames[index + 1].tick | 0) <= tick) index++;
    const held = frames[index];
    if (held && (held.tick | 0) === tick) return held;
    return {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      fire: false,
      fireGroup: 0,
      tether: false,
      reel: 0,
      brake: false,
      ...held,
      tick,
      scanPulse: false,
      tetherNearest: false,
      commands: [],
    };
  };
}

export function tapeTicks(tape) {
  const frames = tape?.frames || [];
  return frames.length ? Math.max(0, (frames[frames.length - 1].tick | 0) + 1) : 0;
}
