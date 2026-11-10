# Helios convoy and faction body completion

This companion to `hero_fleet.py` finishes Mule, Atlas, and the first-sector Span/Wasp faction bodies.
It reads the original Git blobs pinned in `additional_fleet_sources.json`, never a previously promoted
remaster. It writes candidates and editable Blender scenes only under
`.devshots/helios-remaster/additional-fleet/<asset>/`.

All twelve candidate GLBs were independently accepted by the root graphics controller on
2026-09-19. Mule/Atlas and their finished LODs, DMC/Reach Span and Free Militia Wasp retain their
earlier accepted hashes. The controller accepted final MTS Span `a6bb34756d30`, MTS Wasp
`37a449de92bf` and SCN Wasp `3621d86ad73c` after viewing
`.devshots/tuneup/remaster-factions-final.png` under the current shared game lighting, post and
faction pigments. The complete twelve SHA256 values and review scope are recorded in
`additional_fleet_preflight.json`; source promotion and release/runtime checks belong to the
controller. Model authoring is closed at those exact candidates.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 2 --python tools/blender/helios_remaster/additional_fleet.py -- --build --lods
node tools/blender/helios_remaster/additional_fleet_receipt.mjs
```

`--only mule_production_v1,atlas_production_v1` selects the two convoy bodies; `--preview` produces
quick material/clay chase views for construction review. `--source --preview` shows pinned originals.
The controller reviews finished candidates under the actual game material and lighting rig before
promotion. Workbench construction images do not certify the final optical response.

Mule's rear working roof becomes a recessed traction-bus channel protected by folded load saddles.
Atlas has a larger exposed pressure-transfer bay with paired casings, transverse load channels and
diagonal knees. Both keep the original cabins, cargo volume, hull silhouette, railings, engines and
markings. Four upper cargo lids receive true recessed lifting cradles; these are cargo-handling
assemblies rather than radiator patterns.

The faction bodies are imported individually, retaining their original livery and extra kit geometry.
Span DMC/Reach receive the accepted six cargo service openings. Wasp militia/MTS/SCN receive the
accepted paired nacelle-root cooling cavities. No variant is replaced with a base-body export.

The MTS Span's covering kit supersedes its now-hidden base cargo wells: three formed pressure covers
surround a genuinely recessed service passage, with six fitted pressure latches, grounded saddles and
a single glazed control bridge. Its native distant LODs retain the broad cover silhouette without
small latch fittings. MTS Wasp's flat lids become shouldered avionics cases with recessed access,
fitted skirts and a rooted optical spine beneath the existing luminous strip. SCN Wasp receives
faceted instrument cases, recessed optics, a formed wing-root yoke and physical supports beneath
the retained luminous perimeter. These revisions keep their original paint roles and markers.

Boolean surgery isolates authored component islands first, then rejoins the original material groups.
Every new mesh belongs to an explicit `LOD0_`, `LOD1_` or `LOD2_` group. New close-range couplings,
bevel segments and attachment shoes disappear in distant LODs, while openings and broad saddle forms
remain. Distant convoy additions reuse the original hull/mechanical/ceramic material groups, so their
construction does not create extra far-range material draws.

`additional_fleet_preflight.json` records each changed manufactured assembly and retained zone.
`promotion.json` binds source/candidate hashes, identities, bounds, sockets and per-LOD primitive and
triangle counts. Source/release promotion and independent whole-asset acceptance belong to the
controller; these scripts never write shared manifests or release packages.

`texture_cache_seed.mjs --seed` can pre-seed the ignored SG04 texture cache from the exact preceding
committed release manifest. It requires source/release file hashes to match that manifest, unchanged
candidate PNG/JPEG bytes, unambiguous original material/node/slot bindings, matching encoder and
decoder versions/options, correct transfer function, UASTC/Zstd and the full expected mip chain.
It uses the current `textureEncodingKey`, including the exact current decoder function text, and
never replaces an existing cache entry. Unprovable or changed images remain normal encoder misses;
native KTX2 sources decoded to PNG are deliberately excluded. The finite scope is the pinned hero26,
additional12 and the controller's explicit27 place IDs. This reduces offline encoding work, not
runtime frame cost. `node --test tools/blender/helios_remaster/texture_cache_seed.test.mjs` checks a
real unchanged image through the actual cache consumer, changed-pixel/color-space rejection and
non-overwrite behavior. Cache writes and the hash-bound report remain under `.devshots/`.
