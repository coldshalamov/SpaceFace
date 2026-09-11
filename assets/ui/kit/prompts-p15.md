# P15 exact image-generation requests

Producer: Codex. Every master uses the built-in `image_gen` tool (`image_gen.imagegen`). No CLI/API fallback or third-party connector was used.

Original native masters and corrections are retained in `.devshots/ui-packets/S2-work/P15/masters/`. Final tiles use Lanczos downsamples only. Arena masked partners use a smooth rectangular vignette in real alpha. No master was upscaled.

The dispatch reference paths were stale. Read-only references resolved to `approved/frames/frame-crucible-door.png`, `approved/plates/plate-crucible-door.png`, and `approved/frames/frame-title-v2.png` (the pick in kit-notes).

Art extrapolation: P15 scene layouts and power-coupler equipment are original mood imagery constrained by the named subjects and approved world. Daily/Weekly use blank scheduling hardware because baked text is forbidden.

**BLOCKED: image_gen — native backdrop resolution.** Both the large-canvas request and explicit native outpainting request returned 1672x941. Required 1920x1080 cannot be derived without enlargement. Attempts remain scratch only; no backdrop entry is added to the manifest.

## tile.arena.ricochet-foundry

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/plates/plate-crucible-door.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.ricochet-foundry.png` (1672x941). SHA-256: `43a3482a7cf36714d771216354ea8c368161b0f42b8c5022bdb978cf1e013060`.

Exact request:

```text
Use case: stylized-concept (finished physically rendered game keyart, not concept art).
Create ONE finished SpaceFace arena tile, Ricochet Foundry, landscape 16:9, render at 2560x1440 or the largest native landscape size available, minimum 1280x720. Reference image is the approved SpaceFace Crucible world plate: match its actual game-render material language and warm forge grade exactly, but author this as a tightly composed standalone tile, not a crop.
Subject: hard gunmetal ricochet banks, open triangulated conveyor trusses, two industrial container racks and compact moving machinery under forge light. Sparse, legible industrial arena in vacuum. Three clear masses frame one central navigable gap. No player ship cut off at foreground.
Camera family lock: high three-quarter camera, 40-degree downward pitch, 50 mm lens, restrained perspective, far-field horizon at 38 percent image height. Central subject occupies 70 percent of image width; entire composition survives at 160 px wide.
Lighting/materials: warm near-black #0C0A08 recesses, matte gunmetal #1A1714, concrete physical roughness and worn edges, restrained copper-amber forge bounce and white-hot edge illumination. Crisp manufactured geometry, contact shadows, sparse dark far field. Preserve solid forms, no volumetric fog blanket. Warm ash-brown filmic grade shared with subsequent arenas; environmental light is local.
Render like a shipped Three.js/Cycles space game still matching the reference: simple purposeful machinery with real depth, physically lit, no painterly strokes, no intricate generic sci-fi city, no cinematic wallpaper, no holograms, no blue neon, no UI border. No text, letters, digits, logos, labels, or watermark anywhere. Opaque full-bleed image.
```

## tile.arena.lagrange-crucible

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.arena.ricochet-foundry.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.lagrange-crucible.png` (1672x941). SHA-256: `ead13a2cec52fd5698f64384a81cad17841fdc11ad20e1f49e2dcc545a21711f`.

Exact request:

```text
Create ONE finished SpaceFace Crucible arena keyart tile, landscape 16:9, largest useful native output, requested 2560x1440 (at least 1280x720). Reference is our approved Ricochet Foundry tile: keep the same lens, high three-quarter view (40-degree downward camera, 50 mm), far-field horizon at 38% height, solid physically rendered game geometry, warm near-black shadows and copper-amber/ash-brown filmic tone mapping. This is a DIFFERENT arena with a new subject/layout, not a colour change. Compose specifically for a 160 px-wide tile: three strong masses, clear central playable channel, foreground/midground depth, crisp silhouette. Lighting must reveal real material and contact/occlusion. No UI, no text, no letters, digits, emblems, labels, logos, or watermark. No painting, concept illustration, movie wallpaper, vast sci-fi cities, cockpit, scanlines, hex grids, neon holograms, fuzzy glows, noise fields or fog blanket. Full-bleed opaque image, no border.
Subject: Lagrange Crucible. Orbital debris field, three substantial broken chunks of old industrial truss and solid basalt boulders suspended above a dark orbital plane. Arranged on two sides of a gravitationally distorted central gap; a localized transparent heat-lens shimmer subtly bends the distant stars through the gap. No glowing ring, no giant portal. Worn gunmetal salvage edges and amber-lit rock, deep black sparse stars, tiny cold glints only on fracture edges. Horizon and camera match the reference, with the dominant debris belt around mid-frame. Gameplay-scale orbital salvage, substantial unromantic working machinery.
```

