# SpaceFace — Release QA Matrix (Steam-bound Electron build)

> **Purpose.** A per-flow release checklist that is run **twice** — once against the dev node
> server (`node server.js 8123`, the `.claude/launch.json` "spaceface" config) and once against the
> **actual packaged Electron binary** (`npm run dist` → `dist/SpaceFace-Setup-<ver>.exe`, install,
> launch). A flow is only "green for release" when **both** columns pass.
>
> **Why two columns is not paranoia — the build paths genuinely diverge.** The dev server
> (`server.js`) and the Electron in-process server (`electron/main.cjs`) are *two different static
> servers with two different MIME/route tables*, and they run the page at *two different origins*.
> A flow can pass in the browser tab and fail in the shipped binary (or vice-versa). The
> divergences below are real, read off the two source files, not hypothetical:
>
> | Concern | `server.js` (dev) | `electron/main.cjs` (packaged) | Consequence |
> |---|---|---|---|
> | Listen port | **fixed 8123** (launch.json) | **`server.listen(0)`** → random ephemeral port *every launch* | localStorage origin (`http://127.0.0.1:<port>`) changes each Electron launch → **saves may not carry over** (see SAVE-1) |
> | MIME `.jpeg`/`.gif`/`.woff`/`.map` | present | **absent** → served as `application/octet-stream` | a `.jpeg`/`.gif`/`.woff` asset can fail to load in Electron only |
> | Directory index fallback | yes (`isDirectory → index.html`) | **no** | a bare-dir URL 404s in Electron only |
> | `Cache-Control: no-cache` | set | **not set** | stale-asset risk after a patch in Electron only |
> | `/__shot` dev screenshot sink | yes | **no** | dev-only; not shipped (correct) |
> | Files shipped | whole repo ROOT | **`package.json build.files` allowlist** (index.html, styles, vendor, src, electron, package.json) | anything outside the allowlist 404s in Electron only (see ASSET-1) |
>
> **The standing rule: QA must run the real binary.** The dev server is a convenience; it is *not*
> the ship vehicle. No flow ships green on the strength of the dev column alone.

Legend: **PASS** / **FAIL** / **BLOCKED** / **N/T** (not yet tested) / **N/A**. Fill the two test
columns at each QA pass; keep the Notes column for the build-path caveat and the canonical event(s)
the flow depends on (grepped from `src/`, not spec aliases).

---

## A. Player-facing flow matrix

