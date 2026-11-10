# NOCTURNE lighting authoring

NOCTURNE separates an emitter's appearance from the real light it contributes to adjacent surfaces.
An emissive material makes a lamp visible; a logical source participates in the bounded point/spot
lighting director. Neither a bloom halo nor a transparent beam mesh replaces illumination.

The authored extension of the Look lives in [`src/data/nocturneLighting.js`](../../src/data/nocturneLighting.js).
The existing mood rig, material response, and final grade still belong to `lookMoods.js` / `look.js`.
Runtime code is under [`src/render/nocturne/`](../../src/render/nocturne/). These records belong to
presentation. Never write cosmetic lighting state into a live entity, `entity.data`, or a save.

## Two supported authoring routes

**Model metadata is preferred.** GLB extras arrive as Three.js `userData`. Put `nocturneLight` on
an existing lamp node or socket. A string selects a named profile; an object can specify a stable
ID, profile, local offset, aim, priority, intensity, or range.

```json
{
  "nocturneLight": {
    "id": "gantry_searchlight",
    "profile": "sodium",
    "offset": [0, 0.15, 0],
    "priority": 2
  }
}
```

The source follows that exact node's animated, scaled world transform. The offset is in its local
model coordinates. Missing explicitly named sockets fail closed: the light is not moved to the
model origin. Empty marker nodes may be hidden; hidden LOD parents do not emit. Do not attach
lighting metadata to every triangle or every decorative diode.

**An owner can also declare a light list.** Put `nocturne` on the presented model root's `userData`
or in an existing immutable entity definition before the simulation creates it. The render bridge
reads this data; it never adds it to the running simulation. Root metadata takes precedence.

```json
{
  "nocturne": {
    "profile": "industrial",
    "lights": [
      { "id": "key", "profile": "sodium", "socket": "SOCKET_Light_Gantry" },
      { "id": "furnace", "profile": "furnace", "socket": "SOCKET_Light_Furnace" },
      { "id": "task", "profile": "work_cyan", "socket": "SOCKET_Light_Work" }
    ]
  }
}
```

A `nocturne: false`, `nocturne.enabled: false`, or `lightFixture: false` declaration opts out of
automatic emission. Use an explicit list to suppress an inappropriate legacy classification.
`validateNocturneLightMetadata` returns actionable errors for unknown profiles, non-finite values,
invalid vectors, and out-of-bounds intensity/range/priority. The runtime rejects these entries.
IDs and socket names must be nonempty strings. Intensity is finite in `[0, 1000000]`, range is
finite in `(0, 4000]`, and priority is an integer in `[0, 4]`. `enabled`, `shadow`,
`requiresOcclusion`, and `critical`, when present, are booleans. A disabled individual descriptor
remains dark even while its owner is powered. These are validation limits, not suggested output.

Root `nocturne.profile` selects a layout and composition. Supported layouts are `industrial`,
`dock`, `research`, `security`, `gate`, `derelict`, `alien`, `ore`, `core`, and `ship`. Existing legacy
`lightFixture` names (`refinery`, `warning`, `biology`, and others) have aliases in the data module.
Authored light lists may select any light profile independently of their layout.

## Profile catalogue and units

| Profile | Source | Intended use |
| --- | --- | --- |
| `sodium` | Shadow-eligible spot | Yard gantry, industrial overhead lamp |
| `work_cyan` | Point | Service bay and cool task lamp |
| `furnace` | Wide spot approximation | Emitting industrial aperture |
| `dock` | Shadow-eligible spot | Dock approach and berth entrance |
| `research` | Shadow-eligible spot | Narrow examination lamp |
| `security` | Shadow-eligible spot | Patrol/search fixture |
| `gate`, `gate_cyan` | Point | Energized collar and opposing return |
| `emergency` | Point, slow envelope | Battery warning lamp in a powered wreck |
| `reactor` | Point | Active exposed reactor, response to heat |
| `ore` | Point | Explicitly luminous mineral vein |
| `biology`, `biology_violet` | Point | Living emission, slow growth/breath response |
| `engine` | Point | NPC drive spill; the player's live plume has its own source owner |
| `nav_port`, `nav_starboard` | Point | Near-field navigation lights, low priority |
| `welding`, `electrical_arc` | Point | Authored tool/event emission |

Point/spot sources use inverse-square falloff (`decay: 2`). Intensities are Three.js candela-like
game units. Range is a cutoff in world units, not a brightness multiplier. Hex colors are sRGB
input converted by Three to linear light. Shader, probe, and atmosphere math remains linear HDR.
An `area` source is a documented wide-spot approximation: it does not provide an area emitter's
extended penumbra or an LTC rectangle BRDF.

