# Brood art-direction reset review packet

**Status: new concept direction + unfinished editable construction study. No runtime replacement.**

Start here:

1. `reference/mite-lamellar-shear-concept.png` — selected generated concept, visibly labelled as concept art
2. `review/mite-r4-neutral-and-scale-review.png` — actual R4 exported geometry, same-geometry clay and measured-size examples
3. `REVIEW.md` — precise diagnosis, rejected iterations and remaining R4 craft failures
4. `BUILD_BRIEF.md` — direction alternatives, selected construction, canon, runtime constraints, proposed budgets, source/texture/LOD strategy and acceptance criteria
5. `prototype/mite-lamellar-r4.blend` and `.glb` — editable source and portable interchange, not production assets

## Reproduce

Requires Blender 4.3+ and Python with Pillow for the sheet. No download, credentials or heavyweight installation is needed.

```sh
blender -b --threads 2 --python source/build_lamellar_mite_r4.py
blender -b --threads 3 --python source/render_prototype.py -- --source prototype/mite-lamellar-r4.glb --views top,threequarter,side,jawroot,chase60 --modes material,clay
python3 source/make_review_sheet.py
```

Run from this packet root. Builders use their own source location to resolve output. The render script resolves its explicit source argument from the working directory. Every output stays in the packet. Old asset sources and runtime files are never opened for mutation. The scripts do not terminate other processes or operate the Blender GUI.

## Scope

This packet does not contain a rig, authored LODs, UV/baked surface maps, native collision fit, runtime material route, release asset, game Look capture or measured scene performance. Geometry and source are deliberately kept separate from concept imagery. Keep this packet in a reference/review directory, not a live runtime asset path.

The full build/review conversation does not need to be reconstructed: `BUILD_BRIEF.md` names what to preserve and `REVIEW.md` states what is still visibly wrong. The only selected 3D study is R4. Earlier builder scripts and a representative rejected render are retained to explain the progression, not as alternates for release.

No user approval of this direction or model is implied. The user rejected the preceding Mite/Splitter, requested a complete PR handoff and asked work to continue autonomously. This is one clearly labelled handoff packet toward that request.

## Provenance

- Original geometry authored in Blender from designed section meshes, no third-party model downloads
- Generated reference made with the built-in image-generation tool, with exact prompt and input identities retained
- Original rejected sources remain unchanged
- Document/image inputs are hashed in `sources.json`; exported asset facts and hashes are in `prototype/prototype-facts-r4.json`
- `PACKET_MANIFEST.json` is the local packet integrity inventory; hashes are evidence of identity, not quality approval
