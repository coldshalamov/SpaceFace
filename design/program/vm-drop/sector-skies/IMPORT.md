# Sector skies — outbox import

## What this is

Six dark equirectangular sky PNGs (2048×1024), one per sector mood. Mean
luminance is kept ~0.013–0.017 so in-flight action reads brighter than the
backdrop. PNGs only — no live wiring in this drop.

Evidence and hashes live in `build-report.json` (schema
`spaceface.vmDrop.sectorSkies.v1`).

### Moods and filenames

| # | Mood id | Mood | Outbox file | Galaxy allowed |
|---|---|---|---|---|
| 1 | `helios_orbital_void` | Helios orbital void | `sky_helios_orbital_void.png` | no |
| 2 | `core_trade_constellation` | Core trade constellation | `sky_core_trade_constellation.png` | no |
| 3 | `belt_broken_dust_lane` | Belt broken dust lane | `sky_belt_broken_dust_lane.png` | no |
| 4 | `fringe_tidal_filament` | Fringe tidal filament | `sky_fringe_tidal_filament.png` | no |
| 5 | `anomaly_electromagnetic_scar` | Anomaly electromagnetic scar | `sky_anomaly_electromagnetic_scar.png` | no |
| 6 | `galactic_spur` | Galactic spur | `sky_galactic_spur.png` | **yes — only galaxy-allowed image** |

Single galaxy allowance: **`sky_galactic_spur.png`** (`galactic_spur`). The other
five must not read as a galaxy band.

SHA-256 (from `build-report.json`):

- `sky_helios_orbital_void.png` — `a23209ad8608b2ea37add0789abe1453e60774155068b9c45355db653ff64d92` (mean 0.0149)
- `sky_core_trade_constellation.png` — `f358767e1569446debad96cce5c2361e17681991e653b5070f4e7918e462aa1e` (mean 0.0170)
- `sky_belt_broken_dust_lane.png` — `880358f9de086447090c0b69bac220ead8c93b6354cbdb9bbf5164a82644adff` (mean 0.0127)
- `sky_fringe_tidal_filament.png` — `34a5771ab230c59b84bd315b80b52377c92c277a2cbb8e7c53740501b5a7ccc0` (mean 0.0157)
- `sky_anomaly_electromagnetic_scar.png` — `5c493d45214977b1e1ef534648dc65a6de0dacf6ea4314ec8dc319165668a8a6` (mean 0.0137)
- `sky_galactic_spur.png` — `4a0da05e51a23ac5b6db29185ed2ae9948210dea23605663dbdac80edfb2a8ab` (mean 0.0156)

## Exact future live paths

Only if a later owner-side promotion accepts this outbox into sector visual
profiles (owner decides; **do not edit** `src/data/sectorVisualProfiles.js` in
this job):

| Outbox file | Future live / authoring destination (owner decides) |
|---|---|
| `sky_helios_orbital_void.png` | Sector visual profiles / deep-field sky for `helios_orbital_void` |
| `sky_core_trade_constellation.png` | Sector visual profiles / deep-field sky for `core_trade_constellation` |
| `sky_belt_broken_dust_lane.png` | Sector visual profiles / deep-field sky for `belt_broken_dust_lane` |
| `sky_fringe_tidal_filament.png` | Sector visual profiles / deep-field sky for `fringe_tidal_filament` |
| `sky_anomaly_electromagnetic_scar.png` | Sector visual profiles / deep-field sky for `anomaly_electromagnetic_scar` |
| `sky_galactic_spur.png` | Sector visual profiles / deep-field sky for `galactic_spur` (only galaxy-allowed) |

Reference (read-only in this drop): `src/data/sectorVisualProfiles.js`,
`src/render/deepFieldStructureRecipes.js`, `src/render/deepFieldStars.js`.

## What is not wired / freeze notes

Nothing is wired. **Do not edit** `src/data/sectorVisualProfiles.js`. No change
to `src/`, manifests, `NOW.md`, `VM_LANES.md`, or shared builders. Outbox only
under `design/program/vm-drop/sector-skies/`.
