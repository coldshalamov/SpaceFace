// Top-down presentation bindings for the playable batch.
// Every mesh is an existing lab profile. No new art.

export const PRESENTATION_READS = Object.freeze({
  'cf.reel-berth': read('Ship closes on a heavy pin along +x. The line shortens.', ['ship.starter', 'asteroid.heavy']),
  'cf.swing-cut': read('Ship leaves a curved path and keeps going after the line drops.', ['ship.starter', 'asteroid.heavy']),
  'cf.payout-strand': read('Ship runs -x away from the pin. The gap widens.', ['ship.starter', 'asteroid.heavy']),
  'cf.glancing-pod': read('A light pod peels off the coast line onto a new heading.', ['ship.starter', 'asteroid.light']),
  'cf.heavy-shove': read('Both the hitch and the heavy rock are moving after contact.', ['ship.starter', 'asteroid.heavy']),
  'cf.orbit-hold': read('The hitch is off both axes of its start, still tied to the pin.', ['ship.starter', 'asteroid.heavy']),
  'cf.boost-arrest': read('Boost points away from a fixed pin and does not escape it.', ['ship.starter', 'asteroid.heavy']),
  'cf.wasp-wound': read('The wasp is still there, displaced, with hull missing.', ['ship.starter', 'wasp_swarmer']),
  'cf.tow-light': read('The light pod has moved toward the hitch.', ['ship.starter', 'asteroid.light']),
  'cf.cut-into-pod': read('After the cut, the pod that sat off the straight line is moving.', ['ship.starter', 'asteroid.heavy', 'asteroid.light']),
});

function read(camera, profiles) {
  return Object.freeze({
    camera: 'top-down XZ',
    read: camera,
    profiles: Object.freeze(profiles.slice()),
    newMeshes: 0,
  });
}

export const PRESENTATION_IDS = Object.freeze(Object.keys(PRESENTATION_READS));
