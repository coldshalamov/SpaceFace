// A deliberately small catalogue of *sources* of light. The material provides the visible
// emissive lamp; these profiles define the real Three.js PointLight it casts on neighboring
// surfaces. No generic rocks, dark wrecks or hull paint become lights by proximity.
//
// To light a new authored prop without editing this catalogue, publish:
//   entity.data.lightFixture = 'research' | 'reactor' | 'warning' | 'ore' | ...;
// or false to forbid automatic classification. A future model-socket owner may populate
// these from GLB metadata. This render-only selection reads, never writes, sim data.
export const AMBIENT_FIXTURE_KEYS = Object.freeze(['ambient-fixture-0', 'ambient-fixture-1']);
export const AMBIENT_FIXTURE_RESERVE = 2; // event-pool slots held for transient flashes

const profile = (colorHex, peak, range, priority) =>
  Object.freeze({ colorHex, peak, range, priority });

export const AMBIENT_FIXTURE_PROFILES = Object.freeze({
  dock: profile(0xffb66b, 3.0, 190, 0.16),       // sodium work lamps, quays, exterior pylons
  refinery: profile(0xff793f, 4.4, 230, 0.18),   // exposed furnace throat / industrial process
  research: profile(0x57caff, 2.6, 190, 0.17),   // cold laboratory / examination lamps
  security: profile(0xff546e, 2.8, 160, 0.15),   // station patrol and warning luminaires
  gate: profile(0x9a83ff, 3.4, 240, 0.19),       // energized transit collars
  warning: profile(0xff3a45, 2.0, 125, 0.13),    // *powered* derelict distress beacon
  reactor: profile(0x71e6ff, 4.0, 185, 0.20),    // exposed / leaky hot core
  ore: profile(0x66ffb8, 2.0, 125, 0.12),        // explicitly luminous mineral vein
  biology: profile(0xa0ff65, 2.3, 145, 0.15),    // living parasitic/alien emission
});

// Classification runs at 4Hz, not once per mesh or per frame. The regexes are fallback identity
// only; explicit lightFixture metadata always wins. A false tag always forbids emission.
export function fixtureProfileForEntity(entity) {
  if (!entity || entity.alive === false) return null;
  const data = entity.data || {};
  const declared = data.lightFixture ?? entity.lightFixture;
  if (declared === false || data.disabled === true || data.powered === false) return null;
  if (typeof declared === 'string') return AMBIENT_FIXTURE_PROFILES[declared] || null;
  if (declared != null) return null;
  const type = String(entity.type || '').toLowerCase();
  const name = String(entity.defId || data.defId || entity.kind || data.kind || '').toLowerCase();
  if (type === 'station') {
    if (/refiner|forge|smelt|industrial|foundry/.test(name)) return AMBIENT_FIXTURE_PROFILES.refinery;
    if (/research|laborator|science/.test(name)) return AMBIENT_FIXTURE_PROFILES.research;
    if (/military|security|patrol|customs/.test(name)) return AMBIENT_FIXTURE_PROFILES.security;
    return AMBIENT_FIXTURE_PROFILES.dock;
  }
  if (type === 'gate' || (type === 'structure' && /jump.gate|warp.gate|transit/.test(name)))
    return AMBIENT_FIXTURE_PROFILES.gate;
  if (type === 'anomaly' && data.luminous === true) return AMBIENT_FIXTURE_PROFILES.biology;
  if (type === 'wreck' && data.reactorActive === true) return AMBIENT_FIXTURE_PROFILES.reactor;
  if (type === 'wreck' && data.emergencyLight === true) return AMBIENT_FIXTURE_PROFILES.warning;
  if (type === 'asteroid' && data.oreGlow === true) return AMBIENT_FIXTURE_PROFILES.ore;
  return null;
}

export function makeAmbientFixtureReads() {
  return AMBIENT_FIXTURE_KEYS.map(() => ({ entity: null, profile: null, score: Infinity }));
}

// Mutates two preallocated reads. Sticky residents avoid a flashing "nearest-light carousel"
// as ships pass by; lost/out-of-range fixtures relinquish their slots. Only actively emitting
// classes are candidates. Distances are global XZ to survive floating-origin rebases.
export function selectAmbientFixtures(state, center, reads, reach = 380) {
  if (!reads || !reads.length) return reads;
  const px = center && center.x;
  const pz = center && center.z;
  const validCenter = Number.isFinite(px) && Number.isFinite(pz);
  const maxD2 = reach * reach;
  for (const read of reads) {
    const e = read.entity;
    const profile = validCenter && fixtureProfileForEntity(e);
    const dx = e?.pos?.x - px, dz = e?.pos?.z - pz;
    const within = Number.isFinite(dx) && Number.isFinite(dz) && dx * dx + dz * dz <= maxD2;
    if (!profile || !within || (state?.entities?.get && state.entities.get(e.id) !== e)) {
      read.entity = null; read.profile = null; read.score = Infinity;
    } else {
      read.profile = profile; read.score = dx * dx + dz * dz;
    }
  }
  if (!validCenter) return reads;
  const source = Array.isArray(state?.entityList) ? state.entityList : state?.entities?.values?.();
  if (!source) return reads;
  for (const entity of source) {
    const preset = fixtureProfileForEntity(entity);
    if (!preset || !entity.pos) continue;
    const dx = entity.pos.x - px, dz = entity.pos.z - pz;
    const score = dx * dx + dz * dz;
    if (!Number.isFinite(score) || score > maxD2) continue;
    if (reads.some(read => read.entity === entity)) continue;
    // Fill vacancies with the nearest eligible emitters. Filled slots are sticky.
    let best = -1;
    for (let i = 0; i < reads.length; i++) {
      if (reads[i].entity == null && (best === -1 || reads[i].score > reads[best].score)) best = i;
    }
    if (best === -1) break;
    reads[best].entity = entity;
    reads[best].profile = preset;
    reads[best].score = score;
  }
  return reads;
}
