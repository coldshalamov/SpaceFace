<!-- LIFETIME: STABLE -->
# Worldbuilding reconciliation status — recovery-branch drafts

**Status:** UNRECONCILED DRAFTS. Do not treat as canon.
**Imported:** 2026-07-27 from `codex/recovery-worldbuilding-20260723` (drift reconcile, codex APPROVE-PARTIAL).
**Authority:** the pre-existing committed canon under `docs/worldbuilding/` outranks these files
until each one is individually reconciled. Where any of these files conflicts with committed canon,
**committed canon wins**.

## Why this banner exists

The 23 files listed below were authored on a stranded recovery branch and were never reconciled
against the canon that was integrated to master in parallel. Several of them declare binding
content in their own voice (e.g. `story/THE-STORYLINE.md` opens with "Canon rulings R1–R15 apply.
Protected lines are transcribed exactly. Numbers are law."). That self-declaration is **not
authoritative** here: it describes the branch author's intent, not master's accepted canon. These
are integrated as *reference drafts* so the work is not lost, not as law.

## The 23 unreconciled draft files

- `CREATIVE-DIRECTION.md`, `STORY-PIPELINE.md`
- `production/ART-PROMPTS.md`, `production/CUTSCENE-SCRIPTS.md`, `production/MEDIA-PIPELINE.md`
- `sheets/characters/{dree,ivo,lien,pell,spence,sump,wex}.md`
- `sheets/factions/free-frontier.md`
- `sheets/ships/{cpv-2214,variance-adjustment}.md`
- `sheets/species/vethari.md`
- `sheets/stations/{clearing-station,gate-3,helios-bay-7,outpost-9}.md`
- `story/{CONTEMPORARY-HISTORY,SIDE-STORIES,THE-STORYLINE}.md`

## Reconciliation task

For each file: diff against the nearest committed-canon counterpart (if any), resolve conflicts in
favor of committed canon unless there is an explicit product decision, then remove the file from the
"unreconciled" list above. When the list is empty, delete this banner. The reconciliation task is
tracked in the program backlog under M5-STORY (`design/program/02_REMAINING_WORK.md`), which the
repo already marks PARTIAL — these drafts are input to that work, not completion of it.
