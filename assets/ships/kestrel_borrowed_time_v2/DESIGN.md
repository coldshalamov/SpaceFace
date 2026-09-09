# SF-K0 Borrowed Time V2 — isolated hero candidate

Packet: `PROFESSIONAL-KESTREL-BORROWED-TIME-V2-CODEX-001`

This candidate is a bounded adaptation of the user's Borrowed Time Revamp and Runtime
packages. The current shipped Kestrel already uses that source family, so V2 keeps its
authored hull, equipment, wear, and semantic PBR identity while improving the near-field
geometry and gameplay silhouette instead of merely repackaging the ZIP.

The visual changes are causal: a ventral keel clarifies the forward arrow; separated shoulder
chines and canopy brows strengthen the load path; an open hull-colored drive yoke makes aft
orientation immediate; shortened, physically braced cyan rails carry Frontier identity; RCS
cowlings and one asymmetric repair plate add working-ship biography without texture noise.

The candidate is intentionally not wired. It writes only under this family folder and retains
all nine operational sockets, a non-render collision proxy, 12 semantic material roles,
Meshopt geometry, KTX2 textures, and explicit LOD0/1/2 tiers. The shipped Kestrel, live
manifests, release tree, and render path are unchanged.

Rebuild:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/blender/build_kestrel_borrowed_time_v2.py
node tools/art/finalize_kestrel_borrowed_time_v2_candidate.mjs
node scripts/check-kestrel-borrowed-time-v2.mjs
```