## tile.arena.cinder-sluice

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.arena.ricochet-foundry.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.cinder-sluice.png` (1672x941). SHA-256: `69776034292fd294008500dd7ee63c92be476630e96d544817a64214848f84b1`.

Exact request:

```text
Create ONE finished SpaceFace Crucible arena keyart tile, landscape 16:9, largest useful native output, requested 2560x1440 (at least 1280x720). Reference is our approved Ricochet Foundry tile: keep the same lens, high three-quarter view (40-degree downward camera, 50 mm), far-field horizon at 38% height, solid physically rendered game geometry, warm near-black shadows and copper-amber/ash-brown filmic tone mapping. This is a DIFFERENT arena with a new subject/layout, not a colour change. Compose specifically for a 160 px-wide tile: three strong masses, clear central playable channel, foreground/midground depth, crisp silhouette. Lighting must reveal real material and contact/occlusion. No UI, no text, no letters, digits, emblems, labels, logos, or watermark. No painting, concept illustration, movie wallpaper, vast sci-fi cities, cockpit, scanlines, hex grids, neon holograms, fuzzy glows, noise fields or fog blanket. Full-bleed opaque image, no border.
Subject: Cinder Sluice. A narrow diagonal channel of cooling slag cuts from front-center towards the same distant horizon; tall low-sided dark iron sluice banks direct it, two cooling crust islands occupy either flank, sparse suspended ash and dust with real depth. Black fractured clinker crust, thin ember-orange seams under the crust, one heavy industrial gate in the middle distance. This reads as a cooling slag route with one recognizable branching fissure and a clear channel, not a lava landscape or volcano. Physically worn materials, amber working light, low dust density, no fire curtain.
```

## tile.arena.cryo-drift

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.arena.ricochet-foundry.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.cryo-drift.png` (1672x941). SHA-256: `852cc46321eb40a3a4238110caa8bd0ccff5a82ed0ce629eec2b2100322f39a7`.

Exact request:

```text
Create ONE finished SpaceFace Crucible arena keyart tile, landscape 16:9, largest useful native output, requested 2560x1440 (at least 1280x720). Reference is our approved Ricochet Foundry tile: keep the same lens, high three-quarter view (40-degree downward camera, 50 mm), far-field horizon at 38% height, solid physically rendered game geometry, warm near-black shadows and copper-amber/ash-brown filmic tone mapping. This is a DIFFERENT arena with a new subject/layout, not a colour change. Compose specifically for a 160 px-wide tile: three strong masses, clear central playable channel, foreground/midground depth, crisp silhouette. Lighting must reveal real material and contact/occlusion. No UI, no text, no letters, digits, emblems, labels, logos, or watermark. No painting, concept illustration, movie wallpaper, vast sci-fi cities, cockpit, scanlines, hex grids, neon holograms, fuzzy glows, noise fields or fog blanket. Full-bleed opaque image, no border.
Subject: Cryo Drift. A drift of three large solid irregular blue-white ice bergs with opaque milky cores and sharp translucent chipped edges, suspended through a sparse industrial arena. Clear gap between the largest near-left berg and a smaller near-right one, further broken ice at the shared horizon. Ice has layered fractures and occasional embedded dark mineral, never emissive. Cold blue-white local light on the ice contrasts with warm near-black shadow grade and a restrained amber practical on a distant steel truss. Dark quiet orbital far field; no planet, no nebula, no soft icy fog. Recognizable ice silhouette even in a tiny smoked tile.
```

