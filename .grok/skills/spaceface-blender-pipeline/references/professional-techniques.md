# Professional Blender Techniques — Compatibility Route

This path is retained because older SpaceFace prompts and skills may link to it. The canonical,
maintained technique catalog is now:

- `docs/visual-assets/10_TECHNIQUE_CATALOG.md`

The governing workflow and acceptance rules are:

- `docs/visual-assets/00_VISUAL_ASSET_CONSTITUTION.md`
- `docs/visual-assets/07_ACCEPTANCE_GATES.md`
- `docs/visual-assets/08_AGENT_EXECUTION_PROTOCOL.md`

## Important correction

There is no requirement to use a percentage of a technique list, no universal 2–6k/4k ship budget,
and no quality credit for modifier, node, map, pass, or triangle count by itself.

Start with an observed defect. Choose the least expensive method that repairs it and survives export,
normal-route presentation, and representative-scene profiling. The technique catalog maps common
visible failures to candidate methods and required proof.

Examples of available methods include:

- custom-profile, boolean, bevel, subdivision, direct-to-game, high/low, sculpt and retopology work;
- weighted normals and data transfer for valid hard-surface shading;
- deliberate unique/trim/tiled/decal/hybrid UV strategies;
- high-to-low tangent normal, AO, curvature, ID, thickness, position, and related bakes when useful;
- mesh-aware layered materials, texture painting, causal wear, decals, anisotropy, clearcoat, and
  transparent-surface strategies supported by the runtime;
- Geometry Nodes/instancing for genuine repeated structure rather than random greeble spray;
- authored LODs, batching/instancing, meshopt/glTF processing, KTX2 delivery, and runtime profiling;
- rigging, shape keys, sockets, animation, state variants, and VFX support when the gameplay role uses
  them.

None is mandatory merely to sound professional. A result may still fail when it uses many advanced
methods but exposes weak primary form, implausible construction, bad UV/bakes, generic noise,
unstable LODs, missing runtime proof, or unjustified cost.

## Completion

An asset is not finished because the Blender script ran or checks are green. It is `accepted` only
after every applicable G0–G7 gate passes and required independent review is recorded against the exact
candidate hash. Otherwise continue or mark the exact gate `blocked`.
