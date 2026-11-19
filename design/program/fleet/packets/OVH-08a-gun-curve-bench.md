# OVH-08a — Measure the gun curve (bench only, no tuning)

> **Pipeline (director, 2026-11-19) — overrides PROTOCOL.md on git:** make NO git writes (no add,
> commit, stash, reset, checkout, restore, worktree). Leave your edits in the working tree; the
> director harvests, reviews and commits them. Other agents keep uncommitted work in many files: edit
> surgically, never reformat, keep each file's line endings (most are CRLF). Never run the whole
> test suite; nothing here needs a game boot.

**Design:** `design/overhaul/03_COMBAT.md` §3.1 (ruling R5: every gun trades damage for kick). The
family table — Hose, Pew, Burn, Needle, Thump, Boom, Trick — gives starting targets against a Wasp
(16 t) at mid range. This packet measures; the director tunes afterwards.

## Do

1. **Families as data:** `src/data/gunFamilies.js` exporting `GUN_FAMILY_BY_WEAPON_ID` (every
   weapon id in `src/data/weapons.js` mapped to one family by its stats and description) and
   `GUN_FAMILY_BANDS` (the §3.1 targets as numbers: time-to-kill band, displacement band).
2. **Bench:** `scripts/bench-gun-curve.mjs` — headless, seeded, the real weapon/damage/impulse code.
   Reuse the harness `scripts/bench-displacement-ttk.mjs` and `test/displacement-ttk-baseline.test.mjs`
   already use. For each weapon fire continuously at one Wasp (16 t) at mid range and record:
   time-to-kill; displacement per second of fire (WU/s, and in the screen-depth unit FEEL_CONTRACT
   B5 uses — find it); time to overheat. Write `.devshots/fleet/OVH-08a/gun-curve.md` (a table with a
   PASS/MISS column against the family band) and `gun-curve.json` beside it. Under 3 minutes.
3. **Test** `test/ovh-08a-gun-families.test.mjs`: every weapon id has a family; every family has a
   band; the bench's pure helpers (if any) behave on a fixed input.
4. **Do not change any weapon value.** Another builder is editing `src/data/weapons.js` right now —
   read it only.

**Done when:** the bench writes the table; the test passes. **Receipt:** paste the table.
