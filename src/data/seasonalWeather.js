import { hash32 } from '../core/rng.js';

// Same calendar as sectorSim: 600 simulated seconds per day. A seven-day sector season
// advances from saved sim time; no visit timer or ambient RNG can reroll the forecast.
export const WEATHER_DAY_S = 600;
export const WEATHER_SEASON_DAYS = 7;
export const WEATHER_KINDS = Object.freeze(['ion_storm', 'solar_wind', 'meteor_shower', 'clear']);
export const SEASONAL_WEATHER_CYCLE = Object.freeze({ warningS: 30, surgeS: 90, calmS: 180 });

export function weatherSeasonAt(sectorId, simTime) {
  const now = Math.max(0, Number(simTime) || 0);
  const seasonS = WEATHER_DAY_S * WEATHER_SEASON_DAYS;
  const season = Math.floor(now / seasonS);
  const offset = hash32(449, sectorId) % 4;
  return { season, kind: WEATHER_KINDS[(season + offset) % 4], remainingS: seasonS - now % seasonS };
}

export function seasonalWeatherPhase(volume, simTime, out = {}) {
  const now = Math.max(0, Number(simTime) || 0), season = weatherSeasonAt(volume.sectorId, now);
  const cycle = SEASONAL_WEATHER_CYCLE, span = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsed = now % span;
  const active = season.kind === volume.role;
  out.phase = !active || elapsed >= cycle.warningS + cycle.surgeS ? 'calm' : elapsed < cycle.warningS ? 'warning' : 'surge';
  out.remainingS = !active ? season.remainingS : Math.min(season.remainingS,
    out.phase === 'warning' ? cycle.warningS - elapsed : out.phase === 'surge' ? cycle.warningS + cycle.surgeS - elapsed : span - elapsed);
  out.fieldActive = active && out.phase !== 'calm';
  out.fieldStrengthScale = out.phase === 'surge' ? 1 : 0;
  out.cycleS = span; out.elapsedS = elapsed; out.cycleIndex = Math.floor(now / span); out.season = season.season;
  return out;
}

export function weatherForecast(sectorId, simTime) {
  const season = weatherSeasonAt(sectorId, simTime);
  const phase = seasonalWeatherPhase({ sectorId, role: season.kind }, simTime);
  const label = { ion_storm: 'ION STORM — scope blackout; follow your engine and the radio',
    solar_wind: 'SOLAR WIND — crosswind carries ships and tow loads', meteor_shower: 'METEOR SHOWER — moving iron; dangerous approach, rich mining', clear: 'CLEAR WEATHER' }[season.kind];
  return { id: `weather:${sectorId}:${season.season}:${phase.cycleIndex}:${phase.phase}`,
    text: `SECTOR WEATHER: ${label}. ${phase.phase === 'warning' ? `Front arrives in ${Math.ceil(phase.remainingS)} s` : phase.phase === 'surge' ? `Front clears in ${Math.ceil(phase.remainingS)} s` : 'Quiet window; listen for the next front'}.`,
    kind: season.kind, phase: phase.phase };
}
