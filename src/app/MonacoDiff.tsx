import { useEffect, useRef, useState } from "react";
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
import { Icon } from "./Icon";

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
      "diffEditorOverview.insertedForeground": dark ? "#7acb97" : "#188348",
      "diffEditorOverview.removedForeground": dark ? "#ef9098" : "#c63d4d",
      "diffEditor.diagonalFill": dark ? "#ffffff06" : "#00000005",
    },
  });
  monaco.editor.setTheme("codex-review");
}

export function MonacoView({ view }: { view: FileView }) {
  const container = useRef<HTMLDivElement>(null);
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [navigation, setNavigation] = useState({ current: 0, total: 0 });
  useEffect(() => {
    const element = container.current!;
    delete element.dataset.diffReady;
    delete element.dataset.fileReady;
    setNavigation({ current: 0, total: 0 });
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
    const listeners: monaco.IDisposable[] = [];
    if (original) {
      const diffEditor = monaco.editor.createDiffEditor(element, {
        ...options, originalEditable: false, renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: false, renderSideBySideInlineBreakpoint: 0,
        renderOverviewRuler: true, renderGutterMenu: false, renderIndicators: false, renderMarginRevertIcon: false,
        diffAlgorithm: "advanced", ignoreTrimWhitespace: false, maxComputationTime: 10_000,
        hideUnchangedRegions: { enabled: false },
      });
      diff.current = diffEditor;
      let changes: monaco.editor.ILineChange[] = [];
      let revealedFirstChange = false;
      // 1. 计数跟随修改侧光标；纯删除的空范围锚定下一行，并限制在文件内。
      const updateNavigation = () => {
        const line = diffEditor.getModifiedEditor().getPosition()?.lineNumber ?? 1;
        let current = 0;
        for (const [index, change] of changes.entries()) {
          const start = Math.min(modified.getLineCount(), Math.max(1, change.modifiedStartLineNumber + Number(change.modifiedEndLineNumber === 0)));
          if (line < start) break;
          current = index + 1;
        }
        setNavigation((previous) => previous.current === current && previous.total === changes.length ? previous : { current, total: changes.length });
      };
      // 2. 差异计算完成后定位第一处；后续跳转和概览标记均复用 Monaco。
      listeners.push(diffEditor.onDidUpdateDiff(() => {
        changes = diffEditor.getLineChanges() ?? [];
        element.dataset.diffReady = "true";
        if (changes.length && !revealedFirstChange) {
          revealedFirstChange = true;
          diffEditor.revealFirstDiff();
        }
        updateNavigation();
      }));
      listeners.push(diffEditor.getModifiedEditor().onDidChangeCursorPosition(updateNavigation));
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
      diff.current = null;
      listeners.forEach((listener) => listener.dispose());
      editor.dispose(); original?.dispose(); modified.dispose();
    };
  }, [view]);
  return <>
    {view.mode === "diff" && <nav className="diff-navigation" aria-label="文件内变更导航">
      <span className="diff-navigation-count" role="status" aria-live="polite" aria-label={`第 ${navigation.current} 处，共 ${navigation.total} 处变更`}>{navigation.current} / {navigation.total}</span>
      <button type="button" className="icon-button previous-change" aria-label="上一个变更" title="上一个变更" disabled={!navigation.total} onClick={() => diff.current?.goToDiff("previous")}><Icon name="chevron" /></button>
      <button type="button" className="icon-button next-change" aria-label="下一个变更" title="下一个变更" disabled={!navigation.total} onClick={() => diff.current?.goToDiff("next")}><Icon name="chevron" /></button>
    </nav>}
    <div className="monaco-diff-host" ref={container} data-file-mode={view.mode} aria-label={view.mode === "file" ? "只读文件" : "只读左右差异"} />
  </>;
}
