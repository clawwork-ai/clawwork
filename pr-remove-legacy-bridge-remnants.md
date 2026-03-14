# PR Materials: Remove legacy bridge remnants

## Suggested Branch
`refactor/remove-legacy-bridge-remnants`

## Suggested Title
`refactor: remove legacy bridge remnants`

## Suggested Summary
This PR removes the last legacy bridge remnants from the repository now that the project is fully Gateway-only.

## Suggested PR Body
```md
## Summary
- remove the dead legacy bridge package directory
- delete the unused shared WebSocket protocol types that only existed for the old bridge path
- clean stale legacy-bridge wording from shared package comments and the desktop design doc
- add PR notes documenting the cleanup scope

## Why
The repository had already completed the Gateway-only refactor, but a few dead artifacts remained:
- an empty legacy bridge package directory
- unused shared protocol types for the old bridge path
- historical wording in comments and design docs

Cleaning these out reduces confusion and makes the current architecture match the repository state.

## Verification
- run the repository residue search for the retired bridge naming
- `pnpm -r build`

## Risk
- Low. This only removes dead legacy artifacts and updates documentation/comments.
```

## Reviewer Notes
- `packages/shared/src/protocol.ts` had no remaining runtime or type-level consumers in the repo.
- The removed package directory was no longer part of `pnpm-workspace.yaml` and only contained `.DS_Store`.
