# Development workflow: short sprints and working software

Adopted: 14 October 2026

This is the development policy for people and agents in this repository. It complements
[AGENTS.md](../AGENTS.md), the [architecture](architecture.md) and the [roadmap](roadmap.md).
It does not change the product's scope or claim that CI or branch protection is configured.

## 1. Sprint size and planning

A sprint is a short development cycle with one usable outcome, not an entire roadmap phase.
Prefer an increment that can be implemented, checked and demonstrated in one focused agent
session; split it when scope or uncertainty makes that unrealistic. A session ending is not
evidence that a sprint is complete. Preserve a handoff and resume unfinished work explicitly.

Before coding, create `docs/sprints/<number>-<short-name>.md` from [template.md](sprints/template.md).
Record the user outcome, scope and exclusions, dependencies, acceptance criteria, affected
modules and current baseline commit. Define what the owner will be able to do with the result.
Use existing task authorization to choose routine scope; request clarification only when a
material product or compatibility decision cannot be resolved from it.

A user-facing outcome includes its help documentation and contextual help mappings
([help system](modules/help.md)); missing required documentation means the outcome is incomplete.

Prefer vertical slices through UI, API/domain rules and persistence where applicable. For
example, requirement creation is usable when the owner can create, save, reload and edit a
requirement; a button without persistence is not the completed outcome. Infrastructure work
may be a sprint when it has a concrete executable acceptance scenario that enables the next slice.

Keep a small backlog of next outcomes. Adjust priorities using owner feedback and verification
findings. Do not implement the whole long-term suite or speculative architecture in one sprint.

## 2. Branches, commits and integration

- Keep `main` buildable and runnable. Work on a task branch or isolated worktree, preserving
  unrelated user edits. Recheck the target branch before integration to account for other work.
- Make small, coherent commits. A working commit must contain the code, fixtures, migrations and
  documentation needed for its outcome; do not leave required files untracked.
- Intermediate work-in-progress commits may stay on a task branch, clearly labelled as unfinished.
  They are not usable sprint checkpoints and must not be integrated into `main` while broken.
- Integrate frequently once the required checks pass. Do not wait for an entire module to be built.
- Incomplete features can be integrated behind disabled feature flags only when the default
  experience remains functional. Do not expose placeholders as completed features.
- Shared contracts follow the versioning, migration and consumer checks in [AGENTS.md](../AGENTS.md#contract-changes).
- Preserve existing workflows and stored data. Repair sprint-introduced regressions before
  expanding scope. Data migrations must follow existing non-destructive migration rules.
- Use normal review and repository access controls. Never rewrite shared history or force-push
  to bypass review. Push commits only through authorized repository access.

## 3. Verification before integration

For code, configuration or dependency changes:

1. Run `npm run check` (all workspace type checks and tests).
2. Run `npm run build` (production builds of workspace and GLB viewer).
3. Run `npm run build:harnesses` when tool code, SDK, design system or harness/build configuration
   changes. Shared contracts also require exercising every affected tool's harness.
4. Add or update meaningful tests for changed behaviour, failures and regressions where needed.
5. Exercise user-facing changes in the actual workspace and relevant standalone harness. Check
   persistence/reload and cross-tool effects where the acceptance scenario involves them.

Automated tests do not replace observing the user workflow. Record actual results, including
any blocked check and its reason. Never weaken a test to hide a defect or report a check as passed
when it was not run. A blocked required check leaves the candidate unverified for integration.

For documentation-only changes, inspect the diff, validate new/changed local links and documented
commands against repository scripts, and run `git diff --check`. Application builds/tests are not
required unless the documentation change reveals a relevant implementation concern. Instruction
changes must also be checked against nested AGENTS.md files for contradictions.

The policy specifies checks but does not enforce them automatically. CI and branch protection
can enforce the automated checks later; manual application review remains separately recorded.

## 4. Sprint checkpoint and owner review

At technical completion, commit a runnable candidate and provide:

- Outcome, completed acceptance criteria and exact checkpoint commit.
- Installation/startup instructions, URL and any required environment setup; never include secrets.
- A short sequence of user actions with expected results for owner review.
- Automated and manual checks performed, results and known limitations.
- Data/migration implications and a safe recovery approach where applicable.
- The next recommended increment and unresolved feedback.

Use an exact commit or a sprint tag as the reproducible checkpoint. Record the checkpoint in the
sprint handoff (a later documentation commit can point at the tested candidate; do not attempt to
embed a commit's own hash inside itself). Tags/checkpoints identify reviewed source, not a claim
of product release or certification.

Distinguish `in progress`, `blocked`, `ready for owner review`, `changes requested` and `accepted`.
Technical completion can be ready for review while owner acceptance is pending. Never invent
feedback or acceptance. Continue independent authorized work without assuming pending feedback
approves a dependent design decision. If review requires changes, issue another checked checkpoint.

For the current monorepo, one commit pins all packages. If modules later move to separate
repositories, record a compatibility manifest with their exact commits and required versions.

## 5. Agent coordination

The existing rule against launching extra agents unless asked still applies.

When parallel work is authorized, the coordinator owns the sprint goal, integration plan, shared
interface decisions and whole-application acceptance. Each implementation agent receives a bounded
task, file/worktree ownership, dependencies, acceptance criteria and required checks.

Avoid simultaneous edits to shared files. Assign one owner to integration changes and merge
compatible contributions sequentially. Resolve interface mismatches explicitly; do not silently
compensate in another module. Passing one module's tests does not prove the integrated application
works. Finish or hand off each task with changed files, checks, blockers and remaining work.

## 6. Current startup commands

Requires Node >=20.19 (see root `package.json`). From a clean checkout of the recorded commit:

```bash
npm ci
npm run dev
```

`npm run dev` starts the workspace and its backend (Requirements API on port 8787 with an embedded
PostgreSQL; the first start initialises and seeds the database). Open http://localhost:5173/workspace/.
On Windows PowerShell, use `npm.cmd` if execution policy
blocks `npm`. Standalone tools use `npm run dev:requirements`, `npm run dev:sysml` and
`npm run dev:cad` on ports 5181, 5182 and 5183 respectively. The GLB viewer uses
`npm run dev:viewer` on port 5174. See [README.md](../README.md#quick-start) for production preview.
