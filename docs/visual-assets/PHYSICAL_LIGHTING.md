# SpaceFace: physical local-light authoring

NOCTURNE now owns world-local lighting. Start with the
[architecture](NOCTURNE_ARCHITECTURE.md), [asset-authoring guide](NOCTURNE_AUTHORING.md),
[coverage inventory](nocturne/content-coverage.md), and [validation report](nocturne/VALIDATION.md).
Those documents supersede the initial two-fixture/six-event-light implementation described in
this PR's earlier commits.

## Shared visual contract

An emissive material supplies the visible bulb. Real direct illumination supplies colored
falloff and geometric shading on adjacent surfaces. Bloom responds to high radiance but does
not replace that illumination. Vacuum remains optically clear; visible shafts require an
actual participating medium. Do not add transparent beam cones or unlit halos to imitate it.

The existing Look system remains the owner of broad mood, sun, fill and grading.
`src/data/nocturneLighting.js` owns local-light profiles and environmental compositions.
Forge retains surface materials and authored emission. The illustrated shader preserves true
local RGB contribution outside its broad pigment ceiling.

## Runtime ownership

Ships, stations, weapons, VFX and environment fixtures publish logical sources. The director
assigns a stable set of eight physical point lights and three spotlights, independently of
the number of logical sources. Headlights and combat events participate in that shared budget.
The separate local shadow budget owns one reusable map. Only its selected light supplies real
occlusion; unshadowed sources can leak through walls. An authored `requiresOcclusion` source
fails closed when no shadow slot is available.

Content binds visible authored sockets or actual emissive geometry, follows their transforms,
and retires sources on replacement, power loss and destruction. Automatic layouts do not invent
bulbs for dark meshes. New assets should use named profiles and `nocturne` metadata through the
current authoring guide, rather than adding light objects to the renderer or VFX pools.

## Compatibility owner

`src/render/ambientFixtures.js` and the standalone `HeadlightPool` remain available to isolated
scenes that do not install NOCTURNE. Their original six-point-light event pool, two borrowed
fixture slots and three unshadowed headlights describe that compatibility mode only. The game
renderer installs NOCTURNE and bypasses the legacy ambient-fixture allocation. Existing legacy
metadata remains useful to that path; it is not the asset-authoring contract for the new runtime.

## Verification

Run `npm run check:nocturne` for the focused runtime, authoring and preload checks. Use
`npm run check:nocturne:authoring -- path/to/asset.glb` to validate asset metadata and sockets.
The validation report provides reproducible direct-light, indirect, atmosphere, bright/dark and
context-recovery fixtures, with their exact source identities and measured limitations.

Judge adjacent surfaces at the ordinary gameplay camera with bloom disabled. Preserve intentional
darkness and verify shadow occlusion where allocated. Focused tests and software-WebGL captures
do not establish whole-game visual acceptance or the target integrated-GPU frame budget.
