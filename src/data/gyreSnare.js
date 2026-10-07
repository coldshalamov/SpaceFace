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

/**
 * Entity types that can be snagged into / absorbed by the clump.
 * Pickups and payloads are deliberately NOT absorbable: the beam still tugs them
 * (basin pull + wedge shove apply to every dynamic body), so the lash can drag
 * loot toward the ship — a retrieval tool, not a cargo furnace — but it can never
 * silently eat a thing the player meant to collect.
 */
export const GYRE_ABSORBABLE_TYPES = Object.freeze(['asteroid', 'wreck']);

export const GYRE_SNARE = Object.freeze({
  // ── Cone geometry (the beam's reach) ──────────────────────────────────────────────
  // Maw hangs MAW_DIST wu ahead of the nose. The visual cone is apex-at-nose → mouth-at-maw;
  // the physical basin is a disc around the maw (the cone's wide end).
  mawDist: 200,              // wu — fixed tether length from hull to hold point
  noseGap: 14,               // wu — apex sits this far in front of the hull skin
  // The cone's drawn mouth MUST match the pull basin — the wide end is the gravity well,
  // so the visual rim marks the exact edge of the yank zone (≈86 wu at mawDist).
  coneHalfAngleRad: 0.42,    // ≈24° — reference hull lands ≈86 wu ≈ basinRadius; the publish
                           // floors endRadius at basinRadius so a hull-radius noseGap can't
                           // shrink the drawn rim inside the pull zone
  // ── Pull phase (no core yet) ──────────────────────────────────────────────────────
  basinRadius: 86,           // wu — hard pull zone around the maw (the "increased gravity")
  basinAccel: 620,           // wu/s² — reference accel on a ref-mass body in the basin
  wedgeAccel: 150,           // wu/s² — faint pull anywhere inside the drawn cone wedge
  wedgeSoftLipWu: 18,        // wu — fade band PAST the visible rim: pull eases to zero at the
                           // outer lip so the drawn cone edge is the real physics edge
  wedgeFalloff: 0.5,         // non-absorbable bodies get at most this share of wedgeAccel
  nonAbsorbablePull: 0.45,   // ×accel on dynamic bodies that can never core/member (rocks the maw shoves)
  queryReachWu: 60,          // wu — extra query radius past the basin so the wedge reaches its lip
  basinDamping: 1.6,         // 1/s — velocity damping vs ship frame inside the basin (settle, don't orbit-shoot)
  mawSwirlAccel: 90,         // wu/s² — tangential swirl so basin objects spiral in, not dead-stop
  snagRadius: 34,            // wu — reaching the maw's heart snags an absorbable body as the core
  pullMaxAccel: 900,         // wu/s² — absolute accel ceiling on any single body
  // ── Hold phase (core tethered) ────────────────────────────────────────────────────
  orbitRadiusMin: 15,        // wu — core orbits the maw at max(this, coreRadius*orbitScale);
                           // a 9 wu floor pinned a small first snag nearly dead-center in the
                           // ~86 wu mouth — "revolving loosely" needs visible room to read
  // >1 so a grown clump orbits AROUND the maw point instead of swallowing it — at 0.9 a
  // 60 wu ball circles a spot inside its own skin and the mouth glow drowns inside the katamari.
  orbitRadiusScale: 1.2,
  orbitRate: 0.85,           // rad/s — the loose zero-G revolve
  orbitWobbleRad: 0.22,      // rad — deterministic wander layered on the orbit angle
  orbitWobbleRate: 0.37,     // rad/s
  orbitLiftRad: 3.5,         // wu — extra radial breathing (clump bobs toward/away from maw); kept under half of orbitRadiusMin so a small core's bob can't swallow its revolve
  orbitLiftRate: 0.53,       // rad/s
  holdSpringK: 26,           // 1/s² — spring toward the orbit slot
  holdDamping: 7.5,          // 1/s — damping vs the ship's frame velocity (tracks, doesn't lag)
  holdMaxAccel: 1000,        // wu/s² — hold spring ceiling (strong enough to reel a lagging ball)
  holdBreakDist: 640,        // wu — core shoved beyond this slips the beam entirely (dropped)
  holdStrainDist: 480,       // wu — beyond this the beam reads "strained" to VFX/HUD
                           // (starts 2.4× the maw out: a 320 wu band left "strained"
                           // bodies fully past the basin's readable edge)
  holdLagRefWu: 160,         // wu — orbit-slot residual at which the mild tension read
                           // saturates; a fast ship dragging the clump lags ~this far
  holdLagStrainMax: 0.3,     // the lag channel's strain01 ceiling — below the 0.4 STRAIN
                           // latch, so dragging shades the glass but never cries "tearing"
  holdBackReactionFrac: 0.02,// the orbit spring's counter-force fraction the helm eats —
                           // the lash is not massless: telekinesis under load tugs the ship
  holdBackReactionMassCap: 150, // t — reaction rides min(clumpMass, this): a capped katamari
                           // drags ~7% of the spring force, a pebble is free
  tumbleTorqueK: 2.2,        // gain steering the held core's spin toward tumbleTargetRadS
  tumbleTargetRadS: 0.55,    // rad/s — lazy rubble drift; a servo target so the spin settles
                           // instead of winding up open-loop over a long hold
  // ── Katamari growth ───────────────────────────────────────────────────────────────
  suckBandWidth: 88,         // wu — core sucks absorbables within core.radius + this
  suckBandMassGain: 0.5,     // extra band wu per wu of clump radius — the annulus widens
                           // as the ball grows: a capped 60 wu katamari is hungrier than
                           // a fresh snag, and the halo reads the escalating appetite
  suckAccel: 680,            // wu/s² — pull toward the core inside the suck band
  suckDamping: 1.1,          // 1/s — frame-damping on inbound mass so it settles, not orbits
  absorbEpsilonWu: 4,      // contact = clumpRadius + memberRadius + this — just past skin
                           // touch at a FIXED margin: a 1.15x factor scaled with the ball
                           // and a capped clump ate things ~10 wu before resting contact
  absorbCueMinGapS: 0.08,    // s — min gap between absorb glass ticks so a dense belt feed
                           // doesn't stack identical cues into noise (events stay per-body)
  maxClumpRadius: 60,        // wu — volumetric union clamps here; mass keeps growing regardless
  maxClumpMass: 2400,        // t — mass cap (a hard ceiling so a ball can't out-scale a capital)
  maxAbsorbRecords: 28,      // member ledger bound for the VFX lumps
  basinSpotMax: 8,         // published pull-glow positions per tick (bodies actually being dragged)
  // ── Launch ────────────────────────────────────────────────────────────────────────
  launchSpeed: 520,          // wu/s — release Δv along the nose (mass-independent); the bowl visibly outruns a boosting player (~1.9x boost)
  launchTicks: 5,            // ticks the launch impulse is spread over (slingshot feel)
  launchWindupTicks: 6,      // ~100 ms coil before the burst — the slingshot needs a beat
                           // of anticipation, not just mechanical ticks
  launchWindupPullWu: 13,    // wu — the clump drags aft of the maw during the coil; at ~7 the
                           // gather was invisible against a 200 wu beam — 13 reads at a glance
  launchWindupSpringK: 110,  // 1/s² — spring to the coil point (strong, short reach)
  launchWindupDamping: 9,    // 1/s — coil damping vs the ship's frame
  ballTtlS: 9,               // s — the bowling ball despawns after this flight window
  launchImpactScaleBase: 1.6,// damage scale floor on a launched ball
  launchImpactScalePerMass: 90, // +1 impactDamageScale per this many tons of clump mass
  launchImpactScaleMax: 8,   // impulseKernel clamps physicsBody.impactDamageScale to [0,8] —
                           // saturates at ~576t while maxClumpMass is 2400t. Deliberate: the
                           // multiplier caps so a ball can't out-punch its size class, but the
                           // real-body mass keeps scaling, so a capped ball still bowls through
                           // formations with ~4x the momentum of a mid one.
  launchProvenanceHoldS: 9.5, // kill-credit window covers the whole ballTtlS flight + a beat
  // ── Resource cost ─────────────────────────────────────────────────────────────────
  capActivateMin: 10,        // cap needed to open the beam
  capDrainPerS: 6.5,         // cap/s while the beam is live (empty tank = auto-bowl)
  capHoldMult: 1.35,         // ×drain while a clump is held (holding mass is heavier work)
  // Hold drain scales with clump mass up to a cap: the mass term saturates at
  // capMassDrainMax so a FULL ball (2400t) costs the same fuse as a 130t one —
  // ~6.5·1.35·(1+2.2) ≈ 28 cap/s → ~4-5s hold on the starter hull's regen curve
  // instead of an instant dry-out. Bigger katamari, shorter fuse — bounded.
  capMassDrainRef: 60,       // t of clump mass per additional ×1 hold drain
  capMassDrainMax: 2.2,      // ceiling on the mass drain term (drain maxes ~3.2× hold mult)
  // ── Presentation palette (glassy white) — the single source of truth read by
  // src/render/forceLanguage/gyreSnarePresentation.js: cone body 'glass', rim/maw ring
  // 'rim', launch burst 'hot', mouth glow disc 'maw', katamari lump fallback 'lump'.
  palette: Object.freeze({
    glass: '#dff1ff',
    rim: '#f6fcff',
    hot: '#ffffff',
    maw: '#cfeaff',
    lump: '#e8f4ff',
    lumpGlow: '#9fc4e0',
  }),
});

/** Event names the system emits (consumed by VFX/audio/HUD + tests). */
export const GYRE_EVENTS = Object.freeze({
  beamOn: 'gyre:beamOn',
  beamOff: 'gyre:beamOff',
  snagged: 'gyre:snagged',
  absorbed: 'gyre:absorbed',
  // Haptic-rate absorb tick — emitted inside the absorbCueMinGapS gate (one per gate
  // window) so a dense belt feed reads as discrete pad ticks, not a continuous buzz.
  absorbTick: 'gyre:absorbTick',
  launched: 'gyre:launched',
  // The ball actually flies — first burst tick after the coil. Consumers that need the
  // release EDGE keep gyre:launched; feel carriers (pad pulse) ride gyre:thrown so the
  // biggest beat lands as the sling lets go, not while it pulls back.
  thrown: 'gyre:thrown',
  dropped: 'gyre:dropped',
  strained: 'gyre:strained',
  // First cap-crossing — the escalation arc's ceiling beat (audio chime + pad pulse).
  full: 'gyre:full',
});
