// The Gyre Snare — a held-key telekinetic grav-lash (the "katamari tractor beam").
//
// Design grammar (owner brief): a glassy white rippling cone leads from the ship's nose to a
// "maw" point held a fixed distance ahead. The maw's wide-end basin pulls loose mass in; the
// first absorbable body to reach the maw's heart SNAGS and becomes the clump core — softly
// tethered to the maw on a slow orbit, tracking the ship wherever it goes. More bodies inside
// the core's suck band are dragged in and MERGE into the ball (katamari-style mass growth).
// Releasing the key bowls the whole clump straight out along the nose as a kinetic weapon —
// damage and kill credit ride the existing physics:impact → collisionConsequences pipeline,
// attributed via impulse provenance.
//
// House rules this file owns:
//   • Everything here is authored tuning — pure data, no math, no state. The system reads it.
//   • Distances/speeds are world-units (wu) and wu/s; the sim plane is XZ (y is presentation).
//   • The beam is input-only: it exists for exactly as long as the verb is held. Nothing here
//     auto-spawns, and the sf-sim golden never presses the key — no profile flag is needed
//     (the massSeed precedent), though the tool still honors a cheap early-out.
//   • The player's own hull is ALWAYS excluded from the pull and never takes collision damage
//     from its own clump (the collision-kernel `origin.attackerId === targetId` friendly-fire
//     route + the player-impact invariant both back this).

/** Entity types that can be snagged into / absorbed by the clump. */
export const GYRE_ABSORBABLE_TYPES = Object.freeze(['asteroid', 'wreck', 'pickup', 'payload']);

export const GYRE_SNARE = Object.freeze({
  // ── Cone geometry (the beam's reach) ──────────────────────────────────────────────
  // Maw hangs MAW_DIST wu ahead of the nose. The visual cone is apex-at-nose → mouth-at-maw;
  // the physical basin is a disc around the maw (the cone's wide end).
  mawDist: 200,              // wu — fixed tether length from hull to hold point
  noseGap: 14,               // wu — apex sits this far in front of the hull skin
  // The cone's drawn mouth MUST match the pull basin — the wide end is the gravity well,
  // so the visual rim marks the exact edge of the yank zone (≈86 wu at mawDist).
  coneHalfAngleRad: 0.42,    // ≈24° — end radius ≈ (mawDist-noseGap)·tan ≈ 83 wu ≈ basinRadius
  // ── Pull phase (no core yet) ──────────────────────────────────────────────────────
  basinRadius: 86,           // wu — hard pull zone around the maw (the "increased gravity")
  basinAccel: 620,           // wu/s² — reference accel on a ref-mass body in the basin
  wedgeAccel: 150,           // wu/s² — faint pull anywhere inside the cone wedge
  wedgeSoftLipWu: 18,        // wu — bodies just inside the rim ease in instead of snapping
  wedgeFalloff: 0.5,         // rim bodies get at most this share of wedgeAccel
  nonAbsorbablePull: 0.45,   // ×accel on dynamic bodies that can never core/member (rocks the maw shoves)
  queryReachWu: 60,          // wu — extra query radius past the basin so the wedge reaches its lip
  basinDamping: 1.6,         // 1/s — velocity damping vs ship frame inside the basin (settle, don't orbit-shoot)
  mawSwirlAccel: 90,         // wu/s² — tangential swirl so basin objects spiral in, not dead-stop
  snagRadius: 34,            // wu — reaching the maw's heart snags an absorbable body as the core
  pullMaxAccel: 900,         // wu/s² — absolute accel ceiling on any single body
  // ── Hold phase (core tethered) ────────────────────────────────────────────────────
  orbitRadiusMin: 9,         // wu — core orbits the maw at max(this, coreRadius*orbitScale)
  orbitRadiusScale: 0.9,
  orbitRate: 0.85,           // rad/s — the loose zero-G revolve
  orbitWobbleRad: 0.22,      // rad — deterministic wander layered on the orbit angle
  orbitWobbleRate: 0.37,     // rad/s
  orbitLiftRad: 6,           // wu — extra radial breathing (clump bobs toward/away from maw)
  orbitLiftRate: 0.53,       // rad/s
  holdSpringK: 26,           // 1/s² — spring toward the orbit slot
  holdDamping: 7.5,          // 1/s — damping vs the ship's frame velocity (tracks, doesn't lag)
  holdMaxAccel: 1000,        // wu/s² — hold spring ceiling (strong enough to reel a lagging ball)
  holdBreakDist: 640,        // wu — core shoved beyond this slips the beam entirely (dropped)
  holdStrainDist: 320,       // wu — beyond this the beam reads "strained" to VFX/HUD
  tumbleTorqueK: 2.2,        // torque-per-wobble on the held core — the loose zero-G spin
  // ── Katamari growth ───────────────────────────────────────────────────────────────
  suckBandWidth: 88,         // wu — core sucks absorbables within core.radius + this
  suckAccel: 680,            // wu/s² — pull toward the core inside the suck band
  suckDamping: 1.1,          // 1/s — frame-damping on inbound mass so it settles, not orbits
  absorbOverlap: 1.15,       // contact = (clumpRadius + memberRadius) * this — just past skin touch
  maxClumpRadius: 60,        // wu — volumetric union clamps here; mass keeps growing regardless
  maxClumpMass: 2400,        // t — mass cap (a hard ceiling so a ball can't out-scale a capital)
  maxAbsorbRecords: 28,      // member ledger bound for the VFX lumps
  // ── Launch ────────────────────────────────────────────────────────────────────────
  launchSpeed: 360,          // wu/s — release Δv along the nose (mass-independent)
  launchTicks: 5,            // ticks the launch impulse is spread over (slingshot feel)
  ballTtlS: 9,               // s — the bowling ball despawns after this flight window
  launchImpactScaleBase: 1.6,// damage scale floor on a launched ball
  launchImpactScalePerMass: 90, // +1 impactDamageScale per this many tons of clump mass
  launchImpactScaleMax: 8,   // impulseKernel clamps physicsBody.impactDamageScale to [0,8]
  launchProvenanceHoldS: 9.5, // kill-credit window covers the whole ballTtlS flight + a beat
  // ── Resource cost ─────────────────────────────────────────────────────────────────
  capActivateMin: 10,        // cap needed to open the beam
  capDrainPerS: 6.5,         // cap/s while the beam is live (empty tank = auto-bowl)
  capHoldMult: 1.35,         // ×drain while a clump is held (holding mass is heavier work)
  // Hold drain scales with clump mass: a 240 t ball pulls ~5.4× hold drain (~47 cap/s),
  // which beats the starter hull's regen — the bigger the katamari, the shorter the fuse.
  capMassDrainRef: 60,       // t of clump mass per additional ×1 hold drain
  // ── Presentation palette (glassy white) ───────────────────────────────────────────
  palette: Object.freeze({
    glass: '#dff1ff',
    rim: '#f6fcff',
    hot: '#ffffff',
    maw: '#cfeaff',
    lump: '#e8f4ff',
  }),
});

/** Event names the system emits (consumed by VFX/audio/HUD + tests). */
export const GYRE_EVENTS = Object.freeze({
  beamOn: 'gyre:beamOn',
  beamOff: 'gyre:beamOff',
  snagged: 'gyre:snagged',
  absorbed: 'gyre:absorbed',
  launched: 'gyre:launched',
  dropped: 'gyre:dropped',
});
