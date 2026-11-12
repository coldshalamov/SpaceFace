# NOCTURNE content coverage and limits

This inventory describes the implementation in the accompanying patch. A working adapter is
not evidence that every legacy asset has correct metadata or that a gameplay route has been
visually accepted. The [authoring guide](../NOCTURNE_AUTHORING.md) is the contract for adding
content; [content-validation.md](content-validation.md) records the actual WebGL fixture run.

## Runtime ownership

The renderer creates one [`NocturneRuntime`](../../../src/render/nocturne/runtime.js).
[`NocturneContent`](../../../src/render/nocturne/content.js) publishes bounded owner-attached
sources; [`NocturneHeadlightSources`](../../../src/render/nocturne/headlightSources.js) publishes
player/NPC searchlights; the [compatibility bridge](../../../src/render/nocturne/bridge.js)
turns existing VFX and weapon requests into logical sources. They compete in the same
[`NocturneDirector`](../../../src/render/nocturne/director.js), which keeps eight point lights
and three spotlights resident. The independent shadow owner reserves one of those spots.

The content census runs at 4 Hz with at most 32 nearby owners and 128 content sources. Registry
capacity, event-pool capacity, and GPU residency are separate bounds. Frame updates touch the
admitted socket chains; they do not traverse the scene. A 4 Hz caster hash includes nearby
non-emitting collidable ships, stations, wrecks, structures, gates, and asteroids so stationary
lamp shadows invalidate when other geometry moves through them.

## Coverage inventory

| Content category | Actual runtime integration | Demonstrated evidence and limits |
| --- | --- | --- |
| Player ship searchlight | Named visible headlight socket or legacy presented bow pose; critical spot source with shadow eligibility | Hidden/detached socket and one-slot capacity regressions. Combat fixture illuminates a release Kestrel target. Full flight route remains a separate gate. |
| NPC headlights | Bounded nearby ship census, same registry and spot budget | Uses presented root yaw and visible socket hierarchy; source may lose residency to a more important light. |
| Player engine/thrusters | Existing sustained plume and boost/afterburner event requests flow through the logical VFX bridge | Existing authored envelopes retained. Content suppresses a duplicate automatic player drive. Does not add a lamp per RCS puff. |
| NPC engines | Actual `SOCKET_Engine` / `HOOK_DRIVE_CORE` or actual emitting mesh, with thrust/speed response | Fixture and lifecycle tests cover the adapter; individual release models still need suitable emitters. |
| Navigation lamps | Named port/starboard sockets or distinct emitting meshes; low-priority, short-range sources | Combat fixture and real Kestrel emitting geometry. They intentionally yield to searchlights and combat events. |
| Stations and docks | Station classification uses native `stationTypeId`, archetype, definition, and existing fixture metadata; approach/service layout | Automatic fallback uses visible real emissive geometry. A dark station receives no fabricated core or lamp. |
| Shipyards, factories, foundries | Industrial layout: overhead sodium key, furnace aperture and cyan work site | Three physically separated sources demonstrated on a synthetic industrial rig; exact industrial release-location acceptance is still required. |
| Gates | Two collar/return sources bound to actual emitting features | Runtime integration exists; no dedicated gate screenshot or public-route acceptance is claimed. |
| Research and security structures | Narrow examination/search spot plus local service point | Research sites do not get an invented reactor. Model/socket availability controls source admission. |
| Derelicts and wrecks | Conditional emergency points and active exposed core | Compartment fixture demonstrates separate red pools and low cyan core. Ordinary wrecks stay dark. Point sources do not provide bulkhead occlusion. |
| Unstable and vented reactors | Native salvage `unstableReactor` record; vent/burst/towed-clear state; `ventedCore` pickup with `cooledAt` | Read-only state regression proves old core extinction. Source still requires actual visual emission or explicit authored metadata. |
| Luminous minerals | Native luminous asteroid definition IDs plus explicit `oreGlow`/`luminous`; real vein/emitter binding | Native builder has glowing vein/shard geometry. Fully instanced-only emitters without a retained per-entity node are not admitted; this is a known gap. |
| Alien organisms/fauna | Native `ecology.speciesId`, emitting tissue/material, disguise gate, growth contract | Alien fixture tests low/high spatial emitters and probe sampling on translated instances. Actual fauna material rhythms feed source output. No automatic gas on every animal. |
| Weapon ignition and impacts | Existing VFX event-light and weapon-light requests become logical sources | Muzzle, beam, impact and weapon pool retain their authored timings and share residency. Not every projectile receives a persistent light. |
| Explosions and destruction | Existing explosion/rupture/breach event plans feed the logical VFX pool; destroyed owners retire | Source lifecycle and bridge tests; no whole combat encounter performance claim. |
| Shields | Existing contact/break event lighting goes through the same pool | No separate shader light census and no invented always-on shield fill. |
| Powers and special environments | Existing field/tether/tell VFX requests, Bolus field lights and marrow searchlight use logical proxies | Integration is in runtime code. Individual special-power/location visual acceptance remains pending. |
| Mining tools and ore breaks | Existing contact/yield/shatter/vein event plans use the VFX bridge | Real impact illumination follows existing event positions; passive mineral coverage has the instancing limitation above. |
| Welding and electrical arcs | Named authoring profiles support placed/pulsed sources | Profiles and metadata contract are implemented. A complete asset-by-asset automatic producer retrofit is not claimed. |
| Hazards, emergency power, repair | Existing VFX hazards and native salvage state plus read-only power/heat/emergency contracts | Damage/destruction/venting are backed by native fields. Optional facility power, repair, production and biological growth fields are contracts, not proof of producers in every subsystem. |

