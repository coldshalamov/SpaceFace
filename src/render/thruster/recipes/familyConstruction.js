/**
 * PROPULSION CONSTRUCTION VOCABULARY — how each drive family is BUILT, not what colour it is.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every live family already carries its own geometry, flow and timing numbers
 * (`familyRecipes.js`), and the registry's `assertFamiliesStructurallyDistinct` proves those
 * numbers are not a recolour of one another. But the numbers were all inputs to ONE construction:
 * five role shells with one fold pattern, one mouth, one cross-section and one breakup law. Turning
 * those dials made families longer, wider, faster or rougher; it could not make them read as
 * different MACHINES. A wide slow ion drive is still an ion drive with the taps closed.
 *
 * This table is the missing axis. It says how a family's exhaust is put together:
 *
 *   · SHEET ARRANGEMENT   how many plasma sheets wrap the column, how sharp the crease where each
 *                         one turns edge-on, whether alternate sheets are paired
 *   · CROSS-SECTION       how far the partial shell wraps, so a needle and a barrel are different
 *                         shapes rather than the same shape at two widths
 *   · THROAT ATTACHMENT   how hard the material is welded to the bell, and whether the mouth breaks
 *                         into lobes before it opens
 *   · COMPRESSION         the standing cell structure the nozzle itself imposes
 *   · HEAT DISTRIBUTION   where the folds stop being folds and become individually cooling reaches
 *   · RESPONSE            how the fold pattern travels, and how throttle changes that travel
 *
 * It is a SIDE TABLE keyed by `engineFamily`, deliberately not a block on the recipe objects:
 * `ION_SMALL_MAIN_PLUME_RECIPE` is the frozen accepted Kestrel substrate, and `validateRecipe`
 * is run over every live pack by the family gate. Construction data belongs beside the recipes,
 * not inside them.
 *
 * Every value here is consumed ONCE, at material construction, as a shader uniform. There is one
 * material per family × role already, so this costs no per-frame work and adds no shader variant:
 * the same program runs for every family, with different numbers in it.
 */

/**
 * The prototype record.
 *
 * The brief asked for three distinct motion silhouettes per family group, one chosen and the
 * others named. Under the owner's 2026-09-16 capture ruling this table IS that record: each
 * candidate is stated as the construction it would have been, and the rejected ones carry the
 * reason they lose. Nothing here is wired — only the `selected` row's numbers appear below.
 */