## tile.arena.storm-lattice

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.arena.ricochet-foundry.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.storm-lattice.png` (1672x941). SHA-256: `679461c1c2ab08912b60bd46e1cba6c63c375a6833e7648c3b35ce5eb7a322eb`.

Exact request:

```text
Create ONE finished SpaceFace Crucible arena keyart tile, landscape 16:9, largest useful native output, requested 2560x1440 (at least 1280x720). Reference is our approved Ricochet Foundry tile: keep the same lens, high three-quarter view (40-degree downward camera, 50 mm), far-field horizon at 38% height, solid physically rendered game geometry, warm near-black shadows and copper-amber/ash-brown filmic tone mapping. This is a DIFFERENT arena with a new subject/layout, not a colour change. Compose specifically for a 160 px-wide tile: three strong masses, clear central playable channel, foreground/midground depth, crisp silhouette. Lighting must reveal real material and contact/occlusion. No UI, no text, no letters, digits, emblems, labels, logos, or watermark. No painting, concept illustration, movie wallpaper, vast sci-fi cities, cockpit, scanlines, hex grids, neon holograms, fuzzy glows, noise fields or fog blanket. Full-bleed opaque image, no border.
Subject: Storm Lattice. A sparse working array of charged pylons: three clear pairs of tall ceramic-insulated steel masts linked by a triangulated industrial crossbeam, arranged to create a navigable central corridor. One sharply forked white electrical discharge physically connects two near pylon terminals above the corridor; two smaller residual branches, not a full-screen lightning storm. Burnt gunmetal bases, pale ceramic insulators, amber field worklights, white local arc lighting, warm dark shadow grade. No glowing rings, no forcefield mesh, no cyan neon grid. Real substantial pylon geometry remains the subject.
```

## tile.difficulty.1

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/frames/frame-title-v2.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.1.png` (1774x887). SHA-256: `321afd094ea524c09365b212944ebbab382ce9f2034009d5b86d3f028b7d7b5a`.

Exact request:

```text
Use case: product-mockup; one original physical SpaceFace difficulty equipment tile. Reference image is visual style/material/world guidance only; do not copy its UI or title. Create pristine ground-service equipment, a compact industrial power coupler on two short feet with a squat rectangular bolted gunmetal housing, a broad ceramic collar around one recessed round socket facing three-quarter left, two protective horizontal rails, and one thick amber power cable looping into a top-right strain relief. One equipment unit only, same unit will be edited into used/battered/burning states later. Clearly connected parts and believable matte alloy, dark sprayed enamel, off-white ceramic; restrained amber practical edge light, warm black workshop background. Wide 2:1 composition, requested 2048x1024 native, minimum 640x320. Camera locked 50 mm high three-quarter close view; equipment fills central 75% width, generous dark margin all sides, no cropping; entire silhouette readable at 160x80. Clean freshly serviced state, no damage, no grime, no fire. Match reference's solid physically rendered game look, not painting or generic sci-fi concept art. No text, no labels, no brand, no letters, no digits, no warning pictograms, no typography, no UI or frame. Opaque full-bleed.
```

