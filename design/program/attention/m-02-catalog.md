# M-02 catalog — lived vignettes 391–566

Surface: `src/data/encounters/391…566-*` (~180 files) → `compileVignette` in
`src/systems/vignetteInterpreter.js`, registered through `index.generated.js`.

## What already exists

Per-file compiled spec: `cast` (role/archetype/dx/dz/scanLabel), `choices` (label +
playerLine), `timeoutChoice`, `phases` — a verb chain (spawn / say / motion / offer /
cost / grant / rep / resolve) wired by `next` ids — plus trigger header (deck, weight,
zoneTypes, pressureCost, cooldown, gates) and keyed `receipts`.

## Writable seams found

- `phases` say/motion chains are pure data; inserting a `say` node + one `next` repoint
  adds ambience without touching verbs or outcomes.
- Choices/costs/receipts are keyed and pinned — not seams.
- Foreign dirty: 401–429 and 536 carry in-flight line edits — avoided. 391 verified clean.

## Limits

No callback/follow-on vocabulary exists in the vignette schema — a vignette is one-shot by
design. Texture lands inside the existing ambient say-chain only.

Review: catalog ✓3 (Drifter / Archivist / Skeptic) — recorded.
