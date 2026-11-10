# M-08 catalog — black flag path

Surface: `src/data/blackFlag.js` (BLACK_FLAG_CONTACTS keyed map — Mara Venn / Oriel Pask /
Sera Holt — offer/returned/stolen lines; BLACK_FLAG_YARDS; BLACK_FLAG_ENCOUNTERS act rows
with intro/objective), `src/missions/blackFlagMissions.js` (dirty — compensated-title
`settle_title` foreign hunk), `src/ui/blackFlagRegistry.js`, `src/data/fences.js` (6
authored fences, `lines` fixed keys: first/trusted/burned/lost/thanks/unknown/ransom),
`src/data/bountyMarks.js` (wanted texture: marks + one-shot hails).

## Writable seams

- `MARK_HAIL_LINES` — the wanted poster talking back at scanner range. Append-shaped,
  seeded pick stays deterministic. This IS the row's "wanted texture" seam.
- Fence `lines` are fixed-key, all keys consumed — closed.
- BLACK_FLAG_CONTACTS consumed by fixed keys — a fourth contact is dead data — closed.
- Encounter act rows are gated sequence — adding shifts the arc — closed.

## Foreign

`blackFlagMissions.js` settle_title hunks — preserved. `fences.js` clean.

Review: catalog ✓3 (Drifter / Archivist / Skeptic) — recorded.
