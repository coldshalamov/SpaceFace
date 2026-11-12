# Resolved specification — remove a needless render-program twin

Companion to [SF-256 — Remove needless direct-versus-instanced shader twins](../plans/18-performance/SF-256-remove-needless-direct-versus-instanced-shader-twins.md). Conditional optimization; measure before accepting.

## Hypothesis grounded in the ledger

D38 identifies a family of direct and `GLTFKit_InstancePool_*` submissions differing on the instancing path, after other scheduling changes. That is an opportunity to inspect redundant actual draw contracts, not proof that every pair can be merged. Read [partsLibrary](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/partsLibrary.js), [materialBatchKey](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/materialBatchKey.js), [pipelineReadiness](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/pipelineReadiness.js) and [shaderLinkReporter](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/shaderLinkReporter.js).

## Selected design

For one eligible static opaque family, use the same supported instanced path for both one-instance and many-instance cases **only if** the actual attribute/material/lighting contract permits it. Alternatively avoid submitting a direct specimen that is never the visible production draw. Preserve special families that genuinely require different contracts. Do not solve this by lying in the cache key.

## Before changing the path

Capture the exact family, material key, shader defines, geometry attributes, instancing/skinning/morph requirements, light/environment state, clipping/transparency and relevant per-object bindings for both submissions. Confirm whether both are used on the normal cold route or whether one exists only as redundant preparation. Verify picking/selection, culling and bounds on a one-instance path as well as the many-instance case.

A common program is valid only when shader semantics agree. Uniform values and resources may be separately bound as supported; shader-affecting defines and attribute layouts may not be discarded simply to reduce a counter.

## Bounded patch sequence

Select one family and add a regression case that demonstrates its unnecessary dual submission. Change the preparation/materialization branch so the visible route and readiness route agree. Maintain the same authored materials and correct transforms. Remove the now-redundant candidate only when no live consumer needs it. Keep cancellation and context restoration on the current owner path. Expand to another family only after the first proves both picture and cost.

Do not modify all fleet materials at once, add a new renderer or increase compilation concurrency as a substitute. Do not count fewer programs as success if a formerly correct ship turns black, loses selection, receives the wrong lighting or is culled incorrectly.

## API constraints

Use the repository's installed Three.js version and existing readiness path. Official [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) and the [Khronos extension](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/) describe asynchronous completion polling when available; this avoids needless blocking status checks but does not promise lower total compilation time. WebGL does not expose the native thread-count control implied by some OpenGL discussions. Capability-detect and preserve the current fallback; do not introduce synchronous status polling in the hot path.

## Paired evidence

Compare cold runs with matched route, roster, seed, settings, viewport, device and surrounding load; separate warm-cache behavior. Record which variants were submitted, link completion sequence, time until the exact authored body appears, worst visible wait and current-frame cost. Keep enough repeated samples to distinguish the changed path from host noise and disclose the sample count. Do not claim a precise gain from an unexecuted model or one lucky run.

Check one/many instances, a deliberately incompatible family, selection, material appearance, visibility bounds, cancellation and context restore. If there is no longer a redundant twin at current HEAD, retire this conditional candidate and investigate the measured current path instead of reconstructing an obsolete architecture.
