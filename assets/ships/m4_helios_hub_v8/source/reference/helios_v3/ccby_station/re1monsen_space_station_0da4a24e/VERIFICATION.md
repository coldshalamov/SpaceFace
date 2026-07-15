# Target verification — re1monsen "Space Station"

**Status:** LICENSE VERIFIED · DOWNLOAD BLOCKED (auth required) · **no binary acquired**  
**Lane:** Helios V3 CC-BY station donor acquisition (2026-07-11)  
**SAFE-001:** not inspected  

## Identity (authoritative API + page)

| Field | Value |
|---|---|
| Title | Space Station |
| Author | re1monsen (`https://sketchfab.com/re1monsen`) |
| Sketchfab UID | `0da4a24e7edd49159737675ffcc06228` |
| Canonical URL | https://sketchfab.com/3d-models/space-station-0da4a24e7edd49159737675ffcc06228 |
| API | https://api.sketchfab.com/v3/models/0da4a24e7edd49159737675ffcc06228 |
| Fab listing (claimed) | `a50ebf13-2db6-49a2-8753-7cb9ffc09223` (HTTP 403 unauthenticated from this environment) |
| Published | 2022-10-27 |
| `isDownloadable` | **true** |
| `isProtected` | false |
| Price | null (free download when authenticated) |
| Download count (API) | 8459 |
| Face count | **170282** (~170.3k) |
| Vertex count | 101868 |
| Texture count | 5 |
| Material count | 2 |
| PBR type | metalness |
| Description claim | "4k Textures" / drag-and-drop ready |

## License (authoritative)

| Field | Value |
|---|---|
| Sketchfab label | **CC Attribution** |
| Full name | Creative Commons Attribution |
| Slug | `by` |
| Deed URL | http://creativecommons.org/licenses/by/4.0/ |
| Sketchfab requirements text | **"Author must be credited. Commercial use is allowed."** |
| License API object | https://api.sketchfab.com/v3/licenses/322a749bcfa841b29dff1e8a1bb74b0b |

### Commercial adaptation terms (CC BY 4.0 summary)

Under CC BY 4.0, reuse including **commercial use**, **modification**, and **distribution** is permitted if you:

1. Give appropriate **credit** to the creator (re1monsen) and the source (Sketchfab model page).
2. Provide a **license notice** linking to the CC BY 4.0 deed.
3. Indicate if **changes** were made.
4. Do **not** imply endorsement by the licensor.

This is **not** CC0; attribution is mandatory. This is **not** legal advice.

### Suggested attribution string (if/when binary is obtained)

> "Space Station" by re1monsen, licensed under CC BY 4.0  
> https://sketchfab.com/3d-models/space-station-0da4a24e7edd49159737675ffcc06228  
> https://creativecommons.org/licenses/by/4.0/

## Download attempts (official only)

| Endpoint | Result |
|---|---|
| `GET https://api.sketchfab.com/v3/models/0da4a24e7edd49159737675ffcc06228/download` | **HTTP 401** |
| `GET https://sketchfab.com/i/models/0da4a24e7edd49159737675ffcc06228/download` | **HTTP 401** |
| Fab listing page | **HTTP 403** unauthenticated |
| Env tokens (`SKETCHFAB_*`, `FAB_*`, `EPIC_*`) | **not set** |
| Local Sketchfab credential paths | **missing** |

**Not attempted:** scrape, rip, proxy, DRM/login circumvention, browser UI automation, third-party mirrors.

## Local artifacts (metadata only)

- `sketchfab_api_model.json` — full public Data API payload
- `download_attempt.json` — recorded 401
- **No** GLB/Blend/ZIP binary

## Why this remains the preferred hero donor

- Explicit CC Attribution with commercial use allowed
- ~170k tris (runtime-plausible vs Helindu 2.1M reject)
- Metalness PBR + 4K texture claim
- Author's free station line is consistent (Stations 3/4, Modules, etc. also CC BY + downloadable **when authenticated**)

## Unlock path (human)

1. Create/log into Sketchfab (or Fab if listing is valid).
2. Provide `SKETCHFAB_API_TOKEN` (Download API) **or** perform official website download while logged in.
3. Place archive under this directory; re-run SHA256 + inventory validation.
4. Keep attribution file; note modifications for SpaceFace (scale, LODs, material retarget, module split).
