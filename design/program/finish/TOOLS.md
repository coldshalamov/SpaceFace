<!-- LIFETIME: STABLE -->
# Optional terminal CLI references (last smoke-tested 2026-10-28)

These are historical examples for tools available on the owner's machine at that time, not required
providers, assignments, or review steps. Availability and flags can change. The active workflow and
default delegation for this campaign are in [`README.md`](./README.md) §§5.1–5.5; use completed
source coverage in [`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md) before reading
code again. Invoke these examples from a shell at the repo root and adapt them to the current tool.

When a terminal command needs a hidden bounded process on Windows, the repo helper is an available
option: `node scripts/agent-run.mjs --log <log> --timeout <seconds> [--stdin <file>] -- <command> <args>`.
Use the smallest scoped invocation that fits the task.

## Optional packet layout (git-ignored)

```
.devshots/finish/<lane>/<packet-id>/PACKET.md    # your brief: problem, owned paths, done-when, traps, forbidden actions
.devshots/finish/<lane>/<packet-id>/run.log      # the terminal agent's output
.devshots/finish/<lane>/<packet-id>/RECEIPT.md   # the terminal agent writes what it changed and how it proved it
```

For a task that benefits from a packet, this prompt pattern keeps scope and ownership visible:
`Read .devshots/finish/<lane>/<packet-id>/PACKET.md and follow its scope. Edit only the paths it lists. Do not commit, stash, reset, checkout, clean or run git add. Write RECEIPT.md next to PACKET.md when done.`

Put only the constraints relevant to the task in its packet, including exact owned paths and shared
checkout protections. Follow the repo's current verification guidance; this reference does not add a
test or publication gate.

## Codex CLI example

```bash
node scripts/agent-run.mjs --log .devshots/finish/<lane>/<batch>/run.log --timeout 3600 --stdin .devshots/finish/<lane>/<batch>/PACKET.md -- /c/Users/93rob/AppData/Roaming/npm/codex.cmd exec -m gpt-6.1-sol -c model_reasoning_effort="xhigh" -s danger-full-access -C "$PWD" -
```

- The explicit `.cmd` path avoided an older PATH binary on the test machine; recheck current CLI
  availability before relying on it.
- If Codex refuses to load its config, check `~/.codex/config.toml` for an uncommented
  `service_tier = "default"` line (the desktop app keeps re-adding it) and comment it out again.
  The `shell_zsh_fork` / `child_agents_md` / `view_image` warnings are noise.
- Give any delegated task its exact owned paths, concrete outcome and done condition. Do not use this
  example to schedule a fixed review or provider rotation.

## Grok CLI example (optional)

```bash
node scripts/agent-run.mjs --log .devshots/finish/<lane>/<id>/run.log --timeout 3600 -- cursor-agent.cmd -p --force --trust --output-format text --model grok-4.7-xhigh --workspace "$PWD" "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says."
```

- Historical note from the last smoke test: simultaneous `cursor-agent` starts failed with EPERM on
  `cli-config.json`; recheck current behavior if using this CLI.
- Backup route if cursor-agent is down: `grok.exe --cwd "$PWD" --output-format plain --no-plan --max-turns 400 --permission-mode bypassPermissions --reasoning-effort xhigh -p "<prompt>"` (a bare positional prompt opens the interactive UI and hangs; `-p` is headless). Not re-smoked 2026-10-28.

## Gemini CLI example (optional)

```bash
node scripts/agent-run.mjs --log .devshots/finish/<lane>/<id>/run.log --timeout 3600 -- agy.exe --print "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says." --model gemini-3.8-flash-high --dangerously-skip-permissions --output-format text
```

## OpenCode CLI example (optional)

The last smoke test found two OpenCode installs on this machine, and only one saw OpenCode Go:

| Install | Version | Sees `opencode-go/*` |
|---|---|---|
| `C:\Users\93rob\AppData\Roaming\npm\opencode.cmd` | 2.2.0 | **yes** (30 Go models) — use this one |
| `C:\Users\93rob\.opencode\bin\opencode.exe` (first on the Bash PATH) | 1.19.4 | no |

At that time, bare `opencode` / `opencode.exe` resolved to the older install. The 2.x CLI used the
variant after `#` in the model id, had no `--dir`, and used `--auto` for tool permissions. Verified
2026-10-28 (answered OK); recheck before reuse:

```bash
node scripts/agent-run.mjs --log .devshots/finish/<lane>/<id>/run.log --timeout 3600 -- /c/Users/93rob/AppData/Roaming/npm/opencode.cmd run -m 'opencode-go/deepseek-v4.1-flash#max' --auto "Read .devshots/finish/<lane>/<id>/PACKET.md and do exactly what it says."
```

Check the current model list with `/c/Users/93rob/AppData/Roaming/npm/opencode.cmd models | grep opencode-go`.
The prior smoke test also found `opencode-go/deepseek-v4-pro#max`; provider access and model routes
may have changed since then.

## Claude CLI example (optional)

```bash
node scripts/agent-run.mjs --log .devshots/finish/lane3/<batch>/run.log --timeout 3600 -- claude -p --model claude-sonnet-5-5 --effort xhigh --dangerously-skip-permissions "Read .devshots/finish/lane3/<batch>/PACKET.md and do exactly what it says."
```

Scope any task to its owned paths and a concrete result. For a changed screen, follow the direct
verification guidance in README §5.4.

## Usage note

Choose tools and delegation based on the task and current availability. Keep parallel work on
disjoint paths, protect existing dirty work, and integrate delegated changes against the stated
outcome. A failed command is evidence about that invocation, not a reason to launch a provider
rotation.
