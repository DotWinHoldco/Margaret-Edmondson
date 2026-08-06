// Authored by DotWin
//
// Next gives a server layout no way to read the URL it is rendering, so the
// proxy stamps the incoming path onto the upstream request headers and server
// components read it back from here. Constants only: this module is imported by
// `src/proxy.ts`, which runs in the edge runtime and must not pull in
// `next/headers`.

/**
 * Upstream-only request header carrying `pathname + search` of the current
 * navigation. The proxy overwrites it on every request it handles, so a value
 * a client tried to inject never survives; consumers still sanitise it with
 * `safeAdminReturnPath` before using it in a redirect.
 */
export const REQUEST_PATH_HEADER = 'x-artbyme-path'
