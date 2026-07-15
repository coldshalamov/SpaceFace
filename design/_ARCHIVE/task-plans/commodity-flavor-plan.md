# Archived Task Plan: Commodity Flavor Fields

> **Disposition:** IMPLEMENTED TASK RECORD. The flavor data and its checks landed; this file is
> retained only as implementation history. It is not a current roadmap or status source. Start at
> `design/program/README.md` for current work and `design/PLAN_REGISTRY.md` for plan ownership.

## Original plan: add displayName, desc, and lore flavor text to all 43 SpaceFace commodities

## Goal kind
code-change

## Acceptance criteria
1. Every commodity in `src/data/commodities.js` (exactly 43 `cmdty_*` ids currently in `COMMODITIES`) has three new string fields: `displayName`, `desc`, and `lore`.
2. All pre-existing economic and identity fields on each commodity remain unchanged: `id`, `name`, `category`, `basePrice`, `volatility`, `elasticity`, `legality`, `volPerU`, `massPerU`, `fineMult`, `producedBy`, `consumedBy`.
3. Flavor content meets OBJECTIVE voice and length rules: `displayName` is an evocative proper-noun phrase; `desc` is one physical sentence ≤16 words; `lore` is two in-world sentences ≤30 words total, mentions a place or faction, uses dry trade-terminal/belter tone (not marketing copy), and contraband entries (`cmdty_narcotics`, `cmdty_stolen_goods`) feel dangerous/alluring without moralizing.
4. Lore for each commodity hints at its existing `producedBy`/`consumedBy` pipeline (e.g. mining→refinery, blackmarket-only loops) using in-world places such as Ceres Belt, Helios refineries, or Vael blockade runners where appropriate.
5. No commodities are added or removed; count stays 43.

## Verification plan
1. **gating:** Run `node scripts/check-data.mjs` from repo root; output must show `ok src/data/commodities.js — COMMODITIES:43` with zero failures; capture full stdout to `{SCRATCH}/check-data.log`.
2. **gating:** Run a new or extended Node validation script that imports `COMMODITIES` from `src/data/commodities.js` and asserts: array length is 43; every `id` is unique; every entry has non-empty `displayName`, `desc`, `lore`; the set of ids with flavor equals the full commodity id set (no extras, no skips); capture results to `{SCRATCH}/commodity-flavor-validate.log`.
3. **gating:** In the same validation script, word-count every `desc` (≤16 words) and `lore` (≤30 words); assert `displayName` is not identical to the existing `name` field and reads as a proper-noun phrase (non-empty, contains at least one letter); capture pass/fail per id to `{SCRATCH}/commodity-flavor-validate.log`.
4. **gating:** In the same validation script, deep-compare each commodity's pre-flavor fields (`id`, `name`, `category`, `basePrice`, `volatility`, `elasticity`, `legality`, `volPerU`, `massPerU`, `fineMult`, `producedBy`, `consumedBy`) against a frozen baseline snapshot taken before flavor edits (or inline expected constants derived from current file); any mismatch fails. Run with `COMMODITY_FLAVOR_SCRATCH={SCRATCH}` set so the script writes both `{SCRATCH}/commodity-flavor-validate.log` and `{SCRATCH}/commodity-balance-integrity.log` (per-id pass/fail for balance fields).
5. **gating:** Run `npm run check:balance`; must exit 0 with unchanged balance-sim output; capture to `{SCRATCH}/check-balance.log`.
6. **evidence:** Spot-check contraband and restricted military entries in validation output for absence of moralizing keywords (e.g. "evil", "wrong", "should not"); log sample lines to `{SCRATCH}/commodity-flavor-validate.log`.

## Non-goals
- Changing `name`, prices, categories, legality, or `producedBy`/`consumedBy` arrays.
- Wiring `displayName`/`desc`/`lore` into market UI, tooltips, or help screens (data-only deliverable).
- Adding new commodities or renaming existing ids.
- Translating or localizing flavor strings.

