# AGENTS

This project is a library for generating TypeScript types and path functions from OpenAPI specs with a focus on Zod schemas.
The goal is to create a library that allows users to create their own typesafe clients, using whatever underlying library they wish e.g. fetch, axios, ky.

## Commands

- **Build:** `bun zenko build` or `turbo build`.
- **Lint:** `bun lint` (fixes); use `bun lint:check` when read-only.
- **Format:** `bun format` (fixes); verify via `bun format:check`.
- **Check:** `bun check` will run lint, format, and type check (prefer this over the individual commands).
- **Tests:** `bun zenko test` or `turbo test`.
- **Single test:** `bun zenko test src/__tests__/cli.test.ts`.
- **Snapshots:** `bun zenko test -u` refreshes stored results.
- **Coverage:** `bun zenko coverage`.
- **Type check:** `bun zenko check-types` or `turbo check-types`.

## Code Style

- **Imports:** built-in → third-party → local; always double quotes.
- **Formatting:** 2 spaces, no semicolons, trailing commas (ES5), 80 char width.
- **Types:** export inferred Zod types; keep strict TypeScript (`noUncheckedIndexedAccess`, `noUnusedLocals`).
- **Naming:** camelCase vars/functions, PascalCase classes/types.
- **Errors:** prefer Result-style returns or descriptive throws.

## Repo Notes

- **Runtime:** Bun 1.3+, Node >=18; run scripts from workspace root.
- **Testing:** specs live in `packages/zenko/src/__tests__`; use snapshots for output verification.
- **Artifacts:** `packages/zenko/dist` is generated; never edit manually.
- **CI:** GitHub Actions in `.github/workflows` must stay green.

## Final Checks

To verify any changes, after running tests, you can run the following commands:

`turbo codegen` will generate the code for the examples in `packages/examples`.

If you need more: `turbo build` will build the code and `bun packages/zenko/dist/cli.cjs --config packages/zenko/private/zenko.config.json` will generate the code.

This will generate some examples in `packages/zenko/private` that you can see any type errors directly within. there are no tests for this, it's just useful for type errors.

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>brainstorming</name>
<description>Use when creating or developing, before writing code or implementation plans - refines rough ideas into fully-formed designs through collaborative questioning, alternative exploration, and incremental validation. Don't use during clear 'mechanical' processes</description>
<location>project</location>
</skill>

<skill>
<name>condition-based-waiting</name>
<description>Use when tests have race conditions, timing dependencies, or inconsistent pass/fail behavior - replaces arbitrary timeouts with condition polling to wait for actual state changes, eliminating flaky tests from timing guesses</description>
<location>project</location>
</skill>

<skill>
<name>defense-in-depth</name>
<description>Use when invalid data causes failures deep in execution, requiring validation at multiple system layers - validates at every layer data passes through to make bugs structurally impossible</description>
<location>project</location>
</skill>

<skill>
<name>dispatching-parallel-agents</name>
<description>Use when facing 3+ independent failures that can be investigated without shared state or dependencies - dispatches multiple Claude agents to investigate and fix independent problems concurrently</description>
<location>project</location>
</skill>

<skill>
<name>executing-plans</name>
<description>Use when partner provides a complete implementation plan to execute in controlled batches with review checkpoints - loads plan, reviews critically, executes tasks in batches, reports for review between batches</description>
<location>project</location>
</skill>

<skill>
<name>finishing-a-development-branch</name>
<description>Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup</description>
<location>project</location>
</skill>

<skill>
<name>receiving-code-review</name>
<description>Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation</description>
<location>project</location>
</skill>

<skill>
<name>requesting-code-review</name>
<description>Use when completing tasks, implementing major features, or before merging to verify work meets requirements - dispatches superpowers:code-reviewer subagent to review implementation against plan or requirements before proceeding</description>
<location>project</location>
</skill>

<skill>
<name>root-cause-tracing</name>
<description>Use when errors occur deep in execution and you need to trace back to find the original trigger - systematically traces bugs backward through call stack, adding instrumentation when needed, to identify source of invalid data or incorrect behavior</description>
<location>project</location>
</skill>

<skill>
<name>sharing-skills</name>
<description>Use when you've developed a broadly useful skill and want to contribute it upstream via pull request - guides process of branching, committing, pushing, and creating PR to contribute skills back to upstream repository</description>
<location>project</location>
</skill>

<skill>
<name>subagent-driven-development</name>
<description>Use when executing implementation plans with independent tasks in the current session - dispatches fresh subagent for each task with code review between tasks, enabling fast iteration with quality gates</description>
<location>project</location>
</skill>

<skill>
<name>systematic-debugging</name>
<description>Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes - four-phase framework (root cause investigation, pattern analysis, hypothesis testing, implementation) that ensures understanding before attempting solutions</description>
<location>project</location>
</skill>

<skill>
<name>test-driven-development</name>
<description>Use when implementing any feature or bugfix, before writing implementation code - write the test first, watch it fail, write minimal code to pass; ensures tests actually verify behavior by requiring failure first</description>
<location>project</location>
</skill>

<skill>
<name>testing-anti-patterns</name>
<description>Use when writing or changing tests, adding mocks, or tempted to add test-only methods to production code - prevents testing mock behavior, production pollution with test-only methods, and mocking without understanding dependencies</description>
<location>project</location>
</skill>

<skill>
<name>testing-skills-with-subagents</name>
<description>Use when creating or editing skills, before deployment, to verify they work under pressure and resist rationalization - applies RED-GREEN-REFACTOR cycle to process documentation by running baseline without skill, writing to address failures, iterating to close loopholes</description>
<location>project</location>
</skill>

<skill>
<name>using-git-worktrees</name>
<description>Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification</description>
<location>project</location>
</skill>

<skill>
<name>using-superpowers</name>
<description>Use when starting any conversation - establishes mandatory workflows for finding and using skills, including using Skill tool before announcing usage, following brainstorming before coding, and creating TodoWrite todos for checklists</description>
<location>project</location>
</skill>

<skill>
<name>verification-before-completion</name>
<description>Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always</description>
<location>project</location>
</skill>

<skill>
<name>writing-plans</name>
<description>Use when design is complete and you need detailed implementation tasks for engineers with zero codebase context - creates comprehensive implementation plans with exact file paths, complete code examples, and verification steps assuming engineer has minimal domain knowledge</description>
<location>project</location>
</skill>

<skill>
<name>writing-skills</name>
<description>Use when creating new skills, editing existing skills, or verifying skills work before deployment - applies TDD to process documentation by testing with subagents before writing, iterating until bulletproof against rationalization</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
