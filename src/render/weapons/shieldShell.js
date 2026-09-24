/**
 * Shared shield-shell construction.
 *
 * Both shield lanes compose their fragment from these pure functions — the pooled instanced
 * material in `renderer.js` (what players actually see) and the per-ship fallback material in
 * `ships/shipKit.js` — so the two cannot drift into different-looking shields. This module is the
 * single owner of that construction; `shipKit.js` re-exports `SHIELD_SHELL_GLSL` from here.
 *
 * WHAT THIS IS
 * ------------
 * The shell is a BUILT membrane: a welded seam network, a machined frame set inside each seam, and
 * a pane left deliberately clear. Everything that lights up is structure. The pane interior stays
 * transparent, so the protected hull reads straight through the shield at every stage — which is
 * the only accepted shield reference (the observed shield-00 / shield-03 / shield-07 sequence:
 * bright polygon seams around transparent panels that weaken and disappear, hull visible
 * throughout). It is never a permanent bright bubble and never a scatter of sparkles.
 *
 * WHAT CHANGED ON 2026-09-20
 * --------------------------
 * The shell had no clock at all. Every term was a function of the scalar charge, so while the
 * shield was visible the picture was frozen and its only animation was its own brightness ramp —
 * B16 (deformation keyed to state frozen at emission) sitting on top of B17 (opacity used as the
 * animation channel). Two things fix it:
 *
 *   1. `uShellTime` — the shell's own clock. Charge circulates panel to panel, a current runs
 *      ALONG the welded seams, and each panel breathes on its own phase. A loaded shell is
 *      visibly working, with or without a contact on it. Contact modulates that; it is not the
 *      only source of motion.
 *   2. The contact record's two separated channels (see `shieldContacts.js`): `hit.w` is radiance
 *      and `length(hit.xyz) - 1` is how far the stress front has crossed the shell. The ring's
 *      travel is no longer the same number as its opacity.
 *
 * SAFE WITHOUT THE CLOCK. `uShellTime` is declared here, so both consumers compile whether or not
 * they supply it. A material that does not resolves it to 0 and renders the previous static
 * lattice — no error, no wrong picture, just no idle life.
 *
 * ACCESSIBILITY. There is no separate reduced-motion uniform: the owner of the clock simply holds
 * `uShellTime` constant when motion is reduced, which freezes circulation, the seam current and
 * the breath while leaving every lifecycle and contact term intact.
 */

/** Name of the clock uniform both shield materials must declare for the shell to be alive. */
export const SHIELD_SHELL_TIME_UNIFORM = 'uShellTime';

/** Uniform entry to merge into a shield material's `uniforms`. One float, no texture, no target. */
export function shieldShellUniforms() {
  return { [SHIELD_SHELL_TIME_UNIFORM]: { value: 0 } };
}

/**
 * Advance a shield material's shell clock.
 *
 * `simTime` is the simulation clock, so a paused game freezes the shell exactly like every other
 * effect; `motionReduce` holds the last value instead of advancing. Returns the value in force.
 */
export function setShieldShellClock(material, simTime, motionReduce = false) {
  const uniform = material && material.uniforms && material.uniforms[SHIELD_SHELL_TIME_UNIFORM];
  if (!uniform) return 0;
  if (motionReduce) return uniform.value;
  uniform.value = Number.isFinite(simTime) ? simTime : uniform.value;
  return uniform.value;
}

