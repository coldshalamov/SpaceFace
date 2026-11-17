// The armory shows the committed build. Inspecting an offer never changes this stage.
// Keep its extra WebGL context out of combat and prewarmed hidden screens.
import { createStageHull } from '../screens/stageHull.js';
import { swarmPreviewFitFromRows } from './swarmHangarModel.js';
import { SHIPS } from '../../data/ships.js';

const hulls = new Map(SHIPS.map(ship => [ship.id, ship]));

export function createSwarmArmoryShipPreview({
  host, name, note, motionReduced = () => false, stageFactory = createStageHull,
} = {}) {
  let stage = null, active = false, disposed = false, snapshot = null, shownKey = null;
  let released = false;
  function paint() {
    if (!active || disposed || !snapshot) return;
    if (!stage) stage = stageFactory(host, { dock: false, live: true });
    if (released) { stage.restore(); released = false; shownKey = null; }
    if (snapshot.key !== shownKey) {
      const preserveView = shownKey !== null && host.dataset.hullId === snapshot.hullId;
      host.dataset.hullId = snapshot.hullId;
      stage.show(snapshot.hullId, { ...snapshot.fit, preserveView });
      shownKey = snapshot.key;
    }
    stage.activate({ state: { settings: { video: { motionReduce: motionReduced() } } } });
  }
  return {
    show(hullId, rows) {
      if (disposed) return;
      const hull = hulls.get(hullId);
      const fit = swarmPreviewFitFromRows(hullId, rows);
      if (!hull || !fit) return;
      const key = JSON.stringify([hullId, fit.fittings, fit.weapons]);
      snapshot = { hullId, fit, key };
      name.textContent = hull.name;
      const equipped = fit.fittings.filter(Boolean).length;
      const intrinsicWeapons = fit.weapons.filter(weapon => weapon.intrinsic).length;
      const fittedWeapons = fit.weapons.length - intrinsicWeapons;
      note.textContent = `${equipped} installed ${equipped === 1 ? 'item' : 'items'}`
        + (fittedWeapons ? ` · ${fittedWeapons} ${fittedWeapons === 1 ? 'weapon' : 'weapons'}` : '')
        + (intrinsicWeapons ? ` · ${intrinsicWeapons} built-in ${intrinsicWeapons === 1 ? 'weapon' : 'weapons'}`
          : !fittedWeapons ? ' · No weapons fitted' : '');
      host.setAttribute('aria-label', `${hull.name}, current installed equipment`);
      paint();
    },
    setActive(value) {
      if (disposed) return;
      active = !!value;
      if (!active) {
        stage?.deactivate();
        if (stage && !released) { stage.release(); released = true; }
      } else paint();
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; snapshot = null;
      stage?.dispose(); stage = null;
    },
  };
}
