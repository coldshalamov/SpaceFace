# VFX and Presentation Technical Direction

## 1. Problem statement

Physics mechanics will feel cheap if the visual language remains limited to translucent primitive tubes, expanding circles, low-density particles, and generic bloom.

The current failure mode is not merely “the effect needs more particles.” It is usually structural:

- The effect has no layered temporal sequence.
- It does not show force direction.
- It does not react to velocity, tension, mass, or impact.
- It uses one material and one opacity envelope.
- It ignores world scale and camera zoom.
- It has no distortion, lighting response, surface interaction, or aftermath.
- It is not pooled or batched, so adding density risks performance collapse.

A modern effect should communicate the mechanic first and spectacle second.

## 2. Governing VFX laws

### 2.1 Semantic before decorative

Every effect must answer:

- Where is the force acting?
- In which direction?
- How strong is it?
- What body owns it?
- What state is changing?
- When is the actionable timing window?

### 2.2 Layered event structure

Most effects should have four phases:

1. **Anticipation:** charge, field formation, target lock, tension growth.
2. **Primary event:** impulse, release, detonation, field activation.
3. **Secondary response:** debris, trails, distortion, target motion, camera response.
4. **Decay / aftermath:** embers, residual field, fading wake, scorched or heated state.

A single expanding mesh is rarely sufficient.

### 2.3 World-space truth

Effects should attach to the actual world positions, surfaces, lines, velocities, and normals involved. They should not appear as arbitrary screen overlays unless used as secondary timing feedback.

### 2.4 Scale-aware detail

Effects need at least two presentation levels:

- Near / combat zoom: surface sparks, local distortion, component detail.
- Far / sling zoom: strong silhouette, broad field shape, long velocity trail.

### 2.5 Bounded post-processing

Bloom, chromatic aberration, screen shake, and distortion are accents. They should never erase target readability or make every mechanic share the same neon fog.

## 3. Recommended Three.js VFX toolbox

The following terms are useful when prompting agents.

### 3.1 Instanced particle systems

Use `THREE.InstancedMesh` or custom `InstancedBufferGeometry` for repeated particles. Store per-instance:

- Position.
- Velocity.
- Age.
- Lifetime.
- Size.
- Rotation.
- Color or palette index.
- Seed.

Update in a bounded pool rather than creating and destroying Mesh objects per particle.

Use for:

- Field motes.
- Debris.
- Sparks.
- Reentry fragments.
- Dust streaks.
- Attraction/repulsion flow markers.

### 3.2 Shader-driven ribbons and trails

Use a camera-facing strip mesh, `THREE.Line2`, or custom ribbon geometry rather than a thin GL line. Generate a polyline from recent positions or semantic endpoints and extrude width in the vertex shader or CPU geometry.

Useful features:

- Width based on tension or velocity.
- Gradient along length.
- Noise displacement.
- UV-scrolling energy texture.
- Edge softness using signed distance in fragment shader.
- Taper at endpoints.
- Breakup near overload.

Use for:

- Massline.
- Velocity trails.
- Reentry plasma.
- Gravitic flow.
- Sling trajectory preview.
- Drag-net surfaces.

### 3.3 Signed-distance-field shapes

Use analytic SDF functions in fragment shaders for clean rings, arcs, cones, brackets, and soft field boundaries. This avoids low-resolution geometry and supports smooth animation.

Use for:

- Release arcs.
- Target brackets.
- Orbit bands.
- Field discs.
- Shockwave rings.
- Atmospheric bands.

### 3.4 Screen-space distortion

Render selected effect geometry into a distortion buffer containing offset vectors and intensity. During composition, sample the scene color at offset UVs.

Use controlled procedural noise and radial/tangential distortion patterns.

Use for:

- Mass Seed.
- Black hole.
- Inertial Shunt.
- High-tension massline release.
- Concussion shockfront.

Do not distort the entire screen strongly. Restrict it to the world-space volume and cap displacement.

### 3.5 Depth-aware soft particles

When a depth texture is available, compare particle depth to scene depth and fade particles near intersections. This removes hard square clipping where particles meet ships or planets.

