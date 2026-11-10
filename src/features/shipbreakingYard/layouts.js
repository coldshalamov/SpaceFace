/** Three hand-built assembly graphs. Variants mirror the work side and change known condition;
 * they never move the receiver, shuffle rules, or replace a purchased original. */
const frozen = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) frozen(child); Object.freeze(value); } return value; };
export const YARD_ASSETS = frozen({
  frame: { assetId: 'place_aftermath_aft_cockpit_section', file: 'places/place_aftermath_aft_cockpit_section.glb', slot: 'place' },
  engine: { assetId: 'place_aftermath_aft_engine_section', file: 'places/place_aftermath_aft_engine_section.glb', slot: 'place' },
  cargo: { assetId: 'place_aftermath_aft_cargo_module', file: 'places/place_aftermath_aft_cargo_module.glb', slot: 'place' },
  machine: { assetId: 'place_breakaway_sp07', file: 'places/place_breakaway_sp07.glb', slot: 'place' },
  instrument: { assetId: 'place_aftermath_wreck_corvette_turret', file: 'places/place_aftermath_wreck_corvette_turret.glb', slot: 'place' },
  brace: { assetId: 'place_aftermath_aft_weapon_spar', file: 'places/place_aftermath_aft_weapon_spar.glb', slot: 'place' },
  tank: { assetId: 'place_aftermath_aft_pressure_tank', file: 'places/place_aftermath_aft_pressure_tank.glb', slot: 'place' },
});
const m = (id, label, asset, x, z, mass, radius, value, extra = {}) => ({ id, label, ...YARD_ASSETS[asset], x, z, rot: 0, mass, radius, maxHull: 100, value, valueCr: value, commodityId: asset === 'tank' ? 'cmdty_fuel_cells' : asset === 'frame' || asset === 'brace' ? 'cmdty_scrap_metal' : 'cmdty_salvage_electronics', units: 1, role: asset, condition: 1, ...extra });
const c = (id, a, b, label, extra = {}) => ({ id, a, b, label, kind: 'clamp', requiresReleased: [], requiresClear: [], releaseImpulse: 0, ...extra });
export const SHIPBREAKING_LAYOUTS = frozen([
  {
    id: 'lark', name: 'LARK / postal tender', title: 'LARK', difficulty: 'Open work', fee: 80,
    summary: 'A clean outer engine, one cargo saddle, and a light command frame. Room to learn the pull.',
    firstAction: 'Start with the exposed stern engine. Aim and attach a MassLine, scan it, then release its single clamp under a gentle pull. Fly the freed original inside the receiving ring and brake for handover.',
    strategy: 'One connection holds the engine. Release under low strain; the two masses keep their motion. The frame remains worth scrap.',
    modules: [
      m('frame', 'Lark command frame', 'frame', 0, 0, 240, 11, 90),
      m('engine', 'Postal ion drive', 'engine', -30, 0, 65, 8, 260, { beginner: true }),
      m('cargo', 'Sealed mail cassette', 'cargo', 0, 30, 50, 7, 150),
      m('spar', 'Docking saddle', 'brace', 30, 0, 80, 7, 75),
    ],
    couplings: [
      c('engine-clamp', 'frame', 'engine', 'Engine quick clamp'),
      c('cargo-clamp', 'frame', 'cargo', 'Mail saddle clamp'),
      c('spar-clamp', 'frame', 'spar', 'Docking saddle bolts'),
    ],
    hazard: null,
  },
  {
    id: 'bellwether', name: 'BELLWETHER / compact ore hauler', title: 'BELLWETHER', difficulty: 'Crowded work', fee: 250,
    summary: 'A valuable flywheel governor lies inside a cargo cage. Its connected cargo cage crowds the extraction lane; clear the outer cassette before releasing the governor.',
    firstAction: 'Start with the outer cassette: release its saddle, then its cage crossbrace. Fly the freed cassette clear to open the governor lane.',
    strategy: 'Saddle → crossbrace → tow cassette clear. Free the reserve bottle before opening the governor return. The fragile governor comes out last; a hard pull on the heavy frame swings the cage across it.',
    modules: [
      m('frame', 'Hauler keel', 'frame', 0, 0, 360, 10, 140),
      m('cargo', 'Outer ore cassette', 'cargo', 0, 31, 85, 9, 220, { beginner: true }),
      m('brace', 'Cargo cage crossbrace', 'brace', 29, 21, 120, 8, 95),
      m('pump', 'Freight flywheel governor', 'machine', 30, -8, 70, 7, 570, { fragile: true, maxHull: 65 }),
      m('drive', 'Industrial drive bell', 'engine', -31, 0, 155, 10, 320),
      m('tank', 'Reserve pressure bottle', 'tank', 0, -31, 60, 7, 130),
    ],
    couplings: [
      c('cargo-saddle', 'frame', 'cargo', 'Outer cassette saddle'),
      c('cage-crossbrace', 'cargo', 'brace', 'Cargo cage crossbrace', { kind: 'brace', requiresReleased: ['cargo-saddle'], releaseImpulse: 0, warning: 'Under Massline tension this crossbrace can swing the cage across the flywheel. Ease the pull before release.' }),
      c('pump-collar', 'brace', 'pump', 'Governor service collar', { requiresReleased: ['cage-crossbrace'], requiresClear: ['cargo'], warning: 'The cargo cassette still crowds the extraction lane. Tow the cassette clear first.' }),
      c('drive-mount', 'frame', 'drive', 'Drive mounting ring'),
      c('tank-mount', 'frame', 'tank', 'Reserve bottle saddle'),
      c('pump-return', 'tank', 'pump', 'Governor return coupling', { kind: 'service', requiresReleased: ['tank-mount'], warning: 'Free the pressure bottle before opening the return coupling.' }),
    ],
    hazard: null,
  },
  {
    id: 'vesper', name: 'VESPER / quarantine power tender', title: 'VESPER', difficulty: 'Live machinery', fee: 520,
    summary: 'A charged reactor, a pressure bottle and a brittle survey array. Vent the core before taking its support apart.',
    firstAction: 'The outer survey recorder is safe to recover. Inspect the central reactor before touching its coolant coupling.',
    strategy: 'Recorder first is a safe exit. For the core: vent through its service port, tow the coolant bottle clear, remove the shield spar, then release both reactor supports.',
    modules: [
      m('frame', 'Quarantine tender keel', 'frame', 0, 0, 450, 11, 170),
      m('reactor', 'Vesper isotope converter', 'engine', 30, 0, 175, 9, 1100, { hazardous: true, ventAction: 'pressure_vent', fragile: true, maxHull: 80 }),
      m('coolant', 'Charged coolant bottle', 'tank', 30, 30, 80, 7, 240),
      m('shield', 'Reactor shielding spar', 'brace', 6, 24, 140, 8, 180),
      m('recorder', 'Outer survey recorder', 'cargo', -31, 0, 45, 7, 280, { beginner: true, fragile: true, maxHull: 60 }),
      m('array', 'Survey gimbal assembly', 'instrument', -31, -30, 55, 7, 650, { fragile: true, maxHull: 55 }),
    ],
    couplings: [
      c('recorder-clamp', 'frame', 'recorder', 'Survey recorder latch'),
      c('reactor-bed', 'frame', 'reactor', 'Reactor bed clamp', { hazardModuleId: 'reactor', requiresReleased: ['coolant-return'], releaseImpulse: 0, warning: 'Live converter: vent first. A hot separation damages machinery and throws the released mass.' }),
      c('coolant-return', 'reactor', 'coolant', 'Pressurized coolant return', { kind: 'service', hazardModuleId: 'reactor', warning: 'Breaking the live return vents into the work area. Vent the converter through its service port first.' }),
      c('shield-mount', 'frame', 'shield', 'Shielding spar mount', { requiresReleased: ['coolant-return'], requiresClear: ['coolant'] }),
      c('reactor-brace', 'shield', 'reactor', 'Reactor diagonal brace', { kind: 'brace', hazardModuleId: 'reactor', requiresReleased: ['shield-mount'], requiresClear: ['coolant'], releaseImpulse: 0 }),
      c('array-saddle', 'recorder', 'array', 'Survey array saddle', { requiresReleased: ['recorder-clamp'], warning: 'The brittle array shares the recorder frame. Free the recorder clamp before opening this saddle.' }),
    ],
    hazard: { moduleId: 'reactor', actionId: 'pressure_vent', label: 'Charged converter', damage: 22, radius: 54, impulse: 20 },
  },
]);
export const YARD_LAYOUT_IDS = frozen(SHIPBREAKING_LAYOUTS.map(layout => layout.id));
export const SHIPBREAKING_YARD_SITE = frozen({ id: 'ceres:shipbreaking-yard', sectorId: 'sector_ceres_belt', stationId: 'station_ceres', discoveryRange: 560, workRange: 95, receiverRadius: 38, receiverSpeed: 7, receiverOffset: { x: -160, z: 100 }, berthOffsets: [{ x: 0, z: 0 }, { x: 180, z: 0 }, { x: 360, z: 0 }], maxOpenJobs: 3 });
export function yardLayoutById(id) { return SHIPBREAKING_LAYOUTS.find(layout => layout.id === id) || null; }
export function createYardLayout(id, variant = 0) {
  const source = yardLayoutById(id); if (!source) return null;
  const seed = Math.max(0, Math.trunc(Number(variant) || 0));
  const layout = structuredClone(source), mirror = seed % 2 === 0 ? 1 : -1;
  layout.variant = seed; layout.conditionLabel = seed % 3 === 0 ? 'Kept dry' : seed % 3 === 1 ? 'Weathered joints' : 'Hard service';
  layout.modules.forEach((module, index) => { module.z *= mirror; module.rot *= mirror; module.condition = Math.max(.64, 1 - ((seed + index * 3) % 5) * .055); });
  layout.intactValue = layout.modules.reduce((sum, module) => sum + module.value, 0);
  layout.likelyValue = layout.modules.reduce((sum, module) => sum + Math.floor(module.value * module.condition), 0);
  return layout;
}
