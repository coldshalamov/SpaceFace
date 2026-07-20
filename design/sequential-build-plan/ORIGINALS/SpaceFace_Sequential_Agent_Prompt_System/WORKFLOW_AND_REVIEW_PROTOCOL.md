# Workflow and Review Protocol

## Controller rule

Only one implementation prompt is active at a time. The controller—not the implementation agent—chooses the next prompt. The default order is numeric, but SF-00 may classify a prompt as already satisfied, blocked, or in need of rescope. Preserve stable prompt IDs even when the order changes.

The controller should paste the full active Markdown prompt into a fresh agent thread and include or mount this complete folder plus the SpaceFace repository. Do not paste several implementation prompts into one thread; that invites scope absorption and ambiguous receipts.

## Before assigning a prompt

Confirm:

1. Dependency prompts are in `review/`.
2. Dependency receipts exist and state the actual gate reached.
3. The repository branch/worktree is known.
4. Shared input, physics, save, registry, renderer, HUD/styles, asset manifest, and browser/Electron profile leases are not silently shared.
5. The selected agent matches the prompt’s vision/frontend classification.

A previous receipt is evidence, not immunity. The new agent must verify that intervening changes have not invalidated it.

## Implementation-agent contract

The implementation agent:

- audits current repository truth;
- proves or characterizes the gap before editing;
- implements the bounded vertical slice through current authorities;
- verifies it in proportion to risk;
- writes one YAML receipt;
- fills the prompt completion record;
- moves only the current prompt from `plans/` to `review/`;
- does not start the next prompt;
- does not mark global roadmap status complete.

The agent may report `ALREADY_SATISFIED`. This is a successful outcome when current evidence genuinely meets the prompt. The agent may report `BLOCKED_BY_DEPENDENCY` or `BLOCKED` only with an exact owner/path/tool/evidence blocker and the narrowest unblocking action.

## Suggested worktree policy

The safest pattern is one isolated worktree/branch per implementation prompt, with the lead retaining the shared integration worktree and Git index. A branch name is not sufficient; verify the absolute worktree path and dirty state.

The prompt pack itself may be controller-tracked. The current implementation agent is explicitly authorized to modify only:

- its active prompt file;
- `receipts/SF-XX.yaml`;
- implementation paths granted by the live repository’s authority/lease rules.

If the repository is intentionally using a shared dirty tree, do not let an agent reset, stash, restore, clean, or stage unrelated changes. Return logical diffs and shared-change requests to the lead.

## Receipt gate

A receipt must name:

- packet ID and prompt filename;
- base and result commit/worktree;
- dependencies observed;
- paths changed;
- shared-change requests;
- exact commands and outcomes;
- public route and artifacts;
- visual-review state;
- performance state;
- known failures;
- unproven claims;
- follow-ons.

Use the schema at `machine/receipt.schema.json`. YAML is preferred for human readability. The absence of a failure from the final green rerun is not permission to omit it; retain failed commands and explain what changed.

## Review stage

A reviewer receives:

- the moved prompt in `review/`;
- the task receipt;
- the implementation branch/worktree/diff;
- all evidence artifacts;
- dependency receipts;
- the live repository.

Use `review/REVIEWER_PROMPT.md`. The reviewer does not merely rerun the author’s happy path. The reviewer challenges:

- whether the live owner/default was changed;
- whether the primary route is ordinary and uninjected;
- whether a placeholder or UI proxy substituted for physical behavior;
- whether tests would catch a plausible wrong implementation;
- whether save/Continue and browser/Electron behavior agree;
- whether visual claims survive the real game camera;
- whether performance passed without reducing the product;
- whether unknown reds, foreign diffs, hidden flags, or stale evidence remain.

Review outcomes:

- `ACCEPT`: evidence supports the task’s declared terminal state.
- `ACCEPT_WITH_FOLLOW_ON`: current slice is valid; bounded residual work is recorded without weakening acceptance.
- `RETURN_FOR_REPAIR`: a defect within the prompt’s scope must be fixed before integration.
- `BLOCKED_BY_INTEGRATION`: implementation is valid in isolation but cannot be integrated until a named shared change/lease resolves.
- `REJECT_PLACEHOLDER`: the implementation technically satisfies wording but fails the player-observable or anti-placeholder contract.

A reviewer may edit the moved prompt’s reviewer section and add a review receipt, but does not silently rewrite the implementation prompt after the fact.

## Integration stage

The lead/integrator:

1. verifies branch identity and intended diff;
2. resolves shared change requests and semantic mutexes;
3. reruns required current checks on the combined tree;
4. confirms public route/evidence still binds to the integrated revision;
5. updates authoritative program ledgers if warranted;
6. commits/promotes according to repository policy;
7. archives the task receipt and review outcome;
8. selects the next prompt.

A focused green donor branch is not automatically integrated. The combined tree is a new evidence surface.

## Failure and resumption

If an agent stops mid-task:

- keep the prompt in `plans/`;
- set frontmatter status to `blocked` or `in-progress`;
- write a partial receipt with exact state, dirty paths, commands, artifacts, and safe resumption point;
- do not fabricate completion checkmarks;
- do not let the next agent infer ownership from an abandoned branch name.

If the live repository makes a task obsolete:

- prove the present behavior;
- write `ALREADY_SATISFIED`;
- move the prompt to review;
- preserve its stable ID and explain which dated assumption was obsolete.

## Token discipline

Prompts intentionally ask agents to work in coherent slices and verify in layers. They do not require the agent to narrate every file read or every micro-step. The agent should use tools aggressively, report meaningful interim findings, and spend the bulk of tokens on implementation, proof, and exact receipts—not ceremonially rephrasing the prompt.