## plate.backdrop.hangar-wall

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/frames/frame-title-v2.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/plate.backdrop.hangar-wall.png` (1672x941). SHA-256: `3e4fcfec68435f92cb4de8f6f2f9516cc54d432f2bb24cc948cfdbdbaf458411`.

Exact request:

```text
Create one finished SpaceFace fallback backdrop plate: a quiet dark warm hangar wall in the same physical industrial game-render world as the reference. Reference is for materials and light only, exclude its text and UI. OUTPUT RESOLUTION REQUIRED: 3840 x 2160 pixels, or at least 1920 x 1080 native pixels, 16:9 landscape. This is a full-screen shipped-game background, not a thumbnail; please use your highest native resolution, do not upscale a smaller image.
Scene: near field at bottom-right has a sharply resolved maintenance gantry foot and a small portion of a triangulated support truss; background is a dark warm-gunmetal hangar wall with large quiet overlapping sheet-metal bays, relieved seams and sparse rivets, a recessed cable run at far right, very subdued amber reflected worklight. Out-of-focus far field; crisp tactile near-field metal edges, authentic contact shadow and worn enamel, subtle surface roughness rather than noise. Main center and left areas broad quiet shadowed material with actual depth; no hero object, no spacecraft, no UI panel. Worker-used built material, not empty black or flat fill. Cinematic yet unromantic Three.js/Cycles render matching SpaceFace.
TEXT-SAFE EXPOSURE: every region including practicals and highlights must remain dark enough for opaque bone #E9E4D8 text at 4.5:1 contrast. Brightest surface roughly #625344, no pixels brighter than middle-dark gray, no white bulbs or light sources in view; keep all practical illumination indirect. Warm near-black #0C0A08 and muted gunmetal with amber bounce. No text, digits, labels, logos, UI, typography or watermark anywhere. No concept art, painting, glossy science-fiction wallpaper, holograms, neon, heavy fog, or border. Full-bleed opaque.
```

## tile.arena.cinder-sluice-clean

Tool: built-in `image_gen`.
Revision target: `tile.arena.cinder-sluice`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.arena.cinder-sluice.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.arena.cinder-sluice-clean.png` (1672x941). SHA-256: `9c661726d3d52957f4a7955c95c777c498a1ccce5a14be2f4333402440b0b36e`.

Exact request:

```text
Edit the supplied Cinder Sluice image. Remove ALL baked lettering, tiny words, numbers, labels and pseudo-text from the iron sluice walls and every piece of machinery. Replace only those markings with continuous worn blank iron matching the surrounding material. Also align the central distant ground/sky horizon to approximately 33 percent height, matching the Foundry camera family; preserve the high three-quarter perspective and central slag-channel composition. Keep the cooling crust, molten seams, gate, camera lens, material identity, warm grade, lighting and 16:9 dimensions. No new text or symbols anywhere. This is a finished game tile, not a painting. Do not add details.
```

## plate.backdrop.hangar-wall-native-size

Tool: built-in `image_gen`.
Revision target: `plate.backdrop.hangar-wall`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/plate.backdrop.hangar-wall.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/plate.backdrop.hangar-wall-native-size.png` (1672x941). SHA-256: `79018b1f7739876c7b5b786cf47bf15132435f4f55a84afdba21708e84d8ce37`.

Exact request:

```text
Canvas outpainting / native-resolution delivery correction only. The supplied backdrop file is 1672 x 941 pixels. Required deliverable is at least 1920 x 1080 pixels, and interpolation/upscaling is forbidden. Expand its actual pixel canvas to 2048 x 1152, retaining the supplied center at its original pixel density and generating matching new physical hangar wall/floor material around its perimeter. Do not merely change the depicted camera or return another 1672 x 941 file. Output actual 2048 x 1152 or larger native PNG. Preserve the dark warm gunmetal hangar wall, seams, right-edge truss and foot, indirect amber light, and quiet text-safe exposure. No letters, digits, logos, white bulbs or UI. The added margins must be part of the same continuous scene.
```

## tile.mode.swarm

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/plates/plate-crucible-door.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.mode.swarm.png` (1254x1254). SHA-256: `7f2dc3a3ef8ae6aead9c038d061aefd2def7bc46975a61d82a0eb5a04dd7caf8`.

Exact request:

```text
Make ONE finished square 1:1 SpaceFace Crucible mode tile, requested 1536x1536 native, minimum 640x640, opaque full-bleed. The reference is the game's approved Crucible plate for construction vocabulary, materials and lighting only. Author the scene for a 160x160 smoked window: bold central silhouette, few large readable forms, near/mid/far physical depth, generous breathing room, no tiny dominant detail. Match real physically lit game-render geometry and the reference's warm gunmetal, near-black shadows, restrained amber light with bone-white highlights. No painting, no concept-art strokes, no generic sci-fi wallpaper, holographic interface, neon grids, cockpit or decorative panel border. Absolutely NO letters, words, digits, labels, logos, watermark or typography; any scheduling idea must use blank physical shapes and lights, never text.
Subject Swarm: a WALL OF LIGHT SPACECRAFT charging towards the viewer through the foundry. A wedge-shaped compact industrial scout in the middle foreground, flanked by two slightly smaller craft, then staggered rows of 15 small light ships receding upward behind, clearly ships with hulls and thruster roots, not sparks. Dense formation as one unmistakable triangular wall. Bright amber/white engine accents on substantial gunmetal silhouettes; central ships occupy two-thirds width; dark foundry trusses only at distant edges.
```

