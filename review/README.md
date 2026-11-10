<!-- LIFETIME: STABLE — distilled residue of the 2026-08 thermonuclear review. -->
# Review residue (2026-08-10)

One durable note after an agent dump in `review/` was triaged. The long ledgers
(`SUMMARY`, `FINDINGS`, `findings-*`, `FIXES_PROPOSED`, `MANIFEST`, `ABANDONED`)
were deleted on purpose so they cannot go stale and mislead. Full text remains in
git history under commit `5678e9e4` and earlier.

**How to read this:** “Verified” was re-checked against live code. “Leads” were
not re-proven — treat as investigation hints, not a mandate.

## Done (safe packet)

- Concord/Drift loss headlines use canonical faction ids (`faction_scn` /
  `faction_dmc`; legacy aliases kept).
- ARCHITECTURE: loop cap 4; §2.3/§4.2 point at `authoritativeSystemManifest.js`;
  14 factions / 24 sectors; removed nonexistent `shaders.js` row; magnet default note.
- Customs hidden-hold comment corrected (engine already honors it).
- Outfitting / fit-tree no longer advertise inert module `magnetRange` numbers.
- Module catalog notes `magnetRange` is unwired until mining applies it.

## Rejected (do not “fix”)

- **intervention `_nextId` after Continue** — not a save bug; interventions are
  cleared on load by design.
- **Blind `node --test test/*.test.mjs` glob** — orphan tests are real; dumping
  them all into CI will go red. Audit and wire in clusters.
- **map-information-depth `|| true`** — intentional placeholder; a real assert
  follows. Not a neutered gate.
- **pitborn starts at 0** — overturned; starts +40 via `FACTION_META` fallback.
- **“Fix code to match stale ARCH numbers”** (loop cap 8, magnet 90, 8 factions,
  10 sectors, 20 systems) — code is intended; docs were the stale side.

## Open — verified, deferred on purpose

1. **Drill fade mutates ship physics from UI** (`ui:drillFadeStart` zeroes vel,
   animates pos via rAF, sets rot/tether). Real §6 contract break; needs a
   sim-owned intent, not a drive-by edit.
2. **Tractor `magnetRange` still unwired in mining** — catalog has 400/720;
   `playerModSum` never sums that key. UI honesty done; wiring changes feel/balance.
3. **Many `.test.mjs` files never appear in any `check:*`** — directionally true;
   exact % soft. Next step: orphan audit check (report-only), then wire high-value
   clusters.
4. **Living-galaxy authored-asset soft check** — `|| true` / unused predicate in
   the player-route wait; make real or delete honestly.

## Open — leads only (unverified backlog)

Themes from the deleted deep dumps; re-verify before acting:

- Semi-orphaned UI screens (starmap/localmap/drill/stationHub helper drift)
- ARCH §4.4 / event-table drift vs live emits; no event-name conformance gate
- Hardcoded faction/weapon/sector id coupling (rename hazard)
- Script/tool orphans and root junk triage (destructive; hand-run tools exist)
- Travel-drive HUD energy gauge honesty (spend vs hide — design call)
- `check:baseline` not in the CI `check`/`check:all` path
- No production-profile golden (shipping features vs legacy47a coverage)

## Meta rule that survived

When code and docs disagree, **`git log` which side moved** before changing
either. Agents often change code and leave docs behind; “fixing to the doc”
has regressed real fixes here.
