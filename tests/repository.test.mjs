import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { listRepositories } from "../src/server/repository.ts";
import { createFixtureRepository } from "./fixtures/git-repo.mjs";

test("resolves a selected nested folder to its Git worktree and exposes local and remote refs", async (t) => {
  const fixture = await createFixtureRepository();
  t.after(fixture.cleanup);
  await mkdir(path.join(fixture.rootPath, "src", "nested"), { recursive: true });
  fixture.git("branch", "topic");
  fixture.git("update-ref", "refs/remotes/origin/topic", fixture.baseRevision);

  const repository = await listRepositories(path.join(fixture.rootPath, "src", "nested"));

  assert.equal(repository.rootPath, fixture.rootPath);
  assert.ok(repository.refs.some((ref) => ref.fullName === "refs/heads/topic"));
  assert.ok(repository.refs.some((ref) => ref.fullName === "refs/remotes/origin/topic"));
});

test("rejects a path outside any Git worktree with a clear error", async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), "codex-review-non-git-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await assert.rejects(
    listRepositories(folder),
    /not a Git worktree/i,
  );
});
