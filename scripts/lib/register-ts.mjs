// Authored by DotWin
//
// Module resolution for the plain-node harness, in one file and with no dependency.
//
// Node runs TypeScript directly (it strips the types), but its ESM resolver is the
// web's: a specifier means a file, exactly, and `./keys` is not `./keys.ts`. Our source
// is written the way the bundler reads it — extensionless relative specifiers and the
// `@/` alias — so a verification script that imports `catalog/rules` or `seed-rules`
// would fail at the first hop. The two ways out were to write `.ts` on every import
// (which tsc rejects without `allowImportingTsExtensions`, so every line needed a
// suppression) or to teach node the project's own resolution. This is the second.
//
// Registered as a module customization hook (Node >= 20.6), so it affects only the
// process that asks for it:
//
//   node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --help
//
// It is deliberately narrow. It only answers a specifier that node could not have
// meant literally — relative or `@/`-aliased, with no file extension — and only when a
// matching `.ts`/`.tsx` file is actually on disk. Everything else, including every bare
// package name and every specifier that already names a file, is handed straight back
// to the default resolver. It rewrites no code and loads nothing itself: the type
// stripping is still node's.
//
// The file registers ITSELF as the hooks module, which is why the registration is
// guarded by `isMainThread`: customization hooks run on their own thread, where this
// module is imported again and must not register a second time.

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { isMainThread } from 'node:worker_threads'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = path.join(REPO_ROOT, 'src')

/** Specifiers that already name a file are left alone. */
const HAS_EXTENSION = /\.(?:[cm]?[jt]sx?|json|node|wasm)$/i

/** In the order tsc would try them. */
function candidatesFor(basePath) {
  return [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ]
}

function fileOnDisk(candidate) {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

function firstOnDisk(basePath) {
  for (const candidate of candidatesFor(basePath)) {
    if (fileOnDisk(candidate)) return candidate
  }
  return null
}

/**
 * Resolve hook: map `@/x` onto `<repo>/src/x` and give an extensionless relative
 * specifier the extension the source omitted. Anything this hook cannot place with
 * certainty falls through to the default resolver unchanged.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(SRC_DIR, specifier.slice(2))
    const hit = HAS_EXTENSION.test(specifier) ? (fileOnDisk(base) ? base : null) : firstOnDisk(base)
    if (hit) return nextResolve(pathToFileURL(hit).href, context)
  } else if (
    !HAS_EXTENSION.test(specifier) &&
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    typeof context.parentURL === 'string' &&
    context.parentURL.startsWith('file:')
  ) {
    const hit = firstOnDisk(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
    if (hit) return nextResolve(pathToFileURL(hit).href, context)
  }
  return nextResolve(specifier, context)
}

if (isMainThread) register(import.meta.url, import.meta.url)