export const SILHOUETTE_CANDIDATES = Object.freeze({
  disciplined: Object.freeze([
    Object.freeze({
      id: 'collimated-crease',
      selected: true,
      motion: 'Two or three long creases run the whole length of a tight shell and travel aft fast '
        + 'and evenly. The column barely widens; the creases stay parallel and only break in the '
        + 'last quarter.',
      why: 'Reads as containment at every distance. The crease count is low enough that each one '
        + 'survives minification as a distinct line instead of averaging into a bright tube, and '
        + 'the parallel travel is what says "this gas is being steered", which is the whole point '
        + 'of an ion or vector drive.',
    }),
    Object.freeze({
      id: 'shock-ladder',
      selected: false,
      motion: 'A standing ladder of bright compression discs down the jet, with the gas visibly '
        + 'accelerating between rungs.',
      why: 'Rejected: at the chase camera the rungs alias into a striped cone, which is B3 by '
        + 'appearance even when the geometry is honest. The shock structure survives here as a '
        + 'shallow compression term near the mouth instead of the silhouette.',
    }),
    Object.freeze({
      id: 'braided-pair',
      selected: false,
      motion: 'Two sheets wind around each other in a slow double helix.',
      why: 'Rejected for the single-nozzle families: a helix reads as swirl, and swirl is the '
        + 'resonator\'s signature. Keeping it here would have made two families say the same thing. '
        + 'The twin-ion drive keeps the PAIRING (alternate creases carry different weight) without '
        + 'the winding.',
    }),
  ]),
  loaded: Object.freeze([
    Object.freeze({
      id: 'broken-mouth-torch',
      selected: true,
      motion: 'The mouth breaks into three lobes before the column opens; six soft creases wander '
        + 'and shred downstream, and the cooling reaches tear off at visibly different stations.',
      why: 'The lobed mouth is the tell that survives everywhere — it says the bell is working '
        + 'harder than it was designed for before you can even see the plume. Soft creases plus '
        + 'per-instance reach spread give the ragged back edge an industrial drive should have, '
        + 'and it is the direct opposite of the disciplined group on every axis at once.',
    }),
    Object.freeze({
      id: 'soot-shedder',
      selected: false,
      motion: 'Dark unburnt sheets peel off the outside of the plume and cool to nothing.',
      why: 'Rejected: dark peeling material on an additive layer is invisible, and making it work '
        + 'would mean an opaque pass over the exhaust — a new draw for one family. The reach '
        + 'spread carries the same "incomplete combustion" read for free.',
    }),
    Object.freeze({
      id: 'surge-torch',
      selected: false,
      motion: 'The whole column pulses at about 3 Hz, like a badly governed pump.',
      why: 'Rejected: a periodic full-column pulse is a brightness animation, and at any speed it '
        + 'either strobes or reads as an opacity channel (B17). Slow heavy fold travel gives the '
        + 'labouring rhythm without pumping the silhouette.',
    }),
  ]),
  unusual: Object.freeze([
    Object.freeze({
      id: 'standing-beat',
      selected: true,
      family: 'resonator',
      motion: 'The creases barely convect. Instead the fold pattern BEATS in place — the whole '
        + 'azimuthal arrangement swells and inverts on its own slow clock while the column stands '
        + 'still, so the exhaust looks driven rather than thrown.',
      why: 'A field drive should not look like it is throwing mass. Near-zero fold travel with a '
        + 'strong standing beat is instantly distinguishable from every reaction drive in the game '
        + 'and still satisfies E3 travelling structure, because the beat is position-minus-time '
        + 'with a second slow evolution on top.',
    }),
    Object.freeze({
      id: 'ring-cascade',
      selected: true,
      family: 'plasma_ring',
      motion: 'Eight creases sit in an annulus away from the centreline, so the plume is a hollow '
        + 'sleeve of plasma with a cooler middle; the ring rotates slowly and sheds arcs aft.',
      why: 'A capital drive has to read as big, and a hollow sleeve reads bigger than a solid cone '
        + 'at the same width because the eye gets an inner AND an outer edge. The slow rotation '
        + 'makes it unmistakable beside the industrial torch, which is the other wide family.',
    }),
    Object.freeze({
      id: 'lattice-bloom',
      selected: false,
      motion: 'A crystalline lattice of creases that subdivides as throttle rises.',
      why: 'Rejected for both unusual families: a subdividing lattice is a net of individually '
        + 'visible lines with gaps between them, which is B19 however it is generated.',
    }),
  ]),
});

/**
 * Construction defaults. Any family that does not override a field gets the disciplined
 * single-nozzle reading, which is also the accepted Kestrel substrate's own behaviour.
 */
export const CONSTRUCTION_DEFAULTS = Object.freeze({
  /** Plasma sheets wrapping the column. Low = few broad creases; high = many narrow ones. */
  foldCount: 3,
  /** Share of a sheet's brightness the crease owns. The rest is the dark interior. */
  creaseDepth: 0.46,
  /** Crease profile exponent. High = a thin bright line against a dark interior. */
  creaseSharp: 3.0,
  /** Alternate-fold weighting. 0 = every sheet equal; >0 = visibly paired sheets. */
  creaseBias: 0,
  /** Creases per second travelling aft at cruise. Zero = a standing pattern. */
  foldTravel: 1.5,
  /** Fold ridges turned per world unit along the jet (the screw of the arrangement). */
  foldPitch: 1.2,
  /** How hard the axial field shreds the folds downstream. 0 = parallel to the end. */
  foldBreak: 0.35,
  /** Standing beat of the whole azimuthal arrangement, in Hz. Zero for reaction drives. */
  foldBeatHz: 0,
  /** Radius (in shell coordinates) the crease band sits at. 0 = solid; >0 = a hollow sleeve. */
  foldAnnulus: 0,
  /** Arc span of the partial shell, radians. Small = a needle; large = a barrel. */
  shellArc: 0.9,
  /** How hard the material is welded to the bell at the mouth. 1 = welded; 0 = stands off. */
  throatBite: 0.85,
  /** Compression lobes the mouth breaks into before the column opens. 1 = an unbroken mouth. */
  mouthLobes: 1,
  /** Standing compression cells per unit length, imposed by the nozzle. */
  compressionPitch: 8.5,
  /** How deeply those cells modulate the inner stream. */
  compressionDepth: 0.12,
  /** Per-instance extent spread. Each instance is shortened by up to this fraction (B18). */
  reachSpread: 0.18,
});