Priority increases from 0 (decoration) through 1 (secondary), 2 (environment), 3 (event), and 4
(player-critical). A profile's `shadow: true` makes it eligible; it does not guarantee a shadow
slot. Unshadowed local lights do not offer accurate bulkhead occlusion. Use a named, well-placed
spot for a source whose occlusion is essential, and mark required occlusion in the registry
contract when an unshadowed fallback would be visually false.

## Applying the system to existing models

The content bridge runs a 4 Hz camera-neighborhood census, retaining at most 32 entity owners and
128 sources. Its selection uses entity positions; the director separately scores their screen
influence and importance against the actual fixed light census. Per-frame source poses use the
presented model and socket transforms, so lighting follows interpolation rather than lagging at
the previous simulation step.

Automatic layouts resolve named sockets first. If a legacy model lacks those sockets, they bind
an **actual visible emissive submesh** and use that emitter's color and geometry center. They do
not put a luminous furnace at an arbitrary point on a dark station. Models with no recognized
socket and no emitting geometry produce no automatic light. Authored metadata is required when
an emission surface is baked into an opaque texture or a large merged submesh cannot identify
individual lamp positions accurately.
An emitter used by a named socket is reserved before choosing later fallbacks, so two layout
entries do not duplicate the same bulb. Named sockets that are themselves emissive meshes also
observe their material's output. Setting that material's emissive intensity to zero removes the
corresponding real contribution; a site with no emitting source contributes no local probe/media.

When a model owner replaces its hierarchy without replacing the root, call
`content.invalidateRoot(root)` after installation. Direct-child changes and hidden/detached LOD
bindings are detected at the census, but an arbitrary deep in-place tree mutation is not polled
with an expensive recurring traversal. Sources are released on despawn, same-ID entity
replacement, distance eviction, and content/runtime disposal.

## Composition and world response

| Composition | Spatial design | Participating medium | Exposure multiplier range |
| --- | --- | --- | --- |
| Industrial | High diagonal gantry key, opposing cool task point, low furnace aperture | A bounded, flattened dust ellipsoid around the machinery | 0.72–1.00 |
| Derelict | Separated emergency points, optional exposed core; dark space between | Smoke only with an active/unstable reactor or explicit smoke/media tag | 0.68–0.90 |
| Combat | Moving bow cones, aft drive pools, port/starboard signals, event flashes | No blanket arena medium; individual emitting sites may contain matter | 0.80–1.04 |
| Alien | Low green root emission and a higher violet crown with slow growth response | A bounded biological/gas ellipsoid; fauna require an explicit smoke/gas/spore state | 0.72–0.96 |
| Vacuum | Existing global rig plus visible local sources | None | 0.85–1.05 |

These are source arrangements, not full-screen palette filters. Automatic rigs must resolve their
sources to real model emitters. Exposure is an authored composition multiplier constrained by the
listed range; it is not a luminance meter that brightens every dark room.

The content adapter reads existing presentation-relevant fields: `alive`, `hull/hullMax`,
`data.powered`, `data.disabled`, `data.powerState`, `data.lightPower`/`powerLevel`,
`data.emergencyLight`, `data.reactorActive`/`unstableReactor`, `data.productionPaused`/`operational`,
`data.heatFraction`/`overheating`, `entity.heat/heatMax`, and explicit biological `growth` or
`biomassFraction`. Not every legacy gameplay system publishes every field. A field's supported
mapping is an authoring contract, not evidence that all corresponding game systems currently
emit it. Damage dims ordinary fixtures. Emergency batteries can remain lit while their hull is
damaged, but explicit power loss and destruction still extinguish them. Repair restores the
output by restoring the authoritative state. Reduced-flash holds rhythms steady.

Ordinary wrecks and rocks remain dark. Native salvage `data.unstableReactor` is supported as
either a boolean or a record; `vented`, `burst`, and `towedClear` extinguish the removed core.
Vented-core pickups use `data.ventedCore` and `cooledAt`, and lose their real light on cooling.
Known luminous mineral definitions (`ast_metallic`, `ast_icy`, `ast_crystalline`,
`ast_rare_exotic`) can bind their actual glowing geometry. Native fauna with
`data.ecology.speciesId` can bind actual emitting tissue; a disguised animal remains dark.
Explicit `oreGlow`, `luminous`, `bioluminescent`, `emergencyLight`, and `reactorActive` metadata
extend this contract. Classification alone never creates a light on a model without an emitter.
Fully instanced asteroid bodies/details without an inspectable per-entity emitting node remain
a coverage gap; the bridge does not invent a bulb from an ore type alone.

## Participating media

The atmosphere owner consumes up to four reused records shaped as follows:

