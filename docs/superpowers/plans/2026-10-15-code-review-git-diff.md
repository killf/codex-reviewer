# Code Review Git Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally installed Codex Desktop plugin that browses a selected Git repository and displays working-tree or selected-branch diffs in a file tree and side-by-side viewer.

**Architecture:** Package a portable Codex plugin with a local stdio MCP server and an MCP App exposed through global and thread entrypoints. The server owns repository discovery, safe Git reads, comparison snapshots, and structured diff data; the UI owns repository/scope selection, the complete file tree, and line/word highlighting.

**Tech Stack:** Node.js 22.12+, TypeScript, Codex plugin manifest and MCP configuration, `@modelcontextprotocol/server` 2.x, `@modelcontextprotocol/sdk` 1.x for MCP Apps, `@modelcontextprotocol/ext-apps` 1.x, `@openai/mcp-extensions`, React, Vite, and `diff`.

**Spec:** `docs/superpowers/specs/2026-10-15-local-code-review-plugin-design.md`

## Global Constraints

- Initial scope is local repositories and local Git references.
- Branch comparison calculates changes from the merge base of the current branch and selected base branch.
- Branch targets include local and remote-tracking branches; the plugin does not fetch or modify refs automatically.
- Keep an opened review snapshot stable. If the worktree or refs change, indicate that a newer state is available; refreshing creates a new review snapshot.
- Snapshot old/new contents for changed files so later worktree edits or ref movement do not silently alter an already opened review.
- The full tree lists files under the repository root, including ignored files, while excluding `.git` internals and not following symlink directories.
- The review view does not mutate repository files.
- Hosted pull-request or merge-request comments, approvals, and CI status are not included.
- Codex applies code changes through the normal conversation workflow.
- The first version does not implement annotations, AI handoff, or annotation history.

## Review Focus

- Malformed or non-repository paths must return a visible validation error without running Git outside the selected repository. Test invalid and nested paths in Task 2.
- Filenames containing spaces, Unicode, or leading dashes must remain distinct in Git output. Test these paths in Task 3.
- Renames and deleted files must retain correct old/new paths and file status. Test both in Task 3.
- Binary and oversized files must produce an explicit unsupported state without loading unbounded contents. Test in Task 3.
- Worktree/ref changes during a review must not silently change the displayed snapshot. Test refresh behavior in Task 4.

---

### Task 1: Plugin scaffold and sidebar app shell

**Files:**
- Create: `plugin.json`
- Create: `mcp.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/server/index.ts`
- Create: `src/app/index.html`
- Create: `src/app/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/styles.css`
- Create: `tests/plugin-manifest.test.ts`

**Interfaces:**
- Produces a Codex-installable local plugin with MCP App global and thread entrypoints, registered as `code-review.open`.
- The app calls `listRepositories()` and `getReview()` MCP tools defined in Tasks 2–3.

- [ ] **Step 1: Write manifest and startup tests** asserting valid plugin metadata, MCP server command, and app entrypoint.
- [ ] **Step 2: Run the tests and confirm they fail** because the plugin files do not yet exist.
- [ ] **Step 3: Add the smallest portable plugin manifest and stdio MCP server bootstrap; register `code-review.open` with global and thread entrypoints linked to the bundled Vite app resource.**
- [ ] **Step 4: Run the manifest tests and production build**; both must pass and emit the bundled app resource.

### Task 2: Repository selection and Git comparison snapshots

**Files:**
- Create: `src/server/git.ts`
- Create: `src/server/types.ts`
- Create: `src/server/repository.ts`
- Create: `src/server/snapshot.ts`
- Create: `tests/fixtures/git-repo.mjs`
- Create: `tests/repository.test.mjs`
- Create: `tests/snapshot.test.mjs`
- Modify: `src/server/index.ts`

**Interfaces:**
- `listRepositories(rootPath: string): Promise<RepositoryInfo>` validates that the selected path is a Git worktree and returns its root and available refs.
- `getReview(rootPath: string, scope: ReviewScope): Promise<ReviewSnapshot>` returns an immutable review snapshot.
- `isReviewStale(snapshotId: string): Promise<boolean>` reports whether HEAD, selected refs, Git worktree state, or repository tree changed since capture.
- `ReviewScope = { kind: "worktree" } | { kind: "branch", baseRef: string }`.
- `ReviewSnapshot` includes a stable `snapshotId`, scope, resolved base/head identifiers, full repository tree, changed-file metadata, captured old/new contents for changed files, a repository-state fingerprint, and creation time.

