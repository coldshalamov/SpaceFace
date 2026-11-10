# E9 — Load in seconds: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done (2026-11-06)
- Diagnosis memo with the measured baseline: eager closure from the bundled `main.js` is
  339 files / **31.6 MB** (all import forms); largest chunks identified; screens already
  route-split; the shared-core static graph is the bottleneck; chosen road = mode-scoped module
  graphs (coordinate with Lane 2's E3 manifest) + deferred Rapier + predictive streaming +
  web-channel caches + interactive title.

## Next (order in the memo)
1. `--metafile` build + boot-timeline probe (E10 extension) for the before numbers.
2. Mode-owned system sets behind dynamic imports (L; needs the E3 manifest boundary).
3. Rapier deferred past the title (~2.2 MB earlier interactivity).

**Not started** while E1's live verification is pending — this campaign resumes after E1's
finish line is measured on this laptop.