Use for:

- Dust.
- Smoke-like energy clouds.
- Reentry plasma.
- Atmospheric haze.
- Explosion debris.

### 3.6 Mesh shockwaves

Use a thin ring or disc mesh with:

- Expanding radius.
- Contracting width.
- Emissive edge.
- Normal/distortion contribution.
- Alpha decay.
- Optional surface intersection sparks.

A shockwave should be one layer among several, not the entire explosion.

### 3.7 Flow-field particles

For gravity, attraction, and repulsion, seed particles in the field and advect them along the same or a stylized vector field.

Attraction:

- Curved inward spirals.
- Increasing speed toward center.
- Occasional orbital arcs.

Repulsion:

- Radial outward acceleration.
- Stretching streaks.
- Hollow center pulse.

The particles communicate force direction better than a static sphere.

### 3.8 GPU-friendly noise

Use small tiling noise textures or procedural hash/noise functions for:

- Distortion breakup.
- Field flicker.
- Ribbon edge variation.
- Plasma turbulence.
- Surface heat.

Avoid loading huge animated textures when a compact shader can produce the motion.

### 3.9 Dynamic emissive lighting

Use a small pool of temporary point lights or emissive proxies tied to major events:

- Mass Seed activation.
- Repulsor detonation.
- Reentry breakup.
- Concussion impact.
- Massline snap.

Cap active lights and use priority. Do not create one dynamic light per particle.

### 3.10 Camera response

Use semantic camera cues:

- Short trauma impulse on impact.
- Directional kick aligned with force.
- Smooth zoom-out with physics-earned speed.
- Small orthographic scale punch on slingshot release.
- Brief focus framing during flyby tether opportunity.
- High-frequency micro-shake only for tension overload, not constantly.

## 4. Massline visual redesign

## 4.1 Current failure to avoid

Do not represent the line as two nested translucent cylinders that pulse by scaling. That reads as an HTML bloom mockup rather than a physical tether.

## 4.2 Recommended layered massline

### Structural core

- Narrow opaque or near-opaque luminous filament.
- Stable endpoint attachment.
- Slight catenary or vibration only if supported by the physical model.

### Energy sheath

- Wider soft ribbon.
- UV flow toward load direction.
- Color and width tied to tension.
- Noise breakup near overload.

### Load packets

- Sparse moving pulses along the line.
- Direction communicates reel, pay-out, or energy transfer.

### Endpoint interaction

- Surface-aligned attachment flare.
- Small sparks or distortion under high load.
- Anchor-specific attachment graphic.

### High-speed wake

- When line sweeps rapidly, add a faint trailing ribbon showing its recent path.
- Monofilament variant increases this into a dangerous cutting plane.

## 4.3 Color grammar

Example only; maintain palette consistency:

- Stable: cyan-white.
- Building tension: cyan to amber.
- High tension: amber to hot white.
- Overload: sharp red edge flicker and breakup.
- Tractor: broader teal flow.
- Elastic whip: magenta or violet stored-energy wave.
- Monofilament: thin white core with ultraviolet corona.
- Twin bridle: distinguish endpoints with two coordinated hues.

Do not rely on color alone. Use shape, motion, and intensity for accessibility.

## 5. Slingshot presentation

### Trajectory ribbon

- World-space ribbon, not dotted UI line.
- Taper into the future.
- Fade uncertainty with distance.
- Color by viability.
- Use the actual predictor samples.

### Release arc

- SDF annular segment around anchor.
- Green segment expands or contracts based on current speed and destination.
- Current phase indicator rotates with the player.
- Missed window leaves a short red afterimage.

### Momentum transition

On release:

- Tether core snaps to a bright point.
- A thin shock crescent travels along exit tangent.
- Camera eases outward.
- Velocity trail stretches over 150–300 ms.
- Dust and stars bias into the movement direction.
- Engine effect distinguishes coasting from thrusting.

### High-speed camera

Prompt language:

> Implement a speed-responsive orthographic camera scale with critically damped easing, velocity look-ahead, anchor framing while tethered, and hysteresis so the camera does not pump on every speed fluctuation.

