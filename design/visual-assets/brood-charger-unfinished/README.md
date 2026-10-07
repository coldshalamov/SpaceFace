# Charger unfinished-art review handoff

The user rejected the shown model quality on 3 October 2026. These editable sources,
exports, builders, tests and review images are preserved for redesign and continuation.
They are not approved production art and are not registered into runtime catalogs.
Start with [HANDOFF.md](HANDOFF.md) and the exact [frozen inventory](FINAL_HANDOFF_MANIFEST.json).

## Portability boundary

Open `candidate-c6/charger-animated-source.blend` or the three
`candidate-c6/charger-LOD{0,1,2}-source.blend` files to inspect and edit the preserved
source. The GLB and motion-bank pair are review exports, not installation instructions.
Historical logs and frozen builders retain their original workspace paths; copying
this folder does not make those paths valid. No historical builder was executed as
part of publication. A separate follow-up must validate regeneration from this PR layout.

Required path mapping for that follow-up:

- Treat this directory as the former `brood-charger-redesign` root
- Set `SPACEFACE_FORGE_ROOT` to a compatible checkout's `tools/blender/forge`; current
  builders import `forge.py`, `forge_export.py`, `brood_kit.py` and
  `animations/motion_bank.py` there, including their shared material/texture dependencies
- Set `SPACEFACE_RUNTIME_ROOT` to the tested implementation checkout for Node tests;
  the historical default sibling `splitter-runtime-candidate` is not supplied here
- Run historical relative commands from this directory only in a new output copy;
  preserve the frozen candidate and evidence hashes
- Review `source/optimize_candidate.mjs` dependency resolution against the chosen
  checkout before running it; no dependency installation is implied by this archive

Do not interpret a successful geometry/contact test as visual approval, GPU proof,
or permission to promote this rejected candidate to a default runtime asset.
