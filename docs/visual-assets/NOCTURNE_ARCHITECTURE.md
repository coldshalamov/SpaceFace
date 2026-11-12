# NOCTURNE — cinematic lighting and atmosphere

This implementation extends the existing lighting PR, preserves SpaceFace's Look and physical
materials, and gives local lighting one renderer-owned allocation system. It is a substantial
runtime implementation, with a deliberately bounded forward renderer. It is **not a claim of
completed target-hardware acceptance**. See [validation](nocturne/VALIDATION.md), the
[authoring guide](NOCTURNE_AUTHORING.md), and the [coverage inventory](nocturne/content-coverage.md).

## Ownership and frame order

`NocturneRuntime` owns the registry, director, content adapter, headlight sources, local probes,
and atmosphere pass. It is constructed before shader admission, immediately after the renderer
classifies the GPU. `state.render.nocturne` exposes diagnostics and a render-only A/B control;
lighting is never written into gameplay entities or their `data` bags.

| Stage | Owner and work |
| --- | --- |
| Authoring | Named profiles and compositions in `src/data/nocturneLighting.js`; GLB sockets and optional `userData.nocturne` metadata |
| Scene admission | `NocturneContent`: nearest eligible owners, actual emissive geometry or named sockets, native power/damage/heat/biology state |
| Logical sources | `NocturneRegistry`: stable handles, finite poses, power/damage gains, envelopes, lifetime, owner/socket attachment |
| Residency | `NocturneDirector`: projected influence, frustum/range culling, priority, intensity, distance, hysteresis, fixed light slots |
| Occlusion | `NocturneShadowBudget`: one reusable local spotlight map and cached update policy, independent of the optional sun map |
| Indirect light | Four spatial diffuse/analytic reflection probes sampled in the physical surface shader |
| Transport | Four bounded media; up to six selected resident lights; depth-aware ray marching and temporal history |
| Presentation | Existing linear HDR bloom or SpaceRenderGraph compositor, authored exposure adaptation, existing tone mapping and output encoding |

The existing frame contract remains intact. `prepareFrame` first settles presented geometry and
camera transforms. NOCTURNE then updates sources, probes, media, exposure, and residency. VFX
publishes its event lights after preparation. Immediately before the final scene matrix walk,
`flush` resolves those requests with **zero additional clock advance**. A newly admitted flash
can illuminate the same presented frame. The source's VFX envelope remains authoritative; the
director does not add another slow attack to a short impact.

Opening preparation poses sources at `dt = 0`. The shadow depth admission system accepts the
actual selected light type and spotlight projection. It prepares the same light/shadow census
that the visible scene uses, including when the global sun shadow setting is off.

## Fixed resource contract

The shipped runtime allocates **eight PointLights and three SpotLights**, adopting the existing
headlight pool. The three Look directional lights and ambient rig remain owned by the Look.
The first spotlight is structurally shadow capable throughout the renderer generation. Zero
intensity disables contribution; it does not hide or remove a light from Three's shader census.

| Resource | Runtime bound |
| --- | --- |
| Registered logical sources | 512; generic registry/director can be configured independently for tests or other scenes |
| Authored owner census | 32 nearest eligible owners; 128 admitted authored sources; at most 8 per owner |
| Authored owner discovery | 4 Hz; no full scene graph traversal during ordinary frame updates |
| Headlight requests | 24 nearby ships; player has critical priority; stable retained owner identities |
| VFX logical pool | 32 event/sustained requests |
| Weapon logical pool | 12 requests |
| Direct GPU residency | 8 points + 3 spots, fixed during normal play |
| Director selection | 8 Hz, plus explicit source/lifecycle changes; default 30% incumbent advantage |
| Local shadow maps | 1 spotlight map; independent from existing optional sun shadow |
| Local indirect probes | 4 |
| Participating media | 4 bounded ellipsoids |
| Volumetric resident-light inputs | 6; ready shadowed spotlight first, strongest remaining contributions with incumbent hysteresis |

The census reads the entity collection at its controlled cadence and rejects distant owners
before examining model bindings. Once admitted, a source follows a retained socket or emitter;
model replacement, detached sockets, hidden LOD parents, destroyed entities, and changed identity
retire or readmit the binding. Ordinary updates reuse vectors, candidate buffers, and director
selection arrays. Hierarchy walks are limited to admission and bounded socket ancestor chains.

These are **resource bounds**, not measured milliseconds. Eight lights can still be expensive on
a large screen full of complex materials. The performance contract must be calibrated against
representative real-game scenes on target hardware.

## Direct lighting and selection