## 6. Mass Seed VFX

### Anticipation

- Compact projectile or deployment node.
- Containment rings counter-rotate.
- Local dust begins curving before full activation.
- Surface or node emits a low-frequency pulse.

### Activation

- Brief inward collapse of light.
- Distortion disc forms.
- Thin lensing ring appears.
- Flow particles begin spiraling.
- Nearby trails visibly curve.

### Active field

- Do not fill the entire radius with opaque fog.
- Use sparse inward-flowing particles.
- Use a faint refractive volume boundary.
- Show target trajectories bending.
- Field strength may appear as denser curvature near center.

### Collapse

- Flow rapidly contracts.
- Small outward release wave.
- Distortion dissipates.
- Node fragments or folds shut.

### Exact agent prompt language

> Build the Mass Seed as a layered world-space gravitic effect using a small containment mesh, a bounded screen-space distortion pass, an SDF lensing ring, and pooled instanced flow particles advected inward along a curved field. Do not use a translucent sphere with bloom as the primary effect. The field must communicate force direction and remain readable over bright planets and dark space.

## 7. Repulsor VFX

### Anticipation

- Node compresses or folds inward.
- Directional particles briefly draw toward center.

### Primary event

- Bright outward shockfront.
- Radial vector streaks.
- Local scene distortion pushes outward.
- Bodies receive synchronized velocity trails.

### Active phase

- Repeating low-amplitude outward waves.
- Sparse outward-moving flow particles.
- Clear field boundary.

### Exact prompt language

> Use an expanding mesh shockwave with depth fade, a directional distortion buffer, and instanced outward vector streaks. Couple particle direction and length to the actual field force. Avoid generic explosion fireballs; this is a sustained repulsive field, not combustion.

## 8. Concussion impact VFX

Layers:

1. Contact flash aligned to surface normal.
2. Thin directional pressure ring.
3. Target hull ripple or shield distortion.
4. Debris and sparks moving in impulse direction.
5. Short directional camera kick.
6. Target trail showing sudden velocity change.

The impulse direction should be readable instantly.

## 9. Inertial Shunt VFX

### Lighten

- Fine orbiting fragments or lattice points loosen around the target.
- High-frequency shimmer.
- Target trail responds more dramatically to motion.
- A faint expanding spatial grid may show reduced inertia.

### Ballast

- Visual compression toward hull.
- Lower-frequency field pulse.
- Denser, darker distortion.
- Movement trail becomes shorter and heavier.

Do not simply tint the ship blue or red.

## 10. Atmosphere and reentry VFX

### Atmospheric band

- Large, subtle curved haze around planet.
- Layered color gradients.
- Sparse storm or density structures.
- Edge lighting aligned with star direction.

### Player skim

- Collector wake.
- Heat glints.
- Atmosphere particles streaming along relative velocity.
- UI band showing density and heat.

### Enemy reentry

1. Leading-edge emissive heating.
2. Plasma ribbon aligned opposite velocity.
3. RCS jets firing irregularly.
4. Small components shedding.
5. Hull material darkening and glowing.
6. Larger breakup fragments with separate trails.
7. Final descent or surface flash.

### Technical prompt

> Implement reentry as a state-driven layered effect: velocity-aligned plasma ribbon, leading-edge emissive mask, pooled fragment shedding, heat-distortion surface, and progressively unstable engine/RCS cues. The effect must escalate across skim, commit, and breakup states; do not spawn one explosion immediately on crossing a radius.

## 11. Black-hole visual direction

A black hole is a high-risk flagship effect. Recommended layers:

- Dark central occluder.
- Screen-space gravitational-lensing ring.
- Accretion ribbon or disc using procedural noise and emissive gradient.
- Starfield distortion near field.
- Sparse fast orbital debris.
- Trajectory ribbons visibly curving.
- Controlled chromatic separation near extreme lensing only.

Avoid:

- A black sphere with purple bloom.
- Full-screen distortion that causes nausea.
- Excessive realistic simulation.
- Low-resolution billboard accretion disc.

