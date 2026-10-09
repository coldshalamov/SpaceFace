// Input action IDs, not key codes. Rebinding the desktop cannot break the phone.
const power = (id, label, symbol, description, kind = 'pulse') => Object.freeze({ id, label, symbol, description, kind });
export const POWER_PAGES = Object.freeze([
  { name: 'Ordnance', powers: [
    power('chargeThrow', 'CHARGE', 'charge', 'Throw an impulse charge.'),
    power('chargeDetonate', 'DETONATE', 'blast', 'Detonate your armed charges and bombs.'),
    power('dropBomb', 'BOMB', 'bomb', 'Release the selected drift bomb.'),
    power('cycleBomb', 'NEXT BOMB', 'cycle', 'Select the next bomb type.'),
    power('countermeasure', 'DECOY', 'decoy', 'Deploy the equipped countermeasure.'),
    power('cloak', 'CLOAK', 'cloak', 'Toggle your cloak.'),
  ] },
  { name: 'Fieldwork', powers: [
    power('deployMassSeed', 'MASS SEED', 'seed', 'Launch an anchor toward your aim.'),
    power('deployWell', 'WELL', 'well', 'Deploy an attractive gravity well.'),
    power('deployRepulsor', 'REPULSOR', 'repel', 'Push surrounding bodies away.'),
    power('toggleClearingCone', 'CONE', 'cone', 'Toggle the forward clearing field.'),
    power('toggleSkimCollector', 'COLLECTOR', 'skim', 'Toggle the skim collector.'),
    power('deployBeacon', 'BEACON', 'beacon', 'Drop a claim beacon in open space.'),
  ] },
  { name: 'Flight', powers: [
    power('scanPulse', 'SCAN', 'scan', 'Pulse the scanner.'),
    power('cruise', 'CRUISE', 'cruise', 'Toggle cruise.'),
    power('travelBurn', 'TRAVEL', 'boost', 'Toggle the travel-drive latch.'),
    power('bulletTime', 'SLOW TIME', 'time', 'Toggle the mobile time-dilation hold; the meter still applies.', 'toggle'),
    power('jettisonLot', 'JETTISON', 'jettison', 'Jettison a cargo lot. This changes your cargo.'),
    power('dock', 'DOCK', 'dock', 'Dock or activate the current station prompt.', 'ui'),
  ] },
  { name: 'Navigation', powers: [
    power('localmap', 'LOCAL MAP', 'map', 'Open the local map.', 'ui'),
    power('starmap', 'STAR MAP', 'star', 'Open the star map.', 'ui'),
    power('missionLog', 'MISSIONS', 'log', 'Open the mission log.', 'ui'),
    power('pause', 'PAUSE', 'pause', 'Open the pause menu.', 'ui'),
    power('help', 'TOUCH GUIDE', 'help', 'Pause and read the touch controls.', 'ui'),
    power('fullscreen', 'FULLSCREEN', 'full', 'Request fullscreen when supported. Optional.', 'ui'),
  ] },
]);
export const ALL_POWERS = POWER_PAGES.flatMap(p => p.powers);
const paths = {
  gun: 'M5 9h13l3 3-3 3h-5l-2 6H7l1-7H5z M18 9V5 M21 8V5',
  tether: 'M4 19l7-7 M8 8a5 5 0 1 1 8 8 M16 4l4 4 M2 16l6 6',
  charge: 'M8 6h8v13H8z M10 3h4 M11 10l3 2-3 3',
  blast: 'M12 2l2 6 6-3-3 6 5 3-7 1 1 7-5-5-6 4 2-7-5-3 7-1z',
  bomb: 'M15 5l3-3 M17 2h4 M9 6h6v3 M18 15a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  cycle: 'M4 9a8 8 0 0 1 14-3l3 3 M21 3v6h-6 M20 15a8 8 0 0 1-14 3l-3-3 M3 21v-6h6',
  decoy: 'M12 3v7 M3 12h7 M14 12h7 M12 14v7 M5 5l4 4 M15 15l4 4 M5 19l4-4 M15 9l4-4',
  cloak: 'M3 12s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7 M3 21L21 3',
  seed: 'M12 2l7 10-7 10-7-10z M12 7v10 M8 12h8',
  well: 'M20 12a8 8 0 1 1-8-8 6 6 0 1 1-6 6 4 4 0 1 1 4 4',
  repel: 'M12 8v8 M8 12h8 M2 12l4-4 M2 12l4 4 M22 12l-4-4 M22 12l-4 4',
  cone: 'M3 12l18-9v18z M11 8v8 M16 5v14',
  skim: 'M3 5l4 13h10l4-13 M6 13h12 M9 8h6 M9 21h6',
  beacon: 'M12 7v15 M8 22h8 M8 4a6 6 0 0 0 0 9 M16 4a6 6 0 0 1 0 9 M4 1a10 10 0 0 0 0 15 M20 1a10 10 0 0 1 0 15',
  scan: 'M12 12l8-8 M12 3a9 9 0 1 0 9 9 M12 8a4 4 0 1 0 4 4',
  cruise: 'M3 7l7 5-7 5 M10 7l7 5-7 5 M20 5v14',
  boost: 'M3 8l7 4-7 4 M10 8l7 4-7 4 M17 8l5 4-5 4',
  time: 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9 M12 6v7l4 2',
  jettison: 'M4 6h9v12H4z M15 12h7 M18 8l4 4-4 4',
  dock: 'M3 4h5v16H3 M21 4h-5v16h5 M8 12h8 M10 9l3 3-3 3',
  map: 'M3 5l6-2 6 3 6-2v16l-6 2-6-3-6 2z M9 3v16 M15 6v16',
  star: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  log: 'M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  help: 'M8 8a4 4 0 1 1 7 3l-3 2v3 M12 20v1',
  full: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name] || paths.star}"/></svg>`;
}
