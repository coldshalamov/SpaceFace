// The Bolus's throat is an existing render-owned machine, not a sim actor. Give
// that same presenter a private recorded facade; never transplant the live scene.
import { syncBolusView, disposeBolusView } from './bolusView.js';

export function createReplayEnvironment(root, tape, film) {
  const frames = tape.scenes || [];
  if (!frames.some((frame) => frame.sectorId === 'sector_the_bolus')) return null;
  const playerTrack = film.ships.find((row) => row.ship.player);
  const player = { id: 'replay-pilot', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {} };
  const emptyFlags = {};
  const state = { meta: { seed: tape.seed }, entities: new Map([[player.id, player]]),
    entityList: [player], playerId: player.id, simTime: 0,
    world: { currentSectorId: null, alienEcology: { sectorFlags: emptyFlags } } };
  const owner = { scene: root, state };
  let cursor = 0;
  const environment = {
    update(sample) {
      while (cursor > 0 && frames[cursor].sample > sample) cursor--;
      while (cursor + 1 < frames.length && frames[cursor + 1].sample <= sample) cursor++;
      const frame = frames[cursor];
      state.world.currentSectorId = frame.sectorId;
      state.simTime = frame.simTime + (sample - frame.sample) / tape.sampleRate;
      state.world.alienEcology.sectorFlags = frame.bolusFlags || emptyFlags;
      if (playerTrack) {
        const ship = playerTrack.ship;
        const at = Math.max(0, Math.min(ship.n - 1, sample - ship.b));
        const lo = Math.floor(at), hi = Math.min(ship.n - 1, lo + 1), alpha = at - lo;
        player.pos.x = ship.x[lo] + (ship.x[hi] - ship.x[lo]) * alpha;
        player.pos.z = ship.z[lo] + (ship.z[hi] - ship.z[lo]) * alpha;
        player.vel.x = (ship.x[hi] - ship.x[lo]) * tape.sampleRate;
        player.vel.z = (ship.z[hi] - ship.z[lo]) * tape.sampleRate;
      }
      syncBolusView(owner);
    },
    dispose() { disposeBolusView(owner); },
  };
  // Admit and compile the whole machine with the stage, before its first frame.
  environment.update(frames[0].sample);
  return environment;
}