const DISCIPLINED_IMPULSE = Object.freeze({
  /** Fraction of the pulse spent building the overpressure head before it leaves the throat. */
  headLaunch: 0.22,
  /** How far down the jet the head travels over the pulse, as a fraction of jet length. */
  headTravel: 0.9,
  /** How much of the jet's brightness the travelling head owns. */
  headDepth: 0.62,
  /** Recoil collar at the mouth: brightness lift while the valve is open. */
  collarLift: 0.85,
  /** Fraction of the pulse the collar stays lit — short, because a valve shuts. */
  collarHold: 0.42,
});

/**
 * Per-family construction. Only real differences are listed; everything else inherits.
 *
 * Read these as a machine description, not as tuning. `ion_small` and `vector` are the same kind
 * of drive built to different tolerances; `industrial` is a different machine; `resonator` and
 * `plasma_ring` are not reaction drives at all.
 */
export const FAMILY_CONSTRUCTION = Object.freeze({
  /** The accepted Kestrel substrate: a disciplined small ion drive. Three clean creases. */
  hitch_ion_kestrel: Object.freeze({
    group: 'disciplined',
    silhouette: 'collimated-crease',
    foldCount: 3,
    creaseSharp: 3.2,
    creaseDepth: 0.48,
    foldTravel: 1.6,
    foldBreak: 0.32,
    shellArc: 0.78,
    throatBite: 0.9,
    mouthLobes: 1,
    compressionPitch: 9.0,
    compressionDepth: 0.14,
    reachSpread: 0.16,
    impulse: DISCIPLINED_IMPULSE,
  }),
  ion_small: Object.freeze({
    group: 'disciplined',
    silhouette: 'collimated-crease',
    foldCount: 3,
    creaseSharp: 3.2,
    creaseDepth: 0.48,
    foldTravel: 1.6,
    foldBreak: 0.32,
    shellArc: 0.78,
    throatBite: 0.9,
    mouthLobes: 1,
    compressionPitch: 9.0,
    compressionDepth: 0.14,
    reachSpread: 0.16,
    impulse: DISCIPLINED_IMPULSE,
  }),
  /**
   * Twin ion: the same discipline, built as a PAIR. Four creases with a strong alternate-fold
   * weighting, so two of them are hot and two are cool and the column reads as two interleaved
   * sheets sharing one throat — the pairing without the helix that was rejected above.
   */
  ion_twin: Object.freeze({
    group: 'disciplined',
    silhouette: 'collimated-crease',
    foldCount: 4,
    creaseSharp: 2.9,
    creaseDepth: 0.52,
    creaseBias: 0.42,
    foldTravel: 1.45,
    foldPitch: 1.05,
    foldBreak: 0.38,
    shellArc: 0.86,
    throatBite: 0.88,
    mouthLobes: 2,
    compressionPitch: 8.2,
    compressionDepth: 0.13,
    reachSpread: 0.2,
    impulse: DISCIPLINED_IMPULSE,
  }),
  /**
   * Vector: the tightest tolerance in the game. Two creases, the hardest crease profile, the
   * narrowest shell, the fastest travel, an almost welded throat and barely any reach spread.
   * Everything about it says the gas leaves exactly where it was aimed.
   */
  vector: Object.freeze({
    group: 'disciplined',
    silhouette: 'collimated-crease',
    foldCount: 2,
    creaseSharp: 4.1,
    creaseDepth: 0.44,
    foldTravel: 2.4,
    foldPitch: 1.5,
    foldBreak: 0.2,
    shellArc: 0.6,
    throatBite: 0.97,
    mouthLobes: 1,
    compressionPitch: 11.5,
    compressionDepth: 0.16,
    reachSpread: 0.09,
    impulse: Object.freeze({
      headLaunch: 0.16, headTravel: 1.02, headDepth: 0.7, collarLift: 0.95, collarHold: 0.34,
    }),
  }),
  /**
   * Industrial: loaded and turbulent, and the direct opposite of the disciplined group on every
   * axis. The mouth breaks into three lobes before the column opens, six soft creases wander and
   * shred early, and the reach spread is wide enough that the cooling reaches visibly tear off at
   * different stations instead of ending together.
   */
  industrial: Object.freeze({
    group: 'loaded',
    silhouette: 'broken-mouth-torch',
    foldCount: 6,
    creaseSharp: 1.5,
    creaseDepth: 0.6,
    creaseBias: 0.18,
    foldTravel: 0.85,
    foldPitch: 0.7,
    foldBreak: 0.82,
    shellArc: 1.2,
    throatBite: 0.52,
    mouthLobes: 3,
    compressionPitch: 5.2,
    compressionDepth: 0.2,
    reachSpread: 0.44,
    impulse: Object.freeze({
      headLaunch: 0.3, headTravel: 0.68, headDepth: 0.5, collarLift: 0.7, collarHold: 0.55,
    }),
  }),
  /**
   * Resonator: a field drive, so it must not look like it is throwing mass. The creases barely
   * convect (`foldTravel` near zero); instead the whole azimuthal arrangement beats in place at
   * `foldBeatHz` while the column stands still.
   */
  resonator: Object.freeze({
    group: 'unusual',
    silhouette: 'standing-beat',
    foldCount: 5,
    creaseSharp: 2.6,
    creaseDepth: 0.55,
    foldTravel: 0.22,
    foldPitch: 0.35,
    foldBreak: 0.46,
    foldBeatHz: 1.35,
    shellArc: 0.98,
    throatBite: 0.74,
    mouthLobes: 1,
    compressionPitch: 6.8,
    compressionDepth: 0.1,
    reachSpread: 0.26,
    impulse: Object.freeze({
      headLaunch: 0.12, headTravel: 0.55, headDepth: 0.78, collarLift: 1.1, collarHold: 0.3,
    }),
  }),
  /**
   * Plasma ring: a hollow sleeve. The crease band sits off the centreline (`foldAnnulus`), so the
   * plume has an inner edge as well as an outer one and reads bigger than its own width; the ring
   * turns slowly rather than streaming.
   */
  plasma_ring: Object.freeze({
    group: 'unusual',
    silhouette: 'ring-cascade',
    foldCount: 8,
    creaseSharp: 2.2,
    creaseDepth: 0.58,
    foldTravel: 0.62,
    foldPitch: 0.5,
    foldBreak: 0.58,
    foldBeatHz: 0.45,
    foldAnnulus: 0.46,
    shellArc: 1.34,
    throatBite: 0.64,
    mouthLobes: 4,
    compressionPitch: 4.4,
    compressionDepth: 0.18,
    reachSpread: 0.34,
    impulse: Object.freeze({
      headLaunch: 0.26, headTravel: 0.74, headDepth: 0.58, collarLift: 0.9, collarHold: 0.5,
    }),
  }),
});

