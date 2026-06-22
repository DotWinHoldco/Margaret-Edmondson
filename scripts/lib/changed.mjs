// Authored by DotWin
// Diff scope for incremental verification. Steady-state builds verify only what changed since
// the last green baseline — so checks are fast and low-token, not a full re-scan every run.

import { execFileSync } from 'node:child_process';

/**
 * Repo-relative POSIX paths changed since `sinceRef` (committed + staged + unstaged + untracked).
 * Returns null when there is no ref or git is unavailable, meaning "scan everything".
 */
export function changedFiles(root, sinceRef) {
  if (!sinceRef) return null;
  try {
    const diff = execFileSync('git', ['-C', root, 'diff', '--name-only', sinceRef, '--', '.'], { encoding: 'utf8' });
    const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
    const set = new Set();
    for (const line of `${diff}\n${untracked}`.split('\n')) {
      const t = line.trim();
      if (t) set.add(t);
    }
    return set;
  } catch {
    return null;
  }
}

export function headCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
