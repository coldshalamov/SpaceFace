// When the tank crosses into the low band the flight HUD already paints on the gauge.
// Hull and shields keep a standing annunciator while the condition holds. Fuel used to
// stay quiet until `fuel:empty`, which is the moment you are already stranded.
//
// Pure. The HUD owns the raise/clear/speak. A fresh glass that loads already low
// lights the lamp and does not speak; the next downward crossing does.

export const FUEL_LOW_FRACTION = 0.25;

export function fuelReserveWarning(previous, fraction, armed) {
  const frac = Number(fraction);
  const low = Number.isFinite(frac) && frac > 0 && frac < FUEL_LOW_FRACTION;
  const wasLow = !!(previous && previous.low);
  const entered = low && !wasLow;
  return {
    low,
    raise: entered,
    clear: !low && wasLow,
    speak: entered && armed === true,
    nextArmed: true,
  };
}
