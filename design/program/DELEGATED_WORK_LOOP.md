<!-- LIFETIME: STABLE -->
# Delegated work loop — cursor-agent worker, Fable advisor, you as controller

The mechanics every non-graphics goal in this repo shares. Graphics passes use
[`GRAPHICS_ITERATION_LOOP.md`](./GRAPHICS_ITERATION_LOOP.md) instead; this is for code, screens,
checks and acceptance runs.

You are the **controller**. You own commits, verdicts, integration and the report. Workers produce
candidates; only you decide what is true.

## The two helpers

**Worker — `cursor-agent`, headless, in this checkout.** No worktree: you are orchestrating, and
worktrees clutter the disk.

```
cursor-agent -p --force --output-format text --model gpt-5.3-codex-xhigh "<packet text>"
```

Use `claude-fable-5-thinking-xhigh` instead when the job is more judgment than mechanism.
`cursor-agent --list-models` if either name has drifted. Run it with `run_in_background: true` and
keep working while it does.

**Advisor — Fable 5, through your own Agent tool**, `model: "fable"`, `run_in_background: true`.
Not a worker: it never edits. Call it when you are about to commit to an approach, when you are
stuck, or when a result does not fit — and give it **the whole picture**: what you already
established, what you measured, what you tried, and the specific decision you want it to break.
Tell it plainly that you would rather be corrected than agreed with. A vague brief returns a vague
answer and wastes the call.

## Packet rules

Every packet a worker receives names:

1. The exact repository path, the base commit, and that the tree is otherwise clean.
2. **An exact allowed write set.** Nothing outside it, ever.
3. The authority documents it must read *first* — not a summary you wrote.
4. The checks that must pass, by command.
5. Explicit non-goals, and the stop conditions that make it report instead of proceed.
6. That it must not commit, push, or claim acceptance, and must leave work uncommitted.

Never hand a worker two overlapping write sets at once. One implementer plus a different reviewer
beats two implementers on the same files.

## The controller's job after a worker returns

**Claims are not evidence.** Re-run every check yourself and read the actual diff against the
allowed write set. Workers report honestly and are still wrong: on this repo one returned accurate
numbers for a drive aperture and a shape that defeated what the numbers were for, and another left
mount points behind after a form change and said so only in its closing notes.

Then commit in your own scoped commits, push, and record what is true, what came from the worker,
and what remains unproven.

## Rules this repo paid for

- **Green is not proof.** Several checks here pass by inspecting a convenient stand-in. Confirm
  *what* a check looked at, not just that it passed.
- **Negative-test every rule you write.** A check that has never been seen to fail is a check you
  have not written yet. Four of fourteen rules added in one session here passed their own mutation.
- **`check:assets:live` refuses to run on a dirty tree or an unpushed HEAD** and says so. If it gets
  past those guards it booted the game, and everything after that is a real observation. Read which
  assertion failed before dismissing it.
- **Scoping a commit to paths does not scope it to hunks.** In a shared checkout, verify
  `git diff --cached --stat` before every commit.
- **Before you report done: `npm run check:playable`.** It boots the real game and asks whether a
  person could play it. Roughly 400 other checks here cannot answer that.

## Reporting

Lead with **done** or **not done**, then what changed in terms a non-coder understands. No paths,
hashes or check names unless asked. If part is blocked, finish everything else in full and name the
blocker in one plain sentence.
