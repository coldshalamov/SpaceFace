// Hostile swarm bracket, as a multiple of body radius.
//
// sampleBox reads the hull at Chebyshev d ≤ 0.7r and the background at d > 1.2r.
// The plate is a layered ring family on this scale (dark under-plate 0.86–1.05,
// bright rim 0.92–1, pale hairline 0.875–0.9 in visualFactory). 1.12× keeps the
// emblem outside the hull sample and its farthest ring edge (1.05×) short of the
// sky sample. 1.65× with a floor of 16 put a radius-12 wasp at 19.8, and the
// idle gate scored the bright sky as the threat. The mark is an identity
// emblem, not a disc filled to cover the sample box. The in-hull read is the
// fighter glyph in visualFactory
// (SWARM_GLYPH_OF_BODY), which this constant must not grow into.
//
// survivalWave.js stamps entity.data.swarmMarkRadius with this factor.
// visualFactory.js clamps the rendered plate to the same factor. Neither file
// keeps a private copy.

export const SWARM_THREAT_MARK_SCALE = 1.12;