## Assumed scope
- `src/data/commodityFlavor.js` — keyed `COMMODITY_FLAVOR` object (43 entries: `displayName`, `desc`, `lore`); pure flavor data, no balance fields.
- `src/data/commodities.js` — balance array unchanged; imports flavor from `commodityFlavor.js` and merges onto each `COMMODITIES` entry at module load.
- `scripts/check-commodity-flavor.mjs` — Node validator for coverage, word limits, and balance-field integrity.
- `test/commodity-flavor.test.mjs` — unit test importing shipped `COMMODITIES` + `COMMODITY_FLAVOR` merge path.
- Optional npm script hook (e.g. `check:commodity-flavor`) if the repo pattern requires it.
- Reference voice: `docs/worldbuilding/vibe/FACT_Voice_Bible.md` (commodity flavor register).
- All 43 ids (source of truth from file, not OBJECTIVE examples): `cmdty_ore_iron`, `cmdty_ore_copper`, `cmdty_ore_titanium`, `cmdty_silicate`, `cmdty_ice_water`, `cmdty_volatiles`, `cmdty_ore_platinoid`, `cmdty_ore_bronzium`, `cmdty_ore_silverium`, `cmdty_ore_goldium`, `cmdty_ore_platinium`, `cmdty_ore_einsteinium`, `cmdty_gem_emerald`, `cmdty_gem_ruby`, `cmdty_gem_diamond`, `cmdty_exotic_amazonite`, `cmdty_gas_hydrogen`, `cmdty_gas_helium3`, `cmdty_crystal_silica`, `cmdty_crystal_lumin`, `cmdty_exotic_xenium`, `cmdty_refined_metals`, `cmdty_alloys`, `cmdty_polymers`, `cmdty_fuel_cells`, `cmdty_comp_hullplate`, `cmdty_comp_circuitry`, `cmdty_microchips`, `cmdty_electronics`, `cmdty_quantum_cores`, `cmdty_consumer_goods`, `cmdty_textiles`, `cmdty_luxury_goods`, `cmdty_art`, `cmdty_food`, `cmdty_medical`, `cmdty_scrap_metal`, `cmdty_salvage_electronics`, `cmdty_narcotics`, `cmdty_stolen_goods`, `cmdty_weapons`, `cmdty_munitions`, `cmdty_impulse_charge`.

## Implementation approach
- Keep flavor as pure additive data separate from balance logic: either a keyed flavor map merged once onto `COMMODITIES` at module init, or inline fields on each array element — both satisfy the contract if every exported commodity record exposes the three new fields.
- Extract a small pure helper for word counting and pipeline-aware lore checks so the validator tests real shipped data, not duplicated strings.
- When writing lore, read each commodity's `producedBy`/`consumedBy` and `legality` before drafting so mining→refinery→fab chains and blackmarket loops are reflected in place/faction references.
- Snapshot non-flavor fields before editing (JSON in the check script) so balance integrity is machine-verifiable without hand inspection.

## Task checklist
- [x] Snapshot current 43 commodity ids and all non-flavor fields as the integrity baseline for the validator.
- [x] Draft `displayName`, `desc`, and `lore` for all 43 ids following dry in-world voice; tie lore to `producedBy`/`consumedBy` and named places/factions.
- [x] Add flavor data to `src/data/commodities.js` (keyed object merge or per-entry fields) without touching balance fields.
- [x] Add `scripts/check-commodity-flavor.mjs` covering coverage, word limits, contraband tone guard, and balance-field integrity.
- [x] Run `node scripts/check-commodity-flavor.mjs`, `node scripts/check-data.mjs`, and `npm run check:balance`; capture outputs under `{SCRATCH}`.

## Deviations
- Flavor lives in standalone `src/data/commodityFlavor.js` (not inline in `commodities.js`); `commodities.js` imports and merges only.
- Balance-integrity and flavor-validate logs are written when `COMMODITY_FLAVOR_SCRATCH` is set; npm hook `check:commodity-flavor` in `package.json`.

## Risks / Contradictions
- OBJECTIVE lists example ids (`cmdty_ore_titan`, `cmdty_ice_volatiles`, `cmdty_refined_alloys`, `cmdty_tech_circuits`, etc.) that do not match the canonical file (`cmdty_ore_titanium`, `cmdty_volatiles`, `cmdty_alloys`, `cmdty_comp_circuitry`, …). Implementation and verification must use ids from `src/data/commodities.js` only.
