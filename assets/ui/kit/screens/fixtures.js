/* fixtures.js — every string the prototypes show, as data.
 *
 * All of it is verbatim from `_COMMON/01_GAME_DOSSIER.md` §4. Nothing here is invented: no
 * menu item, no number, no place name. A classic script rather than JSON, because the
 * prototypes open from `file://` where `fetch` of a local file is blocked.
 */
window.FIXTURES = {
  title: {
    wordmark: 'SPACEFACE',
    status: 'CONTRACT 47-A REMAINS OPEN',
    save: 'No save found - New Game opens Contract 47-A in Helios.',
    version: 'v0.9.4 · build 2026.09.10',
    menu: [
      { label: 'NEW GAME', focused: true },
      { label: 'CONTINUE', disabled: true },
      { label: 'LOAD GAME' },
      { label: 'SETTINGS' },
      { label: 'CRUCIBLE' },
      { label: 'SIGNAL ARCHIVE' },
      { label: 'QUIT GAME' },
    ],
  },

  crucible: {
    title: 'Crucible',
    tagline: 'Bring the swarm. Turn the room against it.',
    rows: [
      {
        key: 'mode',
        legend: 'Mode',
        blurb: 'Clear a round. Spend the spoils or save for a bigger toy. Push your build as far as it goes.',
        aside: 'No ghost for this seed yet.',
        selected: 'Swarm',
        items: [
          { label: 'Swarm', mark: 'mark-swarm' },
          { label: 'Gauntlet', mark: 'mark-gauntlet' },
          { label: 'Daily', mark: 'mark-daily' },
          { label: 'Weekly', mark: 'mark-weekly' },
          { label: 'Ghost', mark: 'mark-ghost' },
        ],
      },
      {
        key: 'build',
        legend: 'Starter build',
        blurb: 'Bank a stream of bullets around cover. Shove the pack into the rocks, then boost through.',
        selected: 'Ricochet Runner',
        items: [
          { label: 'Web Weaver', icon: 'line' },
          { label: 'Ricochet Runner', icon: 'boost' },
          { label: 'Baseline Energy', icon: 'energy' },
          { label: 'Baseline Kinetic', icon: 'munitions' },
          { label: 'Physics Toolkit', icon: 'well' },
          { label: 'Massline Rig', icon: 'tow' },
        ],
      },
      {
        key: 'arena',
        legend: 'Arena',
        blurb: 'Hard banks, tight gaps and moving machinery. Turn pursuit into a pile-up.',
        selected: 'Ricochet Foundry',
        items: [
          { label: 'Ricochet Foundry', mark: 'mark-ricochet-foundry' },
          { label: 'Lagrange Crucible', mark: 'mark-lagrange-crucible' },
          { label: 'Cinder Sluice', mark: 'mark-cinder-sluice' },
          { label: 'Cryo Drift', mark: 'mark-cryo-drift' },
          { label: 'Storm Lattice', mark: 'mark-storm-lattice' },
        ],
      },
    ],
    seed: '4242',
    newSeed: 'New seed',
    records: 'Records & challenges',
    launch: 'Launch Swarm',
    back: 'Back',
  },

  hud: {
    tip: 'Light ships are ammunition. Swing a rock. Keep the speed.',
    band: 'BAND OFF ---',
    law: {
      legend: 'SECTOR LAW',
      level: 'HIGH SECURITY',
      place: 'HELIOS PRIME',
      jurisdictionLegend: 'JURISDICTION',
      jurisdiction: 'SOLAR CONCORD NAVY',
      line: 'Attacking civilians, patrols, or stations triggers dispatch. Rapid patrol response; reserve units available.',
      wantedLevel: 'WANTED',
    },
    contacts: {
      header: 'Local contacts 21',
      rows: [
        { cls: 'derelict', name: 'Derelict', dist: '222', bearing: '▸ 20', tag: '??? UNSCANNED' },
        { cls: 'freighter', name: 'Relief-Freighter', dist: '708', tag: 'DERELICT' },
        { cls: 'wreck', name: 'Hull section', dist: '914', tag: 'WRECK' },
        { cls: 'asteroid', name: 'Ore body', dist: '1,204', tag: 'RAW ORE' },
      ],
      footer: '+17 · 5 WRECKS · 12 OTHER',
    },
    status: { legend: 'STATUS', value: 0, total: 10 },
    bandTabs: ['BAND', 'COMMS', 'HAIL —'],
    log: 'LOG KESSLER — Kestrel, that pulse is the job. Tag the sealed mass. Do not open it.',
    objective: {
      line: 'Recover the 47-A sample from the marked rock',
      meta: '47-A Recovery Site · 679 WU · ETA 7s',
    },
    ship: { energyLegend: 'ENERGY', energy: 80, driveLegend: 'DRIVE', drive: 100 },
    speed: { value: 95, weaponsLegend: 'weapons', weapons: 'Pulse Laser S',
             classLegend: 'class', cls: 'Hitch · Starter · Reaction' },
    actions: [
      { group: 'ORDNANCE', slots: [
        { key: 'Y', icon: 'fire', state: 'lit' },
        { key: 'R', icon: 'lock', state: 'rest' },
        { key: 'SPACE', icon: 'boost', state: 'rest' },
        { key: 'LINE', icon: 'line', state: 'cooling' }] },
      { group: 'FIELDWORK', slots: [
        { key: '4 SEED', icon: 'seed', state: 'rest' },
        { key: '5 WELL', icon: 'well', state: 'rest' },
        { key: '6 REPEL', icon: 'repel', state: 'rest' }] },
      { group: 'RIG', slots: [
        { key: '7 CONE', icon: 'cone', state: 'locked' },
        { key: '8 SKIM', icon: 'skim', state: 'rest' }] },
    ],
    radar: {
      north: 'N', range: 'RANGE 4.0K', you: 'YOU',
      contacts: [
        { cls: 'derelict', x: 0.30, y: 0.46 },
        { cls: 'freighter', x: -0.52, y: 0.10 },
        { cls: 'wreck', x: -0.16, y: 0.62 },
        { cls: 'asteroid', x: -0.24, y: -0.56 },
        { cls: 'station', x: 0.63, y: -0.12 },
        { cls: 'patrol', x: 0.44, y: 0.28 },
        { cls: 'you', x: 0, y: 0 },
      ],
      wantedContacts: [
        { cls: 'patrol', x: 0.44, y: 0.28, hostile: true },
        { cls: 'patrol', x: 0.21, y: 0.55, hostile: true },
        { cls: 'pirate', x: -0.38, y: -0.30, hostile: true },
        { cls: 'derelict', x: 0.30, y: 0.46 },
        { cls: 'asteroid', x: -0.24, y: -0.56 },
        { cls: 'you', x: 0, y: 0 },
      ],
    },
    corner: 'OBJ 679U · HELIOS PRIME',
    worldTag: 'Payload · TOW · 69% · READY',
  },
};