/**
 * Hard bounds. `halfChord = sin(shellArc)` in the vertex stage, so an arc past a right angle
 * inflates the shell's radius instead of widening it; the rest keep a family from authoring a
 * value that would open holes in the column (B19) or push material past the mesh end (B9).
 */
export const CONSTRUCTION_LIMITS = Object.freeze({
  foldCount: Object.freeze([1, 12]),
  creaseDepth: Object.freeze([0, 0.75]),
  creaseSharp: Object.freeze([1, 6]),
  creaseBias: Object.freeze([0, 0.6]),
  foldTravel: Object.freeze([0, 4]),
  foldPitch: Object.freeze([0, 4]),
  foldBreak: Object.freeze([0, 1]),
  foldBeatHz: Object.freeze([0, 3]),
  foldAnnulus: Object.freeze([0, 0.8]),
  shellArc: Object.freeze([0, 1.45]),
  throatBite: Object.freeze([0, 1]),
  mouthLobes: Object.freeze([1, 6]),
  compressionPitch: Object.freeze([0, 16]),
  compressionDepth: Object.freeze([0, 0.35]),
  reachSpread: Object.freeze([0, 0.5]),
});

function clampField(key, value) {
  const limit = CONSTRUCTION_LIMITS[key];
  const n = Number.isFinite(value) ? value : CONSTRUCTION_DEFAULTS[key];
  if (!limit) return n;
  return Math.max(limit[0], Math.min(limit[1], n));
}