The source registry supports point, spot, directional, and area-like requests. Area-like furnace
profiles use a broad soft spotlight in this backend; they are not an LTC rectangular-area BRDF.
Directional support is available to other owners, while the production sun/rim/fill remain
under the existing Look system.

The director estimates a source's visible influence using its range sphere, camera projection,
camera distance, radiance, importance, and gameplay class. A source can contribute from just
outside the screen when its influence volume intersects the camera frustum. Stable incumbents
receive a hysteresis advantage. Winners retain the same physical slots wherever possible;
ordinary environmental handoffs fade, while transient event sources retain their own fast
envelopes. Invalid poses or colors never reach the GPU.

Priority classes run from distant decoration through secondary effects and fixtures to major
events and player-critical lights. Existing VFX priorities are normalized into that scheme.
Player-critical headlights receive strong priority for the shared shadow opportunity; this is
not an unconditional reservation. An explicit
`requiresOcclusion` source cannot fall back to an unshadowed slot.

The existing VFX, weapon, overhead engine-cooldown, Bolus lantern, and Marrow searchlight adapters
publish lightweight logical light proxies. They do not mount extra PointLights or SpotLights.
Proxy disposal checks generation identity, so an old producer cannot retire a replacement source
that reused its name. Legacy isolated preview scenes retain their existing standalone lighting.

All named local profiles use inverse-square attenuation. The headlight calibration preserves
the old lamp's illumination at a 60-world-unit reference distance, with 25,200 intensity and a
decay exponent of 2. The existing VFX radiance calibration remains intact. Bolus lights retain
their authored strength at a 48-world-unit reference distance while adopting inverse-square
attenuation. These are calibrated game-world units, not a claim that every authored mesh has
real-world dimensions or that every source is measured in physical lumens.

## Independent shadows

The local shadow budget is intentionally separate from the direct light count and from the
global sun shadow preference. A renderer generation chooses one 256, 512, or 1024 square local
map. The map is reused across owners. The source's position, aim, range, angle, owner identity,
and a nearby caster-change epoch invalidate cached depth. Moving sources update at a bounded
cadence; unchanged stationary sources reuse their map.

The existing caster policy continues to select eligible opaque nearby geometry and LODs.
Instanced submissions receive the local spotlight camera when the sun is disabled. The camera
and shadow matrix move only when the associated depth pass is requested; cached depth is not
reprojected with a newer light pose. Pending updates survive frames that do not draw. The final
NOCTURNE flush rearms the renderer's global shadow update flag after the separate sun scheduler.

Depth admission uses a private spotlight clone and reusable private map. It preserves the live
scene's light census, but secondary clones cannot consume live pending updates or allocate
additional shadow maps. This avoids a shadowless warm-up followed by cold material programs in
the first lit frame.

Only selected shadow-bearing sources provide actual occlusion. Other local lights can leak
through bulkheads. The implementation does not describe those as accurate visibility. Reserve
`requiresOcclusion` for authored sources where leaking would be unacceptable; the tradeoff is
that such a source can remain dark while the single local shadow slot is occupied.

## Surface shader and indirect illumination

The illustrated shader now captures Three's already-evaluated **RGB point/spot diffuse** after
attenuation and shadowing. It shapes the broad sun/ambient response with the existing Look while
preserving local RGB outside the pigment ceiling. The geometric sunlight term uses the real
shadowed directional color from the existing light loop; it no longer reconstructs unoccluded
sunlight from raw light colors. This introduces no second point/spot loop or surface pass.

The existing specular BRDF, coat, material textures, normal maps, livery, and emissive surfaces
remain in place. Bloom can respond to genuinely high local radiance, but is not needed for
surface illumination. The content fixture proves that distinction with bloom and media disabled.

Authored probes carry bounded local diffuse irradiance and a roughness-filtered analytic
specular lobe. Moving and instanced physical surfaces sample the field using Three's completed
view-space vertex position, including instance, batching, skinning, and morph transforms. The
probe camera transform is shared, and the four-probe shader structure is stable when counts
change. Probe strength follows power and damage, with compact spatial support.

This is maintainable authored indirect lighting, **not a baked lighting solve, captured scene
reflection, dynamic GI, or path tracing**. The reflection binding API also accepts an externally
baked PMREM CubeUV texture for a specific root, cloning materials once at admission and restoring
them on removal. No continuous cubemap capture is performed, and no new world reflection captures
are claimed by this change.

## Participating media

The atmospheric pass marches view rays only through bounded media and stops at scene depth. It
integrates single scattering and Beer–Lambert transmittance from the selected real lights. The
medium has density, albedo, anisotropy, extinction, and optional spatial noise. There are no
transparent beam cones. Vacuum has no atmospheric draw and produces exactly the disabled image.

