# Verification Rubric — the rigor gate

**This is the load-bearing document in the research orchestration.** The sprint prompts ask Antigravity to be rigorous; **this document is what actually enforces it.** Antigravity (Gemini 3.5 Flash) structurally collapses to a deliverable regardless of prose constraints — that's been proven five times. So the contract is: Antigravity produces drafts, **I (ZCode) verify each draft against source before it's trusted.** No file in `research/verified/` is trustworthy until it passes this rubric.

---

## What "pass verification" means

A sprint output passes when **every load-bearing claim is independently re-checkable against a cited source.** Not "the report reads well." Not "it has citations." The citations must resolve, and the specific claims behind them must hold when I re-fetch.

This is the exact failure mode of the five prior attempts: reports that *performed* rigor (titled "Comprehensive Directory," with exact stats like `Hull 180, Shield 90`) but were ungrounded — pulled from training memory, sampling ~20% of a game's content and calling it exhaustive. This rubric exists to catch that.

---

## Verification procedure (per sprint output)

Run all five checks. Any hard-fail → return the draft to Antigravity with a named deficiency, or re-run the sprint as ZCode.

### Check 1 — Provenance: did it actually fetch the sources?

**For open-source games (Template A):**
- The sprint was required to write `research/_tools/extract_<game>.{mjs,py}` that fetches + parses the real data files from the repo. **Verify the script exists, runs, and its output matches the report's counts.**
- I re-run the script myself (or re-fetch the raw data file directly via `WebFetch` / `mcp__web_reader__webReader` on the raw GitHub/Codeberg URL). If my re-fetch yields a different count than the report states, the report fails.
- Specifically re-fetch `data/ships.txt` (Endless Sky) or `dat/ssys/*.xml` (Naev) and count entities. The number must match the report to within parsing tolerance (±2 for whitespace/format edge cases). A report claiming "40 ships comprehensive" against a file with 200+ ship definitions is an **automatic hard-fail** regardless of any other merit.

**For commercial games (Template B):**
- For every stated count, click through to the cited wiki/DB URL and confirm the count is defensible. Wikis sometimes over- or under-count; the test is "does the cited source actually support this number."
- A count with no resolvable source URL = hard-fail for that category.

### Check 2 — Coverage: does the enumeration match the count?

The report states counts (e.g. "factions: 14"). The enumeration section must list (or honestly sample) that many.
- If "factions: 14" and 14 factions are listed → pass.
- If "ships: 247" and 40 are listed under a heading titled "Comprehensive" → **hard-fail** (this is the exact prior-attempt failure).
- If "ships: 247" and 40 are listed under a heading honestly titled "Sample of 247 (top 40 by role)" with a pointer to the canonical full list → **pass** (honest sampling is fine; mislabeling a sample as comprehensive is not).

The test sentence: *"Could a reader mistake this for complete when it isn't?"* If yes, fail.

### Check 3 — Stat integrity: are numbers sourced or confabulated?

Exact numeric stats (Hull 180, Shield 90, Drag 0.8, mass 12, etc.) are the highest-confabulation-risk claims — they're easy to generate plausibly from memory and hard for a reader to verify.
- Spot-check **5–10 random stats** against their cited source. For open-source games, the source is the parsed data file — check the raw file. For commercial games, the source is the wiki page — fetch it and search for the number.
- If ≥2 spot-checked stats don't match their source (or the source doesn't contain them), **hard-fail** — the report is likely confabulating broadly.
- If a stat is marked "specs not published" rather than guessed → that's a pass (honest omission beats fabrication).

### Check 4 — Source discipline: are citations real and resolvable?

- Sample 10 random citation URLs from the report. Fetch each. They must resolve to a page that actually contains the claimed content.
- Dead links, URLs that resolve to unrelated pages, or claims presented without any citation where a citation is required → deficiency. ≥3 broken citations = hard-fail.
- Lore claims (faction personality, ship role) may cite a wiki; that's fine. Numeric/count claims must cite the primary source (data file or authoritative DB), not a wiki summary of a wiki.

### Check 5 — Scope discipline: did it stay in its lane?

Template A/B outputs must **not** contain SpaceFace recommendations or cross-game synthesis (those are later sprints). Template C must not introduce new game-specific facts. Template D must ground every category in the synthesis.
- A per-game inventory that sneaks in "SpaceFace should build X" → return for trim (minor, fixable in-revision).
- A synthesis that introduces a game fact not present in any verified inventory → hard-fail (ungrounded).

---

## Verification outcomes

| Result | Meaning | Action |
|---|---|---|
| **PASS** | All 5 checks hold; counts match sources, stats verify, citations resolve, scope is clean | File is trustworthy. Move/copy to `research/verified/`. Proceed to next sprint. |
| **REVISE** (with named deficiencies) | Provenance and scope are honest, but specific claims failed spot-checks (a mislabeled sample, 2-3 confabulated stats, a couple dead links) | Return to Antigravity with the specific deficiency list + this rubric. One revision round. If it still fails the same way, escalate to REJECT. |
| **REJECT** | Structural failure: claimed-comprehensive-but-sampled, broad confabulation, source never fetched, counts invented | Do not send back for revision — the failure mode is architectural, revision won't fix it. Either re-dispatch the sprint with tighter pinning, or **ZCode runs that sprint directly** (for open-source games, ZCode's file-fetching subagents can do the extraction with citations). |

**Default policy for the first sprint (S1 Endless Sky):** if it doesn't PASS outright, treat as REJECT and have ZCode do the extraction. S1 sets the quality bar; a weak S1 normalizes weak output for the rest.

---

## What I specifically watch for (the prior-attempt fingerprints)

These are the exact tells from the five failed attempts. If any appears, lean toward REJECT:

1. **"Comprehensive" / "Complete" / "All" in a heading, with a number that's obviously low for the genre.** Endless Sky has ~200+ ships; a "comprehensive" list of 40 is the tell.
2. **Exact stats with no source column.** `Hull 180, Shield 90, Drag 0.8` presented as fact with no data-file citation = almost certainly from memory.
3. **Wall-clock under ~3 minutes for an open-source extraction sprint.** Real repo fetch + parse + enumerate-all takes longer; a 60-second "done" means it didn't fetch.
4. **A SpaceFace recommendations section inside a per-game inventory.** Scope creep masking shallow research.
5. **Counts presented without their source URL inline.** "ships: 247" must be followed by where 247 came from.
6. **Stats that match an outdated game version with no version note.** Stats drift across patches; unsourced stats are unverifiable.

---

## The meta-rule

**If I cannot independently reproduce a claim from its cited source in under one minute, the claim is not verified.** The whole point of this gate is that "the report says so" is not evidence — the source saying so is. When in doubt, re-fetch.

This is slower than trusting the drafts. It is the only way to not repeat attempts 1–5.

---

## Record-keeping

For each sprint verified, append a one-line entry to `research/verified/_AUDIT_LOG.md`:

```
YYYY-MM-DD | <game> | PASS | <counts verified> | <spot-checks: N/M passed> | <verifier notes>
YYYY-MM-DD | <game> | REVISE | <deficiencies> | sent back / re-run
YYYY-MM-DD | <game> | REJECT | <reason> | ZCode re-ran directly / re-dispatched
```

This log is the provenance chain: anyone (you, a future agent) can see what was checked, when, and by what verdict. Files in `research/verified/` without a matching audit-log entry are not actually verified.