export const SHIELD_SHELL_GLSL = /* glsl */`
  // The shell's own clock. Left at 0 by a material that does not supply it, which resolves every
  // term below to the previous static lattice rather than to anything wrong.
  uniform float uShellTime;

  // The twelve five-fold axes of the shell's own IcosahedronGeometry, as six +/- pairs. Reading the
  // lattice from OBJECT space is what gives the shield real structure: the panels are welded to the
  // hull, so they neither swim as the camera orbits nor counter-rotate as the ship turns.
  const vec3 SF_SHIELD_AXIS_A = vec3(0.0, 0.52573111, 0.85065081);
  const vec3 SF_SHIELD_AXIS_B = vec3(0.0, 0.52573111, -0.85065081);
  const vec3 SF_SHIELD_AXIS_C = vec3(0.52573111, 0.85065081, 0.0);
  const vec3 SF_SHIELD_AXIS_D = vec3(-0.52573111, 0.85065081, 0.0);
  const vec3 SF_SHIELD_AXIS_E = vec3(0.85065081, 0.0, 0.52573111);
  const vec3 SF_SHIELD_AXIS_F = vec3(0.85065081, 0.0, -0.52573111);
  // cos(31.717 deg) — a vertex-cell's angular radius at the wall, so the inward coordinate spans 0..1.
  const float SF_SHIELD_WALL_COS = 0.85065081;
  const float SF_SHIELD_TAU = 6.2831853;

  void sfShieldAxis(vec3 dir, vec3 axis, float id, inout float best, inout float second,
                    inout float bestId, inout vec3 bestAxis, inout vec3 secondAxis) {
    float d = dot(dir, axis);
    float m = abs(d);
    vec3 oriented = d < 0.0 ? -axis : axis;
    if (m > best) {
      second = best;
      secondAxis = bestAxis;
      best = m;
      bestAxis = oriented;
      bestId = d < 0.0 ? id + 6.0 : id;
    } else if (m > second) {
      second = m;
      secondAxis = oriented;
    }
  }

  // Spherical Voronoi of those twelve axes is the dodecahedral panel set: twelve pentagons whose
  // walls are great-circle arcs, plus one concentric rib inside each panel.
  // Returns (wall proximity, panel identity, distance inward from the wall, position ALONG the
  // shared wall). The along-wall coordinate is what lets charge run through the seam NETWORK
  // instead of every weld brightening at once.
  vec4 sfShieldPanels(vec3 dir) {
    float best = -1.0;
    float second = -1.0;
    float bestId = 0.0;
    vec3 bestAxis = SF_SHIELD_AXIS_A;
    vec3 secondAxis = SF_SHIELD_AXIS_B;
    sfShieldAxis(dir, SF_SHIELD_AXIS_A, 0.0, best, second, bestId, bestAxis, secondAxis);
    sfShieldAxis(dir, SF_SHIELD_AXIS_B, 1.0, best, second, bestId, bestAxis, secondAxis);
    sfShieldAxis(dir, SF_SHIELD_AXIS_C, 2.0, best, second, bestId, bestAxis, secondAxis);
    sfShieldAxis(dir, SF_SHIELD_AXIS_D, 3.0, best, second, bestId, bestAxis, secondAxis);
    sfShieldAxis(dir, SF_SHIELD_AXIS_E, 4.0, best, second, bestId, bestAxis, secondAxis);
    sfShieldAxis(dir, SF_SHIELD_AXIS_F, 5.0, best, second, bestId, bestAxis, secondAxis);
    float gap = best - second;
    float wall = 1.0 - smoothstep(0.0, 0.055, gap);
    float rib = 1.0 - smoothstep(0.0, 0.030, abs(gap - 0.135));
    // A low-discrepancy per-panel constant, not a noise lookup: it only orders the panels.
    float cell = fract(bestId * 0.6180339887);
    float inward = clamp((best - SF_SHIELD_WALL_COS) * 6.71, 0.0, 1.0);
    // Signed position along the weld between this panel and its neighbour: zero at the edge
    // midpoint, extreme at the two vertices the weld runs between.
    float along = dot(dir, normalize(cross(bestAxis, secondAxis)));
    return vec4(clamp(wall + rib * 0.45, 0.0, 1.0), cell, inward, along);
  }

  float sfShieldRim(vec3 N, vec3 V) {
    float f = 1.0 - max(0.0, dot(N, V));
    return f * f * f;
  }

  // A hit is a LOCAL event, and it now arrives on two separate channels:
  //   hit.w            RADIANCE. How hot this contact still is.
  //   length(hit.xyz)  1 + PROPAGATION. How far its stress front has crossed the shell.
  // Splitting them is the whole point. The travelling front used to be derived from the same
  // number as the brightness, so a contact could only be a circle that grew at a constant rate
  // while dimming at a constant rate. A record that still ships a unit direction (length exactly
  // one) falls back to the old age-from-strength read, so an unpatched producer is still correct.
  // Returns (incandescent core, expanding front).
  vec2 sfShieldContact(vec3 N, vec4 hit) {
    if (hit.w <= 0.001) return vec2(0.0);
    vec3 dir = hit.xyz;
    float len = length(dir);
    if (len < 1e-4) return vec2(0.0);
    dir /= len;
    float w = clamp(hit.w, 0.0, 1.0);
    float spread = clamp(len - 1.0, 0.0, 1.0);
    float age = spread > 0.0005 ? spread : 1.0 - w;
    // 0 at the impact point, 2 at the far side; a chord measure, so no inverse trig on the hot path.
    float d = 1.0 - clamp(dot(N, dir), -1.0, 1.0);
    float ringR = 0.035 + age * 0.62;
    float ringW = 0.030 + age * 0.085;
    // HEXAGONAL FACETING. The stress front travels further along six lattice directions, so the
    // ripple expands as a hexagonal energy cell anchored at the strike — the directional grid
    // read — instead of a smooth circle. Azimuth around the impact axis needs a stable tangent
    // frame; the degenerate pole case falls back to the X axis.
    vec3 hexAxis = abs(dir.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 hexT1 = normalize(cross(dir, hexAxis));
    vec3 hexT2 = cross(dir, hexT1);
    float hexAz = atan(dot(N, hexT2), dot(N, hexT1));
    float hexMod = 0.86 + 0.14 * cos(6.0 * hexAz);
    // The travelling wave gathers along manufactured panel directions. This gives
    // each hit a scalloped liquid-glass edge instead of another perfect neon circle.
    float scallop = 1.0 + 0.16 * sin(N.x * 21.0 + N.z * 13.0) * sin(N.y * 17.0 - N.z * 9.0);
    float s = (d - ringR * scallop * hexMod) / ringW;
    float ring = exp(-s * s) * w * (0.35 + 0.65 * w);
    // Trailing inner cell: a fainter hex echo at 60% of the front's reach — the lattice charging
    // behind the wavefront. Same facet modulation, tighter band, so the grid read survives bloom.
    float s2 = (d - ringR * scallop * hexMod * 0.62) / (ringW * 0.55);
    ring += exp(-s2 * s2) * w * (0.30 + 0.40 * w);
    float core = exp(-d / (0.016 + age * 0.020)) * w * w;
    return vec2(core, ring);
  }

  // One response for both lanes. The pooled instance passes its four accumulated contacts; the
  // per-ship fallback passes none. Every term is thin — a grazing limb, the welded seams, the
  // machined frames, and whatever a local impact is doing — so a fragment in the middle of a pane
  // is fully transparent and the hull reads straight through the bubble.
  vec4 sfShieldShellResponse(vec4 lattice, float rim, float flash, float base, vec2 contact, vec3 tint) {
    float seam = lattice.x;
    float cell = lattice.y;
    float inward = lattice.z;
    float along = lattice.w;

    float clock = uShellTime;
    float load = clamp(flash, 0.0, 1.0);
    // Anything above 1.0 is the renderer's dielectric rupture punch on a shield break. It is the
    // one state the shell can read honestly, so it is the only one this shader invents geometry for.
    float rupture = clamp(flash - 1.0, 0.0, 1.5);

    // CIRCULATION — the shell is working the whole time it is visible. Charge sweeps the lattice
    // panel by panel, a current runs along the welds, and each panel breathes on its own phase.
    // With the clock unset all three collapse to constants and the shell is simply the old still.
    float sweep = 1.0 - abs(fract(cell - clock * 0.19) * 2.0 - 1.0);
    float circulation = sweep * sweep * sweep;
    float current = pow(0.5 + 0.5 * cos((along * 3.4 - clock * 0.62 + cell) * SF_SHIELD_TAU), 6.0);
    float breath = 0.5 + 0.5 * sin(clock * 1.7 + cell * SF_SHIELD_TAU);

    // Absorbed charge does not light every panel at once: each panel has its own place in the
    // sequence, so the lattice energises as a scatter across the shell and drains the same way.
    float panelCharge = clamp(load * 1.35 - cell * 0.35, 0.0, 1.0);
    float core = clamp(contact.x, 0.0, 1.4);
    float ring = clamp(contact.y, 0.0, 1.4);
    float activity = clamp(load * 4.0 + panelCharge * 2.0 + (core + ring) * 2.5 + base * 4.0, 0.0, 1.0);

    // CONSTRUCTED MEMBERS. A machined frame set a little inside each weld, and a pane left clear.
    float frame = exp(-pow((inward - 0.20) / 0.085, 2.0));
    float pane = smoothstep(0.30, 0.90, inward);

    // A stress seam is a weld CARRYING load, and the travelling current is what says so. Without
    // it the whole network sits at one brightness that only ramps with the hit.
    //
    // Deliberately a REDISTRIBUTION of the charge the shell already had, not an addition to it. The
    // drive averages about 0.62 over a cycle, which pays for the machined frame below and keeps the
    // shell's total coverage at or under what it was: the point is that the light MOVES, and a
    // shield that answered "make it alive" by getting brighter would just be a brighter bubble.
    float wallDrive = (0.22 + 0.78 * panelCharge) * (0.46 + 0.36 * circulation + 0.30 * current);
    float wall = seam * wallDrive * activity;
    float ribLight = frame * (0.16 + 0.60 * panelCharge) * (0.30 + 0.70 * breath) * activity;
    float shoulder = pow(1.0 - inward, 2.4) * panelCharge * 0.24;

    // LOCAL RESPONSE. A contact energises the structure it landed on, so the impact spreads
    // through the built surface instead of floating on top of it as an unattached ring.
    float localLoad = clamp(core * 1.6 + ring * 1.1, 0.0, 1.0);
    wall += seam * localLoad * 0.85;
    ribLight += frame * localLoad * 0.55;

    // FAILURE AND RE-KNIT. Rupture blows the weld network open in an ordered sequence rather than
    // dimming the whole shell together, and the panes go dark behind the torn welds. As the charge
    // falls back through 1.0 the same sequence runs closed again, which is the recovery read.
    float fail = smoothstep(0.05, 0.95, rupture * 1.4 - fract(cell * 3.0 + along * 0.7));
    float intact = 1.0 - 0.92 * fail;
    wall = wall * intact + fail * seam * (0.85 + 0.65 * current);
    ribLight *= intact;

    float limb = rim * (base * 6.2 + 0.30 * load + 0.22 * rupture);

    // The pane contributes NOTHING to alpha. A shell that tints its own panes is a bubble over the
    // hull however thin the tint is, and the hull reading through is the whole accepted reference.
    float alpha = clamp(limb + wall * 0.62 + ribLight * 0.26 + shoulder
      + ring * 0.55 + core * 0.85, 0.0, 1.0);
    float heat = clamp(core * 1.25 + ring * 0.45 + seam * panelCharge * 0.55
      + load * 0.22 + fail * 0.85, 0.0, 1.0);
    vec3 glassTint = mix(tint * vec3(0.50, 0.47, 0.94), tint, smoothstep(0.10, 0.45, heat));
    vec3 col = mix(glassTint, vec3(0.90, 0.98, 1.0), heat * heat);
    // Deliberate bloom headroom: an impact core leaves this shader well above 1.0.
    vec3 rgb = col * (0.85 + 0.65 * seam * panelCharge + 1.35 * core + 0.45 * ring + 0.35 * rim
      + 0.55 * ribLight + 0.70 * fail) * (1.0 - 0.35 * pane);
    return vec4(rgb, alpha);
  }
`;
