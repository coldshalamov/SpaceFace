<!-- LIFETIME: STABLE -->
# Terminal agents — verified commands (smoke-tested 2026-10-28 on the owner's machine)

Every command below answered a one-word prompt on 2026-10-28 unless marked otherwise. Run them from
the repo root (`C:\Users\93rob\Documents\GitHub\SpaceFace`) with the Bash tool and
`run_in_background: true`, so the exit notifies you. Put a `timeout` on every run.

## The packet layout (git-ignored)

```
.devshots/finish/<lane>/<packet-id>/PACKET.md    # your brief: problem, owned paths, done-when, traps, forbidden actions
.devshots/finish/<lane>/<packet-id>/run.log      # the terminal agent's output
.devshots/finish/<lane>/<packet-id>/RECEIPT.md   # the terminal agent writes what it changed and how it proved it
```

Every terminal prompt is short and points at the file:
`Read .devshots/finish/<lane>/<packet-id>/PACKET.md and do exactly what it says. Edit only the paths it lists. Do not commit, stash, reset, checkout, clean or run git add. Write RECEIPT.md next to PACKET.md when done.`

Every PACKET.md ends with the same forbidden-actions block: no commits, no `git add`, no stash,
reset, checkout, clean or rebase, no edits outside the listed paths, no edits under
`design/program/vm-drop/`, no long test suites (`check:all`, `check`), no re-recording
`test/*.expected.json`.

## Codex — GPT 6.1 Sol, extra-high reasoning (final review + ambition pass)

```bash
timeout 3600 /c/Users/93rob/AppData/Roaming/npm/codex.cmd exec -m gpt-6.1-sol -c model_reasoning_effort="xhigh" -s danger-full-access -C "$PWD" - < .devshots/finish/<lane>/<batch>/PACKET.md > .devshots/finish/<lane>/<batch>/run.log 2>&1
```

- **Always** call `C:\Users\93rob\AppData\Roaming\npm\codex.cmd`. The `codex.exe` on PATH is an old
  desktop bundle that dies decoding the model list.
- **Always** pass `-m gpt-6.1-sol`: the config default is `gpt-6-luna`.
- If Codex refuses to load its config, check `~/.codex/config.toml` for an uncommented
  `service_tier = "default"` line (the desktop app keeps re-adding it) and comment it out again.
  The `shell_zsh_fork` / `child_agents_md` / `view_image` warnings are noise.
- Give Codex the batch's commit range (`git log --oneline <first>^..<last>`), the owned paths, the
  done-when numbers, and the instruction in `README.md` §5.3: find what is wrong, fix it, make it
  maximally ambitious, do not commit.

## Grok 4.7 extra-high via cursor-agent (grunt work, half of it)

```bash
timeout 3600 cursor-agent.cmd -p --force --trust --output-format text --model grok-4.7-xhigh --workspace "$PWD" "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says." > .devshots/finish/<lane>/<id>/run.log 2>&1
```

- Start two `cursor-agent` runs at least ~10 s apart: simultaneous starts fail with EPERM on
  `cli-config.json`.
- Backup route if cursor-agent is down: `grok.exe --cwd "$PWD" --output-format plain --no-plan --max-turns 400 --permission-mode bypassPermissions --reasoning-effort xhigh -p "<prompt>"` (a bare positional prompt opens the interactive UI and hangs; `-p` is headless). Not re-smoked 2026-10-28.

## Gemini 3.8 Flash High via agy (grunt work, the other half)

```bash
timeout 3600 agy.exe --print "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says." --model gemini-3.8-flash-high --dangerously-skip-permissions --output-format text > .devshots/finish/<lane>/<id>/run.log 2>&1
```

## DeepSeek V4.1 Flash Max via OpenCode (frontend and 3D work)

Owner's choice is the **OpenCode Go** provider. **There are two OpenCode installs on this machine,
and only one of them sees OpenCode Go:**

| Install | Version | Sees `opencode-go/*` |
|---|---|---|
| `C:\Users\93rob\AppData\Roaming\npm\opencode.cmd` | 2.2.0 | **yes** (30 Go models) — use this one |
| `C:\Users\93rob\.opencode\bin\opencode.exe` (first on the Bash PATH) | 1.19.4 | no |

Never call bare `opencode` / `opencode.exe` — it resolves to the old install. The 2.x CLI also
changed its flags: the variant goes after `#` in the model id, there is no `--dir` (run from the repo
root), and `--auto` approves tool permissions. Verified 2026-10-28 (answered OK):

```bash
timeout 3600 /c/Users/93rob/AppData/Roaming/npm/opencode.cmd run -m 'opencode-go/deepseek-v4.1-flash#max' --auto "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says." > .devshots/finish/<lane>/<id>/run.log 2>&1
```

Check the list with `/c/Users/93rob/AppData/Roaming/npm/opencode.cmd models | grep opencode-go`.
Backup if the Go route fails: `opencode-go/deepseek-v4-pro#max` on the same install, then a Claude
subagent. Dead routes measured 2026-10-28: `cline-pass/.../deepseek-v4.1-flash` (403, plan not
subscribed), `command-code/deepseek/deepseek-v4.1-flash` (no credits).

## Claude Sonnet 5.5 extra-high in the terminal (frontend batch review)

```bash
timeout 3600 claude -p --model claude-sonnet-5-5 --effort xhigh --dangerously-skip-permissions "Read .devshots/finish/lane3/<batch>/PACKET.md and do exactly what it says." > .devshots/finish/lane3/<batch>/run.log 2>&1
```

The packet tells it which screens changed, to shoot each with `node scripts/ui-bench.mjs --shot=<id>`,
open every PNG, judge against `design/frontend/ORRERY.md` + `ORRERY_RUBRIC.md`, `--walk` the controls,
fix what it sees inside the listed paths, and not commit.

## Usage discipline

- Claude subagents share the lane agent's usage limit: **at most two implementers at once**, reviews
  run one after another, every subagent prompt carries a tool-call cap (~40) and the owned paths.
  If a subagent dies on the usage limit, its edits stay on disk; resume it by agent id after the reset.
- Terminal agents (Codex, Grok, Gemini, OpenCode, terminal Claude) draw on separate limits — keep
  them busy in parallel on disjoint paths; that is how the lane gets volume without burning its own
  limit.
- A terminal agent that exits non-zero within a minute is a route failure, not a task failure: switch
  to its backup route and relaunch.
