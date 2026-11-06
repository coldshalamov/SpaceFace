const STATION = 'station_helios';
const SITE = 'world_site_ceres_second_measure';
const CHOICE = 'ceres_second_measure_shift';

function atDesk(state, stationId) {
  return stationId === STATION && state?.ui?.docked === true && state.ui.dockedStationId === STATION;
}

export function kesslerCeresShiftChoice(state, stationId) {
  return atDesk(state, stationId) ? { id: CHOICE, label: 'Ceres yard shift?' } : null;
}

export function kesslerCeresShiftReply(state, stationId, choiceId) {
  if (choiceId !== CHOICE) return null;
  if (!atDesk(state, stationId)) return { text: 'Ask me at the Helios desk; I need the current yard slip.' };
  const site = state?.sites?.worldById?.[SITE];
  const plate = site?.payloads?.long_plate;
  const braced = site?.completedOperations?.brace_long_plate;
  if (plate?.destroyed) return { text: 'The Second Measure long plate is gone. The crew cannot finish that lift.' };
  if (braced && plate?.retained) return { text: 'They logged your long-plate brace. The original plate is secured in the cradle.' };
  if (braced) return { text: 'They logged your long-plate brace. I do not have a completed lift on that slip.' };
  return { text: 'Second Measure at Ceres needs a long-plate brace before their breaker can work. The yard pays 400 credits for the completed brace. Find Second Measure Shipbreak on the Ceres chart and use your site beam on the marked support.' };
}
