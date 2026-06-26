// Authored by DotWin
// Shared helpers for the domain-cell gates: locate the cells dir, parse manifests, map a
// table to its owning domain, classify tables, and find supabase .from(...) calls.
// Pure Node (built-ins + sibling scan.mjs) so it runs zero-install in any spawned project.

import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './scan.mjs';

const WRITE_VERBS = new Set(['insert', 'update', 'upsert', 'delete']);

// Prefer src/domains (canonical); fall back to src/modules (legacy) so adopted apps not yet
// renamed are still checked rather than silently skipped.
export function cellsDir(root) {
  const domains = path.join(root, 'src', 'domains');
  if (safeIsDir(domains)) return { dir: domains, seg: 'domains' };
  const modules = path.join(root, 'src', 'modules');
  if (safeIsDir(modules)) return { dir: modules, seg: 'modules' };
  return null;
}

function strField(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
  return m ? m[1] : null;
}
function arrField(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [];
}

// { seg, dir, domains: { key: { prefix, recoverable:Set, tables:[] } } } parsed from manifests.
export function loadDomains(root) {
  const cells = cellsDir(root);
  if (!cells) return { seg: null, dir: null, domains: {} };
  const domains = {};
  for (const e of fs.readdirSync(cells.dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mPath = path.join(cells.dir, e.name, 'manifest.ts');
    if (!fs.existsSync(mPath)) { domains[e.name] = { prefix: null, recoverable: new Set(), tables: [] }; continue; }
    const t = readText(mPath);
    domains[e.name] = {
      prefix: strField(t, 'tablePrefix'),
      recoverable: new Set(arrField(t, 'recoverableTables')),
      tables: arrField(t, 'tables'),
    };
  }
  return { seg: cells.seg, dir: cells.dir, domains };
}

// Longest-prefix owner of a table; an explicit `tables` entry wins over a prefix match.
export function ownerOf(table, domains) {
  let best = null, bestLen = -1;
  for (const [key, d] of Object.entries(domains)) {
    if (d.tables && d.tables.includes(table)) return key;
    if (d.prefix && table.startsWith(d.prefix) && d.prefix.length > bestLen) { best = key; bestLen = d.prefix.length; }
  }
  return best;
}

// A table is recoverable (side-effect) only if its owner labels it so. Default = core (invariant).
export function isRecoverable(table, domains) {
  for (const d of Object.values(domains)) if (d.recoverable && d.recoverable.has(table)) return true;
  return false;
}

// Blank /* */ block comments while preserving newlines, so line numbers stay accurate and
// commented-out code is never matched as a real call.
export function blankBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}
// Blank both block and line comments (newline-preserving). Use when allow-pragmas do not apply.
export function blankComments(s) {
  return blankBlockComments(s).replace(/\/\/[^\n]*/g, '');
}

// Every supabase .from('table').<method> call: the FIRST method decides read vs write.
// Returns [{ table, method, isWrite, line, lineText }]. Code inside block comments is ignored,
// line-commented code is skipped, and a trailing dotwin-allow pragma exempts the line.
export function fromCalls(content, allowRule = null) {
  const src = blankBlockComments(content);
  const out = [];
  const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)\s*\.\s*([a-zA-Z]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const upto = src.slice(0, m.index);
    const lineStart = upto.lastIndexOf('\n') + 1;
    const linePrefix = src.slice(lineStart, m.index);
    if (linePrefix.includes('//')) continue; // commented-out code
    const line = upto.split('\n').length;
    const lineEndIdx = src.indexOf('\n', m.index);
    const lineText = src.slice(lineStart, lineEndIdx < 0 ? src.length : lineEndIdx);
    if (allowRule && lineText.includes(`dotwin-allow:${allowRule}`)) continue;
    const method = m[2].toLowerCase();
    out.push({ table: m[1], method, isWrite: WRITE_VERBS.has(method), line, lineText });
  }
  return out;
}

// Split source into top-level function / arrow bodies: [{ name, startLine, body }]. Lets a gate
// scope to one function instead of a whole file. Block comments are blanked and brace matching
// skips braces inside string/template literals. Good enough for server/action code; not a parser.
export function splitFunctions(content) {
  const src = blankBlockComments(content);
  const out = [];
  const headRe = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{|(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^={]+)?=>\s*\{/g;
  let m;
  while ((m = headRe.exec(src))) {
    const braceIdx = m.index + m[0].length - 1; // m[0] ends at the opening brace
    let depth = 0, end = -1, inStr = null;
    for (let i = braceIdx; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (c === inStr && src[i - 1] !== '\\') inStr = null; continue; }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) end = src.length;
    out.push({ name: m[1] || m[2] || '(anon)', startLine: src.slice(0, m.index).split('\n').length, body: src.slice(braceIdx, end + 1) });
    headRe.lastIndex = braceIdx + 1;
  }
  return out;
}

export function hasRpcCall(content) {
  return /\.rpc\(\s*['"]/.test(content);
}

export { walk, readText, rel, safeIsDir };