| # | Flow | Dev-server pass | Electron-build pass | Notes (events / build-path caveats) |
|---|---|---|---|---|
| F-01 | **Boot → boot-overlay clears → Main Menu** (`state.mode='menu'`, no sim) | N/T | N/T | `index.html` `#boot-overlay`; importmap resolves `three`→`vendor/three.module.js`. Electron: confirm importmap + ESM load over `http://127.0.0.1:<port>/` exactly as the browser. |
| F-02 | **New Game** → `SaveSystem.newGame(seed)` path → `game:started` → home sector → `mode='flight'` | N/T | N/T | emits `game:started` (`src/main.js:98`); `world` emits `sector:enter`. Starter = `ship_kestrel`, cargo 40u (ARCH §0.10). |
| F-03 | **Continue / Load latest** from Main Menu | N/T | N/T | `game:load {slot:'latest'}`. **Electron-specific risk: SAVE-1** (origin port change → "no_save"). |
| F-04 | **Fly: thrust + rotate + drag**, mouse-aim heading | N/T | N/T | XZ plane, yaw around +Y (ARCH §0.1). Pointer-lock / mouse-ray identical under Electron? Verify. |
| F-05 | **Boost** (hold) → speed up, `ship:boostStart/Stop` | N/T | N/T | flight emits boost events; audio+vfx consume. Cosmetic but audible — check audio gesture-unlock (F-22). |
| F-06 | **Combat kill** an NPC → loot/bounty/credit grant | N/T | N/T | fires **`entity:killed`** (NOT the dead alias `combat:kill`, ARCH §4.4). missions/factions/economy react. |
| F-07 | **Player death → respawn** (loaner Kestrel, insurance) | N/T | N/T | `combat` emits **`player:death`** then **`player:respawn`** (`src/systems/combat.js:194,206`). Save **autosave is gated off while dead** (`saveSystem` `_playerDead`). |
| F-08 | **Mine** asteroid → ore pickups → magnet pull → **cargo fills** | N/T | N/T | `pickup:collected` → cargo writer. Volume is the only hard cap (40u; ARCH §0.13). Mining beam 18 ore-HP/s. |
| F-09 | **Dock** at station (Enter in range) | N/T | N/T | `input` emits **`dock:docked`** (`src/ui/input.js:29`); triggers autosave('dock'), market snapshot, HUD swap. |
| F-10 | **Sell** cargo at market → credits up, cargo down | N/T | N/T | economy is sole credits writer (ARCH §0.6). Trade emits **`economy:tradeCompleted`** (`economy.js:504`). |
| F-11 | **Buy / trade** commodity → see price, stock, fees | N/T | N/T | one commodity registry (`cmdty_*`, ARCH §3.6.1). Volume validated, mass never blocks (ARCH §0.13). |
| F-12 | **See an unaffordable item** (ship/module priced above credits) | N/T | N/T | First-5-min contract beat (PLAYTEST_SCRIPT step 5). UI must show price + disabled buy, not crash. |
| F-13 | **Jump / Starmap** → select sector → charge → arrive | N/T | N/T | `M` opens starmap (`input.js:75`). `world` jump FSM; `sector:enter` on arrival → autosave('sector'). |
| F-14 | **Shipyard / outfitting** → buy ship, fit/unfit modules | N/T | N/T | `ships` emits **`ship:purchased`** (`ships.js:481`). Fitting grid: 6 types × S/M/L (ARCH §0.18). |
| F-15 | **Tech tree** → spend RP → research node → unlock applies | N/T | N/T | `ships` emits **`tech:researched`** (`ships.js:431`); `T` opens screen (`input.js:77`). |
| F-16 | **Missions board** → open, **accept**, **complete** | N/T | N/T | `missions` emits **`mission:accepted`** (`missions.js:413`) + **`mission:completed`** (`missions.js:662`, autosave trigger). |
| F-17 | **Automation** → deploy drone/trader/outpost, see passive accrual | N/T | N/T | `J` opens screen (`input.js:79`). Offscreen accrual is statistical (ADR-0002 / V2 §33). Verify upkeep drain + loss roll. |
| F-18 | **Quicksave (F5)** | N/T | N/T | `input.js:59/89` `ev.preventDefault()` → `game:save {slot:'quick'}`. **Dev-tab note:** F5 is intercepted (verified) so it does NOT refresh the page. |
| F-19 | **Quickload (F9)** | N/T | N/T | `input.js:60/91` → `game:load {slot:'quick'}`. Restore is atomic (validate before destructive, `saveSystem.loadEnvelope`). |
| F-20 | **Save → Export to file** (`.json` download) | N/T | N/T | `saveSystem.exportSlot` → `spaceface_<slot>_<date>.json` via `<a download>`. **Electron-specific: BLOB/`URL.createObjectURL` download in a frameless `BrowserWindow` — verify it lands in Downloads, not a silent no-op.** |
| F-21 | **Import from file** → load that save | N/T | N/T | `saveSystem.importFile` (FileReader → `importString` → validate+migrate+restore). Verify the file picker opens under Electron. |
| F-22 | **Settings: audio / video / gameplay** apply live | N/T | N/T | `settings.js` emits **`settings:changed`**. AudioContext resumes on first gesture (autoplay policy) — confirm under Electron. |
| F-23 | **Settings: key rebinding** (new V2 feature) | N/T | N/T | rebind capture `ev.preventDefault();ev.stopPropagation()` (`settings.js:327`), persists to `settings.keybinds`. Verify a rebind survives save/load and a reserved key (Esc/F5) is handled. |
| F-24 | **Pause** (`P`) → sim frozen, render+UI live, music ducks | N/T | N/T | `timeScale=0` gates `stepSim` (ARCH §2.2). Recent fix: music+alarms go quiet behind pause. Verify under Electron. |
| F-25 | **Resume** from pause → sim continues, no jump/desync | N/T | N/T | accumulator should not "spiral" (8-step cap, ARCH §2.2). |

