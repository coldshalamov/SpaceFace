# SpaceFace — PC/Browser Release QA Matrix

> **Purpose.** A per-flow release checklist for the primary PC browser route
> (`node server.js` → `http://localhost:8123/`). When an optional packaged desktop shell is part of
> the deliverable, run the same flows again against the actual packaged binary (`npm run dist` →
> `dist/SpaceFace-Setup-<ver>.exe`, install, launch). The desktop shell is parity proof, not a
> separate gameplay target.
>
> **Why the optional second column exists.** The dev server (`server.js`) and the Electron in-process
> server (`electron/main.cjs`) are still two different static servers and origins. They are now
> intentionally closer than older docs claimed, but parity must be tested when packaging:
>
> | Concern | `server.js` (dev) | `electron/main.cjs` (packaged) | Consequence |
> |---|---|---|---|
> | Listen port | fixed **8123** | fixed **41788** in normal use, with ephemeral fallback only if busy | localStorage should persist across normal relaunches; still test the fallback warning path does not become the normal path |
> | MIME table | broad static MIME table | broad static MIME table including `.jpeg`, `.gif`, `.woff`, `.map`, `.glb`, `.ktx2` | parity should hold for current asset types; add a QA row when introducing a new extension |
> | Directory index fallback | yes (`isDirectory → index.html`) | yes (`isDirectory → index.html`) | no known divergence; keep a smoke test for bare-dir URLs if tooling adds any |
> | `Cache-Control: no-cache` | set | set | no known stale-asset divergence |
> | `/__shot` dev screenshot sink | yes | **no** | dev-only; not shipped (correct) |
> | Files shipped | whole repo ROOT | `package.json build.files` allowlist (`build/web/**`, `electron/**`, `package.json`, selected `assets/**`) | any newly player-facing runtime asset must be added to `build.files`; browser success alone does not prove packaged availability |
>
> **Standing rule.** Browser release claims require the browser column. Desktop-shell release claims
> require both columns. Do not make desktop packaging change gameplay, assets, settings defaults, or
> feature reachability.

Legend: **PASS** / **FAIL** / **BLOCKED** / **N/T** (not yet tested) / **N/A**. Fill the two test
columns at each QA pass; keep the Notes column for the build-path caveat and the canonical event(s)
the flow depends on (grepped from `src/`, not spec aliases).

---

## A. Player-facing flow matrix

| # | Flow | Dev-server pass | Electron-build pass | Notes (events / build-path caveats) |
|---|---|---|---|---|
| F-01 | **Boot → boot-overlay clears → Main Menu** (`state.mode='menu'`, no sim) | N/T | N/T | `index.html` `#boot-overlay`; importmap resolves `three`→`vendor/three.module.js`. Electron: confirm importmap + ESM load over `http://127.0.0.1:<port>/` exactly as the browser. |
| F-02 | **New Game** → `SaveSystem.newGame(seed)` path → `game:started` → home sector → `mode='flight'` | N/T | N/T | emits `game:started` (`src/main.js:98`); `world` emits `sector:enter`. Starter = `ship_kestrel`, cargo 40u (ARCH §0.10). |
| F-03 | **Continue / Load latest** from Main Menu | N/T | N/T | `game:load {slot:'latest'}`. Desktop shell should keep saves across normal relaunches via fixed port 41788; verify SAVE-1. |
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

These are not player flows — they are the **parity checks** that keep the optional desktop shell from
silently diverging from the primary browser route. Exercise them against the installed binary when
desktop packaging is in scope.

| # | Risk | Dev | Electron | Detail & required test |
|---|---|---|---|---|
| SAVE-1 | **Save persistence across desktop-shell relaunch** | PASS (fixed port 8123 → stable origin) | N/T | `electron/main.cjs` normally binds fixed port 41788, so saves should persist across relaunch. **Test:** New Game → dock (autosave) → fully quit Electron → relaunch → is "Continue" present and loadable? Also confirm the console did not warn that 41788 was busy and an ephemeral fallback was used. |
| ASSET-1 | **Packaged asset allowlist covers player-facing runtime media** | PASS (server serves ROOT) | N/T | `package.json build.files` currently includes `build/web/**`, `electron/**`, `package.json`, `assets/cinematics/**`, `assets/ui/**`, and `assets/ships/**`. **Test:** in the installed build, the Main Menu background, HUD icons, release ship assets, and any newly wired runtime media render. If assets under other folders become player-facing, add those folders to `build.files`. |
| MIME-1 | **MIME table parity for current asset types** | PASS | N/T | Electron MIME currently covers `.jpeg`, `.gif`, `.woff`, `.map`, `.glb`, `.gltf`, `.ktx2`, etc. **Test:** network panel shows no player-facing asset served as unexpected `application/octet-stream`; add the extension to both servers if a new runtime asset type appears. |
| ROUTE-1 | **Directory-index fallback parity** | PASS | N/T | Both servers map directories to `index.html`. **Test:** confirm no runtime or tool route depends on behavior that differs between servers. |
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

**Release gate:** every F-row and Section-B row PASS in the browser column. If a desktop shell is
shipped, the same rows must PASS in the desktop-shell column (or be N/A with a written reason),
SAVE-1 and ASSET-1 must be explicitly cleared against the installed binary, and Section-C corruption
tests must be green.