## tile.mode.gauntlet

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/plates/plate-crucible-door.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.mode.gauntlet.png` (1254x1254). SHA-256: `2e4d2e6fe0ff99d808b795cd64421a1f06cff97feffcef187ed469db6de20d33`.

Exact request:

```text
Make ONE finished square 1:1 SpaceFace Crucible mode tile, requested 1536x1536 native, minimum 640x640, opaque full-bleed. The reference is the game's approved Crucible plate for construction vocabulary, materials and lighting only. Author the scene for a 160x160 smoked window: bold central silhouette, few large readable forms, near/mid/far physical depth, generous breathing room, no tiny dominant detail. Match real physically lit game-render geometry and the reference's warm gunmetal, near-black shadows, restrained amber light with bone-white highlights. No painting, no concept-art strokes, no generic sci-fi wallpaper, holographic interface, neon grids, cockpit or decorative panel border. Absolutely NO letters, words, digits, labels, logos, watermark or typography; any scheduling idea must use blank physical shapes and lights, never text.
Subject Gauntlet: corridor of three heavy rectangular industrial gates, receding towards a small bright warm exit. First gate frames the inner two within the image, all solid triangulated steel crossbeams and thick chamfered footings. Central navigable corridor recedes upward, strong repeated portal silhouette and amber practical lighting. These are physical launch barriers, not glowing energy portals. No spacecraft needed; gates and the clear route do the storytelling.
```

## tile.mode.daily

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/plates/plate-crucible-door.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.mode.daily.png` (1254x1254). SHA-256: `520157d1f3a019a021cfb649ad77a28fd09ebb2df78aabf63b7d6c2ea94848f6`.

Exact request:

```text
Make ONE finished square 1:1 SpaceFace Crucible mode tile, requested 1536x1536 native, minimum 640x640, opaque full-bleed. The reference is the game's approved Crucible plate for construction vocabulary, materials and lighting only. Author the scene for a 160x160 smoked window: bold central silhouette, few large readable forms, near/mid/far physical depth, generous breathing room, no tiny dominant detail. Match real physically lit game-render geometry and the reference's warm gunmetal, near-black shadows, restrained amber light with bone-white highlights. No painting, no concept-art strokes, no generic sci-fi wallpaper, holographic interface, neon grids, cockpit or decorative panel border. Absolutely NO letters, words, digits, labels, logos, watermark or typography; any scheduling idea must use blank physical shapes and lights, never text.
Subject Daily: a calendar-stamped berth. A substantial little berth service pad occupies the lower half with two docking clamps and a neatly coiled cable. Immediately behind it stands a compact mechanical calendar stamp made from a thick square metal plate with TWO obvious binding loops at its top, seven small recessed square day positions across its lower face and ONE large amber-lit blank square in the center. No numbers or letters in any square. The calendar is a physical scheduling device at the berth, not floating UI or a screen. Make its unmistakable calendar silhouette the largest shape so the daily cadence survives at 160px. Warm practical materials, a quiet shadowed bay behind.
```

