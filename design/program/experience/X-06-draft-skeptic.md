# X-06 draft — The Skeptic

**Verdict.** Flying within 300 wu of a working hull makes it hail (`barkDirector.js:650`). That is the
cheapest poke in the game, and today the reward reads the same in every sector. My rule: a sector line names
**a real place you can fly to from here** (FIRST_SESSION_MAP §4: "rumors name real places, never vapor").

**Proposal — a sector overlay on the existing pass-by hail.**
- **Data.** In `barks.js`, add a frozen `SECTOR_PASS_HAILS = { sector_helios_prime:[…],
  sector_ceres_belt:[…] }`.
  - Do not touch `BARK_SITUATIONS`. It is the WAV index contract (`:51-60`).
  - These are text-only lines and arrive as toasts.
- **Selection.** In the pass-by paths (`barkDirector.js:1849`; `_speakRegisterHail` `:1908-1947`), after
  `_isSuppressed('patrol-greeting')` passes, use the sector line when
  `hash32(seed,'sectorHail',entityId) % 3 === 0` and a bank exists. Register, foghorn and `npc:hailed` are
  unchanged.
- **Cadence.** The ambient gap still governs (12 s base, +12 per quiet step, `:3282-3286`).

**Lines.** Each names a live POI (`sectors.js`, `sectorAnchors.js`).

Helios:
- "Coalition run? Checkpoint Niner reads every manifest twice."
- "Tenders walked the lamps past Smear Marker 7 again."
- "Pit Line's on the procession bearing. Nobody goes for fun."

Ceres:
- "First light on the inbound leg is the Flare Rack. Follow it."
- "Weigh Pin says eighteen minutes. It lies on bad shifts."
- "Kettle Line's drifting again. Three pieces, one bearing."

**Poke → reward.** Brush past a hull, hear a place, fly there, and the discovery plate answers. Each hail is a
promise the map keeps.

**Promise test (new).** Every line's named place must appear among that sector's POI names. A rename fails
the test before a player can chase a ghost.

**Not doing.**
- No new director or channel. The bark channel stays at priority 50 (`voiceArbiter.js:51`).
- No WAVs.
- No banks for sectors that are unreachable in the first hour.

**Regression risk.** The deterministic pick changes some hulls' seeded text. Re-record any pinned fixture
deliberately. Keep green:
- `bark-director-quiet-latch`, `demo-bark-acceptance`, `encounter-barks`
- `fb-091-ambient-admission-slice`, `infer-p12-bark-coalesce`
- `first-hour-voice-priority`, `first-session-places`, `check:player-facing-labels`

Joint with ledger V-01.
