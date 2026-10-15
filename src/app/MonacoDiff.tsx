import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker&inline";
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/rust/register.js";
import "monaco-editor/languages/definitions/go/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/shell/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
import type { FileView } from "../server/types";

self.MonacoEnvironment = {
  getWorker: () => {
    const worker = new EditorWorker();
    worker.addEventListener("message", () => { document.documentElement.dataset.diffWorker = "ready"; }, { once: true });
    worker.addEventListener("error", () => { document.documentElement.dataset.diffWorker = "error"; });
    return worker;
  },
};

function languageFor(filePath: string): string {
  const extension = filePath.split(".").at(-1)?.toLowerCase() ?? "";
  return ({ ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "javascript", py: "python", rs: "rust", go: "go", yaml: "yaml", yml: "yaml", md: "markdown", html: "html", css: "css", sh: "shell", sql: "sql" } as Record<string, string>)[extension] ?? "plaintext";
}

function colorHex(value: string, fallback: string): string {
  const values = value.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3) return fallback;
  return `#${values.slice(0, 3).map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function applyTheme(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const background = colorHex(styles.backgroundColor, "#181818");
  const foreground = colorHex(styles.color, "#e5e5e5");
  const dark = [1, 3, 5].map((index) => Number.parseInt(background.slice(index, index + 2), 16)).reduce((sum, channel) => sum + channel, 0) < 384;
  monaco.editor.defineTheme("codex-review", {
    base: dark ? "vs-dark" : "vs", inherit: true, rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorGutter.background": background,
      "editorLineNumber.foreground": dark ? "#666666" : "#999999",
      "editorLineNumber.activeForeground": dark ? "#aaaaaa" : "#666666",
      "editor.selectionBackground": dark ? "#ffffff1a" : "#00000012",
      "editor.inactiveSelectionBackground": dark ? "#ffffff10" : "#0000000a",
      "editorOverviewRuler.border": "#00000000",
      "scrollbar.shadow": "#00000000",
      "diffEditor.border": dark ? "#ffffff0f" : "#0000000f",
      "diffEditor.insertedLineBackground": dark ? "#122d20" : "#e6ffec",
      "diffEditor.removedLineBackground": dark ? "#351b1e" : "#ffebe9",
      "diffEditor.insertedTextBackground": dark ? "#237b3e66" : "#abf2bd88",
      "diffEditor.removedTextBackground": dark ? "#bc344766" : "#ffb4b988",
      "diffEditor.diagonalFill": dark ? "#ffffff06" : "#00000005",
    },
  });
  monaco.editor.setTheme("codex-review");
}

export function MonacoView({ view }: { view: FileView }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current!;
    delete element.dataset.diffReady;
    delete element.dataset.fileReady;
    applyTheme(element);
    const fileDiff = view.mode === "diff" ? view.fileDiff : null;
    const language = languageFor(view.mode === "file" ? view.path : view.fileDiff.newPath ?? view.fileDiff.oldPath ?? "");
    const original = fileDiff ? monaco.editor.createModel(fileDiff.oldText ?? "", language) : null;
    const modified = monaco.editor.createModel(view.mode === "file" ? view.text ?? "" : view.fileDiff.newText ?? "", language);
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      readOnly: true, domReadOnly: true, automaticLayout: true,
      minimap: { enabled: false },
      glyphMargin: false, folding: false, scrollBeyondLastLine: false, renderLineHighlight: "none",
      fontFamily: getComputedStyle(element).getPropertyValue("--font-mono").trim() || "Consolas, 'SFMono-Regular', monospace",
      fontSize: 12, lineHeight: 21, lineNumbersMinChars: 3, lineDecorationsWidth: 12,
      padding: { top: 12, bottom: 12 }, contextmenu: false, links: false,
      scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9, useShadows: false },
    };
    let editor: monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor;
    let ready: monaco.IDisposable | undefined;
    if (original) {
      const diffEditor = monaco.editor.createDiffEditor(element, {
        ...options, originalEditable: false, renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: false, renderSideBySideInlineBreakpoint: 0,
        renderOverviewRuler: false, renderGutterMenu: false, renderIndicators: false, renderMarginRevertIcon: false,
        diffAlgorithm: "advanced", ignoreTrimWhitespace: false, maxComputationTime: 10_000,
        hideUnchangedRegions: { enabled: false },
      });
      ready = diffEditor.onDidUpdateDiff(() => { element.dataset.diffReady = "true"; });
      diffEditor.setModel({ original, modified });
      editor = diffEditor;
    } else {
      editor = monaco.editor.create(element, { ...options, model: modified });
      element.dataset.fileReady = "true";
    }
    const observer = new MutationObserver(() => applyTheme(element));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const changeTheme = () => applyTheme(element);
    scheme.addEventListener("change", changeTheme);
    return () => {
      observer.disconnect(); scheme.removeEventListener("change", changeTheme);
      ready?.dispose(); editor.dispose(); original?.dispose(); modified.dispose();
    };
  }, [view]);
  return <div className="monaco-diff-host" ref={container} data-file-mode={view.mode} aria-label={view.mode === "file" ? "只读文件" : "只读左右差异"} />;
}
