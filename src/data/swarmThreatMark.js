// Hostile swarm bracket, as a multiple of body radius.
//
// sampleBox reads the hull at Chebyshev d ≤ 0.7r and the background at d > 1.2r.
// The plate is a thin rim (RingGeometry 0.92–1) on this scale. 1.12× keeps that
// stroke outside the hull sample and short of the sky sample. 1.65× with a floor
// of 16 put a radius-12 wasp at 19.8, and the idle gate scored the bright sky
// as the threat. The rim is an identity stroke, not a disc filled to cover the
// sample box.
//
// survivalWave.js stamps entity.data.swarmMarkRadius with this factor.
// visualFactory.js clamps the rendered plate to the same factor. Neither file
// keeps a private copy.

export const SWARM_THREAT_MARK_SCALE = 1.12;
