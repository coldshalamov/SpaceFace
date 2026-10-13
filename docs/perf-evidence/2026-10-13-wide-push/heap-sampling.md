# Live heap by allocation site (V8 sampling profiler, 16 KB interval)

Sampled live total: 103.8 MB. JS heap at milestones: before New Game 301 MB, first flight frame 798 MB, end of flight tail 1021 MB.

## By source file

| MB | file |
|---:|---|
| 39.2 | `vendor/three.core.js` |
| 19.1 | `(native)` |
| 8.7 | `vendor/addons/loaders/GLTFLoader.js` |
| 6.5 | `src/render/renderPackageLoader.js` |
| 6 | `vendor/three.module.js` |
| 4.9 | `src/contracts/renderPackage.js` |
| 3.4 | `src/core/simLaneMain.js` |
| 1.4 | `src/render/renderer.js` |
| 1.3 | `src/render/packageCpuDetach.js` |
| 1.3 | `src/render/partsLibrary.js` |
| 1.2 | `src/render/assetResidency.js` |
| 1.1 | `src/render/assetLoader.js` |
| 0.9 | `src/render/glbPrepass.js` |
| 0.7 | `src/render/thruster/systems/continuousPlume.js` |
| 0.6 | `src/render/openingSubmissionPlan.js` |
| 0.5 | `src/localization/pipeline.js` |
| 0.5 | `src/render/illustratedSurface.js` |
| 0.4 | `src/render/authoredMotion.js` |
| 0.4 | `src/render/vfx.js` |
| 0.3 | `src/render/openingGpuAdmission.js` |
| 0.3 | `src/render/visualFactory.js` |
| 0.2 | `src/ui/hud.js` |
| 0.2 | `src/contracts/motionBank.js` |
| 0.2 | `src/world/activityRuntime.js` |
| 0.2 | `src/render/asyncAdmission.js` |

## By function

| MB | function |
|---:|---|
| 15.7 | `Object3D @ vendor/three.core.js:11757` |
| 7.8 | `cloneUniforms @ vendor/three.core.js:37307` |
| 5.8 | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 4.9 | `loadResolved @ src/render/renderPackageLoader.js:107` |
| 3.8 | `stableJsonStringify @ src/contracts/renderPackage.js:265` |
| 3.3 | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 1.9 | `set @ (native):0` |
| 1.8 | `BufferAttribute @ vendor/three.core.js:16696` |
| 1.6 | `getDependency @ vendor/addons/loaders/GLTFLoader.js:2928` |
| 1.5 | `multiplyMatrices @ vendor/three.core.js:10385` |
| 1.5 | `copy @ vendor/three.core.js:13272` |
| 1.5 | `getBindingState @ vendor/three.module.js:1873` |
| 1.4 | `Set @ (native):0` |
| 1.4 | `join @ (native):0` |
| 1.4 | `Float32Array @ (native):0` |
| 1.3 | `map @ (native):0` |
| 1.3 | `(V8 API) @ (native):0` |
| 1.2 | `Material @ vendor/three.core.js:20414` |
| 1.1 | `stableJsonValue @ src/contracts/renderPackage.js:257` |
| 1 | `deepFreeze @ src/render/renderPackageLoader.js:1109` |
| 1 | `delete @ (native):0` |
| 1 | `MeshPhysicalMaterial @ vendor/three.core.js:38336` |
| 1 | `(BYTECODE_COMPILER) @ (native):0` |
| 1 | `generateUUID @ vendor/three.core.js:2295` |
| 0.9 | `get @ (native):0` |
| 0.9 | `addEventListener @ vendor/three.core.js:2182` |
| 0.9 | `createBindingState @ vendor/three.module.js:1920` |
| 0.9 | `BufferGeometry @ vendor/three.core.js:18165` |
| 0.9 | `(anonymous) @ src/render/glbPrepass.js:72` |
| 0.9 | `add @ (native):0` |
| 0.8 | `registerAsset @ src/render/assetResidency.js:265` |
| 0.8 | `updateMatrix @ vendor/three.core.js:12821` |
| 0.8 | `Map @ (native):0` |
| 0.7 | `replace @ (native):0` |
| 0.7 | `(IDLE_EXTERNAL) @ (native):0` |
| 0.6 | `copy @ vendor/three.core.js:9998` |
| 0.6 | `sfTransformSignatureStore @ vendor/three.module.js:128` |
| 0.6 | `then @ (native):0` |
| 0.6 | `recordTable @ src/render/renderer.js:1769` |
| 0.6 | `MeshStandardMaterial @ vendor/three.core.js:37926` |
