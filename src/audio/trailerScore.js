// A set-piece beat is an actual phrase on the score bus. Its physical onset cue remains separate.
export const TRAILER_SCORE_PHRASES = Object.freeze({
  wreck_cathedral: [['A', 3, 0, 1.5], ['E', 4, .5, 1], ['B', 4, 1, 1.5]],
  runaway_kiln: [['A', 2, 0, .5], ['C', 3, .5, .5], ['E', 3, 1, 1], ['A', 3, 1.5, 1]],
  eighth_bell: [['A', 4, 0, 1.5], ['E', 5, .75, 1], ['B', 4, 1.5, 1.5]],
  bolus_throat: [['A', 2, 0, 2], ['B', 2, .5, 1.5], ['E', 3, 1.5, 1.5]],
  oneoff_great_tanker: [['A', 2, 0, 2.5], ['E', 3, .5, 1.5], ['C', 4, 1.5, 1.5]],
  oneoff_abandoned_tug: [['A', 3, 0, 1], ['C', 4, .75, .75], ['E', 4, 1.5, 1.5]],
  oneoff_old_pod_field: [['E', 4, 0, 1], ['B', 4, .5, 1], ['A', 4, 1.25, 1.75]],
  oneoff_strut_shrine: [['A', 3, 0, 2.5], ['E', 4, .75, 2], ['B', 4, 1.5, 1.5]],
  oneoff_runaway_ladle: [['A', 2, 0, .5], ['E', 3, .5, .5], ['C', 4, 1, .75], ['A', 3, 1.75, 1.25]],
  oneoff_toll_saint_box: [['A', 4, 0, .75], ['B', 4, .75, .75], ['E', 5, 1.5, 1.5]],
});

export function playTrailerScore(owner, payload, seen = new Set()) {
  const phrase = TRAILER_SCORE_PHRASES[payload?.id];
  const rt = owner?.rt, ctx = rt?.ctx;
  if (!phrase || !ctx || ctx.state !== 'running' || !rt.musicBus || rt._destroyed
      || rt._lifecycleSuspended || owner._isMuted() || seen.has(payload.id)) return false;
  const bpm = Math.max(60, Math.min(160, Number(rt._scoreIdentity?.bpm) || 96));
  const beat = 60 / bpm;
  const start = typeof owner._stuntGridTime === 'function' ? owner._stuntGridTime(ctx.currentTime) : ctx.currentTime + .015;
  seen.add(payload.id);
  for (const [note, octave, at, length] of phrase) {
    owner._playNote(ctx, owner._noteFreq(note, octave), length * beat, .075, 'triangle', rt.musicBus, null,
      start + at * beat, { detune: 5, attack: .025, release: .38, pluckFilter: true });
  }
  return true;
}

export function bindTrailerScore(owner) {
  const seen = new Set(), offs = [];
  const on = (event, handler) => {
    const off = owner.bus.on(event, handler);
    offs.push(typeof off === 'function' ? off : () => owner.bus.off?.(event, handler));
  };
  on('setPiece:staged', payload => playTrailerScore(owner, payload, seen));
  for (const event of ['game:new', 'game:newGame', 'save:restoring']) on(event, () => seen.clear());
  return () => offs.splice(0).forEach(off => off());
}
