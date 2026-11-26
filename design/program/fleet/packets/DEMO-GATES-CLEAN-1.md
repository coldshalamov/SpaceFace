# DEMO-GATES-CLEAN-1 — Clear red static repo gates + add R18 plain-words check

**Owner:** `devin3` (Devin SWE-2)
**Scope:** Strictly static hygiene, token consistency, generated save schema, verb audit registry, and plain-words lint script. **Do NOT boot the game, Playwright, Chromium, or Electron.** **Do NOT run `git add`, `git commit`, `git reset`, `git restore`, `git checkout -- .`, `git clean`, or `git stash`.**

## Ground rules
1. Read `AGENTS.md` and inspect every file you edit.
2. There are active uncommitted edits in this shared checkout (`styles/ui.css` around lines 346-355 `#aim-reticle[data-mode="pad"]`, `src/ui/hud.js`, `src/ui/orrery/hudAdapter.js`, etc.). **Preserve all unrelated existing edits** — do NOT touch `#aim-reticle[data-mode="pad"]` in `styles/ui.css`, and do NOT modify files outside this packet's named write set.
3. Run every verification command listed at the end and report exact pass/fail output.

## Tasks (5 items)

### 1. `npm run check:colour-tokens` → exit 0
- Run `npm run check:colour-tokens` to get all failing lines in `styles/ui.css` (16 hits at lines 2047, 2959, 2981, 2985, 2988, 3043, 3057, 3060, 3063, 3096, 3118, 3121, 3146) and `styles/intro.css` (1 hit at line 541).
- Replace each literal hex/rgba with the semantic CSS token (`var(--panel)`, `var(--panel-2)`, `var(--bg)`, `var(--ink)`, `var(--sf-paper)`, `var(--sf-surface)`) or `color-mix(in srgb, var(--token) N%, transparent)` matching `scripts/check-colour-tokens.mjs` guidance and existing variables in `styles/ui.css` / `styles/tokens.css`.
- Verify none of the colors break readability (keep high-contrast fallbacks or exact token equivalents, and do NOT disturb lines 346-355 in `styles/ui.css`).

### 2. `npm run check:src-reachability` → exit 0
- Inspect the 4 flagged unreachable modules:
  - `src/render/modularLegacyMountPlacement.js`
  - `src/render/selectionSigil.js`
  - `src/render/targetContour.js`
  - `src/ui/station/stationCommands.js`
- Also read `test/src-reachability.baseline.json` and check if `selectionSigil.js` / `targetContour.js` are imported in working-tree `src/render/vfx.js` (uncommitted render batch).
- Do NOT wire experimental or pending-render modules in this packet. Instead, register genuinely staged/pending modules cleanly in `test/src-reachability.baseline.json` with accurate, specific, honest reasons (e.g., `modularLegacyMountPlacement.js` awaiting visual review of assembled combinations; `selectionSigil.js` and `targetContour.js` imported by pending uncommitted `src/render/vfx.js` render batch; check why `stationCommands.js` is orphaned and document its exact status accurately).

### 3. `npm run check:save-schema` → exit 0
- Run `npm run generate:save-schema` (which writes `docs/SAVE_SCHEMA.md` or wherever `scripts/generate-save-schema.mjs --write` outputs).
- Verify `npm run check:save-schema` passes AND run `node --test test/save-restore-atomicity.test.mjs test/save-envelope-fidelity.test.mjs`.

### 4. `npm run check:progression-verb-audit` → exit 0
- Read `scripts/check-progression-verb-audit.mjs` (`ID_MATCHED_VERBS` ~line 56, `VERB_MOD_KEYS` ~line 62-75) and the 3 Kinetic Catalyst modules in `src/features/kineticCatalysts/catalog.js` (`unique_kinetic_orbital_magazine`, `unique_kinetic_aftershock_core`, `unique_kinetic_load_bridge`).
- Fix the 2 drifted consumer file references:
  - `impulseChargeCapacity`: update `{ file, symbol }` from `src/systems/impulseCharges.js` to `src/data/impulseChargeReadModel.js` (and `resolveImpulseChargeCapacity` or `impulseChargeCapacity` which appears at line 57 of `src/data/impulseChargeReadModel.js`; check `src/systems/buildIdentity.js` / `src/data/impulseChargeReadModel.js` to make sure the note + evidence match reality).
  - `pullCollector`: update `{ file, symbol }` from `src/systems/fields.js` to `src/core/fields/fieldReadModel.js` (inspect lines 35-60 of `src/core/fields/fieldReadModel.js` first to verify exact symbol).
- Check `src/features/kineticCatalysts/kernel.js` & `fitting.js` to verify what each of the 3 modules (`unique_kinetic_orbital_magazine`, `unique_kinetic_aftershock_core`, `unique_kinetic_load_bridge`) actually does at runtime, then register all 3 in `ID_MATCHED_VERBS` in `scripts/check-progression-verb-audit.mjs` with exact `[grants, consumer note, { file, symbol }]` evidence pointing to real live source.

### 5. `npm run check:plain-words` (Ruling R18)
- Read `scripts/capture-opening.mjs` lines 40-80 (`BANNED_WORDS`, `BANNED_EXTRA`, `BAD_TOKENS`), `package.json` scripts around `check:m6:localization`, and `src/localization/catalogs/en-US.generated.json` (plus whatever generates it — check `package.json` scripts for `localization` / `en-US`).
- Create `scripts/check-plain-words.mjs` and add `"check:plain-words": "node scripts/check-plain-words.mjs"` in `package.json`.
- Have it scan player-facing English text (`src/localization/catalogs/en-US.generated.json` — regenerate first if stale and safe, or also scan exported string tables) for banned internal words (`Crucible`, `Massline`, `Mass Seed`, `Gyre`, `Repulsor`, `Too heavy`, `unbound`, `Research points` / `RP`, etc., matching `design/overhaul/00_RULINGS.md` R18 and `scripts/capture-opening.mjs` without false positives on internal IDs, JSON keys, code comments, or lowercase English words like "research" alone).
- Fix any genuine player-facing occurrences you find in data/catalog source files (keeping edits strictly surgical and running relevant tests + `npm run check:m6:localization` if localization is touched). Verify with a quick temporary self-check (e.g., unit logic or inline test, leaving NO test artifacts behind) that injecting a banned word fails the check and the clean tree exits 0.

## Write set
- `styles/ui.css` (only the token-literal lines outside `#aim-reticle[data-mode="pad"]`)
- `styles/intro.css` (only the token-literal line)
- `test/src-reachability.baseline.json`
- Generated save schema output from `npm run generate:save-schema` (`docs/SAVE_SCHEMA.md` / `scripts/generate-save-schema.mjs` target)
- `scripts/check-progression-verb-audit.mjs`
- `scripts/check-plain-words.mjs`
- `package.json` (adding `check:plain-words`)
- Any player-facing strings/catalogs needed for `check:plain-words` to pass cleanly

## Final verification commands (must run all and report exact output)
- `npm run check:colour-tokens`
- `npm run check:src-reachability`
- `npm run check:save-schema`
- `npm run check:progression-verb-audit`
- `npm run check:plain-words`
- `node --test test/save-restore-atomicity.test.mjs test/save-envelope-fidelity.test.mjs`
- `npm run check:src-syntax`
- `npm run check:sim`
