import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkReviewFreshness, createReview, readFile } from "./api";
import { DiffViewer } from "./DiffViewer";
import { FileTree } from "./FileTree";
import { ScopePicker } from "./ScopePicker";
import { Icon } from "./Icon";
import type { FileView, ReviewScope, ReviewSnapshot } from "../server/types";

export function App() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [scope, setScope] = useState<ReviewScope>({ kind: "worktree" });
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileView, setFileView] = useState<FileView | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureId = useRef(0);
  const fileId = useRef(0);
  const { app, error: appError } = useApp({
    appInfo: { name: "Reviewer", version: "0.3.1" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (connection) => {
      connection.ontoolinput = ({ arguments: args }) => {
        if (typeof args?.rootPath === "string") setRootPath(args.rootPath);
      };
      connection.ontoolresult = ({ structuredContent }) => {
        if (typeof structuredContent?.rootPath === "string") setRootPath(structuredContent.rootPath);
        else if (typeof structuredContent?.contextError === "string") setError(structuredContent.contextError);
      };
    },
  });

  // 1. 首次入口接收项目；没有初始结果时，由服务按宿主会话元数据解析一次。
  useEffect(() => {
    if (!app || rootPath) return;
    let cancelled = false;
    void app.callServerTool({ name: "code-review.open", arguments: {} }).then((result) => {
      const context = result.structuredContent;
      if (!cancelled && typeof context?.rootPath === "string") setRootPath((previous) => previous ?? context.rootPath as string);
      else if (!cancelled && typeof context?.contextError === "string") setError(context.contextError);
    }).catch((reason: unknown) => { if (!cancelled) setError((reason as Error).message); });
    return () => { cancelled = true; };
  }, [app, rootPath]);

  const selectFile = useCallback(async (review: ReviewSnapshot, path: string) => {
    if (!app) return;
    const request = ++fileId.current;
    setError(null);
    setSelectedPath(path);
    setFileView(null);
    setLoadingDiff(true);
    try {
      const result = await readFile(app, review.snapshotId, path);
      if (request === fileId.current) setFileView(result);
    } catch (reason) {
      if (request === fileId.current) setError((reason as Error).message);
    } finally {
      if (request === fileId.current) setLoadingDiff(false);
    }
  }, [app]);

  const capture = useCallback(async (folder: string, nextScope: ReviewScope) => {
    if (!app) return;
    const request = ++captureId.current;
    ++fileId.current;
    setBusy(true);
    setError(null);
    try {
      const review = await createReview(app, folder, nextScope);
      if (request !== captureId.current) return;
      setSnapshot(review);
      setScope(nextScope);
      setStale(false);
      const first = review.changedFiles[0];
      if (first) await selectFile(review, first.newPath ?? first.oldPath!);
      else { setFileView(null); setSelectedPath(null); }
    } catch (reason) {
      if (request === captureId.current) setError((reason as Error).message);
    } finally {
      if (request === captureId.current) setBusy(false);
    }
  }, [app, selectFile]);

  useEffect(() => {
    if (!rootPath) return;
    setSnapshot(null);
    void capture(rootPath, { kind: "worktree" });
    return () => { ++captureId.current; ++fileId.current; };
  }, [rootPath, capture]);

  // 2. 单次轮询完成后再安排下一次，后台页面暂停，避免慢仓库请求堆积。
  useEffect(() => {
    if (!app || !snapshot) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        try { const changed = await checkReviewFreshness(app, snapshot.snapshotId); if (!cancelled) setStale(changed); }
        catch (reason) { if (!cancelled) setError((reason as Error).message); }
      }
      if (!cancelled) timer = setTimeout(check, 10_000);
    };
    timer = setTimeout(check, 10_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [app, snapshot]);

  const projectName = rootPath?.replaceAll("\\", "/").split("/").filter(Boolean).at(-1);
  const message = appError?.message ?? error;
  const friendlyError = message?.includes("not a Git worktree") ? "当前项目不是 Git 仓库" : message?.includes("first commit") ? "完成首次提交后才能比较分支" : message;
  return <main className="review-app" data-review-app="true">
    <header className="review-toolbar">
      <div className="project-name" title={rootPath ?? ""}><Icon name="folder" /><span>{projectName ?? "Reviewer"}</span></div>
      {snapshot && <><span className="current-branch" title={snapshot.headRevision ?? "首次提交前"}>{snapshot.currentBranch ?? snapshot.headRevision?.slice(0, 8) ?? "首次提交前"}</span>
        <div className="toolbar-controls"><ScopePicker repository={snapshot} scope={scope} busy={busy} onChange={(next) => { if (rootPath) void capture(rootPath, next); }} />
        <button type="button" className={`icon-button${busy ? " is-busy" : ""}`} disabled={busy} aria-label="刷新变更" title="刷新变更" onClick={() => { if (rootPath) void capture(rootPath, scope); }}><Icon name="refresh" /></button></div></>}
    </header>
    {stale && <div className="stale-banner" role="status"><span>有新的变更</span><button onClick={() => { if (rootPath) void capture(rootPath, scope); }} disabled={busy}>刷新</button></div>}
    {friendlyError && <div className={snapshot ? "error-banner" : "project-empty"} role="alert"><Icon name="diff" size={28} /><strong>{friendlyError}</strong>{!snapshot && <span>{rootPath}</span>}</div>}
    {!snapshot && !friendlyError && <div className="project-empty"><span className="loading-indicator" /><span>{busy ? "正在读取 Git 变更…" : "正在读取当前项目…"}</span></div>}
    {snapshot && <div className="review-layout">
      <aside className="tree-pane"><div className="pane-heading"><span>文件</span><span>{snapshot.changedFiles.length} 个变更</span></div>
        <FileTree entries={snapshot.tree} changedFiles={snapshot.changedFiles} selectedPath={selectedPath} onSelect={(path) => { void selectFile(snapshot, path); }} /></aside>
      <section className="diff-pane"><DiffViewer view={fileView} selectedPath={selectedPath} loading={loadingDiff} /></section>
    </div>}
  </main>;
}
