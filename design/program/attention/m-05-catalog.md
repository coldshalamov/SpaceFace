# M-05 catalog — starter jobs per hull

Surface: `src/data/starterJobs.js` — `STARTER_JOBS` (3 chains, one per starter hull:
kestrel+drill_amp mining_quota ×2, pelican+winch_hd tow_recovery ×2, wasp+ram_plate
bounty_hunt ×2 with named runners) + helpers (`starterJobForShip`, `nextStarterStep`,
`activeOwnedShip`, `shipCarriesModule`, `starterRamSentence`, `starterRamHail`,
`starterRamKill`). Steps are `{step, type, title, ...}` — type ∈ mining_quota /
tow_recovery / bounty_hunt.

## Writable seams

- `steps` array is indexed by `starterJobStepsDone` — a third step per chain is the
  schema's own extension path: employer voice in the title, a small twist, a thank-you
  register.
- `runnerName` already supports named marks on bounty steps.
- Single-field helpers (sentence/hail) are keyed to mod_ram_plate — closed.

## Foreign

`shipCarriesModule` scarred-ram clause (AL-LG-11) — preserved verbatim.

Review: catalog ✓3 (Drifter / Archivist / Accountant) — recorded.
