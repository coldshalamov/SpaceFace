// Profile bindings for the ten scenes the public lab run operates.
// The sentences are not captures. Operability is runLabScenario on each id.

export const PRESENTATION_SCENES = Object.freeze([
  row('cf.reel-berth', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyQ reel']),
  row('cf.tow-light', ['ship.starter', 'asteroid.light'], ['KeyF hold', 'KeyQ reel']),
  row('cf.swing-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF tap']),
  row('cf.payout-strand', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyE payout', 'thrust']),
  row('cf.cut-into-pod', ['ship.starter', 'asteroid.heavy', 'asteroid.light'], ['KeyF tap']),
  row('cf.boost-arrest', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'boost', 'thrust']),
  row('cf.taut-catch', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.orbit-hold', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.boost-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'boost', 'KeyF tap']),
  row('cf.moving-fire', ['ship.starter', 'wasp_swarmer'], ['thrust', 'fire']),
]);

function row(id, profiles, controls) {
  return Object.freeze({
    id,
    profiles: Object.freeze(profiles),
    controls: Object.freeze(controls),
  });
}

export const PRESENTATION_IDS = Object.freeze(PRESENTATION_SCENES.map((row) => row.id));