const RESOLVED = Object.create(null);

/**
 * Resolve one family's construction, clamped and complete. Cached: the result is frozen and
 * shared, so this is safe to call from a constructor and pointless to call per frame.
 *
 * @param {string|object|null} familyOrRecipe an `engineFamily` string, or any recipe carrying one
 * @returns {object} every field of CONSTRUCTION_DEFAULTS plus `group`, `silhouette` and `impulse`
 */
export function resolveFamilyConstruction(familyOrRecipe) {
  const family = typeof familyOrRecipe === 'string'
    ? familyOrRecipe
    : (familyOrRecipe && familyOrRecipe.engineFamily) || '';
  const cached = RESOLVED[family];
  if (cached) return cached;

  const spec = FAMILY_CONSTRUCTION[family] || FAMILY_CONSTRUCTION.ion_small;
  const out = {
    family: family || 'ion_small',
    group: spec.group || 'disciplined',
    silhouette: spec.silhouette || 'collimated-crease',
    impulse: spec.impulse || DISCIPLINED_IMPULSE,
  };
  const keys = Object.keys(CONSTRUCTION_DEFAULTS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    out[key] = clampField(key, spec[key] != null ? spec[key] : CONSTRUCTION_DEFAULTS[key]);
  }
  const frozen = Object.freeze(out);
  RESOLVED[family] = frozen;
  return frozen;
}

/**
 * Construction distance between two families, counted as axes that genuinely differ.
 *
 * This is the construction-side companion to `assertFamiliesStructurallyDistinct` in the registry:
 * that one proves the recipe NUMBERS differ, this one proves the resulting MACHINES do. A family
 * pair that shares a silhouette must still differ on several build axes, or the two drives are
 * the same object at two sizes.
 */
export function constructionDistance(a, b) {
  const ca = resolveFamilyConstruction(a);
  const cb = resolveFamilyConstruction(b);
  const axes = [
    ['foldCount', 0.9],
    ['creaseSharp', 0.3],
    ['creaseDepth', 0.04],
    ['creaseBias', 0.1],
    ['foldTravel', 0.25],
    ['foldPitch', 0.2],
    ['foldBreak', 0.1],
    ['foldBeatHz', 0.2],
    ['foldAnnulus', 0.2],
    ['shellArc', 0.08],
    ['throatBite', 0.08],
    ['mouthLobes', 0.9],
    ['compressionPitch', 0.9],
    ['compressionDepth', 0.02],
    ['reachSpread', 0.04],
  ];
  let differing = 0;
  const differs = [];
  for (let i = 0; i < axes.length; i++) {
    const [key, minDelta] = axes[i];
    if (Math.abs(ca[key] - cb[key]) >= minDelta) {
      differing += 1;
      differs.push(key);
    }
  }
  return { differing, differs, a: ca, b: cb };
}

/** The silhouette actually wired for a family group (the `selected` candidate). */
export function selectedSilhouette(group) {
  const list = SILHOUETTE_CANDIDATES[group];
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].selected) return list[i];
  }
  return null;
}
