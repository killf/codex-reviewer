# Local Code Review Plugin Design

## Goal

Build a Codex Desktop local plugin for reviewing changes in a selected local Git repository. The first implementation covers Git comparison scopes, a full file tree, and a side-by-side diff viewer.

## User workflow

1. Open Code Review from Codex Desktop's sidebar and select a local repository.
2. Choose working-tree changes or compare the current branch against a selected local or remote-tracking branch.
3. Browse the full repository tree. Changed files are highlighted; opening a file shows old and new contents side by side with line-level and word-level diff highlights.

## Functional requirements

### Comparison and diff

- Show the comparison scope and resolved revision identifiers in the review view. Branch targets can be selected from local and remote-tracking branches; do not fetch or modify refs automatically.
- For branch comparison, calculate changes from the merge base of the current branch and selected base branch.
- Keep an opened review snapshot stable. If the worktree or refs change, indicate that a newer state is available; refreshing creates a new review snapshot.
- Show the full repository tree and highlight changed paths. Support opening one file at a time.
- Render old and new text side by side, with line- and word-level change highlights.
- Identify added, deleted, and renamed files. Clearly report binary or otherwise unsupported files rather than rendering an empty diff.

## Architecture

- A local stdio MCP server reads repository state and Git diffs and returns structured data to the app.
- An MCP App provides both a global sidebar entrypoint and a thread-side-panel entrypoint for selecting a repository, comparison scope, and reviewing diffs.
- The app asks the user to select a local repository unless the host supplies a verified workspace path.
- The review view does not mutate repository files. Codex applies any code changes through the normal conversation workflow.

## Boundaries

- Initial scope is local repositories and local Git references. Hosted pull-request or merge-request comments, approvals, and CI status are not included.
- The plugin does not commit, push, merge, or deploy.

## Verification plan

- Validate the plugin manifest, MCP server startup, and sidebar app entrypoint in Codex Desktop.
- Use an isolated fixture repository to verify working-tree and merge-base branch diffs, file tree status, and side-by-side line/word highlighting.
- Verify changed Git state creates an explicit newer snapshot without altering the currently opened review.
- Cover added, deleted, renamed, binary, and unsupported files with focused tests.

## Platform constraints to validate

- Confirm how a sidebar-launched local MCP App receives or requests the selected repository path. If the host does not provide the active workspace, repository selection must be explicit.
- Confirm the supported app display mode and available width. Provide an expanded review view if the sidebar cannot comfortably show the requested side-by-side diff.