The existing event producers and their authored identities are in
[`vfx.js`](../../../src/render/vfx.js) and
[`vfxColorLightDirector.js`](../../../src/render/vfxColorLightDirector.js). Native salvage state
is in [`systems/salvageActions.js`](../../../src/systems/salvageActions.js); real fauna glow
animation is in [`faunaVisuals.js`](../../../src/render/faunaVisuals.js); asteroid glowing
geometry is in [`visualFactory.js`](../../../src/render/visualFactory.js). These pointers identify
runtime mechanisms, not a claim of complete visual audit of every call site.

## Four authored spatial compositions

| Composition | Direct spatial design | Local indirect / medium | Exposure range |
| --- | --- | --- | --- |
| Industrial | Elevated diagonal sodium light, lateral furnace, isolated cyan bench | Small warm directional irradiance / reflection lobe; flattened dust region | 0.72–1.00 |
| Derelict | Separated emergency batteries and low exposed core, with dark intervening compartments | Very faint local field; smoke requires live reactor or an explicit smoke/media declaration | 0.68–0.90 |
| Combat | Moving bow cones, engine pools and small navigation sources | No blanket ambient probe or arena medium | 0.80–1.04 |
| Alien | Low biological root pool, higher opposing crown | Compact normal-dependent field and roughness-broadened radiance; fauna need explicit gas/smoke/spore state for media | 0.72–0.96 |

These arrangements bind actual source positions; the palette alone does not determine the
composition. Authored aims are separate from source locations. The camera exposure multiplier
adapts slowly inside the authored range; it does not meter a dark frame and brighten it globally.

## Indirect and reflection scope

[`probes.js`](../../../src/render/nocturne/probes.js) implements up to four compact analytic
fields inside the actual physical-material shader. Diffuse response depends on the world-space
normal; specular response depends on reflection direction and roughness. Fragment positions come
from Three's completed model/view transform, including batching, skinning, morphs and instancing.
The fixture specifically compiles and draws ordinary and translated instanced meshes. It does
not yet include a skinned or batched visual fixture.

This is an authored irradiance/radiance approximation, not baked GI, dynamic bounce tracing, or a
captured reflection of scene geometry. Its support is spatially bounded, but it does not know
about walls inside the region. Keep enclosed-room fields small and dark. Optional static PMREM
CubeUV textures can be bound per root without continuously updating a cubemap; material clones
are isolated, restored and disposed on owner release. No existing capture bake is claimed.

## Validation and outstanding acceptance

The focused content suite covers frozen/read-only state, scaled and animated sockets, missing
socket failure, automatic actual-emitter binding, material power, nearest bounded density,
same-ID rematerialization, LOD replacement, moving casters, native reactor venting, fauna disguise,
compact probe support, static-reflection isolation and strict metadata validation. See
[`test/nocturne-content.test.mjs`](../../../test/nocturne-content.test.mjs).

The WebGL fixture uses the exact vendored Three revision, production illustrated shader,
content/director/probe modules and HDR compositor at the normal 144 WU chase distance, 60° tilt
and 50° vertical FOV. It compares non-emissive surface pixels with local illumination toggled,
while keeping bloom and atmosphere off. It separately renders complete media/bloom compositions,
a bright Arcade-mood comparison and the HEAD-verified Kestrel release GLB. Program count is
checked across toggles, and browser errors are fatal. Synthetic layouts are labeled as such.

CPU submit times on SwiftShader are diagnostics only. These captures do not certify the requested
2–3 ms incremental GPU envelope, real-hardware frame pacing, whole-game draw/memory deltas, or
representative combat/station/mining/derelict/dense public routes. The public gameplay smoke and
its upstream boot blockers are documented separately by the integration owner. This work remains
a draft review until those gates and the remaining asset-specific coverage have been resolved.
