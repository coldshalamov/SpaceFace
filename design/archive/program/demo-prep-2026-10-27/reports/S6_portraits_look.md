# S6 - Portraits (row 543) and Look retune (2026-10-27)

Read-only. Nothing in the repo was edited, staged or committed.
Scratch scripts: `...\scratchpad\s6_enum.mjs`, `...\scratchpad\s6_look_eff.mjs`.

## Verdicts

| Group | Verdict | Why |
|---|---|---|
| localPortraits.js culture branch + STATION_CULTURE | FIX | Selects 64 culture faces not on disk; 27 stations lose working faces |
| localPortraits.js role re-rank (line 105) | LAND | Role files all present; spread test and fence/arrival tests pass |
| portraits.js, 18 new CANONICAL keys | HOLD | Files missing (18/18). Keep the keys: deleting them turns passing tests red |
| assets/portraits/cultures/ + manifests | INCOMPLETE | 0 face images; both manifests list 0 files |
| test/local-portraits.test.mjs | PASS 6/6 | |
| test/portrait-registry.test.mjs | RED 1/2 | ENOENT portrait_sula_dree.jpg |
| test/culture-portraits.test.mjs | RED 5/6 | ENOENT cultures/coreborn_01.jpg |
| test/world-remembers-fences.test.mjs | PASS 33/33 | Calls localPortraitForContact |
| test/al-station-1-arrival-4242.test.mjs | PASS 16/16 | Logs an unrelated bus TypeError, not checked |
| src/data/lookMoods.js | FIX | Dark moods now take the brightest base; see Part 2 |
| test/gfx12-admission-standin.test.mjs | LAND | Line endings only; 14/14 pass |

Not checked: tools/art/*.py, CANONICAL_PORTRAIT_DIRECTION.md, check-bar-canonical-contacts.mjs, the other look files (illustratedSurface.js, vfxColorLightDirector.js, fleet-look.mjs, wasp.py), and any live browser run.

## Part 1 - portraits

**Disk.** assets/portraits/ has 23 canon portraits (tracked). cultures/ has only manifest.json. locals/ has 64 role faces. `git ls-files assets/portraits` = 89.

**Who picks the file, and is disk checked?** Nothing checks disk.
- Culture: localPortraits.js lines 136-141. Station's culture -> `CULTURE_PORTRAIT_ROOT + <culture>_NN.jpg`; NN from a constant pool count (line 36). Manifest not read.
- Canonical: portraits.js lines 68-76. `CANONICAL_PORTRAITS[key]` -> file. No check.
- Caller: portraitArt.js line 61. Lines 74-81 swap in a canvas placeholder on the img error event. So a missing face shows the placeholder plus a 404, not a blank box (code reading; ledger D262 says "blank").
- Before this diff, cultured stations drew role-pool faces, which exist. Now they draw culture faces, which do not.

**Missing paths (s6_enum.mjs, live modules):**
- 35 stations; 27 cultured keys, all real station ids.
- 35 stations x 7 roles x bar slots 0-7 = 1960 contact combos. 1512 (77%) pick a culture face, and all 1512 point at missing files.
- Culture paths: 64 of 64 missing. Role-pool paths: 64, 0 missing.
- New canonical keys: 18 of 18 missing.
- Total the diff can request and not find: 82. D262's three files are a subset.

**Tests (one at a time):**
- local-portraits: 6 pass.
- portrait-registry: fails on run and rerun. First assertion "every authored recurring person owns one stable portrait identity": ENOENT `assets\portraits\portrait_sula_dree.jpg` (test line 68). Red for the right reason.
- culture-portraits: 5 pass, 1 fails "every declared culture face ships...": ENOENT `assets\portraits\cultures\coreborn_01.jpg`. The other five check path shape only.

**Smallest safe fix (proposed, NOT applied):**
1. Gate the culture branch off, since the set of existing culture files is empty:
   - Near line 36 of src/data/localPortraits.js add `export const CULTURE_FACES_ON_DISK = false;`
   - Line 137 becomes `const cultureCount = CULTURE_FACES_ON_DISK ? ((culture && CULTURE_PORTRAIT_POOL[culture]) | 0) : 0;`
   - Cultured stations then use the role pool, whose 64 files all exist.
   - Keep line 105 ungated. The even-spread assertion in test/local-portraits.test.mjs (lines 35-55) depends on the compact ranking. Gating line 105 too would match HEAD exactly, but likely turns that test red (not run).
   - Tradeoff: cultured stations fall back to the global ordinal, so their faces are not spread against the compact ranking. A repeat across stations is possible; no test covers it.
   - Culture-path tests (about four) need skip-while-off. Pool-shape tests stay.
   - "Fall back to an existing face when missing" is not possible in this pure selector: both manifests list no files.
2. Canonical 18: keep the keys. They show the same placeholder as today, plus 18 404s, until the art exists. Deleting them turns culture-portraits line 106 and the registry test red.
3. Neither change makes a face. The 82 images need the tools/art generation pipeline, which a scout cannot run.

## Part 2 - look retune

**Diff in plain words** (`git diff HEAD -- src/data/lookMoods.js`, +21/-25):
- Base light is much brighter: rockFill 0.24 -> 0.85, sceneEnv 0.14 -> 0.22, ambient gain 0.35 -> 0.6, fill gain 0.25 -> 0.5, shadow tint bluer (red and green lower).
- Back-rim is no longer scaled down: rimGain removed, so rim is at full strength (was about 28%, about 18% in neon moods).
- Headlight dimmer and tighter: intensity 420 -> 220, cone about 26 -> 21 degrees, range 450 -> 420, lamp higher (20 -> 26 WU).
- Effective rockFill after the merge (as resolveLookMood does): neon_noir 0.16 -> 0.65; sodium_yard 0.16 -> 0.85; void_signal 0.16 -> 0.85. Ambient/fill gains in those three rise to 0.45/0.35.
- Net: every sector is lighter. LOOK.md lines 177-180 still say the dark moods are dark because rockFill and rimGain are lowered, and the diff removes those overrides.

**Verdict: FIX.** The fact to act on: sodium_yard and void_signal, which LOOK.md calls dark, now take the full base 0.85, the same as arcade. neon_noir (0.65) is now the only one lower. The doc's mood ordering no longer holds. Which values are right, and whether the overall brightening stays, is the owner's call (the 2026-10-20 "dark, with lonely lights" direction). The scout did not judge it by eye.

**look-bench: RAN.**
- Flags: --moods, --bodies, --view, --name, --out, --cells, --cost, --vary; SF_GL=swiftshader for software. `--help` is not handled, so it runs a full sheet.
- My first try (`--help | head -30`) started a full run. head closed the pipe after 30 of 35 cells and the run appears to have died with no PNG. The old .devshots/look-bench/sheet.png (Oct 24) is untouched. A process check found no leftover look-bench or Chrome processes.
- Probe (exit 0, under 240 s): `node scripts/look-bench.mjs --moods=arcade,sodium_yard --bodies=kestrel --name=s6_probe --out=.devshots/look-bench-s6`
- Output: `C:\Users\93rob\Documents\GitHub\SpaceFace\.devshots\look-bench-s6\s6_probe.png` (752 KB). Log: `...\scratchpad\s6_lookbench_probe.log` (one unidentified 404). Scout did not view the PNG.

**gfx12 test:** 14/14 pass. Diff is line endings only (empty when CR is ignored). No assertion changed; the test reads no look value.