Two reusable MRT history targets store HDR scattering/transmittance and logarithmic scene depth.
Reprojection rejects camera cuts, projection changes, foreground/depth changes, sky transitions,
light/media changes, origin rebases, and compositor depth-source changes. History is clamped.
Depth-aware reconstruction prevents a low-resolution background sample from washing over a
foreground edge. One ready spotlight supplies source-to-medium shadow occlusion, including the
repository's native comparison-depth shadow texture format.

The pass is attached to both the default bloom compositor and the high-quality SpaceRenderGraph.
They share its ownership and use the active route's scene depth and internal dimensions. In the
graph route, atmosphere is composed after AO and before exposure/tone mapping. The runtime owns
disposal; each compositor only attaches or detaches it. Atmospheric radiance is not separately
fed through the existing bloom bright-extraction pyramid.

| Lighting quality | Local map, selected at renderer creation | Moving shadow cadence | Volume resolution | Ray steps |
| --- | --- | --- | --- | --- |
| Performance / integrated | 256² | 10 Hz | Quarter width and height | 12 |
| Balanced | 512² | 15 Hz | Half width and height | 18 |
| High | 1024² | 20 Hz | Half width and height | 28 |

The medium and light caps are unchanged across these tiers. Automatic quality respects the
hardware classification and overall quality preset, including the integrated/igpu60 modes.
An explicit lighting tier overrides automatic selection. Changing a tier during play updates
cadence and volume resolution; the next renderer generation adopts its map resolution. This
keeps the shadow allocation stable mid-flight. Unsupported floating-point WebGL capabilities
disable the transport pass and expose the reason in diagnostics.

## Environmental composition and exposure

Industrial composition uses elevated amber practical spots, an oblique furnace contribution,
cool service light, and localized dust. Derelict composition uses separated emergency pools and
a conditional reactor, with restrained red/cold indirect light. Combat uses moving bow cones,
aft engines, navigation sources, and transient weapon/impact light without an ambient arena
medium. Alien composition uses a low organic source, a higher secondary lobe, growth-responsive
output, and localized media only where the world declares participating material.

Automatic profiles require actual emissive geometry or matching sockets. Ordinary dark wrecks,
rocks, hidden/disguised organisms, and empty space do not receive invented bulbs. Explicit
metadata can author additional sockets, offsets, or media. The coverage inventory identifies
native integrations and limits; auto-binding does not imply that every asset in the repository
has already received an individual art pass.

Exposure adapts slowly to the authored composition target within its declared range. It does
not meter a histogram or brighten a dark frame because it is dark. The authored factor is
applied to the existing user/Look exposure, and both compositors share the resulting value.
The original output encoding, tone mapper, accessibility controls, and post settings remain.

## Lifecycle and diagnostics

`save:restoring`, `game:new`, `game:exitToMenu`, and `sector:exit` clear render-owned sources and
history without modifying simulation or save payloads. Entity replacement and source generation
checks prevent old objects from surviving under reused IDs. Floating-origin changes invalidate
shadow and transport history. Context restoration refreshes shadow depth and atmosphere history;
lost-context disposal detaches references without dispatching stale GPU disposal events.

The Settings screen exposes Cinematic lighting, Local light shadows, Volumetric atmosphere, and
Lighting quality. These preferences use the existing profile persistence and quality-preset
matching. Old profiles receive safe defaults without a save version change.

For diagnostics, read `state.render.nocturne.getDiagnostics()`. The result includes logical and
resident counts, selection cadence, shadow allocation/update counts, active composition,
exposure, authored coverage counts, transport dimensions, and capability status. The explicit
`hardwareAcceptance: 'not-measured'` marker cannot be cleared by passing unit tests.

## Why bounded forward lighting

This change does not introduce clustered or deferred shading. The existing renderer contains
material patch chains, shader admission, packed HDR, static/instanced/batched meshes, and several
post routes. A custom clustered implementation would require a new shader data path, capability
handling, and equivalent lifecycle/warm-up proof. No available benchmark demonstrated that such
a rewrite would improve this game relative to a small stable resident set.

The chosen backend removes the previous independent local-light allocations, bounds work,
preserves actual physical light evaluation, and leaves a registry/director contract that another
backend can consume later. A clustered backend remains an experiment to justify with identical
camera/content captures and real device timings, not an unconditional deliverable.

## Reproduction

Run `npm run check:nocturne` for runtime/authoring contracts. Use the three dedicated browser
scripts for atmosphere, content, and the actual New Game/Launch route. Their reports distinguish
diagnostic geometry, a verified release asset, and full gameplay. Read the validation report
before interpreting a screenshot, software GPU query, or source-selection CPU measurement as
production acceptance.
