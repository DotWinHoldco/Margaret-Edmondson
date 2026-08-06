// Authored by DotWin
//
// The header name the anti-bot intent token travels in, shared by the server
// guard (src/lib/api/anti-bot.ts) and the browser helper
// (src/lib/api/anti-bot-client.ts). It lives in its own module so the client
// bundle never has to import the server module (node:crypto).

/** Request header carrying the anti-bot intent token. */
export const ANTI_BOT_HEADER = 'x-abm-token'
