# FB-139 — A vengeful return is announced through the ace memory voice, not only felt through spawns

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: e1EncounterRuntime.js, seam: aceMemory.js, seam: barkDirector.js
**Write-set:** `src/systems/e1EncounterRuntime.js`, `src/systems/aceMemory.js`, `test/fb-vengeful-return-announced.test.mjs`
**Neighbours (extend, never restate):** SFQ-B114

## The gap
`moralMemory:vengefulReturn` is emitted from `e1EncounterRuntime.js` with no listener anywhere. The ace memory
already speaks remembered barks on return (`rememberedBarkFor`) and posts news on transitions; a return driven
by moral memory (a spared pirate coming back angry) arrives without the sentence that explains it. SFQ-B114
wants rivals to change a countermeasure on return; this is the announcement of the return itself.

## Why this direction
The ace memory owns return voice; one subscription routes the moral-memory return into it.

## Mechanism
- Subscribe `aceMemory.js` to `moralMemory:vengefulReturn` and publish the remembered bark plus a cited news
  line naming the earlier mercy.
- Pin one bark and one line per return on a seed-4242 spare-then-return script.

## Done when
`test/fb-vengeful-return-announced.test.mjs`: one bark, one cited line, none for a first encounter; ace memory
suites stay green.

## Do not
Do not change return odds. Do not announce for unspared aces.

## Focus test starting points
- Locate ace suites with `rg aceMemory test/`; `test/survivor-pod-causal.test.mjs` for the mercy path.
