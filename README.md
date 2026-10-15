# Reviewer

A local Codex plugin for reviewing Git changes in a file tree and side-by-side diff.

## Requirements

- Node.js 22.12 or later
- Git available on `PATH`
- Codex Desktop with local plugin support

## Build and test

```powershell
npm install
npm run build
npm test
npm run test:e2e
```

## Install in Codex Desktop

From this folder, register the local marketplace and install its plugin:

```powershell
codex plugin marketplace add .
codex plugin add code-reviewer@codex-reviewer-local
```

Restart Codex Desktop if the marketplace or plugin entry does not appear. After rebuilding, refresh the local marketplace to install the latest files.

The MCP server is named `git-reviewer`. Keep this name distinct from Codex's built-in `code-review` server. After updating an installed plugin, restart Codex Desktop to reload the MCP configuration in existing panel runtimes.

To verify discovery, launcher calls, and UI resource reads through the desktop backend, set `CODEX_HOST_CLI` to the desktop installation's `codex.exe` and run `npm test`. The host check uses an ephemeral runtime and does not add a saved conversation.

## Use

Open **Reviewer** from a project's conversation to use its embedded content panel. The project folder is injected when opening from chat. Static conversation entrypoints resolve the host's `threadId` using the public `codex app-server` `thread/read` API with `includeTurns: false`. The short-lived lookup backend closes after reading the folder; it does not create a conversation or read turn text. If the host supplies neither a project nor a usable thread context, the panel asks to open from a project conversation rather than selecting the plugin cache or another project's folder.

Choose **工作区 → HEAD** or a local/remote-tracking branch. Branch comparisons show merge-base to current `HEAD`; the plugin does not fetch or change refs.

The file tree includes repository files, including ignored files, and omits `.git` internals. Changed files are highlighted. Changed tracked files open in a side-by-side diff with line and word highlights. Untracked, ignored, and unchanged files open in a single readonly source editor. Binary files and files larger than 1 MiB show an explanatory message. Refresh creates a new immutable review snapshot when repository state changes.

Before the first commit, working-tree review uses an empty baseline and marks staged and untracked files as additions. Untracked files use the readonly source view. Branch comparison becomes available after the first commit. The plugin does not create commits or empty-tree Git objects to support this state.

Readonly source files are loaded on demand and retain their first-open content until refresh. During branch comparison, unchanged versioned files are read from the captured HEAD; files outside that revision are labelled as working-tree content.

The plugin reads Git and working-tree state without editing project files. It does not commit, push, merge, or deploy.

## Interface and performance

The readonly diff uses Microsoft's MIT-licensed `monaco-editor`, with syntax highlighting, line and word highlights, viewport rendering, and an inline editor Web Worker. The surrounding toolbar, colors, typography, and file tree use the Codex MCP App theme variables. Monaco's bundled license and third-party notices remain in the installed dependency.

File icons use the official VS Code Seti outlines and theme associations, vendored from `microsoft/vscode` commit `a11e4a544c9c19643f08fb400d8659ebb84cbc8f`. Inline SVG paths avoid relying on custom font loading in the Codex sandbox. File names and compound extensions take priority over common builtin language associations. Dark and light colors follow the upstream theme. Resources, MIT license, and third-party notices are in `src/app/assets/seti/` and are bundled for offline use. `scripts/generate-seti-icons.py` regenerates the checked-in paths from the original font; Python is not needed to build or run the plugin.

The complete file tree renders only visible rows. Directory enumeration and changed-file capture use bounded concurrency. Freshness checks inspect Git state and dirty-file metadata rather than scanning the full file tree. Changes only to ignored files appear after a manual refresh. Snapshot history is bounded to eight in-memory captures.
