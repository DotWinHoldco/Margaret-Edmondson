// Authored by DotWin
// `server-only` is a Next build-time marker with no runtime module here. Unit
// tests that render a server component import it transitively, so vitest aliases
// the specifier to this empty module. It exists only under test.
export {}
