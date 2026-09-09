# src/data/ agent notes

This directory owns data-driven definitions and stable content IDs. Runtime systems consume it; avoid
hiding gameplay control flow inside data files.

- Preserve stable IDs used by saves, missions, manifests, telemetry, and tests.
- Add migrations/normalization when serialized meaning changes; do not silently reuse an ID for a
  different concept.
- Keep definitions deterministic and free of runtime side effects or ambient randomness.
- Reuse shared schema/validation helpers instead of adding parallel formats.
- Values in old plans are targets or historical baselines unless the current data/checks make them
  authoritative. Tune from gameplay evidence, not copied tables.
- Run the focused system test plus save/schema checks for compatibility-sensitive edits.
