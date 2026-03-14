# Contributing to ClawWork

Thanks for contributing.

This project is still early. Keep changes focused, explain the problem clearly, and prefer small pull requests over broad refactors.

## Before you start

1. Open or find an issue for the problem when the change is non-trivial.
2. Make sure the work belongs in this repository.
3. Keep user-facing behavior, testing, and release impact explicit in the PR.

## Development setup

```bash
pnpm install
pnpm dev
```

Useful verification commands:

```bash
pnpm lint
pnpm test
pnpm build
```

## Pull request expectations

Use one or more title prefixes:

- `[Feat]` new user-visible capability
- `[Fix]` bug fix
- `[UI]` renderer or UX change
- `[Docs]` documentation-only change
- `[Refactor]` internal cleanup without intended behavior change
- `[Build]` CI, packaging, dependencies, or tooling
- `[Chore]` maintenance work

Every PR should include:

- a clear summary of what changed and why
- linked issues when applicable
- the verification you actually ran
- screenshots or recordings for visible UI changes
- a release note for user-facing changes

## Release notes

If the change affects users, fill in the `release-note` block in the PR template with a short sentence written from the user's point of view.

Examples:

- `Added a task detail view for inspecting tool calls and artifacts.`
- `Fixed a crash when switching workspaces before the initial sync completed.`

If the change is not user-facing, set the block to `NONE`.

## Scope

Good first contributions:

- focused bug fixes
- docs improvements
- UI polish with screenshots
- tests for existing behavior

Avoid mixing unrelated changes in one PR.
