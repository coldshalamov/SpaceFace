// Authored equipment silhouettes for the Crucible. These are SVG source assets, not an icon font.
// Every object shares a 128-unit optical frame; silhouettes describe a FUNCTION, not a fictional
// model render. Known hulls continue to use their produced hull posters. No fetch or render loop.
const p = (d, fill = false) => ({ tag: 'path', d, ...(fill ? { fill: 'currentColor', 'fill-opacity': '.12' } : {}) });
const c = (cx, cy, r) => ({ tag: 'circle', cx, cy, r });
export const EQUIPMENT_GLYPHS = Object.freeze({
  cannon: [p('M26 43 44 34 78 34 88 44 88 81 78 94 42 94 26 81Z', true), p('M43 34V22H57V34 M69 34V16H81V36 M37 52H79V76H37Z M45 82V94 M66 82V94 M88 50H101V71H88 M27 56H18V75H27'), p('M48 57V71 M60 57V71 M72 57V71 M48 103H70 M54 111H64')],
  rail: [p('M38 89V35L50 19H60V76H68V19H78L90 35V89L79 103H49Z', true), p('M47 39V79 M81 39V79 M39 88H90 M52 95H76 M63 11V57 M62 110H68 M30 48H21 M98 48H107')],
  laser: [p('M41 91 32 76V50L43 38H54V24H74V38H85L96 50V76L87 91Z', true), c(64, 64, 19), c(64, 64, 9), p('M64 12V24 M51 14V21 M77 14V21 M32 58H20V72H32 M96 58H108V72H96 M53 91V104H75V91 M61 52V76 M52 64H76')],
  beam: [p('M32 85V44L45 33H83L96 44V85L84 99H44Z', true), p('M50 83V47H60V83 M69 83V47H79V83 M64 7V35 M54 10V28 M74 10V28 M26 54H16 M26 69H16 M102 54H112 M102 69H112 M47 91H81')],
  arc: [p('M33 91 23 70 38 39 49 48 40 70 48 83H80L88 70 79 48 90 39 105 70 95 91Z', true), p('M74 12 51 42H69L54 71 86 34H66Z M50 92V105H78V92 M29 67H42 M86 67H99')],
  missile: [p('M54 31 64 14 74 31V81L64 96 54 81Z', true), p('M54 60 40 75V94L55 82 M74 60 88 75V94L73 82 M57 37H71 M59 47H69 M58 105V114 M70 105V114 M33 27V58 M26 34 33 27 40 34 M95 40V64 M89 46 95 40 101 46')],
  mine: [p('M44 40 84 40 97 58V78L81 96H47L31 78V58Z', true), c(64, 67, 17), c(64, 67, 7), p('M50 40 44 25H35 M78 40 84 25H93 M33 55 18 50V37 M95 55 110 50V37 M34 83 21 96V106 M94 83 107 96V106 M53 97V112 M75 97V112')],
  tether: [p('M41 93V78L53 66H74L87 78V93L76 105H52Z', true), c(64, 86, 9), p('M64 76V48 M64 48C40 47 34 34 44 22 M64 48C88 47 94 34 84 22 M44 22 44 36 M84 22 84 36 M57 62 71 57 57 52 M33 87H22 M95 87H106')],
  web: [p('M37 84 47 98H81L91 84 81 68H47Z', true), p('M64 68V22 M38 70 24 36 64 22 104 36 90 70 M24 36 64 48 104 36 M38 70 64 48 90 70 M45 28 64 48 83 28 M64 48V22 M51 81H77 M53 90H75 M56 105V113 M72 105V113')],
  gravity: [c(64, 55, 27), c(64, 55, 13), p('M36 88H92L83 104H45Z', true), p('M64 15V30 M64 78V88 M25 55H40 M88 55H103 M44 35 36 27 M84 35 92 27 M45 76 36 84 M83 76 92 84 M59 50 64 46 69 50 69 60 64 64 59 60Z')],
  repulsor: [p('M47 79 40 64 47 49H81L88 64 81 79Z', true), c(64, 64, 8), p('M32 44Q15 64 32 84 M22 34Q-1 64 22 94 M96 44Q113 64 96 84 M106 34Q129 64 106 94 M47 79V94H81V79 M54 94V106H74V94 M54 49V37H74V49 M64 26V16')],
  ricochet: [p('M30 103V81L47 65 66 84 51 103Z', true), p('M51 72 86 37H108 M80 22H108V50 M54 43 69 28 M72 84 93 63 M81 93 111 63 M40 89 46 95 M18 111 27 102'), c(66, 57, 4)],
  shield: [p('M64 17 98 33V62Q97 87 64 110Q31 87 30 62V33Z', true), p('M64 30 87 42V63Q85 82 64 97Q43 82 41 63V42Z M64 43V82 M49 62H79 M20 42V61 M108 42V61')],
  armor: [p('M44 23H84L96 45 86 61 97 82 81 105H47L31 82 42 61 32 45Z', true), p('M44 23 54 46H74L84 23 M42 61H86 M54 46 47 62 55 84H73L81 62 74 46 M47 105 55 84 M81 105 73 84 M20 46V81 M108 46V81')],
  engine: [p('M44 22H84L94 38V80L84 92H44L34 80V38Z', true), p('M44 37H84V73H44Z M47 92 51 102H77L81 92 M52 45V66 M64 45V66 M76 45V66 M55 108V119 M64 108V124 M73 108V119 M26 46H18V75H26 M102 46H110V75H102')],
  reactor: [p('M41 29H87L101 53V80L87 104H41L27 80V53Z', true), c(64, 65, 24), c(64, 65, 13), p('M69 48 54 67H66L59 83 77 60H65Z M44 30 49 17H79L84 30 M28 54H16 M100 54H112 M28 80H16 M100 80H112')],
  cooler: [p('M32 35 44 23H84L96 35V93L84 105H44L32 93Z', true), p('M44 35V93 M54 35V93 M64 35V93 M74 35V93 M84 35V93 M20 50V79 M108 50V79 M47 12H80 M47 116H80')],
  repair: [p('M36 37H92L103 49V94L91 105H37L25 94V49Z', true), p('M46 37V23H82V37 M39 54H89 M57 64H71V74H81V88H71V98H57V88H47V74H57Z M25 62H17V84H25 M103 62H111V84H103')],
  ammo: [p('M30 98V43L39 28 48 43V98Z M55 98V31L64 16 73 31V98Z M80 98V43L89 28 98 43V98Z', true), p('M30 50H48 M55 38H73 M80 50H98 M30 88H48 M55 88H73 M80 88H98 M24 106H104')],
  drone: [p('M49 47 64 35 79 47V72L64 83 49 72Z', true), p('M49 51 32 40 19 45V61L31 66 49 64 M79 51 96 40 109 45V61L97 66 79 64 M54 79 43 93H29 M74 79 85 93H99 M31 29V75 M97 29V75'), c(64, 58, 9), p('M53 100 64 110 75 100')],
  cargo: [p('M30 34 47 21H82L99 34V92L83 106H46L30 92Z', true), p('M30 34 46 47H82L99 34 M46 47V106 M82 47V106 M55 57H73V77H55Z M30 82 46 92H82L99 82 M56 94H72')],
  mining: [p('M40 87 53 101H78L91 88 83 72H48Z', true), p('M48 72 34 59 44 42 71 16 82 27 65 60 76 72 M43 43 66 56 M52 33 71 45 M61 24 76 36 M101 31 112 20 M99 48H115 M92 19V6 M52 86H77')],
  sensor: [p('M37 96H91L80 110H48Z', true), p('M64 96V71 M31 37Q24 78 67 83L95 54Z M47 53 78 22 M69 22H78V31 M88 16Q107 25 113 44 M89 29Q98 33 102 43'), c(50, 57, 7)],
  hull: [p('M64 13 80 44 87 71 103 96 82 89 73 110H55L46 89 25 96 41 71 48 44Z', true), p('M64 33 71 49V69H57V49Z M47 58V84L57 94 M81 58V84L71 94 M56 104H72 M17 55H33 M95 55H111')],
  module: [p('M41 30H87L98 41V87L87 98H41L30 87V41Z', true), p('M45 45H83V83H45Z M54 54H74V74H54Z M48 18V30 M64 18V30 M80 18V30 M48 98V110 M64 98V110 M80 98V110 M18 48H30 M18 64H30 M18 80H30 M98 48H110 M98 64H110 M98 80H110')],
  swarm: [p('M64 22 74 41 64 48 54 41Z M30 48 40 67 30 74 20 67Z M98 48 108 67 98 74 88 67Z M48 83 58 102 48 109 38 102Z M80 83 90 102 80 109 70 102Z', true), p('M42 35 34 24 M86 35 94 24 M64 59V79 M17 90 26 86 M111 90 102 86')],
  gauntlet: [p('M64 16 88 34V60L78 79 64 89 50 79 40 60V34Z', true), p('M52 90V105H76V90 M41 111H87 M40 37H25V51Q25 75 47 75 M88 37H103V51Q103 75 81 75 M64 33 68 46 82 46 71 55 75 69 64 61 53 69 57 55 46 46 60 46Z')],
  block: [p('M30 32H58V60H30Z M70 32H98V60H70Z M30 72H58V100H30Z M70 72H98V100H70Z', true), p('M22 18H44 M106 18H84 M22 112H44 M106 112H84 M44 45V49 M84 45V49 M44 85V89 M84 85V89')],
});

