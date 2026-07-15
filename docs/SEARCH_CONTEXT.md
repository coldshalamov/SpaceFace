# Search and context routing

The repository contains large evidence, asset, and tool-state trees. Ordinary investigations should
search the owning source area, not the entire workspace.

## Start narrow

1. Use `docs/MODULE_MAP.md` to find the owner.
2. Use `docs/COMMON_BUGS.md` for a named recurring symptom.
3. Use generated `docs/SYSTEM_REGISTRY.md` or `docs/EVENT_ROUTING.md` for system/event tracing.
4. Search the owning source, test, and check directories with `rg`.
5. Expand into plans or history only when the task requires design intent or archaeology.

Examples:

```powershell
rg -n "authorizeAIEngagement" src/ai src/systems test scripts
rg -n "screenId.*galaxyMap" src/ui test scripts
rg -n "WHOLE_SHIP_FILE_BY_DEF_ID" src/render assets/ships/parts/parts_manifest.json scripts
```

## Exclude by default

Do not broadly read or search:

```text
.campaign/  .devshots/  build/  dist/  terminals/  agent-tools/
advisor-artifacts/  scratch/  .tmp*/  .grok-scratch/  .zcode/  .serena/
design/_ARCHIVE/  design/revamp/_history/  design/production/reviews/  docs/handoffs/
skills/  assets/**/evidence/  assets/**/source/reference/
```

These contain outputs, snapshots, prompts, transcripts, captures, or third-party/reference material.
They are useful only when a current task names them.

The tracked root `.ignore` applies these exclusions to ordinary `rg` searches. Use `--no-ignore` or
an exact path only when the task genuinely needs archived or forensic material.

For an unavoidable repository-wide hidden-file search, use explicit exclusions:

```powershell
rg -n --hidden `
  --glob '!.git/**' --glob '!.campaign/**' --glob '!.devshots/**' `
  --glob '!build/**' --glob '!dist/**' --glob '!terminals/**' `
  --glob '!agent-tools/**' --glob '!advisor-artifacts/**' `
  --glob '!scratch/**' --glob '!.tmp*/**' --glob '!.zcode/**' --glob '!.serena/**' `
  --glob '!design/_ARCHIVE/**' --glob '!design/revamp/_history/**' `
  --glob '!design/production/reviews/**' --glob '!docs/handoffs/**' --glob '!skills/**' `
  "PATTERN" AGENTS.md ARCHITECTURE.md README.md package.json src scripts test design docs assets styles tools electron schemas
```

## Prior-work lookup

- Inspect the working tree first: `git status --short`, `git diff -- <owner-file>`.
- Inspect committed history with `git log -- <path>` or `git log -L`.
- Use a named handoff or transcript only after current code and checks fail to explain the state.
- Never treat an old prompt, review, submission, screenshot caption, or copied `AGENTS.md` as current
  authority.
