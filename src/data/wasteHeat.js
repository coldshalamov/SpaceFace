// SFQ-B166 — the Warm Freighter's standby reactor is waste heat. Cysts live in it.
// Eels are held by it. Leeches are the same either way. The reading never says
// the reactor was built for any of them. No clock.

export const HEAT_SITE_ID = 'warm_freighter';

export const HEAT_ON = 'The reactor is on standby. Cysts live in the waste heat. Eels are held. Leeches unchanged.';
export const HEAT_OFF = 'Standby is cut. Cysts lose the heat. Eels are no longer held. Leeches unchanged.';

export function wasteHeatSupport(online) {
  const on = online !== false;
  return {
    online: on,
    intent: null,
    actors: {
      lantern_cyst: on
        ? { effect: 'sheltered', helped: true, hurt: false }
        : { effect: 'cold', helped: false, hurt: true },
      wake_eel: on
        ? { effect: 'held', helped: false, hurt: true }
        : { effect: 'released', helped: true, hurt: false },
      hull_leech: { effect: 'unchanged', helped: false, hurt: false },
    },
  };
}

export function stepWasteHeat(online, event) {
  const on = online !== false;
  if (event === 'arrive') return { online: on, text: on ? HEAT_ON : HEAT_OFF };
  if (event === 'cut') return { online: !on, text: on ? HEAT_OFF : HEAT_ON };
  return { online: on, text: null };
}

// The local tradeoff is mobility: cold cysts drift sluggishly; hot eels are held
// back. No death, population growth, or offscreen upkeep clock is introduced.
export function wasteHeatMotionMult(online, speciesId) {
  const on = online !== false;
  return (speciesId === 'lantern_cyst' && !on) || (speciesId === 'wake_eel' && on) ? 0.35 : 1;
}
