# assets/portraits/ — Station Bar NPC Portraits

> **LIVE assets** for station bar and contact dialogue panels. **Not** flight HUD art.
> Registry: `src/data/portraits.js` · loader: `src/ui/portraitArt.js` · consumer: `src/ui/screens/bar.js`

---

## Status

| Field | Value |
|---|---|
| Format | JPEG (`.jpg`) |
| Count | 15 files (8 canonical story + 7 role archetypes) |
| Bundled | ✅ `assets/portraits` in `build-bundle.mjs` + `package.json` |
| Fallback | Procedural canvas stick-figure avatar (`portraitArt.js`) on missing/404 |
| Forbidden substitute | `assets/pilots/pf_spaceface_portraits.jpg` — helmet/visor bible sheet, HUD-banned motif |

---

## Canonical story contacts

Keyed by `contact.canonicalKey` in bar NPC records:

| Key | File |
|---|---|
| `kessler` | `portrait_kessler.jpg` |
| `rook` | `portrait_rook.jpg` |
| `voss` | `portrait_voss.jpg` |
| `hale` | `portrait_hale.jpg` |
| `mira` | `portrait_mira.jpg` |
| `slate` | `portrait_slate.jpg` |
| `drift` | `portrait_drift.jpg` |
| `quinn` | `portrait_quinn.jpg` |

Resolution order in `portraitAssetForContact()`: canonical key first, then role archetype.

---

## Role archetypes (procedural bar NPCs)

Keyed by `contact.role` when no canonical match:

| Role | File |
|---|---|
| `barkeep` | `portrait_role_barkeep.jpg` |
| `merchant` | `portrait_role_merchant.jpg` |
| `pilot` | `portrait_role_pilot.jpg` |
| `smuggler` | `portrait_role_smuggler.jpg` |
| `engineer` | `portrait_role_engineer.jpg` |
| `bounty_hunter` | `portrait_role_bounty_hunter.jpg` |
| `miner` | `portrait_role_miner.jpg` |

---

## Adding a portrait

1. Drop `portrait_<key>.jpg` in this folder (head-and-shoulders, neutral background, readable at ~68px circle crop).
2. Add mapping in `src/data/portraits.js` (`CANONICAL_PORTRAITS` or `ROLE_PORTRAITS`).
3. Wire the NPC record's `canonicalKey` or `role` in narrative/bar data.
4. Run `npm run check:asset-reachability`.

Do **not** add portraits to the flight HUD. Do **not** point at `assets/pilots/` or `assets/concept/people/` — those are reference-only.

---

## Style notes

- Massline industrial sci-fi, lived-in faces, no helmet/visor framing (bar is diegetic station UI, but visor pilots read as cockpit HUD motif).
- Match palette hints from `assets/concept/people/` for new gens, but export clean crops without baked captions.