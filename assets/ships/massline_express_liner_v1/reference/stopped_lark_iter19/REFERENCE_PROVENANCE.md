# Stopped Lark donor provenance

This folder is a **legacy donor/reference package**, not a runtime asset, release candidate, or
accepted replacement for the Helios Lark. It preserves the stopped redesign as raw material for a
separate NPC express-liner identity. Nothing in this folder may be registered, packaged, or routed
without a fresh asset packet and the normal G0-G7 production and acceptance chain.

## Exact recovered inputs

| Local file | Historical source | Git blob | Bytes | SHA-256 |
|---|---|---|---:|---|
| `helios_lark_iter15_editable.blend` | `d538a583b673c61051e305963254f6de83d871d0:assets/ships/m4_helios_civilian/blender/helios_lark_production.blend` | `b84927af96619efaa9e9331e892dfcd9b34f6afb` | 9,442,638 | `2e2a7b454a9705e89085c9358682ec962c686d3ae5ee090d3b0a3d917b2aecee` |
| `helios_lark_iter19_source.glb` | `d538a583b673c61051e305963254f6de83d871d0:assets/ships/m4_helios_civilian/source/wholeships/helios_lark.glb` | `67f2cf9796c65cdf179d9d7bea824b15ba13db6a` | 11,390,796 | `e16c6a28692d209319d710c5ee4b11b6b2fabb7a669848f205711ae1a09cc866` |

Historical refs at recovery time were branch `agent/gfx-production-remaster-lark` and annotated tag
`recovery/lark-graphics-remaster-20260723`, both at commit
`d538a583b673c61051e305963254f6de83d871d0` (`fix(art): Helios Lark iter19 smoked glass + stronger AO
cavity`). The Blender file last changed at commit
`89dc8d32d4051bf5a75fd29e73f4e734a2a4563d` (`feat(art): Helios Lark iter15 clean topology (no hull
torus booleans)`). Iterations 16-19 changed exported GLBs without updating the Blender source, so
both files are required to preserve the stopped design honestly.

## Origin and use boundary

The donor is project-original SpaceFace work, procedurally authored in-repo; the source family
declared no third-party meshes, kitbash libraries, or downloaded models. That provenance does not
make the old candidate accepted art. The stopped design diverges into a long capsule/liner silhouette
and has unresolved form, construction, material-zone, floating-part, and plastic/clay concerns.

Use it only as a basis for a new express-liner identity. Do not replace the accepted courier Lark,
rename this donor as a finished ship, or treat the historical screenshots/reports as current evidence.
The old candidate/release GLB, preview override, and finalize/build reports were deliberately not
copied because they are derived, stale, and internally disagree with the tip bytes. The reusable Lark
builder/iteration scripts, bakes, camera contract, and additive evidence were already imported on
master by commit `705ee011`; they are not duplicated here.

## Frozen accepted Lark identity at extraction

The accepted Lark remains untouched and authoritative through its live manifests and runtime maps.
These hashes are recorded only to prevent an accidental donor-for-production substitution:

| Accepted/current file | SHA-256 |
|---|---|
| `assets/ships/m4_helios_civilian/blender/helios_lark_production.blend` | `51e8d91966ff4c7cc6528d64768341da4579ca8a375a6dcb24558fb3659c1ce5` |
| `assets/ships/m4_helios_civilian/source/wholeships/helios_lark.glb` | `9090e7c21980d0d87d1da422bdb940a7731ceb3b39f4648adc0968df931b708f` |
| `assets/ships/m4_helios_civilian/release_candidates/wholeships/helios_lark.glb` | `ea6b131c7e822ff727a27b15c8d707c9e8a0177198a7a9aae52edd050b2426dc` |
| `assets/ships/release/parts/wholeships/helios_lark.glb` | `5dfb6c2a2baaa4c8e92758f4e969d262ee668cbf22e5de73020df659e782a473` |