A dedicated render pass may be justified for this one handcrafted sector.

## 12. Drag-net and twin-bridle VFX

### Drag net

- Two or more bright node endpoints.
- Curved ribbon surface with animated grid or strands.
- Captured objects deform the visual net locally without cloth simulation.
- Load lines connect captured bodies to the net frame.
- Color and waveform indicate capacity.

Implementation shortcut with good appearance:

- Build a parametric curved strip or fan mesh.
- Represent local deformation through shader offsets and per-capture influence points.
- Use constraints for gameplay, not cloth vertices.

### Twin bridle

- Distinct endpoint colors.
- Central relationship glyph or tension intersection.
- Angular momentum pulses traveling along both lines.
- Strong visual warning before bodies collide or line overloads.

## 13. Visual concept generation

Image-generation agents are useful for concept frames, not final runtime VFX.

Prompt them for:

- Orthographic or high-angle top-down gameplay composition.
- Real-time game screenshot language.
- Physically based materials.
- Hard-surface industrial science-fiction.
- Restrained cinematic lighting.
- Modern PC/console game VFX.
- Clear silhouettes and readable force vectors.
- No illustration, comic, poster, pulp cover, painted concept-art brushwork, or retro-futurist cartooning.

Example negative prompt language:

> No 1950s pulp illustration, no comic-book ink, no cel shading, no painterly concept art, no poster composition, no exaggerated cartoon anatomy, no flat graphic shapes, no vintage print texture.

For runtime references, request:

- Separate anticipation, active, impact, and decay frames.
- Dark and bright background variants.
- Near and far zoom variants.
- Colorblind-safe alternate palette.

## 14. Performance architecture

### Pool everything transient

- Particles.
- Shockwaves.
- Temporary lights.
- Ribbon segments.
- Debris fragments.
- Distortion emitters.

### Batch by material

- Shared geometry.
- Shared shader programs.
- Texture atlases where appropriate.
- Instancing for repeated nodes and particles.

### Budget by lane

Example budgets should be measured, not guessed:

- Combat field particles.
- Ambient particles.
- Major-event particles.
- Dynamic lights.
- Distortion surfaces.
- Trail sample counts.

### Level of detail

At far zoom:

- Reduce particle count.
- Increase particle size modestly.
- Simplify distortion.
- Preserve silhouette and timing arcs.
- Collapse surface sparks into one emissive response.

### Avoid allocation churn

- Reuse typed arrays.
- Preallocate ribbon buffers.
- Use object pools.
- Avoid per-frame creation of vectors, materials, or geometry.

## 15. Accessibility

- Never communicate release validity by red/green alone.
- Add shape or pulse-frequency differences.
- Respect reduced-motion settings by lowering shake, distortion, and rapid flashes.
- Preserve readable target outlines under high bloom.
- Provide high-contrast field boundaries.
- Cap full-screen flash intensity.
- Allow trajectory and release aids to remain visible when particles are reduced.

## 16. VFX acceptance gates

An effect is not accepted because the source file contains a shader.

Require:

1. Ordinary browser-route capture.
2. Near and far camera screenshots or video.
3. Bright and dark environment tests.
4. Reduced-motion mode.
5. Colorblind/high-contrast test.
6. Stable frame time under representative combat density.
7. No per-frame object or material creation in profiler hot path.
8. Semantic synchronization with the actual force or state.
9. Distinct anticipation, event, and decay phases.
10. Side-by-side rejection of the previous primitive effect.

## 17. Anti-slop checklist for agents

Reject the implementation if any of these are true:

- The primary effect is one transparent sphere, cone, cylinder, or ring.
- Bloom is carrying all perceived quality.
- Particles move randomly rather than following the force.
- The effect does not scale with mass, speed, tension, or field strength.
- The effect is readable only in a black test scene.
- The effect creates new geometry/materials every activation.
- The effect uses a full-screen filter for a local world event.
- The agent claims “cinematic” without a captured comparison.
- The effect obscures the target or release timing.
- The visual outcome is disconnected from physics telemetry.
