# Engine ion small retained albedo source

`albedo-brighter-generated.png` is the accepted high-resolution generated source, not a runtime texture. `provenance.json` preserves its two exact imagegen edit prompts, input/output hashes and derivation. Only the final generated original is retained here; the intermediate generation is identified by hash.

Recover the reviewed original geometry to a **fresh scratch path** after canonical promotion (binary-safe; do not redirect `git show` through PowerShell text encoding):

```js
// Run as a Node module from the repository root.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const result = spawnSync('git', ['cat-file', 'blob', '99a051c97a22c95907be99928f0909d79042a56e']);
if (result.status !== 0) throw new Error(result.stderr.toString());
writeFileSync('.devshots/engine-original.glb', result.stdout, { flag: 'wx' });
```

The blob is reachable from commit `a0e41915419d71ec9201dd9d154abc0e3fffb619`. The command below accepts only its reviewed SHA256 and the retained image SHA256, refuses existing output/sidecar paths, and rejects any derived image that differs from the reviewed 256px PNG. A fresh output directory must already exist.

```powershell
node tools/art/refine_engine_ion_small.mjs --source .devshots/engine-original.glb --out .devshots/engine-combined.glb --blender 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --merge-static yes --albedo-source tools/art/sources/engine_ion_small/albedo-brighter-generated.png
```

Omit `--albedo-source` to retain the original image. The optional replacement modifies only the existing shared base-color image; it does not change materials, UVs, samplers, the normal map or drive hooks. The command never publishes. The selected combined output has 4,880 source triangles and seven primitives. Its normalized glTF JSON and binary resources match the accepted scratch candidate exactly; serialization may differ from the earlier two-step scratch export.

After coordinated source promotion, the owning release command is `node scripts/build-sg04-release-assets.mjs --no-clean --only engine_ion_small`. It applies the required shading repair before the shared meshopt profile and KTX2 encoding. Do not substitute the older `tools/art/build_release_parts.mjs`, which lacks that repair. Shared manifest/package promotion remains a separate coordinated step.