```js
{
  id: 'yard-dust',
  center: new THREE.Vector3(),       // frame-local world coordinates
  radii: new THREE.Vector3(160, 70, 130),
  density: 0.0018,                   // extinction density per world unit
  color: new THREE.Color(0xc4b296),   // linear scattering albedo after conversion
  anisotropy: 0.38,
  extinction: 1,
  noise: 0.35
}
```

Root `nocturne.medium` can override the composition's medium; `false` disables it. In this
content contract `medium.radii` are fractions of the entity's physical radius. The bridge emits
frame-local world-unit radii to the atmosphere owner. Keep media tied to actual dust, gas,
smoke, or biological material. Clear vacuum must remain clear. Lower-resolution ray marching
scatters the selected real lights; there is no beam cone mesh.
`validateNocturneMediumMetadata` validates the finite radii/density/anisotropy contract; `false`
is always a valid opt-out. A glowing creature is not automatically a cloud of participating gas.

## Local diffuse and reflection support

The always-available probe path is an **authored analytic approximation**. Up to four compact
ellipsoid fields contribute low-order, normal-dependent diffuse irradiance and a directional,
roughness-filtered specular lobe. Their contribution is zero outside the authored region. The
physical material shader consumes them before its indirect-light evaluation; moving ships and
instanced surfaces sample their real fragment positions. This adds no capture pass and requires
no material cloning in the ordinary path. It does not simulate dynamic bounce transport, capture
scene geometry, or provide reflected silhouettes. Keep the gains small enough to preserve dark
compartments, and do not use a probe to cover a missing direct light.

`NocturneProbes.bindReflection(root, prefilteredCubeUVTexture, intensity)` additionally supports
an externally authored, prefiltered static local reflection capture. It clones affected physical
materials once on admission to avoid changing another root that shares them, preserves installed
shader hooks, and restores/disposes only its owned clones on release. The texture is borrowed,
never disposed by this owner. Root `nocturne.reflection = { texture, intensity }` can supply this
binding at runtime. Raw cubemaps require preprocessing to Three's PMREM CubeUV representation.
Renderer teardown may pass `{ disposeGpu: false }` through `content.dispose` / `clear` or
`probes.dispose` / `unbindReflection` after context loss. Ownership references and original
materials are still restored, while clone GPU disposal events are suppressed. Ordinary release
keeps normal clone disposal.
There are no continuous cubemap captures and no supplied claim that existing assets already
have a bake. For complex enclosed rooms, authored lightmaps or captured probes remain preferable
to increasing the analytic field's intensity.

## Preview and checks

Run `npm run check:nocturne:authoring` to validate the shared profiles, fixtures, and compositions.
To check an asset before integration, pass its GLB or metadata JSON to
`node scripts/check-nocturne-authoring.mjs path/to/asset.glb`. The command checks metadata bounds,
profile names, duplicate source IDs, per-owner capacity, and named sockets in the GLB node tree.
Run `npm run check:nocturne` for the consolidated runtime and authoring regressions.

1. Use the existing Look bench and the NOCTURNE fixture/benchmark route recorded in the PR's
   validation report. Inspect the same subject with real lights enabled and disabled, and with
   bloom disabled. Adjacent opaque surfaces must change; only a halo change is not acceptance.
2. Inspect at gameplay zoom, including a bright mood and a dark one. Confirm colored falloff,
   shape, shadow occlusion where allocated, and clear vacuum outside media.
3. Switch power off, damage and repair the owner, move a socket, remove the entity, and re-add the
   same ID with a different model. Old sources must not survive.
4. Run `node test/nocturne-content.test.mjs` for socket transforms, read-only state, power/damage,
   lifecycle, bounded density, caster-motion invalidation, compact probe support, vacuum, and
   isolated static reflection binding. These tests are not GPU acceptance.
5. Record the actual browser/GPU backend and before/after frame measurements. Software WebGL can
   verify shaders and pictures, but cannot certify the integrated-GPU millisecond budget.

The focused command is `node scripts/nocturne-content-check.mjs`. Use
`SF_BROWSER_EXECUTABLE=/path/to/chrome` to choose Chromium, and `SF_GL=swiftshader` only when
software rendering is intended. The default outputs live in `.devshots/nocturne-content`.
`--asset-cache=/repository-shaped/cache` adds the Kestrel release model and first verifies its
git blob identity against `HEAD`. The fixture uses the actual 144 WU / 60° / 50° default chase
pose, production registry/director/content/shader modules, and the same linear HDR compositor.
It captures source-off, direct-only, probe-only, combined, and atmosphere/bloom compositions;
the industrial scene also receives a bright-mood comparison. Synthetic rig geometry remains
clearly labeled. This preview does not boot the game or certify a target GPU.

See [the coverage inventory](nocturne/content-coverage.md) and
[the recorded shader validation](nocturne/content-validation.md) for the distinction between
implemented integration, demonstrated pictures, and remaining world/hardware acceptance.
