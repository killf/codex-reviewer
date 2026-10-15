import type { RepositoryInfo, ReviewScope } from "../server/types";
import { Icon } from "./Icon";
export function ScopePicker({ repository, scope, busy, onChange }: {
  repository: RepositoryInfo; scope: ReviewScope; busy: boolean; onChange: (scope: ReviewScope) => void;
}) {
  return <label className="scope-picker" title="比较范围"><Icon name="branch" />
    <select aria-label="Comparison scope" disabled={busy} value={scope.kind === "worktree" ? "worktree" : scope.baseRef}
      onChange={(event) => onChange(event.target.value === "worktree" ? { kind: "worktree" } : { kind: "branch", baseRef: event.target.value })}>
      <option value="worktree">工作区变更</option>
      {repository.refs.map((ref) => <option key={ref.fullName} value={ref.fullName}>与 {ref.name} 比较</option>)}
    </select>
  </label>;
}
