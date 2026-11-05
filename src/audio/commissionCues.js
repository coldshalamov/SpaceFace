// Presentation-only vocabulary for accepted commission moments. Physical line and
// cash voices remain with their existing owners; these are not gameplay events.
export const COMMISSION_CUES = Object.freeze({
  'commission.counterweight.start': Object.freeze({ recipe: 'sfx_mission_accept', gain: 0.55, caption: 'Counterweight attempt ready.' }),
  'commission.counterweight.complete': Object.freeze({ recipe: 'sfx_mission_complete', gain: 0.65, caption: 'Counterweight attempt complete.' }),
  'commission.counterweight.failed': Object.freeze({ recipe: 'sfx_ui_error', gain: 0.55, caption: 'Counterweight attempt failed.' }),
  'commission.cinderglass.interrupted': Object.freeze({ recipe: 'sfx_ui_error', gain: 0.45, caption: 'Latch service interrupted.' }),
  'commission.counterweight.payout': Object.freeze({ recipe: 'sfx_cash_register', gain: 0.72, caption: 'Counterweight first completion paid.' }),
  'commission.cinderglass.settlement': Object.freeze({ recipe: 'sfx_cash_register', gain: 0.72, caption: 'Cinderglass settlement paid.' }),
});

// Only call after the owning sim has accepted the transition. Plain scalar data
// crosses the existing audio:cue worker bridge without a separate event route.
export function emitCommissionCue(bus, id, key, sectorId, tick) {
  if (!Object.hasOwn(COMMISSION_CUES, id) || !key || !sectorId) return;
  bus?.emit?.('audio:cue', { id, commissionKey: String(key), sectorId, tick });
}

export function bindCommissionCues(owner, bus) {
  const seen = new Set(), offs = [];
  let restoring = false, betweenSectors = false, betweenRuns = false;
  const on = (name, fn) => {
    const off = bus.on(name, fn);
    offs.push(typeof off === 'function' ? off : () => bus.off?.(name, fn));
  };
  on('audio:cue', cue => {
    const spec = cue && Object.hasOwn(COMMISSION_CUES, cue.id) ? COMMISSION_CUES[cue.id] : null;
    if (restoring || betweenSectors || betweenRuns || !spec || !cue.commissionKey || cue.sectorId !== owner.state?.world?.currentSectorId) return;
    const tick = owner.state?.tick;
    if (Number.isFinite(tick) && Number.isFinite(cue.tick) && tick - cue.tick > 120) return;
    const key = `${cue.id}:${cue.commissionKey}`;
    if (seen.has(key)) return;
    // Keep memory bounded even during very long sessions.
    if (seen.size >= 128) seen.delete(seen.values().next().value);
    seen.add(key);
    owner.play(spec.recipe, { gain: spec.gain, captionOwned: true });
    owner._emitNamedCaption(spec.caption);
  });
  on('save:restoring', () => { restoring = true; seen.clear(); });
  on('save:loaded', () => { restoring = false; });
  on('save:error', p => { if (p?.reason === 'load_failed') restoring = false; });
  on('sector:exit', () => { betweenSectors = true; seen.clear(); });
  on('sector:enter', () => { betweenSectors = false; });
  for (const event of ['game:new', 'game:newGame', 'game:exitToMenu']) {
    on(event, () => { betweenRuns = true; seen.clear(); });
  }
  on('game:started', () => { betweenRuns = false; });
  return () => { for (const off of offs.splice(0)) off(); seen.clear(); };
}