## tile.mode.weekly

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/plates/plate-crucible-door.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.mode.weekly.png` (1254x1254). SHA-256: `93d15f1188272ed8fde2a30e8e3c66de8b992bc97a42d65b9b3bb0f9a96ccbaa`.

Exact request:

```text
Make ONE finished square 1:1 SpaceFace Crucible mode tile, requested 1536x1536 native, minimum 640x640, opaque full-bleed. The reference is the game's approved Crucible plate for construction vocabulary, materials and lighting only. Author the scene for a 160x160 smoked window: bold central silhouette, few large readable forms, near/mid/far physical depth, generous breathing room, no tiny dominant detail. Match real physically lit game-render geometry and the reference's warm gunmetal, near-black shadows, restrained amber light with bone-white highlights. No painting, no concept-art strokes, no generic sci-fi wallpaper, holographic interface, neon grids, cockpit or decorative panel border. Absolutely NO letters, words, digits, labels, logos, watermark or typography; any scheduling idea must use blank physical shapes and lights, never text.
Subject Weekly: a week-long route board built as real worker-used hardware. One long snaking brass route rail runs across a worn dark metal planning board in SEVEN clear stops represented by seven large round metal pins, alternating high and low in a purposeful zig-zag. Each station has a blank square docket underneath, seven dockets total, no letters or numerals. One pin glows amber, six are warm bone metal. Board is shot in high three-quarter perspective resting on a berth workbench; small metal clamps at corners, edge thickness and worn material. The seven-stop journey is the main single emblematic composition, not a web dashboard or map covered in microdetail.
```

## tile.mode.ghost

Tool: built-in `image_gen`.
Reference image(s):
- `design/frontend/direction/approved/frames/frame-title-v2.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.mode.ghost.png` (1254x1254). SHA-256: `29dba3e6932b230e783cfa4bcb31e411bdc57fd20dbc30377b103f1f9f2687dd`.

Exact request:

```text
Make ONE finished square 1:1 SpaceFace Crucible mode tile, requested 1536x1536 native, minimum 640x640, opaque full-bleed. The reference is the game's approved Crucible plate for construction vocabulary, materials and lighting only. Author the scene for a 160x160 smoked window: bold central silhouette, few large readable forms, near/mid/far physical depth, generous breathing room, no tiny dominant detail. Match real physically lit game-render geometry and the reference's warm gunmetal, near-black shadows, restrained amber light with bone-white highlights. No painting, no concept-art strokes, no generic sci-fi wallpaper, holographic interface, neon grids, cockpit or decorative panel border. Absolutely NO letters, words, digits, labels, logos, watermark or typography; any scheduling idea must use blank physical shapes and lights, never text.
Subject Ghost: a translucent replay copy of the EXACT Kestrel/Hitch hull shown in the supplied approved title frame. Reference shows the required distinctive squat industrial scout-tug: angular blunt wedge nose, broad split side sponsons, a low ribbed roof and dorsal mast, and the little circular front running light. Match that hull silhouette and component positions; no sleek fighter reinterpretation. Frame the complete ship center, occupying 78 percent width, same elevated three-quarter view. Its physical gunmetal body is semi-transparent so the empty dark berth floor can be seen THROUGH the ship, with one subtle offset dim echo just behind it indicating a recorded replay. White-cold solid panel highlights and a tiny amber running light; no wireframe, no hologram rings, no blue neon outline, no magical fog. Keep the ship substantial enough to identify at 160px. Exclude all reference UI/text.
```

## tile.difficulty.2

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.1.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.2.png` (1774x887). SHA-256: `359e7079f0d6c83a03b5dd88545ddc3da342e1a8e6d42ea987d58818ebdbe0da`.

Exact request:

```text
Precise object edit of the supplied PRISTINE SpaceFace equipment master to difficulty 2, used state. Preserve IDENTICAL equipment design, camera, 2:1 crop, framing, scale, lighting rig, background and every component placement: recessed multi-contact socket and broad ivory ceramic collar, two horizontal gunmetal guard rails on front, rectangular bolted body, short mounting feet, thick amber cable looping into the top-right connector. Do not redesign the equipment. Only add restrained contact wear: slightly chipped paint on protective rails, polishing on the socket rim, grease at cable strain relief, a few scuffs on side plate. Clearly service-used, fully intact. No structural damage or fire. Match physically rendered game materials, no painting, no concept art, no UI or border. No baked text, digits, letters, labels or logos. Same native image dimensions as reference, minimum 640x320.
```

