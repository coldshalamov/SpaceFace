// Authored sigils for the Crucible door's character select. Each starter build and each swarm
// stake gets its own mark so a roster of ten builds never reads as ten copies of one hull render.
// Same contract as equipmentGlyphs.js: SVG source data (not an icon font), a shared 128-unit
// optical frame, a filled body under detail strokes, currentColor throughout, no fetch or render
// loop. The mark describes the build's FUNCTION (the way it fights), not the hull it rides —
// seven of the ten starters share two hulls, so the hull render cannot be their face.
const p = (d, fill = false) => ({ tag: 'path', d, ...(fill ? { fill: 'currentColor', 'fill-opacity': '.12' } : {}) });
const c = (cx, cy, r) => ({ tag: 'circle', cx, cy, r });

/** One sigil per starter package id (src/data/combatLabSetups.js). */
export const BUILD_SIGILS = Object.freeze({
  // Web Weaver — a loom under tension: warp lines converging on a caught shuttle.
  web_weaver: [
    p('M26 96 64 78 102 96 64 114Z', true),
    p('M64 78V26 M40 84 30 24 M88 84 98 24 M52 80 44 26 M76 80 84 26 M28 44 64 58 100 44 M34 64 64 74 94 64 M64 58 46 50 M64 58 82 50'),
    c(64, 26, 5),
  ],
  // Ricochet Runner — one line of travel banking off three walls into a head.
  ricochet_runner: [
    p('M24 104 50 78 74 102 100 76', true),
    p('M22 30V52 M22 30H44 M106 22V44 M106 22H84 M24 96 56 62 84 90 100 74 M100 74 92 72 M100 74 98 82 M52 62 44 64 M52 62 50 54'),
    c(56, 62, 4),
  ],
  // Baseline Energy — two capacitor plates with a steady field held between.
  energy_baseline: [
    p('M30 46H50V82H30Z M78 46H98V82H78Z', true),
    p('M40 30V40 M88 30V40 M40 88V98 M88 88V98 M56 52 72 64 56 76 M24 64H32 M96 64H104'),
  ],
  // Baseline Kinetic — a slug seated in a rail channel, primed.
  kinetic_baseline: [
    p('M40 50H74L88 64 74 78H40Z', true),
    p('M24 36H104 M24 92H104 M24 36V50 M104 36V50 M24 78V92 M104 78V92 M56 64H70 M30 64H38 M90 64H98'),
  ],
  // Physics Toolkit — a mass orbiting a well: two tracks, one bead, one fall line.
  physics_toolkit: [
    p('M64 70 52 96 76 96Z', true),
    c(64, 62, 42), c(64, 62, 24), c(64, 62, 7),
    p('M64 20V32 M64 92V104 M22 62H34 M94 62H106 M35 33 43 41 M93 33 85 41 M35 91 43 83 M93 91 85 83'),
    c(97, 45, 6),
  ],
  // Massline Rig — a winch drum paying line out to a hanging hook.
  massline_rig: [
    p('M36 44H78V84H36Z', true),
    p('M44 44V84 M56 44V84 M68 44V84 M78 58H92 M92 58V34 M92 34 100 26 M92 34 100 42 M100 26V50 M92 58 100 50 M84 100 96 112 108 100 M96 84V112 M28 30H86'),
  ],
  // Storm Carom Forge — an anvil under a held arc bolt: the forge that banks storms.
  storm_carom_forge: [
    p('M40 72H88L80 84H48Z M52 84H76L72 100H56Z', true),
    p('M34 72 26 60H102L94 72 M32 108H96 M74 22 60 42H74L56 64 M40 30 34 24 M88 30 94 24 M30 46H22 M98 46H106'),
  ],
  // Bolt — a dart committed to one wide bank: speed, wide turns.
  hornet_fast_clumsy: [
    p('M30 84 64 44 98 84 64 70Z', true),
    p('M64 70V30 M46 52 34 38 M82 52 94 38 M28 96 44 90 M100 96 84 90 M50 100 64 94 78 100'),
  ],
  // Hinge — two plates rotating on one pin: nimble, deliberate.
  hornet_nimble_slow: [
    p('M28 34 60 50V78L28 94Z M100 34 68 50V78L100 94Z', true),
    p('M60 50 68 50 M60 78 68 78 M22 64H28 M100 64H106 M44 58 48 70 M84 58 80 70'),
    c(64, 64, 6),
  ],
  // Mirror Demonstrator — one course split round a mirror plane: symmetric, deliberate.
  mirror_demonstrator: [
    p('M60 20H68V108H60Z', true),
    p('M16 64H54 M72 58 98 32 M72 70 98 96 M98 32 104 38 92 44 M98 96 104 90 92 84 M54 58 60 64 54 70'),
    c(64, 64, 4),
  ],
});

/** One mark per swarm stake id (src/data/swarmStakes.js): a service ladder of chevrons. */
export const STAKE_MARKS = Object.freeze({
  // Exhibition — one chevron at rest on a plinth: the display bout.
  exhibition: [
    p('M64 34 88 60H40Z', true),
    p('M64 50V78 M46 92H82 M38 102H90'),
  ],
  // Contender — two chevrons: the tuned baseline.
  contender: [
    p('M64 24 88 48H40Z M64 54 88 78H40Z', true),
    p('M46 92H82 M38 102H90'),
  ],
  // Veteran — three chevrons and a notched tally bar.
  veteran: [
    p('M64 16 84 36H44Z M64 42 84 62H44Z M64 68 84 88H44Z', true),
    p('M36 100H92 M36 100V94 M52 100V96 M68 100V94 M84 100V96'),
  ],
  // Ironbound — a riveted frame: nothing gives, nothing is given back.
  ironbound: [
    p('M38 30H90L98 44V72L64 102 30 72V44Z', true),
    p('M30 44H98 M64 102V44 M38 30 38 44 M90 30 90 44 M42 84H86'),
    c(38, 37, 3), c(90, 37, 3), c(38, 72, 3), c(90, 72, 3),
  ],
});

/**
 * Decorative by design, like equipmentSvg: the surrounding control supplies the name and terms.
 * Returns null without a capable document so headless callers keep their plain path.
 */
export function sigilSvg(marks, key, doc = globalThis.document, className = 'orr-sigil') {
  const mark = key && marks[key];
  if (!mark || !doc || typeof doc.createElementNS !== 'function') return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svgNode = doc.createElementNS(ns, 'svg');
  for (const [attr, value] of Object.entries({ viewBox: '0 0 128 128', class: className,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round',
    'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false', 'data-sigil': key })) {
    svgNode.setAttribute(attr, value);
  }
  for (const { tag, ...attrs } of mark) {
    const node = doc.createElementNS(ns, tag);
    for (const [attr, value] of Object.entries(attrs)) node.setAttribute(attr, String(value));
    svgNode.appendChild(node);
  }
  return svgNode;
}
