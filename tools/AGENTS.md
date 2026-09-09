# tools/ agent notes

This tree contains authoring, export, inspection, and production-controller utilities. Tool output is
not runtime truth until it is promoted through the owning manifest/build/integration path.

- `tools/art/` and `tools/blender/` must preserve asset IDs, provenance, semantic materials, sockets,
  transforms, reproducibility, and validation metadata.
- `tools/production/` implements an optional explicitly activated campaign workflow. Its packet and
  submission semantics do not constrain ordinary feature implementation.
- Do not make a tool pass by lowering visual quality, deleting validation, or wiring an unaccepted
  candidate directly into runtime.
- External assets require documented origin, license, hashes, and adaptation role.
- Inspect active asset locks/authoring signals before export or promotion.
- Keep generated/scratch outputs outside tracked source unless the artifact-retention policy admits
  them. See `docs/ARTIFACT_RETENTION.md`.