## tile.difficulty.3

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.1.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.3.png` (1774x887). SHA-256: `ffe72a26293e34b957cc4807021533d9e09a07718400db4b86425bee50251e3f`.

Exact request:

```text
Precise object edit of the supplied PRISTINE SpaceFace equipment master to difficulty 3, battered state. Preserve IDENTICAL equipment design, camera, 2:1 crop, framing, scale, lighting rig, background and every component placement: recessed multi-contact socket and broad ivory ceramic collar, two horizontal gunmetal guard rails on front, rectangular bolted body, short mounting feet, thick amber cable looping into the top-right connector. Do not redesign the equipment. The same housing is heavily battered: broad scraped enamel on the right plate, one crushed side corner, a bent lower protective rail, a chipped ceramic collar and dark soot around one socket contact. Keep all original major components attached and identifiable, feet/socket/top cable in the exact same locations. No fire yet. Match physically rendered game materials, no painting, no concept art, no UI or border. No baked text, digits, letters, labels or logos. Same native image dimensions as reference, minimum 640x320.
```

## tile.difficulty.4

Tool: built-in `image_gen`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.1.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.4.png` (1774x887). SHA-256: `8db02a7f466bceb54a045f3c563bc176c8286016c1065e430a5107c51bcd9fc3`.

Exact request:

```text
Precise object edit of the supplied PRISTINE SpaceFace equipment master to difficulty 4, burning state. Preserve IDENTICAL equipment design, camera, 2:1 crop, framing, scale, lighting rig, background and every component placement: recessed multi-contact socket and broad ivory ceramic collar, two horizontal gunmetal guard rails on front, rectangular bolted body, short mounting feet, thick amber cable looping into the top-right connector. Do not redesign the equipment. The same housing is visibly burning after damage: split side seam with concentrated orange flame tongues and blackened edge curling upward at the right rear, scorched ceramic collar, battered lower rail, small embers. Flame is a readable 3D combustion plume with structured tongues, no featureless glow or fog blanket. Keep original equipment silhouette, socket/front rails/feet/top cable identifiable and at exactly the same positions; flames occupy the dark space above-right. Do not destroy or replace the unit. Match physically rendered game materials, no painting, no concept art, no UI or border. No baked text, digits, letters, labels or logos. Same native image dimensions as reference, minimum 640x320.
```

## tile.difficulty.2-readable

Tool: built-in `image_gen`.
Revision target: `tile.difficulty.2`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.2.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.2-readable.png` (1774x887). SHA-256: `67bcb00865089a18ac4ea78bd57244f98e916d475d40de9c8d37d086748e046d`.

Exact request:

```text
Edit ONLY the wear on this identical SpaceFace power-coupler unit for the USED difficulty tile. The previous pristine and used images become indistinguishable at 160x80 beneath 45% smoked glass. Make used service history visible as ONE broad dark oily hand-smear across the upper-left quarter of the ivory ceramic socket collar and a matching greasy wiped patch around the right-side plate's bottom-front fastener. Add a single bright rubbed contact band at the center of the intact lower front guard rail. These few large marks must read at thumbnail size; keep the rest maintained, with NO dents, NO cracks, NO chips out of the ceramic, NO flames and no new equipment. Preserve exact object silhouette, scale, camera, 2:1 dimensions, lighting, background, all bolts, collar shape, socket contacts, rails, feet and amber cable positions. Keep physical unromantic game-render materials, no text, letters, digits, labels, logos, painting or UI. This is USED but functional, not broken.
```

## tile.difficulty.3-readable

Tool: built-in `image_gen`.
Revision target: `tile.difficulty.3`.
Reference image(s):
- `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.3.png`

Native output: `.devshots/ui-packets/S2-work/P15/masters/tile.difficulty.3-readable.png` (1774x887). SHA-256: `1b24ad7b6d74cd8f08a6f9ece775803ada0537ccca36c177042ae207793d12ff`.

Exact request:

```text
Edit ONLY the damage on this identical SpaceFace power-coupler unit for the BATTERED difficulty tile. Damage must be distinct at 160x80 beneath 45% smoked glass. Enlarge the existing missing chip at the lower-right of the ivory ceramic collar to a visibly broken-out wedge of about one fifth of its circumference, exposing a dark rough substrate. Deepen the existing central kink in the lower front guard rail into one unmistakable downward V-shaped bend, keeping both ends attached in their exact positions. Make the broad right-side panel scrape a single clear rubbed-silver gouge, no additional noise. Preserve the equipment, camera, 2:1 framing, scale, housing silhouette, upper rail, round socket contacts, bolts, mounting feet and amber top-right cable positions. No fire, no smoke, no detached parts. Same dark warm physically rendered game lighting and materials. No text, digits, letters, label, logo, UI or painting.
```