- [ ] **Step 1: Write fixture-backed failing tests** for valid/invalid repository paths, worktree scope (HEAD to combined staged/unstaged/untracked state), local and remote-tracking branch selection, merge-base-to-HEAD semantics, and stale-snapshot detection.
- [ ] **Step 2: Run the tests and confirm each fails** against the absent repository and snapshot services.
- [ ] **Step 3: Implement repository validation and read-only Git calls** using argument-array process execution and strict ref/path validation.
- [ ] **Step 4: Implement snapshot creation** for staged/unstaged/untracked changes and selected branch comparison; capture resolved revisions, tree entries, changed-file status, and repository-state fingerprint.
- [ ] **Step 5: Implement `isReviewStale(snapshotId)`** to compare current repository state with the captured fingerprint.
- [ ] **Step 6: Run repository and snapshot tests**; assert no fetch, checkout, or repository-file writes occur.

### Task 3: Changed-file tree and file diff data

**Files:**
- Create: `src/server/diff.ts`
- Create: `tests/diff.test.mjs`
- Modify: `src/server/index.ts`

**Interfaces:**
- `getFileDiff(snapshotId: string, fileId: string): Promise<FileDiff>` returns the old/new paths, status, and captured old/new text from the selected immutable snapshot, or a binary/unsupported reason.
- `FileDiff` preserves separate old and new file contents and stable file identity for tree selection.

- [ ] **Step 1: Write failing tests** for added, modified, deleted, renamed, binary, oversized, whitespace/Unicode, and leading-dash paths.
- [ ] **Step 2: Run the tests and confirm the expected failures** before implementation.
- [ ] **Step 3: Implement `getFileDiff` from captured snapshot contents**, preserving rename identity and status without rereading mutable worktree files.
- [ ] **Step 4: Bound file sizes and return explicit unsupported states** for binary and oversized content.
- [ ] **Step 5: Run diff tests** and verify every fixture path maps to one correct file-tree node.

### Task 4: Snapshot-aware review UI and side-by-side diff

**Files:**
- Create: `src/app/api.ts`
- Create: `src/app/RepositoryPicker.tsx`
- Create: `src/app/ScopePicker.tsx`
- Create: `src/app/FileTree.tsx`
- Create: `src/app/DiffViewer.tsx`
- Create: `src/app/diff-model.ts`
- Create: `tests/diff-model.test.mjs`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`

**Interfaces:**
- `buildDiffRows(diff: FileDiff): DiffRow[]` creates paired old/new line rows with line and word change ranges.
- `FileTree` displays the full repository tree, highlights changed paths, and selects one file at a time.
- `DiffViewer` displays paired old/new contents and supports line-level and word-level highlighting.

- [ ] **Step 1: Write failing diff-model tests** for insertions, deletions, replacements, and word-level spans.
- [ ] **Step 2: Run tests and confirm failure** before implementing row construction.
- [ ] **Step 3: Implement paired diff rows** from `FileDiff` without changing snapshot content.
- [ ] **Step 4: Wire repository and comparison selectors, complete tree, changed-file state, and side-by-side viewer** to MCP app tools.
- [ ] **Step 5: Add explicit refresh behavior** that creates a new snapshot and shows when repository state is newer while preserving the opened snapshot until refresh.
- [ ] **Step 6: Run diff-model and UI build checks** and inspect the rendered app in Codex Desktop.

### Task 5: Codex Desktop installation and end-to-end verification

**Files:**
- Create: `.agents/plugins/marketplace.json`
- Create: `tests/e2e/git-review.test.mjs`
- Modify: `README.md`

**Interfaces:**
- The repository-local marketplace exposes the plugin for installation in Codex Desktop.
- End-to-end coverage uses a disposable Git fixture and the public MCP app tools.

- [ ] **Step 1: Write failing end-to-end coverage** for selecting a repository, choosing worktree/branch scope, opening a changed file, and refreshing a snapshot.
- [ ] **Step 2: Run the end-to-end test and capture the initial failure** before marketplace wiring.
- [ ] **Step 3: Add the local marketplace entry and concise setup instructions** for adding and enabling the plugin in Codex Desktop.
- [ ] **Step 4: Install the local plugin in the current Codex environment** and verify the global sidebar and thread-side-panel entrypoints start and display the fixture repo tree and diff.
- [ ] **Step 5: Run the focused automated suite and end-to-end flow**; record the exact commands and outcomes.
