# M-09 catalog — patrol/law events

Surface: `src/systems/lawSecurity.js` (dirty — foreign RC-CHASE extension: witness-report
carriers, wanted sweeps, rebind ticks), `src/systems/heat.js`, `src/ai/inspection.js`,
`src/data/barks.js` (BARK_SITUATIONS core 8 + event 'distress', per-faction registers),
`src/data/barkSituationFill.js` (canonical append point: faction→situation→line arrays,
index-0 shipped lines preserved), patrol encounters (030, 090, 270, 332 + lived files).

## Writable seams

- `BARK_SITUATION_FILL` — designed for exactly this: Concord (`faction_scn`) cells for
  scan / warn / demand-cargo / patrol-greeting already carry third-shift procedural
  voice; appends extend without renumbering shipped lines.
- `ENCOUNTER_BARKS` `patrol_scan_*`/`patrol_beat_hail` — companion corpus (M-03 already
  demonstrated the append pattern).
- `lawSecurity.js` runtime is foreign-dirty → closed this pass.

## Notes

Concord register = procedural authority: reference numbers, metered citations, the desk
that already knows. Inspector types = which desk voice (traffic, customs, internal
audit). Grudge memory = "your prior operator left an open citation" precedent already set.

Review: catalog ✓3 (Drifter / Archivist / Accountant) — recorded.
