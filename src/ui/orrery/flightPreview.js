// ORRERY Phase 0a direction proof (design/frontend/ORRERY.md §7): the whole flight HUD composed
// from the library over a real frame of the game, with the values a player sees in the 47-A opening.
// The bench mounts it as `--shot=orrery-flight`; the live HUD adopts the same instruments in Phase 1.
import { injectOrrery } from './tokens.js';
import { createFlightCluster } from './flightCluster.js';
import {
  createRadarOrrery, createObjectiveTape, createLockRing, createThreatChannel, createSignalToasts, createPlaceBlock,
} from './flightInstruments.js';

const STYLE_ID = 'sf-orrery-flightpreview-style';
const CSS = `
.orr-flightpreview { position:fixed; inset:0; z-index:40; pointer-events:none; overflow:hidden; font-family:var(--dp-face-read, "Instrument Sans"); }
.orr-flightpreview__place { position:absolute; left:40px; top:34px; }
.orr-flightpreview__tape { position:absolute; left:50%; top:26px; transform:translateX(-50%); }
.orr-flightpreview__toasts { position:absolute; right:32px; top:168px; }
.orr-flightpreview__cluster { position:absolute; left:18px; bottom:24px; }
.orr-flightpreview__place { left:40px; }
@media (max-width:1700px) { .orr-flightpreview { --orr-cluster-scale:.82; } .orr-radar, .orr-tape { zoom:.86; } }
.orr-flightpreview__radar { position:absolute; right:30px; bottom:18px; }
/* a low vignette only where instruments sit, so they read over bright nebula without any box */
.orr-flightpreview::before { content:""; position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(60% 46% at 0% 100%, rgb(3 4 7 / .62), transparent 70%),
    radial-gradient(34% 40% at 100% 100%, rgb(3 4 7 / .55), transparent 70%),
    radial-gradient(40% 18% at 50% 0%, rgb(3 4 7 / .45), transparent 80%),
    linear-gradient(0deg, rgb(3 4 7 / .45), transparent 22%); }
`;

function injectStyle(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const box = (cls) => {
  const node = globalThis.document.createElement('div');
  node.className = cls;
  return node;
};

export const ORDNANCE_LAYOUT = Object.freeze([
  { name: 'Ordnance', icon: 'weapon', slots: [{ key: 'Y', name: 'Charge', icon: 'munitions' }, { key: 'R', name: 'Blast', icon: 'fire' }, { key: 'SPC', name: 'Line', icon: 'line' }] },
  { name: 'Fieldwork', icon: 'well', slots: [{ key: '4', name: 'Seed', icon: 'seed' }, { key: '5', name: 'Well', icon: 'well' }, { key: '6', name: 'Repel', icon: 'repel' }] },
  { name: 'Rig', icon: 'cone', slots: [{ key: '7', name: 'Cone', icon: 'cone' }, { key: '8', name: 'Skim', icon: 'skim' }] },
  { name: 'Bay', icon: 'munitions', slots: [{ key: '9', name: 'Frag', icon: 'munitions' }] },
]);

export const orreryFlightScreen = {
  mount(root) {
    injectOrrery();
    injectStyle();
    this._root = root;
    const stage = box('orr-flightpreview');
    root.appendChild(stage);

    const place = createPlaceBlock();
    const tape = createObjectiveTape({ width: 640 });
    const toasts = createSignalToasts();
    const cluster = createFlightCluster({ shipId: 'ship_kestrel', name: 'Hitch', classLine: 'Kestrel class · starter', groups: ORDNANCE_LAYOUT });
    const radar = createRadarOrrery({ shipId: 'ship_kestrel', rangeLabel: '4.0k wu' });
    const lock = createLockRing({ hostile: false });
    const threat = createThreatChannel();

    const wrap = (cls, child) => { const b = box(cls); b.appendChild(child); stage.appendChild(b); return b; };
    wrap('orr-flightpreview__place', place.el);
    wrap('orr-flightpreview__tape', tape.el);
    wrap('orr-flightpreview__toasts', toasts.el);
    wrap('orr-flightpreview__cluster', cluster.el);
    wrap('orr-flightpreview__radar', radar.el);
    stage.appendChild(lock.el);
    stage.appendChild(threat.el);

    // --- the 47-A opening, seconds after undock ---------------------------------------------------
    place.set({ place: 'Helios Prime', zone: 'Sector · 47-A recovery site', credits: 14535 });
    tape.setHeading(18);
    tape.setObjective({ kind: 'Contract', text: 'Recover the 47-A sample from the marked rock', bearing: 41, distance: 4100, etaS: 38 });
    cluster.update({
      hull: 86, hullMax: 100, shield: 64, shieldMax: 100, armor: 20, armorMax: 30,
      energy: 80, energyMax: 100, heat: 0.22, speed: 149, speedRef: 180, boost: 0.7, drift: 24,
      tether: { state: 'Payload', mass: 960, strain: 0.62 },
      ordnance: {
        Y: { state: 'armed', count: 3 }, R: { state: 'cooldown', cooldown: 0.55 }, SPC: { state: 'ready' },
        4: { state: 'ready' }, 5: { state: 'cooldown', cooldown: 0.3 }, 6: { state: 'ready' },
        7: { state: 'ready' }, 8: { state: 'locked' }, 9: { state: 'ready', count: 2 },
      },
    });
    radar.setContacts([
      { x: 0.34, y: -0.42, kind: 'objective' },
      { x: 0.62, y: 0.18, kind: 'hostile', heading: -110 },
      { x: 0.7, y: 0.3, kind: 'hostile', heading: -120 },
      { x: 0.1, y: -0.18, kind: 'neutral' }, { x: 0.16, y: -0.12, kind: 'neutral' },
      { x: -0.5, y: 0.52, kind: 'station' }, { x: -0.3, y: -0.62, kind: 'neutral' },
    ]);
    radar.setObjectiveBearing(41);
    lock.set({ x: 991, y: 407, name: 'Hauler 12', detail: 'civil · towing', distance: 1240, hull: 0.82, lead: { x: 26, y: -9 } });
    threat.set({ x: 957, y: 541, bearings: [112, 128] });
    threat.edge(stage, { x: 1884, y: 640, bearing: 90, label: 'Raider · 2.1k', labelSide: 'left' });
    toasts.push({ kind: 'Contract', html: 'Sample located · marked on your chart', delay: 700 });
    toasts.push({ kind: 'Salvage', html: '<b>+240 cr</b> · Hull plating recovered', gain: true, delay: 900 });

    cluster.arrive();
    this._parts = { cluster, radar, lock };
  },
  onShow() {},
  settled() { return new Promise((resolve) => setTimeout(resolve, 1700)); },
  unmount() {
    for (const part of Object.values(this._parts || {})) part.dispose?.();
    if (this._root) this._root.textContent = '';
  },
};
