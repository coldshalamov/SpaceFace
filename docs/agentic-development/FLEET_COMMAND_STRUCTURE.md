<!-- LIFETIME: STABLE -->
# Fleet command structure

Grok (this session) is the manager. Lane captains are Grok subagents. They drive terminal
agents. Nobody round-robins by hand. Isolate by **file**, never by worktree.

## Who spends what

| Role | Who | Spend |
|---|---|---|
| **Manager** | Grok 4.6 in this session | Partition files, spawn captains, integrate, stop collisions |
| **Lane captain** | Grok subagent | One lane. Launches a CLI, looks at the result, keeps or sends it back |
| **Workhorse** | Devin CLI `swe-2-max` (unlimited) and Claude (`claude-opus-5` code, `claude-fable-5.1` taste) | Most mutation |
| **Secondary** | OpenCode Go / Command Code `deepseek-v4.1-flash` | Extra implementers when files don't overlap |
| **Occasional / eyes** | Clinepass `kimi-k3`; Z.ai `glm-5.3-flash` (vision, refreshes ~5h) | Scoped 3D, visual, frontend look |

Do not use Cursor Agent or Codex until quota returns. Do not invent a second queue. Live work is
`node scripts/program-dispatch.mjs --ready` plus player-visible brokenness that has no packet.

## Routing

| Task | First | Then |
|---|---|---|
| Hitch, sim, physics, a named PQ leaf | `devin -p --model swe-2-max` | `opencode run --model opencode-go/deepseek-v4.1-flash` |
| Frontend screens, HUD, CSS | `claude --print --model claude-opus-5` | `zai-coding-plan/glm-5.3-flash` |
| Taste / "does this look finished" | `claude --print --model claude-fable-5.1` (read, then a different model mutates) | Clinepass `kimi-k3` |
| 3D / chase-camera objects | Devin `swe-2-max` | GLM 5.3 flash to *look*; Kimi K3 if you need a second pair of eyes |
| Census / research / "what's unfinished" | GLM 5.3 flash or a Grok captain, **no edits** | DeepSeek |
| INFERENCE (no packet, real player debt) | Fable 5.1 names one production unit | Devin implements that unit |

Invocations that work on this machine (2026-09-11):

```text
devin -p --model swe-2-max --permission-mode accept-edits --respect-workspace-trust false --prompt-file <packet>
claude --print --model claude-opus-5 --effort xhigh --permission-mode acceptEdits --output-format text
opencode run --dir <repo> --model opencode-go/deepseek-v4.1-flash --format json -- <packet>
opencode run --dir <repo> --model command-code/deepseek/deepseek-v4.1-flash --format json -- <packet>
opencode run --dir <repo> --model cline-pass/cline-pass/kimi-k3 --format json -- <packet>
opencode run --dir <repo> --model zai-coding-plan/glm-5.3-flash --format json -- <packet>
```

## How a lane runs

1. Captain takes a **file partition** and a player-facing job. Not a review ritual.
2. Worker plays or looks at the thing, then changes it. First green draft is not the finish.
3. Captain looks at the diff and the game, not a grade file. Fix what's real. Stop.
4. Pathspec-commit only the owned files. Preserve foreign hunks. Never `reset`/`clean` the tree.
5. A lane that dies on quota is retried later on another provider. The packet stays on disk.

## Parallelism

Run many lanes. Collision is a **file** problem, not a "too many agents" problem. Two writers never
hold the same path. Research and INFERENCE do not need a write lease — run them while implementers
are busy. `check:playable` waits until writers have stopped saving.

## What "using inference right" means

- If the game hitches, looks cheap, or feels unfinished, that is the job — even when `--ready` is a
  crash-reporter leaf.
- INFERENCE is one bounded production change for a player problem with no admitted packet. It is not
  a research novel.
- Reports exist to feed the next implementer, then they die. Do not archive stills or review JSON.