---

## B. Build-path / packaging risk rows (the "run the binary" rows)

These are not player flows — they are the **divergence checks** that the two-column discipline
exists to catch. Each MUST be exercised against the installed binary, not just the dev tab.

| # | Risk | Dev | Electron | Detail & required test |
|---|---|---|---|---|
| SAVE-1 | **Save persistence across Electron relaunch — UNVERIFIED, suspected total loss** | PASS (fixed port 8123 → stable origin) | **N/T — HIGH RISK** | `electron/main.cjs:32` `server.listen(0)` picks a *random* port each launch; Chromium keys `localStorage` by origin `scheme://host:port`. New port ⇒ new origin ⇒ prior `sf.save.*` keys invisible. **Test:** New Game → dock (autosave) → fully quit Electron → relaunch → is "Continue" present and loadable? If not, this blocks release until the Electron server uses a **fixed port** (or saves move to a file under `app.getPath('userData')`). |
| ASSET-1 | **`assets/` not in `electron-builder` `files` allowlist** | PASS (server serves ROOT) | **N/T — likely FAIL** | `styles/ui.css` loads `../assets/cinematics/menu_background.jpg` (L54, L203) and `../assets/ui/icons_atlas.jpg` (L178). `package.json build.files` ships index.html/styles/vendor/src/electron/package.json — **no `assets/**`**. **Test:** in the installed build, does the Main Menu show its background + are HUD icons present? If broken, add `"assets/**"` to `build.files`. |
| MIME-1 | **MIME table mismatch** (`.jpeg`/`.gif`/`.woff`/`.map`) | PASS | N/T | Electron MIME lacks these → `application/octet-stream`. Most repo art is `.jpg` (served) but any `.jpeg`/`.gif`/`.woff` would mis-serve. **Test:** network panel for octet-stream on a known asset; or just confirm all referenced art renders. |
| ROUTE-1 | **No directory-index fallback in Electron** | PASS | N/T | dev maps `/dir/` → `/dir/index.html`; Electron 404s. **Test:** confirm no runtime code fetches a bare directory path. |
| BOOT-1 | **ESM + importmap load under `http://127.0.0.1:<port>/`** | PASS | N/T | `contextIsolation:true, nodeIntegration:false` (good). Confirm `vendor/three.module.js` + `vendor/addons/` resolve and no CSP/file:// surprises. |
| DL-1 | **File download + file-open dialogs in frameless window** | PASS (browser) | N/T | Export (F-20) uses `<a download>`; Import (F-21) uses an `<input type=file>`. Both depend on Chromium dialogs that a frameless, menu-removed `BrowserWindow` still honors — verify, don't assume. |

---

## C. Save / migration risk callout (precise)

- **Migration machinery exists but has NEVER executed.** `src/save/migrations.js` exports
  `MIGRATIONS = []`; schema is **v1** (`src/data/saveVersion.js`). The version-bump → append
  `{from,to,fn}` → migrate-a-copy path (`saveSystem.runMigrations`, atomic, validates before
  destructive restore) is **untested in anger** because no migration has ever been authored. The
  *first* real schema change is the moment to write a dedicated migration test — do not let v1→v2
  ship without a round-trip test (old save → migrate → load → re-serialize).
- **Corruption handling is implemented and should be tested now (cheap):** FNV-1a checksum
  (`checksum.js`), and `loadEnvelope` rejects `bad_format` / `newer_version` / `no_data` /
  `checksum` / `no_player` with a `save:error` event and **no destructive write**. QA should feed a
  truncated and a tampered `.json` to Import (F-21) and confirm graceful refusal, not a crash.
- **Autosave debounce + death gate:** ≤1 write / 10 s; suppressed while `_playerDead`. Verify an
  autosave does NOT fire on the death frame (would persist a dead state).

---

## D. Per-pass sign-off

| QA pass | Date | Build (dev SHA / installer ver) | Tester | Flows green | Blockers |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |

**Release gate:** every F-row and every Section-B risk row PASS in **both** columns (or N/A with a
written reason), SAVE-1 and ASSET-1 explicitly cleared against the installed binary, and Section-C
corruption tests green.
