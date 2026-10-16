# Reviewer

A local Codex plugin for reviewing Git changes in a file tree and side-by-side diff.

## Requirements

- Node.js 22.12 or later
- Git available on `PATH`
- Codex Desktop with local plugin support

## Install in Codex Desktop

Add the GitHub marketplace and install Reviewer:

```powershell
codex plugin marketplace add https://github.com/killf/codex-reviewer.git
codex plugin add codex-reviewer@codex-reviewer-local
```

The marketplace is displayed as **Reviewer**. The `codex-reviewer-local` identifier is retained for compatibility with existing installations. The repository includes the built app, bundled server, and third-party notices. Users need Node.js and Git, but do not need to clone the source, install npm dependencies, or build the plugin.

Open Reviewer from a project's conversation. Its complete interface appears only in the right content panel; chat keeps a short opening record.

To update:

```powershell
codex plugin marketplace upgrade codex-reviewer-local
codex plugin add codex-reviewer@codex-reviewer-local
```

If the entry does not appear or an existing panel still shows the previous version, reopen the panel; restart Codex Desktop if needed.

The MCP server is named `git-reviewer`. Keep this name distinct from Codex's built-in `code-review` server. After updating an installed plugin, restart Codex Desktop to reload the MCP configuration in existing panel runtimes.

## Development

```powershell
npm ci
npm run build
node --import tsx --test tests/*.test.mjs
npm run test:e2e
```

Build regenerates `dist/app/index.html`, `dist/server/index.js`, and `dist/THIRD_PARTY_NOTICES.txt`. Commit these three files with each release. The server bundle uses only Node.js builtins at runtime. Local authoring can register the current folder with `codex plugin marketplace add .`.

To verify discovery, launcher calls, and UI resource reads through the desktop backend, set `CODEX_HOST_CLI` to the desktop installation's `codex.exe` and run `npm run test:e2e`. The host check uses an ephemeral runtime and does not add a saved conversation. To also verify the published GitHub marketplace in a temporary, isolated `CODEX_HOME`, set `CODEX_MARKETPLACE_REPOSITORY=https://github.com/killf/codex-reviewer.git`. This test downloads and installs the remote version and checks that it matches the current source version; run it after pushing the release. Temporary files are removed when the test finishes.

## Use

Open **Reviewer** from a project's conversation to use its embedded content panel. The project folder is injected when opening from chat. Static conversation entrypoints resolve the host's `threadId` using the public `codex app-server` `thread/read` API with `includeTurns: false`. The short-lived lookup backend closes after reading the folder; it does not create a conversation or read turn text. If the host supplies neither a project nor a usable thread context, the panel asks to open from a project conversation rather than selecting the plugin cache or another project's folder.

Choose **工作区 → HEAD** or a local/remote-tracking branch. Branch comparisons show merge-base to current `HEAD`; the plugin does not fetch or change refs.

The file tree includes repository files, including ignored files, and omits `.git` internals. Changed files are highlighted. Changed tracked files open in a side-by-side diff with line and word highlights. Untracked, ignored, and unchanged files open in a single readonly source editor. Binary files and files larger than 1 MiB show an explanatory message. Refresh creates a new immutable review snapshot when repository state changes.

Before the first commit, working-tree review uses an empty baseline and marks staged and untracked files as additions. Untracked files use the readonly source view. Branch comparison becomes available after the first commit. The plugin does not create commits or empty-tree Git objects to support this state.

Readonly source files are loaded on demand and retain their first-open content until refresh. During branch comparison, unchanged versioned files are read from the captured HEAD; files outside that revision are labelled as working-tree content.

The plugin reads Git and working-tree state without editing project files. It does not commit, push, merge, or deploy.

## Interface and performance

The readonly diff uses Microsoft's MIT-licensed `monaco-editor`, with syntax highlighting, line and word highlights, viewport rendering, and an inline editor Web Worker. The surrounding toolbar, colors, typography, and file tree use the Codex MCP App theme variables. Licenses and notices for the bundled runtime dependencies, Monaco, and Seti are included in `dist/THIRD_PARTY_NOTICES.txt`.

File icons use the official VS Code Seti outlines and theme associations, vendored from `microsoft/vscode` commit `a11e4a544c9c19643f08fb400d8659ebb84cbc8f`. Inline SVG paths avoid relying on custom font loading in the Codex sandbox. File names and compound extensions take priority over common builtin language associations. Dark and light colors follow the upstream theme. Resources, MIT license, and third-party notices are in `src/app/assets/seti/` and are bundled for offline use. `scripts/generate-seti-icons.py` regenerates the checked-in paths from the original font; Python is not needed to build or run the plugin.

The complete file tree renders only visible rows. Directory enumeration and changed-file capture use bounded concurrency. Freshness checks inspect Git state and dirty-file metadata rather than scanning the full file tree. Changes only to ignored files appear after a manual refresh. Snapshot history is bounded to eight in-memory captures.
