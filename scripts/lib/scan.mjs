// Authored by DotWin
// Shared filesystem scanning + grep helpers for the DotWin build-check gates.
// Pure Node (built-ins only) so it runs in any spawned project with zero install.

import fs from 'node:fs';
import path from 'node:path';

export const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.turbo', '.vercel', 'out', '.cache', 'playwright-report', 'test-results',
]);

/**
 * Recursively list files under root.
 * @param {string} root
 * @param {{exts?: string[], underDirs?: string[]}} opts
 *   exts: only return files ending with one of these (e.g. ['.ts', '.tsx'])
 *   underDirs: only descend into these top-level subdirs (relative to root)
 */
export function walk(root, { exts = null, underDirs = null } = {}) {
  const out = [];
  const roots = underDirs
    ? underDirs.map((d) => path.join(root, d)).filter((d) => safeIsDir(d))
    : [root];
  for (const start of roots) rec(start);
  return out;

  function rec(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        rec(path.join(dir, e.name));
      } else if (e.isFile()) {
        if (exts && !exts.some((x) => e.name.endsWith(x))) continue;
        out.push(path.join(dir, e.name));
      }
    }
  }
}

export function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function safeExists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Return every line matching regex as {line, text}. Skips lines that contain
 * a `dotwin-allow:<rule>` pragma so teams can document an approved exception.
 */
export function grepLines(content, regex, allowRule = null) {
  const res = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (allowRule && line.includes(`dotwin-allow:${allowRule}`)) continue;
    const re = new RegExp(regex.source, regex.flags.replace('g', ''));
    if (re.test(line)) res.push({ line: i + 1, text: line.trim().slice(0, 200) });
  }
  return res;
}

export function rel(root, file) {
  return path.relative(root, file) || file;
}

// Keep only files whose repo-relative path is in `scope` (a Set of POSIX paths). When scope is
// null/undefined, returns files unchanged — incremental mode narrows; full mode scans all.
export function scopeFilter(files, root, scope) {
  if (!scope) return files;
  return files.filter((f) => scope.has(rel(root, f).split(path.sep).join('/')));
}