/** A semantic family, resolved from the actual catalog identity, never a display-text hash. */
export function equipmentKind(spec = {}) {
  if (typeof spec === 'string') spec = { defId: spec };
  const id = String(spec.defId || spec.id || '').toLowerCase();
  if (spec.kind === 'hull' || /^ship_|^hull:/.test(id)) return 'hull';
  if (spec.ruleset === 'swarm') return 'swarm';
  if (spec.ruleset === 'scored' || spec.ruleset === 'boss_circuit') return 'gauntlet';
  if (spec.ruleset === 'block') return 'block';
  for (const [pattern, kind] of [
    [/repair|weld|patch|medic/, 'repair'], [/ammo|charge|supply|ordnance/, 'ammo'],
    [/cool|thermal|radiator/, 'cooler'], [/engine|thruster|afterburn|drive|rcs/, 'engine'],
    [/sensor|radar|scanner|target|ecm|chaff|decoy/, 'sensor'],
    [/snarl|web|filament/, 'web'], [/tether|massline|whip|harpoon|grapple/, 'tether'],
    [/ricochet|bank_shot|bank_stream|carom/, 'ricochet'], [/rail|spinal/, 'rail'],
    [/repuls|concussion|momentum|shove/, 'repulsor'], [/gravity|singularity|well|sink/, 'gravity'],
    [/missile|rocket|torpedo/, 'missile'], [/mine|trap/, 'mine'], [/arc|ion|lightning|tesla/, 'arc'],
    [/beam|lance/, 'beam'], [/laser|pulse|plasma/, 'laser'], [/cannon|flak|gatling|slug|scatter/, 'cannon'],
    [/shield|screen|aegis/, 'shield'], [/armor|hullplate|bulkhead/, 'armor'],
    [/engine|thruster|afterburn|booster|drive/, 'engine'], [/reactor|capacitor|energy/, 'reactor'],
    [/cool|thermal|heat|radiator/, 'cooler'], [/drone|wingman|sentry/, 'drone'],
    [/cargo|hold|bay/, 'cargo'], [/mining|drill|extract|prospect/, 'mining'],
    [/sensor|radar|scanner|target|ecm|chaff|decoy/, 'sensor'],
  ]) if (pattern.test(id)) return kind;
  if (id === 'weapon') return 'cannon';
  if (id === 'engine') return 'engine';
  return ({ Weapons: 'cannon', Defense: 'shield', Motion: 'engine', Bay: 'cargo',
    Prospecting: 'mining', Hulls: 'hull', Service: 'repair' })[spec.category] || 'module';
}

/** Decorative by design: the surrounding control always supplies the item name and fit. */
export function equipmentSvg(spec = {}, doc = globalThis.document) {
  if (!doc || typeof doc.createElementNS !== 'function') return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  const kind = equipmentKind(spec);
  for (const [key, value] of Object.entries({ viewBox: '0 0 128 128', class: 'orr-equipment-glyph',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round',
    'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false', 'data-glyph': kind })) svg.setAttribute(key, value);
  for (const { tag, ...attrs } of EQUIPMENT_GLYPHS[kind]) {
    const node = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.appendChild(node);
  }
  return svg;
}
