# COPY-SWEEP — every word a player reads is plain English

**For:** a careful editor who can follow strings to their source. **Kind:** player-facing text only.
No behaviour changes. **Commit in the batches named below.**

## Why

The owner: "the UI is often filled with gibberish language." A reviewer swept the 17,798-string
English catalogue and the live frames and listed the offenders with files: read
`.devshots/director/fable/ux/FRESH-EYES.md` section 3 ("The Gibberish List", lines 274–336) and
item 8 of section 5. That list is your work order. Add anything of the same kind you find.

## Rules for the words

1. **No internal names.** A player never reads: Crucible (say Swarm, or "the arena"), Massline or
   Mass Seed (say Line), Gyre, Well / Repulsor / Seed / Field as power names (the powers are Pull,
   Shove, Pin, Bomb, Plow), AFTERMATH, FIELD RESPONSE, IGNITION / FLARE / NOVA as tier names,
   MIXED / TERRAIN / DIRECT +N, Converged on, Unknown weapon, "? unknown", STALE, TOO HEAVY,
   pressure %, cr/min, headroom, cap load, Research points, Bay screen, Station wire, banked into
   the hangar, Ship fix, Hdg, "A VERB EVERY HOUR", DEV — SANDBOX, and faction ids on Swarm enemies.
2. **Units a person knows.** Distances read `m` and `km` (`186 m`, `1.2 km`), speeds `m/s`. No `u`,
   `wu`, `WU`, `U/S`, `k u`. This is a label change only: do not change any number or calculation.
3. **One spelling: US English** (armor, license, customize, plow).
4. **Short and literal.** Say what the thing is or what the button does. Eight words or fewer for
   anything shown during flight. No jokes that hide the meaning, no author's shorthand.
5. **Every template renders.** The catalogue has about 48 strings where a `${...}` placeholder can
   print raw or blank. Fix each at its source so the sentence is complete with or without the value,
   and so an unbound key's hint is simply not shown (never the word "unbound", never a blank).
6. **One name per thing.** The starter ship is Hitch everywhere. The map is "Map" on one key (M).
   Money is `cr` in Adventure and `Scrap` in Swarm.
7. When a sentence is a deliberate story line in a character's voice (dialogue, lore, mail), keep
   the voice; only fix internal names and units inside it.

## How

- The catalogue `src/localization/catalogs/en-US.generated.json` is **generated**. Each key names its
  source (`loc.src.ui.screens.mainmenu...` → `src/ui/screens/mainMenu.js`). Edit the source string,
  then regenerate the catalogue with the project's generator (find it: `grep -rn "en-US.generated"
  scripts package.json | head`). Never hand-edit the generated file.
- Change text only. Do not rename identifiers, ids, event names, file names, save keys or CSS
  classes, even if they contain a banned word.
- A test that pins old wording: update its expected text to the new wording.
- **Skip these files** (another agent is rebuilding them now and owns their words):
  `src/ui/orrery/visorInstruments.js`, `arsenalGlyphs.js`, `flightCluster.js`, `hudAdapter.js`,
  `src/ui/powerRail.js`, `fieldHud.js`, `massSeedHud.js`, `hudAttention.js`, `threatHalo.js`,
  `src/ui/survivalHud.js`, `swarmJuiceHud.js`, `src/ui/pilotCards.js`, `src/ui/screens/crucible*.js`,
  `src/systems/input.js`, `src/systems/powerVerbs.js`, `src/systems/onboarding.js`.
- Other agents are editing the repo. Before each file: `git diff -- <file>`; if it has lines that are
  not yours, use `bash scripts/fleet/own-commit.sh begin <file>` before editing and
  `bash scripts/fleet/own-commit.sh commit "<msg>" <files>` to commit only your lines.

## Batches (one commit each)

1. Units everywhere (`m`, `km`, `m/s`).
2. Internal names in menus, title, pause, settings, help, achievements (including the Steam
   achievement text that says Crucible).
3. Internal names and author-speak in station screens, the map, mission and job text.
4. Broken templates and unbound-key blanks.
5. Spelling, and anything left from the list.

After each batch: regenerate the catalogue, run the tests that mention the files you touched
(`grep -rln "<file basename>" test | head -20`, then `node --test <those>`), and fix what you broke.

## Then add the guard

Write `scripts/check-plain-words.mjs`: it reads the generated English catalogue and fails, listing
key and text, on any banned word from rule 1 or unit from rule 2 (word-boundary match, case
insensitive; allow an explicit short allowlist of keys for story lines that legitimately use a
word). Add it to `package.json` as `check:plain-words`. It must pass when you finish.

## Receipt

Counts per batch, the strings you were unsure about and left, the allowlist with a reason per entry,
and the final output of `npm run check:plain-words`.
